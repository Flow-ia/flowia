import { useState } from 'react';
import { Link } from 'react-router-dom';
import { S, primaryBtnStyle, ghostBtnStyle, primaryHover, ghostHover, cardHover, CheckIcon, CaretDown } from './components/shadcn';
import HeroSocialBg from './components/HeroSocialBg';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

export default function Landing() {
  return (
    <>
      <Hero />
      <Stats />
      <Integrations />
      <Features />
      <AIShowcase />
      <Testimonials />
      <Pricing />
      <Faq />
      <FinalCTA />
    </>
  );
}

// ── Section "Intégrations" — Google Calendar + Stripe ───────────────────────
// Affichee juste apres les stats pour rassurer les prospects sur la qualite
// des outils tiers integres.
function Integrations() {
  return (
    <Section paddingY={64} borderTop>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Eyebrow>Intégrations natives</Eyebrow>
        <h2 style={{
          fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 500,
          color: S.fg, lineHeight: 1.25, letterSpacing: '-0.02em',
          margin: 0, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto',
        }}>
          {"Connecté aux outils que vous utilisez déjà"}
        </h2>
        <p style={{
          fontSize: 14, color: S.fgMuted, margin: '12px auto 0',
          maxWidth: 560, lineHeight: 1.55,
        }}>
          {"Pas de migration, pas de friction. FlowIA s'intègre directement avec vos outils favoris."}
        </p>
      </div>

      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
        maxWidth: 880, margin: '0 auto',
      }}>
        <IntegrationCard
          logo={
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" width="40" height="40">
              <rect width="200" height="200" rx="20" fill="#fff" stroke="#dadce0" strokeWidth="2"/>
              <rect x="20" y="40" width="160" height="140" rx="10" fill="#fff"/>
              <rect x="20" y="40" width="160" height="20" fill="#1a73e8"/>
              <text x="100" y="135" textAnchor="middle" fontFamily="Roboto, Arial, sans-serif"
                    fontSize="78" fontWeight="500" fill="#1a73e8">5</text>
            </svg>
          }
          title="Google Calendar"
          desc="Synchronisez vos rendez-vous FlowIA avec votre agenda Google en un clic. Toute modification ou annulation dans FlowIA met à jour votre Google Calendar instantanément."
          tag="Sync sortant"
          tagColor="#1a73e8"
        />
        <IntegrationCard
          logo={
            <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" width="40" height="40">
              <rect width="60" height="60" rx="12" fill="#635bff"/>
              <path d="M28.78 22.59c0-1.79 1.46-2.47 3.88-2.47 3.47 0 7.85 1.05 11.32 2.94v-10.74c-3.79-1.51-7.53-2.1-11.32-2.1-9.27 0-15.43 4.84-15.43 12.92 0 12.6 17.34 10.59 17.34 16.02 0 2.1-1.83 2.79-4.39 2.79-3.79 0-8.64-1.55-12.47-3.65v10.88c4.25 1.83 8.55 2.6 12.47 2.6 9.49 0 16.03-4.69 16.03-12.86-.05-13.6-17.43-11.18-17.43-16.33z"
                    fill="#fff"/>
            </svg>
          }
          title="Stripe"
          desc="Encaissez les paiements de vos rendez-vous en ligne directement sur votre compte. Acomptes ou paiement intégral, anti no-show. L'argent arrive direct, FlowIA prend zéro intermédiaire."
          tag="Direct charges"
          tagColor="#635bff"
        />
      </div>

      <p style={{
        fontSize: 12, color: S.fgSubtle, textAlign: 'center',
        margin: '28px auto 0', maxWidth: 600, lineHeight: 1.6,
      }}>
        {"Google Calendar™ et Stripe® sont des marques déposées de leurs propriétaires respectifs. FlowIA est un partenaire intégrateur indépendant."}
      </p>
    </Section>
  );
}

