// src/pages/booking-page/ReferralBanner.jsx
// Bandeau parrainage affiche au-dessus du flow reservation.

export function ReferralBanner({
  th, referralCode, referralInfo, justRegisteredRef, setJustRegisteredRef,
}) {
  if (!referralCode || !referralInfo) return null;

  const valueLabel = referralInfo.discount_type === 'percent'
    ? `${referralInfo.discount_value}%`
    : `${Number(referralInfo.discount_value).toFixed(2)} €`;

  const ineligible = referralInfo.eligible === false;
  const bg     = ineligible ? '#fffbeb' : '#eef2ff';
  const accent = ineligible ? th.ax.amber : '#6366f1';
  const color  = ineligible ? th.ax.amber : '#4338ca';
  const codeColor = ineligible ? th.ax.amber : '#4338ca';

  return (
    <div style={{ maxWidth:1100, margin:'0 auto 16px', padding:'0 16px' }}>
      <div style={{
        padding: '12px 14px',
        borderRadius: 8,
        background: bg,
        borderLeft: `2px solid ${accent}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <p style={{ fontSize:13, color, margin:0, flex:1, minWidth:0, lineHeight:1.5 }}>
          {ineligible ? (
            <>
              <span style={{ fontWeight:500 }}>Vous ne pouvez pas beneficier de ce programme de parrainage</span>
              {' '}car vous ne repondez pas aux conditions definies par le commercant.
              Vous pouvez continuer votre reservation au prix normal.
            </>
          ) : justRegisteredRef ? (
            <>
              Compte cree ! Votre code parrainage{' '}
              <span style={{ fontWeight:500, fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', color:codeColor }}>
                {referralCode}
              </span>
              {' '}sera applique au recap — remise de{' '}
              <span style={{ fontWeight:500 }}>{valueLabel}</span>{' '}
              selon les conditions du commercant.
            </>
          ) : (
            <>
              Parrainage actif — code{' '}
              <span style={{ fontWeight:500, fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', color:codeColor }}>
                {referralCode}
              </span>
              , remise de <span style={{ fontWeight:500 }}>{valueLabel}</span>{' '}
              appliquee au recap selon les conditions du commercant.
            </>
          )}
        </p>
        {!ineligible && (
          <button
            type="button"
            onClick={() => setJustRegisteredRef(false)}
            aria-label="Fermer"
            style={{
              width: 24,
              height: 24,
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontFamily: 'inherit',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
