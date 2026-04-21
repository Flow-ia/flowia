// src/pages/clients/tabs/InfoTab.jsx
import { fmtDate } from '../helpers';

// ─── Onglet Infos ─────────────────────────────────────────────────────────────
export default function InfoTab({ fiche, theme, card }) {
  const rows = [
    ['Email',            fiche.email],
    ['Telephone',        fiche.phone],
    ['Premier contact',  fmtDate(fiche.created_at)],
    ['Derniere visite',  fmtDate(fiche.last_visit)],
    ['Notes internes',   fiche.notes],
  ].filter(([, v]) => v);

  return (
    <div style={{ ...card, padding: '4px 16px', marginBottom: 12 }}>
      {rows.map(([label, val], i) => (
        <div
          key={label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '12px 0',
            borderBottom: i === rows.length - 1 ? 'none' : `0.5px solid ${theme.border}`,
            gap: 2,
          }}
        >
          <p style={{ margin: 0, fontSize: 11, color: theme.muted, fontWeight: 500 }}>
            {label}
          </p>
          <p style={{
            margin: 0,
            fontSize: 14,
            color: theme.text,
            fontWeight: 500,
            wordBreak: 'break-word',
            lineHeight: 1.5,
          }}>
            {val}
          </p>
        </div>
      ))}
    </div>
  );
}
