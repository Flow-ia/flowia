// src/pages/booking-page/steps/Step6Confirm.jsx
// Étape 6 : confirmation finale — récap + réductions disponibles + code
// promo manuel + bouton "Réserver" qui déclenche handleBook().
import { useEffect, useState } from 'react';
import { pubApi } from '../../../utils/api';

export function Step6Confirm({
  th, slug, selSvc, selEmp, selDate, selSlot,
  clientUser, clientName, clientEmail, clientPhone,
  promoCode, setPromoCode, promoData, setPromoData, promoErr, setPromoErr,
  promoLoading, checkPromo,
  bookErr, booking, handleBook,
}) {
  // Commit 24c — réductions disponibles pour le client connecté chez ce
  // commerce. Cards cliquables, pré-remplit le promoCode + déclenche le
  // checkPromo. No cumul : sélectionner une card écrase la précédente
  // (le checkPromo back recalcule la remise).
  const [availList, setAvailList] = useState([]);
  const [availCredit, setAvailCredit] = useState(null);
  const [availLoad, setAvailLoad] = useState(false);
  const [selectedDiscountId, setSelectedDiscountId] = useState(null);

  useEffect(() => {
    if (!clientUser?.id || !slug) {
      setAvailList([]); setAvailCredit(null); return;
    }
    let cancelled = false;
    setAvailLoad(true);
    pubApi.availableDiscounts(slug, clientUser.id)
      .then(r => {
        if (cancelled) return;
        setAvailList(Array.isArray(r?.discounts) ? r.discounts : []);
        setAvailCredit(r?.credit || null);
      })
      .catch(() => { if (!cancelled) { setAvailList([]); setAvailCredit(null); } })
      .finally(() => { if (!cancelled) setAvailLoad(false); });
    return () => { cancelled = true; };
  }, [clientUser?.id, slug]);

  const applyDiscount = (d) => {
    if (!d.code) return;
    if (selectedDiscountId === d.id) {
      setSelectedDiscountId(null);
      setPromoCode(''); setPromoData(null); setPromoErr('');
      return;
    }
    setSelectedDiscountId(d.id);
    setPromoCode(d.code);
    setPromoData(null); setPromoErr('');
    setTimeout(() => checkPromo(d.code), 0);
  };
  const cardableList = availList.filter(d => d.source === 'birthday' || d.source === 'loyalty');
  const referralPending = availList.filter(d => d.source === 'referral_pending');
  return (
    <div>
      <h2 style={{fontSize:22,fontWeight: 500,color:th.text,margin:'0 0 22px',
        letterSpacing:'-0.025em', lineHeight:1.2}}>
        Confirmer
      </h2>
      <div style={{background:th.card,border: `1px solid ${th.border}`,
        borderRadius:14,padding:'18px 22px',marginBottom:20, boxShadow: th.shadowSm}}>
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
            padding:'9px 0',borderBottom: `1px solid ${th.border}`,
            alignItems:'center', gap:12}}>
            <span style={{fontSize:13,color:th.muted}}>{l}</span>
            <span style={{fontSize:13,fontWeight: 500,color:th.text,
              fontFamily: (l==='Heure'||l==='Prix'||l==='Duree') ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
              textAlign:'right'}}>{v}</span>
          </div>
        ))}
      </div>

      {/* Réductions disponibles — commit 24c. Affiché uniquement pour client
          authentifié et si l'API renvoie au moins une réduction. Cards
          cliquables, sélection unique (no cumul) — un click pré-remplit le
          champ promo + valide automatiquement. Crédit affiché en informatif
          (sera utilisable en boutique à l'encaissement, pas applicable au
          booking en ligne). */}
      {clientUser?.id && selSvc?.price > 0 && (cardableList.length > 0 || availCredit || referralPending.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: th.text, margin: '0 0 4px' }}>
            {"Vos réductions disponibles"}
          </p>
          <p style={{ fontSize: 10, color: th.dim, margin: '0 0 10px', fontStyle: 'italic' }}>
            {"Cliquez pour appliquer. Une seule réduction par réservation."}
          </p>
          {availLoad && (
            <p style={{ fontSize: 11, color: th.muted, margin: 0 }}>{"Chargement…"}</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cardableList.map(d => {
              const isBday = d.source === 'birthday';
              const accentBg   = isBday ? th.ax.amberBg : th.ax.indigoBg || th.ax.blueBg;
              const accentText = isBday ? th.ax.amber : th.ax.blue;
              const accentBar  = isBday ? th.ax.amber : th.ax.blue;
              const isSelected = selectedDiscountId === d.id;
              const discountStr = d.discount_type === 'percent'
                ? `-${d.discount_value}%`
                : `-${Number(d.discount_value).toFixed(2)} €`;
              return (
                <button key={d.id} type="button"
                        onClick={() => applyDiscount(d)}
                        style={{ padding: 10, borderRadius: 9,
                                 background: accentBg,
                                 borderLeft: '2px solid ' + accentBar,
                                 border: `1px solid ${isSelected ? accentText : accentBg}`,
                                 borderLeftWidth: 2, borderLeftColor: accentBar,
                                 borderLeftStyle: 'solid',
                                 cursor: 'pointer', fontFamily: 'inherit',
                                 textAlign: 'left', width: '100%',
                                 display: 'flex', justifyContent: 'space-between',
                                 alignItems: 'center', gap: 8,
                                 boxShadow: isSelected ? `0 0 0 2px ${accentBar}33` : 'none',
                                 transition: 'box-shadow 0.15s ease' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: accentText }}>
                      {isBday ? 'Offre anniversaire' : 'Récompense fidélité'}
                    </span>
                    <span style={{ fontSize: 11, color: th.muted,
                                   overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                   fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {d.code}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: accentText, flexShrink: 0 }}>
                    {isSelected ? 'Appliqué' : discountStr}
                  </span>
                </button>
              );
            })}
            {referralPending.map(d => (
              <div key={d.id}
                   style={{ padding: 12, borderRadius: 10,
                            background: th.ax.violetBg, borderLeft: `2px solid ${th.ax.violet}`,
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: th.ax.violet }}>
                    {"Parrainage en attente"}
                  </span>
                  <span style={{ fontSize: 11, color: th.muted, lineHeight: 1.4, marginTop:2 }}>
                    {d.info || "À valider lors de votre encaissement en boutique."}
                  </span>
                </span>
              </div>
            ))}
            {availCredit && (
              <div style={{ padding: 12, borderRadius: 10,
                            background: th.ax.emeraldBg, borderLeft: `2px solid ${th.ax.emerald}`,
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: th.ax.emerald }}>
                    {"Crédit disponible"}
                  </span>
                  <span style={{ fontSize: 11, color: th.muted, lineHeight: 1.4, marginTop:2 }}>
                    {"Utilisable lors de votre encaissement en boutique."}
                  </span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 500, color: th.ax.emerald,
                               fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                               flexShrink: 0, letterSpacing:'-0.01em' }}>
                  {Number(availCredit.balance).toFixed(2)} €
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {selSvc?.price > 0 && (
        <div style={{marginBottom:24}}>
          <label style={{fontSize:13,fontWeight: 500,color:th.text,display:'block',marginBottom:4}}>
            Code promo ou parrainage <span style={{color:th.muted,fontWeight:400}}>(optionnel)</span>
          </label>
          <p style={{fontSize:11,color:th.muted,margin:'0 0 10px'}}>
            Non cumulable avec une autre réduction (anniversaire, promo…).
          </p>
          <div style={{display:'flex',gap:8}}>
            <input value={promoCode}
              onChange={e=>{setPromoCode(e.target.value.toUpperCase());setPromoData(null);setPromoErr('');setSelectedDiscountId(null);}}
              onKeyDown={e=>e.key==='Enter'&&checkPromo()}
              placeholder="PROMO10"
              style={{flex:1,padding:'10px 14px',borderRadius:8,outline:'none',height:40,
                boxSizing:'border-box',
                background:th.inputBg,border: `1px solid ${promoData?(promoData.source==='referral'?th.ax.violet:th.ax.emerald):promoErr?th.ax.rose:th.inputBorder}`,
                color:th.text,fontSize:14,fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                letterSpacing:'-0.01em'}}/>
            <button onClick={checkPromo} disabled={promoLoading||!promoCode.trim()}
              style={{padding:'10px 18px',borderRadius:8,border: `1px solid ${th.border}`,
                background:th.bg,color:th.text,fontSize:14,fontWeight: 500,
                cursor:'pointer',opacity:!promoCode.trim()?0.4:1,
                fontFamily:'inherit', height:40,
                transition:'background 0.15s ease, border-color 0.15s ease'}}
              onMouseEnter={e=>{ if(promoCode.trim()){ e.currentTarget.style.background = th.bgHover; e.currentTarget.style.borderColor = th.borderHv; } }}
              onMouseLeave={e=>{ e.currentTarget.style.background = th.bg; e.currentTarget.style.borderColor = th.border; }}>
              {promoLoading?'...':'Valider'}
            </button>
          </div>
          {promoData && (
            <div style={{marginTop:10,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,
              padding:'12px 14px',borderRadius:10,
              background: promoData.source === 'referral' ? th.ax.violetBg : th.ax.emeraldBg,
              border: `1px solid ${promoData.source === 'referral' ? th.ax.violet : th.ax.emerald}33`}}>
              <div style={{display:'flex',flexDirection:'column',gap:2,minWidth:0}}>
                {promoData.source === 'referral' && (
                  <span style={{fontSize:11,fontWeight: 500,color:th.ax.violet,
                    textTransform:'uppercase', letterSpacing:0.5}}>
                    🎁 Parrainage appliqué
                  </span>
                )}
                <span style={{fontSize:13,fontWeight: 500,
                  color: promoData.source === 'referral' ? th.ax.violet : th.ax.emerald}}>
                  {promoData.type==='percent'?`-${promoData.value}%`:`-${promoData.discount.toFixed(2)} €`} appliqué !
                </span>
              </div>
              <span style={{fontSize:14,fontWeight: 500,
                color: promoData.source === 'referral' ? th.ax.violet : th.ax.emerald,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                flexShrink:0, letterSpacing:'-0.01em'}}>
                {((selSvc?.price||0)-promoData.discount).toFixed(2)} €
              </span>
            </div>
          )}
          {promoErr && <p style={{fontSize:12,color:th.ax.rose,marginTop:8,fontWeight: 500}}>{promoErr}</p>}
        </div>
      )}

      {bookErr && <p style={{fontSize:12,color:th.ax.rose,marginBottom:12,fontWeight: 500}}>{bookErr}</p>}

      <button onClick={handleBook} disabled={booking}
        style={{width:'100%',padding:'15px',borderRadius:10,
          background:th.accent,border: `1px solid ${th.accent}`,fontWeight: 500,fontSize:15,
          color:th.accentText,cursor:booking?'wait':'pointer',
          opacity:booking?0.7:1,letterSpacing:'-0.01em',
          fontFamily:'inherit',
          display:'flex',alignItems:'center',justifyContent:'center',gap:10,
          transition:'opacity 0.15s ease'}}
        onMouseEnter={e=>{ if(!booking) e.currentTarget.style.opacity = '0.9'; }}
        onMouseLeave={e=>{ if(!booking) e.currentTarget.style.opacity = '1'; }}>
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
