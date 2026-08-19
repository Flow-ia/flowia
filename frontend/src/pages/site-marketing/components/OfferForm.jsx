// OfferForm — capture lead inbound, offre "1 mois gratuit du plan Essentiel".
// POST /api/pub/inbound-lead (opt-in : le commercant laisse son contact +
// coche le consentement). Calque l'UX du formulaire Contact.jsx (tokens S,
// honeypot anti-bot, etat inline pour erreurs/succes — regle 9 CLAUDE.md,
// pas d'alert natif). FDS-2026 : pas d'emoji, fw<=500, pas de gradient.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { S, primaryBtnStyle, primaryHover } from './shadcn';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export default function OfferForm() {
  const [salon,   setSalon]   = useState('');
  const [city,    setCity]    = useState('');
  const [email,   setEmail]   = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot anti-bot
  const [sent,    setSent]    = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState('');
  const [focused, setFocused] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!salon.trim() || !email.trim()) {
      setErr('Le nom du salon et votre email sont obligatoires.'); return;
    }
    if (!consent) {
      setErr('Merci de cocher la case de consentement pour vous recontacter.'); return;
    }
    setBusy(true);
    try {
      const url = `${API_BASE}${API_BASE.endsWith('/api') ? '' : '/api'}/pub/inbound-lead`;
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ salon, city, email, consent, website, source: 'landing' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error || 'Envoi impossible. Réessayez dans un instant.');
        setBusy(false);
        return;
      }
      setSent(true);
    } catch {
      setErr('Erreur réseau. Vérifiez votre connexion et réessayez.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div style={{
        maxWidth: 460, margin: '0 auto', textAlign: 'center',
        padding: '28px 24px', borderRadius: S.r,
        border: `1px solid ${S.border}`, background: S.bg,
      }}>
        <p style={{ fontSize: 17, fontWeight: 500, color: S.fg, margin: '0 0 8px' }}>
          {"C'est noté, merci."}
        </p>
        <p style={{ fontSize: 14, color: S.fgMuted, margin: 0, lineHeight: 1.6 }}>
          {"Vous allez recevoir par email les instructions pour activer votre mois gratuit du plan Essentiel. Pensez à vérifier vos spams."}
        </p>
      </div>
    );
  }

  const inp = (id) => ({
    width: '100%', padding: '10px 14px',
    borderRadius: S.r, fontSize: 14, fontFamily: 'inherit',
    background: S.bg,
    border: `1px solid ${focused === id ? S.ring : S.border}`,
    boxShadow: focused === id ? `0 0 0 3px ${S.ring}1a` : 'none',
    color: S.fg, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    height: 40,
  });
  const label = {
    fontSize: 13, fontWeight: 500, color: S.fg,
    display: 'block', marginBottom: 6,
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 460, margin: '0 auto', textAlign: 'left' }}>
      <div style={{ marginBottom: 14 }}>
        <label style={label} htmlFor="of-salon">{"Nom du salon"}</label>
        <input id="of-salon" style={inp('salon')} value={salon}
          onChange={(e) => setSalon(e.target.value)}
          onFocus={() => setFocused('salon')} onBlur={() => setFocused('')}
          maxLength={200} placeholder="Barber Shop El Bahdja" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={label} htmlFor="of-city">{"Ville"}</label>
        <input id="of-city" style={inp('city')} value={city}
          onChange={(e) => setCity(e.target.value)}
          onFocus={() => setFocused('city')} onBlur={() => setFocused('')}
          maxLength={120} placeholder="Alger" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={label} htmlFor="of-email">{"Email professionnel"}</label>
        <input id="of-email" type="email" style={inp('email')} value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setFocused('email')} onBlur={() => setFocused('')}
          maxLength={254} placeholder="contact@votresalon.dz" />
      </div>

      {/* Honeypot : invisible pour un humain, rempli par les bots. */}
      <input type="text" tabIndex={-1} autoComplete="off" value={website}
        onChange={(e) => setWebsite(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        aria-hidden="true" />

      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 9,
        fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5,
        margin: '4px 0 16px', cursor: 'pointer',
      }}>
        <input type="checkbox" checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          {"J'accepte d'être recontacté par Salon DZ au sujet de cette offre. "}
          <Link to="/confidentialite" style={{ color: S.fg, textDecoration: 'underline' }}>
            {"Politique de confidentialité"}
          </Link>
          {". Désinscription en un clic dans chaque email."}
        </span>
      </label>

      {err && (
        <div style={{
          fontSize: 13, color: '#b42318', background: '#fef3f2',
          border: '1px solid #fee4e2', borderRadius: S.r,
          padding: '9px 12px', marginBottom: 14,
        }}>
          {err}
        </div>
      )}

      <button type="submit" disabled={busy}
        style={{ ...primaryBtnStyle(), width: '100%', opacity: busy ? 0.7 : 1 }}
        {...primaryHover}>
        {busy ? 'Envoi…' : 'Activer mon mois gratuit'}
      </button>
    </form>
  );
}
