// src/routes/public-booking/marketplace.js — Recherche publique de
// commercants (page /recherche cote frontend).
//
// Endpoint unique : GET /api/pub/marketplace
// Query params (tous optionnels) :
//   q        : texte libre (matche business_name, city)
//   city     : ville exacte (insensible a la casse, normalisee)
//   lat,lng  : si fournis (avec radius optionnel), tri par distance + filtre
//   radius   : rayon en km (defaut 30 si lat/lng fournis)
//   limit    : pagination (defaut 24, max 60)
//   offset   : pagination (defaut 0)
//
// Mode "decouverte" : si AUCUN filtre n'est passe (q vide, pas de ville,
// pas de lat/lng) ET offset=0, on limite a 12 commercants pour eviter de
// dump l'integralite du catalogue. L'utilisateur active "Pres de moi" ou
// tape une recherche pour voir plus. hasMore=true incite au filtre.
//
// Reponse :
//   { items: [...], total: N, hasMore: bool }
//
// Filtres techniques :
//   - bs.is_enabled = TRUE         (booking active)
//   - u.is_frozen   = FALSE        (pas gele par admin)
//   - u.business_name IS NOT NULL  (compte minimalement complet)
//
// Badges (on rapatrie en LATERAL JOINs pour eviter N+1) :
//   - has_referral        : referral_programs.is_enabled = TRUE
//   - has_loyalty         : loyalty_programs.enabled = TRUE
//   - has_active_promo    : au moins un promo_code actif et non expire,
//                           target_clients='all' (donc visible publiquement)
//   - has_online_payment  : users.online_payments_enabled AND stripe_charges_enabled
//
// Performance : limites strictes, indexes existants (booking_settings.slug,
// users... a verifier sur Supabase). Cache memoire 60s par cle de query.

const express = require('express');
const { pool } = require('../../db');
const { isValidBusinessType, BUSINESS_TYPES } = require('../../utils/businessTypes');

// Cache memoire local (memCache global est partage avec autres routes — on
// y stocke nos resultats avec un namespace pour eviter collisions).
function cacheKey(qs) {
  return 'mp:' + JSON.stringify(qs);
}

// Normalise une ville saisie : minuscules, accents supprimes, trim.
function normalizeCity(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
}

