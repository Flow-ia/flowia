// emailLayout.js — Primitives HTML pour emails FlowIA style FDS-2026.
// Sobre, austere, fontWeight <= 500, bordures fines 1px, palette neutre,
// pas de gradient, pas d'emoji UI.
//
// Toute valeur dynamique injectee dans un template doit imperativement passer
// par escapeHtml() pour eviter le XSS dans les notifications utilisateur
// (clientName, businessName, notes, motif d'annulation, etc.).
//
// Palette FDS :
//   #111      texte principal
//   #374151   texte secondaire
//   #6b7280   texte muted / labels
//   #9ca3af   texte muted clair (footer)
//   #e5e7eb   bordures
//   #f3f4f6   surfaces
//   #f6f7f9   arriere-plan page
// Accents :
//   success #15803d / bg #dcfce7 / text #14532d
//   info    #1d4ed8 / bg #dbeafe / text #1e3a8a
//   warning #b45309 / bg #fef3c7 / text #78350f
//   danger  #dc2626 / bg #fee2e2 / text #7f1d1d

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const MONO_STACK = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";

// renderShell({ preheader, kicker, title, intro, sections, footerNote })
//   - preheader : texte court masque utilise pour l'apercu boite mail
//   - kicker    : ligne uppercase au-dessus du titre (ex: "FlowIA")
//   - title     : h1 fw500 noir
//   - intro     : paragraphe d'introduction en #374151 (HTML autorise, deja
//                 escape par l'appelant si besoin)
//   - sections  : chaine HTML concatenant les blocs (table, notice, code, cta...)
//   - footerNote: petit texte gris centre en bas
function renderShell({ preheader, kicker, title, intro, sections, footerNote }) {
  const safePreheader = escapeHtml(preheader || '');
  const safeKicker = escapeHtml(kicker || 'FlowIA');
  const safeTitle = escapeHtml(title || '');
  // intro et sections sont consideres comme HTML pre-construit, l'appelant
  // est responsable d'avoir echappe les valeurs dynamiques.
  const introHtml = intro || '';
  const sectionsHtml = sections || '';
  const footerHtml = footerNote
    ? `<div style="margin-top:24px;font-size:11px;color:#9ca3af;text-align:center;">${escapeHtml(footerNote)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:${FONT_STACK};background:#f6f7f9;margin:0;padding:32px 16px;color:#111;">
  ${safePreheader ? `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${safePreheader}</span>` : ''}
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;padding:28px;">
    <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">${safeKicker}</div>
    ${safeTitle ? `<h1 style="font-size:18px;font-weight:500;margin:0 0 16px 0;color:#111;">${safeTitle}</h1>` : ''}
    ${introHtml ? `<div style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 20px 0;">${introHtml}</div>` : ''}
    ${sectionsHtml}
    ${footerHtml}
  </div>
</body></html>`;
}

// renderInfoTable(rows)
//   rows = [{ label, value, valueIsMono?: boolean }]
// Premiere ligne sans border-top, suivantes avec border-top 1px solid #e5e7eb.
function renderInfoTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const trs = rows.map((r, i) => {
    const top = i === 0 ? '' : 'border-top:1px solid #e5e7eb;';
    const labelStyle = `padding:8px 0;color:#6b7280;width:40%;vertical-align:top;${top}`;
    const valueMono = r && r.valueIsMono
      ? `font-family:${MONO_STACK};font-size:12px;word-break:break-all;`
      : '';
    const valueStyle = `padding:8px 0;color:#111;${top}${valueMono}`;
    // Les valeurs peuvent contenir du HTML pre-rendu (ex: span barre), mais
    // l'appelant doit avoir applique escapeHtml() au prealable. Le label est
    // toujours echappe.
    return `<tr><td style="${labelStyle}">${escapeHtml(r.label || '')}</td><td style="${valueStyle}">${r.value == null ? '' : r.value}</td></tr>`;
  }).join('');
  return `<table style="width:100%;font-size:13px;color:#111;border-collapse:collapse;margin:0 0 8px 0;">${trs}</table>`;
}

