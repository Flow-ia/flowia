const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: parseInt(process.env.SMTP_PORT) === 465,
  family: 4, // Forcer IPv4 — Render free tier bloque IPv6
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false },
});

// ── Email code vérification (OTP) ─────────────────────────────────────────
async function sendVerificationEmail(to, code, subject = 'Votre code de vérification', context = 'default') {
  const styles = {
    default:       { emoji: '💰', badge: '' },
    register:      { emoji: '🎉', badge: 'Inscription' },
    pin_change:    { emoji: '🔐', badge: 'Sécurité PIN' },
    lockout_alert: { emoji: '🚨', badge: 'Alerte Sécurité' },
    email:         { emoji: '✉️', badge: 'Email' },
  };
  const st = styles[context] || styles.default;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:40px 20px;">
  <div style="max-width:460px;margin:0 auto;background:white;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:36px;text-align:center;">
      <div style="font-size:40px;margin-bottom:10px;">${st.emoji}</div>
      <h1 style="color:white;margin:0;font-size:22px;font-weight:800;">FlowIA</h1>
      ${st.badge ? `<span style="display:inline-block;margin-top:10px;background:rgba(255,255,255,0.15);color:#e2e8f0;padding:4px 14px;border-radius:99px;font-size:12px;font-weight:600;">${st.badge}</span>` : ''}
    </div>
    <div style="padding:40px 36px;text-align:center;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 10px;font-weight:800;">${subject}</h2>
      <p style="color:#64748b;font-size:14px;margin:0 0 32px;">Entrez ce code dans l'application pour continuer :</p>
      <div style="background:#f1f5f9;border:2px solid #e2e8f0;border-radius:20px;padding:28px 24px;margin-bottom:28px;">
        <div style="letter-spacing:14px;font-size:40px;font-weight:900;color:#0f172a;font-family:monospace;">${code}</div>
      </div>
      <p style="color:#94a3b8;font-size:13px;margin:0;">⏱ Ce code expire dans <strong>15 minutes</strong>.</p>
      <p style="color:#94a3b8;font-size:12px;margin:10px 0 0;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
    </div>
    <div style="background:#f8fafc;padding:18px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="color:#cbd5e1;font-size:11px;margin:0;">© ${new Date().getFullYear()} FlowIA</p>
    </div>
  </div>
</body></html>`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `FlowIA <${process.env.SMTP_USER}>`,
      to, subject, html,
    });
    console.log(`[MAIL OK] ${subject} -> ${to}`);
  } catch (err) {
    console.error(`[MAIL ERREUR] ${err.message}`);
  }
}

// ── Email confirmation RDV (design carte rendez-vous) ─────────────────────
async function sendAppointmentConfirmation({ to, clientName, businessName, serviceName, employeeName, date, startTime, endTime, durationMinutes, price, finalPrice, discountAmount, promoCode, notes, appointmentId, bookingUrl, items }) {
  const refId = appointmentId.substring(0, 8).toUpperCase();
  // Parser la date YYYY-MM-DD sans ambiguïté de timezone
  // new Date('2026-03-13') → UTC minuit → peut décaler d'1 jour selon timezone serveur
  // Solution : construire la date en local explicitement
  const [dy, dm, dd] = date.split('-').map(Number);
  const dateObj = new Date(dy, dm - 1, dd); // constructeur local → pas de décalage UTC
  const dateFr = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateCapitalized = dateFr.charAt(0).toUpperCase() + dateFr.slice(1);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4ff;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6366f1 0%,#06b6d4 100%);border-radius:24px 24px 0 0;padding:40px 36px;text-align:center;">
      <div style="width:64px;height:64px;background:rgba(255,255,255,0.2);border-radius:20px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
        <span style="font-size:32px;">📅</span>
      </div>
      <h1 style="color:white;margin:0;font-size:26px;font-weight:900;letter-spacing:-0.5px;">Rendez-vous confirmé !</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:15px;">Bonjour ${clientName}, votre réservation est enregistrée.</p>
    </div>

    <!-- Carte RDV principale -->
    <div style="background:white;padding:32px 36px;border-left:1px solid #e8eaf6;border-right:1px solid #e8eaf6;">

      <!-- Référence -->
      <div style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(6,182,212,0.06));border:1px solid rgba(99,102,241,0.2);border-radius:16px;padding:16px 20px;margin-bottom:28px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <p style="color:#6366f1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;">Numéro de réservation</p>
          <p style="color:#1e1b4b;font-size:22px;font-weight:900;font-family:monospace;margin:0;letter-spacing:3px;">#${refId}</p>
        </div>
        <div style="width:44px;height:44px;background:rgba(99,102,241,0.12);border-radius:12px;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:20px;">🎫</span>
        </div>
      </div>

      <!-- Infos commerce -->
      <p style="color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px;">Détails du rendez-vous</p>

      <!-- Commerce -->
      <div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #f1f5f9;">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#6366f1,#06b6d4);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:18px;">🏪</span>
        </div>
        <div>
          <p style="color:#94a3b8;font-size:11px;font-weight:600;margin:0 0 2px;">Commerce</p>
          <p style="color:#0f172a;font-size:15px;font-weight:700;margin:0;">${businessName}</p>
        </div>
      </div>

      <!-- Service(s) -->
      ${(items && items.length > 0) ? `
        <p style="color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Services / Produits</p>
        ${items.map(it => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f1f5f9;">
          <div style="width:36px;height:36px;background:rgba(99,102,241,0.1);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="font-size:16px;">✂️</span>
          </div>
          <div style="flex:1;">
            <p style="color:#0f172a;font-size:14px;font-weight:700;margin:0;">${it.service_name}</p>
            ${it.qty > 1 ? `<p style="color:#94a3b8;font-size:11px;margin:2px 0 0;">× ${it.qty}</p>` : ''}
            ${it.duration_minutes > 0 ? `<p style="color:#6366f1;font-size:11px;margin:2px 0 0;">${it.duration_minutes} min</p>` : ''}
          </div>
          <div style="text-align:right;">
            ${it.unit_price > 0 ? `<p style="color:#0f172a;font-size:14px;font-weight:800;margin:0;">${(it.unit_price * it.qty).toFixed(2)} €</p>` : ''}
            ${it.unit_price > 0 && it.qty > 1 ? `<p style="color:#94a3b8;font-size:11px;margin:2px 0 0;">${it.unit_price.toFixed(2)} € × ${it.qty}</p>` : ''}
          </div>
        </div>`).join('')}
      ` : `
      <div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #f1f5f9;">
        <div style="width:40px;height:40px;background:rgba(99,102,241,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:18px;">✂️</span>
        </div>
        <div style="flex:1;">
          <p style="color:#94a3b8;font-size:11px;font-weight:600;margin:0 0 2px;">Service</p>
          <p style="color:#0f172a;font-size:15px;font-weight:700;margin:0;">${serviceName}</p>
        </div>
        <div style="text-align:right;">
          <span style="background:rgba(99,102,241,0.1);color:#6366f1;padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700;">${durationMinutes} min</span>
          ${price ? `<p style="color:#0f172a;font-size:14px;font-weight:800;margin:4px 0 0;">${price} €</p>` : ''}
        </div>
      </div>
      `}

      <!-- Employé -->
      ${employeeName ? `
      <div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #f1f5f9;">
        <div style="width:40px;height:40px;background:rgba(6,182,212,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:18px;">👤</span>
        </div>
        <div>
          <p style="color:#94a3b8;font-size:11px;font-weight:600;margin:0 0 2px;">Avec</p>
          <p style="color:#0f172a;font-size:15px;font-weight:700;margin:0;">${employeeName}</p>
        </div>
      </div>` : ''}

      <!-- Date & Heure -->
      <div style="background:linear-gradient(135deg,#f8faff,#f0fdff);border:1px solid #e0e7ff;border-radius:16px;padding:20px 24px;margin:20px 0;">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="text-align:center;min-width:56px;">
            <div style="background:linear-gradient(135deg,#6366f1,#06b6d4);border-radius:12px;padding:8px;display:inline-block;">
              <p style="color:white;font-size:22px;font-weight:900;margin:0;line-height:1;">${dateObj.getDate()}</p>
              <p style="color:rgba(255,255,255,0.85);font-size:10px;font-weight:700;margin:0;text-transform:uppercase;">${['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][dateObj.getMonth()]}</p>
            </div>
          </div>
          <div>
            <p style="color:#0f172a;font-size:16px;font-weight:800;margin:0 0 4px;">${dateCapitalized}</p>
            <p style="color:#6366f1;font-size:20px;font-weight:900;margin:0;letter-spacing:-0.5px;">${startTime.substring(0,5)} – ${endTime.substring(0,5)}</p>
          </div>
        </div>
      </div>

      ${discountAmount > 0 ? `
      <!-- Section Promo / Réduction -->
      <div style="background:linear-gradient(135deg,rgba(16,185,129,0.08),rgba(5,150,105,0.05));border:1px solid rgba(16,185,129,0.25);border-radius:16px;padding:18px 20px;margin:16px 0;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="width:34px;height:34px;background:rgba(16,185,129,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="font-size:18px;">🎉</span>
          </div>
          <div>
            <p style="color:#065f46;font-size:12px;font-weight:700;margin:0 0 2px;text-transform:uppercase;letter-spacing:0.5px;">Code promo appliqué</p>
            ${promoCode ? `<p style="color:#10b981;font-size:14px;font-weight:900;margin:0;font-family:monospace;letter-spacing:2px;">${promoCode}</p>` : ''}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid rgba(16,185,129,0.2);">
          <span style="color:#6b7280;font-size:13px;">Prix initial</span>
          <span style="color:#6b7280;font-size:13px;text-decoration:line-through;">${price ? price.toFixed(2) : '—'} €</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
          <span style="color:#ef4444;font-size:13px;font-weight:700;">Réduction</span>
          <span style="color:#ef4444;font-size:13px;font-weight:900;">-${discountAmount.toFixed(2)} €</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(16,185,129,0.12);border-radius:12px;margin-top:8px;">
          <span style="color:#065f46;font-size:14px;font-weight:800;">Prix final</span>
          <span style="color:#10b981;font-size:20px;font-weight:900;font-family:monospace;">${finalPrice != null ? finalPrice.toFixed(2) : '—'} €</span>
        </div>
      </div>` : ''}

      ${notes ? `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;margin-bottom:20px;">
        <p style="color:#92400e;font-size:12px;font-weight:700;margin:0 0 4px;">📝 Notes</p>
        <p style="color:#78350f;font-size:14px;margin:0;">${notes}</p>
      </div>` : ''}
    </div>

    <!-- CTA -->
    <div style="background:white;padding:0 36px 32px;border-left:1px solid #e8eaf6;border-right:1px solid #e8eaf6;">
      ${bookingUrl ? `
      <a href="${bookingUrl}/client/appointments" style="display:block;background:linear-gradient(135deg,#6366f1,#06b6d4);color:white;text-align:center;padding:16px;border-radius:16px;text-decoration:none;font-weight:800;font-size:15px;margin-bottom:12px;">
        Gérer mes rendez-vous →
      </a>` : ''}
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">Pour annuler, contactez directement l'établissement ou gérez votre RDV en ligne.</p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border:1px solid #e8eaf6;border-radius:0 0 24px 24px;padding:20px 36px;text-align:center;">
      <p style="color:#94a3b8;font-size:12px;margin:0 0 4px;">Réservation gérée via <strong style="color:#6366f1;">FlowIA</strong></p>
      <p style="color:#cbd5e1;font-size:11px;margin:0;">Référence : <span style="font-family:monospace;font-weight:700;">#${refId}</span> · ${new Date().getFullYear()}</p>
    </div>

  </div>
</body></html>`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `FlowIA <${process.env.SMTP_USER}>`,
      to,
      subject: `✅ RDV confirmé — ${serviceName} le ${dateCapitalized} à ${startTime.substring(0,5)} · #${refId}`,
      html,
    });
    console.log(`[MAIL RDV OK] #${refId} -> ${to}`);
  } catch (err) {
    console.error(`[MAIL RDV ERREUR] ${err.message}`);
  }
}


