// src/pages/clients/tabs/InfoTab.jsx
import { useState } from 'react';
import { fmtDate } from '../helpers';
import { clientsApi } from '../../../utils/api';
import { PhoneInput, isValidPhoneNumber } from '../../../components/PhoneInput';

// ─── Onglet Infos ─────────────────────────────────────────────────────────────
// Affiche les infos de la fiche + édition téléphone (PhoneInput E.164,
// commit 20) + toggle marketing_opt_in (commit 17, gate PIN admin via
// clientsApi.setMarketingOptIn → adminRequest).
export default function InfoTab({ fiche, theme, card, setFiche }) {
  const rows = [
    ['Email',            fiche.email],
    ['Premier contact',  fmtDate(fiche.created_at)],
    ['Derniere visite',  fmtDate(fiche.last_visit)],
    ['Notes internes',   fiche.notes],
  ].filter(([, v]) => v);

  const [optIn, setOptIn] = useState(fiche.marketing_opt_in === true);
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState('');

  // Édition téléphone — PhoneInput parse défaut FR la valeur existante (raw ou E.164).
  const initialPhone = fiche.phone_e164 || fiche.phone || '';
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft,   setPhoneDraft]   = useState(initialPhone);
  const [phoneBusy,    setPhoneBusy]    = useState(false);
  const [phoneErr,     setPhoneErr]     = useState('');

  const startEditPhone = () => {
    setPhoneDraft(initialPhone);
    setPhoneErr('');
    setEditingPhone(true);
  };
  const cancelEditPhone = () => {
    setEditingPhone(false);
    setPhoneErr('');
  };
  const savePhone = async () => {
    if (!isValidPhoneNumber(phoneDraft || '')) {
      setPhoneErr('Numéro invalide pour le pays sélectionné.');
      return;
    }
    setPhoneBusy(true); setPhoneErr('');
    try {
      const updated = await clientsApi.update(fiche.id, { phone: phoneDraft });
      if (setFiche) setFiche(prev => ({ ...prev, ...updated }));
      setEditingPhone(false);
    } catch (e) {
      setPhoneErr(e?.message || 'Modification impossible.');
    } finally { setPhoneBusy(false); }
  };

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

  const phoneSaveDisabled = phoneBusy || !isValidPhoneNumber(phoneDraft || '');

  return (
    <>
      <div style={{ ...card, padding: '4px 16px', marginBottom: 12 }}>
        {/* Email + autres infos lecture seule */}
        {rows.map(([label, val], i) => (
          <div key={label}
            style={{ display:'flex', flexDirection:'column', padding:'12px 0',
              borderBottom: `0.5px solid ${theme.border}`, gap: 2 }}>
            <p style={{ margin:0, fontSize:11, color:theme.muted, fontWeight:500 }}>{label}</p>
            <p style={{ margin:0, fontSize:14, color:theme.text, fontWeight:500,
              wordBreak:'break-word', lineHeight:1.5 }}>
              {val}
            </p>
          </div>
        ))}

        {/* Téléphone — éditable via PhoneInput */}
        <div style={{ display:'flex', flexDirection:'column', padding:'12px 0', gap:6 }}>
          <p style={{ margin:0, fontSize:11, color:theme.muted, fontWeight:500 }}>Telephone</p>
          {editingPhone ? (
            <>
              <PhoneInput value={phoneDraft} onChange={setPhoneDraft}
                required defaultCountry="FR"
                theme={{ text: theme.text, muted: theme.muted, dim: theme.dim,
                  border: theme.border, inputBg: theme.inputBg, inputBorder: theme.inputBorder }}
                errorOverride={phoneErr || undefined}/>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={savePhone} disabled={phoneSaveDisabled}
                  style={{ padding:'8px 14px', borderRadius:8,
                    background: phoneSaveDisabled ? theme.border : theme.accent,
                    color:      phoneSaveDisabled ? theme.muted  : theme.accentText,
                    border:'none', fontSize:12, fontWeight:500,
                    fontFamily:'inherit',
                    cursor: phoneSaveDisabled ? 'not-allowed' : 'pointer',
                    opacity: phoneBusy ? 0.7 : 1 }}>
                  {phoneBusy ? '…' : 'Enregistrer'}
                </button>
                <button onClick={cancelEditPhone} disabled={phoneBusy}
                  style={{ padding:'8px 14px', borderRadius:8,
                    background:'transparent', color:theme.muted,
                    border:`0.5px solid ${theme.border}`,
                    fontSize:12, fontWeight:500, fontFamily:'inherit',
                    cursor: phoneBusy ? 'wait' : 'pointer' }}>
                  Annuler
                </button>
              </div>
            </>
          ) : (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
              <p style={{ margin:0, fontSize:14, color:theme.text, fontWeight:500,
                wordBreak:'break-word', lineHeight:1.5 }}>
                {fiche.phone_e164 || fiche.phone || '—'}
              </p>
              <button onClick={startEditPhone}
                style={{ padding:'6px 12px', borderRadius:8,
                  background:'transparent', color:theme.text,
                  border:`0.5px solid ${theme.border}`,
                  fontSize:11, fontWeight:500, fontFamily:'inherit',
                  cursor:'pointer', flexShrink:0 }}>
                Modifier
              </button>
            </div>
          )}
        </div>
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
