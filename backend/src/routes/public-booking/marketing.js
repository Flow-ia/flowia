const { pool } = require('../../db');

// Audit Z (RGPD) : unsubscribe + opt-in 1-clic via email transactionnel
// Token = UUID stocké en DB sur client_accounts et global_clients.
// HTML autonome (inline CSS) pour fonctionner sans frontend opérationnel.
// Conformité CNIL : accès sans auth requis, effet immédiat, visible.
//
// Commit 26 — content-negotiation : si Accept: application/json (page React
// FDS-2026 /unsubscribe?token=...), on renvoie JSON {ok,status,...}. Sinon
// HTML inline (rétrocompatibilité anciens emails). Le UPDATE + log audit
// `marketing_optout_log` se fait dans les deux cas.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function wantsJson(req) {
  const accept = String(req.headers['accept'] || '').toLowerCase();
  return accept.includes('application/json');
}

function htmlResponder(res) {
  return (title, body, ok = true) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(ok ? 200 : 404).send(
      `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
       <meta name="viewport" content="width=device-width,initial-scale=1"/>
       <title>${title}</title>
       <style>body{font-family:system-ui,-apple-system,sans-serif;background:#f8f9fc;
       margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
       .card{background:#fff;max-width:420px;padding:32px;border-radius:16px;
       box-shadow:0 2px 20px rgba(0,0,0,0.06);text-align:center}
       h1{font-size:22px;color:#111;margin:0 0 12px}
       p{color:#555;line-height:1.5;font-size:14px;margin:0 0 16px}
       .ok{color:#16a34a;font-size:32px;margin-bottom:8px}
       .ko{color:#dc2626;font-size:32px;margin-bottom:8px}
       </style></head><body><div class="card">${body}</div></body></html>`
    );
  };
}