module.exports = function attachMarketplaceRoutes(router) {
  router.get('/marketplace', async (req, res) => {
    try {
      const q          = String(req.query.q || '').trim().slice(0, 80);
      const cityRaw    = String(req.query.city || '').trim().slice(0, 60);
      const cityNorm   = normalizeCity(cityRaw);
      const lat        = req.query.lat ? parseFloat(req.query.lat) : null;
      const lng        = req.query.lng ? parseFloat(req.query.lng) : null;
      const hasGeo     = Number.isFinite(lat) && Number.isFinite(lng);
      const radiusKm   = hasGeo ? Math.min(200, Math.max(1, parseInt(req.query.radius, 10) || 30)) : null;
      // Type de commerce : un seul accepte. Valeur invalide → ignoree (pas
      // d'erreur 400 pour ne pas casser le frontend, juste filtre desactive).
      const bizType    = isValidBusinessType(req.query.type) ? req.query.type : '';
      let   limit      = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 24));
      const offset     = Math.max(0, parseInt(req.query.offset, 10) || 0);

      // Mode decouverte : aucun filtre + premiere page → on cap a 12.
      const isDiscoveryMode = !q && !cityNorm && !hasGeo && !bizType && offset === 0;
      const discoveryLimit = 12;
      if (isDiscoveryMode) limit = Math.min(limit, discoveryLimit);

      const cKey = cacheKey({ q, cityNorm, lat, lng, radiusKm, limit, offset });
      const hit  = global.memCache?.get(cKey);
      if (hit) return res.json(hit);

      // Construction WHERE dynamique. Indexes pertinents :
      //   booking_settings.slug (unique), is_enabled
      //   users.is_frozen, business_name
      const where  = [
        'bs.is_enabled = TRUE',
        'COALESCE(u.is_frozen, FALSE) = FALSE',
        'u.deletion_requested_at IS NULL',
        "COALESCE(u.business_name, '') <> ''",
        'bs.slug IS NOT NULL',
      ];
      const params = [];

      if (q) {
        params.push(`%${q.toLowerCase()}%`);
        const i = params.length;
        where.push(`(LOWER(u.business_name) LIKE $${i} OR LOWER(u.city) LIKE $${i})`);
      }
      if (cityNorm) {
        params.push(cityNorm);
        const i = params.length;
        // Compare la ville sans accents/casse cote DB pour matcher correctement.
        where.push(`LOWER(TRANSLATE(u.city,
            'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÌÍÎÏìíîïÙÚÛÜùúûüçÇñÑ',
            'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeIIIIiiiiUUUUuuuucCnN')) = $${i}`);
      }
      if (bizType) {
        params.push(bizType);
        where.push(`u.business_type = $${params.length}`);
      }

      let geoSelect    = '';
      let orderBy      = 'u.business_name ASC';
      if (hasGeo) {
        // Bounded box rapide (sans extension PostGIS) :
        //   1 deg lat ≈ 111 km, 1 deg lng ≈ 111*cos(lat) km.
        // Pour radius radiusKm, on filtre lat ± radius/111 et lng ± radius/(111*cos(lat)).
        // Puis on calcule la distance approximative en km et on trie.
        const latDelta = radiusKm / 111.0;
        const lngDelta = radiusKm / (111.0 * Math.max(0.01, Math.cos(lat * Math.PI / 180)));
        params.push(lat - latDelta); const iLatMin = params.length;
        params.push(lat + latDelta); const iLatMax = params.length;
        params.push(lng - lngDelta); const iLngMin = params.length;
        params.push(lng + lngDelta); const iLngMax = params.length;
        params.push(lat);            const iLat    = params.length;
        params.push(lng);            const iLng    = params.length;
        params.push(radiusKm);       const iRadius = params.length;

        where.push(`u.lat IS NOT NULL AND u.lng IS NOT NULL`);
        where.push(`u.lat BETWEEN $${iLatMin} AND $${iLatMax}`);
        where.push(`u.lng BETWEEN $${iLngMin} AND $${iLngMax}`);

        // Distance haversine simplifiee en km (assez precise <500 km).
        geoSelect = `
          (6371 * acos(
             LEAST(1, GREATEST(-1,
                cos(radians($${iLat})) * cos(radians(u.lat)) *
                cos(radians(u.lng) - radians($${iLng})) +
                sin(radians($${iLat})) * sin(radians(u.lat))
             ))
          )) AS distance_km`;
        // Filtre exact distance ≤ radius (la bounded box est plus large que le cercle).
        where.push(`(6371 * acos(
             LEAST(1, GREATEST(-1,
                cos(radians($${iLat})) * cos(radians(u.lat)) *
                cos(radians(u.lng) - radians($${iLng})) +
                sin(radians($${iLat})) * sin(radians(u.lat))
             ))
          )) <= $${iRadius}`);
        orderBy = 'distance_km ASC, u.business_name ASC';
      }

      params.push(limit);  const iLimit  = params.length;
      params.push(offset); const iOffset = params.length;

      const sql = `
        SELECT
          u.id              AS user_id,
          u.business_name,
          u.city,
          u.postal_code,
          u.address,
          u.lat,
          u.lng,
          u.google_business_url,
          u.online_payments_enabled,
          u.stripe_charges_enabled,
          u.business_type,
          bs.slug,
          bs.business_description,
          ${geoSelect ? geoSelect + ',' : ''}
          (SELECT EXISTS (
             SELECT 1 FROM media m
              WHERE m.user_id = u.id AND m.type = 'profile'
              LIMIT 1
           )) AS has_profile_image,
          (SELECT id FROM media
             WHERE user_id = u.id AND type = 'cover'
             ORDER BY sort_order ASC LIMIT 1
          ) AS cover_id,
          (SELECT EXISTS (
             SELECT 1 FROM referral_programs rp
              WHERE rp.user_id = u.id AND rp.is_enabled = TRUE
           )) AS has_referral,
          (SELECT EXISTS (
             SELECT 1 FROM loyalty_programs lp
              WHERE lp.user_id = u.id AND lp.enabled = TRUE
           )) AS has_loyalty,
          (SELECT EXISTS (
             SELECT 1 FROM promo_codes pc
              WHERE pc.user_id = u.id
                AND pc.is_active = TRUE
                AND COALESCE(pc.target_clients, 'all') = 'all'
                AND COALESCE(pc.is_loyalty_reward, FALSE) = FALSE
                AND (pc.valid_until IS NULL OR pc.valid_until >= CURRENT_DATE)
                AND (pc.max_uses    IS NULL OR pc.uses_count < pc.max_uses)
           )) AS has_active_promo
        FROM booking_settings bs
        JOIN users u ON u.id = bs.user_id
        WHERE ${where.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT $${iLimit} OFFSET $${iOffset}`;

      // Compte total pour pagination.
      const countSql = `
        SELECT COUNT(*)::int AS n
          FROM booking_settings bs
          JOIN users u ON u.id = bs.user_id
         WHERE ${where.join(' AND ')}`;

      const [rowsRes, countRes] = await Promise.all([
        pool.query(sql, params),
        // Le count utilise les memes params SAUF limit/offset (les 2 derniers).
        pool.query(countSql, params.slice(0, params.length - 2)),
      ]);

      const items = rowsRes.rows.map(r => ({
        slug:                 r.slug,
        businessName:         r.business_name,
        businessType:         r.business_type || null,
        businessDescription:  r.business_description,
        city:                 r.city,
        postalCode:           r.postal_code,
        address:              r.address,
        lat:                  r.lat ? parseFloat(r.lat) : null,
        lng:                  r.lng ? parseFloat(r.lng) : null,
        googleBusinessUrl:    r.google_business_url,
        // Distance arrondie a 0.1 km. Null si pas de geoloc dans la requete.
        distanceKm:           r.distance_km != null ? Math.round(parseFloat(r.distance_km) * 10) / 10 : null,
        // URLs media en proxy (pas d'URL Cloudinary directe exposee).
        profileUrl:           r.has_profile_image ? `/api/media/commercant/${r.user_id}/profile` : null,
        coverUrl:             r.cover_id ? `/api/media/commercant/${r.user_id}/cover/${r.cover_id}` : null,
        // Badges pour mise en avant cote UI.
        badges: {
          referral:           !!r.has_referral,
          loyalty:            !!r.has_loyalty,
          promo:              !!r.has_active_promo,
          onlinePayment:      !!(r.online_payments_enabled && r.stripe_charges_enabled),
          instantBooking:     true, // bs.is_enabled deja garanti par le WHERE
        },
      }));

      const total   = countRes.rows[0]?.n || 0;
      // En mode decouverte, on ne propose PAS de "voir plus" : on incite a
      // affiner la recherche (ville / pres de moi / texte). Le frontend
      // affiche un message a la place du bouton charger plus.
      const hasMore = isDiscoveryMode ? false : (offset + items.length < total);
      const resp    = { items, total, hasMore, limit, offset, discoveryMode: isDiscoveryMode };

      // Cache 60s : le portail change peu, mais reste reactif aux activations
      // de programmes / nouveaux comptes.
      try { global.memCache?.set(cKey, resp, 60 * 1000); } catch {}

      return res.json(resp);
    } catch (e) {
      console.error('[MARKETPLACE]', e.message);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
  });
};
