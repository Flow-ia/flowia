import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { I } from '../../utils/icons';
import { PageHero } from './components/Shared';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export default function Contact() {
  const { theme: t } = useTheme();
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [phone,   setPhone]   = useState('');
  const [topic,   setTopic]   = useState('demo');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot anti-bot
  const [sent,    setSent]    = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!name.trim() || !email.trim() || !message.trim()) {
      setErr('Nom, email et message sont obligatoires.'); return;
    }
    setBusy(true);
    try {
      const url = `${API_BASE}${API_BASE.endsWith('/api') ? '' : '/api'}/pub/contact`;
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, email, phone, topic, message, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error || "Impossible d'envoyer votre message. Réessayez plus tard.");
        setBusy(false);
        return;
      }
      setSent(true);
    } catch {
      setErr("Erreur réseau. Vérifiez votre connexion et réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const inp = {
    width: '100%', padding: '11px 14px',
    borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
    background: t.inputBg, border: `0.5px solid ${t.borderInput}`,
    color: t.text, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s ease',
  };
  const label = {
    fontSize: 13, fontWeight: 500, color: t.textSub,
    display: 'block', marginBottom: 6,
  };

  return (
    <>
      <PageHero
        label="Contact"
        title="Parlons de votre salon"
        subtitle="Une question, une démo, un devis ? Notre équipe vous répond sous 24h ouvrées (souvent en moins d'une heure)."
      />

      <section style={{ padding: '40px 16px 56px' }}>
        <div style={{
          maxWidth: 1000, margin: '0 auto',
          display: 'grid', gap: 32,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: t.text, margin: 0, marginBottom: 18 }}>
              Plusieurs façons de nous joindre
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { Ic: I.Mail,  label: 'Email',     value: 'contact@flowiapro.com', href: 'mailto:contact@flowiapro.com' },
                { Ic: I.Phone, label: 'Téléphone', value: 'Lun-Dim · 8h-22h',      href: null },
                { Ic: I.Send,  label: 'Chat live', value: 'Réponse en < 5 min',    href: null },
                { Ic: I.MapPin,label: 'Adresse',   value: 'France',                href: null },
              ].map(c => (
                <div key={c.label} style={{
                  padding: 16, borderRadius: 12,
                  background: t.cardAlt, border: `0.5px solid ${t.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <c.Ic style={{ width: 14, height: 14, color: t.muted }} />
                    <p style={{ fontSize: 12, fontWeight: 500, color: t.muted, margin: 0, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {c.label}
                    </p>
                  </div>
                  {c.href
                    ? <a href={c.href} style={{ fontSize: 14, color: t.text, textDecoration: 'none' }}>{c.value}</a>
                    : <p style={{ fontSize: 14, color: t.text, margin: 0 }}>{c.value}</p>
                  }
                </div>
              ))}
            </div>
          </div>

          <div style={{
            padding: 'clamp(18px, 4vw, 28px)', borderRadius: 14,
            background: t.canvas, border: `0.5px solid ${t.border}`,
            minWidth: 0,
          }}>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 99,
                  background: '#ecfdf5',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 16,
                }}>
                  <I.Check style={{ width: 24, height: 24, color: '#10b981' }} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 500, color: t.text, margin: 0, marginBottom: 8 }}>
                  Message envoyé !
                </h3>
                <p style={{ fontSize: 14, color: t.textSub, margin: 0, lineHeight: 1.6 }}>
                  {"Notre équipe vous répond sous 24h ouvrées (souvent plus vite). Si urgent, vous pouvez aussi écrire à "}
                  <a href="mailto:contact@flowiapro.com" style={{ color: t.text }}>contact@flowiapro.com</a>.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Honeypot anti-bot — champ cache aux humains, rempli par les bots. */}
                <input type="text" name="website" value={website} onChange={e => setWebsite(e.target.value)}
                  tabIndex={-1} autoComplete="off" aria-hidden="true"
                  style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />

                <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <div>
                    <label style={label}>Nom complet *</label>
                    <input type="text" required value={name} onChange={e => setName(e.target.value)} disabled={busy} style={inp} />
                  </div>
                  <div>
                    <label style={label}>Email *</label>
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} style={inp} />
                  </div>
                </div>
                <div>
                  <label style={label}>Téléphone</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} disabled={busy} style={inp} placeholder="06 12 34 56 78" />
                </div>
                <div>
                  <label style={label}>Votre demande *</label>
                  <select value={topic} onChange={e => setTopic(e.target.value)} disabled={busy} style={inp}>
                    {TOPICS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Message *</label>
                  <textarea required value={message} onChange={e => setMessage(e.target.value)} disabled={busy} rows={5}
                    placeholder="Parlez-nous de votre salon, vos besoins…"
                    style={{ ...inp, resize: 'vertical', minHeight: 100 }} />
                </div>

                {err && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: '#fef2f2', border: '0.5px solid #fecaca',
                    color: '#991b1b', fontSize: 13, lineHeight: 1.5,
                  }}>
                    {err}
                  </div>
                )}

                <button type="submit" disabled={busy} style={{
                  fontSize: 15, fontWeight: 500,
                  color: t.bg, background: t.text, border: 'none',
                  padding: '13px 22px', borderRadius: 10,
                  cursor: busy ? 'wait' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                  fontFamily: 'inherit', marginTop: 4,
                }}>
                  {busy ? 'Envoi en cours…' : 'Envoyer le message'}
                </button>
                <p style={{ fontSize: 12, color: t.muted, margin: 0, lineHeight: 1.5 }}>
                  {"En soumettant ce formulaire, vous acceptez que vos données soient utilisées pour répondre à votre demande. Aucune donnée n'est transmise à des tiers."}
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

const TOPICS = [
  { value: 'demo',    label: 'Demander une démo' },
  { value: 'devis',   label: 'Demander un devis (plan Équipe)' },
  { value: 'support', label: 'Support technique' },
  { value: 'partner', label: 'Partenariat' },
  { value: 'other',   label: 'Autre' },
];
