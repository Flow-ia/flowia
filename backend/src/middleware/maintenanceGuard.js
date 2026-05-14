// middleware/maintenanceGuard.js — Kill-switch maintenance plateforme.
//
// 3 perimetres independants : merchant_portal, booking_public, merchant_signup.
// Configurable depuis le panel admin (PATCH /api/admin/maintenance).
//
// Toujours laisse passer :
//   - /api/admin/*               (admin frontend toujours fonctionnel)
//   - /api/health, /health-rich  (healthcheck Render)
//   - /api/platform-status       (le front doit pouvoir lire l'etat)
//   - webhooks Stripe            (sinon ledger casse, payments orphelins)
//   - /api/auth/login            (sinon impossible pour les whitelisted de se logger)
//   - OPTIONS preflight CORS     (sinon le browser bloque tout cross-origin)
//
// Bypass : whitelist par user_id ou email merchant configuree dans
// platform_settings.maintenance.value.{bypass_user_ids, bypass_emails}.

const jwt = require('jsonwebtoken');
const { getMaintenanceState, isBypassedUser } = require('../utils/platformSettings');

// Routes toujours autorisees, peu importe le mode maintenance.
// Le check whitelist est fait IN-ROUTE (auth.js) pour les routes auth qui
// echangent des credentials -- sans ca, on bloquerait avant l'identification
// et le whitelist ne pourrait pas se logger.
function isAlwaysAllowed(req) {
  const p = req.path;
  if (req.method === 'OPTIONS') return true;
  if (p === '/api/health' || p === '/api/health-rich' || p === '/api/health/cache') return true;
  if (p === '/api/platform-status') return true;
  if (p.startsWith('/api/admin/')) return true;
  if (p === '/api/payments/sms/webhook') return true;
  if (p === '/api/subscriptions/webhook') return true;
  if (p === '/api/stripe-connect/webhook') return true;
  if (p === '/api/auth/login') return true;
  // Google OAuth callbacks : routes de redirect HTML, le middleware ne peut
  // pas renvoyer JSON 503 (browser afficherait le JSON brut). Le check
  // whitelist est fait in-route avec un redirect propre.
  if (p.startsWith('/api/auth/google/')) return true;
  return false;
}

// Categorisation route → quel toggle bloque cette route.
// Retourne null si la route n'est gardee par aucun toggle (passe).
// Hierarchie : merchant_portal englobe merchant_signup (activer le portal
// bloque aussi l'inscription sans avoir besoin de cocher signup separement).
function getToggleFor(req, state) {
  const p = req.path;
  // Inscription merchant : toutes les routes /api/auth/register* (register,
  // register/confirm, register/resend-code). Bloque par merchant_signup OU
  // par merchant_portal si actif (un portail ferme = pas d'inscription).
  if (p.startsWith('/api/auth/register')) {
    if (state?.merchant_signup?.enabled) return 'merchant_signup';
    if (state?.merchant_portal?.enabled) return 'merchant_portal';
    return null;
  }
  // Booking publique : toutes les routes /api/pub/* (RDV publique salon).
  if (p.startsWith('/api/pub/')) return 'booking_public';
  // Sinon, c'est le portail commercant (toutes les autres routes /api/*).
  if (p.startsWith('/api/')) return 'merchant_portal';
  return null;
}

// Decode best-effort le JWT merchant pour identifier l'user (pour bypass).
// On NE jette PAS si le token est invalide/manquant : on traite simplement
// l'user comme anonyme, le middleware downstream gerera l'auth elle-meme.
function tryDecodeUser(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return { userId: null, email: null };
  try {
    const p = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    // Scope merchant uniquement (les autres scopes n'ont pas de paywall a bypass).
    if (!p.userId) return { userId: null, email: null };
    return { userId: p.userId, email: p.email || null };
  } catch {
    return { userId: null, email: null };
  }
}

async function maintenanceGuard(req, res, next) {
  if (isAlwaysAllowed(req)) return next();

  // On charge state d'abord (besoin de la hierarchie merchant_portal ⊇
  // merchant_signup pour categoriser /register).
  let state;
  try {
    state = await getMaintenanceState();
  } catch {
    // getMaintenanceState catche deja en interne et fail-open, mais
    // double-ceinture pour etre 100% sur qu'un crash imprevu ne bloque pas.
    return next();
  }

  const toggle = getToggleFor(req, state);
  if (!toggle) return next();  // route non-API (SPA fallback, static)

  const section = state[toggle];
  if (!section || !section.enabled) return next();

  // Maintenance ON pour ce perimetre. Check bypass.
  const { userId, email } = tryDecodeUser(req);
  if (isBypassedUser(state, userId, email)) return next();

  // Header dedie : permet au frontend de distinguer cette 503 d'une 503
  // de cold-start Render (qu'il retry automatiquement avec backoff). Sans
  // ce signal, le front retenterait 3x une route en maintenance avant de
  // voir l'overlay.
  res.setHeader('X-Maintenance', '1');
  res.setHeader('X-Maintenance-Scope', toggle);
  // Expose le header pour les requetes CORS (sinon le browser le masque).
  const exposed = res.getHeader('Access-Control-Expose-Headers');
  const list = (exposed ? String(exposed).split(',').map(s => s.trim()) : [])
    .concat(['X-Maintenance', 'X-Maintenance-Scope'])
    .filter((v, i, a) => a.indexOf(v) === i);
  res.setHeader('Access-Control-Expose-Headers', list.join(', '));

  return res.status(503).json({
    error:        'maintenance',
    scope:        toggle,
    message:      section.message || 'Notre plateforme est en cours de maintenance. Merci de reessayer plus tard.',
    retry_after_seconds: 300,
  });
}

module.exports = { maintenanceGuard };
