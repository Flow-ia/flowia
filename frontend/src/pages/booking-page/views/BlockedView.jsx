// src/pages/booking-page/views/BlockedView.jsx
// Vue : Client bloqué par le commerçant.

export function BlockedView({ th, business }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{background:th.bg}}>
      <div style={{ maxWidth:380, width:'100%', textAlign:'center' }}>
        <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(239,68,68,0.1)', border:'2px solid rgba(239,68,68,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, margin:'0 auto 24px' }}>
          🚫
        </div>
        <h1 style={{ fontSize:20, fontWeight:900, color:th.text, marginBottom:12, letterSpacing:'-.4px' }}>
          Réservation impossible
        </h1>
        <p style={{ fontSize:15, color:th.muted, lineHeight:1.6, marginBottom:28 }}>
          Ce commerçant n'accepte plus de réservation pour vous.<br/>
          Merci de prendre contact avec le commerçant directement.
        </p>
        {business?.phone && (
          <a href={`tel:${business.phone}`}
            style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'12px 24px', borderRadius:14, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontWeight:800, fontSize:14, textDecoration:'none' }}>
            📞 Appeler {business.business_name || 'le commerçant'}
          </a>
        )}
        {!business?.phone && (
          <p style={{ fontSize:13, color:th.muted, fontStyle:'italic' }}>
            Contactez {business?.business_name || 'le commerçant'} pour plus d'informations.
          </p>
        )}
      </div>
    </div>
  );
}