// ── Email récap journalier ────────────────────────────────────────────────────
async function sendDailyRecap({ to, businessName, date, ca, nbPrest, nbRdv, topEmployee, transactions }) {
  const [dy, dm, dd] = date.split('-').map(Number);
  const dateObj = new Date(dy, dm - 1, dd);
  const dateFr = dateObj.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const dateCapitalized = dateFr.charAt(0).toUpperCase() + dateFr.slice(1);
  const fmtMoney = v => Number(v||0).toFixed(2).replace('.', ',');
  const gradGreen = 'linear-gradient(135deg,#10b981,#059669)';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0fdf4;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="background:${gradGreen};border-radius:24px 24px 0 0;padding:40px 36px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">📊</div>
      <h1 style="color:white;margin:0;font-size:26px;font-weight:900;">Récap de la journée</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">${businessName} · ${dateCapitalized}</p>
    </div>
    <div style="background:white;padding:32px 36px;border-left:1px solid #d1fae5;border-right:1px solid #d1fae5;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:28px;">
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:16px;padding:16px;text-align:center;">
          <p style="color:#059669;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">CA du jour</p>
          <p style="color:#065f46;font-size:22px;font-weight:900;font-family:monospace;margin:0;">${fmtMoney(ca)} €</p>
        </div>
        <div style="background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.2);border-radius:16px;padding:16px;text-align:center;">
          <p style="color:#6366f1;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">Prestations</p>
          <p style="color:#312e81;font-size:22px;font-weight:900;font-family:monospace;margin:0;">${nbPrest}</p>
        </div>
        <div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:16px;padding:16px;text-align:center;">
          <p style="color:#d97706;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">RDV</p>
          <p style="color:#78350f;font-size:22px;font-weight:900;font-family:monospace;margin:0;">${nbRdv}</p>
        </div>
      </div>
      ${topEmployee ? `
      <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:28px;">🏆</span>
        <div>
          <p style="color:#065f46;font-size:12px;font-weight:700;margin:0 0 2px;">Employé le plus actif</p>
          <p style="color:#059669;font-size:16px;font-weight:900;margin:0;">${topEmployee.name} <span style="font-size:13px;color:#64748b;font-weight:600;">· ${topEmployee.count} prestation(s)</span></p>
        </div>
      </div>` : ''}
      ${transactions.length > 0 ? `
      <p style="color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Dernières transactions</p>
      ${transactions.slice(0,5).map(t => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0fdf4;">
        <span style="font-size:13px;color:#374151;">${t.description || t.category_name || 'Transaction'}</span>
        <span style="font-size:14px;font-weight:800;color:#10b981;font-family:monospace;">+${fmtMoney(t.amount)} €</span>
      </div>`).join('')}` : `
      <div style="text-align:center;padding:24px 0;">
        <p style="color:#94a3b8;font-size:14px;margin:0;">Aucune transaction aujourd'hui</p>
      </div>`}
    </div>
    <div style="background:#f0fdf4;border:1px solid #d1fae5;border-radius:0 0 24px 24px;padding:18px 36px;text-align:center;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">Récap automatique · <strong style="color:#10b981;">FlowIA</strong></p>
    </div>
  </div>
</body></html>`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `FlowIA <${process.env.SMTP_USER}>`,
      to, html,
      subject: `📊 Récap du ${dateCapitalized} · CA ${fmtMoney(ca)} € · ${businessName}`,
    });
    console.log(`[MAIL RECAP OK] ${date} -> ${to}`);
  } catch(err) { console.error(`[MAIL RECAP ERR] ${err.message}`); }
}

