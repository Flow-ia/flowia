// src/pages/booking/my-appointments/helpers.js
// Helpers de formatage / calcul de statut pour l'écran "Mes RDV".

// Extrait YYYY-MM-DD depuis un ISO / Date / string quel qu'il soit
export const ymd = (d) => {
  if (!d) return '';
  const s = String(d);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

// Extraire une string 'YYYY-MM-DD' depuis n'importe quel format de date
export const parseDateStr = (d) => {
  if (!d) return '';
  // Si c'est un objet Date JS — utiliser les méthodes locales pour éviter le décalage UTC
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  // Si c'est une string ISO avec timezone (ex: "2025-04-14T00:00:00.000Z")
  // → prendre les 10 premiers chars directement (c'est toujours YYYY-MM-DD)
  return String(d).substring(0, 10);
};

// Extraire 'HH:MM' depuis un time string
export const parseTimeStr = (t) => {
  if (!t) return '';
  return String(t).substring(0, 5);
};

// ── Calcul du statut réel d'un RDV ──────────────────────────────────────────
// FIX : un RDV payé en ligne EN AVANCE (paid=true) n'est PAS un RDV passé.
// Le critère 'passes' doit etre uniquement temporel (date passee) ou
// status='completed' explicite. paid=true peut tres bien etre vrai sur un
// RDV futur (acompte / paiement integral en ligne au moment de la
// reservation).
export const getDisplayStatus = (a) => {
  if (a.status === 'cancelled') {
    return { label:'Annule', color:'#f87171', bg:'rgba(248,113,113,0.10)', icon:'✕', canCancel:false, group:'annules' };
  }
  if (a.status === 'no_show') {
    return { label:'Absent', color:'#94a3b8', bg:'rgba(148,163,184,0.10)', icon:'-', canCancel:false, group:'passes' };
  }
  // Construire datetime locale — on utilise start_time comme référence
  const rawDate  = parseDateStr(a.date);
  const startRaw = parseTimeStr(a.start_time);
  const startTimeStr = startRaw || '23:59';
  const startDateTime = rawDate ? new Date(`${rawDate}T${startTimeStr}:00`) : null;
  const isPast = startDateTime && !isNaN(startDateTime) && startDateTime < new Date();

  // RDV manuellement marque 'completed' (encaisse en boutique) : peu
  // importe la date, c'est termine.
  if (a.status === 'completed') {
    return { label: a.paid ? 'Encaisse' : 'Termine', color:'#34d399', bg:'rgba(52,211,153,0.10)', icon:'✓', canCancel:false, group:'passes' };
  }
  // RDV passe (date depassee) qui n'est pas marque completed -> passes.
  // S'il est paid online (paid=true), on indique 'Encaisse' (la prestation
  // a eu lieu et le paiement etait deja regle).
  if (isPast) {
    return { label: a.paid ? 'Encaisse' : 'Passe', color:'#94a3b8', bg:'rgba(148,163,184,0.10)', icon: a.paid ? '✓' : '↩', canCancel:false, group:'passes' };
  }
  // Règle 2h : annulation possible si RDV dans plus de 2h
  const canCancelByTime = !startDateTime || ((startDateTime - new Date()) / (1000 * 60 * 60)) >= 2;
  // RDV futur -> group 'futurs' meme si paid=true. Le paid=true ajoute
  // juste une indication 'Paye' au statut pour rassurer le client.
  if (a.status === 'confirmed') {
    const lbl = a.paid ? 'Confirme · Paye' : 'Confirme';
    return { label: lbl, color:'#4ade80', bg:'rgba(74,222,128,0.10)', icon:'✓', canCancel:canCancelByTime, group:'futurs' };
  }
  return { label: a.paid ? 'En attente · Paye' : 'En attente',
           color:'#fbbf24', bg:'rgba(251,191,36,0.10)', icon:'...',
           canCancel:canCancelByTime, group:'futurs' };
};

// Formater la date proprement (supporte Date JS, ISO, YYYY-MM-DD)
export const fmtApptDate = (dateRaw) => {
  const dateStr = parseDateStr(dateRaw);
  if (!dateStr || dateStr.length < 10) return '-';
  const d = new Date(`${dateStr}T12:00:00`);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
};

// Style input commun (reçoit th pour les couleurs thème)
export const makeInpStyle = (th) => ({
  width:'100%', padding:'12px 14px', borderRadius:12, outline:'none',
  background:th.inputBg, border:`1.5px solid ${th.inputBorder}`,
  color:th.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box',
});
