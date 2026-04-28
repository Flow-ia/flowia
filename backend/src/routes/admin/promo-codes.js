// routes/admin/promo-codes.js — Gestion super-admin des codes promo par
// commerçant. Liste / activer / désactiver / supprimer / batch delete par
// catégorie. Toutes les actions sont auditées (admin_audit_log).
//
// Catégories distinguées sur promo_codes (déduites en SQL via CASE) :
//   - loyalty       : is_loyalty_reward = TRUE  (codes FIDEL-XXXXX)
//   - birthday      : code LIKE 'BDAY-%'         (offre anniversaire)
//   - referral      : référencé par referral_uses.parrain_promo_id
//                     ou referral_uses.filleul_promo_id
//   - sms_campaign  : référencé par campaigns.promo_code_id WHERE channel='sms'
//   - manual        : tous les autres (promos saisies à la main par le
//                     commerçant pour ses clients)
//
// Multi-tenant : chaque endpoint scope toutes ses requêtes par user_id =
// merchantId pour garantir qu'un code d'un autre commerçant ne soit ni
// visible, ni modifiable depuis cette interface admin.
//
// Suppression définitive : nettoyage chirurgical des FK avant DELETE
// promo_codes (client_rewards CASCADE/manuel + NULL sur referral_uses /
// campaigns / ai_campaign_codes pour préserver l'audit historique).

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');
const { logAuditAction } = require('../../services/adminAudit');

const router = express.Router({ mergeParams: true });
router.use(adminAuth);

const VALID_CATEGORIES = new Set(['loyalty', 'birthday', 'referral', 'sms_campaign', 'manual']);

// Sous-requête CASE qui calcule la catégorie d'une ligne promo_codes.
// Réutilisée dans GET / et DELETE batch.
const CATEGORY_CASE = `
  CASE
    WHEN pc.is_loyalty_reward = TRUE THEN 'loyalty'
    WHEN pc.code LIKE 'BDAY-%' THEN 'birthday'
    WHEN EXISTS (
      SELECT 1 FROM referral_uses ru
       WHERE ru.parrain_promo_id = pc.id OR ru.filleul_promo_id = pc.id
    ) THEN 'referral'
    WHEN EXISTS (
      SELECT 1 FROM campaigns c
       WHERE c.promo_code_id = pc.id AND c.channel = 'sms'
    ) THEN 'sms_campaign'
    ELSE 'manual'
  END
`;

