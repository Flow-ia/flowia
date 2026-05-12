// LedgerDebugBadge.jsx — affiche la source de lecture (legacy vs ledger)
// et le drift detecte sur une section financiere. Visible UNIQUEMENT si
// le backend a inclus _ledger_debug dans la response (= admin a active
// feature_flags.ledger_debug_visible pour ce merchant + query debug=1).
//
// Pattern : <LedgerDebugBadge debug={data._ledger_debug} />
// Render : null si pas de debug, sinon petit badge en coin avec details
// au survol / clic.

import { useState } from 'react';

export function LedgerDebugBadge({ debug }) {
  const [open, setOpen] = useState(false);
  if (!debug) return null;

  const isLedger = debug.source === 'ledger';
  const hasDrift = !!debug.drift_detected;
  const hasError = !!(debug.ledger_error || debug.legacy_error);

  // Couleur dominante :
  //   drift OU error => rouge
  //   source=ledger sans drift => vert
  //   source=legacy => gris (= comportement par defaut)
  const color = hasDrift || hasError ? '#991b1b' : isLedger ? '#065f46' : '#6b7280';
  const bg    = hasDrift || hasError ? '#fef2f2' : isLedger ? '#ecfdf5' : '#f3f4f6';
  const label = hasError ? 'ERR' : hasDrift ? 'DRIFT' : isLedger ? 'LEDGER' : 'LEGACY';

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button"
              onClick={() => setOpen(o => !o)}
              title="Cliquer pour voir les details ledger vs legacy"
              style={{
                fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                color, background: bg, border: `1px solid ${color}33`,
                cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}>
        {label}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 24, right: 0, zIndex: 50,
          minWidth: 320, maxWidth: 480,
          padding: 12, borderRadius: 8,
          background: '#fff', border: '1px solid #e5e7eb',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#111', lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 11 }}>
            {"Ledger debug · "}
            <span style={{ color, fontWeight: 700 }}>{label}</span>
          </div>
          <Row k="source"           v={debug.source} />
          <Row k="flag"             v={`${debug.flag_name} = ${debug.flag_enabled ? 'on' : 'off'}`} />
          <Row k="compare"          v={debug.compare_enabled ? 'enabled' : 'disabled'} />
          <Row k="drift detected"   v={hasDrift ? 'YES' : 'no'} highlight={hasDrift} />
          {hasDrift && debug.drift_fields?.length > 0 && (
            <div style={{ margin: '6px 0', padding: '6px 8px',
                          background: '#fef2f2', borderRadius: 4 }}>
              {debug.drift_fields.map(f => (
                <div key={f.name} style={{ fontSize: 10 }}>
                  {f.name}: legacy={f.legacy} ledger={f.ledger} delta={f.delta}
                </div>
              ))}
            </div>
          )}
          {debug.legacy_error && <Row k="legacy error" v={debug.legacy_error} highlight />}
          {debug.ledger_error && <Row k="ledger error" v={debug.ledger_error} highlight />}
          <Row k="checked at"       v={debug.checked_at} />
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontSize: 10, color: '#6b7280' }}>
              {"raw values"}
            </summary>
            <pre style={{
              margin: '6px 0 0', padding: 6, background: '#f9fafb',
              fontSize: 10, lineHeight: 1.4, overflow: 'auto', maxHeight: 240,
              borderRadius: 4,
            }}>
              {"legacy = " + JSON.stringify(debug.legacy_value, null, 2)}
              {"\nledger = " + JSON.stringify(debug.ledger_value, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, highlight }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '1px 0' }}>
      <span style={{ color: '#6b7280', minWidth: 90 }}>{k}</span>
      <span style={{ color: highlight ? '#991b1b' : '#111', fontWeight: highlight ? 600 : 400 }}>
        {String(v == null ? '—' : v)}
      </span>
    </div>
  );
}

export default LedgerDebugBadge;
