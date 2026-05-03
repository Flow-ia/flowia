// src/pages/booking/my-appointments/modals/TooLateModal.jsx
// Modal affiché lorsqu'un RDV est dans moins du délai autorisé par le commerçant.

export function TooLateModal({ th, tooLateModal, onClose }) {
  if (!tooLateModal) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex',
      alignItems:'center', justifyContent:'center', padding:16,
      background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)' }}>
      <div className="bk-modal-inner" style={{ background:th.card, border: `0.5px solid ${th.border}`,
        borderRadius:20, padding:28, width:'100%', maxWidth:420, maxHeight:'90vh', overflowY:'auto',
        boxShadow:'0 24px 64px rgba(0,0,0,0.18)' }}>
        <div style={{ width:52, height:52, borderRadius:14, background:'rgba(245,158,11,0.1)',
          display:'flex', alignItems:'center', justifyContent:'center', marginBottom:18 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"
            style={{width:26,height:26}}>
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <p style={{ fontSize:17, fontWeight: 500, color:th.text, margin:'0 0 10px' }}>
          Annulation en ligne impossible
        </p>
        <p style={{ fontSize:13, color:th.muted, margin:'0 0 16px', lineHeight:1.6 }}>
          {tooLateModal._policyHours > 0
            ? `Ce rendez-vous commence dans moins de ${tooLateModal._policyHours < 24 ? tooLateModal._policyHours + ' heures' : Math.round(tooLateModal._policyHours/24) + ' jour' + (tooLateModal._policyHours >= 48 ? 's' : '')}. Le délai autorisé par le commerçant est dépassé.`
            : 'Le délai d\'annulation est dépassé.'}
        </p>
        <p style={{ fontSize:13, fontWeight: 500, color:th.text, margin:'0 0 12px' }}>
          Pour annuler, merci de prendre contact avec {tooLateModal._businessName || 'le commerçant'} :
        </p>
        <div style={{ background:th.cardAlt, border: `0.5px solid ${th.border}`,
          borderRadius:12, padding:'14px 16px', marginBottom:20,
          display:'flex', flexDirection:'column', gap:8 }}>
          {tooLateModal._businessPhone && (
            <a href={`tel:${tooLateModal._businessPhone}`}
              style={{ display:'flex', alignItems:'center', gap:10,
                fontSize:14, fontWeight: 500, color:th.text, textDecoration:'none' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{width:16,height:16,color:th.muted,flexShrink:0}}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              {tooLateModal._businessPhone}
            </a>
          )}
          {(tooLateModal._businessAddress || tooLateModal._businessCity) && (
            <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{width:16,height:16,color:th.muted,flexShrink:0,marginTop:1}}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <div>
                {tooLateModal._businessAddress && (
                  <p style={{ fontSize:13, color:th.muted, margin:0 }}>{tooLateModal._businessAddress}</p>
                )}
                {(tooLateModal._businessPostal || tooLateModal._businessCity) && (
                  <p style={{ fontSize:13, color:th.muted, margin:0 }}>
                    {[tooLateModal._businessPostal, tooLateModal._businessCity].filter(Boolean).join(' ')}
                  </p>
                )}
              </div>
            </div>
          )}
          {/* Fallback si aucun contact connu */}
          {!tooLateModal._businessPhone && !tooLateModal._businessAddress && !tooLateModal._businessCity && (
            <p style={{ fontSize:13, color:th.muted, margin:0, textAlign:'center' }}>
              Merci de prendre contact directement avec le commerçant.
            </p>
          )}
        </div>
        <button onClick={onClose}
          style={{ width:'100%', padding:'13px', borderRadius:11, cursor:'pointer',
            background:th.accent, border:'none',
            color:th.accentText, fontWeight: 500, fontSize:14 }}>
          Compris
        </button>
      </div>
    </div>
  );
}