function IntegrationCard({ logo, title, desc, tag, tagColor }) {
  return (
    <div style={{
      padding: 24, borderRadius: S.rLg,
      background: S.bg, border: `1px solid ${S.border}`,
      display: 'flex', flexDirection: 'column', gap: 14,
      transition: 'border-color 0.15s ease, transform 0.15s ease',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = S.borderHv; e.currentTarget.style.transform = 'translateY(-2px)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.transform = 'none'; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flexShrink: 0 }}>{logo}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 16, fontWeight: 500, color: S.fg,
            margin: 0, letterSpacing: '-0.01em',
          }}>{title}</p>
          {tag && (
            <span style={{
              display: 'inline-block', marginTop: 4,
              fontSize: 10, fontWeight: 500,
              color: tagColor, background: tagColor + '14',
              padding: '2px 8px', borderRadius: 99,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>{tag}</span>
          )}
        </div>
      </div>
      <p style={{
        fontSize: 13, color: S.fgMuted, lineHeight: 1.55, margin: 0,
      }}>{desc}</p>
    </div>
  );
}

// ── Layout helpers ───────────────────────────────────────────────────────────
function Section({ children, bg = S.bg, paddingY = 80, borderTop = false }) {
  return (
    <section style={{
      background: bg,
      padding: `${paddingY}px 24px`,
      borderTop: borderTop ? `1px solid ${S.border}` : 'none',
    }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>{children}</div>
    </section>
  );
}

function Eyebrow({ children }) {
  return (
    <p style={{
      fontSize: 12, fontWeight: 500, color: S.fgSubtle,
      textTransform: 'uppercase', letterSpacing: 1,
      margin: 0, marginBottom: 14,
    }}>{children}</p>
  );
}

function H2({ children, align = 'left', maxWidth }) {
  return (
    <h2 style={{
      fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: 500,
      color: S.fg, lineHeight: 1.15, letterSpacing: '-0.025em',
      margin: 0, marginBottom: 12, textAlign: align,
      maxWidth,
      marginLeft: align === 'center' ? 'auto' : undefined,
      marginRight: align === 'center' ? 'auto' : undefined,
    }}>{children}</h2>
  );
}

function Lede({ children, align = 'left', maxWidth = 640 }) {
  return (
    <p style={{
      fontSize: 16, color: S.fgMuted, lineHeight: 1.6,
      margin: 0, marginBottom: 24, textAlign: align,
      maxWidth,
      marginLeft: align === 'center' ? 'auto' : undefined,
      marginRight: align === 'center' ? 'auto' : undefined,
    }}>{children}</p>
  );
}

// ── 1. Hero ──────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{
      padding: 'clamp(72px, 9vw, 104px) 24px 40px',
      background: S.bg,
      borderBottom: `1px solid ${S.border}`,
      // position:relative + overflow:hidden -> contient les icônes
      // décoratives flottantes (HeroSocialBg) qui s'envolent en boucle.
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Logos réseaux sociaux flottants (Insta/FB/WhatsApp/SMS/TikTok)
          en arrière-plan derrière le contenu — évoquent la diffusion
          multi-canale du produit. */}
      <HeroSocialBg />

      <div style={{ maxWidth: 1120, margin: '0 auto', textAlign: 'center',
                    position: 'relative', zIndex: 1 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 500,
          padding: '4px 12px', borderRadius: 99,
          background: S.bgMuted, border: `1px solid ${S.border}`,
          color: S.fg2, marginBottom: 22,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: S.ax.emerald }} />
          {"Nouveau · Marketing IA inclus"}
        </span>

        <h1 style={{
          fontSize: 'clamp(36px, 6.4vw, 64px)', fontWeight: 500,
          color: S.fg, lineHeight: 1.02, letterSpacing: '-0.04em',
          margin: 0, marginBottom: 18,
          maxWidth: 880, marginLeft: 'auto', marginRight: 'auto',
        }}>
          {"L'app qui fait tourner votre salon."}
        </h1>
        <p style={{
          fontSize: 'clamp(15px, 2.2vw, 18px)', color: S.fgMuted, lineHeight: 1.6,
          maxWidth: 620, margin: '0 auto 32px',
        }}>
          {"Agenda, réservation, caisse, fidélité, marketing IA — dans une seule app."}
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <PrimaryCta href={COMMERCANT_URL + '/register?plan=essentiel&period=monthly'}>{"Essayer 14 jours"}</PrimaryCta>
          <SecondaryCta to="/fonctionnalites">{"Voir la démo"}</SecondaryCta>
        </div>
        <p style={{ fontSize: 13, color: S.fgSubtle, margin: '0 0 18px' }}>
          {"Sans carte bancaire · Sans engagement · Installation immédiate"}
        </p>

        {/* Pill social — annonce que le lien de réservation se diffuse en 1
            clic sur les réseaux sociaux du commerçant. Mini logos de marque
            inline pour renforcer l'impact (couleurs officielles). */}
        <SocialIntegrationPill />

        <HeroAgendaScreen />
      </div>
    </section>
  );
}

