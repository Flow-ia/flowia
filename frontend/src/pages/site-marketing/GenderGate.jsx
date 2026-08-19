// GenderGate.jsx — Porte d'entree Salon DZ (marche algerien).
//
// Premiere page vue par le visiteur sur "/" : choix Homme / Femme avant
// d'arriver sur la marketplace des salons. Le choix est memorise
// (localStorage salondz_segment) et passe en query ?segment= pour que la
// marketplace adapte son theme (barber / girly) et ses filtres prestations.
//
// FDS-2026 : styles inline, pas de gradients, pas d'emoji, fw <= 500,
// bordures fines. Pictos en SVG inline (traits).

import { useNavigate, Link } from 'react-router-dom';
import Seo from './components/Seo';

const INK    = '#18181b';
const MUTED  = '#71717a';
const BORDER = '#e4e4e7';
const GREEN  = '#0a7a3d';
const ROSE   = '#db2777';

// Picto homme : ciseaux de barbier (traits).
function ScissorsIcon({ color }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.12 8.12 20 20" />
      <path d="M14.8 14.8 20 4" />
      <path d="M8.12 15.88 12 12" />
    </svg>
  );
}

// Picto femme : cil / eclat beaute (traits).
function LashIcon({ color }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12c3.5-4.5 8-6.5 10-6.5S18.5 7.5 22 12" />
      <path d="M6 10.2 4.8 13" />
      <path d="M9.5 8.6 8.8 11.6" />
      <path d="M13.5 8.4l.5 3" />
      <path d="M17.4 9.7l1.2 2.6" />
      <path d="M12 8v3.2" />
    </svg>
  );
}

function SegmentCard({ accent, soft, icon, kicker, title, desc, cta, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card-hover"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        gap: 14, padding: '32px 28px', background: '#fff',
        border: `1px solid ${BORDER}`, borderRadius: 20, cursor: 'pointer',
        textAlign: 'left', width: '100%',
      }}
    >
      <span style={{
        width: 56, height: 56, borderRadius: 16, background: soft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </span>
      <span style={{
        fontSize: 12, fontWeight: 500, letterSpacing: 1.2,
        textTransform: 'uppercase', color: accent,
      }}>
        {kicker}
      </span>
      <span style={{ fontSize: 26, fontWeight: 500, color: INK, letterSpacing: -0.5 }}>
        {title}
      </span>
      <span style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED }}>
        {desc}
      </span>
      <span style={{
        marginTop: 6, padding: '10px 18px', borderRadius: 999,
        background: accent, color: '#fff', fontSize: 14, fontWeight: 500,
      }}>
        {cta}
      </span>
    </button>
  );
}

export default function GenderGate() {
  const navigate = useNavigate();

  const choose = (segment) => {
    try { localStorage.setItem('salondz_segment', segment); } catch {}
    navigate(`/marketplace?segment=${segment}`);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: '#fafafa', color: INK,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <Seo
        title="Salon DZ — Réservez votre salon de coiffure et beauté en Algérie"
        description="Trouvez et réservez en ligne votre barbier, coiffeur ou institut de beauté partout en Algérie. Choisissez votre espace : hommes ou femmes."
        path="/"
      />

      <header style={{
        display: 'flex', justifyContent: 'center', padding: '28px 20px 8px',
      }}>
        <img src="/images/logo-salon-dz.svg" alt="Salon DZ" style={{ height: 44, maxWidth: '70vw' }} />
      </header>

      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '24px 20px 40px',
      }}>
        <h1 style={{
          fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 500, letterSpacing: -0.8,
          margin: '0 0 10px', textAlign: 'center',
        }}>
          {"Réservez votre salon, partout en Algérie"}
        </h1>
        <p style={{
          fontSize: 15.5, color: MUTED, margin: '0 0 36px', textAlign: 'center',
          maxWidth: 520, lineHeight: 1.6,
        }}>
          {"Barbiers, coiffeurs et instituts de beauté près de chez vous — Alger, Oran, Constantine et dans toutes les wilayas. Choisissez votre espace pour commencer."}
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
          gap: 18, width: '100%', maxWidth: 760,
        }}>
          <SegmentCard
            accent={GREEN}
            soft="#f0fdf4"
            icon={<ScissorsIcon color={GREEN} />}
            kicker="Espace hommes"
            title="Barbier & coiffure"
            desc={"Coupe, dégradé, barbe, soins : les meilleurs barbershops et coiffeurs pour hommes, avec réservation en ligne 24/7."}
            cta="Voir les salons hommes"
            onClick={() => choose('homme')}
          />
          <SegmentCard
            accent={ROSE}
            soft="#fdf2f8"
            icon={<LashIcon color={ROSE} />}
            kicker="Espace femmes"
            title="Coiffure, cils & beauté"
            desc={"Coiffure, coloration, extensions de cils, onglerie, soins et maquillage : les salons et instituts pensés pour vous."}
            cta="Voir les salons femmes"
            onClick={() => choose('femme')}
          />
        </div>
      </main>

      <footer style={{
        padding: '18px 20px 30px', textAlign: 'center',
        borderTop: `1px solid ${BORDER}`, background: '#fff',
      }}>
        <span style={{ fontSize: 13.5, color: MUTED }}>
          {"Vous êtes un professionnel ? "}
          <Link to="/pro" style={{ color: GREEN, fontWeight: 500, textDecoration: 'none' }}>
            {"Découvrez Salon DZ Pro"}
          </Link>
        </span>
      </footer>
    </div>
  );
}