// renderNotice({ tone, text })
//   tone = 'warning' | 'success' | 'info' | 'danger' (defaut warning)
//   text peut contenir du HTML pre-echappe par l'appelant.
function renderNotice({ tone, text }) {
  const palettes = {
    warning: { bg: '#fef3c7', border: '#f59e0b', color: '#78350f' },
    success: { bg: '#dcfce7', border: '#15803d', color: '#14532d' },
    info:    { bg: '#dbeafe', border: '#1d4ed8', color: '#1e3a8a' },
    danger:  { bg: '#fee2e2', border: '#dc2626', color: '#7f1d1d' },
  };
  const p = palettes[tone] || palettes.warning;
  return `<div style="margin:16px 0;padding:12px 16px;background:${p.bg};border-left:3px solid ${p.border};font-size:13px;line-height:1.55;color:${p.color};">${text || ''}</div>`;
}

// renderCodeBlock(code, opts?)
// Bloc centre pour OTP / code promo / code parrainage. opts.compact = version
// plus petite (font-size 18 au lieu de 22).
function renderCodeBlock(code, opts = {}) {
  const compact = !!(opts && opts.compact);
  const fs = compact ? '18px' : '22px';
  const ls = compact ? '0.22em' : '0.3em';
  const padding = compact ? '14px' : '18px';
  return `<div style="margin:16px 0;background:#f3f4f6;border:1px solid #e5e7eb;padding:${padding};text-align:center;font-family:${MONO_STACK};font-size:${fs};letter-spacing:${ls};font-weight:500;color:#111;">${escapeHtml(code || '')}</div>`;
}

// renderAmountSummary({ items, total, label })
// items = [{ label, value, line_through?, accent? }]
// total = { label, value }  (rendu en gras 500 en bas)
// label optionnel = titre kicker au-dessus.
function renderAmountSummary({ items = [], total, label }) {
  const head = label
    ? `<div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;margin:0 0 6px 0;">${escapeHtml(label)}</div>`
    : '';
  const rows = items.map((it, i) => {
    const top = i === 0 ? '' : 'border-top:1px solid #e5e7eb;';
    const valStyle = it.line_through ? 'text-decoration:line-through;color:#6b7280;' : 'color:#111;';
    const labStyle = it.accent ? 'color:#374151;' : 'color:#6b7280;';
    return `<tr>
      <td style="padding:6px 0;font-size:13px;${labStyle}${top}">${escapeHtml(it.label || '')}</td>
      <td style="padding:6px 0;font-size:13px;text-align:right;font-family:${MONO_STACK};${valStyle}${top}">${escapeHtml(it.value || '')}</td>
    </tr>`;
  }).join('');
  const totalRow = total
    ? `<tr>
      <td style="padding:10px 0 0 0;font-size:13px;font-weight:500;color:#111;border-top:1px solid #e5e7eb;">${escapeHtml(total.label || 'Total')}</td>
      <td style="padding:10px 0 0 0;font-size:14px;font-weight:500;color:#111;text-align:right;font-family:${MONO_STACK};border-top:1px solid #e5e7eb;">${escapeHtml(total.value || '')}</td>
    </tr>`
    : '';
  return `<div style="margin:16px 0;">${head}<table style="width:100%;border-collapse:collapse;">${rows}${totalRow}</table></div>`;
}

// renderCta({ href, label })
function renderCta({ href, label }) {
  if (!href) return '';
  return `<div style="margin:24px 0;text-align:center;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;font-size:13px;font-weight:500;text-decoration:none;border-radius:4px;font-family:${FONT_STACK};">${escapeHtml(label || 'Continuer')}</a>
  </div>`;
}

function renderDivider() {
  return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>`;
}

// renderHeading(text)
// Petit titre de section, uppercase, fw500, gris.
function renderHeading(text) {
  return `<h2 style="font-size:13px;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:24px 0 8px 0;">${escapeHtml(text || '')}</h2>`;
}

module.exports = {
  escapeHtml,
  renderShell,
  renderInfoTable,
  renderNotice,
  renderCodeBlock,
  renderAmountSummary,
  renderCta,
  renderDivider,
  renderHeading,
};
