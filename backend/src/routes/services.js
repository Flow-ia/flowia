// routes/services.js — GET /api/services-for-edit (catalogue intelligent
// dual : walkin = caisse physique / appointment = catalogue réservation).
//
// Sert au dropdown du drawer édition d'une transaction côté /historique.
// Le bon catalogue dépend du contexte de la transaction :
//   - tx.appointment_id IS NOT NULL  → contexte 'appointment' → booking_services
//   - tx.appointment_id IS NULL      → contexte 'walkin'      → categories niveau 2
//                                       (parent_id IS NOT NULL, type='revenue')
//
// Renvoie une structure { services, categories } directement consommable par
// ServiceDropdown.jsx. Petit cache LRU 60s par (user_id, context) pour éviter
// de re-frapper la BDD à chaque ouverture du dropdown.

const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Cache léger en mémoire (TTL 60s). Pas d'invalidation explicite : si le
// commerçant édite ses catégories/services, le dropdown sera frais < 60s.
const CACHE = new Map();
const TTL_MS = 60 * 1000;
function cacheKey(userId, context) { return userId + ':' + context; }
function cacheGet(userId, context) {
  const e = CACHE.get(cacheKey(userId, context));
  if (!e) return null;
  if (Date.now() - e.t > TTL_MS) { CACHE.delete(cacheKey(userId, context)); return null; }
  return e.v;
}
function cacheSet(userId, context, v) {
  CACHE.set(cacheKey(userId, context), { v, t: Date.now() });
}

router.get('/services-for-edit', async (req, res) => {
  try {
    const userId = req.user.userId;
    const context = String(req.query.context || '').trim();
    if (context !== 'walkin' && context !== 'appointment') {
      return res.status(400).json({
        error: "Paramètre context invalide (attendu 'walkin' ou 'appointment').",
        code: 'INVALID_CONTEXT',
      });
    }

    const cached = cacheGet(userId, context);
    if (cached) return res.json(cached);

    let services;
    if (context === 'walkin') {
      // Catégories niveau 2 = vraies prestations vendables (parent_id IS NOT
      // NULL). On exclut type='expense' (charges / dépenses, pas vendables).
      // is_free_price : si TRUE, le caissier saisit un prix libre — le front
      // doit alors ne PAS auto-remplir unit_price depuis svc.price.
      // Note : la table `categories` n'a pas de colonne sort_order — on trie
      // par nom de catégorie parente puis nom de prestation pour un ordre
      // stable et prévisible côté frontend.
      const { rows } = await pool.query(
        `SELECT
           c.id,
           c.name                                                AS service_name,
           c.price,
           COALESCE(c.is_free_price, FALSE)                      AS is_free_price,
           parent.id                                             AS category_id,
           parent.name                                           AS category_name,
           parent.color                                          AS category_color
         FROM categories c
         INNER JOIN categories parent ON c.parent_id = parent.id
         WHERE c.user_id = $1::uuid
           AND c.parent_id IS NOT NULL
           AND COALESCE(c.type, 'revenue') = 'revenue'
         ORDER BY parent.name NULLS LAST, c.name`,
        [userId]
      );
      services = rows;
    } else {
      // booking_services pour les RDV. Catégorie via booking_service_categories
      // (fallback sur categories pour compat si certains services n'ont pas
      // encore migré vers booking_service_categories).
      const { rows } = await pool.query(
        `SELECT
           bs.id,
           bs.name                                               AS service_name,
           bs.price,
           FALSE                                                 AS is_free_price,
           COALESCE(bsc.id, c.id)                                AS category_id,
           COALESCE(bsc.name, c.name)                            AS category_name,
           COALESCE(bsc.color, c.color)                          AS category_color,
           bs.sort_order,
           bs.duration_minutes
         FROM booking_services bs
         LEFT JOIN booking_service_categories bsc ON bs.booking_category_id = bsc.id
         LEFT JOIN categories c                   ON bs.category_id = c.id
         WHERE bs.user_id = $1::uuid
           AND bs.is_active = TRUE
         ORDER BY COALESCE(bsc.name, c.name) NULLS LAST,
                  bs.sort_order NULLS LAST, bs.name`,
        [userId]
      );
      services = rows;
    }

    // Agréger les catégories (id, name, color, count) pour permettre au front
    // d'afficher des regroupements stables même si plusieurs catégories portent
    // le même nom (collision rare mais possible).
    const catMap = new Map();
    for (const s of services) {
      const key = s.category_id || '__none__';
      if (!catMap.has(key)) {
        catMap.set(key, {
          id:    s.category_id || null,
          name:  s.category_name || 'Sans catégorie',
          color: s.category_color || null,
          count: 0,
        });
      }
      catMap.get(key).count += 1;
    }
    const categories = Array.from(catMap.values());

    const payload = { success: true, context, services, categories };
    cacheSet(userId, context, payload);
    res.json(payload);
  } catch (e) {
    console.error('[GET /api/services-for-edit]',
      'msg=' + (e.message || ''),
      'code=' + (e.code || ''),
      'detail=' + (e.detail || ''));
    res.status(500).json({ error: 'Erreur serveur services-for-edit.' });
  }
});

module.exports = router;
