// src/pages/booking/account/components/PostRegisterPopup.jsx
// Popup post-inscription : mois/année de naissance + téléphone.
// Affiché une seule fois après la 1re inscription. Permet au client de compléter
// son profil (birth_date pour le programme anniversaire + phone). Tout est
// optionnel : le client peut fermer pour ignorer. S'il ne saisit pas de date
// de naissance, il sera automatiquement exclu du programme anniversaire
// (cron filtre birth_date IS NOT NULL).
import { useState } from 'react';
import { pubApi } from '../../../../utils/api';
import { MONTHS } from '../helpers';
import { PhoneInput, isValidPhoneNumber } from '../../../../components/PhoneInput';

export function PostRegisterPopup({ slug, th, client, onClose, onSaved }) {
  const thisYear = new Date().getFullYear();
  const [month, setMonth] = useState('');      // '01' → '12'
  const [year,  setYear]  = useState('');      // ex '1990'
  const [phone, setPhone] = useState(client?.phone || '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    // Validation : si l'un des 2 champs anniversaire est rempli, l'autre est requis
    if ((month && !year) || (!month && year)) {
      setErr('Merci de saisir le mois ET l\'année.');
      return;
    }
    if (year) {
      const y = parseInt(year, 10);
      if (!/^\d{4}$/.test(year) || y < 1900 || y > thisYear) {
        setErr('Année invalide.');
        return;
      }
    }
    // RGPD commit 20 : si phone saisi, vérifier qu'il est valide E.164.
    if (phone && !isValidPhoneNumber(phone)) {
      setErr('Numéro invalide pour le pays sélectionné.');
      return;
    }
    setLoading(true); setErr('');
    try {
      const body = {
        first_name: client.first_name,
        last_name:  client.last_name || '',
        email:      client.email,
        phone:      phone || undefined,
      };
      if (month && year) body.birth_date = `${year}-${month}`; // backend convertit en YYYY-MM-01
      await pubApi.updateClientProfile(slug, body);
      onSaved && onSaved({ ...client, phone: phone.trim() || client.phone });
      onClose();
    } catch (e) {
      setErr(e.message || 'Erreur lors de la sauvegarde.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: th.card, borderRadius: 16, padding: 28,
        maxWidth: 420, width: '100%', border: `1px solid ${th.border}`,
        boxShadow: th.shadowLg,
      }}>
        <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>🎂</div>
        <p style={{ margin: '0 0 6px', fontWeight: 500, fontSize: 18, color: th.text,
          textAlign: 'center', letterSpacing:'-0.02em' }}>
          Un cadeau pour votre anniversaire ?
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: th.muted, lineHeight: 1.5, textAlign: 'center' }}>
          Indiquez votre mois et année de naissance pour recevoir une offre
          spéciale chaque année. Ces champs sont <b>facultatifs</b>.
        </p>

        {/* Mois + année */}
        <div className="bk-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: th.muted,
              marginBottom: 5 }}>
              Mois
            </label>
            <select value={month} onChange={e => { setMonth(e.target.value); setErr(''); }}
              style={{ width: '100%', padding: '11px 12px', borderRadius: 10,
                background: th.inputBg, border: `1px solid ${th.inputBorder}`,
                color: th.text, fontSize: 13, outline: 'none' }}>
              <option value="">—</option>
              {MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: th.muted,
              marginBottom: 5 }}>
              Année
            </label>
            <input type="text" inputMode="numeric" placeholder="1990"
              value={year} maxLength={4}
              onChange={e => { setYear(e.target.value.replace(/\D/g, '').slice(0, 4)); setErr(''); }}
              style={{ width: '100%', padding: '11px 12px', borderRadius: 10,
                background: th.inputBg, border: `1px solid ${th.inputBorder}`,
                color: th.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}/>
          </div>
        </div>

        {/* Téléphone — RGPD commit 20 : PhoneInput, optionnel dans ce popup. */}
        {!client?.phone && (
          <div style={{ marginBottom: 10 }}>
            <PhoneInput value={phone} onChange={setPhone}
              label="Téléphone (optionnel)" required={false}
              theme={{ text: th.text, muted: th.muted, dim: th.dim,
                border: th.border, inputBg: th.inputBg, inputBorder: th.inputBorder }}/>
          </div>
        )}

        {err && <p style={{ margin: '6px 0 10px', fontSize: 12, color: th.ax.rose, fontWeight: 500 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '12px', borderRadius: 10, background: th.bg,
              border: `1px solid ${th.border}`, color: th.text,
              fontWeight: 500, fontSize: 14, cursor: 'pointer', fontFamily:'inherit',
              transition:'background 0.15s ease, border-color 0.15s ease' }}
            onMouseEnter={e=>{ e.currentTarget.style.background = th.bgHover; e.currentTarget.style.borderColor = th.borderHv; }}
            onMouseLeave={e=>{ e.currentTarget.style.background = th.bg; e.currentTarget.style.borderColor = th.border; }}>
            Plus tard
          </button>
          <button onClick={save} disabled={loading}
            style={{ flex: 1, padding: '12px', borderRadius: 10, background: th.accent,
              border: `1px solid ${th.accent}`, color: th.accentText,
              fontWeight: 500, fontSize: 14, cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.6 : 1, fontFamily:'inherit',
              transition:'opacity 0.15s ease' }}
            onMouseEnter={e=>{ if(!loading) e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={e=>{ if(!loading) e.currentTarget.style.opacity = '1'; }}>
            {loading ? '…' : 'Enregistrer'}
          </button>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 11, color: th.dim, textAlign: 'center', lineHeight: 1.4 }}>
          Sans date de naissance, vous ne participerez pas au programme anniversaire.
        </p>
      </div>
    </div>
  );
}
