// src/routes/booking/slug.js — Vérification de disponibilité d'un slug
// Route publique (AVANT authMiddleware) : utilisée par l'admin connecté OU sans auth.
const { pool } = require('../../db');

module.exports = function attachSlugRoutes(router) {
  // GET /api/booking/check-slug?slug=mon-salon
  router.get('/check-slug', async (req, res) => {
    try {
      const { slug } = req.query;
      if (!slug) return res.status(400).json({ error: 'Slug manquant.' });

      // Validation format
      if (slug.length < 3)
        return res.json({ available: false, reason: 'too_short', message: 'Minimum 3 caractères requis.' });
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]{3,}$/.test(slug))
        return res.json({ available: false, reason: 'invalid_chars', message: 'Uniquement lettres minuscules, chiffres et tirets. Ne peut pas commencer ou finir par un tiret.' });
      if (/--/.test(slug))
        return res.json({ available: false, reason: 'invalid_chars', message: 'Deux tirets consécutifs non autorisés.' });

      // Mots réservés
      const RESERVED = ['admin','api','app','www','mail','ftp','booking','book','login','register','dashboard','settings','static','assets','null','undefined','test','demo','dev'];
      if (RESERVED.includes(slug))
        return res.json({ available: false, reason: 'reserved', message: `"${slug}" est un nom réservé, veuillez en choisir un autre.` });

      // Récupérer l'userId depuis le token si présent (optionnel — pour exclure le proprio)
      let userId = null;
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
          userId = decoded.userId;
        }
      } catch (_) { /* token absent ou invalide → userId reste null */ }

      const query  = userId
        ? 'SELECT user_id FROM booking_settings WHERE slug=$1 AND user_id!=$2'
        : 'SELECT user_id FROM booking_settings WHERE slug=$1';
      const params = userId ? [slug, userId] : [slug];
      const { rows } = await pool.query(query, params);

      if (rows.length)
        return res.json({ available: false, reason: 'taken', message: 'Cette adresse de page est déjà utilisée. Merci de modifier votre lien.' });

      res.json({ available: true, slug });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