// ── Email rappel RDV client ───────────────────────────────────────────────────
async function sendRdvReminder({ to, clientName, businessName, serviceName, date, startTime, hoursBeforeLabel }) {
  const [dy, dm, dd] = date.split('-').map(Number);
  const dateObj = new Date(dy, dm - 1, dd);
  const dateFr = dateObj.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const dateCapitalized = dateFr.charAt(0).toUpperCase() + dateFr.slice(1);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4ff;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:24px 24px 0 0;padding:40px 36px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">⏰</div>
      <h1 style="color:white;margin:0;font-size:26px;font-weight:900;">Rappel de rendez-vous</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">Dans ${hoursBeforeLabel} · ${clientName}</p>
    </div>
    <div style="background:white;padding:32px 36px;border-left:1px solid #e0e7ff;border-right:1px solid #e0e7ff;">
      <div style="background:linear-gradient(135deg,rgba(99,102,241,0.07),rgba(139,92,246,0.05));border:1px solid rgba(99,102,241,0.2);border-radius:18px;padding:20px 24px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:14px;padding:10px 14px;text-align:center;flex-shrink:0;">
            <p style="color:white;font-size:22px;font-weight:900;margin:0;line-height:1;">${dd}</p>
            <p style="color:rgba(255,255,255,0.85);font-size:10px;font-weight:700;margin:0;text-transform:uppercase;">${['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][dm-1]}</p>
          </div>
          <div>
            <p style="color:#312e81;font-size:15px;font-weight:800;margin:0 0 4px;">${dateCapitalized}</p>
            <p style="color:#6366f1;font-size:22px;font-weight:900;margin:0;">${startTime.substring(0,5)}</p>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #f5f3ff;">
        <div style="width:40px;height:40px;background:rgba(99,102,241,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">✂️</div>
        <div><p style="color:#94a3b8;font-size:11px;font-weight:600;margin:0 0 2px;">Service</p><p style="color:#0f172a;font-size:15px;font-weight:700;margin:0;">${serviceName}</p></div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:14px 0;">
        <div style="width:40px;height:40px;background:rgba(99,102,241,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">🏪</div>
        <div><p style="color:#94a3b8;font-size:11px;font-weight:600;margin:0 0 2px;">Établissement</p><p style="color:#0f172a;font-size:15px;font-weight:700;margin:0;">${businessName}</p></div>
      </div>
    </div>
    <div style="background:#f5f3ff;border:1px solid #e0e7ff;border-radius:0 0 24px 24px;padding:18px 36px;text-align:center;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">Rappel automatique via <strong style="color:#6366f1;">FlowIA</strong></p>
    </div>
  </div>
</body></html>`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `FlowIA <${process.env.SMTP_USER}>`,
      to, html,
      subject: `⏰ Rappel — ${serviceName} demain à ${startTime.substring(0,5)} · ${businessName}`,
    });
    console.log(`[MAIL REMINDER OK] -> ${to}`);
  } catch(err) { console.error(`[MAIL REMINDER ERR] ${err.message}`); }
}


// ── Email récompense fidélité ─────────────────────────────────────────────────
async function sendLoyaltyReward({ to, clientName, businessName, rewardCode, rewardType, rewardValue, rewardLabel, stampsRequired }) {
  const discountStr = rewardType === 'percent'
    ? `-${rewardValue}%`
    : `-${Number(rewardValue).toFixed(2)} €`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fffbeb;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#f59e0b,#fbbf24);border-radius:24px 24px 0 0;padding:40px 36px;text-align:center;">
      <div style="font-size:56px;margin-bottom:12px;">🎉</div>
      <h1 style="color:white;margin:0;font-size:28px;font-weight:900;">Récompense débloquée !</h1>
      <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;font-size:15px;">Félicitations ${clientName}, vous avez atteint ${stampsRequired} visites !</p>
    </div>

    <div style="background:white;padding:32px 36px;border-left:1px solid #fde68a;border-right:1px solid #fde68a;">
      <!-- Récompense -->
      <div style="background:linear-gradient(135deg,rgba(245,158,11,0.1),rgba(251,191,36,0.06));border:2px solid rgba(245,158,11,0.3);border-radius:20px;padding:24px;text-align:center;margin-bottom:28px;">
        <p style="color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Votre récompense</p>
        <p style="color:#f59e0b;font-size:40px;font-weight:900;margin:0;font-family:monospace;">${discountStr}</p>
        <p style="color:#78350f;font-size:14px;font-weight:600;margin:6px 0 0;">${rewardLabel}</p>
      </div>

      <!-- Code promo -->
      <p style="color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;text-align:center;">Votre code de réduction</p>
      <div style="background:#fff7ed;border:2px dashed #f59e0b;border-radius:16px;padding:20px;text-align:center;margin-bottom:24px;">
        <p style="font-family:monospace;font-size:28px;font-weight:900;color:#92400e;letter-spacing:4px;margin:0;">${rewardCode}</p>
        <p style="color:#d97706;font-size:12px;margin:8px 0 0;">Valable 90 jours · Utilisable lors de votre prochaine réservation</p>
      </div>

      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:14px;padding:14px 18px;margin-bottom:20px;">
        <p style="color:#92400e;font-size:13px;font-weight:600;margin:0;">
          ℹ️ Saisissez ce code lors de votre prochaine réservation en ligne ou communiquez-le à votre prestataire lors de l&apos;encaissement.
        </p>
      </div>

      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:44px;height:44px;background:linear-gradient(135deg,#f59e0b,#fbbf24);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;">🏪</div>
        <div>
          <p style="color:#94a3b8;font-size:11px;margin:0 0 2px;">Établissement</p>
          <p style="color:#0f172a;font-size:15px;font-weight:700;margin:0;">${businessName}</p>
        </div>
      </div>
    </div>

    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:0 0 24px 24px;padding:18px 36px;text-align:center;">
      <p style="color:#92400e;font-size:12px;margin:0;">Programme fidélité géré via <strong style="color:#f59e0b;">FlowIA</strong></p>
    </div>
  </div>
</body></html>`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `FlowIA <${process.env.SMTP_USER}>`,
      to, html,
      subject: `🎉 Récompense fidélité — ${discountStr} chez ${businessName} · Code : ${rewardCode}`,
    });
    console.log(`[MAIL LOYALTY OK] ${rewardCode} -> ${to}`);
  } catch(err) { console.error(`[MAIL LOYALTY ERR] ${err.message}`); }
}

