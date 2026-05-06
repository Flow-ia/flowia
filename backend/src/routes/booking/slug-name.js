// src/routes/booking/slug-name.js — Edition de la partie "nom" du slug.
//
// Le slug FlowIA suit le format `nom-ville-codepostal` (ex `hair-coiff-lille-59000`).
// Ville et CP sont auto-derives des informations commerce (PUT /api/auth/profile)
// et ne sont jamais editables directement ici. Ce endpoint permet uniquement de
// modifier la partie "nom" (ex remplacer "hair-coiff" par "chez-paul").
//
// Securite :
//  - authMiddleware (deja applique au router parent)
//  - respect de slug_locked (verrouillage admin)
//  - validation regex + blacklist mots reserves
//  - check unicite globale (booking_settings + booking_slug_aliases)
//
// L'ancien slug est archive dans booking_slug_aliases pour conserver les
// liens partages (QR codes, SMS marketing, OAuth Google state).

const { pool } = require('../../db');
const {
  buildMerchantSlug,
  validateNamePart,
  findUniqueSlug,
  archiveOldSlug,
  extractNamePart,
} = require('../../utils/buildSlug');

module.exports = function attachSlugNameRoutes(router) {
  // GET /api/booking/slug-info — renvoie le slug actuel + sa decomposition.
  // Utilise par le frontend pour pre-remplir le champ d'edition.
  router.get('/slug-info', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT bs.slug, bs.slug_locked, u.business_name, u.city, u.postal_code
           FROM booking_settings bs
           JOIN users u ON u.id = bs.user_id
          WHERE bs.user_id = $1`,
        [req.user.userId]
      );
      if (!rows.length) return res.json({ slug: null });
      const r = rows[0];
      const namePart = extractNamePart(r.slug, r.city, r.postal_code);
      // La partie ville-CP courante (ce que l'edition formera comme suffixe).
      const { buildLocationPart } = require('../../utils/buildSlug');
      res.json({
        slug:           r.slug,
        slugLocked:     r.slug_locked === true,
        namePart:       namePart || null,
        locationPart:   buildLocationPart(r.city, r.postal_code) || null,
        city:           r.city,
        postalCode:     r.postal_code,
        businessName:   r.business_name,
      });
    } catch (e) {
      console.error('[SLUG-INFO]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });

  // POST /api/booking/slug-name/check — verifie qu'une partie nom est dispo.
  // Utilise pour le bouton "Verifier la disponibilite" dans l'UI d'edition.
  router.post('/slug-name/check', async (req, res) => {
    try {
      const { namePart } = req.body || {};
      const v = validateNamePart(namePart);
      if (!v.ok) return res.json({ available: false, ...v });

      const { rows } = await pool.query(
        'SELECT city, postal_code FROM users WHERE id=$1',
        [req.user.userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
      const { city, postal_code } = rows[0];

      const candidate = buildMerchantSlug({
        customNamePart: v.value,
        name: v.value,
        city,
        postalCode: postal_code,
      });

      // Pris si un autre user le possede dans booking_settings ou aliases.
      const [{ rows: inSet }, { rows: inAlias }] = await Promise.all([
        pool.query('SELECT 1 FROM booking_settings WHERE slug=$1 AND user_id!=$2 LIMIT 1',
          [candidate, req.user.userId]),
        pool.query('SELECT 1 FROM booking_slug_aliases WHERE old_slug=$1 AND user_id!=$2 LIMIT 1',
          [candidate, req.user.userId]).catch(() => ({ rows: [] })),
      ]);
      if (inSet.length || inAlias.length) {
        return res.json({
          available: false, reason: 'taken',
          message: 'Ce nom de page est deja utilise.',
          candidate,
        });
      }
      return res.json({ available: true, candidate });
    } catch (e) {
      console.error('[SLUG-NAME CHECK]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });

  // PATCH /api/booking/slug-name — applique le changement.
  router.patch('/slug-name', async (req, res) => {
    try {
      const { namePart } = req.body || {};
      const v = validateNamePart(namePart);
      if (!v.ok) return res.status(400).json({ error: v.message, reason: v.reason });

      // Lire l'etat courant (slug + slug_locked + adresse).
      const { rows: cur } = await pool.query(
        `SELECT bs.slug, bs.slug_locked, u.city, u.postal_code
           FROM booking_settings bs
           JOIN users u ON u.id = bs.user_id
          WHERE bs.user_id = $1`,
        [req.user.userId]
      );
      if (!cur.length) {
        return res.status(404).json({ error: 'Page de reservation introuvable.' });
      }
      if (cur[0].slug_locked === true) {
        return res.status(403).json({
          error: "Votre URL de reservation a ete imposee par notre equipe et ne peut pas etre modifiee. Merci de contacter le support pour toute demande.",
          code: 'SLUG_LOCKED',
        });
      }

      const oldSlug = cur[0].slug;
      const baseSlug = buildMerchantSlug({
        customNamePart: v.value,
        name: v.value,
        city: cur[0].city,
        postalCode: cur[0].postal_code,
      });

      // Si le slug calcule est identique, no-op.
      if (baseSlug === oldSlug) {
        return res.json({ ok: true, slug: oldSlug, unchanged: true });
      }

      const newSlug = await findUniqueSlug(pool, baseSlug, req.user.userId);

      // Archive l'ancien et applique le nouveau.
      if (oldSlug) await archiveOldSlug(pool, oldSlug, req.user.userId);
      await pool.query('UPDATE booking_settings SET slug=$1 WHERE user_id=$2',
        [newSlug, req.user.userId]);

      // Invalider caches.
      try {
        if (oldSlug) global.memCache?.del(`biz:${oldSlug}`);
        global.memCache?.del(`biz:${newSlug}`);
      } catch {}

      return res.json({ ok: true, slug: newSlug, oldSlug });
    } catch (e) {
      console.error('[SLUG-NAME PATCH]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });
};
