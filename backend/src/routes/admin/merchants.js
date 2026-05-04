// routes/admin/merchants.js — Gestion des commerçants par l'admin (commit #3).
// Tous les endpoints requièrent adminAuth (déjà appliqué par le router parent).

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');
const { logAuditAction } = require('../../services/adminAudit');
const { FEATURES } = require('../../middleware/requireFeature');

const router = express.Router();
router.use(adminAuth);

// ── GET /subscription-list — liste filtree par etat d'abonnement ─────────
// Sert au dashboard admin pour 'drill-down' sur une carte (ex: cliquer
// 'Actifs payants' -> voir la liste des marchands concernes).
// Filtres acceptes :
//   active_paying / trialing / canceling / past_due / canceled / admin_granted
//   essentiel_monthly / essentiel_yearly / equipe_monthly / equipe_yearly
router.get('/subscription-list', async (req, res) => {
  const filter = String(req.query.filter || '').trim();
  const limit  = Math.min(parseInt(req.query.limit) || 100, 500);

  // Mapping filter -> condition SQL (parametree).
  const conditions = {
    active_paying: `subscription_status IN ('active','trialing')
                    AND subscription_admin_grant IS NULL`,
    trialing:      `subscription_status = 'trialing'
                    AND subscription_admin_grant IS NULL`,
    canceling:     `subscription_status IN ('active','trialing')
                    AND subscription_admin_grant IS NULL
                    AND subscription_cancel_at_period_end = TRUE`,
    past_due:      `subscription_status = 'past_due'`,
    canceled:      `subscription_status = 'canceled'`,
    admin_granted: `subscription_admin_grant IS NOT NULL`,
    essentiel_monthly: `subscription_plan='essentiel' AND subscription_period='monthly'
                        AND subscription_status IN ('active','trialing')
                        AND subscription_admin_grant IS NULL`,
    essentiel_yearly:  `subscription_plan='essentiel' AND subscription_period='yearly'
                        AND subscription_status IN ('active','trialing')
                        AND subscription_admin_grant IS NULL`,
    equipe_monthly:    `subscription_plan='equipe' AND subscription_period='monthly'
                        AND subscription_status IN ('active','trialing')
                        AND subscription_admin_grant IS NULL`,
    equipe_yearly:     `subscription_plan='equipe' AND subscription_period='yearly'
                        AND subscription_status IN ('active','trialing')
                        AND subscription_admin_grant IS NULL`,
  };
  const where = conditions[filter];
  if (!where) {
    return res.status(400).json({ error: 'Filtre invalide.', valid: Object.keys(conditions) });
  }

  try {
    const { rows } = await pool.query(`
      SELECT id, email, business_name, is_frozen, created_at,
             subscription_status, subscription_plan, subscription_period,
             subscription_current_period_end, subscription_trial_ends_at,
             subscription_cancel_at_period_end, subscription_admin_grant
        FROM users
       WHERE ${where}
       ORDER BY COALESCE(subscription_current_period_end, created_at) ASC
       LIMIT $1
    `, [limit]);
    return res.json({ filter, count: rows.length, rows });
  } catch (e) {
    console.error('[admin/merchants subscription-list]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET / — liste paginée + filtres ──────────────────────────────────────────
router.get('/', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || 'all').toLowerCase(); // all|active|frozen

  const where = [];
  const params = [];
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(LOWER(u.business_name) LIKE $${params.length}
              OR LOWER(u.email) LIKE $${params.length}
              OR LOWER(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) LIKE $${params.length})`);
  }
  if (status === 'frozen') where.push('u.is_frozen = TRUE');
  else if (status === 'active') where.push('u.is_frozen = FALSE OR u.is_frozen IS NULL');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const { rows: total } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM users u ${whereSql}`,
      params
    );

    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.business_name, u.phone, u.city,
              u.is_frozen, u.frozen_at, u.frozen_reason,
              u.created_at,
              (SELECT COUNT(*)::int FROM appointments a WHERE a.user_id = u.id) AS appointments_count,
              (SELECT COUNT(*)::int FROM client_accounts c WHERE c.user_id = u.id) AS clients_count,
              (SELECT MAX(created_at) FROM appointments a WHERE a.user_id = u.id) AS last_appointment_at
         FROM users u
         ${whereSql}
         ORDER BY u.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ total: total[0].n, limit, offset, rows });
  } catch (e) {
    console.error('[admin/merchants list]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /:id — détail commerçant + stats agrégées ────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.business_name, u.phone, u.address, u.city, u.country, u.postal_code,
              u.first_name, u.last_name, u.avatar_url,
              u.is_frozen, u.frozen_at, u.frozen_reason, u.frozen_by_admin_id,
              u.sms_balance, u.feature_flags,
              u.created_at, u.onboarding_completed,
              bs.slug                       AS slug,
              bs.slug_locked                AS slug_locked,
              bs.slug_locked_at             AS slug_locked_at
         FROM users u
         LEFT JOIN booking_settings bs ON bs.user_id = u.id
        WHERE u.id = $1
        LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const user = rows[0];

    const { rows: stats } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM appointments WHERE user_id = $1) AS appointments_total,
         (SELECT COUNT(*)::int FROM appointments WHERE user_id = $1 AND status = 'completed') AS appointments_done,
         (SELECT COUNT(*)::int FROM appointments WHERE user_id = $1 AND status = 'cancelled') AS appointments_cancelled,
         (SELECT COUNT(*)::int FROM client_accounts WHERE user_id = $1) AS clients_count,
         (SELECT COUNT(*)::int FROM employees WHERE user_id = $1 AND is_active = TRUE) AS employees_active,
         (SELECT COUNT(*)::int FROM transactions WHERE user_id = $1) AS transactions_count,
         (SELECT COALESCE(SUM(amount), 0)::numeric(14,2) FROM transactions WHERE user_id = $1) AS revenue_total,
         (SELECT MAX(created_at) FROM appointments WHERE user_id = $1) AS last_appointment_at`,
      [user.id]
    );

    const { rows: frozenBy } = user.frozen_by_admin_id
      ? await pool.query(`SELECT email, name FROM admin_users WHERE id = $1`, [user.frozen_by_admin_id])
      : { rows: [] };

    return res.json({
      ...user,
      stats: stats[0],
      frozen_by: frozenBy[0] || null,
    });
  } catch (e) {
    console.error('[admin/merchants get]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── PATCH /:id — édition basique (business_name, email, phone) ───────────────
router.patch('/:id', async (req, res) => {
  const allowed = ['business_name', 'email', 'phone', 'city', 'address', 'country', 'postal_code'];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, k)) {
      params.push(req.body[k]);
      sets.push(`${k} = $${params.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Aucun champ à modifier.' });

  try {
    const { rows: before } = await pool.query(
      `SELECT id, email, business_name, phone, city, address, country, postal_code FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });

    params.push(req.params.id);
    const { rows: after } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, email, business_name, phone, city, address, country, postal_code`,
      params
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'merchant.update', targetType: 'merchant', targetId: req.params.id,
      payloadBefore: before[0], payloadAfter: after[0],
      req,
    });

    return res.json(after[0]);
  } catch (e) {
    console.error('[admin/merchants patch]', e.message);
    if (e.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé.' });
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /:id/freeze ─────────────────────────────────────────────────────────
router.post('/:id/freeze', async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Motif requis.' });

  try {
    const { rows: before } = await pool.query(
      `SELECT id, email, business_name, is_frozen, frozen_reason FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });
    if (before[0].is_frozen) return res.status(409).json({ error: 'Compte déjà gelé.' });

    await pool.query(
      `UPDATE users
          SET is_frozen = TRUE,
              frozen_reason = $2,
              frozen_at = NOW(),
              frozen_by_admin_id = $3
        WHERE id = $1`,
      [req.params.id, reason.slice(0, 1000), req.admin.id]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'merchant.freeze', targetType: 'merchant', targetId: req.params.id,
      payloadBefore: { is_frozen: false },
      payloadAfter:  { is_frozen: true, reason },
      req,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/merchants freeze]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /:id/unfreeze ───────────────────────────────────────────────────────
router.post('/:id/unfreeze', async (req, res) => {
  try {
    const { rows: before } = await pool.query(
      `SELECT id, is_frozen, frozen_reason FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });
    if (!before[0].is_frozen) return res.status(409).json({ error: 'Compte non gelé.' });

    await pool.query(
      `UPDATE users
          SET is_frozen = FALSE,
              frozen_reason = NULL,
              frozen_at = NULL,
              frozen_by_admin_id = NULL
        WHERE id = $1`,
      [req.params.id]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'merchant.unfreeze', targetType: 'merchant', targetId: req.params.id,
      payloadBefore: { is_frozen: true, reason: before[0].frozen_reason },
      payloadAfter:  { is_frozen: false },
      req,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/merchants unfreeze]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /:id/sms-balance/adjust — ajout ou retrait manuel solde SMS ─────────
// Usage admin : compensation, geste commercial, correction bug Stripe.
// Body : { delta: number, reason: string }
//   delta > 0 → ajout
//   delta < 0 → retrait
// Garde-fous :
// - delta != 0
// - |delta| ≤ 1000 (cap par operation, plusieurs operations consecutives
//   restent possibles si justifie)
// - reason obligatoire (audit)
// - solde resultant >= 0 garanti par la contrainte DB users_sms_balance_nonneg
//   et verifie en amont pour retourner un 409 explicite plutot qu'un 500.
const SMS_BALANCE_DELTA_MAX = 1000;

router.post('/:id/sms-balance/adjust', async (req, res) => {
  const deltaRaw = req.body?.delta;
  const delta = typeof deltaRaw === 'number' ? deltaRaw : Number(deltaRaw);
  const reason = String(req.body?.reason || '').trim();

  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ error: 'Montant invalide.' });
  }
  if (Math.abs(delta) > SMS_BALANCE_DELTA_MAX) {
    return res.status(400).json({ error: `Cap par operation : ${SMS_BALANCE_DELTA_MAX} euros.` });
  }
  if (!reason) return res.status(400).json({ error: 'Motif requis.' });

  // Arrondi 2 decimales pour eviter les artefacts flottants en base.
  const deltaRounded = Math.round(delta * 100) / 100;

  try {
    const { rows: before } = await pool.query(
      `SELECT id, email, business_name, sms_balance FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });

    const currentBalance = Number(before[0].sms_balance) || 0;
    const newBalance = Math.round((currentBalance + deltaRounded) * 100) / 100;
    if (newBalance < 0) {
      return res.status(409).json({
        error: `Solde insuffisant : ${currentBalance.toFixed(2)} euros disponibles.`,
      });
    }

    // UPDATE atomique avec re-lecture du solde pour eviter une race condition
    // entre le SELECT et le UPDATE (ex : Stripe webhook concurrent).
    const { rows: updated } = await pool.query(
      `UPDATE users
          SET sms_balance = sms_balance + $2
        WHERE id = $1
          AND sms_balance + $2 >= 0
        RETURNING sms_balance`,
      [req.params.id, deltaRounded]
    );
    if (!updated.length) {
      return res.status(409).json({ error: 'Solde insuffisant (race).' });
    }

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: deltaRounded > 0 ? 'merchant.sms_balance.add' : 'merchant.sms_balance.subtract',
      targetType: 'merchant', targetId: req.params.id,
      payloadBefore: { sms_balance: currentBalance },
      payloadAfter:  { sms_balance: Number(updated[0].sms_balance), delta: deltaRounded, reason },
      req,
    });

    return res.json({
      ok: true,
      sms_balance: Number(updated[0].sms_balance),
      delta: deltaRounded,
    });
  } catch (e) {
    console.error('[admin/merchants sms_balance adjust]', e.message);
    // Contrainte DB users_sms_balance_nonneg
    if (e.code === '23514') {
      return res.status(409).json({ error: 'Solde insuffisant.' });
    }
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /:id/features — etat des feature flags ──────────────────────────────
// Renvoie un objet exhaustif { feature: true|false } pour chaque feature
// blocable (FEATURES). Default true si la cle est absente du JSONB.
router.get('/:id/features', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT feature_flags FROM users WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const stored = rows[0].feature_flags || {};
    const out = {};
    for (const f of FEATURES) {
      out[f] = stored[f] !== false; // absent OU true => active
    }
    return res.json({ features: out });
  } catch (e) {
    console.error('[admin/merchants features get]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── PATCH /:id/features — toggle une feature ─────────────────────────────────
// Body { feature: 'loyalty', enabled: false, reason: 'motif' }
router.patch('/:id/features', async (req, res) => {
  const feature = String(req.body?.feature || '').trim();
  const enabled = req.body?.enabled === true;
  const reason  = String(req.body?.reason || '').trim();

  if (!FEATURES.includes(feature)) {
    return res.status(400).json({ error: 'Feature inconnue.' });
  }
  if (!reason) return res.status(400).json({ error: 'Motif requis.' });

  try {
    const { rows: before } = await pool.query(
      `SELECT id, feature_flags FROM users WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });
    const oldFlags = before[0].feature_flags || {};
    const newFlags = { ...oldFlags, [feature]: enabled };

    await pool.query(
      `UPDATE users SET feature_flags = $2 WHERE id = $1`,
      [req.params.id, newFlags]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: enabled ? 'merchant.feature.enable' : 'merchant.feature.disable',
      targetType: 'merchant', targetId: req.params.id,
      payloadBefore: { [feature]: oldFlags[feature] !== false },
      payloadAfter:  { [feature]: enabled, reason },
      req,
    });

    return res.json({ ok: true, features: newFlags });
  } catch (e) {
    console.error('[admin/merchants features patch]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /:id/slug/force — admin impose un slug et le verrouille ────────────
// Body { slug, lock: true } — slug normalisé/validé cote serveur, unicite
// verifiee, audit log. lock=true => le merchant ne peut plus changer son slug.
router.post('/:id/slug/force', async (req, res) => {
  // 1. Sanity check sur l'admin authentifie (defense en profondeur)
  if (!req.admin?.id) {
    console.error('[admin/merchants slug force] req.admin.id manquant');
    return res.status(401).json({ error: 'Session admin invalide.' });
  }
  // 2. Normalisation slug : enleve accents, garde a-z 0-9 et tirets
  const rawSlug = String(req.body?.slug || '').trim().toLowerCase();
  const lock    = req.body?.lock === true;
  const slug = rawSlug
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // accents combinants
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  if (!slug || slug.length < 3) {
    return res.status(400).json({ error: 'Slug invalide (min 3 caracteres a-z 0-9 -).' });
  }

  // 3. Op DB avec retry automatique si la colonne slug_locked manque
  // (migration adminSchema pas appliquee sur cet env).
  let attempt = 0;
  while (attempt < 2) {
    attempt++;
    try {
      // Unicite (409 explicite plutot qu'erreur PG cryptique)
      const { rows: clash } = await pool.query(
        `SELECT user_id FROM booking_settings WHERE slug = $1 AND user_id <> $2 LIMIT 1`,
        [slug, req.params.id]
      );
      if (clash.length) {
        return res.status(409).json({ error: 'Slug deja utilise par un autre commerce.' });
      }

      // Existence ligne booking_settings + valeurs avant pour audit.
      // UPSERT plutot que UPDATE seul : si le merchant n'a pas encore de
      // ligne booking_settings (compte tout neuf), on la cree. Avant le code
      // retournait 404 dans ce cas, ce qui empechait l'admin d'imposer
      // un slug a un nouveau commercant.
      const { rows: before } = await pool.query(
        `SELECT user_id, slug, slug_locked FROM booking_settings WHERE user_id = $1 LIMIT 1`,
        [req.params.id]
      );

      if (before.length) {
        await pool.query(
          `UPDATE booking_settings
              SET slug = $2,
                  slug_locked = $3,
                  slug_locked_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
                  slug_locked_by_admin_id = CASE WHEN $3 THEN $4 ELSE NULL END,
                  updated_at = NOW()
            WHERE user_id = $1`,
          [req.params.id, slug, lock, req.admin.id]
        );
      } else {
        // Nouveau commerce sans booking_settings encore -> on cree
        await pool.query(
          `INSERT INTO booking_settings
             (user_id, is_enabled, slug, slug_locked, slug_locked_at, slug_locked_by_admin_id)
           VALUES ($1, FALSE, $2, $3,
                   CASE WHEN $3 THEN NOW() ELSE NULL END,
                   CASE WHEN $3 THEN $4 ELSE NULL END)`,
          [req.params.id, slug, lock, req.admin.id]
        );
      }

      await logAuditAction({
        adminId: req.admin.id, adminEmail: req.admin.email,
        action: lock ? 'merchant.slug.force_lock' : 'merchant.slug.force_unlock',
        targetType: 'merchant', targetId: req.params.id,
        payloadBefore: before.length
          ? { slug: before[0].slug, slug_locked: before[0].slug_locked }
          : { created: true },
        payloadAfter:  { slug, slug_locked: lock },
        req,
      });

      return res.json({ ok: true, slug, slug_locked: lock });
    } catch (e) {
      // PG 42703 = "undefined column" -> migration adminSchema pas tournee.
      // On la rejoue UNE fois et on retry. Si echec persistant, on log
      // tout et on remonte un 500 detaille pour le client (visible dans la
      // Network tab) et complet dans les logs serveur.
      const isMissingColumn = e.code === '42703' && /slug_locked/i.test(e.message || '');
      if (isMissingColumn && attempt === 1) {
        console.warn('[admin/merchants slug force] colonne slug_locked manquante — applique adminSchema...');
        try {
          const { applyAdminSchema } = require('../../db/adminSchema');
          await applyAdminSchema(pool);
          continue; // retry
        } catch (migErr) {
          console.error('[admin/merchants slug force] migration de rattrapage echouee:', migErr.message);
        }
      }
      console.error('[admin/merchants slug force] code=%s message=%s\nstack=%s',
        e.code, e.message, e.stack);
      if (e.code === '23505') return res.status(409).json({ error: 'Slug deja utilise.' });
      // Renvoie un message detaille pour faciliter le debug (visible Network).
      // Pas de fuite de schema sensible : on garde uniquement code + message court.
      return res.status(500).json({
        error: 'Erreur serveur slug/force.',
        code: e.code || 'UNKNOWN',
        detail: String(e.message || '').slice(0, 200),
      });
    }
  }
});

// ── POST /:id/reset — reinitialiser des donnees du commercant ──────────────
// Operation TRES destructive : delete reel (pas soft-delete).
// Sécurité défense en profondeur :
//   1. adminAuth (deja applique au router)
//   2. confirm_business_name doit egaler EXACTEMENT u.business_name (case
//      insensitive, trim) — empêche un clic accidentel
//   3. transaction SQL atomique : tout ou rien
//   4. plafond 200 000 lignes par operation (au-dela : refus + demander range)
//   5. audit log obligatoire (admin id, IP, count, range)
//
// Features supportees :
//   - transactions_walkin     : encaissements sans RDV (caisse directe)
//   - transactions_appointment: encaissements lies a un RDV (depuis l'agenda)
//                                + reset paid/transaction_id sur appointments
//   - transactions_all        : tous les encaissements + reset paid sur RDV
//   - appointments            : RDV (passe et futur), supprime aussi les
//                                transactions qui les referencent (sinon
//                                appointment_id deviendrait orphelin)
//   - all                     : RDV + transactions sur place + via RDV
//   - credits                 : tous les credits/dettes des clients +
//                                historique credit_transactions + purge
//                                registre Creances orphelines. Apres : aucun
//                                client n'a plus d'ardoise ni d'avoir chez
//                                ce commercant. NE TOUCHE PAS aux fiches
//                                client ni aux transactions/RDV.
//   - clients                 : suppression complete du fichier clients
//                                (cascade anonymisation transactions/RDV/
//                                credits/notes + purge loyalty + purge fiches
//                                + purge debt-records). Les comptes globaux
//                                FlowIA des clients (cross-merchant) ne sont
//                                PAS touches.
//
// Filtre temporel optionnel : { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } —
// applicable UNIQUEMENT aux features transactions_*, appointments, all.
// Sans effet pour 'credits' et 'clients' (operations factory reset globales).
const RESET_FEATURES = new Set([
  'transactions_walkin',
  'transactions_appointment',
  'transactions_all',
  'appointments',
  'all',
  'credits',
  'clients',
]);
const NO_DATE_FEATURES = new Set(['credits', 'clients']);
const MAX_RESET_ROWS = 200000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.post('/:id/reset', async (req, res) => {
  const { feature, from, to, confirm_business_name } = req.body || {};

  if (!feature || !RESET_FEATURES.has(feature)) {
    return res.status(400).json({ error: 'Feature invalide.' });
  }
  if (from && !DATE_RE.test(String(from))) {
    return res.status(400).json({ error: 'Date `from` invalide (YYYY-MM-DD).' });
  }
  if (to && !DATE_RE.test(String(to))) {
    return res.status(400).json({ error: 'Date `to` invalide (YYYY-MM-DD).' });
  }
  if (from && to && String(from) > String(to)) {
    return res.status(400).json({ error: '`from` doit etre <= `to`.' });
  }
  if (!confirm_business_name || typeof confirm_business_name !== 'string') {
    return res.status(400).json({ error: 'confirm_business_name requis.' });
  }

  const client = await pool.connect();
  try {
    // 1. Recupere le merchant + business_name pour confirmation
    const { rows: u } = await client.query(
      `SELECT id, business_name FROM users WHERE id=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!u.length) return res.status(404).json({ error: 'Commercant introuvable.' });

    const expected = String(u[0].business_name || '').trim().toLowerCase();
    const provided = String(confirm_business_name).trim().toLowerCase();
    if (!expected || provided !== expected) {
      return res.status(400).json({
        error: "Confirmation incorrecte : tapez exactement le nom commercial du commerce.",
      });
    }

    // ── BRANCH dedie : reset 'credits' / 'clients' (factory reset, pas de date) ──
    // Ces 2 features sont des wipes complets, sans plage temporelle. Logique
    // distincte de la cascade transactions/RDV pour rester lisible.
    if (NO_DATE_FEATURES.has(feature)) {
      const counts = {};
      await client.query('BEGIN');
      try {
        if (feature === 'credits') {
          // 1. Historique credit_transactions (FK CASCADE sur client_credits
          //    mais on supprime explicitement pour le compte de retour propre)
          const r1 = await client.query(
            `DELETE FROM credit_transactions
              WHERE credit_id IN (SELECT id FROM client_credits WHERE user_id=$1)`,
            [req.params.id]
          );
          counts.credit_transactions = r1.rowCount || 0;
          // 2. Soldes
          const r2 = await client.query(
            `DELETE FROM client_credits WHERE user_id=$1`,
            [req.params.id]
          );
          counts.client_credits = r2.rowCount || 0;
          // 3. Registre Creances orphelines (les dettes des comptes supprimes
          //    n'ont plus de raison d'etre puisque le commercant fait table rase)
          const r3 = await client.query(
            `DELETE FROM merchant_debt_records WHERE user_id=$1`,
            [req.params.id]
          );
          counts.debt_records = r3.rowCount || 0;
        }

        if (feature === 'clients') {
          // 1. Cascade anonymisation : montants conserves pour la compta,
          //    coordonnees personnelles effacees. Idem que DELETE /api/clients/:id
          //    individuel mais en bulk pour TOUTES les fiches du merchant.
          const r1 = await client.query(
            `UPDATE transactions SET client_email=NULL, client_note=NULL
              WHERE user_id=$1 AND client_email IS NOT NULL`,
            [req.params.id]
          );
          counts.transactions_anonymized = r1.rowCount || 0;
          const r2 = await client.query(
            `UPDATE appointments SET client_email=NULL, client_phone=NULL,
                    client_name='Client anonyme'
              WHERE user_id=$1 AND client_email IS NOT NULL`,
            [req.params.id]
          );
          counts.appointments_anonymized = r2.rowCount || 0;
          const r3 = await client.query(
            `UPDATE client_credits SET client_email=NULL, client_name='[Compte supprimé]'
              WHERE user_id=$1 AND client_email IS NOT NULL`,
            [req.params.id]
          );
          counts.client_credits_anonymized = r3.rowCount || 0;
          const r4 = await client.query(
            `UPDATE client_notes SET client_email=NULL, client_name='[Compte supprimé]'
              WHERE user_id=$1 AND client_email IS NOT NULL`,
            [req.params.id]
          );
          counts.client_notes_anonymized = r4.rowCount || 0;
          // 2. Loyalty : pas de valeur comptable -> hard delete
          const r5 = await client.query(
            `DELETE FROM client_loyalty WHERE user_id=$1`,
            [req.params.id]
          );
          counts.client_loyalty_deleted = r5.rowCount || 0;
          // 3. Fiches clients : hard delete. Les comptes globaux (cross-merchant)
          //    restent intacts -- ils n'appartiennent pas au commercant.
          const r6 = await client.query(
            `DELETE FROM client_accounts WHERE user_id=$1`,
            [req.params.id]
          );
          counts.client_accounts_deleted = r6.rowCount || 0;
          // 4. Registre Creances : meme logique que credits, on purge.
          const r7 = await client.query(
            `DELETE FROM merchant_debt_records WHERE user_id=$1`,
            [req.params.id]
          );
          counts.debt_records_deleted = r7.rowCount || 0;
        }
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw txErr;
      }

      // Audit log
      await logAuditAction({
        adminId: req.admin.id, adminEmail: req.admin.email,
        action: `merchant.reset.${feature}`,
        targetType: 'merchant', targetId: req.params.id,
        payloadBefore: { feature },
        payloadAfter:  counts,
        req,
      });

      return res.json({ ok: true, deleted: counts });
    }

    // 2. Build clauses dates
    const dateParams = [];
    let txDateClause   = '';
    let apptDateClause = '';
    if (from) { dateParams.push(from); txDateClause += ` AND date >= $${dateParams.length + 1}`;
                                       apptDateClause += ` AND date >= $${dateParams.length + 1}`; }
    if (to)   { dateParams.push(to);   txDateClause += ` AND date <= $${dateParams.length + 1}`;
                                       apptDateClause += ` AND date <= $${dateParams.length + 1}`; }
    // Note: les indices sont calcules apres ajout, mais on a bien $1=user_id en
    // tete dans chaque query, donc dateParams[i] -> $(i+2). On reconstruit
    // proprement en injectant dans l'ordre [user_id, ...dateParams].

    // 3. Pre-count pour plafond + retour
    const wantsTxWalkin    = feature === 'transactions_walkin'    || feature === 'transactions_all' || feature === 'all';
    const wantsTxAppt      = feature === 'transactions_appointment'|| feature === 'transactions_all' || feature === 'all';
    const wantsAppointments= feature === 'appointments'           || feature === 'all';

    let totalToDelete = 0;
    if (wantsTxWalkin) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM transactions
          WHERE user_id=$1 AND appointment_id IS NULL ${txDateClause}`,
        [req.params.id, ...dateParams]
      );
      totalToDelete += rows[0].n;
    }
    if (wantsTxAppt) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM transactions
          WHERE user_id=$1 AND appointment_id IS NOT NULL ${txDateClause}`,
        [req.params.id, ...dateParams]
      );
      totalToDelete += rows[0].n;
    }
    if (wantsAppointments) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM appointments
          WHERE user_id=$1 ${apptDateClause}`,
        [req.params.id, ...dateParams]
      );
      totalToDelete += rows[0].n;
    }

    if (totalToDelete === 0) {
      return res.json({ ok: true, deleted: { transactions: 0, appointments: 0 }, note: 'Rien a supprimer.' });
    }
    if (totalToDelete > MAX_RESET_ROWS) {
      return res.status(413).json({
        error: `Trop de lignes a supprimer (${totalToDelete} > ${MAX_RESET_ROWS}). Reduisez la plage de dates.`,
      });
    }

    // 4. Suppression atomique
    let txDeleted   = 0;
    let apptDeleted = 0;
    await client.query('BEGIN');
    try {
      // 4a. Walkin transactions
      if (wantsTxWalkin) {
        const r = await client.query(
          `DELETE FROM transactions
            WHERE user_id=$1 AND appointment_id IS NULL ${txDateClause}`,
          [req.params.id, ...dateParams]
        );
        txDeleted += r.rowCount || 0;
      }
      // 4b. Appointment-linked transactions : reset paid sur les RDV
      // concernes AVANT de supprimer les transactions (sinon transaction_id
      // pointerait sur une ligne disparue le temps du UPDATE).
      if (wantsTxAppt) {
        await client.query(
          `UPDATE appointments
              SET paid=FALSE, paid_method=NULL, transaction_id=NULL, updated_at=NOW()
            WHERE user_id=$1 AND transaction_id IN (
              SELECT id FROM transactions
                WHERE user_id=$1 AND appointment_id IS NOT NULL ${txDateClause}
            )`,
          [req.params.id, ...dateParams]
        );
        const r = await client.query(
          `DELETE FROM transactions
            WHERE user_id=$1 AND appointment_id IS NOT NULL ${txDateClause}`,
          [req.params.id, ...dateParams]
        );
        txDeleted += r.rowCount || 0;
      }
      // 4c. Appointments : avant de supprimer les RDV, on doit supprimer les
      // transactions qui referencent ces RDV (la colonne transactions.appointment_id
      // n'a PAS de FK dans la migration, mais l'integrite metier l'exige —
      // sinon on aurait des transactions orphelines pointant vers un RDV
      // disparu qui casseraient le drilldown caisse).
      if (wantsAppointments) {
        const r1 = await client.query(
          `DELETE FROM transactions
            WHERE user_id=$1 AND appointment_id IS NOT NULL
              AND appointment_id IN (
                SELECT id FROM appointments WHERE user_id=$1 ${apptDateClause}
              )`,
          [req.params.id, ...dateParams]
        );
        txDeleted += r1.rowCount || 0;
        // appointment_items est ON DELETE CASCADE -> auto-purge
        const r2 = await client.query(
          `DELETE FROM appointments WHERE user_id=$1 ${apptDateClause}`,
          [req.params.id, ...dateParams]
        );
        apptDeleted = r2.rowCount || 0;
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    }

    // 5. Audit log
    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: `merchant.reset.${feature}`,
      targetType: 'merchant', targetId: req.params.id,
      payloadBefore: { feature, from: from || null, to: to || null, expected_total: totalToDelete },
      payloadAfter:  { transactions_deleted: txDeleted, appointments_deleted: apptDeleted },
      req,
    });

    return res.json({
      ok: true,
      deleted: { transactions: txDeleted, appointments: apptDeleted },
    });
  } catch (e) {
    console.error('[admin/merchants reset]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ─── ABONNEMENT — Vue + octroi gratuit + revocation (superadmin) ───────────
// Permet a un superadmin de :
// - Voir l'etat complet de l'abonnement d'un marchand (Stripe + grant DB)
// - Octroyer un plan gratuit (pour partenariats, beta-testers, support)
// - Revoquer l'octroi (le marchand devra souscrire normalement)
// - Optionnellement annuler l'abonnement Stripe actif lors de l'octroi
//   (pour eviter qu'il continue a payer en parallele du plan gratuit)

function getStripeAdmin() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  return require('stripe')(key);
}

// GET /api/admin/merchants/:id/subscription
// Retourne tout : DB (status, plan, period, grant) + best-effort Stripe live.
router.get('/:id/subscription', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, business_name,
              subscription_status, subscription_plan, subscription_period,
              subscription_current_period_end, subscription_trial_ends_at,
              subscription_cancel_at_period_end, stripe_subscription_id,
              stripe_customer_id, subscription_admin_grant
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Marchand introuvable' });
    const u = rows[0];

    // Determine effective plan : grant prend le pas sur Stripe.
    const grant = u.subscription_admin_grant;
    const grantActive = grant && (!grant.expires_at || new Date(grant.expires_at) > new Date());

    res.json({
      merchant: {
        id: u.id, email: u.email, business_name: u.business_name,
      },
      stripe: {
        customer_id:        u.stripe_customer_id,
        subscription_id:    u.stripe_subscription_id,
        status:             u.subscription_status,
        plan:               u.subscription_plan,
        period:             u.subscription_period,
        current_period_end: u.subscription_current_period_end,
        trial_ends_at:      u.subscription_trial_ends_at,
        cancel_at_period_end: !!u.subscription_cancel_at_period_end,
      },
      admin_grant: grant || null,
      effective: {
        plan:   grantActive ? grant.plan
              : (['active','trialing'].includes(u.subscription_status)
                  ? u.subscription_plan
                  : 'decouverte'),
        source: grantActive ? 'admin_grant'
              : (['active','trialing'].includes(u.subscription_status)
                  ? 'stripe' : 'free'),
      },
    });
  } catch (e) {
    console.error('[admin/merchants subscription get]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/merchants/:id/subscription/grant
// Body : { plan: 'essentiel'|'equipe', period: 'monthly'|'yearly',
//          expires_at: null|ISO, reason: string, cancel_stripe: boolean }
// Si cancel_stripe=true et l'utilisateur a une sub Stripe active, on
// l'annule cote Stripe pour eviter un double-billing.
router.post('/:id/subscription/grant', async (req, res) => {
  try {
    const { plan, period, expires_at, reason, cancel_stripe } = req.body || {};
    if (!['essentiel', 'equipe'].includes(plan)) {
      return res.status(400).json({ error: 'Plan invalide' });
    }
    if (!['monthly', 'yearly'].includes(period)) {
      return res.status(400).json({ error: 'Période invalide' });
    }
    if (expires_at && isNaN(new Date(expires_at).getTime())) {
      return res.status(400).json({ error: 'expires_at invalide (ISO date attendue)' });
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({ error: 'Motif requis (min. 3 caractères)' });
    }

    const { rows: before } = await pool.query(
      `SELECT id, business_name, subscription_admin_grant, stripe_subscription_id,
              subscription_status
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Marchand introuvable' });

    const grant = {
      plan, period,
      granted_at:       new Date().toISOString(),
      granted_by_id:    req.admin.id,
      granted_by_email: req.admin.email,
      expires_at:       expires_at || null,
      reason:           reason.trim().slice(0, 500),
    };

    // Optionnel : annuler la sub Stripe active immediatement pour eviter
    // un double-billing (l'utilisateur paie Stripe + bénéficie du grant).
    let stripeCanceled = false;
    if (cancel_stripe && before[0].stripe_subscription_id
        && ['active','trialing','past_due'].includes(before[0].subscription_status)) {
      try {
        const stripe = getStripeAdmin();
        await stripe.subscriptions.cancel(before[0].stripe_subscription_id, { prorate: true });
        stripeCanceled = true;
      } catch (e) {
        console.warn('[admin grant] cancel stripe sub fail (non bloquant):', e.message);
      }
    }

    await pool.query(
      `UPDATE users SET subscription_admin_grant = $2 WHERE id = $1`,
      [req.params.id, grant]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'merchant.subscription.grant',
      targetType: 'merchant', targetId: req.params.id,
      payloadBefore: { admin_grant: before[0].subscription_admin_grant },
      payloadAfter:  { admin_grant: grant, stripe_canceled: stripeCanceled },
      req,
    });

    res.json({ ok: true, admin_grant: grant, stripe_canceled: stripeCanceled });
  } catch (e) {
    console.error('[admin/merchants subscription grant]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/admin/merchants/:id/subscription/grant
// Revoque l'octroi gratuit. Le marchand devra souscrire via Stripe pour
// reprendre l'acces premium. Stripe sub reste intact (s'il en avait une
// que cancel_stripe=false avait laisse).
router.delete('/:id/subscription/grant', async (req, res) => {
  try {
    const { rows: before } = await pool.query(
      `SELECT id, subscription_admin_grant FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Marchand introuvable' });
    if (!before[0].subscription_admin_grant) {
      return res.status(400).json({ error: 'Aucun octroi à révoquer' });
    }

    await pool.query(
      `UPDATE users SET subscription_admin_grant = NULL WHERE id = $1`,
      [req.params.id]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'merchant.subscription.revoke',
      targetType: 'merchant', targetId: req.params.id,
      payloadBefore: { admin_grant: before[0].subscription_admin_grant },
      payloadAfter:  { admin_grant: null },
      req,
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/merchants subscription revoke]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