// ── Email invitation client à créer son compte global ──────────────────────
async function sendClientInvite(to, clientName, businessName, inviteUrl) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:36px;text-align:center;">
      <div style="font-size:40px;margin-bottom:10px;">🎉</div>
      <h1 style="color:white;margin:0;font-size:22px;font-weight:800;">FlowIA</h1>
      <span style="display:inline-block;margin-top:10px;background:rgba(255,255,255,0.15);color:#e2e8f0;padding:4px 14px;border-radius:99px;font-size:12px;font-weight:600;">Invitation client</span>
    </div>
    <div style="padding:40px 36px;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 12px;font-weight:800;">Bonjour ${clientName} 👋</h2>
      <p style="color:#475569;font-size:15px;margin:0 0 20px;line-height:1.6;">
        <strong>${businessName}</strong> vous invite à créer votre compte client pour accéder à votre espace personnel :
      </p>
      <ul style="color:#475569;font-size:14px;margin:0 0 28px;padding-left:20px;line-height:2;">
        <li>📅 Réservez vos prochains rendez-vous en ligne</li>
        <li>🎫 Suivez vos points fidélité et codes promo</li>
        <li>📋 Consultez votre historique de prestations</li>
      </ul>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;text-decoration:none;padding:16px 36px;border-radius:16px;font-weight:800;font-size:16px;">Créer mon compte →</a>
      </div>
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">Ce lien est valable 7 jours. Si vous ne souhaitez pas créer de compte, ignorez cet email.</p>
    </div>
    <div style="background:#f8fafc;padding:18px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="color:#cbd5e1;font-size:11px;margin:0;">© ${new Date().getFullYear()} FlowIA</p>
    </div>
  </div>
