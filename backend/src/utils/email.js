require('dotenv').config();

// ── Brevo (ex-Sendinblue) — API HTTPS, jamais bloqué par Render ───────────
async function sendEmail({ to, subject, html, text, headers, replyTo, toName }) {
  const body = {
    sender: {
      name: process.env.SENDER_NAME || 'Hair Coiff Lille',
      email: process.env.SENDER_EMAIL || process.env.BREVO_FROM || 'contact@haircoifflille.fr'
    },
    to:       [{ email: to, ...(toName ? { name: toName } : {}) }],
    subject,
    htmlContent: html,
  };
  if (text) body.textContent = text;
  if (replyTo) body.replyTo = typeof replyTo === 'string' ? { email: replyTo } : replyTo;
  if (headers) body.headers = headers;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept':       'application/json',
      'api-key':      process.env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo error ${res.status}: ${err}`);
  }
  return res.json();
}

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
    await sendEmail({ to, subject, html });
    console.log(`[MAIL OK] ${subject} -> ${to}`);
  } catch (err) {
    console.error(`[MAIL ERREUR] ${err.message}`);
  }
}

// ── Email confirmation RDV (design carte rendez-vous) ─────────────────────
async function sendAppointmentConfirmation({ to, clientName, businessName, serviceName, employeeName, date, startTime, endTime, durationMinutes, price, finalPrice, discountAmount, promoCode, notes, appointmentId, bookingUrl, items }) {
  const refId = appointmentId.substring(0, 8).toUpperCase();
  const subject = `Confirmation de rendez-vous #${refId} — ${businessName}`;
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
    await sendEmail({ to, subject, html });
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
  const subject = `Récap du ${dateCapitalized} — ${businessName}`;
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
    await sendEmail({ to, subject, html });
    console.log(`[MAIL RECAP OK] ${date} -> ${to}`);
  } catch(err) { console.error(`[MAIL RECAP ERR] ${err.message}`); }
}

// ── Email rappel RDV client ───────────────────────────────────────────────────
async function sendRdvReminder({ to, clientName, businessName, serviceName, date, startTime, hoursBeforeLabel }) {
  const [dy, dm, dd] = date.split('-').map(Number);
  const dateObj = new Date(dy, dm - 1, dd);
  const dateFr = dateObj.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const dateCapitalized = dateFr.charAt(0).toUpperCase() + dateFr.slice(1);
  const subject = `Rappel : votre rendez-vous ${hoursBeforeLabel ? 'dans ' + hoursBeforeLabel : ''} — ${businessName}`;

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
    await sendEmail({ to, subject, html });
    console.log(`[MAIL REMINDER OK] -> ${to}`);
  } catch(err) { console.error(`[MAIL REMINDER ERR] ${err.message}`); }
}


// ── Email récompense fidélité ─────────────────────────────────────────────────
async function sendLoyaltyReward({ to, clientName, businessName, rewardCode, rewardType, rewardValue, rewardLabel, stampsRequired }) {
  const discountStr = rewardType === 'percent'
    ? `-${rewardValue}%`
    : `-${Number(rewardValue).toFixed(2)} €`;
  const subject = `🎉 Récompense fidélité débloquée : ${discountStr} chez ${businessName}`;

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
    await sendEmail({ to, subject, html });
    console.log(`[MAIL LOYALTY OK] ${rewardCode} -> ${to}`);
  } catch(err) { console.error(`[MAIL LOYALTY ERR] ${err.message}`); }
}

// ── Email invitation client à créer son compte global ──────────────────────
async function sendClientInvite(to, clientName, businessName, inviteUrl) {
  const subject = `${businessName} vous invite à créer votre compte client`;
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
    await sendEmail({ to, subject, html });
    return true;
  } catch(e) { console.error('[sendClientInvite]', e.message); return false; }
}


