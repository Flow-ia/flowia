require('dotenv').config();

// ── Helpers HTML FDS-2026 ─────────────────────────────────────────────────
// Toutes les valeurs dynamiques injectees dans les templates ci-dessous
// passent par escapeHtml() (XSS dans les notifications utilisateur).
const {
  escapeHtml,
  renderShell,
  renderInfoTable,
  renderNotice,
  renderCodeBlock,
  renderAmountSummary,
  renderCta,
  renderDivider,
  renderHeading,
} = require('./emailLayout');

// Lazy require de emailQueue pour éviter le cycle (emailQueue lazy-require
// ce module pour le fallback sync). Au 1er appel, Node aura terminé le
// chargement initial de emailQueue.js → safe.
let _enqueue = null;
function enqueue(payload, opts) {
  if (!_enqueue) _enqueue = require('./emailQueue').enqueueEmail;
  return _enqueue(payload, opts);
}

// ── Brevo (ex-Sendinblue) — API HTTPS, jamais bloqué par Render ───────────
// Le parametre `from` est optionnel : utilisez-le pour overrider le sender
// par defaut (utile pour /contact qui doit eviter le self-loopback
// contact@→contact@ qui finit souvent en spam).
async function sendEmail({ to, subject, html, text, headers, replyTo, toName, from }) {
  const senderEmail = from
    || process.env.SENDER_EMAIL
    || process.env.BREVO_FROM
    || 'contact@flowiapro.com';
  const body = {
    sender: {
      name: process.env.SENDER_NAME || 'FlowIA',
      email: senderEmail,
    },
    to:       [{ email: to, ...(toName ? { name: toName } : {}) }],
    subject,
    htmlContent: html,
  };
  if (text) body.textContent = text;
  if (replyTo) body.replyTo = typeof replyTo === 'string' ? { email: replyTo } : replyTo;
  if (headers) body.headers = headers;

  if (!process.env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY env var manquante — email non envoye');
  }

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
  const badges = {
    default:       '',
    register:      'Inscription',
    pin_change:    'Sécurité PIN',
    lockout_alert: 'Alerte sécurité',
    email:         'Vérification email',
  };
  const badge = badges[context] || badges.default;
  const kicker = badge ? `FlowIA · ${badge}` : 'FlowIA';

  const intro = context === 'lockout_alert'
    ? `<p style="margin:0;">Une tentative répétée a été détectée sur votre compte. Utilisez le code ci-dessous pour confirmer qu'il s'agit bien de vous :</p>`
    : `<p style="margin:0;">Entrez ce code à 6 chiffres dans l'application pour continuer :</p>`;

  let sections = renderCodeBlock(code);
  sections += renderNotice({
    tone: context === 'lockout_alert' ? 'danger' : 'info',
    text: `Ce code expire dans <strong style="font-weight:500;">15 minutes</strong>. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  });

  const html = renderShell({
    preheader: `Votre code de vérification FlowIA`,
    kicker,
    title: escapeHtml(subject),
    intro,
    sections,
    footerNote: `© ${new Date().getFullYear()} FlowIA`,
  });

  try {
    await sendEmail({ to, subject, html });
    console.log(`[MAIL OK] ${subject} -> ${to}`);
  } catch (err) {
    console.error(`[MAIL ERREUR] ${err.message}`);
  }
}

// ── Email confirmation RDV (design carte rendez-vous) ─────────────────────
async function sendAppointmentConfirmation({ to, clientName, businessName, serviceName, employeeName, date, startTime, endTime, durationMinutes, price, finalPrice, discountAmount, promoCode, notes, appointmentId, bookingUrl, items, paidAmountCents }) {
  const refId = appointmentId.substring(0, 8).toUpperCase();
  const subject = `Confirmation de rendez-vous #${refId} — ${businessName}`;
  // Parser la date YYYY-MM-DD sans ambiguïté de timezone
  // new Date('2026-03-13') → UTC minuit → peut décaler d'1 jour selon timezone serveur
  // Solution : construire la date en local explicitement
  const [dy, dm, dd] = date.split('-').map(Number);
  const dateObj = new Date(dy, dm - 1, dd); // constructeur local → pas de décalage UTC
  const dateFr = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateCapitalized = dateFr.charAt(0).toUpperCase() + dateFr.slice(1);

  const safeClient = escapeHtml(clientName);
  const safeBusiness = escapeHtml(businessName);

  // Lignes du tableau d'infos.
  const infoRows = [
    { label: 'Référence', value: `#${escapeHtml(refId)}`, valueIsMono: true },
    { label: 'Établissement', value: safeBusiness },
    { label: 'Date', value: escapeHtml(dateCapitalized) },
    { label: 'Créneau', value: `${escapeHtml(startTime.substring(0,5))} – ${escapeHtml(endTime.substring(0,5))}` },
  ];
  if (employeeName) infoRows.push({ label: 'Avec', value: escapeHtml(employeeName) });

  // Construction du detail prestations.
  let servicesHtml = '';
  if (items && items.length > 0) {
    const lines = items.map(it => {
      const qty = it.qty > 1 ? ` × ${escapeHtml(it.qty)}` : '';
      const dur = it.duration_minutes > 0 ? ` · ${escapeHtml(it.duration_minutes)} min` : '';
      const price = it.unit_price > 0
        ? `<td style="padding:6px 0;font-size:13px;text-align:right;font-family:ui-monospace,Menlo,monospace;color:#111;">${escapeHtml((it.unit_price * it.qty).toFixed(2))} €</td>`
        : '<td></td>';
      return `<tr><td style="padding:6px 0;font-size:13px;color:#111;">${escapeHtml(it.service_name)}${qty}${dur}</td>${price}</tr>`;
    }).join('');
    servicesHtml = renderHeading('Prestations') +
      `<table style="width:100%;border-collapse:collapse;margin:0 0 8px 0;">${lines}</table>`;
  } else if (serviceName) {
    const sRows = [
      { label: 'Service', value: escapeHtml(serviceName) },
    ];
    if (durationMinutes) sRows.push({ label: 'Durée', value: `${escapeHtml(durationMinutes)} min` });
    if (price) sRows.push({ label: 'Prix', value: `${escapeHtml(Number(price).toFixed(2))} €`, valueIsMono: true });
    servicesHtml = renderHeading('Prestation') + renderInfoTable(sRows);
  }

  // Section promo si reduction.
  let promoHtml = '';
  if (discountAmount > 0) {
    const promoItems = [
      { label: 'Prix initial', value: `${(price != null ? Number(price).toFixed(2) : '—')} €`, line_through: true },
      { label: 'Réduction', value: `-${Number(discountAmount).toFixed(2)} €` },
    ];
    promoHtml = renderHeading(promoCode ? `Code promo · ${promoCode}` : 'Réduction appliquée') +
      renderAmountSummary({
        items: promoItems,
        total: { label: 'Prix final', value: `${finalPrice != null ? Number(finalPrice).toFixed(2) : '—'} €` },
      });
  }

  // Phase 5/5 — confirmation paiement en ligne (si applicable)
  const paidHtml = paidAmountCents > 0
    ? renderNotice({ tone: 'success',
        text: `<strong style="font-weight:500;">Paiement encaissé :</strong> ${(paidAmountCents/100).toFixed(2).replace('.',',')} € via Stripe.` })
    : '';

  // Notes client (utilisateur peut avoir saisi du texte libre, escapeHtml strict).
  const notesHtml = notes
    ? renderNotice({ tone: 'info', text: `<strong style="font-weight:500;">Note :</strong> ${escapeHtml(notes)}` })
    : '';

  // CTA gestion des RDV.
  const ctaHtml = bookingUrl
    ? renderCta({ href: `${bookingUrl}/client/appointments`, label: 'Gérer mes rendez-vous' })
    : '';

  const sections = renderInfoTable(infoRows) + servicesHtml + promoHtml + paidHtml + notesHtml + ctaHtml;

  const intro = `<p style="margin:0;">Bonjour ${safeClient}, votre rendez-vous chez ${safeBusiness} est enregistré.</p>`;

  const html = renderShell({
    preheader: `Confirmation de rendez-vous #${refId} — ${dateCapitalized} à ${startTime.substring(0,5)}`,
    kicker: 'FlowIA · Confirmation',
    title: 'Rendez-vous confirmé',
    intro,
    sections,
    footerNote: `Pour annuler ou modifier, contactez l'établissement ou gérez votre rendez-vous en ligne. Référence #${refId} · ${new Date().getFullYear()} FlowIA`,
  });

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

  const kpiRows = [
    { label: 'Chiffre d\'affaires', value: `${escapeHtml(fmtMoney(ca))} €`, valueIsMono: true },
    { label: 'Prestations', value: escapeHtml(String(nbPrest || 0)), valueIsMono: true },
    { label: 'Rendez-vous', value: escapeHtml(String(nbRdv || 0)), valueIsMono: true },
  ];
  if (topEmployee) {
    kpiRows.push({
      label: 'Top employé',
      value: `${escapeHtml(topEmployee.name)} <span style="color:#6b7280;">· ${escapeHtml(String(topEmployee.count || 0))} prest.</span>`,
    });
  }

  let txHtml = '';
  if (transactions && transactions.length > 0) {
    const lines = transactions.slice(0, 5).map(t => {
      const desc = escapeHtml(t.description || t.category_name || 'Transaction');
      const amt = `+${fmtMoney(t.amount)} €`;
      return `<tr>
        <td style="padding:8px 0;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;">${desc}</td>
        <td style="padding:8px 0;font-size:13px;color:#111;text-align:right;font-family:ui-monospace,Menlo,monospace;border-top:1px solid #e5e7eb;">${escapeHtml(amt)}</td>
      </tr>`;
    }).join('');
    txHtml = renderHeading('Dernières transactions') +
      `<table style="width:100%;border-collapse:collapse;margin:0 0 8px 0;">${lines}</table>`;
  } else {
    txHtml = renderNotice({ tone: 'info', text: `Aucune transaction enregistrée aujourd'hui.` });
  }

  const sections = renderHeading('Indicateurs du jour') + renderInfoTable(kpiRows) + txHtml;

  const html = renderShell({
    preheader: `Récap ${dateCapitalized} — ${businessName}`,
    kicker: 'FlowIA · Récap journalier',
    title: 'Récap de la journée',
    intro: `<p style="margin:0;">${escapeHtml(businessName)} — ${escapeHtml(dateCapitalized)}.</p>`,
    sections,
    footerNote: `Récap automatique généré par FlowIA`,
  });

  try {
    // Migré vers queue (commit 30 — non-critique, cron quotidien)
    await enqueue({ to, subject, html });
    console.log(`[MAIL RECAP queued] ${date} -> ${to}`);
  } catch(err) { console.error(`[MAIL RECAP ERR] ${err.message}`); }
}

// ── Email rappel RDV client ───────────────────────────────────────────────────
async function sendRdvReminder({ to, clientName, businessName, serviceName, date, startTime, hoursBeforeLabel }) {
  const [dy, dm, dd] = date.split('-').map(Number);
  const dateObj = new Date(dy, dm - 1, dd);
  const dateFr = dateObj.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const dateCapitalized = dateFr.charAt(0).toUpperCase() + dateFr.slice(1);
  const subject = `Rappel : votre rendez-vous ${hoursBeforeLabel ? 'dans ' + hoursBeforeLabel : ''} — ${businessName}`;

  const rows = [
    { label: 'Date', value: escapeHtml(dateCapitalized) },
    { label: 'Heure', value: escapeHtml(startTime.substring(0,5)) },
    { label: 'Service', value: escapeHtml(serviceName) },
    { label: 'Établissement', value: escapeHtml(businessName) },
  ];

  const intro = `<p style="margin:0;">Bonjour ${escapeHtml(clientName)}, votre rendez-vous chez ${escapeHtml(businessName)} approche${hoursBeforeLabel ? ` (dans ${escapeHtml(hoursBeforeLabel)})` : ''}.</p>`;

  const sections = renderInfoTable(rows) +
    renderNotice({
      tone: 'info',
      text: `En cas d'imprévu, contactez l'établissement au plus tôt pour libérer le créneau.`,
    });

  const html = renderShell({
    preheader: `Rappel rendez-vous ${dateCapitalized} ${startTime.substring(0,5)}`,
    kicker: 'FlowIA · Rappel',
    title: 'Rappel de rendez-vous',
    intro,
    sections,
    footerNote: `Rappel automatique envoyé par FlowIA`,
  });

  try {
    // Migré vers queue (commit 30 — non-critique, cron rappels RDV)
    await enqueue({ to, subject, html });
    console.log(`[MAIL REMINDER queued] -> ${to}`);
  } catch(err) { console.error(`[MAIL REMINDER ERR] ${err.message}`); }
}


// ── Email récompense fidélité ─────────────────────────────────────────────────
async function sendLoyaltyReward({ to, clientName, businessName, rewardCode, rewardType, rewardValue, rewardLabel, stampsRequired }) {
  const discountStr = rewardType === 'percent'
    ? `-${rewardValue}%`
    : `-${Number(rewardValue).toFixed(2)} €`;
  const subject = `Récompense fidélité débloquée : ${discountStr} chez ${businessName}`;

  const rows = [
    { label: 'Récompense', value: escapeHtml(discountStr) },
    { label: 'Détail', value: escapeHtml(rewardLabel || '—') },
    { label: 'Établissement', value: escapeHtml(businessName) },
    { label: 'Visites cumulées', value: escapeHtml(String(stampsRequired || 0)) },
  ];

  const intro = `<p style="margin:0;">Bonjour ${escapeHtml(clientName)}, vous avez atteint ${escapeHtml(String(stampsRequired || 0))} visites chez ${escapeHtml(businessName)}. Voici votre code de réduction :</p>`;

  const sections =
    renderCodeBlock(rewardCode) +
    renderInfoTable(rows) +
    renderNotice({
      tone: 'info',
      text: `Code valable 90 jours. Saisissez-le lors de votre prochaine réservation en ligne ou communiquez-le à votre prestataire à l'encaissement.`,
    });

  const html = renderShell({
    preheader: `Récompense fidélité ${discountStr} — ${businessName}`,
    kicker: 'FlowIA · Programme fidélité',
    title: 'Récompense débloquée',
    intro,
    sections,
    footerNote: `Programme fidélité géré via FlowIA`,
  });

  try {
    // Migré vers queue (commit 30 — non-critique, déclenché en transaction)
    await enqueue({ to, subject, html });
    console.log(`[MAIL LOYALTY queued] ${rewardCode} -> ${to}`);
  } catch(err) { console.error(`[MAIL LOYALTY ERR] ${err.message}`); }
}

// ── Email invitation client à créer son compte global ──────────────────────
async function sendClientInvite(to, clientName, businessName, inviteUrl) {
  const subject = `${businessName} vous invite à créer votre compte client`;

  const intro = `<p style="margin:0;">Bonjour ${escapeHtml(clientName)},<br/>${escapeHtml(businessName)} vous invite à créer votre compte client pour accéder à votre espace personnel.</p>`;

  const benefitsList = `<ul style="margin:0 0 8px 0;padding-left:20px;color:#374151;font-size:13px;line-height:1.8;">
    <li>Réserver vos prochains rendez-vous en ligne</li>
    <li>Suivre vos points fidélité et codes promo</li>
    <li>Consulter votre historique de prestations</li>
  </ul>`;

  const sections =
    renderHeading('Votre espace client') +
    benefitsList +
    renderCta({ href: inviteUrl, label: 'Créer mon compte' }) +
    renderNotice({ tone: 'info', text: `Ce lien est valable 7 jours. Si vous ne souhaitez pas créer de compte, ignorez simplement cet email.` });

  const html = renderShell({
    preheader: `Invitation à créer votre compte client ${businessName}`,
    kicker: 'FlowIA · Invitation',
    title: 'Créez votre compte client',
    intro,
    sections,
    footerNote: `© ${new Date().getFullYear()} FlowIA`,
  });
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

  // Variable MON conservee pour ne pas casser la structure existante meme si
  // plus utilisee dans le HTML : on garde les calculs au-dessus.
  void MON;

  const rows = [
    { label: 'Référence', value: `#${escapeHtml(refId)}`, valueIsMono: true },
    { label: 'Établissement', value: escapeHtml(businessName) },
    { label: 'Service', value: escapeHtml(serviceName) },
    { label: 'Date', value: escapeHtml(dateCapitalized) },
    { label: 'Heure', value: escapeHtml(startTime.substring(0,5)) },
  ];

  const intro = `<p style="margin:0;">Bonjour ${escapeHtml(clientName)}, votre rendez-vous chez ${escapeHtml(businessName)} a été annulé par l'établissement.</p>`;

  const reasonHtml = reason
    ? renderNotice({ tone: 'warning', text: `<strong style="font-weight:500;">Motif :</strong> ${escapeHtml(reason)}` })
    : '';

  const sections =
    renderInfoTable(rows) +
    reasonHtml +
    renderNotice({ tone: 'info', text: `Pour tout renseignement ou pour reprendre rendez-vous, contactez directement l'établissement.` });

  const html = renderShell({
    preheader: `Annulation rendez-vous #${refId} — ${businessName}`,
    kicker: 'FlowIA · Annulation',
    title: 'Rendez-vous annulé',
    intro,
    sections,
    footerNote: `Référence #${refId} · ${new Date().getFullYear()} FlowIA`,
  });

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

  const rows = [
    { label: 'Client', value: escapeHtml(clientName) },
    { label: 'Service', value: escapeHtml(serviceName) },
    { label: 'Date', value: escapeHtml(dateCap) },
    { label: 'Heure', value: escapeHtml(String(startTime).slice(0,5)) },
    { label: 'Échéance', value: `dans ${escapeHtml(delayLabel)}` },
  ];

  const intro = `<p style="margin:0;">Bonjour ${escapeHtml(employeeName)}, vous avez une prestation prévue dans ${escapeHtml(delayLabel)}.</p>`;

  const sections = renderInfoTable(rows);

  const html = renderShell({
    preheader: `${clientName} · ${dateCap} ${String(startTime).slice(0,5)}`,
    kicker: `FlowIA · ${escapeHtml(businessName)}`,
    title: 'Rappel prestation',
    intro,
    sections,
    footerNote: `Rappel équipe envoyé par FlowIA`,
  });
  try {
    // Migré vers queue (commit 30 — non-critique, cron rappels employés)
    await enqueue({ to, subject, html });
    console.log(`[MAIL EMP REMINDER queued] -> ${to}`);
  } catch(err) { console.error(`[MAIL EMP REMINDER ERR] ${err.message}`); }
}


// ── Réinitialisation mot de passe client ──────────────────────────────────────
async function sendPasswordReset({ to, clientName, code }) {
  const firstName = (clientName || '').split(' ')[0] || 'Client';
  const subject = 'Réinitialisation de votre mot de passe — FlowIA';

  const intro = `<p style="margin:0;">Bonjour ${escapeHtml(firstName)}, utilisez ce code pour réinitialiser votre mot de passe :</p>`;
  const sections =
    renderCodeBlock(code) +
    renderNotice({
      tone: 'warning',
      text: `Ce code expire dans <strong style="font-weight:500;">15 minutes</strong>. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email et changez votre mot de passe par sécurité.`,
    });

  const html = renderShell({
    preheader: `Code de réinitialisation FlowIA`,
    kicker: 'FlowIA · Sécurité',
    title: 'Réinitialisation mot de passe',
    intro,
    sections,
    footerNote: `© ${new Date().getFullYear()} FlowIA`,
  });
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
async function sendPromoEmail({ to, clientName, businessName, promo, businessEmail, businessAddress, businessPhone, unsubscribeToken }) {
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
  {
    const { marketingFooterText } = require('./unsubscribe');
    textLines.push(marketingFooterText({ token: unsubscribeToken, businessEmail }));
  }
  const textContent = textLines.join('\n');

  // Conditions : liste a puces sobre.
  const condHtml = conditions.length
    ? renderHeading('Conditions') +
      `<ul style="margin:0 0 8px 0;padding-left:20px;color:#374151;font-size:13px;line-height:1.7;">${conditions.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`
    : '';

  // Contact en table cle/valeur.
  const contactRows = [];
  if (businessAddress) contactRows.push({ label: 'Adresse', value: escapeHtml(businessAddress) });
  if (businessPhone)   contactRows.push({ label: 'Téléphone', value: escapeHtml(businessPhone), valueIsMono: true });
  const contactHtml = contactRows.length
    ? renderHeading('Contact') + renderInfoTable(contactRows)
    : '';

  const safeBusiness = escapeHtml(businessName);
  const intro = `<p style="margin:0;">Bonjour ${escapeHtml(firstName || clientName || '')},<br/>${safeBusiness} vous remet un code de réduction de <strong style="font-weight:500;">${escapeHtml(discountStr)}</strong> utilisable lors de votre prochaine visite.</p>`;

  const sections =
    renderCodeBlock(code) +
    condHtml +
    `<p style="margin:16px 0 0 0;color:#374151;font-size:13px;line-height:1.6;">Présentez ce code lors de votre prochain passage ou saisissez-le au moment de votre réservation en ligne.</p>` +
    contactHtml +
    `<p style="margin:24px 0 0 0;color:#111;font-size:13px;">À bientôt,<br/>${safeBusiness}</p>`;

  // marketingFooterHtml externe non escape : conserve tel quel pour ne pas
  // alterer le contenu du footer RGPD desabonnement.
  const marketingFooter = require('./unsubscribe').marketingFooterHtml({
    token: unsubscribeToken, businessName, businessEmail, context: 'sendPromoEmail',
  });

  const html = renderShell({
    preheader: `${discountStr} chez ${businessName} — code ${code}`,
    kicker: `FlowIA · ${safeBusiness}`,
    title: subject,
    intro,
    sections: sections + marketingFooter,
    footerNote: null,
  });

  const replyTo = businessEmail
    ? { email: businessEmail, name: businessName }
    : undefined;

  // List-Unsubscribe header (RFC 2369 + RFC 8058 1-clic) — Gmail/Yahoo 2024.
  const { unsubscribeHeaders } = require('./unsubscribe');
  const headers = unsubscribeHeaders({
    token: unsubscribeToken, businessEmail, refId: promo?.id || code,
  });

  try {
    // Migré vers queue (commit 30 — non-critique, campagne marketing)
    await enqueue({
      to, toName: clientName, subject, html, text: textContent,
      replyTo, headers,
    });
    console.log(`[MAIL PROMO queued] ${promo?.code || '?'} -> ${to}`);
    return true;
  } catch(e) {
    console.error(`[MAIL PROMO ERR] ${promo?.code || '?'} -> ${to} | ${e.message}`);
    return false;
  }
}

// ── Email récompense parrain (après validation en caisse) ─────────────────
async function sendReferralReward({ to, parrainName, filleulName, businessName, code, type, value, validUntil, businessEmail, businessPhone, businessAddress, unsubscribeToken }) {
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

  const safeBusiness = escapeHtml(businessName);
  const safeFilleul = escapeHtml(filleulName || 'Votre filleul');

  const rows = [
    { label: 'Récompense', value: escapeHtml(discountStr) },
    { label: 'Établissement', value: safeBusiness },
  ];
  if (validStr) rows.push({ label: 'Valable jusqu\'au', value: escapeHtml(validStr) });

  const contactRows = [];
  if (businessAddress) contactRows.push({ label: 'Adresse', value: escapeHtml(businessAddress) });
  if (businessPhone)   contactRows.push({ label: 'Téléphone', value: escapeHtml(businessPhone), valueIsMono: true });
  const contactHtml = contactRows.length
    ? renderHeading('Contact') + renderInfoTable(contactRows)
    : '';

  const intro = `<p style="margin:0;">Bonjour ${escapeHtml(firstName)},<br/>${safeFilleul} est venu chez ${safeBusiness} grâce à vous. Voici votre récompense :</p>`;

  const sections =
    renderCodeBlock(code) +
    renderInfoTable(rows) +
    `<p style="margin:16px 0 0 0;color:#374151;font-size:13px;line-height:1.6;">Présentez ce code lors de votre prochaine visite ou saisissez-le au moment de votre réservation en ligne.</p>` +
    contactHtml;

  const marketingFooter = require('./unsubscribe').marketingFooterHtml({
    token: unsubscribeToken, businessName, businessEmail, context: 'sendReferralReward',
  });

  const html = renderShell({
    preheader: `Votre récompense parrainage ${discountStr} chez ${businessName}`,
    kicker: `FlowIA · ${safeBusiness}`,
    title: 'Merci pour votre parrainage',
    intro,
    sections: sections + marketingFooter,
    footerNote: null,
  });

  const replyTo = businessEmail ? { email: businessEmail, name: businessName } : undefined;
  const { unsubscribeHeaders } = require('./unsubscribe');
  const headers = unsubscribeHeaders({ token: unsubscribeToken, businessEmail, refId: code });
  try {
    // Migré vers queue (commit 30 — non-critique, déclenché à validation parrainage)
    await enqueue({ to, subject, html, text, replyTo, headers });
    console.log(`[MAIL REFERRAL queued] ${code} -> ${to}`);
    return true;
  } catch(e) {
    console.error(`[MAIL REFERRAL ERR] ${e.message}`);
    return false;
  }
}

// ── Email anniversaire client ─────────────────────────────────────────────
// Audit Z : accepte `unsubscribeToken` pour conformité RGPD.
async function sendBirthdayPromo({ to, clientName, businessName, code, type, value, validUntil, customMessage, businessEmail, businessPhone, businessAddress, unsubscribeToken, monthName, monthNum }) {
  const discountStr = type === 'percent' ? `-${value}%` : `-${Number(value).toFixed(2)} €`;
  const firstName = (clientName || '').split(' ')[0] || '';
  // Commit 24b — sujet et corps évoquent le mois (envoi 1er du mois, code
  // valable tout le mois) plutôt que le jour exact.
  const subject = `Joyeux anniversaire${firstName ? ' ' + firstName : ''}, votre cadeau vous attend`;
  const validStr = validUntil ? new Date(validUntil).toLocaleDateString('fr-FR') : null;
  const monthLabel = monthName || (validUntil ? new Date(validUntil).toLocaleDateString('fr-FR', { month: 'long' }) : '');
  const validUntilShort = validUntil
    ? `${String(new Date(validUntil).getDate()).padStart(2, '0')}/${String(monthNum || (new Date(validUntil).getMonth() + 1)).padStart(2, '0')}`
    : null;

  const intro = customMessage
    ? customMessage
    : `En ce mois de ${monthLabel}, profitez de ${discountStr} sur votre prochaine visite chez ${businessName}.`;

  const text = [
    `Joyeux anniversaire ${firstName || 'cher client'} !`,
    '',
    intro,
    '',
    `Code : ${code}`,
    validUntilShort ? `Valable jusqu'au ${validUntilShort}.` : (validStr ? `Valable jusqu'au ${validStr}.` : ''),
    '',
    businessAddress ? `Adresse : ${businessAddress}` : '',
    businessPhone   ? `Téléphone : ${businessPhone}` : '',
    '',
    'À très bientôt,',
    businessName,
  ].filter(Boolean).join('\n');

  const safeBusiness = escapeHtml(businessName);

  const introBody = customMessage
    ? `<p style="margin:0;font-style:italic;">${escapeHtml(customMessage)}</p>`
    : `<p style="margin:0;">Joyeux anniversaire${firstName ? ' ' + escapeHtml(firstName) : ''} ! En ce mois de ${escapeHtml(monthLabel)}, profitez de <strong style="font-weight:500;">${escapeHtml(discountStr)}</strong> sur votre prochaine visite chez ${safeBusiness}.</p>`;

  const rows = [
    { label: 'Cadeau', value: escapeHtml(discountStr) },
    { label: 'Établissement', value: safeBusiness },
  ];
  if (validUntilShort) rows.push({ label: 'Valable jusqu\'au', value: escapeHtml(validUntilShort) });
  else if (validStr)   rows.push({ label: 'Valable jusqu\'au', value: escapeHtml(validStr) });

  const contactRows = [];
  if (businessAddress) contactRows.push({ label: 'Adresse', value: escapeHtml(businessAddress) });
  if (businessPhone)   contactRows.push({ label: 'Téléphone', value: escapeHtml(businessPhone), valueIsMono: true });
  const contactHtml = contactRows.length
    ? renderHeading('Contact') + renderInfoTable(contactRows)
    : '';

  const sections =
    renderCodeBlock(code) +
    renderInfoTable(rows) +
    `<p style="margin:16px 0 0 0;color:#374151;font-size:13px;line-height:1.6;">Présentez ce code lors de votre prochaine visite ou saisissez-le au moment de votre réservation en ligne.</p>` +
    contactHtml;

  const marketingFooter = require('./unsubscribe').marketingFooterHtml({
    token: unsubscribeToken, businessName, businessEmail, context: 'sendBirthdayPromo',
  });

  const html = renderShell({
    preheader: `Joyeux anniversaire — ${discountStr} chez ${businessName}`,
    kicker: `FlowIA · ${safeBusiness}`,
    title: 'Joyeux anniversaire',
    intro: introBody,
    sections: sections + marketingFooter,
    footerNote: null,
  });

  const replyTo = businessEmail ? { email: businessEmail, name: businessName } : undefined;
  const { unsubscribeHeaders } = require('./unsubscribe');
  const headers = unsubscribeHeaders({ token: unsubscribeToken, businessEmail, refId: code });
  try {
    // Migré vers queue (commit 30 — non-critique, cron mensuel anniversaire)
    await enqueue({ to, subject, html, text, replyTo, headers });
    console.log(`[MAIL BIRTHDAY queued] ${code} -> ${to}`);
    return true;
  } catch(e) {
    console.error(`[MAIL BIRTHDAY ERR] ${e.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sendReferralWelcome — email au filleul juste après son inscription via un
// lien de parrainage. Rappelle le code, le montant de la remise, et précise
// que la promo s'applique au premier RDV ou encaissement selon les conditions
// du commerçant.
// ─────────────────────────────────────────────────────────────────────────────
async function sendReferralWelcome({ to, filleulName, businessName, code, type, value }) {
  const valStr = type === 'percent' ? `${value}%` : `${Number(value).toFixed(2)} €`;
  const subject = `Bienvenue chez ${businessName || 'votre commerçant'} — parrainage appliqué`;
  const safeBusiness = escapeHtml(businessName || 'votre commerçant');

  const intro = `<p style="margin:0;">Bienvenue${filleulName ? ' ' + escapeHtml(filleulName) : ''}, vous avez créé votre compte via un lien de parrainage chez ${safeBusiness}. Votre remise est déjà active :</p>`;

  const rows = [
    { label: 'Remise', value: escapeHtml(valStr) },
    { label: 'Établissement', value: safeBusiness },
    { label: 'Statut', value: 'Parrainage actif' },
  ];

  const sections =
    renderCodeBlock(code) +
    renderInfoTable(rows) +
    renderNotice({
      tone: 'info',
      text: `La remise s'applique automatiquement lors de votre premier rendez-vous ou encaissement, selon les conditions du commerçant (nouveaux clients uniquement, quota parrain, non cumulable avec d'autres promotions).`,
    });

  const html = renderShell({
    preheader: `Parrainage appliqué — remise de ${valStr}`,
    kicker: `FlowIA · ${safeBusiness}`,
    title: `Bienvenue${filleulName ? ' ' + escapeHtml(filleulName) : ''}`,
    intro,
    sections,
    footerNote: `FlowIA — email automatique, ne pas répondre`,
  });
  // Migré vers queue (commit 30 — non-critique, envoyé après création code parrainage)
  return enqueue({ to, subject, html });
}

// ─────────────────────────────────────────────────────────────────────────────
// J3 : compteur email GLOBAL cluster-safe (DB-backed, remplace
// global.emailsToday qui vivait en mémoire par worker).
// + helper per-user coherent avec users.email_sent_today
// ─────────────────────────────────────────────────────────────────────────────
const { pool: _emailPool } = require('../db');
/** Retourne le count global du jour (0 si aucune ligne) */
async function getGlobalEmailCount() {
  try {
    const { rows } = await _emailPool.query(
      `SELECT count FROM email_global_daily WHERE date=CURRENT_DATE`
    );
    return rows[0]?.count || 0;
  } catch (e) {
    console.error('[EMAIL getGlobalCount]', e.message);
    return 0;
  }
}
/**
 * M2r — Réservation ATOMIQUE d'un slot du quota global (anti-dépassement).
 * Le pattern getGlobalEmailCount() >= cap PUIS incrGlobalEmailCount() est un
 * check-then-act : sous concurrence (cron + campagnes), N process lisaient
 * 299 et envoyaient tous -> dépassement du quota Brevo 300/j (rejets / IP).
 * Ici l'INSERT/UPDATE conditionnel réserve le slot ET incrémente en une
 * seule requête atomique. Retourne true si un slot a été réservé (=> on
 * peut envoyer, ne PAS rappeler incrGlobalEmailCount ensuite), false si le
 * cap est atteint (=> ne pas envoyer). En cas d'échec d'envoi en aval on
 * accepte une légère sous-utilisation (slot consommé) plutôt que de risquer
 * un sur-envoi : c'est le comportement protecteur voulu pour l'IP Brevo.
 */
async function reserveGlobalEmail(cap = 300) {
  try {
    const { rows } = await _emailPool.query(
      `INSERT INTO email_global_daily (date, count) VALUES (CURRENT_DATE, 1)
       ON CONFLICT (date) DO UPDATE SET count = email_global_daily.count + 1
         WHERE email_global_daily.count < $1
       RETURNING count`,
      [cap]
    );
    return rows.length > 0;
  } catch (e) {
    // Fail-safe : si la DB du compteur est indisponible, on NE bloque PAS
    // les emails (mieux vaut un risque de léger dépassement qu'un arrêt
    // total des envois). Comportement identique à l'ancien getGlobalEmailCount
    // qui renvoyait 0 sur erreur.
    console.error('[EMAIL reserveGlobal]', e.message);
    return true;
  }
}
/** Incrémente de 1 le compteur global du jour (atomique, upsert) */
async function incrGlobalEmailCount() {
  try {
    await _emailPool.query(
      `INSERT INTO email_global_daily (date, count) VALUES (CURRENT_DATE, 1)
       ON CONFLICT (date) DO UPDATE SET count = email_global_daily.count + 1`
    );
  } catch (e) {
    console.error('[EMAIL incrGlobalCount]', e.message);
  }
}
/** Incrémente le compteur per-user (users.email_sent_today + email_sent_month) */
async function incrUserEmailCount(userId) {
  if (!userId) return;
  try {
    await _emailPool.query(
      `UPDATE users SET email_sent_today = email_sent_today + 1,
                        email_sent_month = email_sent_month + 1
        WHERE id=$1`,
      [userId]
    );
  } catch (e) {
    console.error('[EMAIL incrUserCount]', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Commit 30 — Quota emails marketing UNIFIÉ et cluster-safe.
// Source unique de vérité : `users.email_sent_today` + `email_sent_month`.
// Avant : 3 sources incohérentes (var mémoire `emailsToday`, constante locale
// `EMAIL_DAILY_LIMIT=300`, BDD) → l'UI affichait des chiffres faux et le
// commerçant pouvait dépasser le quota Brevo (300/jour gratuit).
// ─────────────────────────────────────────────────────────────────────────────

// Limite per-merchant. 190/jour laisse une marge de 110 sur le quota Brevo
// gratuit (300/jour) pour les emails transactionnels (rappels RDV, OTP,
// confirmations, password reset, daily recap commerçant).
const EMAIL_DAILY_LIMIT_USER   = 190;
const EMAIL_MONTHLY_LIMIT_USER = 5700; // 190 * 30 — borne haute mensuelle

// Reset automatique des compteurs en BDD quand le jour/mois change.
// Idempotent : si déjà reset aujourd'hui, ne fait rien. Lit après écriture
// pour retourner les valeurs FRAÎCHES (sinon premier appel après minuit
// retourne l'ancien `email_sent_today`).
async function checkUserEmailQuota(userId) {
  if (!userId) {
    return {
      sent_today: 0, sent_month: 0,
      available_today: EMAIL_DAILY_LIMIT_USER,
      available_month: EMAIL_MONTHLY_LIMIT_USER,
      daily_limit: EMAIL_DAILY_LIMIT_USER,
      monthly_limit: EMAIL_MONTHLY_LIMIT_USER,
    };
  }
  try {
    // 1) Reset journalier si email_day_reset < aujourd'hui (atomique).
    await _emailPool.query(
      `UPDATE users
          SET email_sent_today = 0, email_day_reset = CURRENT_DATE
        WHERE id = $1
          AND (email_day_reset IS NULL OR email_day_reset < CURRENT_DATE)`,
      [userId]
    );
    // 2) Reset mensuel si email_month_reset < début du mois en cours.
    await _emailPool.query(
      `UPDATE users
          SET email_sent_month = 0, email_month_reset = DATE_TRUNC('month', CURRENT_DATE)::date
        WHERE id = $1
          AND (email_month_reset IS NULL OR email_month_reset < DATE_TRUNC('month', CURRENT_DATE)::date)`,
      [userId]
    );
    // 3) Lecture après reset.
    const { rows } = await _emailPool.query(
      `SELECT COALESCE(email_sent_today, 0) AS st,
              COALESCE(email_sent_month, 0) AS sm,
              email_day_reset, email_month_reset
         FROM users WHERE id = $1`,
      [userId]
    );
    const r = rows[0] || {};
    const sentToday = parseInt(r.st, 10) || 0;
    const sentMonth = parseInt(r.sm, 10) || 0;
    return {
      sent_today: sentToday,
      sent_month: sentMonth,
      available_today: Math.max(0, EMAIL_DAILY_LIMIT_USER - sentToday),
      available_month: Math.max(0, EMAIL_MONTHLY_LIMIT_USER - sentMonth),
      daily_limit: EMAIL_DAILY_LIMIT_USER,
      monthly_limit: EMAIL_MONTHLY_LIMIT_USER,
      day_reset: r.email_day_reset,
      month_reset: r.email_month_reset,
    };
  } catch (e) {
    console.error('[EMAIL checkUserEmailQuota]', e.message);
    return {
      sent_today: 0, sent_month: 0,
      available_today: 0, available_month: 0,
      daily_limit: EMAIL_DAILY_LIMIT_USER,
      monthly_limit: EMAIL_MONTHLY_LIMIT_USER,
      error: 'quota_unavailable',
    };
  }
}

// Combien d'emails marketing on peut envoyer MAINTENANT à count destinataires.
// Retourne le min entre quota jour, quota mois et count demandé. Utilisé par
// les routes d'envoi pour tronquer le batch et éviter les rejets Brevo.
async function getAllowedEmailBatch(userId, count) {
  const q = await checkUserEmailQuota(userId);
  return {
    allowed: Math.max(0, Math.min(count, q.available_today, q.available_month)),
    quota: q,
  };
}

// ── Email invitation à l'opt-in marketing (RGPD, Audit Z4) ──────────────────
// Email transactionnel unique pour solliciter le consentement marketing des
// clients existants de la base. Un seul CTA : bouton "Oui je veux les offres"
// qui appelle /api/pub/opt-in/:token. Pas de contenu promotionnel (qui
// nécessiterait déjà l'opt-in) — purement administratif.
async function sendOptInInvite({ to, clientName, businessName, optInToken, businessEmail, businessPhone }) {
  const backendBase = (process.env.BACKEND_PUBLIC_URL || process.env.API_URL || '').split(',')[0]?.replace(/\/$/,'') || '';
  const optInUrl    = `${backendBase}/api/pub/opt-in/${optInToken}`;
  const firstName = (clientName || '').split(' ')[0] || '';
  const subject   = `${businessName} — souhaitez-vous recevoir nos offres ?`;
  const text = [
    `Bonjour ${firstName || 'cher client'},`,
    '',
    `${businessName} met à jour ses pratiques de communication.`,
    'Pour continuer à recevoir nos offres commerciales par email ou SMS, merci de confirmer votre inscription :',
    '',
    optInUrl,
    '',
    'Si vous ne souhaitez pas recevoir ces offres, vous pouvez simplement ignorer cet email.',
    '',
    'Vos notifications de rendez-vous (confirmations, rappels) continueront normalement dans tous les cas.',
    '',
    `À bientôt,`,
    businessName,
  ].join('\n');
  const safeBusiness = escapeHtml(businessName);
  const intro = `<p style="margin:0;">Bonjour ${escapeHtml(firstName || 'cher client')},<br/>${safeBusiness} met à jour ses pratiques de communication conformément au RGPD. Pour continuer à recevoir nos offres commerciales (promotions, nouveautés) par email ou SMS, confirmez votre inscription en un clic :</p>`;

  const contactRows = [];
  if (businessEmail) contactRows.push({ label: 'Email', value: escapeHtml(businessEmail) });
  if (businessPhone) contactRows.push({ label: 'Téléphone', value: escapeHtml(businessPhone), valueIsMono: true });
  const contactHtml = contactRows.length
    ? renderHeading('Contact') + renderInfoTable(contactRows)
    : '';

  const sections =
    renderCta({ href: optInUrl, label: 'Oui, je veux recevoir les offres' }) +
    renderNotice({
      tone: 'info',
      text: `Si vous ne souhaitez pas recevoir ces offres, vous n'avez rien à faire — ignorez simplement cet email. Vos notifications de rendez-vous (confirmations, rappels) continueront normalement dans tous les cas.`,
    }) +
    contactHtml;

  // Pas de marketingFooterHtml ici : l'email opt-in est administratif (pas
  // marketing) et le bouton CTA agit deja comme un opt-in/opt-out 1-clic.

  const html = renderShell({
    preheader: `Souhaitez-vous recevoir les offres de ${businessName} ?`,
    kicker: `FlowIA · ${safeBusiness}`,
    title: 'Souhaitez-vous recevoir nos offres ?',
    intro,
    sections,
    footerNote: `Email administratif RGPD — FlowIA`,
  });
  const replyTo = businessEmail ? { email: businessEmail, name: businessName } : undefined;
  // Migré vers queue (commit 30 — non-critique, invitation marketing opt-in)
  await enqueue({ to, subject, html, text, replyTo });
  return true;
}

// ── Email transactionnel commerçant : nouvelle réservation publique ─────
// Commit 25 — alerte le commerçant à chaque RDV créé via /book/:slug. Hors
// quota Brevo 300/j (transactionnel). Deep-link agenda?date=&appt= pour
// ouvrir directement la modale du RDV.
async function sendNewAppointmentMerchant({
  to, businessName, clientName, clientEmail, clientPhone,
  serviceName, employeeName, date, startTime, endTime, durationMinutes,
  price, appointmentId, agendaUrl, source = 'public',
}) {
  const refId = String(appointmentId || '').substring(0, 8).toUpperCase();
  const [dy, dm, dd] = String(date || '').split('-').map(Number);
  const dateObj = (dy && dm && dd) ? new Date(dy, dm - 1, dd) : new Date();
  const dateFr = dateObj.toLocaleDateString('fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateCap = dateFr.charAt(0).toUpperCase() + dateFr.slice(1);
  const sourceLabel = source === 'public'   ? 'Réservation en ligne'
                    : source === 'employee' ? 'Créé par un employé en boutique'
                    : 'Nouveau RDV';
  const subject = `Nouvelle réservation : ${clientName || 'Client'} le ${dateCap} à ${startTime || ''}`;

  const text = [
    `Bonjour ${businessName || ''},`, '',
    `${sourceLabel} :`, '',
    `Client : ${clientName || '—'}`,
    clientEmail ? `Email : ${clientEmail}` : '',
    clientPhone ? `Téléphone : ${clientPhone}` : '',
    `Date : ${dateCap}`,
    `Heure : ${startTime || ''}${endTime ? ' - ' + endTime : ''}`,
    serviceName ? `Service : ${serviceName}${durationMinutes ? ' · ' + durationMinutes + ' min' : ''}` : '',
    employeeName ? `Avec : ${employeeName}` : '',
    price != null ? `Montant : ${Number(price).toFixed(2)} €` : '',
    '',
    agendaUrl ? `Ouvrir l'agenda : ${agendaUrl}` : '',
    '',
    `Référence #${refId}`,
  ].filter(Boolean).join('\n');

  const rows = [
    { label: 'Référence', value: `#${escapeHtml(refId)}`, valueIsMono: true },
    { label: 'Client', value: escapeHtml(clientName || '—') },
  ];
  if (clientEmail) rows.push({ label: 'Email', value: escapeHtml(clientEmail) });
  if (clientPhone) rows.push({ label: 'Téléphone', value: escapeHtml(clientPhone), valueIsMono: true });
  rows.push({ label: 'Date', value: escapeHtml(dateCap) });
  rows.push({ label: 'Créneau', value: `${escapeHtml(startTime || '')}${endTime ? ' - ' + escapeHtml(endTime) : ''}` });
  if (serviceName) rows.push({ label: 'Prestation', value: `${escapeHtml(serviceName)}${durationMinutes ? ' · ' + escapeHtml(durationMinutes) + ' min' : ''}` });
  if (employeeName) rows.push({ label: 'Avec', value: escapeHtml(employeeName) });
  if (price != null) rows.push({ label: 'Montant', value: `${escapeHtml(Number(price).toFixed(2))} €`, valueIsMono: true });

  const intro = `<p style="margin:0;">${escapeHtml(sourceLabel)} chez ${escapeHtml(businessName || '')}.</p>`;

  const sections =
    renderInfoTable(rows) +
    (agendaUrl ? renderCta({ href: agendaUrl, label: `Ouvrir dans l'agenda` }) : '');

  const html = renderShell({
    preheader: `Nouvelle réservation ${dateCap} à ${startTime || ''}`,
    kicker: `FlowIA · ${escapeHtml(sourceLabel)}`,
    title: 'Nouvelle réservation',
    intro,
    sections,
    footerNote: `Référence #${refId}`,
  });

  return sendEmail({ to, subject, html, text });
}

// ── Email d'accompagnement commerçant (outreach admin / super-admin) ─────────
// Mail court, scannable et droit au but pour relancer un commerçant dont
// l'onboarding n'est pas finalisé. Objectif : maximiser la lecture jusqu'au CTA
// ET la délivrabilité (inbox, pas spam).
//
// Anti-spam (signaux côté contenu — la base reste l'auth domaine SPF/DKIM/DMARC
// configurée dans Brevo) :
//   - Sujet TRANSACTIONNEL, sans mot déclencheur ("cadeau", "gratuit", "gagnez",
//     pas de MAJUSCULES ni de "!").
//   - Un SEUL CTA principal + un lien WhatsApp sobre (peu de liens).
//   - Version texte alignée sur le HTML (multipart obligatoire).
//   - Header List-Unsubscribe + Reply-To réel (Gmail/Outlook adorent).
//   - Mention de l'offre une seule fois, sobrement, jamais dans le sujet.
//
// REGLE STRICTE : aucun placeholder type "[prénom]". Prénom inconnu -> "Bonjour,".
// Signature toujours "L'équipe FlowIA".
//
// Params : { to (obligatoire), firstName?, loginUrl?, whatsappNumber? }
async function sendMerchantOnboardingNudge({ to, firstName, loginUrl, whatsappNumber } = {}) {
  if (!to) throw new Error('Destinataire manquant');

  const clean = String(firstName || '').trim();
  // Salutation par prénom seulement s'il est présent ET propre. Sinon "Bonjour,".
  const safeName = clean && /^[\p{L}\p{M}\s'-]{1,40}$/u.test(clean) ? clean : '';
  const greeting = safeName ? `Bonjour ${escapeHtml(safeName)},` : 'Bonjour,';

  const waDigits = String(whatsappNumber || '33780827458').replace(/\D/g, '');
  const waText = encodeURIComponent(
    "Bonjour, je souhaite finaliser mon inscription commerçant FlowIA."
  );
  const waHref = `https://wa.me/${waDigits}?text=${waText}`;
  const waDisplay = '+33 7 80 82 74 58';

  const portalUrl = loginUrl || 'https://commercant.flowiapro.com';
  const replyTo = process.env.SENDER_EMAIL || process.env.BREVO_FROM || 'contact@flowiapro.com';

  // Sujet transactionnel, neutre — passe les filtres et reste clair.
  const subject = 'Il reste une étape pour activer votre espace FlowIA';

  // Intro : 2 phrases max, on dit POURQUOI et QUOI tout de suite.
  const intro =
    `<p style="margin:0 0 12px;">${greeting}</p>` +
    `<p style="margin:0;">Votre espace <strong style="font-weight:500;">FlowIA</strong> est presque prêt. ` +
    `Il reste <strong style="font-weight:500;">une étape</strong> : compléter le nom, l'adresse et le ` +
    `téléphone de votre établissement pour mettre votre page de réservation en ligne. Moins de 3 minutes.</p>`;

  // Bénéfices : 3 items courts, scannables — on donne envie d'aller au bout.
  const benefit = (txt) =>
    `<tr><td style="padding:6px 10px 6px 0;color:#15803d;font-weight:500;vertical-align:top;">·</td>` +
    `<td style="padding:6px 0;color:#374151;font-size:14px;line-height:1.5;">${txt}</td></tr>`;
  const benefits =
    renderHeading('Ce que vous activez') +
    `<table style="width:100%;border-collapse:collapse;margin:0 0 4px;">` +
    benefit('Réservations en ligne 24h/24, sans appel à gérer') +
    benefit('Agenda, fiches clients et rappels automatiques au même endroit') +
    benefit('Paiements encaissés directement, en toute sécurité') +
    `</table>`;

  const cta = renderCta({ href: portalUrl, label: 'Activer mon espace (3 min)' });

  // Offre : une seule mention, sobre, après le CTA.
  const offer =
    `<p style="margin:0 0 4px;font-size:13px;line-height:1.55;color:#374151;text-align:center;">` +
    `Pour bien démarrer, plusieurs mois sur l'offre <strong style="font-weight:500;">Équipe</strong> ` +
    `vous sont inclus, sans engagement.</p>`;

  // WhatsApp : bouton sobre (contour vert sur fond blanc), 1 seul lien.
  const whatsappBlock =
    `<div style="margin:22px 0 0;text-align:center;">` +
    `<div style="font-size:13px;color:#374151;margin:0 0 10px;">Une question&nbsp;? Réponse en direct&nbsp;:</div>` +
    `<a href="${escapeHtml(waHref)}" style="display:inline-block;background:#fff;color:#15803d;` +
    `border:1px solid #15803d;padding:10px 18px;font-size:13px;font-weight:500;text-decoration:none;` +
    `border-radius:4px;">WhatsApp ${escapeHtml(waDisplay)}</a>` +
    `</div>`;

  const outro =
    `<p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#374151;">` +
    `À très vite,<br/><strong style="font-weight:500;">L'équipe FlowIA</strong></p>`;

  const sections = benefits + cta + offer + whatsappBlock + outro;

  const html = renderShell({
    preheader: 'Activez votre page de réservation en ligne en moins de 3 minutes.',
    kicker: 'FlowIA',
    title: 'Activez votre espace en 3 minutes',
    intro,
    sections,
    footerNote: `FlowIA · ${replyTo} · Vous recevez cet email car une inscription commerçant a été initiée avec cette adresse. Pour ne plus en recevoir, répondez « STOP ».`,
  });

  const text = [
    greeting, '',
    'Votre espace FlowIA est presque prêt. Il reste une étape : compléter le nom,',
    "l'adresse et le téléphone de votre établissement pour mettre votre page de",
    'réservation en ligne (moins de 3 minutes).',
    '',
    'Ce que vous activez :',
    '- Réservations en ligne 24h/24, sans appel à gérer',
    '- Agenda, fiches clients et rappels automatiques au même endroit',
    '- Paiements encaissés directement, en toute sécurité',
    '',
    `Activer mon espace : ${portalUrl}`,
    '',
    "Pour bien démarrer, plusieurs mois sur l'offre Équipe vous sont inclus, sans engagement.",
    '',
    `Une question ? WhatsApp ${waDisplay} : ${waHref}`,
    '',
    'À très vite,',
    "L'équipe FlowIA",
    '',
    'Pour ne plus recevoir ce type d\'email, répondez « STOP ».',
  ].join('\n');

  // Reply-To réel + List-Unsubscribe : signaux de légitimité majeurs (Gmail).
  return sendEmail({
    to,
    subject,
    html,
    text,
    toName: safeName || undefined,
    replyTo,
    headers: { 'List-Unsubscribe': `<mailto:${replyTo}?subject=STOP>` },
  });
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
  sendReferralWelcome,
  sendBirthdayPromo,
  sendOptInInvite,
  sendNewAppointmentMerchant,
  sendMerchantOnboardingNudge,
  getGlobalEmailCount,
  reserveGlobalEmail,
  incrGlobalEmailCount,
  incrUserEmailCount,
  checkUserEmailQuota,
  getAllowedEmailBatch,
  EMAIL_DAILY_LIMIT_USER,
  EMAIL_MONTHLY_LIMIT_USER,
};