// Insère une ligne d'audit dans marketing_optout_log. Best-effort : un
// échec d'audit ne doit jamais bloquer la désinscription du client.
async function logOptout({ userId, clientAccountId, globalClientId, email, source, ip, userAgent }) {
  try {
    await pool.query(
      `INSERT INTO marketing_optout_log
         (user_id, client_account_id, global_client_id, email, source, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId || null, clientAccountId || null, globalClientId || null,
       email || null, source || 'email_link', ip || null, userAgent || null]
    );
  } catch (e) {
    console.error('[OPTOUT LOG]', e.message);
  }
}

module.exports = function attachMarketingRoutes(router) {
  // GET /api/pub/unsubscribe/:token → désinscription marketing immédiate
  router.get('/unsubscribe/:token', async (req, res) => {
    const token = String(req.params.token || '').trim();
    const renderHtml = htmlResponder(res);
    const json = wantsJson(req);
    const sourceParam = String(req.query.source || '').trim();
    const source = ['email_link','sms_link','public_form','admin_action','api'].includes(sourceParam)
      ? sourceParam : 'email_link';

    if (!UUID_RE.test(token)) {
      if (json) return res.status(400).json({ ok: false, status: 'invalid' });
      return renderHtml('Lien invalide', '<div class="ko">⚠️</div><h1>Lien invalide</h1><p>Ce lien de désabonnement n\'est pas valide.</p>', false);
    }
    try {
      // SELECT pour récupérer email/ids/businessName avant UPDATE (pour audit + UI)
      const { rows: caRows } = await pool.query(
        `SELECT ca.id, ca.user_id, ca.email, u.business_name
           FROM client_accounts ca
           LEFT JOIN users u ON u.id = ca.user_id
          WHERE ca.unsubscribe_token = $1 LIMIT 1`, [token]
      );
      const { rows: gcRows } = await pool.query(
        `SELECT id, email FROM global_clients WHERE unsubscribe_token = $1 LIMIT 1`, [token]
      );

      const { rowCount: c1 } = await pool.query(
        `UPDATE client_accounts SET marketing_opt_in = FALSE, marketing_opt_in_at = NULL
           WHERE unsubscribe_token = $1`, [token]
      );
      const { rowCount: c2 } = await pool.query(
        `UPDATE global_clients SET marketing_opt_in = FALSE, marketing_opt_in_at = NULL
           WHERE unsubscribe_token = $1`, [token]
      );

      const totalUpdated = c1 + c2;
      const ip = req.ip || req.headers['x-forwarded-for'] || null;
      const userAgent = req.get('user-agent') || null;
      const email = caRows[0]?.email || gcRows[0]?.email || null;
      const businessName = caRows[0]?.business_name || null;

      // Audit RGPD : log uniquement si on a trouvé un client (token valide).
      // Idempotent : 2 clics = 2 lignes (preuve de chaque tentative).
      if (caRows[0] || gcRows[0]) {
        await logOptout({
          userId: caRows[0]?.user_id,
          clientAccountId: caRows[0]?.id,
          globalClientId: gcRows[0]?.id,
          email, source, ip, userAgent,
        });
      }

      if (totalUpdated === 0) {
        if (json) return res.json({ ok: true, status: 'already', email, business_name: businessName });
        return renderHtml('Déjà désinscrit', '<div class="ok">✓</div><h1>Désinscription déjà effective</h1><p>Vous ne recevrez plus d\'offres commerciales.</p>');
      }
      if (json) return res.json({ ok: true, status: 'unsubscribed', email, business_name: businessName });
      return renderHtml('Désinscrit', '<div class="ok">✓</div><h1>Désinscription confirmée</h1><p>Vous ne recevrez plus d\'emails ni SMS commerciaux. Vos notifications de rendez-vous (confirmations, rappels) ne sont pas affectées.</p>');
    } catch (e) {
      console.error('[UNSUBSCRIBE]', e.message);
      if (json) return res.status(500).json({ ok: false, status: 'error' });
      return renderHtml('Erreur', '<div class="ko">⚠️</div><h1>Erreur temporaire</h1><p>Merci de réessayer dans quelques instants.</p>', false);
    }
  });

  // GET /api/pub/opt-in/:token → inscription 1-clic (pendant de /unsubscribe)
  router.get('/opt-in/:token', async (req, res) => {
    const token = String(req.params.token || '').trim();
    const renderHtml = htmlResponder(res);
    const json = wantsJson(req);
    if (!UUID_RE.test(token)) {
      if (json) return res.status(400).json({ ok: false, status: 'invalid' });
      return renderHtml('Lien invalide', '<div class="ko">⚠️</div><h1>Lien invalide</h1><p>Ce lien d\'inscription aux offres n\'est pas valide.</p>', false);
    }
    try {
      const { rowCount: c1 } = await pool.query(
        `UPDATE client_accounts SET marketing_opt_in = TRUE, marketing_opt_in_at = NOW()
           WHERE unsubscribe_token = $1`, [token]
      );
      const { rowCount: c2 } = await pool.query(
        `UPDATE global_clients SET marketing_opt_in = TRUE, marketing_opt_in_at = NOW()
           WHERE unsubscribe_token = $1`, [token]
      );
      if (c1 + c2 === 0) {
        if (json) return res.status(404).json({ ok: false, status: 'invalid' });
        return renderHtml('Lien invalide', '<div class="ko">⚠️</div><h1>Lien invalide</h1><p>Ce lien n\'est pas reconnu ou a expiré.</p>', false);
      }
      if (json) return res.json({ ok: true, status: 'opted_in' });
      return renderHtml('Inscrit', '<div class="ok">✓</div><h1>Merci !</h1><p>Vous recevrez désormais les offres commerciales. Vous pourrez vous désinscrire à tout moment via le lien présent dans chaque message.</p>');
    } catch (e) {
      console.error('[OPT-IN]', e.message);
      if (json) return res.status(500).json({ ok: false, status: 'error' });
      return renderHtml('Erreur', '<div class="ko">⚠️</div><h1>Erreur temporaire</h1><p>Merci de réessayer dans quelques instants.</p>', false);
    }
  });
};
