// src/pages/clients/components/BackBtn.jsx

export default function BackBtn({ onClick, theme }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retour"
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: `0.5px solid ${theme.border}`,
        cursor: 'pointer',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: theme.muted,
        fontFamily: 'inherit',
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
  );
}
