// src/components/PhoneInput.jsx
// RGPD commit 20 — composant unique pour la saisie d'un téléphone client.
// Wrapper react-phone-number-input (drapeau pays + format pays-spécifique +
// validation libphonenumber-js) avec design FDS-2026 (bordure 0.5px, fw≤500,
// erreur inline rouge 11px, OK discret 11px gris).
//
// Stockage interne : E.164 (+33612345678). Les overrides CSS vivent dans
// src/components/PhoneInput.css (importé une fois ici).
//
// Props :
//   value           — valeur E.164 (string) ou ''
//   onChange(e164)  — appelé avec la nouvelle valeur E.164 (string ou undefined si vide)
//   onValidChange?  — (bool) callback déclenché quand l'état "valide" change
//   required?       — défaut true
//   defaultCountry? — défaut 'FR'
//   label?          — texte au-dessus de l'input (ex: "Téléphone *")
//   placeholder?    — placeholder (libphonenumber injecte un format pays par défaut)
//   disabled?       — désactive l'input
//   errorOverride?  — string : force l'affichage d'un message d'erreur (ex: erreur back)
//   theme?          — { text, muted, dim, border, inputBg, inputBorder } pour adaptation booking
import { useEffect, useMemo, useState } from 'react';
import RPNInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import './PhoneInput.css';

const DEFAULT_THEME = {
  text:        '#1a1a1a',
  muted:       '#6b7280',
  dim:         '#9ca3af',
  border:      '#e5e7eb',
  inputBg:     '#ffffff',
  inputBorder: '#e5e7eb',
};

export function PhoneInput({
  value,
  onChange,
  onValidChange,
  required = true,
  defaultCountry = 'FR',
  label,
  placeholder,
  disabled = false,
  errorOverride,
  theme,
  id,
}) {
  const th = { ...DEFAULT_THEME, ...(theme || {}) };
  const [touched, setTouched] = useState(false);

  const trimmed = (value || '').trim();
  const isValid = trimmed ? isValidPhoneNumber(trimmed) : !required;
  const isEmptyAndRequired = required && !trimmed;

  // Notifie le parent du changement d'état "valide" (utile pour disable submit).
  useEffect(() => {
    if (onValidChange) onValidChange(isValid);
  }, [isValid, onValidChange]);

  const showError = !!errorOverride
    || (touched && (isEmptyAndRequired || (trimmed && !isValid)));

  const errorMessage = useMemo(() => {
    if (errorOverride) return errorOverride;
    if (isEmptyAndRequired) return 'Téléphone requis.';
    if (trimmed && !isValid) return 'Numéro invalide pour le pays sélectionné.';
    return '';
  }, [errorOverride, isEmptyAndRequired, trimmed, isValid]);

  const cssVars = {
    '--ff-phone-bg':           th.inputBg,
    '--ff-phone-border':       showError ? '#fca5a5' : th.inputBorder,
    '--ff-phone-bg-error':     '#fef2f2',
    '--ff-phone-text':         th.text,
    '--ff-phone-muted':        th.muted,
    '--ff-phone-radius':       '10px',
    '--ff-phone-padding':      '11px 14px',
  };

  return (
    <div className={'ff-phone-wrap' + (showError ? ' ff-phone-err' : '')} style={cssVars}>
      {label && (
        <label htmlFor={id} style={{
          display:'block', fontSize:11, fontWeight:500,
          color:th.muted, marginBottom:5,
        }}>
          {label}
        </label>
      )}
      <RPNInput
        id={id}
        value={trimmed || undefined}
        onChange={(v) => { if (onChange) onChange(v || ''); }}
        onBlur={() => setTouched(true)}
        defaultCountry={defaultCountry}
        international
        countryCallingCodeEditable={false}
        disabled={disabled}
        placeholder={placeholder || '06 12 34 56 78'}
      />
      {showError ? (
        <p style={{ margin:'4px 0 0', fontSize:11, color:'#dc2626', fontWeight:500 }}>
          {errorMessage}
        </p>
      ) : (touched && trimmed && isValid) ? (
        <p style={{ margin:'4px 0 0', fontSize:11, color:th.dim, fontWeight:500 }}>
          {"Format valide"}
        </p>
      ) : null}
    </div>
  );
}

export { isValidPhoneNumber };
export default PhoneInput;
