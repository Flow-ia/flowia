const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// Génère un code unique type "REF-AB12CD"
function genReferralCode() {
  const raw = crypto.randomBytes(4).toString('base64')
    .replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
  return `REF-${raw}`;
}

// ═══ Routes commerçant (authentifiées) ══════════════════════════════════════
const merchantRouter = express.Router();
merchantRouter.use(authMiddleware);

// Périodes valides pour la limite anti-abus.
const VALID_LIMIT_PERIODS = ['unlimited', 'lifetime', 'month', '3months', 'year'];

// ── GET /api/referrals/program — config (commerçant) ────────────────────────
merchantRouter.get('/program', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT user_id, is_enabled, parrain_type, parrain_value,
              filleul_type, filleul_value, limit_count, limit_period, updated_at
         FROM referral_programs WHERE user_id=$1`,
      [req.user.userId]
    );
    if (!rows.length) {
      return res.json({
        is_enabled: false,
        parrain_type: 'percent', parrain_value: 10,
        filleul_type: 'percent', filleul_value: 10,
        limit_count: null, limit_period: 'unlimited',
      });
    }
    res.json(rows[0]);
  } catch (e) { console.error('[REF PROG GET]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── PUT /api/referrals/program — upsert config ──────────────────────────────
merchantRouter.put('/program', async (req, res) => {
  try {
    const {
      is_enabled, parrain_type, parrain_value, filleul_type, filleul_value,
      limit_count, limit_period,
    } = req.body;
    for (const t of [parrain_type, filleul_type]) {
      if (t && !['percent','fixed'].includes(t))
        return res.status(400).json({ error: 'type invalide.' });
    }
    const pv = parseFloat(parrain_value);
    const fv = parseFloat(filleul_value);
    if (isNaN(pv) || pv < 0 || isNaN(fv) || fv < 0)
      return res.status(400).json({ error: 'valeurs invalides.' });

    // Limite anti-abus : période + nombre. Période 'unlimited' ou 'lifetime'
    // n'utilise pas limit_count (lifetime = 1 implicite, unlimited = pas de limite).
    let lp = (limit_period || 'unlimited').toString();
    if (!VALID_LIMIT_PERIODS.includes(lp)) lp = 'unlimited';
    let lc = null;
    if (lp === 'lifetime') {
      lc = 1; // une seule fois à vie
    } else if (lp !== 'unlimited') {
      const n = parseInt(limit_count, 10);
      if (isNaN(n) || n < 1) return res.status(400).json({ error: 'Nombre de parrainages invalide (min 1).' });
      lc = n;
    }

    const { rows } = await pool.query(
      `INSERT INTO referral_programs
         (user_id, is_enabled, parrain_type, parrain_value, filleul_type, filleul_value,
          limit_count, limit_period, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         is_enabled    = EXCLUDED.is_enabled,
         parrain_type  = EXCLUDED.parrain_type,
         parrain_value = EXCLUDED.parrain_value,
         filleul_type  = EXCLUDED.filleul_type,
         filleul_value = EXCLUDED.filleul_value,
         limit_count   = EXCLUDED.limit_count,
         limit_period  = EXCLUDED.limit_period,
         updated_at    = NOW()
       RETURNING *`,
      [req.user.userId, !!is_enabled,
       parrain_type || 'percent', pv,
       filleul_type || 'percent', fv,
       lc, lp]
    );
    res.json(rows[0]);
  } catch (e) { console.error('[REF PROG PUT]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/referrals/codes — liste des codes générés pour ce commerçant ──
merchantRouter.get('/codes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT rc.id, rc.code, rc.owner_client_email, rc.uses_count, rc.created_at
         FROM referral_codes rc
        WHERE rc.user_id=$1
        ORDER BY rc.created_at DESC
        LIMIT 500`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (e) { console.error('[REF CODES GET]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/referrals/rewards?email=… ─────────────────────────────────────
// Caisse : récupère tout ce qu'il faut afficher lorsqu'un client est identifié :
//   - pending[] : parrainages en attente de validation (le client est un filleul
//                 qui vient de venir → l'employé doit valider pour récompenser
//                 le parrain)
//   - rewards[] : réductions disponibles (anniv + parrainage déjà validé) avec
//                 leur code promo, valeur et date d'expiration, triées par date
//                 d'expiration croissante (la plus proche en premier — c'est
//                 celle suggérée par défaut selon onboarding).
merchantRouter.get('/rewards', async (req, res) => {
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    if (!email) return res.json({ pending: [], rewards: [] });

    const [pendingR, rewardsR] = await Promise.all([
      pool.query(
        `SELECT ru.id, ru.filleul_email, ru.created_at, ru.appointment_id,
                rc.code AS referral_code, rc.owner_client_email AS parrain_email,
                ca.first_name AS parrain_first_name,
                ca.last_name  AS parrain_last_name
           FROM referral_uses ru
           JOIN referral_codes rc ON rc.id = ru.referral_code_id
           LEFT JOIN client_accounts ca
             ON ca.user_id = ru.user_id
            AND LOWER(ca.email) = LOWER(rc.owner_client_email)
          WHERE ru.user_id=$1
            AND LOWER(ru.filleul_email)=$2
            AND ru.status='pending'
          ORDER BY ru.created_at ASC`,
        [req.user.userId, email]
      ),
      pool.query(
        `SELECT cr.id, cr.reward_type, cr.status, cr.expires_at, cr.created_at,
                p.id AS promo_id, p.code, p.type, p.value,
                p.uses_count, p.max_uses, p.is_active, p.valid_until
           FROM client_rewards cr
           LEFT JOIN promo_codes p ON p.id = cr.promo_code_id
          WHERE cr.user_id=$1
            AND LOWER(cr.client_email)=$2
            AND cr.status='available'
            AND (cr.expires_at IS NULL OR cr.expires_at > NOW())
            AND (p.id IS NULL OR p.is_active = TRUE)
            AND (p.max_uses IS NULL OR p.uses_count < p.max_uses)
          ORDER BY cr.expires_at ASC NULLS LAST, cr.created_at ASC`,
        [req.user.userId, email]
      ),
    ]);
    res.json({ pending: pendingR.rows, rewards: rewardsR.rows });
  } catch (e) { console.error('[REF REWARDS GET]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── Helper interne : valide un referral_use (émet promo parrain + reward)
// Utilisé par la route manuelle /uses/:id/validate ET par le hook automatique
// déclenché à l'encaissement d'un RDV filleul (booking.js checkout).
// Opens its own transaction — ne PAS appeler dans un pool.query déjà en cours.
// Renvoie { ok, code, promo_id } ou lance une Error typée (.code in
// 'NOT_FOUND' | 'ALREADY_HANDLED' | 'NO_PROGRAM').
async function validateReferralUse(useId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: useRows } = await client.query(
      `SELECT ru.id, ru.status, ru.filleul_email, ru.referral_code_id,
              rc.owner_client_email AS parrain_email, rc.code AS referral_code
         FROM referral_uses ru
         JOIN referral_codes rc ON rc.id = ru.referral_code_id
        WHERE ru.id=$1 AND ru.user_id=$2
        FOR UPDATE`,
      [useId, userId]
    );
    if (!useRows.length) {
      await client.query('ROLLBACK');
      const err = new Error('Parrainage introuvable.'); err.code = 'NOT_FOUND'; throw err;
    }
    const use = useRows[0];
    if (use.status !== 'pending') {
      await client.query('ROLLBACK');
      const err = new Error('Parrainage déjà traité.'); err.code = 'ALREADY_HANDLED'; throw err;
    }

    const { rows: progRows } = await client.query(
      `SELECT is_enabled, parrain_type, parrain_value
         FROM referral_programs WHERE user_id=$1`,
      [userId]
    );
    if (!progRows.length) {
      await client.query('ROLLBACK');
      const err = new Error('Programme parrainage absent.'); err.code = 'NO_PROGRAM'; throw err;
    }
    const prog = progRows[0];
    // Un programme désactivé n'empêche pas de valider un parrainage initié
    // avant la désactivation (scénario 4 onboarding).

    // Lire durée de validité (par défaut 60 jours, configurable si besoin futur)
    const validityDays = 60;

    // Générer un code promo unique PARRAIN-XXXXXX
    const rand = () => Math.random().toString(36).slice(2,8).toUpperCase();
    const code = `PARRAIN-${rand()}`;
    const { rows: promo } = await client.query(
      `INSERT INTO promo_codes
         (user_id, code, type, value, max_uses, valid_from, valid_until,
          is_active, target_clients, owner_client_email)
       VALUES ($1,$2,$3,$4,1,CURRENT_DATE, CURRENT_DATE + ($5 || ' days')::INTERVAL,
               TRUE,'specific',$6)
       RETURNING id, valid_until`,
      [userId, code, prog.parrain_type, prog.parrain_value,
       String(validityDays), use.parrain_email]
    );

    await client.query(
      `UPDATE referral_uses
          SET status='validated', validated_at=NOW(), parrain_promo_id=$2
        WHERE id=$1`,
      [use.id, promo[0].id]
    );
    await client.query(
      `UPDATE referral_codes SET uses_count = uses_count + 1 WHERE id=$1`,
      [use.referral_code_id]
    );
    // expires_at = jour APRÈS valid_until (aligne avec le check backend
    // `valid_until >= CURRENT_DATE` qui reste valide jusqu'à minuit UTC
    // du jour suivant). Évite "expiré" visuel trop tôt en timezone locale.
    await client.query(
      `INSERT INTO client_rewards
         (user_id, client_email, reward_type, status, promo_code_id, expires_at, referral_use_id)
       VALUES ($1,$2,'referral_parrain','available',$3, (CURRENT_DATE + ($4 || ' days')::INTERVAL)::timestamptz, $5)`,
      [userId, use.parrain_email, promo[0].id, String(validityDays + 1), use.id]
    );

    await client.query('COMMIT');

    // Email parrain (non bloquant, hors transaction)
    try {
      const { rows: bizRows } = await pool.query(
        `SELECT business_name, email, phone, address FROM users WHERE id=$1`,
        [userId]
      );
      const { rows: parrainRows } = await pool.query(
        `SELECT first_name, last_name FROM client_accounts
          WHERE user_id=$1 AND LOWER(email)=LOWER($2)`,
        [userId, use.parrain_email]
      );
      const { rows: filleulRows } = await pool.query(
        `SELECT first_name, last_name FROM client_accounts
          WHERE user_id=$1 AND LOWER(email)=LOWER($2)`,
        [userId, use.filleul_email]
      );
      const parrainName = parrainRows[0] ? [parrainRows[0].first_name, parrainRows[0].last_name].filter(Boolean).join(' ') : null;
      const filleulName = filleulRows[0] ? [filleulRows[0].first_name, filleulRows[0].last_name].filter(Boolean).join(' ') : null;
      const biz = bizRows[0] || {};
      const { sendReferralReward } = require('../utils/email');
      await sendReferralReward({
        to: use.parrain_email,
        parrainName, filleulName,
        businessName: biz.business_name || 'Votre commerçant',
        code, type: prog.parrain_type, value: prog.parrain_value,
        validUntil: promo[0].valid_until,
        businessEmail: biz.email, businessPhone: biz.phone, businessAddress: biz.address,
      });
    } catch (mailErr) {
      console.warn('[referral validate mail]', mailErr.message);
    }

    return { ok: true, code, promo_id: promo[0].id };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch(_) {}
    throw e;
  } finally { client.release(); }
}

// ── GET /api/referrals/stats — stats agrégées parrainage (commerçant) ────
// Retourne : codes générés, uses par statut, remise filleul totale, récompenses
// parrain totales, top 5 parrains actifs.
merchantRouter.get('/stats', async (req, res) => {
  try {
    const userId = req.user.userId;
    const [codesR, usesR, discountR, topR] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total_codes,
                COALESCE(SUM(uses_count),0)::int AS total_uses_all
           FROM referral_codes WHERE user_id=$1`,
        [userId]
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS n
           FROM referral_uses WHERE user_id=$1
          GROUP BY status`,
        [userId]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(
             CASE WHEN ru.appointment_id IS NOT NULL
                  THEN a.discount_amount ELSE 0 END
           ),0)::numeric
           + COALESCE(SUM(
             CASE WHEN ru.transaction_id IS NOT NULL
                  THEN t.discount_amount ELSE 0 END
           ),0)::numeric AS filleul_discount_total
         FROM referral_uses ru
         LEFT JOIN appointments a ON a.id = ru.appointment_id
         LEFT JOIN transactions t ON t.id = ru.transaction_id
         WHERE ru.user_id=$1`,
        [userId]
      ),
      pool.query(
        `SELECT rc.owner_client_email, pca.first_name, pca.last_name,
                COUNT(ru.id) FILTER (WHERE ru.status='validated')::int AS validated,
                COUNT(ru.id) FILTER (WHERE ru.status='pending')::int   AS pending
           FROM referral_codes rc
           LEFT JOIN referral_uses ru ON ru.referral_code_id = rc.id
           LEFT JOIN client_accounts pca
                  ON pca.user_id = rc.user_id
                 AND LOWER(pca.email) = LOWER(rc.owner_client_email)
          WHERE rc.user_id=$1
          GROUP BY rc.owner_client_email, pca.first_name, pca.last_name
          HAVING COUNT(ru.id) > 0
          ORDER BY validated DESC, pending DESC
          LIMIT 5`,
        [userId]
      ),
    ]);
    const byStatus = { pending: 0, validated: 0, cancelled: 0 };
    for (const r of usesR.rows) byStatus[r.status] = r.n;
    res.json({
      total_codes:            codesR.rows[0]?.total_codes || 0,
      uses_pending:           byStatus.pending,
      uses_validated:         byStatus.validated,
      uses_cancelled:         byStatus.cancelled,
      filleul_discount_total: parseFloat(discountR.rows[0]?.filleul_discount_total || 0),
      top_parrains: topR.rows.map(r => ({
        email:      r.owner_client_email,
        first_name: r.first_name,
        last_name:  r.last_name,
        validated:  r.validated,
        pending:    r.pending,
      })),
    });
  } catch (e) {
    console.error('[REF STATS]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/referrals/check — pré-validation côté caisse commerçant ────
// Utilisé par la caisse pour afficher la remise parrainage AVANT de valider
// la transaction. Body: { code, filleul_email, amount }.
merchantRouter.post('/check', async (req, res) => {
  try {
    const { code, filleul_email, amount } = req.body || {};
    const out = await resolveReferralForFilleul(
      req.user.userId, code, filleul_email, amount || 0
    );
    if (!out.ok) return res.status(200).json({ valid: false, reason: out.reason });
    res.json({
      valid:          true,
      discount_type:  out.filleul_type,
      discount_value: out.filleul_value,
      discount:       out.discount,
      parrain_email:  out.parrainEmail,
    });
  } catch (e) {
    console.error('[REF CHECK]', e.message);
    res.status(500).json({ valid: false, error: e.message });
  }
});

// ── POST /api/referrals/uses/:id/validate — validation en caisse ───────────
// L'employé confirme que le filleul est bien venu → on émet la promo parrain
// + on envoie l'email au parrain + on enregistre une ligne client_rewards.
merchantRouter.post('/uses/:id/validate', async (req, res) => {
  try {
    const out = await validateReferralUse(req.params.id, req.user.userId);
    res.json(out);
  } catch (e) {
    if (e.code === 'NOT_FOUND')       return res.status(404).json({ error: e.message });
    if (e.code === 'ALREADY_HANDLED') return res.status(409).json({ error: e.message });
    if (e.code === 'NO_PROGRAM')      return res.status(409).json({ error: e.message });
    console.error('[REF VALIDATE]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/referrals/uses/:id/cancel — refuser un parrainage en attente ─
// L'employé peut refuser un parrainage suspect (ex : filleul déjà connu,
// fraude). Passe status='cancelled', aucune récompense émise, la réduction
// filleul déjà appliquée au RDV n'est pas restituée (le RDV reste tel quel).
merchantRouter.post('/uses/:id/cancel', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE referral_uses
          SET status='cancelled'
        WHERE id=$1 AND user_id=$2 AND status='pending'
        RETURNING id`,
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Parrainage introuvable ou déjà traité.' });
    res.json({ ok: true });
  } catch (e) { console.error('[REF CANCEL]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── POST /api/referrals/rewards/:id/use — marquer reward comme utilisée ────
// Appelé par la caisse après l'encaissement pour tracer l'utilisation d'une
// réduction (status → 'used'). N'affecte pas le promo_code lui-même (déjà géré
// par promo_usage_logs).
merchantRouter.post('/rewards/:id/use', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE client_rewards
          SET status='used', used_at=NOW()
        WHERE id=$1 AND user_id=$2 AND status='available'
        RETURNING id`,
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Réduction introuvable ou déjà utilisée.' });
    res.json({ ok: true });
  } catch (e) { console.error('[REF REWARD USE]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── Helper interne : résout un code parrainage pour un filleul donné ─────
// Vérifie programme activé, code existant, filleul ≠ parrain, filleul nouveau
// (jamais eu de RDV ni transaction chez ce commerçant), quota parrain OK.
// Renvoie { ok, reason?, refCodeId, parrainEmail, filleulEmail, filleul_type,
//   filleul_value, discount } — discount calculé sur baseAmount.
async function resolveReferralForFilleul(userId, rawCode, filleulEmailRaw, baseAmount) {
  const out = { ok: false };
  if (!rawCode || !filleulEmailRaw) { out.reason = 'missing_params'; return out; }
  const code    = String(rawCode).trim().toUpperCase();
  const filEmail = String(filleulEmailRaw).trim().toLowerCase();
  // Regex stricte : avant, .includes('@') laissait passer "a@b@c" ou "@x"
  // (potentiellement exploité en ILIKE aval si l'email était réinjecté).
  const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
  if (!code || !EMAIL_RE.test(filEmail) || filEmail.length > 254) {
    out.reason = 'bad_input';
    return out;
  }

  const { rows: prog } = await pool.query(
    `SELECT is_enabled, filleul_type, filleul_value, limit_count, limit_period
       FROM referral_programs WHERE user_id=$1`, [userId]
  );
  if (!prog.length || !prog[0].is_enabled) { out.reason = 'program_disabled'; return out; }

  const { rows: rc } = await pool.query(
    `SELECT id, owner_client_email FROM referral_codes
      WHERE user_id=$1 AND code=$2`, [userId, code]
  );
  if (!rc.length) { out.reason = 'code_not_found'; return out; }
  if (rc[0].owner_client_email.toLowerCase() === filEmail) { out.reason = 'self_referral'; return out; }

  // Filleul ne doit jamais être venu — RDV honoré (pas cancelled/no_show)
  // OU transaction caisse ACTIVE (non-supprimée, mais pas de status sur tx,
  // donc toute tx revenue compte). Un RDV annulé n'a pas de "venue" effective
  // → on laisse passer pour permettre une 2e chance au parrainage.
  const { rows: prevAppt } = await pool.query(
    `SELECT 1 FROM appointments
      WHERE user_id=$1 AND LOWER(client_email)=$2
        AND status NOT IN ('cancelled','no_show')
      LIMIT 1`,
    [userId, filEmail]
  );
  const { rows: prevTx } = await pool.query(
    `SELECT 1 FROM transactions
      WHERE user_id=$1 AND LOWER(client_email)=$2 AND type IN ('income','revenue')
      LIMIT 1`,
    [userId, filEmail]
  );
  if (prevAppt.length || prevTx.length) { out.reason = 'filleul_not_new'; return out; }

  // Un parrainage déjà "actif" (pending/validated) bloque. Les cancelled
  // ne comptent pas — le filleul peut être re-parrainé après un refus.
  const { rows: existing } = await pool.query(
    `SELECT 1 FROM referral_uses
      WHERE user_id=$1 AND LOWER(filleul_email)=$2
        AND status IN ('pending','validated') LIMIT 1`,
    [userId, filEmail]
  );
  if (existing.length) { out.reason = 'already_parraine'; return out; }

  // Quota parrain — compte les validated ET les pending RÉCENTS (< 30j).
  // Les pending anciens (filleul no-show silencieux non-cancel) ne pénalisent
  // plus le parrain éternellement.
  const lp = prog[0].limit_period || 'unlimited';
  const lc = prog[0].limit_count;
  if (lp !== 'unlimited' && lc != null && lc > 0) {
    const ownerEmail = rc[0].owner_client_email.toLowerCase();
    let dateClause = '';
    if (lp === 'month')        dateClause = "AND ru.created_at >= date_trunc('month', NOW())";
    else if (lp === '3months') dateClause = "AND ru.created_at >= NOW() - INTERVAL '90 days'";
    else if (lp === 'year')    dateClause = "AND ru.created_at >= date_trunc('year', NOW())";
    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM referral_uses ru
         JOIN referral_codes rcc ON rcc.id = ru.referral_code_id
        WHERE ru.user_id=$1 AND LOWER(rcc.owner_client_email)=$2
          AND (
            ru.status = 'validated'
            OR (ru.status = 'pending' AND ru.created_at > NOW() - INTERVAL '30 days')
          ) ${dateClause}`,
      [userId, ownerEmail]
    );
    if (cnt[0].n >= lc) { out.reason = 'quota_exceeded'; return out; }
  }

  const ft = prog[0].filleul_type;
  const fv = parseFloat(prog[0].filleul_value);
  const base = parseFloat(baseAmount) || 0;
  const discount = ft === 'percent'
    ? Math.min(base, base * fv / 100)
    : Math.min(base, fv);

  out.ok            = true;
  out.refCodeId     = rc[0].id;
  out.parrainEmail  = rc[0].owner_client_email;
  out.filleulEmail  = filEmail;
  out.filleul_type  = ft;
  out.filleul_value = fv;
  out.discount      = Math.round(discount * 100) / 100;
  return out;
}

// ── Helper interne : cascade d'annulation d'un RDV vers son referral_use
// Appelé par toutes les routes qui passent un appointment en status='cancelled'
// (merchant, employé, client, public). Ne touche que les pending — les parrainages
// déjà validés (promo parrain émise) ne doivent pas être annulés retroactivement.
async function cancelReferralUseByAppt(userId, appointmentId) {
  try {
    await pool.query(
      `UPDATE referral_uses SET status='cancelled'
        WHERE user_id=$1 AND appointment_id=$2 AND status='pending'`,
      [userId, appointmentId]
    );
  } catch (e) {
    console.warn('[REF cascade cancel]', e.message);
  }
}

module.exports = merchantRouter;
module.exports.genReferralCode           = genReferralCode;
module.exports.validateReferralUse       = validateReferralUse;
module.exports.resolveReferralForFilleul = resolveReferralForFilleul;
module.exports.cancelReferralUseByAppt   = cancelReferralUseByAppt;
