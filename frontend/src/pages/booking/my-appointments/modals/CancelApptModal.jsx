// src/pages/booking/my-appointments/modals/CancelApptModal.jsx
// Modal confirmation annulation d'un RDV.
import { fmtApptDate } from '../helpers';

export function CancelApptModal({ th, cancelModal, cancelLoading, onClose, onConfirm }) {
  if (!cancelModal) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex',
      alignItems:'center', justifyContent:'center', padding:16,
      background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)' }}>
      <div className="bk-modal-inner" style={{ background:th.card, border: `1px solid ${th.border}`,
        borderRadius:20, padding:28, width:'100%', maxWidth:400, maxHeight:'90vh', overflowY:'auto',
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
        <p style={{ fontSize:13, color:th.muted, margin:'0 0 20px', lineHeight:1.5 }}>
          {fmtApptDate(cancelModal.date)} à {(cancelModal.start_time||'').substring(0,5)}
          {cancelModal.employee_name ? ` · ${cancelModal.employee_name}` : ''}
        </p>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} disabled={cancelLoading}
            style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
              background:th.cardAlt, border: `1px solid ${th.border}`,
              color:th.muted, fontWeight: 500, fontSize:13 }}>
            Garder
          </button>
          <button onClick={onConfirm} disabled={cancelLoading}
            style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
              background:'#ef4444', border:'none',
              color:'white', fontWeight: 500, fontSize:13,
              opacity:cancelLoading?0.7:1 }}>
            {cancelLoading ? '...' : 'Confirmer l\'annulation'}
          </button>
        </div>
      </div>
    </div>
  );
}