// Pill décorative + texte court qui rassure le commerçant : il pourra
// diffuser son lien de réservation en 1 clic sur Insta / FB / WhatsApp /
// TikTok / SMS depuis l'app commerçant. Mini logos en couleurs de marque
// (pas de gradient, FDS-2026), texte fontSize 13 fontWeight 500.
function SocialIntegrationPill() {
  const ICON_SIZE = 16;
  const items = [
    { name: 'instagram', color: '#E4405F', d: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069M12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0m0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8m6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881' },
    { name: 'facebook',  color: '#1877F2', d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073' },
    { name: 'whatsapp',  color: '#25D366', d: 'M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l.103.165-.999 3.648 3.741-.981.134.075z' },
    { name: 'tiktok',    color: '#0F0F0F', d: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1z' },
  ];
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '8px 14px', borderRadius: 99,
      background: S.bgMuted, border: `1px solid ${S.border}`,
      margin: '0 auto 56px',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {items.map(it => (
          <svg key={it.name} viewBox="0 0 24 24"
               width={ICON_SIZE} height={ICON_SIZE}
               style={{ display: 'block', color: it.color, flexShrink: 0 }}>
            <path fill="currentColor" d={it.d}/>
          </svg>
        ))}
        {/* SMS — bulle de message Lucide-style en stroke pour matcher la
            convention de l'icône native. */}
        <svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}
             fill="none" stroke="#0EA5E9" strokeWidth="1.7"
             strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0 }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: S.fg2 }}>
        {"Diffusez votre lien de réservation en 1 clic sur vos réseaux sociaux"}
      </span>
    </div>
  );
}

