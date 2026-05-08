// src/pages/booking/my-appointments/modals/CancelApptModal.jsx
// Modal confirmation annulation d'un RDV cote client.
// Affiche les conditions de remboursement AVANT que le client confirme :
//   - RDV paye en ligne + dans les delais (>= policy_hours avant le RDV)
//     -> bandeau vert : 'Remboursement integral X €'
//   - RDV paye en ligne + hors delais (< policy_hours avant le RDV)
//     -> bandeau ambre : 'Aucun remboursement, acompte conserve'
//   - RDV non paye
//     -> info simple : 'Aucun paiement a rembourser'
//
// Le calcul diff_hours vs policy_hours est fait cote client a partir des
// donnees deja retournees par GET /:slug/client/appointments (policy_hours,
// date, start_time). Le backend re-verifie evidemment au moment du POST
// /cancel pour eviter qu'un client modifie le front et passe en force.
import { fmtApptDate } from '../helpers';

function computeRefundPreview(appt) {
  if (!appt) return null;

  const policyHours = parseInt(appt.policy_hours);
  const safePolicy = Number.isFinite(policyHours) ? policyHours : 2;
  const cents = Number(appt.paid_amount_cents || 0);
  const wasPaidOnline = appt.payment_status === 'paid' && cents > 0;
  const amountEur = (cents / 100).toFixed(2).replace('.', ',');

  // Calcule le delta heures jusqu'au start du RDV (comme cote backend, cf
  // client-profile.js endpoint cancel).
  let diffHours = null;
  try {
    const dateStr  = String(appt.date || '').substring(0, 10);
    const timeStr  = String(appt.start_time || '00:00').substring(0, 5);
    const apptDate = new Date(`${dateStr}T${timeStr}:00`);
    if (!isNaN(apptDate)) {
      diffHours = (apptDate.getTime() - Date.now()) / (1000 * 60 * 60);
    }
  } catch {}

  const isWithinPolicy = safePolicy === 0 || (diffHours != null && diffHours >= safePolicy);

  if (!wasPaidOnline) {
    // RDV pas paye -> annulation simple, rien a rembourser.
    return {
      kind: 'no_payment',
      title: 'Aucun paiement à rembourser',
      message: 'Ce rendez-vous n\'a pas été payé en ligne. L\'annulation ne déclenche aucun remboursement.',
      bg: '#f3f4f6', border: '#e5e7eb', accent: '#6b7280',
    };
  }
  if (isWithinPolicy) {
    return {
      kind: 'refund_full',
      title: `Remboursement intégral de ${amountEur} €`,
      message: 'Vous êtes dans les délais d\'annulation : votre carte sera créditée intégralement sous 3 à 5 jours ouvrés.',
      bg: '#f0fdf4', border: '#bbf7d0', accent: '#10b981',
    };
  }
  // Hors delais : l'acompte est conserve par le salon (politique no-show).
  const policyLabel = safePolicy >= 24
    ? `${Math.round(safePolicy / 24)} jour${safePolicy >= 48 ? 's' : ''}`
    : `${safePolicy} h`;
  return {
    kind: 'no_refund_too_late',
    title: `Aucun remboursement — acompte de ${amountEur} € conservé`,
    message: `Le salon accepte les annulations gratuites jusqu'à ${policyLabel} avant le RDV. Au-delà, l'acompte n'est pas remboursé.`,
    bg: '#fffbeb', border: '#fde68a', accent: '#d97706',
  };
}

export function CancelApptModal({ th, cancelModal, cancelLoading, onClose, onConfirm }) {
  if (!cancelModal) return null;
  const preview = computeRefundPreview(cancelModal);
  const confirmLabel = preview?.kind === 'no_refund_too_late'
    ? 'Annuler sans remboursement'
    : preview?.kind === 'refund_full'
      ? 'Annuler et être remboursé(e)'
      : 'Confirmer l\'annulation';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex',
      alignItems:'center', justifyContent:'center', padding:16,
      background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)' }}>
      <div className="bk-modal-inner" style={{ background:th.card, border: `0.5px solid ${th.border}`,
        borderRadius:20, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto',
        boxShadow:'0 24px 64px rgba(0,0,0,0.18)' }}>
        <div style={{ width:52, height:52, borderRadius:14, background:'rgba(239,68,68,0.1)',
          display:'flex', alignItems:'center', justifyContent:'center', marginBottom:18 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"
            style={{width:26,height:26}}>
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 0-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </div>
        <p style={{ fontSize:17, fontWeight: 500, color:th.text, margin:'0 0 8px' }}>
          Annuler ce rendez-vous ?
        </p>
        <p style={{ fontSize:13, color:th.muted, margin:'0 0 6px', lineHeight:1.5 }}>
          <strong style={{color:th.text}}>{cancelModal.service_name}</strong>
        </p>
        <p style={{ fontSize:13, color:th.muted, margin:'0 0 16px', lineHeight:1.5 }}>
          {fmtApptDate(cancelModal.date)} à {(cancelModal.start_time||'').substring(0,5)}
          {cancelModal.employee_name ? ` · ${cancelModal.employee_name}` : ''}
        </p>

        {/* Bandeau preview remboursement — la couleur depend de la situation
            du client (rembourse / acompte conserve / pas de paiement). */}
        {preview && (
          <div style={{
            marginBottom: 20,
            padding: '14px 16px',
            borderRadius: 12,
            background: preview.bg,
            border: `0.5px solid ${preview.border}`,
            borderLeft: `2px solid ${preview.accent}`,
          }}>
            <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:500, color: preview.accent }}>
              {preview.title}
            </p>
            <p style={{ margin:0, fontSize:12, color: th.text, lineHeight:1.55 }}>
              {preview.message}
            </p>
          </div>
        )}

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} disabled={cancelLoading}
            style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
              background:th.cardAlt, border: `0.5px solid ${th.border}`,
              color:th.text, fontWeight: 500, fontSize:13 }}>
            Garder le RDV
          </button>
          <button onClick={onConfirm} disabled={cancelLoading}
            style={{ flex:1.4, padding:'12px', borderRadius:11, cursor:'pointer',
              background:'#ef4444', border:'none',
              color:'white', fontWeight: 500, fontSize:13,
              opacity:cancelLoading?0.7:1 }}>
            {cancelLoading ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
