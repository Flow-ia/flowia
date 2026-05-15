// Defauts metier seedes a la creation d'un compte commercant.
//
// Objectif : un commercant fraichement inscrit (POST /register ou Google OAuth)
// arrive sur une caisse / agenda DEJA pre-configures (horaires, services
// suggeres) au lieu d'une page vide. Le wizard FirstRunSetup cote frontend
// permet ensuite d'ajuster en 4 etapes courtes, puis flag users.setup_completed
// = TRUE pour ne plus l'afficher.
//
// Idempotent : tous les INSERT utilisent ON CONFLICT DO NOTHING, donc re-jouer
// le seed sur un compte deja seede ne casse rien et ne duplique pas.

// Horaires par defaut : Lun-Ven 09h-19h, Sam 09h-17h, Dim ferme.
// day_of_week : 0 = dimanche (Postgres EXTRACT(DOW) standard), 1-5 = lun-ven,
// 6 = samedi. Cohérent avec le reste du code (cf. business_hours table).
const DEFAULT_HOURS = [
  { day: 0, open: '09:00', close: '18:00', is_open: false },  // dimanche
  { day: 1, open: '09:00', close: '19:00', is_open: true  },  // lundi
  { day: 2, open: '09:00', close: '19:00', is_open: true  },  // mardi
  { day: 3, open: '09:00', close: '19:00', is_open: true  },  // mercredi
  { day: 4, open: '09:00', close: '19:00', is_open: true  },  // jeudi
  { day: 5, open: '09:00', close: '19:00', is_open: true  },  // vendredi
  { day: 6, open: '09:00', close: '17:00', is_open: true  },  // samedi
];

// Services suggeres par type de commerce. Crees avec is_active=FALSE pour
// ne pas exposer publiquement sur le booking tant que le commercant n'a pas
// valide ses prix/durees dans le wizard. Prix moyens marche FR 2026 (ordre
// de grandeur pour donner un point de depart, pas une recommandation
// commerciale).
const DEFAULT_SERVICES_BY_TYPE = {
  barbier: [
    { name: 'Coupe homme',       duration: 30, price: 22, color: '#3b82f6' },
    { name: 'Barbe',             duration: 20, price: 15, color: '#10b981' },
    { name: 'Coupe + Barbe',     duration: 45, price: 32, color: '#6366f1' },
  ],
  coiffeur_femme: [
    { name: 'Coupe femme',       duration: 45, price: 35, color: '#ec4899' },
    { name: 'Brushing',          duration: 30, price: 25, color: '#f59e0b' },
    { name: 'Coloration',        duration: 90, price: 60, color: '#8b5cf6' },
  ],
  salon_mixte: [
    { name: 'Coupe homme',       duration: 30, price: 22, color: '#3b82f6' },
    { name: 'Coupe femme',       duration: 45, price: 35, color: '#ec4899' },
    { name: 'Brushing',          duration: 30, price: 25, color: '#f59e0b' },
    { name: 'Coloration',        duration: 90, price: 60, color: '#8b5cf6' },
  ],
  onglerie: [
    { name: 'Manucure simple',          duration: 30, price: 25, color: '#ec4899' },
    { name: 'Vernis semi-permanent',    duration: 45, price: 30, color: '#f59e0b' },
    { name: 'Pose de gel',              duration: 60, price: 45, color: '#8b5cf6' },
  ],
  institut_beaute: [
    { name: 'Epilation sourcils',  duration: 15, price: 15, color: '#10b981' },
    { name: 'Soin visage',         duration: 60, price: 60, color: '#ec4899' },
    { name: 'Maquillage',          duration: 45, price: 50, color: '#8b5cf6' },
  ],
  spa: [
    { name: 'Massage relaxant 30min', duration: 30, price: 50, color: '#3b82f6' },
    { name: 'Massage relaxant 60min', duration: 60, price: 90, color: '#6366f1' },
    { name: 'Soin du corps',          duration: 60, price: 75, color: '#10b981' },
  ],
};

// Fallback generique si business_type inconnu/null (devrait pas arriver
// post-onboarding mais on protege).
const DEFAULT_SERVICES_FALLBACK = [
  { name: 'Prestation 1', duration: 30, price: 25, color: '#7c6af7' },
  { name: 'Prestation 2', duration: 60, price: 50, color: '#3b82f6' },
];

// Insere les 7 lignes business_hours (1 par jour). Idempotent via la
// contrainte UNIQUE(user_id, day_of_week) deja presente.
async function seedBusinessHours(pool, userId) {
  for (const h of DEFAULT_HOURS) {
    await pool.query(
      `INSERT INTO business_hours (user_id, day_of_week, open_time, close_time, is_open)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, day_of_week) DO NOTHING`,
      [userId, h.day, h.open, h.close, h.is_open]
    );
  }
}

// Insere 3-5 services suggeres selon business_type. is_active=FALSE pour
// ne pas exposer dans le booking public tant que le commercant n'a pas
// valide. Pas de contrainte UNIQUE sur (user_id, name) — on guarde donc
// contre les re-runs en verifiant prealablement qu'aucun service n'existe.
async function seedDefaultServices(pool, userId, businessType) {
  const { rows: existing } = await pool.query(
    `SELECT 1 FROM booking_services WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  if (existing.length) return 0; // deja seede ou commercant a ajoute manuellement

  const services = DEFAULT_SERVICES_BY_TYPE[businessType] || DEFAULT_SERVICES_FALLBACK;
  let inserted = 0;
  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    await pool.query(
      `INSERT INTO booking_services
        (user_id, name, duration_minutes, price, color, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6)`,
      [userId, s.name, s.duration, s.price, s.color, i]
    );
    inserted++;
  }
  return inserted;
}

// Orchestrateur : horaires + services. A appeler apres creation user + maj
// business_type (ie. fin /register, fin /onboarding pour Google OAuth).
// Best-effort : log + continue si l'un des seeds echoue (pas critique au
// point de bloquer la creation du compte).
async function seedMerchantDefaults(pool, userId, businessType) {
  try {
    await seedBusinessHours(pool, userId);
  } catch (e) {
    console.error('[SEED business_hours]', userId, e.message);
  }
  try {
    await seedDefaultServices(pool, userId, businessType);
  } catch (e) {
    console.error('[SEED booking_services]', userId, e.message);
  }
}

module.exports = {
  seedMerchantDefaults,
  seedBusinessHours,
  seedDefaultServices,
  DEFAULT_SERVICES_BY_TYPE,
  DEFAULT_HOURS,
};
