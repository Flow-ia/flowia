import { Link } from 'react-router-dom';
import { useTheme } from '../../../hooks/useTheme';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

export default function Footer() {
  const { theme: t } = useTheme();
  const year = new Date().getFullYear();

  const colTitle = {
    fontSize: 12, fontWeight: 500, color: t.muted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 14,
  };
  const colLink = {
    fontSize: 14, color: t.textSub, textDecoration: 'none',
    display: 'block', padding: '6px 0',
    transition: 'color 0.15s ease',
  };

  const cols = [
    {
      title: 'Produit',
      links: [
        { to: '/fonctionnalites', label: 'Fonctionnalités' },
        { to: '/tarifs',          label: 'Tarifs' },
        { to: '/pour-qui',        label: 'Pour qui' },
        { href: COMMERCANT_URL,   label: 'Connexion pro', external: true },
      ],
    },
    {
      title: 'Métiers',
      links: [
        { to: '/pour-qui#coiffeur',     label: 'Coiffeur' },
        { to: '/pour-qui#barbier',      label: 'Barbier' },
        { to: '/pour-qui#manucure',     label: 'Manucure' },
        { to: '/pour-qui#esthetique',   label: 'Esthétique' },
        { to: '/pour-qui#spa',          label: 'Spa & bien-être' },
      ],
    },
    {
      title: 'Ressources',
      links: [
        { to: '/contact',         label: 'Contact' },
        { to: '/a-propos',        label: 'À propos' },
        { to: '/portail-client',  label: 'Espace client' },
      ],
    },
    {
      title: 'Légal',
      links: [
        { to: '/mentions-legales', label: 'Mentions légales' },
        { to: '/confidentialite',  label: 'Confidentialité' },
        { to: '/cgu',              label: 'CGU' },
      ],
    },
  ];

  return (
    <footer style={{
      borderTop: `0.5px solid ${t.border}`,
      background: t.cardAlt,
      padding: '40px 24px 24px',
      marginTop: 56,
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 32, marginBottom: 32,
        }}>
          <div style={{ minWidth: 200 }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 14 }}>
              <img src="/images/logo-app.svg" alt="FlowIA" style={{ width: 28, height: 28 }} />
              <span style={{ fontSize: 18, fontWeight: 500, color: t.text, letterSpacing: -0.2 }}>FlowIA</span>
            </Link>
            <p style={{ fontSize: 13, color: t.muted, lineHeight: 1.6, margin: 0 }}>
              {"Le logiciel tout-en-un qui simplifie la gestion des salons de beauté et de bien-être."}
            </p>
            <p style={{ fontSize: 13, color: t.muted, marginTop: 14, marginBottom: 0 }}>
              <a href="mailto:contact@flowiapro.com" style={{ color: t.textSub, textDecoration: 'none' }}>
                contact@flowiapro.com
              </a>
            </p>
          </div>

          {cols.map(col => (
            <div key={col.title}>
              <p style={colTitle}>{col.title}</p>
              {col.links.map(l => l.external ? (
                <a key={l.label} href={l.href} style={colLink}
                  onMouseEnter={(e) => { e.currentTarget.style.color = t.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = t.textSub; }}>
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} to={l.to} style={colLink}
                  onMouseEnter={(e) => { e.currentTarget.style.color = t.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = t.textSub; }}>
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div style={{
          paddingTop: 24, borderTop: `0.5px solid ${t.border}`,
          display: 'flex', flexWrap: 'wrap', gap: 16,
          justifyContent: 'space-between', alignItems: 'center',
        }}>
          <p style={{ fontSize: 12, color: t.muted, margin: 0 }}>
            © {year} FlowIA — Tous droits réservés.
          </p>
          <p style={{ fontSize: 12, color: t.muted, margin: 0 }}>
            {"Conçu en France · Hébergement européen · RGPD"}
          </p>
        </div>
      </div>
    </footer>
  );
}