// ── GET / — liste paginée + filtres catégorie/status/search ────────────────
// Query : category (loyalty|birthday|referral|sms_campaign|manual|all),
//         status (all|active|inactive), search, limit (max 200), offset.
// Réponse : { rows, total, counts_by_category }.
router.get('/', async (req, res) => {
  const merchantId = req.params.merchantId;
  const limit  = Math.min(parseInt(req.query.limit, 10)  || 50, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const category = String(req.query.category || 'all').toLowerCase();
  const status   = String(req.query.status   || 'all').toLowerCase();
  const search   = String(req.query.search   || '').trim();

  if (!merchantId) return res.status(400).json({ error: 'merchantId requis.' });
  if (category !== 'all' && !VALID_CATEGORIES.has(category))
    return res.status(400).json({ error: 'Catégorie invalide.' });

  try {
    // 1. Sanity check : commerçant existe.
    const { rows: u } = await pool.query(
      'SELECT id, business_name, email FROM users WHERE id=$1',
      [merchantId]
    );
    if (!u.length) return res.status(404).json({ error: 'Commerçant introuvable.' });

    const where = ['pc.user_id = $1'];
    const params = [merchantId];

    if (status === 'active')    where.push('pc.is_active = TRUE');
    if (status === 'inactive')  where.push('pc.is_active = FALSE');

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`(LOWER(pc.code) LIKE $${params.length}
                OR LOWER(COALESCE(pc.owner_client_email,'')) LIKE $${params.length})`);
    }

    if (category !== 'all') {
      params.push(category);
      where.push(`(${CATEGORY_CASE}) = $${params.length}`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const { rows: total } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM promo_codes pc ${whereSql}`,
      params
    );

    const { rows: countsByCat } = await pool.query(
      `SELECT ${CATEGORY_CASE} AS category, COUNT(*)::int AS n
         FROM promo_codes pc
        WHERE pc.user_id = $1
        GROUP BY 1`,
      [merchantId]
    );
    const counts_by_category = countsByCat.reduce((acc, r) => {
      acc[r.category] = r.n; return acc;
    }, {});

    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT pc.id, pc.code, pc.type, pc.value,
              pc.max_uses, pc.uses_count,
              pc.valid_from, pc.valid_until,
              pc.is_active, pc.is_loyalty_reward,
              pc.owner_client_email, pc.target_clients,
              pc.min_purchase, pc.created_at,
              ${CATEGORY_CASE} AS category
         FROM promo_codes pc
         ${whereSql}
         ORDER BY pc.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      total: total[0].n,
      rows,
      counts_by_category,
      merchant: { id: u[0].id, business_name: u[0].business_name, email: u[0].email },
    });
  } catch (e) {
    console.error('[admin/promo-codes list]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── PATCH /:codeId/activate ─ réactiver un code (is_active=TRUE) ────────────
router.patch('/:codeId/activate', async (req, res) => {
  const merchantId = req.params.merchantId;
  const codeId     = req.params.codeId;
  try {
    const { rows: before } = await pool.query(
      'SELECT id, code, is_active FROM promo_codes WHERE id=$1 AND user_id=$2',
      [codeId, merchantId]
    );
    if (!before.length) return res.status(404).json({ error: 'Code introuvable.' });

    const { rows } = await pool.query(
      `UPDATE promo_codes SET is_active = TRUE
        WHERE id=$1 AND user_id=$2
        RETURNING id, code, is_active`,
      [codeId, merchantId]
    );
    await logAuditAction({
      adminId: req.admin?.id, adminEmail: req.admin?.email,
      action: 'promo_code.activate',
      targetType: 'promo_code', targetId: codeId,
      payloadBefore: { is_active: before[0].is_active, code: before[0].code },
      payloadAfter:  { is_active: true,  merchant_id: merchantId },
      req,
    });
    return res.json(rows[0]);
  } catch (e) {
    console.error('[admin/promo-codes activate]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── PATCH /:codeId/deactivate ─ désactiver un code ──────────────────────────
router.patch('/:codeId/deactivate', async (req, res) => {
  const merchantId = req.params.merchantId;
  const codeId     = req.params.codeId;
  try {
    const { rows: before } = await pool.query(
      'SELECT id, code, is_active FROM promo_codes WHERE id=$1 AND user_id=$2',
      [codeId, merchantId]
    );
    if (!before.length) return res.status(404).json({ error: 'Code introuvable.' });

    const { rows } = await pool.query(
      `UPDATE promo_codes SET is_active = FALSE
        WHERE id=$1 AND user_id=$2
        RETURNING id, code, is_active`,
      [codeId, merchantId]
    );
    await logAuditAction({
      adminId: req.admin?.id, adminEmail: req.admin?.email,
      action: 'promo_code.deactivate',
      targetType: 'promo_code', targetId: codeId,
      payloadBefore: { is_active: before[0].is_active, code: before[0].code },
      payloadAfter:  { is_active: false, merchant_id: merchantId },
      req,
    });
    return res.json(rows[0]);
  } catch (e) {
    console.error('[admin/promo-codes deactivate]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Helper interne : nettoie les FK puis DELETE la ligne promo_codes.
// On NULL-out (au lieu de DELETE) sur referral_uses / campaigns / ai_campaign_codes
// pour préserver l'audit historique. client_rewards est purgé (réductions
// rattachées plus pertinentes une fois le code supprimé).
async function deletePromoCodeInternal(db, merchantId, codeId) {
  // client_rewards : DELETE en cascade fonctionnelle (la reward perdrait
  // son lien). On purge.
  await db.query(
    'DELETE FROM client_rewards WHERE user_id=$1 AND promo_code_id=$2',
    [merchantId, codeId]
  );
  // referral_uses : NULL-out parrain_promo_id / filleul_promo_id pour garder
  // la trace de la conversion.
  await db.query(
    `UPDATE referral_uses
        SET parrain_promo_id = NULL
      WHERE user_id=$1 AND parrain_promo_id=$2`,
    [merchantId, codeId]
  );
  await db.query(
    `UPDATE referral_uses
        SET filleul_promo_id = NULL
      WHERE user_id=$1 AND filleul_promo_id=$2`,
    [merchantId, codeId]
  );
  // campaigns : NULL-out pour conserver les stats d'envoi.
  await db.query(
    `UPDATE campaigns
        SET promo_code_id = NULL
      WHERE user_id=$1 AND promo_code_id=$2`,
    [merchantId, codeId]
  );
  // ai_campaign_codes : NULL-out (la traçabilité segment/sent reste).
  await db.query(
    `UPDATE ai_campaign_codes
        SET promo_code_id = NULL
      WHERE promo_code_id=$1`,
    [codeId]
  );
  // promo_usage_logs : on ne touche pas (audit historique des utilisations).
  // La FK se résout : si elle est ON DELETE CASCADE elle suit ; sinon elle
  // bloquera et on remontera l'erreur (le commerçant a effectivement utilisé
  // le code, le supprimer écraserait une trace comptable).

  const { rowCount } = await db.query(
    'DELETE FROM promo_codes WHERE id=$1 AND user_id=$2',
    [codeId, merchantId]
  );
  return rowCount > 0;
}

// ── DELETE /:codeId ─ supprimer définitivement un code ─────────────────────
router.delete('/:codeId', async (req, res) => {
  const merchantId = req.params.merchantId;
  const codeId     = req.params.codeId;
  const db = await pool.connect();
  try {
    const { rows: before } = await db.query(
      'SELECT id, code, type, value, is_active FROM promo_codes WHERE id=$1 AND user_id=$2',
      [codeId, merchantId]
    );
    if (!before.length) return res.status(404).json({ error: 'Code introuvable.' });

    await db.query('BEGIN');
    const ok = await deletePromoCodeInternal(db, merchantId, codeId);
    if (!ok) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Code introuvable au moment du DELETE.' });
    }
    await db.query('COMMIT');

    await logAuditAction({
      adminId: req.admin?.id, adminEmail: req.admin?.email,
      action: 'promo_code.delete',
      targetType: 'promo_code', targetId: codeId,
      payloadBefore: before[0],
      payloadAfter:  { deleted: true, merchant_id: merchantId },
      req,
    });
    return res.json({ ok: true, deleted: codeId });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('[admin/promo-codes delete]', e.message);
    // Si FK violation (promo_usage_logs avec ON DELETE RESTRICT par exemple)
    if (e.code === '23503') {
      return res.status(409).json({
        error: 'Suppression impossible : ce code est référencé dans des logs comptables. Désactivez-le plutôt.',
        code: 'PROMO_CODE_HAS_USAGE_LOGS',
      });
    }
    return res.status(500).json({ error: 'Erreur serveur.' });
  } finally {
    db.release();
  }
});

// ── DELETE / ─ batch delete par catégorie ──────────────────────────────────
// Query : category=loyalty|birthday|referral|sms_campaign|manual (REQUIS).
// Supprime tous les codes du commerçant dans cette catégorie. Échec partiel
// possible (FK comptables) : la réponse retourne deleted_count + failed_count.
router.delete('/', async (req, res) => {
  const merchantId = req.params.merchantId;
  const category   = String(req.query.category || '').toLowerCase();
  if (!VALID_CATEGORIES.has(category)) {
    return res.status(400).json({ error: 'Catégorie requise (loyalty|birthday|referral|sms_campaign|manual).' });
  }

  const db = await pool.connect();
  try {
    // Liste les ids matching la catégorie pour ce commerçant.
    const { rows: targets } = await db.query(
      `SELECT pc.id, pc.code
         FROM promo_codes pc
        WHERE pc.user_id = $1
          AND (${CATEGORY_CASE}) = $2`,
      [merchantId, category]
    );

    if (!targets.length) {
      return res.json({ ok: true, deleted_count: 0, failed_count: 0, category });
    }

    let deleted = 0;
    let failed  = 0;
    const failedIds = [];
    for (const t of targets) {
      try {
        await db.query('BEGIN');
        const ok = await deletePromoCodeInternal(db, merchantId, t.id);
        await db.query('COMMIT');
        if (ok) deleted++;
        else failed++;
      } catch {
        await db.query('ROLLBACK').catch(() => {});
        failed++;
        failedIds.push(t.id);
      }
    }

    await logAuditAction({
      adminId: req.admin?.id, adminEmail: req.admin?.email,
      action: 'promo_codes.delete_category',
      targetType: 'merchant', targetId: merchantId,
      payloadAfter: { category, deleted_count: deleted, failed_count: failed, failed_ids: failedIds },
      req,
    });

    return res.json({
      ok: true,
      category,
      deleted_count: deleted,
      failed_count: failed,
      failed_ids: failedIds,
    });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('[admin/promo-codes delete-category]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  } finally {
    db.release();
  }
});

module.exports = router;
