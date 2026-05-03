// src/pages/booking/my-appointments/modals/ChangePwdModal.jsx
// Modal changement de mot de passe (2 étapes, modes 'current' / 'forgot').

export function ChangePwdModal({
  th,
  inpStyle,
  pwdModal,
  pwdStep,
  pwdMode,
  pwdCurrent,
  pwdNew,
  pwdNew2,
  pwdCode,
  pwdSentTo,
  pwdLoading,
  pwdErr,
  clientInfo,
  setPwdStep,
  onChangeCurrent,
  onChangeNew,
  onChangeNew2,
  onChangeCode,
  onClose,
  onSubmitInit,
  onSubmitConfirm,
  onSwitchToForgot,
  onSwitchToCurrent,
}) {
  if (!pwdModal) return null;
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
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <p style={{ fontSize:17, fontWeight: 500, color:th.text, margin:'0 0 6px' }}>
          Changer mon mot de passe
        </p>
        {pwdStep === 1 ? (
          <>
            <p style={{ fontSize:13, color:th.muted, margin:'0 0 16px', lineHeight:1.5 }}>
              {pwdMode === 'forgot'
                ? <>Un code à 6 chiffres va être envoyé à <strong style={{color:th.text}}>{clientInfo?.email || '—'}</strong> pour réinitialiser votre mot de passe.</>
                : <>Un code à 6 chiffres sera envoyé à <strong style={{color:th.text}}>{clientInfo?.email || '—'}</strong> pour confirmer le changement.</>
              }
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {pwdMode === 'current' && (
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight: 500,
                    color:th.muted, marginBottom:6 }}>
                    Mot de passe actuel
                  </label>
                  <input type="password" value={pwdCurrent}
                    onChange={onChangeCurrent}
                    autoComplete="current-password" disabled={pwdLoading}
                    style={{ ...inpStyle, borderColor: pwdErr ? '#ef4444' : th.inputBorder }}/>
                  <button type="button" onClick={onSwitchToForgot} disabled={pwdLoading}
                    style={{ marginTop:6, background:'none', border:'none', padding:0,
                      cursor:'pointer', color:th.accent, fontSize:12, fontWeight: 500,
                      textDecoration:'underline' }}>
                    Mot de passe oublié ?
                  </button>
                </div>
              )}
              {pwdMode === 'forgot' && (
                <div style={{ padding:'10px 12px', borderRadius:10,
                  background:'rgba(99,102,241,0.08)', border: `1px solid rgba(99,102,241,0.25)` }}>
                  <p style={{ fontSize:12, color:th.text, margin:0, fontWeight: 500 }}>
                    🔐 Mode mot de passe oublié
                  </p>
                  <p style={{ fontSize:11, color:th.muted, margin:'4px 0 0', lineHeight:1.5 }}>
                    Le changement sera validé par code envoyé par email — obligatoire.{' '}
                    <button type="button" onClick={onSwitchToCurrent} disabled={pwdLoading}
                      style={{ background:'none', border:'none', padding:0, cursor:'pointer',
                        color:th.accent, fontSize:11, fontWeight: 500, textDecoration:'underline' }}>
                      Revenir
                    </button>
                  </p>
                </div>
              )}
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight: 500,
                  color:th.muted, marginBottom:6 }}>
                  Nouveau mot de passe
                </label>
                <input type="password" value={pwdNew}
                  onChange={onChangeNew}
                  autoComplete="new-password" disabled={pwdLoading}
                  placeholder="6 caractères minimum"
                  style={{ ...inpStyle, borderColor: pwdErr ? '#ef4444' : th.inputBorder }}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight: 500,
                  color:th.muted, marginBottom:6 }}>
                  Confirmer le nouveau
                </label>
                <input type="password" value={pwdNew2}
                  onChange={onChangeNew2}
                  autoComplete="new-password" disabled={pwdLoading}
                  style={{ ...inpStyle, borderColor: pwdErr ? '#ef4444' : th.inputBorder }}/>
              </div>
            </div>
            {pwdErr && (
              <p style={{ fontSize:12, color:'#ef4444', fontWeight: 500, margin:'12px 0 0' }}>
                {pwdErr}
              </p>
            )}
            <div style={{ display:'flex', gap:10, marginTop:14 }}>
              <button onClick={onClose} disabled={pwdLoading}
                style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
                  background:th.cardAlt, border: `1px solid ${th.border}`,
                  color:th.muted, fontWeight: 500, fontSize:13 }}>
                Annuler
              </button>
              <button onClick={onSubmitInit} disabled={pwdLoading}
                style={{ flex:1, padding:'12px', borderRadius:11, cursor: pwdLoading ? 'not-allowed' : 'pointer',
                  background:th.accent, border:'none',
                  color:th.accentText, fontWeight: 500, fontSize:13,
                  opacity: pwdLoading ? 0.6 : 1 }}>
                {pwdLoading ? '...' : 'Envoyer le code'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize:13, color:th.muted, margin:'0 0 16px', lineHeight:1.5 }}>
              Un code à 6 chiffres a été envoyé à <strong style={{color:th.text}}>{pwdSentTo}</strong>.
              Saisissez-le pour appliquer le nouveau mot de passe.
            </p>
            <label style={{ display:'block', fontSize:11, fontWeight: 500,
              color:th.muted, marginBottom:6 }}>
              Code de vérification
            </label>
            <input type="text" inputMode="numeric" value={pwdCode}
              onChange={onChangeCode}
              placeholder="123456" autoComplete="one-time-code"
              maxLength={6} disabled={pwdLoading}
              style={{ ...inpStyle, marginBottom:10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize:18, letterSpacing:4, textAlign:'center',
                borderColor: pwdErr ? '#ef4444' : th.inputBorder }}/>
            {pwdErr && (
              <p style={{ fontSize:12, color:'#ef4444', fontWeight: 500, margin:'0 0 12px' }}>
                {pwdErr}
              </p>
            )}
            <div style={{ display:'flex', gap:10, marginTop:6 }}>
              <button onClick={() => setPwdStep(1)} disabled={pwdLoading}
                style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
                  background:th.cardAlt, border: `1px solid ${th.border}`,
                  color:th.muted, fontWeight: 500, fontSize:13 }}>
                Retour
              </button>
              <button onClick={onSubmitConfirm} disabled={pwdLoading || pwdCode.length !== 6}
                style={{ flex:1, padding:'12px', borderRadius:11,
                  cursor: (pwdLoading || pwdCode.length !== 6) ? 'not-allowed' : 'pointer',
                  background:th.accent, border:'none',
                  color:th.accentText, fontWeight: 500, fontSize:13,
                  opacity: (pwdLoading || pwdCode.length !== 6) ? 0.6 : 1 }}>
                {pwdLoading ? '...' : 'Confirmer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
