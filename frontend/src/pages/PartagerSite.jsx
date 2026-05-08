// PartagerSite.jsx — page /partager. Accessible aux ADMINS et aux EMPLOYÉS
// (volontairement publique pour faciliter le travail terrain : un employé
// peut diffuser le lien à un client en boutique, ou imprimer/montrer le QR
// d'inscription rapide pour créer une fiche client en 10 s).
//
// Sections :
//   1. Diffusion réseaux sociaux : Copier / WhatsApp / Facebook / Instagram
//      / SMS / Web Share API natif si supporté.
//   2. QR inscription rapide client (composant QRCard partagé) : utilisable
//      en vitrine ou au comptoir, scan -> fiche client cree.
//
// Pourquoi une page et pas une modale : la modale rendue depuis la sidebar
// (DesktopSidebar avec position:sticky) restait piégée dans le stacking
// context de la sidebar et passait derrière le contenu principal sur
// certaines pages (ex /abonnement).
import { useEffect, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { Toast, useToast, Modal } from '../components/UI';
import { PageHeader } from './reglages/shared';
import { bookingApi } from '../utils/api';
import { getBookingUrl } from '../utils/publicUrl';
import QRCard from './settings/QRCard';

// Brand SVG paths (24x24 viewBox).
const BRAND = {
  whatsapp: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.464 3.488',
  facebook: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073',
  instagram: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069M12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0m0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8m6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881',
};

function BrandSvg({ name, size = 22, color }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}
         style={{ display: 'block', color, flexShrink: 0 }}>
      <path fill="currentColor" d={BRAND[name]}/>
    </svg>
  );
}
function SmsBubble({ size = 22, color = '#0EA5E9' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}
         fill="none" stroke={color} strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function CopyIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}
         fill="none" stroke={color} strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0 }}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function buildShareMessage(businessName, url) {
  const name = (businessName || 'notre salon').trim();
  return `Réservez en ligne chez ${name} : ${url}`;
}

