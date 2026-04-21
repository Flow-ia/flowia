import { useTheme } from '../../../hooks/useTheme';

// Toggle neutre — ignore l'ancien `colorOn` (gradient) au profit de la
// couleur texte courante. Prop conservée pour compat avec les tabs hors scope.
// eslint-disable-next-line no-unused-vars
export default function Toggle({ on, onChange, colorOn }) {
  const { theme: t } = useTheme();
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={!!on}
      style={{
        position: 'relative',
        width: 40,
        height: 22,
        borderRadius: 99,
        border: `0.5px solid ${on ? t.text : t.borderStrong}`,
        background: on ? t.text : t.cardAlt,
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: on ? t.bg : t.text,
          transition: 'left 0.15s ease, background 0.15s ease',
        }}
      />
    </button>
  );
}
