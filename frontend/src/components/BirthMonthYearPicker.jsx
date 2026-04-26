// src/components/BirthMonthYearPicker.jsx
// Picker mois + année pour la date de naissance — commit 24a refonte FDS-2026.
//
// Pourquoi mois + année (pas le jour) :
//   - UX rapide à l'inscription
//   - RGPD : on ne collecte que ce qui sert (le programme anniversaire envoie
//     le 1er du mois, donc le jour exact n'a aucune utilité métier)
//
// Format ISO interne : "YYYY-MM-01" (jour forcé à 01). Le back tolère aussi
// la saisie YYYY-MM legacy mais le picker écrit toujours en "-01".
//
// Props :
//   value     string | null  — ISO YYYY-MM-DD ou null
//   onChange  (iso|null) => void
//   required  boolean        — défaut false
//   label     string         — défaut "Date de naissance"
//   disabled  boolean
//   theme     { text, muted, inputBg, inputBorder } optionnel
//
import { Icon } from './Icon';

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function parseValue(value) {
  if (!value || typeof value !== 'string') return { month: '', year: '' };
  const m = value.match(/^(\d{4})-(\d{2})/);
  if (!m) return { month: '', year: '' };
  return { year: m[1], month: m[2] };
}

export default function BirthMonthYearPicker({
  value = '',
  onChange,
  required = false,
  label = 'Date de naissance',
  disabled = false,
  theme,
  helperText,
}) {
  const th = theme || {
    text: '#1a1a1a',
    muted: '#6b7280',
    inputBg: '#ffffff',
    inputBorder: '#e5e7eb',
  };
  const { month, year } = parseValue(value);

  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 100;
  const maxYear = currentYear - 13;
  const years = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);

  const emit = (nextMonth, nextYear) => {
    if (!nextMonth || !nextYear) {
      onChange && onChange(null);
      return;
    }
    onChange && onChange(`${nextYear}-${nextMonth}-01`);
  };

  const selectStyle = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: 'inherit',
    background: th.inputBg,
    border: `0.5px solid ${th.inputBorder}`,
    color: th.text,
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    boxSizing: 'border-box',
    appearance: 'auto',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 10,
    fontWeight: 500,
    color: th.muted,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: 6,
  };

  return (
    <div>
      {label && (
        <label style={labelStyle}>
          {label}{required ? ' *' : ''}
        </label>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <select
          value={month}
          disabled={disabled}
          onChange={(e) => emit(e.target.value, year)}
          style={selectStyle}
          aria-label="Mois de naissance"
        >
          <option value="">{"Mois"}</option>
          {MONTHS.map((label, idx) => {
            const v = String(idx + 1).padStart(2, '0');
            return <option key={v} value={v}>{label}</option>;
          })}
        </select>
        <select
          value={year}
          disabled={disabled}
          onChange={(e) => emit(month, e.target.value)}
          style={selectStyle}
          aria-label="Année de naissance"
        >
          <option value="">{"Année"}</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6 }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}>
          <Icon name="gift" size={12} color="#f59e0b" />
        </span>
        <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
          {helperText || "Profitez d'un code promo personnel chaque année au mois de votre anniversaire. Optionnel."}
        </p>
      </div>
    </div>
  );
}
