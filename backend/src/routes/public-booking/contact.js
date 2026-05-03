// Contact public — formulaire du site marketing flowiapro.com/contact.
// POST /api/pub/contact -> envoie un email via Brevo a contact@flowiapro.com.
//
// Securite :
// - Rate-limite par IP (configure dans backend/src/index.js : contactLimiter)
// - Validation stricte des champs (longueur, format email, whitelist topic)
// - replyTo = email saisi par le visiteur (permet de repondre en 1 clic)
// - Pas d'auth requise (formulaire public)
const { sendEmail } = require('../../utils/email');

const TOPICS = {
  demo:    'Demande de demo',
  devis:   'Demande de devis',
  support: 'Support technique',
  partner: 'Partenariat',
  other:   'Autre',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s) {
  return String(s).replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#39;' }[c]));
}

module.exports = (router) => {
  router.post('/contact', async (req, res) => {
    try {
      const name    = String(req.body?.name    || '').trim();
      const email   = String(req.body?.email   || '').trim().toLowerCase();
      const phone   = String(req.body?.phone   || '').trim();
      const topic   = String(req.body?.topic   || 'other').trim();
      const message = String(req.body?.message || '').trim();

      // Honeypot anti-bot : si le champ "website" est rempli, on simule un OK
      // (200) pour ne pas alerter le bot, mais on ne fait rien.
      if (req.body?.website) return res.json({ ok: true });

      if (!name || !email || !message) {
        return res.status(400).json({ error: 'Nom, email et message sont obligatoires.' });
      }
      if (name.length > 200 || email.length > 254 || phone.length > 30 || message.length > 5000) {
        return res.status(400).json({ error: "L'un des champs est trop long." });
      }
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Email invalide.' });
      }

      const topicLabel = TOPICS[topic] || TOPICS.other;
      const subject    = `[FlowIA Contact] ${topicLabel} — ${name}`;

      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;font-weight:500;">${escapeHtml(topicLabel)}</p>
          <h2 style="font-weight:500;font-size:20px;margin:0 0 18px;letter-spacing:-0.3px;">Nouveau message de contact</h2>

          <table style="width:100%;border-collapse:collapse;margin:0 0 18px;font-size:14px;">
            <tr>
              <td style="padding:8px 0;color:#6b7280;width:120px;">Nom</td>
              <td style="padding:8px 0;">${escapeHtml(name)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;border-top:0.5px solid rgba(0,0,0,0.08);">Email</td>
              <td style="padding:8px 0;border-top:0.5px solid rgba(0,0,0,0.08);">
                <a href="mailto:${escapeHtml(email)}" style="color:#1a73e8;text-decoration:none;">${escapeHtml(email)}</a>
              </td>
            </tr>
            ${phone ? `
            <tr>
              <td style="padding:8px 0;color:#6b7280;border-top:0.5px solid rgba(0,0,0,0.08);">Telephone</td>
              <td style="padding:8px 0;border-top:0.5px solid rgba(0,0,0,0.08);">${escapeHtml(phone)}</td>
            </tr>` : ''}
          </table>

          <div style="border-left:2px solid #6366f1;padding:14px 18px;background:#f9fafb;border-radius:8px;font-size:14px;line-height:1.6;white-space:pre-wrap;color:#374151;">${escapeHtml(message)}</div>

          <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">
            Repondez directement a cet email pour ecrire a ${escapeHtml(name)}.
          </p>
        </div>
      `;

      const text = [
        `Nouveau message de contact (${topicLabel})`,
        '',
        `Nom : ${name}`,
        `Email : ${email}`,
        phone ? `Telephone : ${phone}` : null,
        '',
        message,
      ].filter(Boolean).join('\n');

      await sendEmail({
        to:      'contact@flowiapro.com',
        subject,
        html,
        text,
        replyTo: { email, name },
      });

      return res.json({ ok: true });
    } catch (e) {
      console.error('[CONTACT] erreur envoi :', e?.message || e);
      return res.status(500).json({ error: "Impossible d'envoyer votre message. Reessayez plus tard." });
    }
  });
};
