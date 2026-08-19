// routes/export.js  ─  Feature 4 : Export comptable CSV + PDF
const express  = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { requireFeature } = require('../middleware/requireFeature');
const { pinAdminMiddleware } = require('../middleware/pinAdmin');
const PDFDocument = require('pdfkit');
const router   = express.Router();
router.use(authMiddleware);
router.use(requireFeature('export'));

// AUDIT export #3 + #4 + #5 : escCsv robuste contre séparateurs multiples,
// injection de formules Excel (= + - @ \t \r), et double escape.
// IMPORTANT : ne jamais repasser une valeur déjà escapée dans cette fonction.
function escCsv(v, sep = ';') {
  if (v == null) return '';
  let s = String(v);
  // Préfixe apostrophe si le champ peut être interprété comme formule Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  const needsQuote = s.includes(sep) || s.includes(',') || s.includes('"')
                  || s.includes('\n') || s.includes('\r');
  return needsQuote ? `"${s.replace(/"/g, '""')}"` : s;
}

// AUDIT export #1 : valider dates YYYY-MM-DD et UUIDs avant usage SQL pour
// éviter 500 PG (qui fuitait err.message) et DoS facile.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validDate(s)  { return typeof s === 'string' && DATE_RE.test(s); }
function validUuid(s)  { return typeof s === 'string' && UUID_RE.test(s); }
// AUDIT export #12 : borne max 2 ans sur une plage (DoS mémoire PDFKit).
const MAX_RANGE_DAYS = 2 * 366;
function rangeOk(fromD, toD) {
  const diff = (new Date(toD) - new Date(fromD)) / 86400000;
  return diff >= 0 && diff <= MAX_RANGE_DAYS;
}

