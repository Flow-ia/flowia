// src/pages/booking/my-appointments/components/VisitDetailCard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// VisitDetailCard — vue détail d'un passage (ouverte par clic dans la liste
// ou via URL directe /book/:slug/client/passages/:id). Responsive : flex
// wrap sur la ligne commerçant/montant, champs qui s'empilent sur mobile.
// ─────────────────────────────────────────────────────────────────────────────
export function VisitDetailCard({ visit: v, th, onBack }) {
  const total   = parseFloat(v.amount || 0);
  const orig    = parseFloat(v.original_amount || 0);
  const disc    = parseFloat(v.discount_amount || 0);
  const hasDisc = disc > 0 && orig > 0;
  const dateObj = v.date ? new Date(`${v.date}T12:00:00`) : null;
  const dateStr = (dateObj && !isNaN(dateObj))
    ? dateObj.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    : (v.date || '');
  const payLabel = ({
    cash:'Espèces', card:'Carte', transfer:'Virement',
    check:'Chèque', other:'Autre', multi:'Multiple',
  })[v.payment_method] || v.payment_method || '-';

  return (
    <div style={{ animation:'fadeIn .2s ease' }}>
      <button onClick={onBack}
        style={{ display:'flex', alignItems:'center', gap:6,
          padding:'8px 12px', borderRadius:10, marginBottom:14, cursor:'pointer',
          background:th.cardAlt, border: `0.5px solid ${th.border}`,
          color:th.text, fontWeight: 500, fontSize:12 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{width:14,height:14}}>
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Retour aux passages
      </button>

      <div style={{ background:th.card, border: `0.5px solid ${th.border}`,
        borderRadius:18, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
        {/* Header : commerçant + total (wrap sur mobile) */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between',
          gap:12, flexWrap:'wrap' }}>
          <div style={{ minWidth:0, flex:'1 1 200px' }}>
            <span style={{ fontSize:10, padding:'3px 8px', borderRadius:99, fontWeight: 500,
              background:'rgba(99,102,241,0.10)', color:'#6366f1',
              display:'inline-flex', alignItems:'center', gap:4, marginBottom:8 }}>
              <span style={{ fontSize:9 }}>📍</span>Passage sur place
            </span>
            <p style={{ fontSize:18, fontWeight: 500, color:th.text, margin:'0 0 4px',
              wordBreak:'break-word' }}>
              {v.business_name || 'Commerçant'}
            </p>
            <p style={{ fontSize:12, color:th.muted, margin:0, textTransform:'capitalize' }}>
              {dateStr}{v.time ? ` · ${v.time}` : ''}
            </p>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            {hasDisc && (
              <p style={{ fontSize:12, color:th.dim, margin:'0 0 2px',
                textDecoration:'line-through', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {orig.toFixed(2)} €
              </p>
            )}
            <p style={{ fontSize:22, fontWeight: 500, color:'#10b981',
              margin:0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {total.toFixed(2)} €
            </p>
            {hasDisc && (
              <p style={{ fontSize:10, fontWeight: 500, color:'#10b981',
                margin:'2px 0 0' }}>
                − {disc.toFixed(2)} € remise
              </p>
            )}
          </div>
        </div>

        {/* Adresse commerçant */}
        {v.business_address && (
          <div style={{ background:th.cardAlt, border: `0.5px solid ${th.border}`,
            borderRadius:12, padding:'10px 12px', display:'flex', gap:10, alignItems:'flex-start' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{width:14,height:14,color:th.muted,flexShrink:0,marginTop:2}}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <p style={{ fontSize:12, color:th.muted, margin:0, wordBreak:'break-word' }}>
              {v.business_address}
              {v.business_phone ? <><br/><a href={`tel:${v.business_phone}`}
                style={{color:th.text,fontWeight: 500,textDecoration:'none'}}>{v.business_phone}</a></> : null}
            </p>
          </div>
        )}

        {/* Prestations */}
        {Array.isArray(v.items) && v.items.length > 0 && (
          <div>
            <p style={{ fontSize:11, fontWeight: 500, color:th.muted, margin:'0 0 8px' }}>Prestations</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {v.items.map((it, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center',
                  justifyContent:'space-between', gap:10, padding:'8px 0',
                  borderBottom: i === v.items.length - 1 ? 'none' : `1px solid ${th.border}` }}>
                  <p style={{ fontSize:13, color:th.text, margin:0, minWidth:0,
                    flex:1, wordBreak:'break-word' }}>
                    {it.service_name}
                    {(it.qty||1) > 1 && (
                      <span style={{ marginLeft:6, fontSize:11, fontWeight: 500,
                        padding:'1px 6px', borderRadius:99,
                        background:th.cardAlt, color:th.muted }}>×{it.qty}</span>
                    )}
                  </p>
                  {(it.unit_price || 0) > 0 && (
                    <p style={{ fontSize:12, color:th.muted, margin:0,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', flexShrink:0 }}>
                      {(parseFloat(it.unit_price) * (it.qty||1)).toFixed(2)} €
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer : employé + paiement (wrap sur mobile) */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          gap:10, paddingTop:12, borderTop: `0.5px solid ${th.border}`, flexWrap:'wrap' }}>
          {v.employee_name && (
            <p style={{ fontSize:12, color:th.muted, margin:0 }}>
              Avec <span style={{ fontWeight: 500, color:th.text }}>{v.employee_name}</span>
            </p>
          )}
          <span style={{ fontSize:11, fontWeight: 500, padding:'4px 10px', borderRadius:99,
            background:th.cardAlt, color:th.muted, marginLeft:'auto' }}>
            {payLabel}
          </span>
        </div>

        {/* ID transaction pour support */}
        <p style={{ fontSize:10, color:th.dim, margin:0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          textAlign:'center' }}>
          Référence #{String(v.id).substring(0,8).toUpperCase()}
        </p>
      </div>
    </div>
  );
}