export default function PartagerSite() {
  const { theme: t } = useTheme();
  const { user } = useAuth();
  const [toast, showToast] = useToast();
  const [slug, setSlug]    = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr]      = useState('');
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr('');
    bookingApi.getSlugInfo()
      .then(r => { if (!cancelled) setSlug(r?.slug || ''); })
      .catch(() => { if (!cancelled) setErr('Impossible de charger votre lien public.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const url = slug ? getBookingUrl(slug) : '';
  const businessName = user?.businessName || '';
  const msg = buildShareMessage(businessName, url);

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Lien copié dans le presse-papiers', 'ok');
    } catch {
      showToast('Sélectionnez le lien et copiez-le manuellement', 'info');
    }
  };
  const openShare = (href) => {
    try { window.open(href, '_blank', 'noopener,noreferrer'); } catch {}
  };
  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent || '');
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const shareWhatsApp = () => url && openShare(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  const shareFacebook = () => url && openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
  const shareSMS = () => {
    if (!url) return;
    if (isMobile) openShare(`sms:?&body=${encodeURIComponent(msg)}`);
    else { copyLink(); showToast('Pas d\'app SMS sur cet appareil — lien copié', 'info'); }
  };
  const shareInstagram = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Lien copié — collez-le dans votre bio ou story Instagram', 'ok');
    } catch {
      showToast('Copiez le lien manuellement pour le coller dans Instagram', 'info');
    }
  };
  const nativeShare = async () => {
    if (!url) return;
    try {
      await navigator.share({
        title: businessName ? `Réserver chez ${businessName}` : 'Réservation en ligne',
        text: msg, url,
      });
    } catch {}
  };

  const channels = [
    { key: 'whatsapp',  label: 'WhatsApp',   color: '#25D366', desc: 'Envoyer à un contact ou groupe', onClick: shareWhatsApp,
      icon: <BrandSvg name="whatsapp" color="#25D366"/> },
    { key: 'facebook',  label: 'Facebook',   color: '#1877F2', desc: 'Publier sur votre page ou un groupe', onClick: shareFacebook,
      icon: <BrandSvg name="facebook" color="#1877F2"/> },
    { key: 'instagram', label: 'Instagram',  color: '#E4405F', desc: 'Copier le lien pour bio ou story', onClick: shareInstagram,
      icon: <BrandSvg name="instagram" color="#E4405F"/> },
    { key: 'sms',       label: 'SMS',        color: '#0EA5E9', desc: isMobile ? 'Envoyer par message' : 'Disponible sur mobile uniquement', onClick: shareSMS,
      icon: <SmsBubble color="#0EA5E9"/> },
  ];

  return (
    <div style={{ minHeight: '100vh', background: t.bg, paddingBottom: 48 }}>
      <Toast msg={toast?.msg} type={toast?.type}/>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '18px 16px',
                    display: 'flex', flexDirection: 'column', gap: 18 }}>

        <PageHeader
          title="Partager mon site"
          subtitle="Diffusez votre lien de réservation sur les réseaux sociaux ou par message."
        />

        {/* Card lien public — affiche le lien, bouton copie principal */}
        <div style={{
          background: t.card, border: `0.5px solid ${t.border}`,
          borderRadius: 12, padding: 16,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: t.muted,
                        textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Votre lien de réservation
            </p>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px', borderRadius: 10,
            background: t.cardAlt, border: `0.5px solid ${t.border}`,
            flexWrap: 'wrap',
          }}>
            <span style={{ flex: 1, minWidth: 200,
                           fontSize: 13, color: t.text,
                           fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                           overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {loading ? 'Chargement…' : (err ? err : (url || 'Lien indisponible'))}
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={copyLink} disabled={!url || loading}
                      style={{ display: 'flex', alignItems: 'center', gap: 6,
                               padding: '8px 14px', borderRadius: 8,
                               cursor: url ? 'pointer' : 'not-allowed',
                               background: t.text, color: t.bg,
                               border: 'none', fontFamily: 'inherit',
                               fontSize: 13, fontWeight: 500, opacity: url ? 1 : 0.5 }}>
                <CopyIcon size={14} color={t.bg}/>
                Copier le lien
              </button>
              {/* Bouton QR : ouvre une modale qui affiche le QR d'inscription
                  rapide client. Acces immediat sans avoir a scroller jusqu'au
                  bas de la page. */}
              <button onClick={() => setQrOpen(true)} disabled={loading}
                      title="Afficher le QR d'inscription rapide"
                      style={{ display: 'flex', alignItems: 'center', gap: 6,
                               padding: '8px 14px', borderRadius: 8,
                               cursor: 'pointer',
                               background: t.cardAlt, color: t.text,
                               border: `0.5px solid ${t.borderStrong || t.border}`,
                               fontFamily: 'inherit',
                               fontSize: 13, fontWeight: 500 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round"
                     style={{ width: 14, height: 14, flexShrink: 0 }}>
                  <rect x="3" y="3" width="7" height="7"/>
                  <rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/>
                  <rect x="14" y="14" width="3" height="3"/>
                  <rect x="18" y="14" width="3" height="3"/>
                  <rect x="14" y="18" width="3" height="3"/>
                  <rect x="18" y="18" width="3" height="3"/>
                </svg>
                QR inscription
              </button>
            </div>
          </div>

          {canNativeShare && (
            <button onClick={nativeShare} disabled={!url || loading}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                             padding: '11px', borderRadius: 8,
                             background: t.cardAlt, color: t.text,
                             border: `0.5px solid ${t.border}`,
                             cursor: url ? 'pointer' : 'not-allowed',
                             fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
                             opacity: url ? 1 : 0.5 }}>
              Partager via mon appareil
            </button>
          )}
        </div>

        {/* Grille des canaux — boutons icone seule (logo centré, pas de
            texte). Le label complet est dans l'attribut title (tooltip
            navigateur) + aria-label pour l'accessibilite. */}
        <div>
          <p style={{ margin: '0 0 10px', fontSize: 11, color: t.muted,
                      textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Choisir un canal
          </p>
          <div style={{
            display: 'grid', gap: 10,
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 80px), 1fr))',
          }}>
            {channels.map(c => (
              <button key={c.key} onClick={c.onClick} disabled={!url || loading}
                      title={c.label}
                      aria-label={c.label}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                               aspectRatio: '1 / 1', padding: 0,
                               borderRadius: 14,
                               background: `${c.color}15`,
                               border: `0.5px solid ${c.color}33`,
                               cursor: url ? 'pointer' : 'not-allowed',
                               fontFamily: 'inherit',
                               opacity: url ? 1 : 0.5,
                               transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.15s ease' }}
                      onMouseEnter={e => { if (url) { e.currentTarget.style.background = `${c.color}25`; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                      onMouseLeave={e => { if (url) { e.currentTarget.style.background = `${c.color}15`; e.currentTarget.style.transform = 'translateY(0)'; } }}>
                {/* Le c.icon est rendu en taille `size=18` par defaut depuis
                    BrandSvg / SmsBubble. On le surdimensionne via wrapper
                    pour un visuel plus grand sans modifier le composant. */}
                <span style={{ display: 'inline-flex', transform: 'scale(1.7)',
                               color: c.color }}>
                  {c.icon}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* QR inscription rapide retire de la page : disponible uniquement
            via le bouton 'QR inscription' a cote de 'Copier le lien' qui
            ouvre une modale dediee. Evite le bruit visuel sur la page. */}

        {/* Conseils */}
        <div style={{
          background: t.cardAlt, border: `0.5px solid ${t.border}`,
          borderLeft: `2px solid #6366f1`,
          borderRadius: 10, padding: '12px 14px',
        }}>
          <p style={{ margin: 0, fontSize: 12, color: t.text, fontWeight: 500 }}>
            Conseils pour augmenter vos réservations
          </p>
          <ul style={{ margin: '8px 0 0', padding: '0 0 0 18px', color: t.muted,
                       fontSize: 12, lineHeight: 1.7 }}>
            <li>Ajoutez votre lien dans la bio Instagram et TikTok du salon.</li>
            <li>Épinglez-le en commentaire sur vos posts Facebook.</li>
            <li>Envoyez-le à vos clients fidèles par WhatsApp ou SMS lors d&apos;un changement de saison.</li>
            <li>Imprimez le QR code ci-dessus et affichez-le en vitrine ou au comptoir.</li>
          </ul>
        </div>
      </div>

      {/* Modale QR : ouverte par le bouton 'QR inscription' a cote de
          'Copier le lien'. Reutilise le composant QRCard partage qui gere
          deja canvas + telecharger PNG + copier lien court. */}
      <Modal open={qrOpen} onClose={() => setQrOpen(false)}
             title="QR d'inscription rapide" theme={t} maxW={520}>
        <p style={{ fontSize: 13, color: t.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
          Affichez ce QR code en vitrine ou au comptoir. Vos clients le
          scannent et leur fiche est créée en 10 secondes — vous pouvez
          encaisser ou prendre RDV immédiatement.
        </p>
        <QRCard theme={t} showToast={showToast}/>
      </Modal>
    </div>
  );
}
