// src/pages/booking/my-appointments/modals/CancelResultModal.jsx
// Modal affichee APRES une annulation reussie. Communique clairement au
// client le resultat et le statut du remboursement (vs un toast discret
// qui pouvait passer inapercu).
//
// 4 etats supportes :
//   1. refunded   : RDV annule + refund integral initie (vert)
//   2. too_late   : RDV annule + acompte conserve par le salon (ambre)
//   3. failed     : RDV annule mais refund Stripe en erreur (rouge)
//   4. simple     : RDV annule (pas de paiement online) (vert pastel)
//
// Le client doit cliquer 'OK, j'ai compris' pour fermer -> il a vu et
// acquiesce le message. Pas de toast qui disparait tout seul.

const CFG = {
  refunded: {
    icon: 'check',
    iconBg: '#dcfce7',
    iconColor: '#15803d',
    accent: '#10b981',
    border: '#bbf7d0',
    bg: '#f0fdf4',
    title: 'Rendez-vous annulé · Remboursement initié',
  },
  too_late: {
    icon: 'warning',
    iconBg: '#fef3c7',
    iconColor: '#a16207',
    accent: '#d97706',
    border: '#fde68a',
    bg: '#fffbeb',
    title: 'Rendez-vous annulé · Acompte conservé',
  },
  failed: {
    icon: 'warning',
    iconBg: '#fee2e2',
    iconColor: '#b91c1c',
    accent: '#dc2626',
    border: '#fecaca',
    bg: '#fef2f2',
    title: 'Rendez-vous annulé · Remboursement en cours',
  },
  simple: {
    icon: 'check',
    iconBg: '#dcfce7',
    iconColor: '#15803d',
    accent: '#10b981',
    border: '#e5e7eb',
    bg: '#ffffff',
    title: 'Rendez-vous annulé',
  },
};

function IconCheck({ color }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
         strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function IconWarning({ color }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4"
         strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

export function CancelResultModal({ th, result, onClose }) {
  if (!result) return null;
  const cfg = CFG[result.kind] || CFG.simple;

  // Construit le corps du message en fonction du cas + montant si applicable.
  const eur = result.amountEur ? `${result.amountEur} DA` : '';
  let mainText = '';
  let secondaryText = '';
  switch (result.kind) {
    case 'refunded':
      mainText = `Vous serez remboursé(e) intégralement de ${eur}.`;
      secondaryText = 'Le crédit apparaîtra sur votre carte sous 3 à 5 jours ouvrés. Un email de confirmation Stripe vous sera envoyé.';
      break;
    case 'too_late':
      mainText = `L'acompte de ${eur} est conservé par le salon.`;
      secondaryText = 'L\'annulation a eu lieu hors des délais autorisés (politique no-show du salon).';
      break;
    case 'failed':
      mainText = 'Votre annulation a bien été enregistrée.';
      secondaryText = 'Le remboursement a rencontré un problème technique. Le salon a été notifié et le remboursement sera traité manuellement sous 1 à 2 jours ouvrés.';
      break;
    case 'simple':
    default:
      mainText = 'Votre rendez-vous a bien été annulé.';
      secondaryText = 'Aucun paiement n\'avait été effectué en ligne pour ce rendez-vous.';
      break;
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex',
      alignItems:'center', justifyContent:'center', padding:16,
      background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)' }}>
      <div className="bk-modal-inner"
           style={{ background:th.card, border: `0.5px solid ${th.border}`,
             borderRadius:20, padding:28, width:'100%', maxWidth:440,
             maxHeight:'90vh', overflowY:'auto',
             boxShadow:'0 24px 64px rgba(0,0,0,0.18)' }}>

        {/* Pictogramme statut en haut */}
        <div style={{
          width:60, height:60, borderRadius:16,
          background: cfg.iconBg,
          display:'flex', alignItems:'center', justifyContent:'center',
          marginBottom: 18,
        }}>
          {cfg.icon === 'check'
            ? <IconCheck color={cfg.iconColor}/>
            : <IconWarning color={cfg.iconColor}/>}
        </div>

        {/* Titre */}
        <p style={{ fontSize:18, fontWeight:500, color:th.text,
                    margin:'0 0 8px', letterSpacing:'-0.02em' }}>
          {cfg.title}
        </p>

        {/* Texte principal */}
        <p style={{ fontSize:14, color:th.text, margin:'0 0 8px', lineHeight:1.5 }}>
          {mainText}
        </p>

        {/* Détail secondaire */}
        <p style={{ fontSize:13, color:th.muted, margin:'0 0 22px', lineHeight:1.55 }}>
          {secondaryText}
        </p>

        {/* Bandeau RDV details (rappel ce qu'on vient d'annuler) */}
        {result.appt && (
          <div style={{
            marginBottom: 22,
            padding: '12px 14px',
            borderRadius: 10,
            background: cfg.bg,
            border: `0.5px solid ${cfg.border}`,
            borderLeft: `2px solid ${cfg.accent}`,
          }}>
            <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:500, color:th.text }}>
              {result.appt.service_name || 'Rendez-vous'}
            </p>
            <p style={{ margin:0, fontSize:12, color:th.muted }}>
              {result.apptDateLabel}
              {result.appt.employee_name ? ` · ${result.appt.employee_name}` : ''}
            </p>
          </div>
        )}

        <button onClick={onClose}
          style={{ width:'100%', padding:'13px', borderRadius:12, cursor:'pointer',
            background:th.text, color:th.bg,
            border:'none', fontWeight:500, fontSize:14,
            fontFamily:'inherit' }}>
          OK, j&apos;ai compris
        </button>
      </div>
    </div>
  );
}
