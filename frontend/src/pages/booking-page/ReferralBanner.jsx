// src/pages/booking-page/ReferralBanner.jsx
// Bandeau parrainage affiché au-dessus du flow réservation.
// 3 états :
//   (1) Éligible (ou éligibilité non vérifiée) → vert : remise annoncée
//   (2) NON éligible (clientUser présent mais ne remplit pas les
//       conditions) → orange : message pédagogique unifié
//   (3) Pas de bandeau si pas de code parrainage

export function ReferralBanner({
  th, referralCode, referralInfo, justRegisteredRef, setJustRegisteredRef,
}) {
  if (!referralCode || !referralInfo) return null;

  return (
    <div style={{ maxWidth:1100, margin:'0 auto 16px', padding:'0 16px' }}>
      {referralInfo.eligible === false ? (
        <div style={{ padding:'12px 16px', borderRadius:14,
          background:'rgba(245,158,11,0.1)',
          border:'1px solid rgba(245,158,11,0.35)',
          display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
          <span style={{ fontSize:20 }}>ℹ️</span>
          <p style={{ fontSize:13, color:th.text, margin:0, flex:1, minWidth:0, lineHeight:1.5 }}>
            <strong>Vous ne pouvez pas bénéficier de ce programme de parrainage</strong>
            {' '}car vous ne répondez pas aux conditions définies par le commerçant
            (programme réservé aux nouveaux clients, quota parrain atteint, ou règles spécifiques).
            Vous pouvez continuer votre réservation au prix normal.
          </p>
        </div>
      ) : (
      <div style={{ padding:'12px 16px', borderRadius:14,
        background:'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(99,102,241,0.12))',
        border:'1px solid rgba(16,185,129,0.32)',
        display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:20 }}>🎁</span>
        <p style={{ fontSize:13, color:th.text, margin:0, flex:1, minWidth:0, lineHeight:1.5 }}>
          {justRegisteredRef
            ? <>Compte créé avec succès ! Votre code parrainage <strong style={{color:'#6d28d9',fontFamily:'monospace'}}>{referralCode}</strong> sera appliqué au récap — remise de{' '}
                <strong>{referralInfo.discount_type === 'percent' ? `${referralInfo.discount_value}%` : `${Number(referralInfo.discount_value).toFixed(2)} €`}</strong>{' '}
                selon les conditions du commerçant.</>
            : <>Parrainage actif — code <strong style={{color:'#6d28d9',fontFamily:'monospace'}}>{referralCode}</strong>, remise de{' '}
                <strong>{referralInfo.discount_type === 'percent' ? `${referralInfo.discount_value}%` : `${Number(referralInfo.discount_value).toFixed(2)} €`}</strong>{' '}
                appliquée au récap selon les conditions du commerçant.</>
          }
        </p>
        <button onClick={() => setJustRegisteredRef(false)} aria-label="Fermer"
          style={{ width:26, height:26, borderRadius:8, border:'none',
            background:'rgba(0,0,0,0.06)', cursor:'pointer', color:th.muted,
            display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{width:12,height:12}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      )}
    </div>
  );
}
