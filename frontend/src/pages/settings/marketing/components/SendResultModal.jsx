export default function SendResultModal({ data, theme, onClose }) {
  const isDark = theme.mode === 'dark';
  const emailSent = data.emailResult?.sent || 0;
  const emailFailed = data.emailResult?.failed || 0;
  const smsSent = data.smsResult?.sent_sms || 0;
  const smsFailed = data.smsResult?.failed || 0;
  const hasError = !!data.error;
  const totalSent = emailSent + smsSent;
  const success = !hasError && totalSent > 0;
  const accent = success ? '#10b981' : hasError ? '#ef4444' : '#f59e0b';
  const title = success ? 'Envoi réussi' : hasError ? 'Erreur d\'envoi' : 'Aucun destinataire';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(12px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:420, background: isDark ? '#161622' : '#fff',
        borderRadius:24, border:`1px solid ${theme.border}`, padding:'32px 28px', textAlign:'center',
        boxShadow:'0 24px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:`${accent}18`,
          display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:18,
          border:`2px solid ${accent}33` }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            {success
              ? <polyline points="20 6 9 17 4 12"/>
              : hasError
                ? <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
            }
          </svg>
        </div>
        <h2 style={{ margin:'0 0 8px', fontSize:22, fontWeight:900, color:theme.text }}>{title}</h2>
        <p style={{ margin:'0 0 22px', fontSize:13, color:theme.muted }}>
          Code <strong style={{ color:theme.text, fontFamily:'monospace' }}>{data.code}</strong>
        </p>

        {hasError ? (
          <div style={{ padding:'14px 16px', borderRadius:12, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', marginBottom:18, textAlign:'left' }}>
            <p style={{ margin:0, fontSize:13, color:'#ef4444' }}>{data.error}</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:22 }}>
            {data.emailResult && (
              <div style={{ padding:'14px 18px', borderRadius:14, background: isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)',
                border:'1px solid rgba(16,185,129,0.22)', display:'flex', alignItems:'center', gap:12, textAlign:'left' }}>
                <div style={{ width:40, height:40, borderRadius:12, background:'rgba(16,185,129,0.16)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>📧</div>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:15, fontWeight:800, color:theme.text }}>
                    {emailSent} email{emailSent > 1 ? 's' : ''} envoyé{emailSent > 1 ? 's' : ''}
                  </p>
                  {emailFailed > 0 && <p style={{ margin:'2px 0 0', fontSize:11, color:'#ef4444' }}>{emailFailed} échec{emailFailed > 1 ? 's' : ''}</p>}
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            )}
            {data.smsResult && (
              <div style={{ padding:'14px 18px', borderRadius:14, background: isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.06)',
                border:'1px solid rgba(139,92,246,0.22)', display:'flex', alignItems:'center', gap:12, textAlign:'left' }}>
                <div style={{ width:40, height:40, borderRadius:12, background:'rgba(139,92,246,0.16)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>📱</div>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:15, fontWeight:800, color:theme.text }}>
                    {smsSent} SMS envoyé{smsSent > 1 ? 's' : ''}
                  </p>
                  {smsFailed > 0 && <p style={{ margin:'2px 0 0', fontSize:11, color:'#ef4444' }}>{smsFailed} échec{smsFailed > 1 ? 's' : ''}</p>}
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            )}
            {!data.emailResult && !data.smsResult && (
              <p style={{ margin:0, fontSize:13, color:theme.muted }}>Aucun destinataire trouvé.</p>
            )}
          </div>
        )}

        <button onClick={onClose}
          style={{ width:'100%', padding:'13px', borderRadius:12, border:'none',
            background: accent, color:'white', fontWeight:800, fontSize:14, cursor:'pointer',
            boxShadow:`0 4px 14px ${accent}55` }}>
          Fermer
        </button>
      </div>
    </div>
  );
}
