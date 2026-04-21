// src/pages/booking-page/steps/Step6Confirm.jsx
// Étape 6 : confirmation finale — récap + code promo/parrainage + bouton
// "Réserver" qui déclenche handleBook().

export function Step6Confirm({
  th, selSvc, selEmp, selDate, selSlot,
  clientUser, clientName, clientEmail, clientPhone,
  promoCode, setPromoCode, promoData, setPromoData, promoErr, setPromoErr,
  promoLoading, checkPromo,
  bookErr, booking, handleBook,
}) {
  return (
    <div>
      <h2 style={{fontSize:20,fontWeight: 500,color:th.text,margin:'0 0 20px',letterSpacing:'-0.02em'}}>
        Confirmer
      </h2>
      <div style={{background:th.card,border: `0.5px solid ${th.border}`,
        borderRadius:12,padding:'16px 20px',marginBottom:20}}>
        {[['Service',selSvc?.name],
          ['Avec',selEmp?._anyEmployee?'Premier disponible':selEmp?.name],
          ['Date',selDate?.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})],
          ['Heure',selSlot],
          ['Duree',`${selSvc?.duration_minutes} min`],
          selSvc?.price&&selSvc.price!==''?['Prix',`${Number(selSvc.price).toFixed(2)} €`]:null,
          ['Client',clientUser?`${clientUser.first_name} ${clientUser.last_name}`:clientName],
          (clientUser?.email||clientEmail)?['Email',clientUser?.email||clientEmail]:null,
          clientPhone?['Tel.',clientPhone]:null,
        ].filter(Boolean).map(([l,v])=>(
          <div key={l} style={{display:'flex',justifyContent:'space-between',
            padding:'8px 0',borderBottom: `0.5px solid ${th.border}`}}>
            <span style={{fontSize:13,color:th.muted}}>{l}</span>
            <span style={{fontSize:13,fontWeight: 500,color:th.text}}>{v}</span>
          </div>
        ))}
      </div>

      {selSvc?.price > 0 && (
        <div style={{marginBottom:20}}>
          <label style={{fontSize:12,fontWeight: 500,color:th.muted,display:'block',marginBottom:4}}>
            Code promo ou parrainage (optionnel)
          </label>
          <p style={{fontSize:10,color:th.dim,margin:'0 0 8px',fontStyle:'italic'}}>
            Non cumulable avec une autre réduction (anniversaire, promo…).
          </p>
          <div style={{display:'flex',gap:8}}>
            <input value={promoCode}
              onChange={e=>{setPromoCode(e.target.value.toUpperCase());setPromoData(null);setPromoErr('');}}
              onKeyDown={e=>e.key==='Enter'&&checkPromo()}
              placeholder="PROMO10 ou code parrainage"
              style={{flex:1,padding:'11px 14px',borderRadius:9,outline:'none',
                background:th.inputBg,border: `0.5px solid ${promoData?(promoData.source==='referral'?'#8b5cf6':'#22c55e'):promoErr?'#ef4444':th.inputBorder}`,
                color:th.text,fontSize:13,fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'}}/>
            <button onClick={checkPromo} disabled={promoLoading||!promoCode.trim()}
              style={{padding:'11px 18px',borderRadius:9,border: `0.5px solid ${th.border}`,
                background:th.cardAlt,color:th.text,fontSize:13,fontWeight: 500,
                cursor:'pointer',opacity:!promoCode.trim()?0.4:1}}>
              {promoLoading?'...':'Valider'}
            </button>
          </div>
          {promoData && (
            <div style={{marginTop:8,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,
              padding:'10px 14px',borderRadius:9,
              background: promoData.source === 'referral' ? 'rgba(139,92,246,0.08)' : 'rgba(34,197,94,0.07)',
              border: promoData.source === 'referral' ? '1px solid rgba(139,92,246,0.28)' : '1px solid rgba(34,197,94,0.2)'}}>
              <div style={{display:'flex',flexDirection:'column',gap:2,minWidth:0}}>
                {promoData.source === 'referral' && (
                  <span style={{fontSize:10,fontWeight: 500,color:'#6d28d9'}}>
                    🎁 Parrainage appliqué
                  </span>
                )}
                <span style={{fontSize:12,fontWeight: 500,color: promoData.source === 'referral' ? '#5b21b6' : '#16a34a'}}>
                  {promoData.type==='percent'?`-${promoData.value}%`:`-${promoData.discount.toFixed(2)} €`} appliqué !
                </span>
              </div>
              <span style={{fontSize:13,fontWeight: 500,color: promoData.source === 'referral' ? '#4c1d95' : '#166534',fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',flexShrink:0}}>
                {((selSvc?.price||0)-promoData.discount).toFixed(2)} €
              </span>
            </div>
          )}
          {promoErr && <p style={{fontSize:12,color:'#ef4444',marginTop:6,fontWeight: 500}}>{promoErr}</p>}
        </div>
      )}

      {bookErr && <p style={{fontSize:12,color:'#ef4444',marginBottom:12,fontWeight: 500}}>{bookErr}</p>}

      <button onClick={handleBook} disabled={booking}
        style={{width:'100%',padding:'16px',borderRadius:12,
          background:th.accent,border:'none',fontWeight: 500,fontSize:15,
          color:th.accentText,cursor:booking?'wait':'pointer',
          opacity:booking?0.7:1,letterSpacing:'-0.01em',
          display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
        {booking ? (
          <>
            <div style={{width:18,height:18,borderRadius:99,
              border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',
              animation:'spin .7s linear infinite'}}/>
            Réservation en cours…
          </>
        ) : (
          promoData
            ? `Reserver - ${((selSvc?.price||0)-promoData.discount).toFixed(2)} €`
            : selSvc?.price&&Number(selSvc.price)>0
              ? `Reserver - ${Number(selSvc.price).toFixed(2)} €`
              : 'Reserver'
        )}
      </button>
    </div>
  );
}
