// inboundSequence.js — sequence email d'acquisition (leads OPT-IN).
//
// Traite les lignes inbound_lead_emails 'queued' echues. Appele par un cron
// worker-1 cluster-safe (lock applicatif Postgres, cf. index.js startCron).
//
// Robustesse (CLAUDE.md regle 10) :
// - Idempotent : seules les lignes status='queued' sont selectionnees ; une
//   ligne envoyee passe 'sent' et n'est jamais reprise. L'index unique
//   (lead_id, step_key) empeche tout doublon en amont.
// - Quota SUBORDONNE : reserveGlobalEmail(cap reduit) — la prospection ne
//   consomme jamais la reserve gardee pour le transactionnel (rappels RDV,
//   OTP). Si le cap inbound est atteint, on s'arrete, les lignes restent
//   'queued' pour le prochain tick/jour. Le transactionnel n'est JAMAIS
//   prive (il reserve jusqu'a 300, l'inbound jusqu'a INBOUND_GLOBAL_CAP).
// - Desinscrit : une ligne dont le lead a unsubscribed_at est marquee
//   'skipped', jamais envoyee (RGPD).
// - Fail-safe : un email nurture qui echoue est non-critique -> 'failed' +
//   log, on continue les autres (try/catch granulaire, pas de Promise.all).
const { sendEmail, reserveGlobalEmail } = require('./email');

const API_URL        = (process.env.API_PUBLIC_URL || 'https://api.flowiapro.com').replace(/\/$/, '');
const COMMERCANT_URL = (process.env.COMMERCANT_URL  || 'https://commercant.flowiapro.com').replace(/\/$/, '');
const OFFER_CODE     = (process.env.INBOUND_OFFER_PROMO_CODE || '').trim();
// Cap global inbound < 300 (cap transactionnel) : garde une reserve
// exclusive au transactionnel. Surchargeable, jamais >= 300.
const INBOUND_GLOBAL_CAP = Math.min(
  parseInt(process.env.INBOUND_GLOBAL_CAP, 10) || 250, 299
);
// Garde-fou volume : nb max de mails inbound par tick.
const BATCH = Math.max(1, Math.min(parseInt(process.env.INBOUND_BATCH, 10) || 20, 50));

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

const registerUrl = `${COMMERCANT_URL}/register?plan=essentiel&period=monthly`;

// Bloc offre : code promo si configure cote env, sinon CTA seul (jamais de
// promesse de code en dur si l'env n'est pas pret).
function offerBlock() {
  if (OFFER_CODE) {
    return `<p style="font-size:14px;color:#374151;margin:0 0 10px;">Votre code pour <b>1 mois offert</b> sur le plan Essentiel :</p>
    <p style="font-size:20px;font-weight:500;letter-spacing:1px;color:#111827;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:12px 18px;text-align:center;margin:0 0 18px;">${esc(OFFER_CODE)}</p>
    <p style="font-size:13px;color:#6b7280;margin:0 0 18px;">A saisir lors de la creation de votre compte (champ code promo).</p>`;
  }
  return `<p style="font-size:14px;color:#374151;margin:0 0 18px;">Creez votre compte et profitez d'<b>1 mois offert</b> sur le plan Essentiel, sans carte et sans engagement.</p>`;
}

function shell(inner, token) {
  const unsub = `${API_URL}/api/pub/unsubscribe/${token}`;
  return `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:28px 24px;color:#111827;">
${inner}
<a href="${registerUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:8px;margin:6px 0 22px;">Activer mon mois gratuit</a>
<p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:18px 0 0;border-top:1px solid #e5e7eb;padding-top:16px;">
FlowIA — logiciel de gestion pour salons et barbershops.<br/>
Vous recevez cet email car vous avez demande cette offre sur flowiapro.com.<br/>
<a href="${unsub}" style="color:#6b7280;">Se desinscrire en un clic</a>
</p>
</div></body></html>`;
}

