import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { I } from '../../utils/icons';
import { PageHero } from './components/Shared';

export default function Contact() {
  const { theme: t } = useTheme();
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [phone,   setPhone]   = useState('');
  const [topic,   setTopic]   = useState('demo');
  const [message, setMessage] = useState('');
  const [sent,    setSent]    = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const subject = `[FlowIA] ${TOPICS.find(t => t.value === topic)?.label || ''} — ${name}`;
    const body = `Nom : ${name}\nEmail : ${email}\nTéléphone : ${phone}\n\n${message}`;
    window.location.href = `mailto:contact@flowiapro.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSent(true);
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

      <section style={{ padding: '56px 24px 96px' }}>
        <div style={{
          maxWidth: 1000, margin: '0 auto',
          display: 'grid', gap: 48,
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 2fr)',
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
            padding: 28, borderRadius: 14,
            background: t.canvas, border: `0.5px solid ${t.border}`,
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
                  Votre logiciel email s'est ouvert
                </h3>
                <p style={{ fontSize: 14, color: t.textSub, margin: 0, lineHeight: 1.6 }}>
                  Si rien ne s'est passé, écrivez-nous directement à <a href="mailto:contact@flowiapro.com" style={{ color: t.text }}>contact@flowiapro.com</a>.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <div>
                    <label style={label}>Nom complet *</label>
                    <input type="text" required value={name} onChange={e => setName(e.target.value)} style={inp} />
                  </div>
                  <div>
                    <label style={label}>Email *</label>
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={inp} />
                  </div>
                </div>
                <div>
                  <label style={label}>Téléphone</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inp} placeholder="06 12 34 56 78" />
                </div>
                <div>
                  <label style={label}>Votre demande *</label>
                  <select value={topic} onChange={e => setTopic(e.target.value)} style={inp}>
                    {TOPICS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Message</label>
                  <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
                    placeholder="Parlez-nous de votre salon, vos besoins…"
                    style={{ ...inp, resize: 'vertical', minHeight: 100 }} />
                </div>
                <button type="submit" style={{
                  fontSize: 15, fontWeight: 500, color: t.bg,
                  background: t.text, border: 'none',
                  padding: '13px 22px', borderRadius: 10,
                  cursor: 'pointer', fontFamily: 'inherit',
                  marginTop: 4,
                }}>
                  {"Envoyer le message"}
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
