// src/pages/booking/my-appointments/modals/DeleteAccountModal.jsx
// Modal suppression de compte (RGPD) avec confirmation par saisie de phrase.
import { DELETE_PHRASE } from '../constants';

export function DeleteAccountModal({
  th,
  inpStyle,
  deleteModal,
  deleteConfirm,
  deleteConfirmOk,
  deleteLoading,
  deleteErr,
  slug,
  creditsSummary = { credits: [], debts: [] },
  onChangeConfirm,
  onClose,
  onConfirm,
}) {
  if (!deleteModal) return null;
  const credits = creditsSummary?.credits || [];
  const debts   = creditsSummary?.debts   || [];
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex',
      alignItems:'center', justifyContent:'center', padding:16,
      background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)' }}>
      <div className="bk-modal-inner" style={{ background:th.card, border: `1px solid ${th.border}`,
        borderRadius:20, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto',
        boxShadow:'0 24px 64px rgba(0,0,0,0.18)' }}>
        <div style={{ width:52, height:52, borderRadius:14, background:'rgba(239,68,68,0.1)',
          display:'flex', alignItems:'center', justifyContent:'center', marginBottom:18 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"
            style={{width:26,height:26}}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <p style={{ fontSize:17, fontWeight: 500, color:th.text, margin:'0 0 8px' }}>
          Supprimer mon compte ?
        </p>
        <p style={{ fontSize:13, color:th.muted, margin:'0 0 10px', lineHeight:1.6 }}>
          Cette action est <strong style={{color:th.text}}>irréversible</strong>.{' '}
          <a href={`/book/${slug}/politique`} target="_blank" rel="noreferrer"
            style={{ color:th.text, fontWeight: 500, textDecoration:'underline' }}>
            Voir la politique de confidentialité
          </a>.
        </p>

        {/* Credits avoir : avertissement abandon */}
        {credits.length > 0 && (
          <div style={{ marginBottom:14, padding:'12px 14px', borderRadius:12,
                        background:'rgba(245,158,11,0.08)',
                        border:'1px solid rgba(245,158,11,0.2)' }}>
            <p style={{ margin:'0 0 8px', fontWeight:500, fontSize:13, color:'#92400e' }}>
              Crédits que vous allez abandonner :
            </p>
            {credits.map((c, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between',
                                    fontSize:12, color:'#7c2d12', padding:'4px 0' }}>
                <span>{c.merchant_name}</span>
                <span style={{ fontWeight:500 }}>{Number(c.amount).toFixed(2)} €</span>
              </div>
            ))}
            <p style={{ margin:'8px 0 0', fontSize:11, color:'#92400e', lineHeight:1.5 }}>
              Ces crédits seront perdus. Si vous souhaitez les récupérer, contactez le commerçant
              concerné avant de supprimer votre compte.
            </p>
          </div>
        )}

        {/* Dettes : avertissement RGPD Art. 17.3.e */}
        {debts.length > 0 && (
          <div style={{ marginBottom:14, padding:'12px 14px', borderRadius:12,
                        background:'rgba(239,68,68,0.08)',
                        border:'1px solid rgba(239,68,68,0.25)' }}>
            <p style={{ margin:'0 0 8px', fontWeight:500, fontSize:13, color:'#991b1b' }}>
              Dettes en cours auprès de :
            </p>
            {debts.map((d, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between',
                                    fontSize:12, color:'#991b1b', padding:'4px 0' }}>
                <span>{d.merchant_name}</span>
                <span style={{ fontWeight:500 }}>−{Number(d.amount).toFixed(2)} €</span>
              </div>
            ))}
            <p style={{ margin:'8px 0 0', fontSize:11, color:'#991b1b', lineHeight:1.6 }}>
              La suppression de votre compte <strong>ne vous libère pas de ces dettes</strong>.
              Vos coordonnées (nom, email, téléphone) seront <strong>conservées 2 ans</strong>
              par le(s) commerçant(s) concerné(s) pour permettre le recouvrement, conformément
              à l'<strong>Article 17.3.e du RGPD</strong>. Au-delà, elles seront automatiquement effacées.
            </p>
          </div>
        )}
        <p style={{ fontSize:13, color:th.muted, margin:'0 0 8px', lineHeight:1.5 }}>
          Pour confirmer, saisissez&nbsp;:
        </p>
        <p style={{ fontSize:15, fontWeight: 500, color:'#ef4444', margin:'0 0 10px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing:1 }}>
          {DELETE_PHRASE}
        </p>
        <input type="text" value={deleteConfirm}
          onChange={onChangeConfirm}
          placeholder={DELETE_PHRASE}
          autoComplete="off" autoCapitalize="none" spellCheck={false}
          disabled={deleteLoading}
          style={{ ...inpStyle, marginBottom:10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing:1,
            borderColor: deleteErr ? '#ef4444' : th.inputBorder }}/>
        {deleteErr && (
          <p style={{ fontSize:12, color:'#ef4444', fontWeight: 500, margin:'0 0 12px' }}>
            {deleteErr}
          </p>
        )}
        <div style={{ display:'flex', gap:10, marginTop:6 }}>
          <button onClick={onClose} disabled={deleteLoading}
            style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
              background:th.cardAlt, border: `1px solid ${th.border}`,
              color:th.muted, fontWeight: 500, fontSize:13 }}>
            Annuler
          </button>
          <button onClick={onConfirm}
            disabled={deleteLoading || !deleteConfirmOk}
            style={{ flex:1, padding:'12px', borderRadius:11,
              cursor: (deleteLoading || !deleteConfirmOk) ? 'not-allowed' : 'pointer',
              background:'#ef4444', border:'none',
              color:'white', fontWeight: 500, fontSize:13,
              opacity: (deleteLoading || !deleteConfirmOk) ? 0.5 : 1 }}>
            {deleteLoading ? '...' : 'Supprimer définitivement'}
          </button>
        </div>
      </div>
    </div>
  );
}
