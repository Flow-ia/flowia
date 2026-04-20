const { pool } = require('../../db');

module.exports = function attachPromoRoutes(router) {
  // ── GET /:slug/promo/check?code=XXX&amount=YYY ── validation publique ──
  router.get('/:slug/promo/check', async (req, res) => {
    try {
      const { code, amount } = req.query;
      if (!code) return res.json({ valid: false, error: 'Code requis.' });

      // Récupérer user_id du commerce
      const { rows: biz } = await pool.query(
        `SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE`,
        [req.params.slug]
      );
      if (!biz.length) return res.json({ valid: false, error: 'Commerce introuvable.' });
      const userId = biz[0].user_id;

      const { rows } = await pool.query(
        `SELECT * FROM promo_codes
         WHERE user_id=$1 AND UPPER(code)=UPPER($2) AND is_active=TRUE
           AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
           AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
           AND (max_uses IS NULL OR uses_count < max_uses)`,
        [userId, code.trim()]
      );
      if (!rows.length) return res.json({ valid: false, error: 'Code invalide ou expiré.' });

      const promo     = rows[0];
      const baseAmt   = parseFloat(amount) || 0;
      const discount  = promo.type === 'percent'
        ? Math.min(baseAmt, baseAmt * parseFloat(promo.value) / 100)
        : Math.min(baseAmt, parseFloat(promo.value));

      res.json({
        valid:    true,
        promo_id: promo.id,
        type:     promo.type,
        value:    parseFloat(promo.value),
        discount: Math.round(discount * 100) / 100,
      });
    } catch(e) { res.status(500).json({ valid: false, error: e.message }); }
  });

  // ── POST /:slug/check-promo ── Valider un code promo côté public ────────
  router.post('/:slug/check-promo', async (req, res) => {
    try {
      const { rows: biz } = await pool.query(
        `SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE`,
        [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const userId = biz[0].user_id;

      const { code, amount } = req.body;
      if (!code) return res.status(400).json({ valid: false, error: 'Code requis.' });

      const { rows } = await pool.query(
        `SELECT * FROM promo_codes
         WHERE user_id=$1 AND UPPER(code)=UPPER($2) AND is_active=TRUE
           AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
           AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
           AND (max_uses IS NULL OR uses_count < max_uses)`,
        [userId, code.trim()]
      );
      if (!rows.length) {
        const { rows: expired } = await pool.query(
          `SELECT is_active, valid_until, uses_count, max_uses FROM promo_codes WHERE user_id=$1 AND UPPER(code)=UPPER($2)`,
          [userId, code.trim()]
        );
        if (expired.length) {
          const e = expired[0];
          if (!e.is_active) return res.json({ valid: false, error: 'Ce code a été désactivé.' });
          if (e.valid_until && new Date(e.valid_until) < new Date()) return res.json({ valid: false, error: `Ce code a expiré le ${new Date(e.valid_until).toLocaleDateString('fr-FR')}.` });
          if (e.max_uses && e.uses_count >= e.max_uses) return res.json({ valid: false, error: 'Ce code a déjà été utilisé le nombre maximum de fois.' });
        }
        return res.json({ valid: false, error: 'Code invalide ou inconnu.' });
      }

      const promo = rows[0];
      const { client_email } = req.body;
      const baseAmt = parseFloat(amount) || 0;

      // Vérifier owner pour codes fidélité
      if (promo.is_loyalty_reward && promo.owner_client_email && client_email) {
        if (promo.owner_client_email.toLowerCase() !== client_email.toLowerCase()) {
          return res.json({ valid: false, error: `Ce code de fidélité appartient à un autre client et ne peut pas être utilisé ici.` });
        }
      }

      // Vérifier montant minimum d'achat
      const minPurchase = parseFloat(promo.min_purchase) || 0;
      if (minPurchase > 0 && baseAmt > 0 && baseAmt < minPurchase) {
        return res.json({ valid: false, error: `Ce code nécessite un minimum d'achat de ${minPurchase.toFixed(2)} €. Montant actuel : ${baseAmt.toFixed(2)} €.` });
      }

      const discount = promo.type === 'percent'
        ? Math.min(baseAmt, baseAmt * parseFloat(promo.value) / 100)
        : Math.min(baseAmt, parseFloat(promo.value));

      res.json({
        valid:    true,
        promo_id: promo.id,
        type:     promo.type,
        value:    parseFloat(promo.value),
        min_purchase: minPurchase,
        discount: Math.round(discount * 100) / 100,
      });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
};
