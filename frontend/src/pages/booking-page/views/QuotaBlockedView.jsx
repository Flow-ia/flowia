// src/pages/booking-page/views/QuotaBlockedView.jsx
// Vue affichee a l'ouverture de la page booking publique quand le commercant
// a atteint son quota mensuel de RDV (plan Decouverte = 50/mois). Bloque le
// flow de reservation et oriente le client vers un contact direct.

export function QuotaBlockedView({ th, business, message }) {
  const text = message
    || 'Le nombre de rendez-vous autorise est limite. Merci de prendre contact avec le commercant directement pour lever cette limite.';
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: th.bg,
    }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{
          padding: '16px 18px',
          borderRadius: 8,
          background: '#fef9c3',
          borderLeft: '2px solid #ca8a04',
          marginBottom: 24,
          textAlign: 'left',
        }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#854d0e' }}>
            Reservations momentanement indisponibles
          </p>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: th.text, marginBottom: 12 }}>
          {business?.business_name || 'Ce commerce'}
        </h1>
        <p style={{ fontSize: 14, color: th.muted, lineHeight: 1.6, marginBottom: 28 }}>
          {text}
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
