const { pool } = require('../../db');

module.exports = function attachGoogleRatingRoute(router) {
  // ── GET /api/pub/:slug/google-rating ──────────────────────────────────────
  // Récupère la note Google Business réelle (Places API Text Search).
  // Requiert GOOGLE_PLACES_API_KEY. Cache 6h pour limiter la facturation.
  // Réponse : { found: true, rating, total_ratings, place_id } OU { found: false }
  router.get('/:slug/google-rating', async (req, res) => {
    try {
      const cacheKey = `grating:${req.params.slug}`;
      const hit = global.memCache?.get(cacheKey);
      if (hit) return res.json(hit);

      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.json({ found: false, reason: 'api_not_configured' });

      // Charger infos commerçant (users table = source unique)
      const { rows } = await pool.query(
        `SELECT u.business_name, u.address AS addr, u.city, u.postal_code, u.google_business_url
         FROM booking_settings bs
         JOIN users u ON u.id = bs.user_id
         WHERE bs.slug = $1 AND bs.is_enabled = TRUE`,
        [req.params.slug]
      );
      if (!rows.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const b = rows[0];
      if (!b.google_business_url) return res.json({ found: false, reason: 'no_google_url' });
      if (!b.business_name) return res.json({ found: false, reason: 'no_business_name' });

      // Recherche texte : nom du commerce + ville/CP/adresse (aide Google à localiser)
      const query = [b.business_name, b.addr, b.postal_code, b.city].filter(Boolean).join(' ');
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=fr&key=${apiKey}`;

      const https = require('https');
      const data = await new Promise((resolve, reject) => {
        https.get(url, r => {
          const chunks = [];
          r.on('data', c => chunks.push(c));
          r.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
            catch (e) { reject(e); }
          });
          r.on('error', reject);
        }).on('error', reject);
      });

      const first = data?.results?.[0];
      if (!first || typeof first.rating !== 'number') {
        const notFound = { found: false, reason: 'no_result' };
        global.memCache?.set(cacheKey, notFound, 30 * 60 * 1000); // cache 30 min même les échecs
        return res.json(notFound);
      }

      const resp = {
        found: true,
        rating:        Number(first.rating),
        total_ratings: Number(first.user_ratings_total || 0),
        place_id:      first.place_id || null,
      };
      global.memCache?.set(cacheKey, resp, 6 * 60 * 60 * 1000); // 6 heures
      res.json(resp);
    } catch (e) {
      console.error('[google-rating]', e.message);
      res.json({ found: false, reason: 'error' });
    }
  });
};