</body></html>`;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `FlowIA <${process.env.SMTP_USER}>`,
      to, subject: `${businessName} vous invite sur FlowIA`, html,
    });
    return true;
  } catch(e) { console.error('[sendClientInvite]', e.message); return false; }
}


// ── Email annulation RDV ─────────────────────────────────────────────────────
async function sendAppointmentCancellation({ to, clientName, businessName, serviceName, date, startTime, reason, appointmentId }) {
  const refId = (appointmentId || '').substring(0, 8).toUpperCase();
  const [dy, dm, dd] = date.split('-').map(Number);
  const dateObj = new Date(dy, dm - 1, dd);
  const dateFr = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateCapitalized = dateFr.charAt(0).toUpperCase() + dateFr.slice(1);
  const MON = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff5f5;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#ef4444 0%,#f97316 100%);border-radius:24px 24px 0 0;padding:40px 36px;text-align:center;">
      <div style="width:64px;height:64px;background:rgba(255,255,255,0.2);border-radius:20px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:32px;">❌</div>
      <h1 style="color:white;margin:0;font-size:24px;font-weight:900;">Rendez-vous annulé</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Bonjour ${clientName}, votre rendez-vous a été annulé par l'établissement.</p>
    </div>
    <div style="background:white;padding:32px 36px;border-left:1px solid #fecaca;border-right:1px solid #fecaca;">
      <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:16px;padding:16px 20px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <p style="color:#ef4444;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;">Réservation annulée</p>
          <p style="color:#7f1d1d;font-size:20px;font-weight:900;font-family:monospace;margin:0;letter-spacing:3px;">#${refId}</p>
        </div>
        <span style="font-size:28px;">🚫</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #fef2f2;">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#ef4444,#f97316);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">🏪</div>
        <div><p style="color:#94a3b8;font-size:11px;font-weight:600;margin:0 0 2px;">Commerce</p><p style="color:#0f172a;font-size:15px;font-weight:700;margin:0;">${businessName}</p></div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #fef2f2;">
        <div style="width:40px;height:40px;background:rgba(239,68,68,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">✂️</div>
        <div><p style="color:#94a3b8;font-size:11px;font-weight:600;margin:0 0 2px;">Service</p><p style="color:#0f172a;font-size:15px;font-weight:700;margin:0;">${serviceName}</p></div>
      </div>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:16px;padding:20px 24px;margin:20px 0;">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="background:linear-gradient(135deg,#ef4444,#f97316);border-radius:12px;padding:8px 12px;text-align:center;flex-shrink:0;">
            <p style="color:white;font-size:22px;font-weight:900;margin:0;line-height:1;">${dd}</p>
            <p style="color:rgba(255,255,255,0.85);font-size:10px;font-weight:700;margin:0;text-transform:uppercase;">${MON[dm-1]}</p>
          </div>
          <div>
            <p style="color:#7f1d1d;font-size:15px;font-weight:800;margin:0 0 4px;">${dateCapitalized}</p>
            <p style="color:#ef4444;font-size:18px;font-weight:900;margin:0;">${startTime.substring(0,5)}</p>
          </div>
        </div>
      </div>
      ${reason ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;margin-bottom:16px;"><p style="color:#92400e;font-size:12px;font-weight:700;margin:0 0 4px;">📝 Motif</p><p style="color:#78350f;font-size:14px;margin:0;">${reason}</p></div>` : ''}
      <p style="color:#64748b;font-size:13px;text-align:center;margin:0;">Pour tout renseignement, contactez directement l'établissement.</p>
    </div>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:0 0 24px 24px;padding:18px 36px;text-align:center;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">Annulation via <strong style="color:#ef4444;">FlowIA</strong> · Réf. <span style="font-family:monospace;font-weight:700;">#${refId}</span></p>
    </div>
  </div>