// ── Email annulation RDV ─────────────────────────────────────────────────────
async function sendAppointmentCancellation({ to, clientName, businessName, serviceName, date, startTime, reason, appointmentId }) {
  const refId = (appointmentId || '').substring(0, 8).toUpperCase();
  const subject = `Annulation de votre rendez-vous #${refId} — ${businessName}`;
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
    await sendEmail({ to, subject, html });
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

  const subject = `Rappel prestation : ${clientName} dans ${delayLabel} — ${businessName}`;

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
    await sendEmail({ to, subject, html });
    console.log(`[MAIL EMP REMINDER OK] -> ${to}`);
  } catch(err) { console.error(`[MAIL EMP REMINDER ERR] ${err.message}`); }
}


// ── Réinitialisation mot de passe client ──────────────────────────────────────
async function sendPasswordReset({ to, clientName, code }) {
  const firstName = (clientName || '').split(' ')[0] || 'Client';
  const subject = 'Réinitialisation de votre mot de passe — FlowIA';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:40px 20px;">
  <div style="max-width:460px;margin:0 auto;background:white;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:36px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:22px;font-weight:800;">FlowIA</h1>
    </div>
    <div style="padding:40px 36px;text-align:center;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 10px;font-weight:800;">Réinitialisation mot de passe</h2>
      <p style="color:#64748b;font-size:14px;margin:0 0 32px;">Bonjour ${firstName}, utilisez ce code pour réinitialiser votre mot de passe :</p>
      <div style="background:#f1f5f9;border:2px solid #e2e8f0;border-radius:20px;padding:28px 24px;margin-bottom:28px;">
        <div style="letter-spacing:14px;font-size:40px;font-weight:900;color:#0f172a;font-family:monospace;">${code}</div>
      </div>
      <p style="color:#94a3b8;font-size:13px;margin:0;">⏱ Ce code expire dans <strong>15 minutes</strong>.</p>
    </div>
    <div style="background:#f8fafc;padding:18px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="color:#cbd5e1;font-size:11px;margin:0;">© ${new Date().getFullYear()} FlowIA</p>
    </div>
  </div>
</body></html>`;
  try {
    await sendEmail({ to, subject, html });
    console.log(`[MAIL OK] ${subject} -> ${to}`);
  } catch(err) { console.error(`[MAIL PWD RESET ERR] ${err.message}`); }
}

// ── Email campagne promo ─────────────────────────────────────────────────────
// Optimisé pour atterrir en boîte principale Gmail (et non "Promotions") :
// - Sujet personnalisé avec prénom, sans mots marketing
// - Version texte brut complète
// - Reply-To vers l'email du commerçant (transactionnel vs bulk)
// - Header List-Unsubscribe (exigence Gmail 2024)
// - Design sobre, peu d'images/gradients, ratio texte/image élevé
async function sendPromoEmail({ to, clientName, businessName, promo, businessEmail, businessAddress, businessPhone }) {
  const { code, type, value, valid_from, valid_until, time_allday, time_from, time_until, min_purchase, max_uses, target_clients } = promo;
  const firstName = (clientName || '').split(' ')[0] || clientName || '';
  const discountStr = type === 'percent' ? `-${value}%` : `-${Number(value).toFixed(2)} €`;

  // Sujet personnalisé, ton transactionnel (pas "Offre exclusive" qui trigger Promotions)
  const subject = firstName
    ? `${firstName}, votre code ${code} de la part de ${businessName}`
    : `Votre code ${code} de la part de ${businessName}`;

  const conditions = [];
  if (valid_from)  conditions.push(`Valable à partir du ${new Date(valid_from).toLocaleDateString('fr-FR')}`);
  if (valid_until) conditions.push(`Valable jusqu'au ${new Date(valid_until).toLocaleDateString('fr-FR')}`);
  if (!time_allday && time_from && time_until)
    conditions.push(`Uniquement de ${String(time_from).substring(0,5)} à ${String(time_until).substring(0,5)}`);
  if (min_purchase > 0) conditions.push(`Achat minimum : ${Number(min_purchase).toFixed(2)} €`);
  if (max_uses) conditions.push(`Limité à ${max_uses} utilisation${max_uses > 1 ? 's' : ''}`);
  if (target_clients === 'new') conditions.push(`Réservé aux nouveaux clients`);

  // Version texte brut (indispensable pour Primary Inbox)
  const textLines = [
    `Bonjour ${firstName || clientName || ''},`,
    '',
    `${businessName} vous remet un code de réduction : ${discountStr}.`,
    '',
    `Code : ${code}`,
    '',
  ];
  if (conditions.length) {
    textLines.push('Conditions :');
    conditions.forEach(c => textLines.push(`- ${c}`));
    textLines.push('');
  }
  textLines.push('Présentez ce code lors de votre prochain passage ou utilisez-le lors de votre réservation en ligne.');
  textLines.push('');
  if (businessAddress) textLines.push(`Adresse : ${businessAddress}`);
  if (businessPhone)   textLines.push(`Téléphone : ${businessPhone}`);
  textLines.push('');
  textLines.push(`À bientôt,`);
  textLines.push(businessName);
  textLines.push('');
  textLines.push('---');
  textLines.push(`Pour ne plus recevoir ces messages, répondez STOP à cet email.`);
  const textContent = textLines.join('\n');

  // HTML sobre, sans gradient, peu d'emojis, ratio texte élevé
  const condHtml = conditions.length
    ? `<p style="margin:20px 0 6px;color:#111;font-size:14px;font-weight:600;">Conditions :</p>
       <ul style="margin:0;padding-left:20px;color:#333;font-size:14px;line-height:1.7;">
         ${conditions.map(c => `<li>${c}</li>`).join('')}
       </ul>`
    : '';

  const contactHtml = (businessAddress || businessPhone)
    ? `<p style="margin:20px 0 4px;color:#666;font-size:13px;">
         ${businessAddress ? `Adresse : ${businessAddress}<br/>` : ''}
         ${businessPhone ? `Téléphone : ${businessPhone}` : ''}
       </p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:24px 16px;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:28px 32px;">
    <p style="margin:0 0 18px;color:#111;font-size:15px;">Bonjour ${firstName || clientName || ''},</p>
    <p style="margin:0 0 18px;color:#111;font-size:15px;line-height:1.6;">
      ${businessName} vous remet un code de réduction de <strong>${discountStr}</strong> utilisable lors de votre prochaine visite.
    </p>
    <p style="margin:22px 0 6px;color:#666;font-size:13px;">Votre code :</p>
    <p style="margin:0 0 18px;font-family:Consolas,Menlo,monospace;font-size:22px;font-weight:700;color:#111;letter-spacing:2px;border:1px solid #ddd;padding:12px 16px;display:inline-block;border-radius:4px;background:#fafafa;">${code}</p>
    ${condHtml}
    <p style="margin:22px 0 0;color:#333;font-size:14px;line-height:1.6;">
      Présentez ce code lors de votre prochain passage ou saisissez-le au moment de votre réservation en ligne.
    </p>
    ${contactHtml}
    <p style="margin:22px 0 0;color:#111;font-size:14px;">À bientôt,<br/>${businessName}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0 14px;"/>
    <p style="margin:0;color:#999;font-size:11px;line-height:1.5;">
      Vous recevez cet email en tant que client de ${businessName}. Pour ne plus recevoir ces messages, répondez avec "STOP" en objet.
    </p>
  </div>
</body></html>`;

  const replyTo = businessEmail
    ? { email: businessEmail, name: businessName }
    : undefined;

  // List-Unsubscribe header (exigence Gmail/Yahoo 2024 pour éviter Promotions/Spam)
  const unsubEmail = businessEmail || process.env.SENDER_EMAIL || 'contact@haircoifflille.fr';
  const headers = {
    'List-Unsubscribe': `<mailto:${unsubEmail}?subject=STOP>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-Entity-Ref-ID': String(promo?.id || code),
  };

  try {
    await sendEmail({
      to, toName: clientName, subject, html, text: textContent,
      replyTo, headers,
    });
    console.log(`[MAIL PROMO OK] ${promo?.code || '?'} -> ${to}`);
    return true;
  } catch(e) {
    console.error(`[MAIL PROMO ERR] ${promo?.code || '?'} -> ${to} | ${e.message}`);
    return false;
  }
}

// ── Email récompense parrain (après validation en caisse) ─────────────────
async function sendReferralReward({ to, parrainName, filleulName, businessName, code, type, value, validUntil, businessEmail, businessPhone, businessAddress }) {
  const discountStr = type === 'percent' ? `-${value}%` : `-${Number(value).toFixed(2)} €`;
  const firstName = (parrainName || '').split(' ')[0] || 'vous';
  const subject = `${firstName}, votre réduction ${discountStr} chez ${businessName}`;
  const validStr = validUntil ? new Date(validUntil).toLocaleDateString('fr-FR') : null;

  const text = [
    `Bonjour ${firstName},`,
    '',
    `${filleulName || 'Votre filleul'} est venu chez ${businessName} grâce à vous. Merci !`,
    '',
    `Voici votre code de réduction : ${code}  (${discountStr})`,
    validStr ? `Valable jusqu'au ${validStr}.` : '',
    '',
    'Utilisable lors de votre prochaine visite, présentez ce code à l\'encaissement ou saisissez-le lors de votre prochaine réservation en ligne.',
    '',
    businessAddress ? `Adresse : ${businessAddress}` : '',
    businessPhone   ? `Téléphone : ${businessPhone}` : '',
    '',
    'À bientôt,',
    businessName,
  ].filter(Boolean).join('\n');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3ff;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#8b5cf6,#6366f1);border-radius:24px 24px 0 0;padding:40px 36px;text-align:center;">
      <div style="font-size:56px;margin-bottom:12px;">🤝</div>
      <h1 style="color:white;margin:0;font-size:26px;font-weight:900;">Merci pour votre parrainage !</h1>
      <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;font-size:15px;">${filleulName || 'Votre filleul'} est venu chez ${businessName} grâce à vous.</p>
    </div>
    <div style="background:white;padding:32px 36px;border-left:1px solid #e0e7ff;border-right:1px solid #e0e7ff;">
      <div style="background:linear-gradient(135deg,rgba(139,92,246,0.1),rgba(99,102,241,0.06));border:2px solid rgba(139,92,246,0.3);border-radius:20px;padding:24px;text-align:center;margin-bottom:24px;">
        <p style="color:#4c1d95;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Votre récompense</p>
        <p style="color:#8b5cf6;font-size:44px;font-weight:900;margin:0;font-family:monospace;">${discountStr}</p>
      </div>
      <p style="color:#6d28d9;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;text-align:center;">Votre code</p>
      <div style="background:#faf5ff;border:2px dashed #8b5cf6;border-radius:16px;padding:20px;text-align:center;margin-bottom:20px;">
        <p style="font-family:monospace;font-size:26px;font-weight:900;color:#4c1d95;letter-spacing:3px;margin:0;">${code}</p>
        ${validStr ? `<p style="color:#6d28d9;font-size:12px;margin:8px 0 0;">Valable jusqu'au ${validStr}</p>` : ''}
      </div>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">Présentez ce code lors de votre prochaine visite ou saisissez-le au moment de votre réservation en ligne.</p>
      ${(businessAddress || businessPhone) ? `<p style="color:#6b7280;font-size:13px;margin:16px 0 0;">${businessAddress ? `📍 ${businessAddress}<br/>` : ''}${businessPhone ? `☎ ${businessPhone}` : ''}</p>` : ''}
    </div>
    <div style="background:#f5f3ff;border:1px solid #e0e7ff;border-radius:0 0 24px 24px;padding:18px 36px;text-align:center;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">Programme parrainage <strong style="color:#8b5cf6;">${businessName}</strong></p>
    </div>
  </div>
</body></html>`;

  const replyTo = businessEmail ? { email: businessEmail, name: businessName } : undefined;
  try {
    await sendEmail({ to, subject, html, text, replyTo });
    console.log(`[MAIL REFERRAL OK] ${code} -> ${to}`);
    return true;
  } catch(e) {
    console.error(`[MAIL REFERRAL ERR] ${e.message}`);
    return false;
  }
}

// ── Email anniversaire client ─────────────────────────────────────────────
async function sendBirthdayPromo({ to, clientName, businessName, code, type, value, validUntil, customMessage, businessEmail, businessPhone, businessAddress }) {
  const discountStr = type === 'percent' ? `-${value}%` : `-${Number(value).toFixed(2)} €`;
  const firstName = (clientName || '').split(' ')[0] || '';
  const subject = `Joyeux anniversaire ${firstName ? firstName + ' ' : ''}— ${discountStr} offert par ${businessName}`;
  const validStr = validUntil ? new Date(validUntil).toLocaleDateString('fr-FR') : null;

  const text = [
    `Bon anniversaire ${firstName || 'cher client'} ! 🎂`,
    '',
    customMessage || `${businessName} vous offre ${discountStr} sur votre prochaine visite.`,
    '',
    `Code : ${code}`,
    validStr ? `Valable jusqu'au ${validStr}.` : '',
    '',
    businessAddress ? `Adresse : ${businessAddress}` : '',
    businessPhone   ? `Téléphone : ${businessPhone}` : '',
    '',
    'À bientôt,',
    businessName,
  ].filter(Boolean).join('\n');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff1f2;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#ec4899,#f97316);border-radius:24px 24px 0 0;padding:40px 36px;text-align:center;">
      <div style="font-size:64px;margin-bottom:12px;">🎂</div>
      <h1 style="color:white;margin:0;font-size:28px;font-weight:900;">Joyeux anniversaire !</h1>
      <p style="color:rgba(255,255,255,0.95);margin:10px 0 0;font-size:16px;">${firstName ? firstName + ', ' : ''}${businessName} pense à vous aujourd'hui.</p>
    </div>
    <div style="background:white;padding:32px 36px;border-left:1px solid #fecdd3;border-right:1px solid #fecdd3;">
      ${customMessage ? `<p style="color:#831843;font-size:15px;line-height:1.7;margin:0 0 20px;font-style:italic;text-align:center;">"${customMessage}"</p>` : ''}
      <div style="background:linear-gradient(135deg,rgba(236,72,153,0.1),rgba(249,115,22,0.08));border:2px solid rgba(236,72,153,0.3);border-radius:20px;padding:24px;text-align:center;margin-bottom:24px;">
        <p style="color:#9f1239;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Votre cadeau</p>
        <p style="color:#ec4899;font-size:48px;font-weight:900;margin:0;font-family:monospace;">${discountStr}</p>
        <p style="color:#831843;font-size:13px;margin:8px 0 0;">Sur votre prochaine visite</p>
      </div>
      <p style="color:#9f1239;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;text-align:center;">Votre code</p>
      <div style="background:#fff1f2;border:2px dashed #ec4899;border-radius:16px;padding:20px;text-align:center;margin-bottom:20px;">
        <p style="font-family:monospace;font-size:26px;font-weight:900;color:#831843;letter-spacing:3px;margin:0;">${code}</p>
        ${validStr ? `<p style="color:#be185d;font-size:12px;margin:8px 0 0;">Valable jusqu'au ${validStr}</p>` : ''}
      </div>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">Présentez ce code lors de votre prochaine visite ou saisissez-le au moment de votre réservation en ligne.</p>
      ${(businessAddress || businessPhone) ? `<p style="color:#6b7280;font-size:13px;margin:16px 0 0;">${businessAddress ? `📍 ${businessAddress}<br/>` : ''}${businessPhone ? `☎ ${businessPhone}` : ''}</p>` : ''}
    </div>
    <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:0 0 24px 24px;padding:18px 36px;text-align:center;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">Offre anniversaire <strong style="color:#ec4899;">${businessName}</strong></p>
    </div>
  </div>
</body></html>`;

  const replyTo = businessEmail ? { email: businessEmail, name: businessName } : undefined;
  try {
    await sendEmail({ to, subject, html, text, replyTo });
    console.log(`[MAIL BIRTHDAY OK] ${code} -> ${to}`);
    return true;
  } catch(e) {
    console.error(`[MAIL BIRTHDAY ERR] ${e.message}`);
    return false;
  }
}

module.exports = {
  sendEmail,
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
  sendReferralReward,
  sendBirthdayPromo,
};