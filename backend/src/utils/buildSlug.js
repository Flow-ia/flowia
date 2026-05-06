// buildSlug.js — Helpers de construction de slug commercant.
//
// Format cible : `nom-ville-codepostal` (ex : `hair-coiff-lille-59000`).
// La partie nom peut etre editee independamment (PATCH /api/booking/slug-name).
// Les parties ville/CP sont auto-mises a jour quand le commercant change
// son adresse dans Reglages > Mon commerce > Informations.
//
// A chaque changement de slug, l'ancien est archive dans booking_slug_aliases
// pour qu'on puisse le redirection 301 et garder les QR codes / liens
// partages / etat OAuth fonctionnels.

const RESERVED_WORDS = new Set([
  'admin', 'api', 'app', 'www', 'mail', 'ftp', 'booking', 'book',
  'login', 'register', 'dashboard', 'settings', 'static', 'assets',
  'null', 'undefined', 'test', 'demo', 'dev', 'contact', 'support',
  'help', 'about', 'pricing', 'terms', 'privacy', 'cgu', 'cgv',
  'mentions-legales', '__oauth', 'oauth', 'callback', 'reset-password',
  // Routes marketplace : ne doivent pas etre prises comme slug.
  'recherche', 'search', 'marketplace', 'resolve', 'unsubscribe',
  'portail-client', 'portail',
]);

// Normalise une chaine en token slug-safe : minuscules, sans accents,
// tirets a la place des espaces, sans doubles tirets, sans caracteres
// speciaux. Retourne '' si rien d'utile.
function slugify(input, { maxLen = 60 } = {}) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // accents
    .replace(/[^a-z0-9\s-]/g, '')                      // caracteres autorises
    .trim()
    .replace(/\s+/g, '-')                              // espaces -> tirets
    .replace(/-+/g, '-')                               // tirets multiples
    .replace(/^-+|-+$/g, '')                           // trim tirets
    .substring(0, maxLen);
}

// Construit la partie "nom" du slug a partir du nom du commerce.
// Limite a 30 chars pour laisser de la place a ville-CP (total <= 60).
function buildNamePart(businessName) {
  return slugify(businessName, { maxLen: 30 }) || 'mon-commerce';
}

// Construit la partie "ville-CP" du slug. Retourne '' si city ou
// postalCode manquent (cas des comptes pre-onboarding).
function buildLocationPart(city, postalCode) {
  const cityPart = slugify(city, { maxLen: 20 });
  const cpPart = String(postalCode || '').replace(/\D/g, '').slice(0, 5);
  if (!cityPart || !cpPart) return '';
  return `${cityPart}-${cpPart}`;
}

// Construit le slug complet `nom-ville-CP`. Si ville/CP indisponibles,
// retombe sur le nom seul (cas comptes pas encore onboarded).
function buildMerchantSlug({ name, city, postalCode, customNamePart }) {
  const namePart = customNamePart
    ? slugify(customNamePart, { maxLen: 30 })
    : buildNamePart(name);
  const locationPart = buildLocationPart(city, postalCode);
  if (!namePart) return 'mon-commerce';
  if (!locationPart) return namePart;
  return `${namePart}-${locationPart}`.substring(0, 100);
}

// Valide un nom de slug saisi par le commercant (partie editable).
// Retourne { ok: true } ou { ok: false, reason, message }.
function validateNamePart(namePart) {
  const s = String(namePart || '').toLowerCase().trim();
  if (s.length < 3) {
    return { ok: false, reason: 'too_short', message: 'Minimum 3 caracteres requis.' };
  }
  if (s.length > 30) {
    return { ok: false, reason: 'too_long', message: 'Maximum 30 caracteres.' };
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(s)) {
    return { ok: false, reason: 'invalid_chars', message: 'Uniquement lettres minuscules, chiffres et tirets. Ne peut pas commencer ou finir par un tiret.' };
  }
  if (/--/.test(s)) {
    return { ok: false, reason: 'invalid_chars', message: 'Deux tirets consecutifs non autorises.' };
  }
  if (RESERVED_WORDS.has(s)) {
    return { ok: false, reason: 'reserved', message: `"${s}" est un nom reserve, veuillez en choisir un autre.` };
  }
  return { ok: true, value: s };
}

// Cherche un slug unique en base. Si baseSlug est deja pris (dans
// booking_settings OU dans booking_slug_aliases), ajoute -2, -3...
// Pool = pg pool, excludeUserId = pour ignorer le proprio (cas update).
async function findUniqueSlug(pool, baseSlug, excludeUserId = null) {
  let candidate = baseSlug;
  let attempt = 0;
  while (true) {
    const inSettingsQ = excludeUserId
      ? 'SELECT 1 FROM booking_settings WHERE slug=$1 AND user_id!=$2 LIMIT 1'
      : 'SELECT 1 FROM booking_settings WHERE slug=$1 LIMIT 1';
    const inSettingsP = excludeUserId ? [candidate, excludeUserId] : [candidate];
    const inAliasQ = excludeUserId
      ? 'SELECT 1 FROM booking_slug_aliases WHERE old_slug=$1 AND user_id!=$2 LIMIT 1'
      : 'SELECT 1 FROM booking_slug_aliases WHERE old_slug=$1 LIMIT 1';
    const inAliasP = inSettingsP;

    const [s, a] = await Promise.all([
      pool.query(inSettingsQ, inSettingsP),
      pool.query(inAliasQ, inAliasP).catch(() => ({ rows: [] })), // table peut ne pas encore exister
    ]);
    if (!s.rows.length && !a.rows.length) return candidate;
    attempt += 1;
    candidate = `${baseSlug}-${attempt + 1}`;
    if (attempt > 100) return `${baseSlug}-${Date.now()}`; // garde-fou pathologique
  }
}

// Archive un slug en alias avant un changement. Idempotent (ON CONFLICT).
// A appeler dans la meme transaction que l'UPDATE de booking_settings.slug
// pour garantir la coherence.
async function archiveOldSlug(pool, oldSlug, userId, client = null) {
  if (!oldSlug || !userId) return;
  const q = `INSERT INTO booking_slug_aliases (old_slug, user_id, created_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (old_slug) DO UPDATE
               SET user_id = EXCLUDED.user_id, created_at = NOW()`;
  const exec = client || pool;
  try {
    await exec.query(q, [oldSlug, userId]);
  } catch (e) {
    // Si la table n'existe pas encore (migration pas passee), on n'echoue pas.
    if (!/relation .*booking_slug_aliases.* does not exist/i.test(e.message)) {
      console.warn('[archiveOldSlug]', e.message);
    }
  }
}

// Extrait la partie "nom" d'un slug complet en retirant le suffixe
// `-ville-codepostal`. Retourne null si le slug ne suit pas le format.
// Sert a pre-remplir le champ d'edition cote frontend.
function extractNamePart(fullSlug, city, postalCode) {
  const loc = buildLocationPart(city, postalCode);
  if (!loc) return fullSlug || null;
  const suffix = `-${loc}`;
  if (fullSlug && fullSlug.endsWith(suffix)) {
    return fullSlug.slice(0, fullSlug.length - suffix.length);
  }
  return fullSlug || null;
}

module.exports = {
  slugify,
  buildMerchantSlug,
  buildNamePart,
  buildLocationPart,
  validateNamePart,
  findUniqueSlug,
  archiveOldSlug,
  extractNamePart,
  RESERVED_WORDS,
};
