// src/pages/booking/my-appointments/components/VisitDetailCard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// VisitDetailCard — vue détail d'un passage (ouverte par clic dans la liste
// ou via URL directe /book/:slug/client/passages/:id). Responsive : flex
// wrap sur la ligne commerçant/montant, champs qui s'empilent sur mobile.
//
// Cohérence avec le merchant (/historique) :
//  - items affichés au format "Qte× Nom" (déduplication par nom+prix)
//  - paiements multi : sous-lignes par moyen (├─ Espèces 41,00 € / ├─ CB 17,00 €)
//    avec le total agrégé sur le bloc principal.
// ─────────────────────────────────────────────────────────────────────────────
const PAY_METHOD_LABELS = {
  cash:      'Espèces',
  card:      'Carte',
  card_online: 'Stripe',
  transfer:  'Virement',
  check:     'Chèque',
  gift_card: 'Bon cadeau',
  other:     'Autre',
  multi:     'Multiple',
};
function payLabelFor(method) {
  return PAY_METHOD_LABELS[method] || method || '-';
}

// Dédup items par (service_name, unit_price). Tolère que la caisse ait stocké
// 3 rows séparées qty=1 au lieu d'1 row qty=3 — on agrège dans tous les cas.
function dedupeItems(items) {
  const map = new Map();
  for (const it of (items || [])) {
    const name  = String(it.service_name || 'Prestation').trim();
    const cents = Math.round((parseFloat(it.unit_price) || 0) * 100);
    const key   = name + '|' + cents;
    const qty   = parseInt(it.qty, 10) || 1;
    if (map.has(key)) map.get(key).qty += qty;
    else map.set(key, { service_name: name, unit_price: cents / 100, qty });
  }
  return Array.from(map.values());
}

export function VisitDetailCard({ visit: v, th, onBack }) {
  const total   = parseFloat(v.amount || 0);
  const orig    = parseFloat(v.original_amount || 0);
  const disc    = parseFloat(v.discount_amount || 0);
  const hasDisc = disc > 0 && orig > 0;
  const dateObj = v.date ? new Date(`${v.date}T12:00:00`) : null;
  const dateStr = (dateObj && !isNaN(dateObj))
    ? dateObj.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    : (v.date || '');
  // Multi-paiement : si breakdown JSON présent et >= 2 entrées, on affiche
  // les sous-lignes par moyen au lieu d'un simple badge "Multiple".
  const breakdown = Array.isArray(v.payments_breakdown) && v.payments_breakdown.length >= 2
    ? v.payments_breakdown
    : null;
  const payLabel = breakdown
    ? `Multi (${breakdown.length})`
    : payLabelFor(v.payment_method);
  const dedupedItems = dedupeItems(v.items);

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

        {/* Prestations — format "Qte× Nom" (dédupliqué) cohérent avec merchant */}
        {dedupedItems.length > 0 && (
          <div>
            <p style={{ fontSize:11, fontWeight: 500, color:th.muted, margin:'0 0 8px' }}>Prestations</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {dedupedItems.map((it, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center',
                  justifyContent:'space-between', gap:10, padding:'8px 0',
                  borderBottom: i === dedupedItems.length - 1 ? 'none' : `1px solid ${th.border}` }}>
                  <p style={{ fontSize:13, color:th.text, margin:0, minWidth:0,
                    flex:1, wordBreak:'break-word' }}>
                    <span style={{ color:th.muted, marginRight:6 }}>{it.qty}×</span>
                    {it.service_name}
                  </p>
                  {(it.unit_price || 0) > 0 && (
                    <p style={{ fontSize:12, color:th.muted, margin:0,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', flexShrink:0 }}>
                      {(it.unit_price * it.qty).toFixed(2)} €
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Breakdown multi-paiement — sous-lignes par moyen pour traçabilité.
            Cohérent avec ce que le commerçant voit dans /caisse/historique. */}
        {breakdown && (
          <div>
            <p style={{ fontSize:11, fontWeight: 500, color:th.muted, margin:'0 0 8px' }}>
              Répartition des paiements
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {breakdown.map((sub, i) => {
                const cents = parseInt(sub.amount_cents, 10) || 0;
                return (
                  <div key={i} style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    gap:10, padding:'6px 0',
                  }}>
                    <p style={{ fontSize:12, color:th.text, margin:0 }}>
                      {payLabelFor(sub.method)}
                    </p>
                    <p style={{ fontSize:12, color:th.text, margin:0, fontWeight:500,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', flexShrink:0 }}>
                      {(cents / 100).toFixed(2)} €
                    </p>
                  </div>
                );
              })}
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
