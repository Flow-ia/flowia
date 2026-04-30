// src/routes/booking/settings.js — Paramètres réservation + horaires d'ouverture
const { pool } = require('../../db');

module.exports = function attachSettingsRoutes(router) {
  // ══════════════════════════════════════════════════════════
  // PARAMÈTRES RÉSERVATION
  // ══════════════════════════════════════════════════════════

  // GET /api/booking/settings
  router.get('/settings', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM booking_settings WHERE user_id=$1', [req.user.userId]
      );
      if (!rows.length) return res.json({ settings: null });
      res.json({ settings: rows[0] });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // POST /api/booking/settings
  router.post('/settings', async (req, res) => {
    try {
      const { is_enabled, slug, business_description, address, phone, timezone,
              advance_booking_days, min_notice_hours, cancellation_policy_hours,
              require_account, google_business_url } = req.body;

      // Admin commit 10 — slug verrouille par admin : refuser toute tentative
      // de modification cote merchant. Defense en profondeur sur 3 couches :
      //   1. Pre-check JS ici : 403 explicite si tentative de changement
      //   2. Force slug = current avant UPSERT (au cas ou le check passe)
      //   3. CASE WHEN dans le UPSERT SQL (verrou final cote DB — empeche
      //      meme une bypass JS de modifier la colonne)
      const { rows: current } = await pool.query(
        'SELECT slug, slug_locked FROM booking_settings WHERE user_id=$1',
        [req.user.userId]
      );
      const isLocked = current.length && current[0].slug_locked === true;
      const currentSlug = current.length ? current[0].slug : null;
      // Comparaison normalisee (trim + lowercase) pour absorber un envoi
      // avec casse differente. Un slug envoye undefined/null ne compte pas
      // comme "tentative de change" si l'utilisateur PATCHait une autre
      // section sans inclure le champ slug.
      const sentSlug = (slug == null) ? null : String(slug).trim().toLowerCase();
      const curSlugN = currentSlug ? String(currentSlug).trim().toLowerCase() : null;
      if (isLocked && sentSlug != null && sentSlug !== curSlugN) {
        return res.status(403).json({
          error: "Votre URL de reservation a ete imposee par notre equipe et ne peut pas etre modifiee. Merci de contacter le support pour toute demande.",
          code: 'SLUG_LOCKED',
        });
      }
      // Couche 2 : force la valeur a celle en DB si verrouille (si jamais
      // le check ci-dessus etait contourne par un cas inattendu).
      const slugToWrite = isLocked ? currentSlug : (slug || null);

      // Vérifier unicité du slug (uniquement si on tente d'en ecrire un)
      if (slugToWrite) {
        const { rows: existing } = await pool.query(
          'SELECT id FROM booking_settings WHERE slug=$1 AND user_id!=$2', [slugToWrite, req.user.userId]
        );
        if (existing.length) return res.status(409).json({ error: 'Ce slug est déjà utilisé.' });
      }
      // Valeurs autorisées pour la politique d'annulation
      const ALLOWED = [0, 1, 2, 6, 24, 48];
      const canPol = ALLOWED.includes(parseInt(cancellation_policy_hours))
        ? parseInt(cancellation_policy_hours) : 2;

      // Couche 3 : meme si tout le reste echoue, le CASE WHEN dans le UPDATE
      // empeche d'ecraser slug si slug_locked=TRUE en DB. Filet de securite
      // ultime au niveau Postgres.
      const { rows } = await pool.query(
        `INSERT INTO booking_settings (user_id, is_enabled, slug, business_description, address, phone, timezone, advance_booking_days, min_notice_hours, cancellation_policy_hours, require_account, google_business_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (user_id) DO UPDATE SET
           is_enabled=$2,
           slug = CASE WHEN booking_settings.slug_locked = TRUE THEN booking_settings.slug ELSE $3 END,
           business_description=$4, address=$5, phone=$6,
           timezone=$7, advance_booking_days=$8, min_notice_hours=$9,
           cancellation_policy_hours=$10, require_account=$11,
           google_business_url=$12, updated_at=NOW()
         RETURNING *`,
        [req.user.userId, is_enabled ?? false, slugToWrite, business_description || null,
         address || null, phone || null, timezone || 'Europe/Paris',
         advance_booking_days ?? 30, min_notice_hours ?? 1, canPol,
         require_account ?? false, google_business_url || null]
      );
      res.json({ settings: rows[0] });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // ══════════════════════════════════════════════════════════
  // HORAIRES D'OUVERTURE
  // ══════════════════════════════════════════════════════════

  router.get('/hours', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM business_hours WHERE user_id=$1 ORDER BY day_of_week', [req.user.userId]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  router.post('/hours', async (req, res) => {
    try {
      const { hours } = req.body; // [{ day_of_week, open_time, close_time, is_open }]
      if (!Array.isArray(hours)) return res.status(400).json({ error: 'Format invalide.' });
      for (const h of hours) {
        await pool.query(
          `INSERT INTO business_hours (user_id, day_of_week, open_time, close_time, is_open)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (user_id, day_of_week) DO UPDATE SET open_time=$3, close_time=$4, is_open=$5`,
          [req.user.userId, h.day_of_week, h.open_time || '09:00', h.close_time || '18:00', h.is_open !== false]
        );
      }
      const { rows } = await pool.query('SELECT * FROM business_hours WHERE user_id=$1 ORDER BY day_of_week', [req.user.userId]);
      res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
