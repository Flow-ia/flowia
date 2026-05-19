// Capture lead inbound — formulaire public "1 mois gratuit Essentiel"
// (site marketing flowiapro.com). POST /api/pub/inbound-lead
//
// Acquisition OPT-IN : le commercant laisse LUI-MEME son contact + coche le
// consentement. Aucune donnee scrapee. consent_at = preuve RGPD horodatee.
//
// Securite :
// - Rate-limite par IP (inboundLeadLimiter, configure dans index.js)
// - Honeypot anti-bot (champ "website")
// - Validation stricte (email, longueurs, consentement obligatoire)
// - Monte AVANT le gate /:slug ('inbound-lead' n'est pas un slug)
//
// Robustesse (CLAUDE.md regle 10) :
// - Idempotent : ON CONFLICT (lower(email)) -> on rafraichit les infos sans
//   creer de doublon ni recontacter un desinscrit (unsubscribed_at preserve)
// - Atomique : lead + 3 etapes de sequence enfilees dans UNE transaction
// - Anti-double-enfilement : ON CONFLICT (lead_id, step_key) DO NOTHING
// - N'ENVOIE RIEN ici : le cron worker-1 (commit suivant) traitera les
//   lignes 'queued' echues. Capture != envoi.
const { pool } = require('../../db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Etapes de la sequence de relance, en jours apres la capture.
const SEQUENCE = [
  { step_key: 'welcome',  days: 0 },
  { step_key: 'relance1', days: 3 },
  { step_key: 'relance2', days: 7 },
];

module.exports = (router) => {
  router.post('/inbound-lead', async (req, res) => {
    // Honeypot : un bot remplit "website" -> on simule un OK sans rien faire.
    if (req.body?.website) return res.json({ ok: true });

    const email   = String(req.body?.email   || '').trim().toLowerCase();
    const salon   = String(req.body?.salon   || '').trim();
    const city    = String(req.body?.city    || '').trim();
    const source  = String(req.body?.source  || 'landing').trim().slice(0, 60);
    const consent = req.body?.consent === true || req.body?.consent === 'true';

    if (!email || !salon) {
      return res.status(400).json({ error: 'Le nom du salon et l\'email sont obligatoires.' });
    }
    if (email.length > 254 || salon.length > 200 || city.length > 120) {
      return res.status(400).json({ error: "L'un des champs est trop long." });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email invalide.' });
    }
    if (!consent) {
      return res.status(400).json({ error: 'Le consentement est requis pour vous recontacter.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Idempotent : si l'email existe deja, on rafraichit les infos et le
      // consentement SANS toucher unsubscribed_at (un desinscrit reste
      // desinscrit). RETURNING id pour enfiler la sequence.
      const up = await client.query(
        `INSERT INTO inbound_leads (email, salon_name, city, source, consent_at, status)
           VALUES ($1, $2, $3, $4, NOW(), 'nouveau')
         ON CONFLICT (lower(email)) DO UPDATE SET
           salon_name = EXCLUDED.salon_name,
           city       = EXCLUDED.city,
           consent_at = NOW(),
           updated_at = NOW()
         RETURNING id, unsubscribed_at`,
        [email, salon, city || null, source]
      );

      const lead = up.rows[0];

      // On n'enfile la sequence QUE si le lead n'est pas desinscrit.
      if (!lead.unsubscribed_at) {
        for (const s of SEQUENCE) {
          await client.query(
            `INSERT INTO inbound_lead_emails (lead_id, step_key, status, scheduled_at)
               VALUES ($1, $2, 'queued', NOW() + ($3 || ' days')::interval)
             ON CONFLICT (lead_id, step_key) DO NOTHING`,
            [lead.id, s.step_key, String(s.days)]
          );
        }
      }

      await client.query('COMMIT');
      return res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return res.status(500).json({ error: 'Une erreur est survenue, reessayez.' });
    } finally {
      client.release();
    }
  });
};
