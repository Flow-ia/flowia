// src/pages/booking/my-appointments/modals/ChangeEmailModal.jsx
// Modal changement d'email en 2 étapes (saisie → code OTP).

export function ChangeEmailModal({
  th,
  inpStyle,
  emailModal,
  emailStep,
  emailNew,
  emailCode,
  emailSentTo,
  emailLoading,
  emailErr,
  clientInfo,
  setEmailStep,
  onChangeNew,
  onChangeCode,
  onClose,
  onSubmitInit,
  onSubmitConfirm,
}) {
  if (!emailModal) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex',
      alignItems:'center', justifyContent:'center', padding:16,
      background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)' }}>
      <div className="bk-modal-inner" style={{ background:th.card, border: `1px solid ${th.border}`,
        borderRadius:20, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto',
        boxShadow:'0 24px 64px rgba(0,0,0,0.18)' }}>
        <div style={{ width:52, height:52, borderRadius:14, background:'rgba(99,102,241,0.1)',
          display:'flex', alignItems:'center', justifyContent:'center', marginBottom:18 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"
            style={{width:26,height:26}}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <p style={{ fontSize:17, fontWeight: 500, color:th.text, margin:'0 0 6px' }}>
          Changer mon email
        </p>
        {emailStep === 1 ? (
          <>
            <p style={{ fontSize:13, color:th.muted, margin:'0 0 16px', lineHeight:1.5 }}>
              Votre adresse actuelle : <strong style={{color:th.text}}>{clientInfo?.email || '—'}</strong>.
              Un code à 6 chiffres y sera envoyé pour confirmer le changement.
            </p>
            <label style={{ display:'block', fontSize:11, fontWeight: 500,
              color:th.muted, marginBottom:6 }}>
              Nouvel email
            </label>
            <input type="email" value={emailNew}
              onChange={onChangeNew}
              placeholder="nouveau@email.com" autoComplete="email"
              disabled={emailLoading}
              style={{ ...inpStyle, marginBottom:10,
                borderColor: emailErr ? th.ax.rose : th.inputBorder }}/>
            {emailErr && (
              <p style={{ fontSize:12, color:th.ax.rose, fontWeight: 500, margin:'0 0 12px' }}>
                {emailErr}
              </p>
            )}
            <div style={{ display:'flex', gap:10, marginTop:6 }}>
              <button onClick={onClose} disabled={emailLoading}
                style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
                  background:th.cardAlt, border: `1px solid ${th.border}`,
                  color:th.muted, fontWeight: 500, fontSize:13 }}>
                Annuler
              </button>
              <button onClick={onSubmitInit} disabled={emailLoading}
                style={{ flex:1, padding:'12px', borderRadius:11, cursor: emailLoading ? 'not-allowed' : 'pointer',
                  background:th.accent, border:'none',
                  color:th.accentText, fontWeight: 500, fontSize:13,
                  opacity: emailLoading ? 0.6 : 1 }}>
                {emailLoading ? '...' : 'Envoyer le code'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize:13, color:th.muted, margin:'0 0 16px', lineHeight:1.5 }}>
              Un code à 6 chiffres a été envoyé à <strong style={{color:th.text}}>{emailSentTo}</strong>.
              Saisissez-le ci-dessous pour confirmer.
            </p>
            <label style={{ display:'block', fontSize:11, fontWeight: 500,
              color:th.muted, marginBottom:6 }}>
              Code de vérification
            </label>
            <input type="text" inputMode="numeric" value={emailCode}
              onChange={onChangeCode}
              placeholder="123456" autoComplete="one-time-code"
              maxLength={6} disabled={emailLoading}
              style={{ ...inpStyle, marginBottom:10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize:18, letterSpacing:4, textAlign:'center',
                borderColor: emailErr ? th.ax.rose : th.inputBorder }}/>
            {emailErr && (
              <p style={{ fontSize:12, color:th.ax.rose, fontWeight: 500, margin:'0 0 12px' }}>
                {emailErr}
              </p>
            )}
            <div style={{ display:'flex', gap:10, marginTop:6 }}>
              <button onClick={() => setEmailStep(1)} disabled={emailLoading}
                style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
                  background:th.cardAlt, border: `1px solid ${th.border}`,
                  color:th.muted, fontWeight: 500, fontSize:13 }}>
                Retour
              </button>
              <button onClick={onSubmitConfirm} disabled={emailLoading || emailCode.length !== 6}
                style={{ flex:1, padding:'12px', borderRadius:11,
                  cursor: (emailLoading || emailCode.length !== 6) ? 'not-allowed' : 'pointer',
                  background:th.accent, border:'none',
                  color:th.accentText, fontWeight: 500, fontSize:13,
                  opacity: (emailLoading || emailCode.length !== 6) ? 0.6 : 1 }}>
                {emailLoading ? '...' : 'Confirmer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
