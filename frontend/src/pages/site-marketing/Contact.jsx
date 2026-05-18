import { useState } from 'react';
import { PageHero } from './components/Shared';
import { S, primaryBtnStyle, primaryHover, CheckPill } from './components/shadcn';
import { CONTACT_EMAIL } from '../../utils/siteConfig';
import Seo from './components/Seo';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

const TOPICS = [
  { value: 'demo',    label: 'Demander une démo' },
  { value: 'devis',   label: 'Demander un devis (plan Équipe)' },
  { value: 'support', label: 'Support technique' },
  { value: 'partner', label: 'Partenariat' },
  { value: 'other',   label: 'Autre' },
];

const CONTACTS = [
  { label: 'Email',     value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
  { label: 'Téléphone', value: 'Lun-Dim · 8h-22h',      href: null },
  { label: 'Chat live', value: 'Réponse en < 5 min',    href: null },
  { label: 'Adresse',   value: 'France',                href: null },
];

export default function Contact() {
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [phone,   setPhone]   = useState('');
  const [topic,   setTopic]   = useState('demo');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot anti-bot
  const [sent,    setSent]    = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState('');
  const [focused, setFocused] = useState('');

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
    <>
      <Seo
        path="/contact"
        title="Contact & démo FlowIA — Réponse sous 24h"
        description="Une question, une démo ou un devis pour équiper votre salon avec FlowIA ? Notre équipe vous répond sous 24h ouvrées, souvent en moins d'une heure."
      />
      <PageHero
        label="Contact"
        title="Parlons de votre salon"
        subtitle="Une question, une démo, un devis ? Notre équipe vous répond sous 24h ouvrées (souvent en moins d'une heure)."
      />

      <section style={{ padding: '56px 16px 80px' }}>
        <div style={{
          maxWidth: 1000, margin: '0 auto',
          display: 'grid', gap: 32,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: S.fg, margin: 0, marginBottom: 18, letterSpacing: '-0.01em' }}>
              Plusieurs façons de nous joindre
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {CONTACTS.map(c => (
                <div key={c.label} style={{
                  padding: 16, borderRadius: S.rLg,
                  background: S.bg, border: `1px solid ${S.border}`,
                }}>
                  <p style={{ fontSize: 11, fontWeight: 500, color: S.fgSubtle, margin: 0, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {c.label}
                  </p>
                  {c.href
                    ? <a href={c.href} style={{ fontSize: 14, color: S.fg, textDecoration: 'none', fontWeight: 500 }}>{c.value}</a>
                    : <p style={{ fontSize: 14, color: S.fg, margin: 0, fontWeight: 500 }}>{c.value}</p>
                  }
                </div>
              ))}
            </div>
          </div>

          <div style={{
            padding: 'clamp(20px, 4vw, 32px)', borderRadius: S.rLg,
            background: S.bg, border: `1px solid ${S.border}`,
            boxShadow: S.shadowSm,
            minWidth: 0,
          }}>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 99,
                  background: S.ax.emeraldBg,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 16, border: `1px solid ${S.ax.emerald}33`,
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12L10 17L20 7" stroke={S.ax.emerald} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 500, color: S.fg, margin: 0, marginBottom: 8, letterSpacing: '-0.01em' }}>
                  Message envoyé !
                </h3>
                <p style={{ fontSize: 14, color: S.fgMuted, margin: 0, lineHeight: 1.6 }}>
                  {"Notre équipe vous répond sous 24h ouvrées (souvent plus vite). Si urgent, vous pouvez aussi écrire à "}
                  <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: S.fg, fontWeight: 500 }}>{CONTACT_EMAIL}</a>.
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
                    <input type="text" required value={name} onChange={e => setName(e.target.value)} disabled={busy}
                      onFocus={() => setFocused('name')} onBlur={() => setFocused('')}
                      style={inp('name')} />
                  </div>
                  <div>
                    <label style={label}>Email *</label>
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy}
                      onFocus={() => setFocused('email')} onBlur={() => setFocused('')}
                      style={inp('email')} />
                  </div>
                </div>
                <div>
                  <label style={label}>Téléphone</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} disabled={busy}
                    onFocus={() => setFocused('phone')} onBlur={() => setFocused('')}
                    style={inp('phone')} placeholder="06 12 34 56 78" />
                </div>
                <div>
                  <label style={label}>Votre demande *</label>
                  <select value={topic} onChange={e => setTopic(e.target.value)} disabled={busy}
                    onFocus={() => setFocused('topic')} onBlur={() => setFocused('')}
                    style={inp('topic')}>
                    {TOPICS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Message *</label>
                  <textarea required value={message} onChange={e => setMessage(e.target.value)} disabled={busy} rows={5}
                    onFocus={() => setFocused('msg')} onBlur={() => setFocused('')}
                    placeholder="Parlez-nous de votre salon, vos besoins…"
                    style={{ ...inp('msg'), resize: 'vertical', minHeight: 110, height: 'auto' }} />
                </div>

                {err && (
                  <div style={{
                    padding: '10px 14px', borderRadius: S.r,
                    background: S.ax.roseBg, border: `1px solid ${S.ax.rose}33`,
                    color: S.ax.rose, fontSize: 13, lineHeight: 1.5,
                  }}>
                    {err}
                  </div>
                )}

                <button type="submit" disabled={busy} style={{
                  ...primaryBtnStyle(),
                  width: '100%', textAlign: 'center', display: 'block',
                  cursor: busy ? 'wait' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                  marginTop: 4,
                }}
                  onMouseEnter={busy ? undefined : primaryHover.onMouseEnter}
                  onMouseLeave={busy ? undefined : primaryHover.onMouseLeave}>
                  {busy ? 'Envoi en cours…' : 'Envoyer le message'}
                </button>
                <p style={{ fontSize: 12, color: S.fgSubtle, margin: 0, lineHeight: 1.5 }}>
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