function HeroAgendaScreen() {
  const appts = [
    { time: '09:00', name: 'Karim B.',  service: 'Coupe + barbe', dur: '45 min', accent: S.ax.emerald, accentBg: S.ax.emeraldBg, tag: 'Confirmé' },
    { time: '10:00', name: 'Sofia M.',  service: 'Couleur',       dur: '90 min', accent: S.ax.violet,  accentBg: S.ax.violetBg,  tag: 'Confirmé' },
    { time: '11:30', name: 'Yanis D.',  service: 'Coupe homme',   dur: '30 min', accent: S.ax.blue,    accentBg: S.ax.blueBg,    tag: 'Confirmé' },
    { time: '12:15', name: 'Léa T.',    service: 'Brushing',      dur: '30 min', accent: S.ax.amber,   accentBg: S.ax.amberBg,   tag: 'En attente' },
    { time: '13:00', name: 'Adam K.',   service: 'Barbe',         dur: '20 min', accent: S.ax.cyan,    accentBg: S.ax.cyanBg,    tag: 'Nouveau' },
  ];
  return (
    <div style={{
      maxWidth: 980, margin: '0 auto',
      borderRadius: S.rXl, background: S.bg,
      border: `1px solid ${S.border}`,
      boxShadow: S.shadowXl,
      overflow: 'hidden',
    }}>
      <BrowserChrome url="commercant.flowiapro.com" />
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', minHeight: 440 }}>
        <div style={{ borderRight: `1px solid ${S.border}`, padding: '14px 10px', background: S.bgMuted }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 14px', borderBottom: `1px solid ${S.border}`, marginBottom: 12 }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: S.fg }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: S.fg }}>FlowIA</span>
          </div>
          {[
            { l: 'Agenda', active: true },
            { l: 'Réservation' }, { l: 'Caisse' }, { l: 'Clients' },
            { l: 'Fidélité' }, { l: 'Marketing IA' }, { l: 'Statistiques' }, { l: 'Réglages' },
          ].map(it => (
            <div key={it.l} style={{
              fontSize: 13, padding: '7px 8px', marginBottom: 2, borderRadius: S.rSm,
              color: it.active ? S.fg : S.fgMuted,
              background: it.active ? S.bgHover : 'transparent',
              fontWeight: it.active ? 500 : 400,
            }}>{it.l}</div>
          ))}
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <p style={{ fontSize: 16, fontWeight: 500, color: S.fg, margin: 0, letterSpacing: '-0.01em' }}>{"Lundi 12 mai"}</p>
              <p style={{ fontSize: 12, color: S.fgSubtle, margin: '2px 0 0' }}>{"5 rendez-vous · 312 € prévus"}</p>
            </div>
            <span style={{ fontSize: 11, padding: '4px 10px', background: S.ax.emeraldBg, color: S.ax.emerald, borderRadius: 99, fontWeight: 500, border: `1px solid ${S.ax.emerald}33` }}>
              {"+12 RDV cette semaine"}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {appts.map((a, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '64px 4px 1fr auto', gap: 12, alignItems: 'center',
                padding: '12px 14px', borderRadius: S.r,
                border: `1px solid ${S.border}`, background: S.bg,
              }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: S.fg, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{a.time}</span>
                <span style={{ width: 4, height: 28, borderRadius: 2, background: a.accent }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: S.fg, margin: 0 }}>{a.name}</p>
                  <p style={{ fontSize: 12, color: S.fgSubtle, margin: '2px 0 0' }}>{a.service + ' · ' + a.dur}</p>
                </div>
                <span style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: S.rSm,
                  background: a.accentBg, color: a.accent, fontWeight: 500,
                  border: `1px solid ${a.accent}33`,
                }}>{a.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BrowserChrome({ url }) {
  return (
    <div style={{
      height: 32, background: S.bgMuted,
      borderBottom: `1px solid ${S.border}`,
      display: 'flex', alignItems: 'center', padding: '0 14px',
    }}>
      <span style={{ width: 9, height: 9, borderRadius: 5, background: '#ff5f57', marginRight: 6 }} />
      <span style={{ width: 9, height: 9, borderRadius: 5, background: '#febc2e', marginRight: 6 }} />
      <span style={{ width: 9, height: 9, borderRadius: 5, background: '#28c840' }} />
      <span style={{ marginLeft: 16, fontSize: 11, color: S.fgSubtle }}>{url}</span>
    </div>
  );
}

// ── 2. Stats ─────────────────────────────────────────────────────────────────
function Stats() {
  const stats = [
    { v: '+30 %', label: "de chiffre d'affaires moyen" },
    { v: '−70 %', label: 'de no-shows en moins' },
    { v: '24/7',  label: 'de réservations en ligne' },
    { v: '500+',  label: 'salons actifs en France' },
  ];
  return (
    <section style={{ padding: '64px 24px', background: S.bgInverse, color: S.fgInv }}>
      <div style={{
        maxWidth: 1120, margin: '0 auto',
        display: 'grid', gap: 24,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
      }}>
        {stats.map(s => (
          <div key={s.label} style={{ padding: '8px 16px', textAlign: 'center' }}>
            <p style={{
              fontSize: 'clamp(32px, 5.5vw, 52px)', fontWeight: 500,
              color: S.fgInv, letterSpacing: '-0.03em', lineHeight: 1,
              margin: 0, marginBottom: 10,
            }}>{s.v}</p>
            <p style={{ fontSize: 14, color: S.fgInvMut, margin: 0, lineHeight: 1.5 }}>{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 3. Features ──────────────────────────────────────────────────────────────
function Features() {
  return (
    <Section paddingY={88}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <Eyebrow>Tout-en-un</Eyebrow>
        <H2 align="center">{"Tout ce dont votre salon a besoin"}</H2>
        <Lede align="center" maxWidth={560}>
          {"Une seule app. Toutes les fonctions essentielles, sans complexité."}
        </Lede>
      </div>
      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}>
        <FeatureCard title="Réservation 24/7"
          desc="Vos clients réservent en 30 secondes, jour et nuit."
          mock={<MockBooking />} />
        <FeatureCard title="Marketing IA" badge="IA"
          desc="L'IA cible le bon client avec le bon message."
          mock={<MockAI />} />
        <FeatureCard title="Rappels SMS"
          desc="−70 % de no-shows, 100 % automatique."
          mock={<MockSMS />} />
        <FeatureCard title="Caisse intégrée"
          desc="Multi-paiements, exports comptables auto."
          mock={<MockCaisse />} />
        <FeatureCard title="Fidélité & parrainage"
          desc="Points cumulés, récompenses prêtes à l'emploi."
          mock={<MockFidelite />} />
        <FeatureCard title="Équipe & PIN tablette"
          desc="Multi-employés, droits par rôle, tablette partagée."
          mock={<MockPin />} />
      </div>
    </Section>
  );
}

function FeatureCard({ title, desc, mock, badge }) {
  return (
    <div style={{
      borderRadius: S.rLg,
      background: S.bg,
      border: `1px solid ${S.border}`,
      overflow: 'hidden', position: 'relative',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = S.borderHv; e.currentTarget.style.boxShadow = S.shadowMd; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.boxShadow = 'none'; }}>
      <div style={{
        height: 144, background: S.bgMuted,
        borderBottom: `1px solid ${S.border}`,
        padding: 16, position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      }}>
        {mock}
        {badge && (
          <span style={{
            position: 'absolute', top: 10, right: 10,
            fontSize: 10, fontWeight: 500,
            padding: '3px 8px', borderRadius: 99,
            background: S.fg, color: S.fgInv,
            letterSpacing: 0.5, textTransform: 'uppercase',
          }}>{badge}</span>
        )}
      </div>
      <div style={{ padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 500, color: S.fg, margin: 0, marginBottom: 4, letterSpacing: '-0.01em' }}>{title}</h3>
        <p style={{ fontSize: 13, color: S.fgMuted, lineHeight: 1.55, margin: 0 }}>{desc}</p>
      </div>
    </div>
  );
}

// ── Mini UI mocks ────────────────────────────────────────────────────────────
function MockBooking() {
  const services = [
    { s: 'Coupe homme',   p: '22 €' },
    { s: 'Coupe + barbe', p: '32 €', sel: true },
    { s: 'Couleur',       p: '55 €' },
  ];
  return (
    <div style={{
      width: 180, alignSelf: 'center',
      borderRadius: S.r, background: S.bg,
      border: `1px solid ${S.border}`,
      padding: 10, display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <p style={{ fontSize: 10, fontWeight: 500, color: S.fg, margin: 0, marginBottom: 2 }}>
        {"Hair Coiff Lille"}
      </p>
      {services.map((it, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '6px 8px', borderRadius: S.rSm, fontSize: 10,
          background: it.sel ? S.bgHover : S.bgMuted,
          border: `1px solid ${it.sel ? S.borderHv : S.border}`,
          color: S.fg,
        }}>
          <span>{it.s}</span><span style={{ fontWeight: 500 }}>{it.p}</span>
        </div>
      ))}
      <span style={{
        marginTop: 2, fontSize: 10, fontWeight: 500,
        padding: '6px 8px', borderRadius: S.rSm,
        background: S.fg, color: S.fgInv, textAlign: 'center',
      }}>{"Réserver"}</span>
    </div>
  );
}

function MockAI() {
  return (
    <div style={{
      width: '100%', alignSelf: 'stretch',
      borderRadius: S.r, background: S.bg,
      border: `1px solid ${S.border}`,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 18, height: 18, borderRadius: S.rSm, background: S.ax.violet }} />
        <span style={{ fontSize: 11, fontWeight: 500, color: S.fg }}>{"Suggestion IA"}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: S.fgSubtle }}>{"il y a 2 min"}</span>
      </div>
      <p style={{ fontSize: 11, color: S.fgMuted, lineHeight: 1.45, margin: 0 }}>
        {"23 clientes inactives depuis 3 mois → campagne SMS recommandée"}
      </p>
      <span style={{
        marginTop: 'auto', fontSize: 10, fontWeight: 500,
        padding: '6px 8px', borderRadius: S.rSm,
        background: S.fg, color: S.fgInv, textAlign: 'center',
      }}>{"Lancer la campagne"}</span>
    </div>
  );
}

function MockSMS() {
  return (
    <div style={{
      width: '100%', maxWidth: 220, alignSelf: 'center',
      borderRadius: S.rLg, background: S.bgHover,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 6,
      border: `1px solid ${S.border}`,
    }}>
      <p style={{ fontSize: 9, color: S.fgSubtle, textAlign: 'center', margin: 0 }}>
        {"SMS · Hair Coiff Lille"}
      </p>
      <div style={{
        background: S.bg, borderRadius: '12px 12px 12px 4px',
        padding: '7px 10px', fontSize: 10, color: S.fg, lineHeight: 1.4,
        alignSelf: 'flex-start', maxWidth: '85%',
        border: `1px solid ${S.border}`,
      }}>
        {"Sofia, RDV demain 14h. Confirmer ?"}
      </div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 9, padding: '4px 10px', borderRadius: 99, background: S.ax.emerald, color: S.fgInv, fontWeight: 500 }}>
          {"OUI"}
        </span>
        <span style={{ fontSize: 9, padding: '4px 10px', borderRadius: 99, background: S.bg, color: S.fgMuted, border: `1px solid ${S.border}` }}>
          {"Annuler"}
        </span>
      </div>
    </div>
  );
}

function MockCaisse() {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
      <div style={{
        background: S.bg, borderRadius: S.r, padding: '8px 10px',
        border: `1px solid ${S.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, color: S.fgSubtle }}>{"Coupe + barbe"}</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: S.fg, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>32,00 €</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {[
          { l: 'Espèces', c: S.ax.emerald, b: S.ax.emeraldBg },
          { l: 'Carte',   c: S.ax.blue,    b: S.ax.blueBg },
          { l: 'Virem.',  c: S.ax.cyan,    b: S.ax.cyanBg },
          { l: 'Multi',   c: S.ax.amber,   b: S.ax.amberBg },
        ].map(p => (
          <span key={p.l} style={{
            fontSize: 9, fontWeight: 500, padding: '6px 4px', borderRadius: S.rSm,
            background: p.b, color: p.c, textAlign: 'center',
            border: `1px solid ${p.c}33`,
          }}>{p.l}</span>
        ))}
      </div>
    </div>
  );
}

function MockFidelite() {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ background: S.bg, borderRadius: S.r, padding: 12, border: `1px solid ${S.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: S.fg, fontWeight: 500 }}>Sofia M.</span>
          <span style={{ fontSize: 11, color: S.ax.emerald, fontWeight: 500 }}>140 / 200 pts</span>
        </div>
        <div style={{ height: 6, background: S.bgHover, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: '70%', height: '100%', background: S.ax.emerald }} />
        </div>
        <p style={{ fontSize: 9, color: S.fgSubtle, margin: '8px 0 0' }}>
          {"Plus que 60 pts → coupe offerte"}
        </p>
      </div>
    </div>
  );
}

function MockPin() {
  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: S.bg, borderRadius: S.r, padding: 12, border: `1px solid ${S.border}`, width: 132 }}>
        <p style={{ fontSize: 10, color: S.fgSubtle, textAlign: 'center', margin: '0 0 6px' }}>
          {"Karim · PIN"}
        </p>
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 8 }}>
          {[1, 2, 3, 4].map(i => (
            <span key={i} style={{
              width: 8, height: 8, borderRadius: 4,
              background: i < 4 ? S.fg : S.border,
            }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
            <span key={d} style={{
              fontSize: 11, padding: '4px 0', textAlign: 'center',
              background: S.bgMuted, borderRadius: S.rSm, color: S.fg,
            }}>{d}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 4. AI Showcase ───────────────────────────────────────────────────────────
function AIShowcase() {
  return (
    <Section bg={S.bgMuted} paddingY={88} borderTop>
      <div style={{
        display: 'grid', gap: 48,
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        alignItems: 'center',
      }}>
        <div>
          <Eyebrow>Marketing IA</Eyebrow>
          <H2>{"L'IA qui fait grandir votre CA"}</H2>
          <Lede maxWidth={500}>
            {"FlowIA détecte les clients à reconquérir, génère les SMS, prévoit votre CA. Vous validez en un clic."}
          </Lede>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              'Campagnes SMS générées automatiquement',
              "Détection des clients à risque",
              'Prévisions de CA sur 4 semaines',
            ].map(b => (
              <li key={b} style={{ fontSize: 14, color: S.fg2, paddingLeft: 22, position: 'relative', lineHeight: 1.5 }}>
                <span style={{
                  position: 'absolute', left: 0, top: 4,
                  width: 14, height: 14, borderRadius: 7,
                  background: S.ax.violetBg,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke={S.ax.violet} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        <div style={{
          background: S.bg, borderRadius: S.rXl,
          border: `1px solid ${S.border}`,
          boxShadow: S.shadowLg, overflow: 'hidden',
        }}>
          <BrowserChrome url="Marketing IA" />
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 32, height: 32, borderRadius: S.r, background: S.ax.violet }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: S.fg, margin: 0 }}>{"FlowIA Assistant"}</p>
                <p style={{ fontSize: 11, color: S.fgSubtle, margin: 0 }}>{"Suggestion · il y a 2 min"}</p>
              </div>
            </div>
            <div style={{
              padding: 14, borderRadius: S.r,
              background: S.bgMuted, border: `1px solid ${S.border}`,
              marginBottom: 12,
            }}>
              <p style={{ fontSize: 13, color: S.fg, margin: 0, lineHeight: 1.55 }}>
                {"23 clientes n'ont pas pris RDV depuis 3 mois. Estimation : +6 à +8 retours sur cette campagne."}
              </p>
            </div>
            <div style={{
              padding: 12, borderRadius: S.r,
              background: S.bg, border: `1px solid ${S.border}`,
              marginBottom: 14,
            }}>
              <p style={{ fontSize: 11, color: S.fgSubtle, margin: '0 0 6px' }}>{"SMS suggéré"}</p>
              <p style={{ fontSize: 12, color: S.fg, margin: 0, lineHeight: 1.5 }}>
                {"Sofia, on vous a vue il y a longtemps ! −20 % sur votre prochaine coupe avec le code SOFIA20. Hair Coiff Lille."}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{
                flex: 1, padding: '9px 12px', borderRadius: S.r,
                background: S.fg, color: S.fgInv,
                border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>{"Lancer la campagne"}</button>
              <button style={{
                padding: '9px 14px', borderRadius: S.r,
                background: S.bg, color: S.fg,
                border: `1px solid ${S.border}`, fontSize: 12, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 500,
              }}>{"Modifier"}</button>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ── 5. Testimonials ──────────────────────────────────────────────────────────
function Testimonials() {
  const items = [
    { name: 'Sofiane Belkacem', role: 'Hair Coiff Lille',  quote: "0 appel par jour. Je me concentre sur mes clients en chaise." },
    { name: 'Camille Roussel',  role: 'Studio Camille',    quote: "+800 €/mois rien qu'avec les rappels SMS. Imparable." },
    { name: 'Élodie Marchand',  role: 'Beauty Box',        quote: "La fidélité tourne seule. Mes clientes adorent." },
  ];
  return (
    <Section paddingY={88}>
      <H2 align="center">{"500+ salons utilisent FlowIA chaque jour"}</H2>
      <div style={{
        marginTop: 36, display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}>
        {items.map(it => (
          <div key={it.name} style={{
            padding: 24, borderRadius: S.rLg,
            background: S.bg, border: `1px solid ${S.border}`,
          }}>
            <p style={{ fontSize: 14, color: S.fg, lineHeight: 1.6, margin: 0, marginBottom: 18 }}>
              {"« " + it.quote + " »"}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 36, height: 36, borderRadius: 18,
                background: S.bgHover, color: S.fg,
                fontSize: 12, fontWeight: 500,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${S.border}`,
              }}>
                {it.name.split(' ').map(p => p[0]).join('')}
              </span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: S.fg, margin: 0 }}>{it.name}</p>
                <p style={{ fontSize: 11, color: S.fgSubtle, margin: 0 }}>{it.role}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── 6. Pricing ───────────────────────────────────────────────────────────────
function Pricing() {
  const plans = [
    {
      name: 'Découverte', price: '0',
      desc: "Pour démarrer.",
      features: ["50 RDV/mois", '1 employé', 'Caisse intégrée', 'Commission 2 % sur paiements en ligne', 'Support email'],
      cta: 'Commencer', highlight: false,
    },
    {
      name: 'Essentiel', price: '24',
      desc: "Pour faire grandir.",
      features: ['RDV illimités', "Jusqu'à 5 employés", '0 % de commission', 'Campagnes SMS marketing', 'Fidélité & parrainage', 'Marketing IA', 'Support prioritaire'],
      cta: 'Essayer 14 jours', highlight: true,
    },
    {
      name: 'Équipe', price: '49',
      desc: "Accompagnement dédié.",
      features: ['Tout le plan Essentiel', 'Employés illimités', 'Cadeau anniversaire', 'Support dédié + SLA'],
      cta: 'Nous contacter', highlight: false,
    },
  ];
  return (
    <Section bg={S.bgMuted} paddingY={88} borderTop>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <Eyebrow>Tarifs</Eyebrow>
        <H2 align="center">{"Simple, sans engagement"}</H2>
        <Lede align="center">{"14 jours d'essai gratuit. Annulez quand vous voulez."}</Lede>
      </div>
      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        maxWidth: 1000, margin: '0 auto',
      }}>
        {plans.map(p => (
          <div key={p.name} style={{
            padding: 28, borderRadius: S.rLg,
            background: S.bg,
            border: p.highlight ? `1px solid ${S.fg}` : `1px solid ${S.border}`,
            position: 'relative',
            boxShadow: p.highlight ? S.shadowLg : S.shadowSm,
          }}>
            {p.highlight && (
              <span style={{
                position: 'absolute', top: -10, left: 24,
                fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 99,
                background: S.fg, color: S.fgInv, letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}>{"Populaire"}</span>
            )}
            <p style={{ fontSize: 14, fontWeight: 500, color: S.fg, margin: 0, marginBottom: 4, letterSpacing: '-0.01em' }}>{p.name}</p>
            <p style={{ fontSize: 13, color: S.fgSubtle, margin: 0, marginBottom: 18 }}>{p.desc}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 22 }}>
              <span style={{ fontSize: 38, fontWeight: 500, color: S.fg, letterSpacing: '-0.03em' }}>{p.price + ' €'}</span>
              <span style={{ fontSize: 13, color: S.fgSubtle }}>{"/mois"}</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {p.features.map(f => (
                <li key={f} style={{ fontSize: 13, color: S.fg2, paddingLeft: 22, position: 'relative', lineHeight: 1.5 }}>
                  <span style={{
                    position: 'absolute', left: 0, top: 3,
                    width: 14, height: 14, borderRadius: 7,
                    background: S.ax.emeraldBg,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke={S.ax.emerald} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/tarifs" style={{
              ...(p.highlight ? primaryBtnStyle() : ghostBtnStyle()),
              display: 'block', textAlign: 'center', width: '100%', boxSizing: 'border-box',
            }}>{p.cta}</Link>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── 7. FAQ ───────────────────────────────────────────────────────────────────
function Faq() {
  const items = [
    { q: "Puis-je essayer FlowIA gratuitement ?",
      a: "Oui. Plan Découverte gratuit à vie. Plan Essentiel offert 14 jours sans carte bancaire." },
    { q: "Mes données sont-elles en sécurité ?",
      a: "Hébergement Europe, chiffrement, conforme RGPD. Export et suppression à tout moment." },
    { q: "Migration depuis mon ancien outil ?",
      a: "On importe vos clients, prestations et RDV gratuitement (24 à 48h selon volume)." },
    { q: "Engagement ou frais cachés ?",
      a: "Aucun. Au mois, sans engagement. SMS facturés à l'usage (plans Essentiel et Équipe)." },
    { q: "Compatible mobile et tablette ?",
      a: "Oui. App web responsive, mode tablette partagée avec PIN par employé." },
  ];
  const [open, setOpen] = useState(0);
  return (
    <Section paddingY={88}>
      <H2 align="center">{"Questions fréquentes"}</H2>
      <div style={{ maxWidth: 720, margin: '32px auto 0', borderTop: `1px solid ${S.border}` }}>
        {items.map((it, i) => (
          <div key={it.q} style={{ borderBottom: `1px solid ${S.border}` }}>
            <button onClick={() => setOpen(open === i ? -1 : i)} style={{
              width: '100%', padding: '20px 4px', background: 'transparent',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 16, textAlign: 'left',
            }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: S.fg, letterSpacing: '-0.01em' }}>{it.q}</span>
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" style={{
                transform: open === i ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.2s ease', flexShrink: 0,
              }}>
                <path d="M3 4.5L6 7.5L9 4.5" stroke={S.fgMuted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {open === i && (
              <div style={{ padding: '0 4px 20px', fontSize: 14, color: S.fgMuted, lineHeight: 1.65 }}>
                {it.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── 8. Final CTA ─────────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <Section bg={S.bgMuted} paddingY={88} borderTop>
      <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
        <H2 align="center">{"Prêt à digitaliser votre salon ?"}</H2>
        <Lede align="center">{"14 jours d'essai. Sans carte. Sans engagement."}</Lede>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <PrimaryCta href={COMMERCANT_URL + '/register?plan=essentiel&period=monthly'}>{"Essayer gratuitement"}</PrimaryCta>
          <SecondaryCta to="/contact">{"Parler à un conseiller"}</SecondaryCta>
        </div>
      </div>
    </Section>
  );
}

// ── CTAs (utilisent les styles partagés shadcn.js) ───────────────────────────
function PrimaryCta({ children, href, to }) {
  if (to) return <Link to={to} style={primaryBtnStyle()} {...primaryHover}>{children}</Link>;
  return <a href={href} style={primaryBtnStyle()} {...primaryHover}>{children}</a>;
}

function SecondaryCta({ children, href, to }) {
  if (to) return <Link to={to} style={ghostBtnStyle()} {...ghostHover}>{children}</Link>;
  return <a href={href} style={ghostBtnStyle()} {...ghostHover}>{children}</a>;
}