const TEMPLATES = {
  welcome: (lead) => ({
    subject: `Votre mois gratuit FlowIA pour ${lead.salon_name || 'votre salon'}`,
    html: shell(`<h2 style="font-size:20px;font-weight:500;margin:0 0 14px;">Bienvenue chez FlowIA</h2>
<p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">Bonjour,<br/>FlowIA reunit agenda en ligne, caisse, SMS de rappel, fidelite et parrainage en une seule application — sans commission sur vos reservations, et moins cher que Planity.</p>
${offerBlock()}`, lead.unsubscribe_token),
  }),
  relance1: (lead) => ({
    subject: `${lead.salon_name || 'Votre salon'} — votre acces FlowIA vous attend`,
    html: shell(`<h2 style="font-size:20px;font-weight:500;margin:0 0 14px;">Vous y avez pense ?</h2>
<p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">Votre mois gratuit du plan Essentiel est toujours disponible. La mise en route prend moins de 15 minutes, et vos clients reservent en ligne 24/7 des le premier jour.</p>
${offerBlock()}`, lead.unsubscribe_token),
  }),
  relance2: (lead) => ({
    subject: `Dernier rappel — 1 mois offert sur FlowIA`,
    html: shell(`<h2 style="font-size:20px;font-weight:500;margin:0 0 14px;">Derniere relance</h2>
<p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">On ne vous recontactera plus apres cet email. Si gerer agenda, caisse et fidelite au meme endroit (sans commission) vous interesse, c'est le moment d'activer votre mois offert.</p>
${offerBlock()}`, lead.unsubscribe_token),
  }),
};

async function processInboundSequence(dbPool) {
  const due = await dbPool.query(
    `SELECT e.id AS email_id, e.step_key, l.id AS lead_id, l.email,
            l.salon_name, l.unsubscribe_token, l.unsubscribed_at
       FROM inbound_lead_emails e
       JOIN inbound_leads l ON l.id = e.lead_id
      WHERE e.status = 'queued' AND e.scheduled_at <= NOW()
      ORDER BY e.scheduled_at ASC
      LIMIT $1`,
    [BATCH]
  );
  if (!due.rows.length) return;

  let sent = 0, skipped = 0, failed = 0;

  for (const row of due.rows) {
    try {
      // RGPD : ne jamais ecrire a un desinscrit.
      if (row.unsubscribed_at) {
        await dbPool.query(
          `UPDATE inbound_lead_emails SET status='skipped' WHERE id=$1 AND status='queued'`,
          [row.email_id]
        );
        skipped++;
        continue;
      }

      const tpl = TEMPLATES[row.step_key];
      if (!tpl) {
        await dbPool.query(
          `UPDATE inbound_lead_emails SET status='skipped', error='unknown step' WHERE id=$1 AND status='queued'`,
          [row.email_id]
        );
        skipped++;
        continue;
      }

      // Quota subordonne : si la reserve inbound est epuisee, on s'arrete
      // (les lignes restent 'queued'). Le transactionnel garde sa marge.
      const maySend = await reserveGlobalEmail(INBOUND_GLOBAL_CAP);
      if (!maySend) {
        console.log('[CRON inbound] cap global atteint, report au prochain tick');
        break;
      }

      const { subject, html } = tpl(row);
      let providerId = null;
      try {
        const r = await sendEmail({ to: row.email, subject, html });
        providerId = (r && (r.messageId || r.id)) || null;
      } catch (sendErr) {
        await dbPool.query(
          `UPDATE inbound_lead_emails SET status='failed', error=$2 WHERE id=$1 AND status='queued'`,
          [row.email_id, String(sendErr.message || sendErr).slice(0, 300)]
        );
        failed++;
        continue;
      }

      // Marque envoye + progression du statut du lead (fail-safe : si la
      // 2e requete echoue, l'email reste 'sent' -> jamais de doublon).
      await dbPool.query(
        `UPDATE inbound_lead_emails
            SET status='sent', sent_at=NOW(), provider_message_id=$2
          WHERE id=$1 AND status='queued'`,
        [row.email_id, providerId]
      );
      await dbPool.query(
        `UPDATE inbound_leads
            SET last_email_at=NOW(), updated_at=NOW(),
                status = CASE WHEN status='nouveau' THEN 'contacte' ELSE status END
          WHERE id=$1`,
        [row.lead_id]
      );
      sent++;
    } catch (e) {
      console.error('[CRON inbound] ligne', row.email_id, e.message);
    }
  }

  if (sent || skipped || failed) {
    console.log(`[CRON inbound] envoyes:${sent} skip:${skipped} echecs:${failed}`);
  }
}

module.exports = { processInboundSequence };