</body></html>`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `FlowIA <${process.env.SMTP_USER}>`,
      to, html,
      subject: `❌ RDV annulé — ${serviceName} le ${dateCapitalized} · #${refId}`,
    });
    console.log(`[MAIL ANNUL OK] #${refId} -> ${to}`);
  } catch (err) { console.error(`[MAIL ANNUL ERR] ${err.message}`); }
}

async function sendEmployeeReminder({ to, employeeName, clientName, businessName, serviceName, date, startTime, minutesBefore }) {
  const [dy, dm, dd] = date.split('-').map(Number);
  const dateObj = new Date(dy, dm - 1, dd);
  const dateFr  = dateObj.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
  const dateCap = dateFr.charAt(0).toUpperCase() + dateFr.slice(1);

  let delayLabel;
  if (minutesBefore < 60)       delayLabel = `${minutesBefore} minute${minutesBefore > 1 ? 's' : ''}`;
  else if (minutesBefore < 1440) delayLabel = `${minutesBefore/60}h`;
  else                            delayLabel = `${Math.round(minutesBefore/1440)} jour(s)`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0fdf4;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#10b981,#059669);border-radius:24px 24px 0 0;padding:40px 36px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">📋</div>
      <h1 style="color:white;margin:0;font-size:24px;font-weight:900;">Rappel prestation</h1>
      <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:15px;">Dans ${delayLabel} · ${employeeName}</p>
    </div>
    <div style="background:white;padding:32px 36px;border:1px solid #d1fae5;border-top:none;">
      <div style="background:#f0fdf4;border:1px solid #a7f3d0;border-radius:16px;padding:18px 22px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:12px;color:#065f46;font-weight:700;text-transform:uppercase;">Client</p>
        <p style="margin:0;font-size:20px;font-weight:900;color:#064e3b;">${clientName}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:10px 0;border-bottom:1px solid #f0fdf4;color:#065f46;font-size:12px;font-weight:700;text-transform:uppercase;">SERVICE</td><td style="padding:10px 0;border-bottom:1px solid #f0fdf4;color:#0f172a;font-size:15px;font-weight:700;">${serviceName}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #f0fdf4;color:#065f46;font-size:12px;font-weight:700;text-transform:uppercase;">DATE</td><td style="padding:10px 0;border-bottom:1px solid #f0fdf4;color:#0f172a;font-size:15px;font-weight:700;">${dateCap}</td></tr>
        <tr><td style="padding:10px 0;color:#065f46;font-size:12px;font-weight:700;text-transform:uppercase;">HEURE</td><td style="padding:10px 0;color:#10b981;font-size:22px;font-weight:900;">${String(startTime).slice(0,5)}</td></tr>
      </table>
    </div>
    <div style="background:#f0fdf4;border:1px solid #d1fae5;border-radius:0 0 24px 24px;padding:16px;text-align:center;">
      <p style="color:#6b7280;font-size:11px;margin:0;">Via <strong style="color:#10b981;">FlowIA</strong> · ${businessName}</p>
    </div>
  </div>
</body></html>`;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `FlowIA <${process.env.SMTP_USER}>`,
      to, html,
      subject: `📋 Prestation dans ${delayLabel} — ${clientName} · ${String(startTime).slice(0,5)}`,
    });
    console.log(`[MAIL EMP REMINDER OK] -> ${to}`);
  } catch(err) { console.error(`[MAIL EMP REMINDER ERR] ${err.message}`); }
}


// ── Réinitialisation mot de passe client ──────────────────────────────────────
async function sendPasswordReset({ to, clientName, code }) {
  if (!transporter) return;
  const firstName = (clientName || '').split(' ')[0] || 'Client';
  await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'FlowIA'}" <${process.env.SMTP_FROM_EMAIL}>`,
    to,
    subject: 'Réinitialisation de votre mot de passe',
    html: `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<style>
  body{margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .wrap{max-width:520px;margin:40px auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08)}
  .hdr{background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:36px 40px;text-align:center}
  .hdr h1{color:#fff;margin:0;font-size:22px;font-weight:800}
  .body{padding:36px 40px}
  .code{font-size:40px;font-weight:900;letter-spacing:0.18em;color:#6366f1;background:#f0f0ff;border-radius:16px;padding:20px 32px;text-align:center;margin:24px 0;font-family:monospace}
  .note{font-size:13px;color:#64748b;margin-top:24px;text-align:center}
</style></head><body>
<div class="wrap">
  <div class="hdr"><h1>🔐 Réinitialisation du mot de passe</h1></div>
  <div class="body">
    <p style="font-size:15px;color:#1e293b">Bonjour ${firstName},</p>
    <p style="font-size:14px;color:#475569">Vous avez demandé à réinitialiser votre mot de passe. Voici votre code de vérification :</p>
    <div class="code">${code}</div>
    <p style="font-size:14px;color:#475569">Ce code est valable <strong>15 minutes</strong>. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
    <p class="note">Pour votre sécurité, ne partagez jamais ce code.</p>
  </div>
</div>
</body></html>`,
  });
}

