// src/routes/booking/settings.js — Paramètres réservation + horaires d'ouverture
const { pool } = require('../../db');

module.exports = function attachSettingsRoutes(router) {
  // ══════════════════════════════════════════════════════════
  // PARAMÈTRES RÉSERVATION
  // ══════════════════════════════════════════════════════════

  // GET /api/booking/settings
  router.get('/settings', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM booking_settings WHERE user_id=$1', [req.user.userId]
      );
      // Joint payout_hold_days depuis users (param Stripe Connect lie au
      // compte merchant, pas au booking_settings).
      const { rows: usrRows } = await pool.query(
        'SELECT payout_hold_days FROM users WHERE id=$1', [req.user.userId]
      );
      if (!rows.length) {
        return res.json({ settings: { payout_hold_days: usrRows[0]?.payout_hold_days ?? 3 } });
      }
      res.json({ settings: { ...rows[0],
                             payout_hold_days: usrRows[0]?.payout_hold_days ?? 3 } });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // POST /api/booking/settings
  // Merge partiel : un body qui ne contient qu'un sous-ensemble de champs
  // conserve les valeurs existantes pour les champs absents. Indispensable
  // car plusieurs UI (politique d'annulation, agenda, etc.) envoient un
  // body restreint -- un UPSERT brutal ecrasait is_enabled / slug et
  // desactivait silencieusement la page de reservation du marchand.
  router.post('/settings', async (req, res) => {
    try {
      const has = (k) => Object.prototype.hasOwnProperty.call(req.body, k);
      const { is_enabled, slug, business_description, address, phone, timezone,
              advance_booking_days, min_notice_hours, cancellation_policy_hours,
              require_account, google_business_url } = req.body;
      // payout_hold_days est INTENTIONNELLEMENT non editable par le merchant
      // (politique Planity-like : delai escrow fixe a 3 jours pour tous les
      // commercants, decide par FlowIA pour eviter les decouverts si un
      // commercant choisit 0). La valeur en DB est conservee a son default
      // (3) ou peut etre modifiee par un admin via une migration ad-hoc.

      // Admin commit 10 — slug verrouille par admin : refuser toute tentative
      // de modification cote merchant. Defense en profondeur sur 3 couches :
      //   1. Pre-check JS ici : 403 explicite si tentative de changement
      //   2. Force slug = current avant UPSERT (au cas ou le check passe)
      //   3. CASE WHEN dans le UPSERT SQL (verrou final cote DB — empeche
      //      meme une bypass JS de modifier la colonne)
      const { rows: current } = await pool.query(
        'SELECT * FROM booking_settings WHERE user_id=$1',
        [req.user.userId]
      );
      const cur = current[0] || {};
      const isLocked = cur.slug_locked === true;
      const currentSlug = cur.slug ?? null;
      // Comparaison normalisee (trim + lowercase) pour absorber un envoi
      // avec casse differente. Un slug envoye undefined/null ne compte pas
      // comme "tentative de change" si l'utilisateur PATCHait une autre
      // section sans inclure le champ slug.
      const sentSlug = (slug == null) ? null : String(slug).trim().toLowerCase();
      const curSlugN = currentSlug ? String(currentSlug).trim().toLowerCase() : null;
      if (isLocked && has('slug') && sentSlug != null && sentSlug !== curSlugN) {
        return res.status(403).json({
          error: "Votre URL de reservation a ete imposee par notre equipe et ne peut pas etre modifiee. Merci de contacter le support pour toute demande.",
          code: 'SLUG_LOCKED',
        });
      }
      // Merge field-par-field : si la cle est absente du body, on reprend
      // la valeur existante en DB ; si la row n'existe pas (premier POST),
      // on utilise le default produit.
      const pick = (key, defaultVal) =>
        has(key) ? req.body[key] : (cur[key] !== undefined ? cur[key] : defaultVal);

      // Couche 2 : force la valeur a celle en DB si verrouille (si jamais
      // le check ci-dessus etait contourne par un cas inattendu).
      const slugMerged = has('slug') ? (slug || null) : currentSlug;
      const slugToWrite = isLocked ? currentSlug : slugMerged;

      // Vérifier unicité du slug (uniquement si on tente d'en ecrire un nouveau)
      if (slugToWrite && has('slug') && slugToWrite !== currentSlug) {
        const { rows: existing } = await pool.query(
          'SELECT id FROM booking_settings WHERE slug=$1 AND user_id!=$2', [slugToWrite, req.user.userId]
        );
        if (existing.length) return res.status(409).json({ error: 'Ce slug est déjà utilisé.' });
      }
      // Valeurs autorisées pour la politique d'annulation
      const ALLOWED = [0, 1, 2, 6, 24, 48];
      const rawCanPol = pick('cancellation_policy_hours', 2);
      const canPol = ALLOWED.includes(parseInt(rawCanPol)) ? parseInt(rawCanPol) : 2;

      const effIsEnabled    = has('is_enabled') ? !!is_enabled : (cur.is_enabled ?? false);
      const effBusinessDesc = pick('business_description', null);
      const effAddress      = pick('address', null);
      const effPhone        = pick('phone', null);
      const effTimezone     = pick('timezone', 'Europe/Paris') || 'Europe/Paris';
      const effAdvanceDays  = pick('advance_booking_days', 30);
      const effMinNotice    = pick('min_notice_hours', 1);
      const effRequireAcc   = has('require_account') ? !!require_account : (cur.require_account ?? false);
      const effGoogleUrl    = pick('google_business_url', null);

      // Couche 3 : meme si tout le reste echoue, le CASE WHEN dans le UPDATE
      // empeche d'ecraser slug si slug_locked=TRUE en DB. Filet de securite
      // ultime au niveau Postgres.
      const { rows } = await pool.query(
        `INSERT INTO booking_settings (user_id, is_enabled, slug, business_description, address, phone, timezone, advance_booking_days, min_notice_hours, cancellation_policy_hours, require_account, google_business_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (user_id) DO UPDATE SET
           is_enabled=$2,
           slug = CASE WHEN booking_settings.slug_locked = TRUE THEN booking_settings.slug ELSE $3 END,
           business_description=$4, address=$5, phone=$6,
           timezone=$7, advance_booking_days=$8, min_notice_hours=$9,
           cancellation_policy_hours=$10, require_account=$11,
           google_business_url=$12, updated_at=NOW()
         RETURNING *`,
        [req.user.userId, effIsEnabled, slugToWrite, effBusinessDesc,
         effAddress, effPhone, effTimezone,
         effAdvanceDays, effMinNotice, canPol,
         effRequireAcc, effGoogleUrl]
      );
      res.json({ settings: rows[0] });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // ══════════════════════════════════════════════════════════
  // HORAIRES D'OUVERTURE
  // ══════════════════════════════════════════════════════════

  router.get('/hours', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM business_hours WHERE user_id=$1 ORDER BY day_of_week', [req.user.userId]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  router.post('/hours', async (req, res) => {
    try {
      const { hours } = req.body; // [{ day_of_week, open_time, close_time, is_open }]
      if (!Array.isArray(hours)) return res.status(400).json({ error: 'Format invalide.' });
      for (const h of hours) {
        await pool.query(
          `INSERT INTO business_hours (user_id, day_of_week, open_time, close_time, is_open)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (user_id, day_of_week) DO UPDATE SET open_time=$3, close_time=$4, is_open=$5`,
          [req.user.userId, h.day_of_week, h.open_time || '09:00', h.close_time || '18:00', h.is_open !== false]
        );
      }
      const { rows } = await pool.query('SELECT * FROM business_hours WHERE user_id=$1 ORDER BY day_of_week', [req.user.userId]);
      res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
