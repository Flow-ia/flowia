// src/pages/clients/tabs/InfoTab.jsx
import { useState } from 'react';
import { fmtDate } from '../helpers';
import { clientsApi } from '../../../utils/api';

// ─── Onglet Infos ─────────────────────────────────────────────────────────────
// Affiche les infos de la fiche + toggle marketing_opt_in (RGPD commit 17,
// gate PIN admin via clientsApi.setMarketingOptIn → adminRequest).
export default function InfoTab({ fiche, theme, card, setFiche }) {
  const rows = [
    ['Email',            fiche.email],
    ['Telephone',        fiche.phone],
    ['Premier contact',  fmtDate(fiche.created_at)],
    ['Derniere visite',  fmtDate(fiche.last_visit)],
    ['Notes internes',   fiche.notes],
  ].filter(([, v]) => v);

  const [optIn, setOptIn] = useState(fiche.marketing_opt_in === true);
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState('');

  const toggleOptIn = async (next) => {
    if (busy) return;
    setErr(''); setBusy(true);
    const prev = optIn;
    setOptIn(next); // optimistic
    try {
      const updated = await clientsApi.setMarketingOptIn(fiche.id, next);
      if (setFiche) setFiche(prevFiche => ({ ...prevFiche, ...updated }));
    } catch (e) {
      setOptIn(prev); // rollback
      setErr(e?.message || 'Modification impossible.');
    } finally { setBusy(false); }
  };

  return (
    <>
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

      {/* RGPD commit 17 : toggle marketing_opt_in (gate PIN admin) */}
      <div style={{ ...card, padding:'14px 16px', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ minWidth:0 }}>
            <p style={{ margin:0, fontSize:13, fontWeight:500, color:theme.text }}>
              {"Notifications marketing"}
            </p>
            <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted, fontWeight:500 }}>
              {optIn ? "Activé" : "Désactivé"}
            </p>
          </div>
          <button onClick={() => toggleOptIn(!optIn)} disabled={busy}
            aria-label={optIn ? "Désactiver les notifications marketing" : "Activer les notifications marketing"}
            style={{ position:'relative', flexShrink:0,
              width:42, height:24, borderRadius:99,
              border:'none', padding:0,
              background: optIn ? '#10b981' : (theme.border || '#d1d5db'),
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
              transition:'background 0.15s' }}>
            <span style={{ position:'absolute', top:2, left: optIn ? 20 : 2,
              width:20, height:20, borderRadius:99, background:'#fff',
              boxShadow:'0 1px 2px rgba(0,0,0,0.2)',
              transition:'left 0.15s' }}/>
          </button>
        </div>
        <p style={{ margin:'10px 0 0', fontSize:11, color:theme.muted, lineHeight:1.55 }}>
          {optIn
            ? "Activé : tous les programmes RGPD-conformes sont actifs (anniversaire, parrainage, notifications fidélité par email)."
            : "Désactivé : le client cumule sa fidélité en boutique mais ne reçoit aucun email marketing, aucune offre anniversaire et n'est pas éligible au parrainage."}
        </p>
        {err && (
          <p style={{ margin:'8px 0 0', fontSize:11, color:'#dc2626', fontWeight:500 }}>
            {err}
          </p>
        )}
      </div>
    </>
  );
}
