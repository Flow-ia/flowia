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
      <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <div style={{
          padding: '16px 18px',
          borderRadius: 8,
          background: '#fef2f2',
          borderLeft: '2px solid #ef4444',
          marginBottom: 24,
          textAlign: 'left',
        }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#991b1b' }}>
            Reservation impossible
          </p>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: th.text, marginBottom: 12 }}>
          Reservation impossible
        </h1>
        <p style={{ fontSize: 14, color: th.muted, lineHeight: 1.6, marginBottom: 28 }}>
          Ce commercant n{"'"}accepte plus de reservation pour vous.<br/>
          Merci de prendre contact avec le commercant directement.
        </p>
        {business?.phone && (
          <a
            href={`tel:${business.phone}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 8,
              background: th.accent,
              color: th.accentText,
              fontWeight: 500,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Appeler {business.business_name || 'le commercant'}
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
