// src/pages/booking-page/views/BlockedView.jsx
// Vue : Client bloque par le commercant.

export function BlockedView({ th, business }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: th.bg,
    }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16,
          margin: '0 auto 20px',
          background: th.ax.roseBg,
          border: `1px solid ${th.ax.rose}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={th.ax.rose} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" style={{width:28,height:28}}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 500, color: th.text, marginBottom: 12,
          letterSpacing:'-0.025em', lineHeight:1.2 }}>
          Réservation impossible
        </h1>
        <p style={{ fontSize: 14, color: th.muted, lineHeight: 1.6, marginBottom: 28 }}>
          Ce commerçant n{"'"}accepte plus de réservation pour vous.<br/>
          Merci de prendre contact avec le commerçant directement.
        </p>
        {business?.phone && (
          <a
            href={`tel:${business.phone}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 20px',
              borderRadius: 10,
              background: th.accent,
              border: `1px solid ${th.accent}`,
              color: th.accentText,
              fontWeight: 500,
              fontSize: 14,
              textDecoration: 'none',
              fontFamily: 'inherit',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={e=>{ e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={e=>{ e.currentTarget.style.opacity = '1'; }}
          >
            Appeler {business.business_name || 'le commerçant'}
          </a>
        )}
        {!business?.phone && (
          <p style={{ fontSize: 13, color: th.muted, fontStyle: 'italic' }}>
            Contactez {business?.business_name || 'le commercant'} pour plus d{"'"}informations.
          </p>
        )}
      </div>
    </div>
  );
}