// ── GET /api/export/csv?from=&to=&employee_id=&category_id=&type= ─────────────
// AUDIT export #9 : protégé par PIN admin (export complet = données sensibles).
router.get('/csv', pinAdminMiddleware, async (req, res) => {
  try {
    const { from, to, employee_id, category_id, type, include_payment, include_employees } = req.query;
    const fromD = from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const toD   = to   || new Date().toISOString().split('T')[0];
    const withPayment   = include_payment   === '1';
    const withEmployees = include_employees === '1';

    if (!validDate(fromD) || !validDate(toD))
      return res.status(400).json({ error: 'Dates invalides (format YYYY-MM-DD attendu).' });
    if (!rangeOk(fromD, toD))
      return res.status(400).json({ error: `Plage max ${MAX_RANGE_DAYS} jours.` });
    if (employee_id && employee_id !== 'all' && !validUuid(employee_id))
      return res.status(400).json({ error: 'employee_id invalide.' });
    if (category_id && category_id !== 'all' && !validUuid(category_id))
      return res.status(400).json({ error: 'category_id invalide.' });
    if (type && !['all','revenue','expense'].includes(type))
      return res.status(400).json({ error: 'type invalide.' });

    const { rows: biz } = await pool.query(
      'SELECT business_name FROM users WHERE id=$1', [req.user.userId]);
    const businessName = biz[0]?.business_name || 'Salon DZ';

    // Pour les transactions multi-paiement, on construit un libellé détaillé
    // (ex : "Especes 20€ + Carte 25€ + Virement 5€") à partir de transaction_payments.
    let q = `SELECT
        t.id,
        TO_CHAR(t.date,'DD/MM/YYYY') as date,
        COALESCE(TO_CHAR(t.time,'HH24:MI'),'') as heure,
        CASE t.type WHEN 'revenue' THEN 'Recette' WHEN 'expense' THEN 'Dépense' ELSE t.type END as type,
        t.amount,
        COALESCE(t.discount_amount,0) as remise,
        COALESCE(t.original_amount,t.amount) as montant_brut,
        CASE
          WHEN t.payment_method = 'multi' THEN COALESCE(pm_multi.label,'Mixte')
          WHEN t.payment_method = 'cash' THEN 'Espèces'
          WHEN t.payment_method = 'card' THEN 'Carte bancaire'
          WHEN t.payment_method = 'transfer' THEN 'Virement'
          ELSE 'Autre'
        END as mode_paiement,
        COALESCE(c.name,'—') as categorie,
        COALESCE(e.name,'—') as employe,
        COALESCE(t.description,'') as description,
        COALESCE(t.source,'manual') as source,
        t.created_at
      FROM transactions t
      LEFT JOIN categories c ON c.id=t.category_id
      LEFT JOIN employees e ON e.id=t.employee_id
      LEFT JOIN LATERAL (
        SELECT string_agg(
          (CASE tp.method
            WHEN 'cash' THEN 'Espèces'
            WHEN 'card' THEN 'Carte bancaire'
            WHEN 'transfer' THEN 'Virement'
            ELSE 'Autre' END) || ' ' || RTRIM(RTRIM(TO_CHAR(tp.amount,'FM999999999.00'),'0'),'.') || ' DA',
          ' + ' ORDER BY tp.amount DESC
        ) as label
        FROM transaction_payments tp WHERE tp.transaction_id = t.id
      ) pm_multi ON t.payment_method = 'multi'
      WHERE t.user_id=$1 AND t.deleted_at IS NULL AND t.date BETWEEN $2 AND $3`;
    const params = [req.user.userId, fromD, toD];

    if (employee_id && employee_id !== 'all') { params.push(employee_id); q += ` AND t.employee_id=$${params.length}`; }
    if (category_id && category_id !== 'all') { params.push(category_id); q += ` AND t.category_id=$${params.length}`; }
    if (type && type !== 'all') { params.push(type); q += ` AND t.type=$${params.length}`; }
    q += ' ORDER BY t.date ASC, t.time ASC';

    const { rows } = await pool.query(q, params);

    // ── Construire le CSV ──────────────────────────────────────────────────────
    const BOM    = '\uFEFF'; // UTF-8 BOM pour Excel
    const sep    = ';';
    const header = ['Date','Heure','Type','Montant TTC','Remise','Montant Brut','Mode paiement','Catégorie','Employé','Description','Source'];
    let csv = BOM + header.join(sep) + '\r\n';
    let totalRev = 0, totalExp = 0;

    // AUDIT export #4 : un seul passage escCsv par cellule (le map final), pas
    // de pré-escape sur categorie/employe/description.
    for (const r of rows) {
      const isRev = r.type === 'Recette';
      if (isRev) totalRev += parseFloat(r.amount)||0;
      else       totalExp += parseFloat(r.amount)||0;
      csv += [
        r.date, r.heure,
        r.type,
        String(parseFloat(r.amount).toFixed(2)).replace('.', ','),
        String(parseFloat(r.remise).toFixed(2)).replace('.', ','),
        String(parseFloat(r.montant_brut).toFixed(2)).replace('.', ','),
        r.mode_paiement,
        r.categorie,
        r.employe,
        r.description,
        r.source,
      ].map(v => escCsv(v, sep)).join(sep) + '\r\n';
    }

    // Totaux
    csv += '\r\n';
    csv += `${sep}${sep}TOTAL RECETTES${sep}${String(totalRev.toFixed(2)).replace('.', ',')}${sep}${sep}${sep}${sep}${sep}${sep}${sep}${sep}\r\n`;
    csv += `${sep}${sep}TOTAL DÉPENSES${sep}${String(totalExp.toFixed(2)).replace('.', ',')}${sep}${sep}${sep}${sep}${sep}${sep}${sep}${sep}\r\n`;
    csv += `${sep}${sep}SOLDE NET${sep}${String((totalRev-totalExp).toFixed(2)).replace('.', ',')}${sep}${sep}${sep}${sep}${sep}${sep}${sep}${sep}\r\n`;

    // ── CA par moyen de paiement ────────────────────────────────────────────
    // Eclate les tx multi via transaction_payments : chaque moyen est compté
    // séparément avec son montant réel. Aucun regroupement en "Autre" / "Mixte".
    if (withPayment) {
      const { rows: pmRows } = await pool.query(
        `WITH pm_split AS (
           SELECT tp.method, tp.amount, t.id AS tx_id
           FROM transactions t
           JOIN transaction_payments tp ON tp.transaction_id = t.id
           WHERE t.user_id=$1 AND t.type='revenue' AND t.deleted_at IS NULL AND t.date BETWEEN $2 AND $3
             AND t.payment_method='multi'
           UNION ALL
           SELECT t.payment_method AS method, t.amount, t.id AS tx_id
           FROM transactions t
           WHERE t.user_id=$1 AND t.type='revenue' AND t.deleted_at IS NULL AND t.date BETWEEN $2 AND $3
             AND t.payment_method IS DISTINCT FROM 'multi'
         )
         SELECT CASE method
             WHEN 'cash' THEN 'Espèces'
             WHEN 'card' THEN 'Carte bancaire'
             WHEN 'transfer' THEN 'Virement'
             ELSE 'Autre' END as mode,
           SUM(amount) as total,
           COUNT(DISTINCT tx_id) as nb
         FROM pm_split
         GROUP BY method
         ORDER BY total DESC`,
        [req.user.userId, fromD, toD]
      );
      csv += '\r\n';
      csv += `${sep}${sep}CA PAR MOYEN DE PAIEMENT\r\n`;
      csv += `${sep}${sep}Mode${sep}CA${sep}Transactions\r\n`;
      pmRows.forEach(r => {
        csv += `${sep}${sep}${escCsv(r.mode, sep)}${sep}${String(parseFloat(r.total).toFixed(2)).replace('.', ',')}${sep}${r.nb}\r\n`;
      });
    }

    // ── CA par employé ──────────────────────────────────────────────────────
    // AUDIT export #7 : GROUP BY e.id pour éviter fusion d'employés homonymes.
    if (withEmployees) {
      const { rows: empRows } = await pool.query(
        `SELECT COALESCE(e.name, 'Non attribué') as employe, SUM(t.amount) as total, COUNT(*) as nb
         FROM transactions t LEFT JOIN employees e ON e.id=t.employee_id
         WHERE t.user_id=$1 AND t.type='revenue' AND t.deleted_at IS NULL AND t.date BETWEEN $2 AND $3
         GROUP BY e.id, e.name ORDER BY total DESC`,
        [req.user.userId, fromD, toD]
      );
      csv += '\r\n';
      csv += `${sep}${sep}CA PAR EMPLOYÉ (classement décroissant)\r\n`;
      csv += `${sep}${sep}Classement${sep}Employé${sep}CA${sep}Transactions\r\n`;
      empRows.forEach((r, i) => {
        csv += `${sep}${sep}${i+1}${sep}${escCsv(r.employe, sep)}${sep}${String(parseFloat(r.total).toFixed(2)).replace('.', ',')}${sep}${r.nb}\r\n`;
      });
    }

    // AUDIT export #10 : fromD/toD sont validés, donc safe dans filename.
    const filename = `export-comptable_${fromD}_${toD}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch(e) {
    console.error('[EXPORT CSV]', e.message);
    res.status(500).json({ error: 'Erreur serveur lors de la génération du CSV.' });
  }
});

// ── GET /api/export/summary?from=&to= ── données pour preview ────────────────
router.get('/summary', async (req, res) => {
  try {
    const { from, to, employee_id, category_id, type } = req.query;
    const fromD = from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const toD   = to   || new Date().toISOString().split('T')[0];

    if (!validDate(fromD) || !validDate(toD))
      return res.status(400).json({ error: 'Dates invalides.' });
    if (!rangeOk(fromD, toD))
      return res.status(400).json({ error: `Plage max ${MAX_RANGE_DAYS} jours.` });
    if (employee_id && employee_id !== 'all' && !validUuid(employee_id))
      return res.status(400).json({ error: 'employee_id invalide.' });
    if (category_id && category_id !== 'all' && !validUuid(category_id))
      return res.status(400).json({ error: 'category_id invalide.' });
    if (type && !['all','revenue','expense'].includes(type))
      return res.status(400).json({ error: 'type invalide.' });

    // AUDIT export #6 : séparer le COUNT par type (total_tx mélangeait recettes+dépenses
    // alors que total_revenus/total_depenses étaient typés → KPI trompeur).
    let q = `SELECT
        COUNT(*) FILTER (WHERE t.type='revenue') as total_tx_revenue,
        COUNT(*) FILTER (WHERE t.type='expense') as total_tx_expense,
        COUNT(*) as total_tx,
        COALESCE(SUM(CASE WHEN t.type='revenue' THEN t.amount ELSE 0 END),0) as total_revenus,
        COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) as total_depenses,
        COUNT(DISTINCT t.employee_id) as nb_employes,
        COUNT(DISTINCT t.category_id) as nb_categories
      FROM transactions t WHERE t.user_id=$1 AND t.date BETWEEN $2 AND $3`;
    const params = [req.user.userId, fromD, toD];
    if (employee_id && employee_id !== 'all') { params.push(employee_id); q += ` AND t.employee_id=$${params.length}`; }
    if (category_id && category_id !== 'all') { params.push(category_id); q += ` AND t.category_id=$${params.length}`; }
    if (type && type !== 'all') { params.push(type); q += ` AND t.type=$${params.length}`; }

    const { rows } = await pool.query(q, params);
    res.json({ ...rows[0], from: fromD, to: toD });
  } catch(e) {
    console.error('[EXPORT SUMMARY]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});


// ── GET /api/export/pdf ────────────────────────────────────────────────────────
// AUDIT export #9 : protégé par PIN admin (export complet = données sensibles).
router.get('/pdf', pinAdminMiddleware, async (req, res) => {
  try {
    const { from, to, employee_id, category_id, type, include_payment, include_employees } = req.query;
    const fromD = from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const toD   = to   || new Date().toISOString().split('T')[0];
    const withPayment   = include_payment   === '1';
    const withEmployees = include_employees === '1';

    if (!validDate(fromD) || !validDate(toD))
      return res.status(400).json({ error: 'Dates invalides.' });
    if (!rangeOk(fromD, toD))
      return res.status(400).json({ error: `Plage max ${MAX_RANGE_DAYS} jours.` });
    if (employee_id && employee_id !== 'all' && !validUuid(employee_id))
      return res.status(400).json({ error: 'employee_id invalide.' });
    if (category_id && category_id !== 'all' && !validUuid(category_id))
      return res.status(400).json({ error: 'category_id invalide.' });
    if (type && !['all','revenue','expense'].includes(type))
      return res.status(400).json({ error: 'type invalide.' });

    const { rows: biz } = await pool.query(
      'SELECT business_name, email FROM users WHERE id=$1', [req.user.userId]);
    const businessName = biz[0]?.business_name || 'Salon DZ';
    const bizEmail     = biz[0]?.email || '';

    // ── Requête transactions ──────────────────────────────────────────────────
    let q = `SELECT
        t.id,
        TO_CHAR(t.date,'DD/MM/YYYY') as date,
        COALESCE(TO_CHAR(t.time,'HH24:MI'),'') as heure,
        CASE t.type WHEN 'revenue' THEN 'Recette' WHEN 'expense' THEN 'Depense' ELSE t.type END as type_label,
        t.type,
        t.amount,
        CASE
          WHEN t.payment_method = 'multi' THEN COALESCE(pm_multi.label,'Mixte')
          WHEN t.payment_method = 'cash' THEN 'Especes'
          WHEN t.payment_method = 'card' THEN 'CB'
          WHEN t.payment_method = 'transfer' THEN 'Virement'
          ELSE 'Autre'
        END as mode_paiement,
        COALESCE(c.name,'-') as categorie,
        COALESCE(e.name,'-') as employe,
        COALESCE(t.description,'') as description
      FROM transactions t
      LEFT JOIN categories c ON c.id=t.category_id
      LEFT JOIN employees e ON e.id=t.employee_id
      LEFT JOIN LATERAL (
        SELECT string_agg(
          (CASE tp.method
            WHEN 'cash' THEN 'Especes'
            WHEN 'card' THEN 'CB'
            WHEN 'transfer' THEN 'Virement'
            ELSE 'Autre' END) || ' ' || TO_CHAR(tp.amount,'FM999999999.00') || 'E',
          ' + ' ORDER BY tp.amount DESC
        ) as label
        FROM transaction_payments tp WHERE tp.transaction_id = t.id
      ) pm_multi ON t.payment_method = 'multi'
      WHERE t.user_id=$1 AND t.deleted_at IS NULL AND t.date BETWEEN $2 AND $3`;
    const params = [req.user.userId, fromD, toD];

    if (employee_id && employee_id !== 'all') { params.push(employee_id); q += ` AND t.employee_id=$${params.length}`; }
    if (category_id && category_id !== 'all') { params.push(category_id); q += ` AND t.category_id=$${params.length}`; }
    if (type && type !== 'all') { params.push(type); q += ` AND t.type=$${params.length}`; }
    q += ' ORDER BY t.date ASC, t.time ASC';

    const { rows } = await pool.query(q, params);

    let totalRev = 0, totalExp = 0;
    rows.forEach(r => {
      if (r.type === 'revenue') totalRev += parseFloat(r.amount) || 0;
      else                      totalExp += parseFloat(r.amount) || 0;
    });
    const solde = totalRev - totalExp;
    const fmt2  = v => Number(v || 0).toFixed(2);

    // ── Requêtes analytiques (avant de créer le PDF) ─────────────────────────
    let pmRows = [], empRows = [];
    if (withPayment) {
      // Eclate les paiements mixtes via transaction_payments
      // pour ne jamais regrouper un paiement divisé sous "Mixte" / "Autre".
      const res2 = await pool.query(
        `WITH pm_split AS (
           SELECT tp.method, tp.amount, t.id AS tx_id
           FROM transactions t
           JOIN transaction_payments tp ON tp.transaction_id = t.id
           WHERE t.user_id=$1 AND t.type='revenue' AND t.deleted_at IS NULL AND t.date BETWEEN $2 AND $3
             AND t.payment_method='multi'
           UNION ALL
           SELECT t.payment_method AS method, t.amount, t.id AS tx_id
           FROM transactions t
           WHERE t.user_id=$1 AND t.type='revenue' AND t.deleted_at IS NULL AND t.date BETWEEN $2 AND $3
             AND t.payment_method IS DISTINCT FROM 'multi'
         )
         SELECT CASE method
             WHEN 'cash' THEN 'Especes'
             WHEN 'card' THEN 'CB'
             WHEN 'transfer' THEN 'Virement'
             ELSE 'Autre' END as mode,
           SUM(amount) as total,
           COUNT(DISTINCT tx_id) as nb
         FROM pm_split
         GROUP BY method
         ORDER BY total DESC`,
        [req.user.userId, fromD, toD]);
      pmRows = res2.rows;
    }
    // AUDIT export #7 : GROUP BY e.id pour éviter fusion d'employés homonymes.
    if (withEmployees) {
      const res3 = await pool.query(
        `SELECT COALESCE(e.name,'Non attribue') as employe, SUM(t.amount) as total, COUNT(*) as nb
         FROM transactions t LEFT JOIN employees e ON e.id=t.employee_id
         WHERE t.user_id=$1 AND t.type='revenue' AND t.deleted_at IS NULL AND t.date BETWEEN $2 AND $3
         GROUP BY e.id, e.name ORDER BY total DESC`,
        [req.user.userId, fromD, toD]);
      empRows = res3.rows;
    }

    // ── Créer le PDF ──────────────────────────────────────────────────────────
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 60, left: 45, right: 45 },
      autoFirstPage: true,
      info: {
        Title: `Export comptable ${fromD} au ${toD}`,
        Author: businessName,
        Subject: `Export Salon DZ`,
      },
    });

    const filename = `export-SalonDZ_${fromD}_${toD}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // ── Constantes ────────────────────────────────────────────────────────────
    const PURPLE = '#6c63ff';
    const BLUE   = '#1a73e8';
    const GREEN  = '#10b981';
    const RED    = '#ef4444';
    const GRAY   = '#6b7280';
    const DARK   = '#374151';
    const LIGHT  = '#f9fafb';
    const BORDER = '#e5e7eb';
    const PAGE_W = doc.page.width;
    const PAGE_H = doc.page.height;
    const ML     = doc.page.margins.left;
    const MR     = doc.page.margins.right;
    const MT     = doc.page.margins.top;
    const MB     = doc.page.margins.bottom;
    const W      = PAGE_W - ML - MR;
    const FOOTER_RESERVE = 55; // zone réservée au pied de page

    // ── Helpers ───────────────────────────────────────────────────────────────
    // Vérifie si on a assez de place, sinon nouvelle page
    // Retourne la Y courante après vérification
    const ensureSpace = (y, needed) => {
      if (y + needed > PAGE_H - MB - FOOTER_RESERVE) {
        doc.addPage();
        drawFooter();
        return MT;
      }
      return y;
    };

    const drawFooter = () => {
      const fy = PAGE_H - MB - 10;
      doc.save();
      doc.rect(0, fy - 8, PAGE_W, MB + 18).fillColor('#f3f4f6').fill();
      doc.fill(GRAY).font('Helvetica').fontSize(7)
         .text(
           `${process.env.APP_NAME || 'Salon DZ'}  ·  ${businessName}  ·  ${bizEmail}  ·  Export du ${new Date().toLocaleDateString('fr-FR')}`,
           ML, fy, { width: W, align: 'center' }
         );
      doc.restore();
    };

    const sectionHeader = (y, text, bgColor, textColor) => {
      doc.rect(ML, y, W, 26).fillColor(bgColor).fill();
      doc.fill(textColor).font('Helvetica-Bold').fontSize(10)
         .text(text, ML + 12, y + 8, { width: W - 24 });
      return y + 26;
    };

    const tableRowHeader = (y, cols) => {
      doc.rect(ML, y, W, 20).fillColor('#ede9fe').fill();
      doc.rect(ML, y, W, 20).strokeColor('#c4b5fd').lineWidth(0.5).stroke();
      let x = ML + 8;
      cols.forEach(col => {
        doc.fill(PURPLE).font('Helvetica-Bold').fontSize(7.5)
           .text(col.label, x, y + 6, { width: col.w - 6, align: col.align || 'left' });
        x += col.w;
      });
      return y + 20;
    };

    // ── PAGE 1 : EN-TÊTE ──────────────────────────────────────────────────────
    doc.rect(0, 0, PAGE_W, 125).fillColor(PURPLE).fill();

    doc.fill('white').font('Helvetica-Bold').fontSize(22)
       .text('Export Comptable', ML, 28, { width: W });
    doc.font('Helvetica').fontSize(12)
       .text(businessName, ML, 56, { width: W });
    doc.fontSize(9).fillOpacity(0.85)
       .text(`Periode : ${fromD}  au  ${toD}`, ML, 74, { width: W })
       .text(`Genere le : ${new Date().toLocaleDateString('fr-FR')}`, ML, 88, { width: W });
    doc.fillOpacity(1);

    // ── KPIs ──────────────────────────────────────────────────────────────────
    let y = 143;
    const kpiW = (W - 16) / 3;
    [
      { label: 'Total Recettes', value: `${fmt2(totalRev)} EUR`, color: GREEN, bg: '#f0fdf4', bdr: '#86efac' },
      { label: 'Total Depenses', value: `${fmt2(totalExp)} EUR`, color: RED,   bg: '#fef2f2', bdr: '#fca5a5' },
      { label: 'Solde Net',      value: `${solde >= 0 ? '+' : ''}${fmt2(solde)} EUR`,
        color: solde >= 0 ? PURPLE : RED, bg: '#f5f3ff', bdr: '#c4b5fd' },
    ].forEach((kpi, i) => {
      const kx = ML + i * (kpiW + 8);
      doc.roundedRect(kx, y, kpiW, 58, 7).fillColor(kpi.bg).fill();
      doc.roundedRect(kx, y, kpiW, 58, 7).strokeColor(kpi.bdr).lineWidth(1).stroke();
      doc.fill(GRAY).font('Helvetica').fontSize(7.5)
         .text(kpi.label.toUpperCase(), kx + 10, y + 10, { width: kpiW - 20 });
      doc.fill(kpi.color).font('Helvetica-Bold').fontSize(13)
         .text(kpi.value, kx + 10, y + 26, { width: kpiW - 20 });
    });

    y += 70;
    doc.fill(GRAY).font('Helvetica').fontSize(8.5)
       .text(`${rows.length} transaction(s) sur la periode`, ML, y);
    y += 18;

    // ── TABLEAU PRINCIPAL ─────────────────────────────────────────────────────
    const COL = [
      { key: 'date',          label: 'Date',      w: 60,  align: 'left'  },
      { key: 'heure',         label: 'Heure',     w: 34,  align: 'left'  },
      { key: 'type_label',    label: 'Type',      w: 50,  align: 'left'  },
      { key: 'categorie',     label: 'Categorie', w: 85,  align: 'left'  },
      { key: 'employe',       label: 'Employe',   w: 74,  align: 'left'  },
      { key: 'mode_paiement', label: 'Mode',      w: 42,  align: 'left'  },
      { key: 'amount',        label: 'Montant',   w: 63,  align: 'right' },
    ];
    const ROW_H = 20;

    const drawMainHeader = (startY) => {
      doc.rect(ML, startY, W, 22).fillColor('#ede9fe').fill();
      doc.rect(ML, startY, W, 22).strokeColor('#c4b5fd').lineWidth(0.5).stroke();
      let x = ML + 8;
      COL.forEach(col => {
        doc.fill(PURPLE).font('Helvetica-Bold').fontSize(7.5)
           .text(col.label, x, startY + 7, { width: col.w - 6, align: col.align });
        x += col.w;
      });
      return startY + 22;
    };

    y = drawMainHeader(y);

    rows.forEach((row, idx) => {
      y = ensureSpace(y, ROW_H + 2);
      // Relancer l'en-tête si nouvelle page
      if (y === MT) y = drawMainHeader(y);

      if (idx % 2 === 0) doc.rect(ML, y, W, ROW_H).fillColor(LIGHT).fill();
      doc.rect(ML, y, W, ROW_H).strokeColor(BORDER).lineWidth(0.3).stroke();

      const isRev = row.type === 'revenue';
      let x = ML + 8;
      COL.forEach(col => {
        let val = row[col.key] || '';
        let color = DARK;
        if (col.key === 'amount') {
          val = `${isRev ? '+' : '-'}${fmt2(row.amount)}`;
          color = isRev ? GREEN : RED;
        }
        if (col.key === 'type_label') color = isRev ? GREEN : RED;
        doc.fill(color)
           .font(col.key === 'amount' ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(7.5)
           .text(val, x, y + 6, { width: col.w - 6, align: col.align, ellipsis: true });
        x += col.w;
      });
      y += ROW_H;
    });

    // ── RÉCAPITULATIF TOTAUX ──────────────────────────────────────────────────
    y += 16; // espacement obligatoire avant la section
    y = ensureSpace(y, 90);

    y = sectionHeader(y, 'RECAPITULATIF', '#f5f3ff', PURPLE);
    y += 6;

    const totals = [
      { label: 'Total recettes :', value: `${fmt2(totalRev)} EUR`, color: GREEN },
      { label: 'Total depenses :', value: `${fmt2(totalExp)} EUR`, color: RED   },
      { label: 'Solde net :',      value: `${solde >= 0 ? '+' : ''}${fmt2(solde)} EUR`,
        color: solde >= 0 ? PURPLE : RED },
    ];

    totals.forEach(t => {
      y = ensureSpace(y, 18);
      doc.fill(GRAY).font('Helvetica').fontSize(9)
         .text(t.label, ML + 12, y);
      doc.fill(t.color).font('Helvetica-Bold').fontSize(9)
         .text(t.value, ML + 12, y, { width: W - 24, align: 'right' });
      y += 16;
    });

    // ── CA PAR MOYEN DE PAIEMENT ──────────────────────────────────────────────
    if (withPayment && pmRows.length > 0) {
      y += 18; // séparation claire
      y = ensureSpace(y, 26 + 20 + pmRows.length * 19 + 10);

      y = sectionHeader(y, 'CA PAR MOYEN DE PAIEMENT', '#dbeafe', BLUE);

      const pmCols = [
        { label: 'Mode de paiement', w: W * 0.45, align: 'left'  },
        { label: 'CA (EUR)',         w: W * 0.30, align: 'right' },
        { label: 'Transactions',     w: W * 0.25, align: 'right' },
      ];
      y = tableRowHeader(y, pmCols);

      const totalPm = pmRows.reduce((s, r) => s + parseFloat(r.total), 0);
      pmRows.forEach((r, idx) => {
        y = ensureSpace(y, 19);
        if (idx % 2 === 0) doc.rect(ML, y, W, 18).fillColor(LIGHT).fill();
        doc.rect(ML, y, W, 18).strokeColor(BORDER).lineWidth(0.3).stroke();

        const pct = totalPm > 0 ? ` (${(parseFloat(r.total) / totalPm * 100).toFixed(1)}%)` : '';
        let cx = ML + 8;
        doc.fill(DARK).font('Helvetica').fontSize(8)
           .text(r.mode, cx, y + 5, { width: pmCols[0].w - 8 });
        cx += pmCols[0].w;
        doc.fill(GREEN).font('Helvetica-Bold').fontSize(8)
           .text(`${fmt2(r.total)}${pct}`, cx, y + 5, { width: pmCols[1].w - 8, align: 'right' });
        cx += pmCols[1].w;
        doc.fill(GRAY).font('Helvetica').fontSize(8)
           .text(String(r.nb), cx, y + 5, { width: pmCols[2].w - 8, align: 'right' });
        y += 19;
      });
    }

    // ── CA PAR EMPLOYÉ ────────────────────────────────────────────────────────
    if (withEmployees && empRows.length > 0) {
      y += 18; // séparation claire
      y = ensureSpace(y, 26 + 20 + empRows.length * 19 + 10);

      y = sectionHeader(y, 'CA PAR EMPLOYE — classement decroissant', '#dcfce7', '#15803d');

      const empCols = [
        { label: '#',           w: W * 0.08, align: 'center' },
        { label: 'Employe',     w: W * 0.42, align: 'left'   },
        { label: 'CA (EUR)',    w: W * 0.27, align: 'right'  },
        { label: 'Transactions',w: W * 0.23, align: 'right'  },
      ];
      y = tableRowHeader(y, empCols);

      empRows.forEach((r, idx) => {
        y = ensureSpace(y, 19);
        if (idx % 2 === 0) doc.rect(ML, y, W, 18).fillColor(LIGHT).fill();
        doc.rect(ML, y, W, 18).strokeColor(BORDER).lineWidth(0.3).stroke();

        let cx = ML + 8;
        doc.fill(PURPLE).font('Helvetica-Bold').fontSize(8)
           .text(String(idx + 1), cx, y + 5, { width: empCols[0].w - 8, align: 'center' });
        cx += empCols[0].w;
        doc.fill(DARK).font('Helvetica').fontSize(8)
           .text(r.employe, cx, y + 5, { width: empCols[1].w - 8 });
        cx += empCols[1].w;
        doc.fill(GREEN).font('Helvetica-Bold').fontSize(8)
           .text(fmt2(r.total), cx, y + 5, { width: empCols[2].w - 8, align: 'right' });
        cx += empCols[2].w;
        doc.fill(GRAY).font('Helvetica').fontSize(8)
           .text(String(r.nb), cx, y + 5, { width: empCols[3].w - 8, align: 'right' });
        y += 19;
      });
    }

    // ── PIED DE PAGE (dernière page) ──────────────────────────────────────────
    drawFooter();

    doc.end();
  } catch (e) {
    console.error('[EXPORT PDF]', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur lors de la génération du PDF.' });
  }
});

module.exports = router;