// ── Email campagne promo ──────────────────────────────────────────────────────
async function sendPromoEmail({ to, clientName, businessName, promo }) {
  const { code, type, value, valid_from, valid_until, time_allday, time_from, time_until, min_purchase, max_uses, target_clients } = promo;

  const discountLabel = type === 'percent'
    ? `<strong style="color:#7c6af7;font-size:32px;font-weight:900;">${value}% de réduction</strong>`
    : `<strong style="color:#7c6af7;font-size:32px;font-weight:900;">${Number(value).toFixed(2)} € de réduction</strong>`;

  const conditions = [];
  if (valid_from)  conditions.push(`📅 Valide à partir du ${new Date(valid_from).toLocaleDateString('fr-FR')}`);
  if (valid_until) conditions.push(`⏳ Valide jusqu'au ${new Date(valid_until).toLocaleDateString('fr-FR')}`);
  if (!time_allday && time_from && time_until)
    conditions.push(`🕐 Uniquement de ${String(time_from).substring(0,5)} à ${String(time_until).substring(0,5)}`);
  if (min_purchase > 0) conditions.push(`🛒 Achat minimum : ${Number(min_purchase).toFixed(2)} €`);
  if (max_uses) conditions.push(`🔢 Limité à ${max_uses} utilisation${max_uses > 1 ? 's' : ''}`);
  if (target_clients === 'new') conditions.push(`🆕 Réservé aux nouveaux clients`);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#7c6af7,#4fd8eb);padding:36px 32px;text-align:center;">
      <p style="margin:0 0 6px;font-size:13px;color:rgba(255,255,255,0.8);letter-spacing:0.06em;text-transform:uppercase;">Offre exclusive de</p>
      <h1 style="margin:0;font-size:26px;font-weight:900;color:white;letter-spacing:-0.02em;">${businessName}</h1>
    </div>

    <!-- Corps -->
    <div style="padding:32px;text-align:center;">
      <p style="margin:0 0 6px;font-size:15px;color:#6b7280;">Bonjour ${clientName} 👋</p>
      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
        Nous avons une offre spéciale rien que pour vous !
      </p>

      ${discountLabel}

      <!-- Code promo encadré -->
      <div style="margin:28px 0;padding:20px;background:#f0edff;border:2px dashed #7c6af7;border-radius:16px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#7c6af7;text-transform:uppercase;letter-spacing:0.1em;">Votre code promo</p>
        <p style="margin:0;font-size:30px;font-weight:900;color:#4c1d95;letter-spacing:0.2em;font-family:'Courier New',monospace;">${code}</p>
      </div>

      <!-- Conditions -->
      ${conditions.length > 0 ? `
      <div style="text-align:left;background:#f9f9fc;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Conditions d'utilisation</p>
        ${conditions.map(c => `<p style="margin:0 0 6px;font-size:13px;color:#374151;">${c}</p>`).join('')}
      </div>` : ''}

      <p style="font-size:13px;color:#9ca3af;line-height:1.6;margin:0;">
        Présentez ce code lors de votre prochaine visite ou réservation en ligne.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9f9fc;padding:20px 32px;text-align:center;border-top:1px solid #f0f0f4;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        Vous recevez cet email car vous êtes client de <strong>${businessName}</strong>.<br/>
        Pour toute question, contactez directement votre prestataire.
      </p>
    </div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"${businessName}" <${process.env.SMTP_USER}>`,
      to,
      subject: `🎁 Offre spéciale — Code ${code} · ${businessName}`,
      html,
    });
    return true;
  } catch(e) {
    console.error('[sendPromoEmail]', e.message);
    return false;
  }
}

module.exports = {
  sendVerificationEmail,
  sendAppointmentConfirmation,
  sendAppointmentCancellation,
  sendDailyRecap,
  sendRdvReminder,
  sendLoyaltyReward,
  sendClientInvite,
  sendEmployeeReminder,
  sendPasswordReset,
  sendPromoEmail,
};