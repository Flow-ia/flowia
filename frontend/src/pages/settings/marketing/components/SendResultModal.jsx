import { I } from '../../../../utils/icons';
import { Button } from '../../../../components/primitives';

export default function SendResultModal({ data, theme, onClose }) {
  const t = theme;
  const emailSent   = data.emailResult?.sent || 0;
  const emailFailed = data.emailResult?.failed || 0;
  const smsSent     = data.smsResult?.sent_sms || 0;
  const smsFailed   = data.smsResult?.failed || 0;
  const hasError    = !!data.error;
  const totalSent   = emailSent + smsSent;
  const success     = !hasError && totalSent > 0;

  const accent = success ? '#065f46' : hasError ? '#991b1b' : '#92400e';
  const accentBg = success ? '#f0fdf4' : hasError ? '#fef2f2' : '#fffbeb';
  const title = success ? 'Envoi reussi' : hasError ? "Erreur d'envoi" : 'Aucun destinataire';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose}
           style={{ position:'absolute', inset:0,
                    background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}/>
      <div style={{ position:'relative', width:'100%', maxWidth:420, padding:'28px 24px', textAlign:'center',
                    background:t.elevated, borderRadius:16,
                    border:`0.5px solid ${t.border}`,
                    boxShadow:t.shadowModal }}>
        <div style={{ width:56, height:56, borderRadius:'50%',
                      background:accentBg,
                      display:'inline-flex', alignItems:'center', justifyContent:'center',
                      marginBottom:16 }}>
          {success ? (
            <I.Check style={{ width:28, height:28, color:accent }}/>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accent}
                 strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
        </div>
        <h2 style={{ margin:'0 0 8px', fontSize:18, fontWeight:500, color:t.text }}>{title}</h2>
        <p style={{ margin:'0 0 20px', fontSize:13, color:t.muted }}>
          Code <strong style={{ color:t.text, fontFamily:'monospace', fontWeight:500 }}>{data.code}</strong>
        </p>

        {hasError ? (
          <div style={{ padding:'12px 14px', borderRadius:8,
                        background:'#fef2f2', marginBottom:18, textAlign:'left' }}>
            <p style={{ margin:0, fontSize:13, color:'#991b1b' }}>{data.error}</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
            {data.emailResult && (
              <div style={{ padding:'12px 16px', borderRadius:8,
                            background:'#f0fdf4',
                            display:'flex', alignItems:'center', gap:12, textAlign:'left' }}>
                <div style={{ width:36, height:36, borderRadius:8,
                              background:'rgba(16,185,129,0.2)',
                              display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <I.Mail style={{ width:17, height:17, color:'#065f46' }}/>
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
                    {emailSent} email{emailSent > 1 ? 's' : ''} envoye{emailSent > 1 ? 's' : ''}
                  </p>
                  {emailFailed > 0 && (
                    <p style={{ margin:'2px 0 0', fontSize:11, color:'#991b1b' }}>
                      {emailFailed} echec{emailFailed > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <I.Check style={{ width:18, height:18, color:'#065f46' }}/>
              </div>
            )}
            {data.smsResult && (
              <div style={{ padding:'12px 16px', borderRadius:8,
                            background:'#eeedfe',
                            display:'flex', alignItems:'center', gap:12, textAlign:'left' }}>
                <div style={{ width:36, height:36, borderRadius:8,
                              background:'rgba(139,92,246,0.2)',
                              display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <I.Phone style={{ width:17, height:17, color:'#3c3489' }}/>
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
                    {smsSent} SMS envoye{smsSent > 1 ? 's' : ''}
                  </p>
                  {smsFailed > 0 && (
                    <p style={{ margin:'2px 0 0', fontSize:11, color:'#991b1b' }}>
                      {smsFailed} echec{smsFailed > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <I.Check style={{ width:18, height:18, color:'#3c3489' }}/>
              </div>
            )}
            {!data.emailResult && !data.smsResult && (
              <p style={{ margin:0, fontSize:13, color:t.muted }}>Aucun destinataire trouve.</p>
            )}
          </div>
        )}

        <Button variant="primary" fullWidth type="button" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  );
}
