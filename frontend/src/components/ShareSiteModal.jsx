// ShareSiteModal.jsx — modale "Partager mon site" (sidebar admin commerçant).
//
// Affiche le lien public de réservation et propose 5 actions :
//   - Copier le lien (clipboard)
//   - WhatsApp (wa.me deep-link, ouvre l'app si installée)
//   - Facebook  (sharer.php — partage classique sur le mur ou Messenger)
//   - SMS       (sms: deep-link, ouvre l'app SMS native du téléphone)
//   - Instagram (pas d'API publique de partage URL — on copie le lien et on
//                indique au commerçant de le coller dans sa bio / story)
//
// Le lien est récupéré via bookingApi.getSlugInfo() puis getBookingUrl(slug).
import { useEffect, useState } from 'react';
import { Modal, Toast, useToast } from './UI';
import { bookingApi } from '../utils/api';
import { getBookingUrl } from '../utils/publicUrl';

// Brand SVG paths (24x24 viewBox). Ne pas utiliser de gradient (FDS-2026).
const BRAND_ICONS = {
  whatsapp: (
    <path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.464 3.488"/>
  ),
  facebook: (
    <path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073"/>
  ),
  instagram: (
    <path fill="currentColor" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069M12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0m0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8m6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881"/>
  ),
  tiktok: (
    <path fill="currentColor" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1z"/>
  ),
  sms: (
    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
};

function BrandIcon({ name, size = 18, color }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ color, flexShrink: 0 }}>
      {BRAND_ICONS[name]}
    </svg>
  );
}

// Construit un texte court à pré-remplir dans WhatsApp / SMS.
function buildShareMessage(businessName, url) {
  const name = (businessName || 'notre salon').trim();
  return `Réservez en ligne chez ${name} : ${url}`;
}

export default function ShareSiteModal({ open, onClose, theme, businessName }) {
  const t = theme;
  const [toast, showToast] = useToast();
  const [slug, setSlug]    = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr]      = useState('');

  // Charge le slug à chaque ouverture (au cas où l'admin l'a modifié entre-temps
  // depuis Réglages > Mon commerce > Lien de réservation).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setErr('');
    bookingApi.getSlugInfo()
      .then(r => { if (!cancelled) setSlug(r?.slug || ''); })
      .catch(() => { if (!cancelled) setErr('Impossible de charger votre lien public.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const url = slug ? getBookingUrl(slug) : '';
  const msg = buildShareMessage(businessName, url);

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Lien copié dans le presse-papiers', 'ok');
    } catch {
      // Fallback : sélectionne le texte affiché si clipboard API indisponible.
      showToast('Sélectionnez le lien et copiez-le manuellement', 'info');
    }
  };

  // Ouvre une nouvelle fenêtre/onglet — sur mobile les schemes whatsapp:// et
  // sms: ouvrent directement l'app native.
  const openShare = (href) => {
    try {
      window.open(href, '_blank', 'noopener,noreferrer');
    } catch {
      // Silencieux — bloqué par le navigateur (popup blocker).
    }
  };

  const shareWhatsApp = () => {
    if (!url) return;
    openShare(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  };
  const shareFacebook = () => {
    if (!url) return;
    openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
  };
  const shareSMS = () => {
    if (!url) return;
    // sms:?body= fonctionne sur iOS/Android (pas de destinataire pré-rempli :
    // l'utilisateur choisira). Sur desktop : pas d'app SMS, on tombe sur la
    // copie du lien.
    if (navigator.userAgent && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      openShare(`sms:?&body=${encodeURIComponent(msg)}`);
    } else {
      copyLink();
      showToast('Pas d\'app SMS sur cet appareil — lien copié', 'info');
    }
  };
  const shareInstagram = async () => {
    if (!url) return;
    // Instagram n'expose pas d'API publique de partage URL (web). La
    // pratique standard est de copier le lien puis de le coller dans la
    // bio, story (sticker lien) ou DM.
    try {
      await navigator.clipboard.writeText(url);
      showToast('Lien copié — collez-le dans votre bio ou story Instagram', 'ok');
    } catch {
      showToast('Copiez le lien manuellement pour le coller dans Instagram', 'info');
    }
  };

  // Web Share API (mobile natif : ouvre la feuille de partage système avec
  // tous les contacts/apps disponibles). Bouton primaire si supporté.
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const nativeShare = async () => {
    if (!url) return;
    try {
      await navigator.share({
        title: businessName ? `Réserver chez ${businessName}` : 'Réservation en ligne',
        text: msg,
        url,
      });
    } catch {
      // L'utilisateur a annulé — silencieux.
    }
  };

  const channels = [
    { key: 'whatsapp',  label: 'WhatsApp',   color: '#25D366', onClick: shareWhatsApp  },
    { key: 'facebook',  label: 'Facebook',   color: '#1877F2', onClick: shareFacebook  },
    { key: 'instagram', label: 'Instagram',  color: '#E4405F', onClick: shareInstagram },
    { key: 'sms',       label: 'SMS',        color: '#0EA5E9', onClick: shareSMS       },
  ];

  return (
    <>
      <Modal open={open} onClose={onClose} title="Partager mon site" theme={t} maxW={460}>
        <p style={{ fontSize: 13, color: t?.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
          Diffusez votre lien de réservation auprès de vos clients sur les
          réseaux sociaux ou par message.
        </p>

        {/* Aperçu du lien public */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px', borderRadius: 10, marginBottom: 14,
                      background: t?.cardAlt, border: `0.5px solid ${t?.border}` }}>
          <span style={{ flex: 1, fontSize: 12, color: t?.text,
                         fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                         overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {loading ? 'Chargement…' : (err ? err : (url || 'Lien indisponible'))}
          </span>
          <button onClick={copyLink} disabled={!url || loading}
                  title="Copier le lien"
                  style={{ display: 'flex', alignItems: 'center', gap: 6,
                           padding: '6px 10px', borderRadius: 8, cursor: url ? 'pointer' : 'not-allowed',
                           background: t?.elevated, color: t?.text,
                           border: `0.5px solid ${t?.border}`, fontFamily: 'inherit',
                           fontSize: 12, fontWeight: 500, opacity: url ? 1 : 0.6 }}>
            <BrandIcon name="copy" size={13}/>
            Copier
          </button>
        </div>

        {/* Bouton natif système (mobile uniquement) */}
        {canNativeShare && (
          <button onClick={nativeShare} disabled={!url || loading}
                  style={{ width: '100%', display: 'flex', alignItems: 'center',
                           justifyContent: 'center', gap: 8,
                           padding: '12px', borderRadius: 10, marginBottom: 12,
                           background: t?.text, color: t?.bg,
                           border: 'none', cursor: url ? 'pointer' : 'not-allowed',
                           fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
                           opacity: url ? 1 : 0.5 }}>
            Partager via mon appareil
          </button>
        )}

        {/* Boutons par réseau social */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {channels.map(c => (
            <button key={c.key} onClick={c.onClick} disabled={!url || loading}
                    style={{ display: 'flex', alignItems: 'center', gap: 10,
                             padding: '12px 14px', borderRadius: 10,
                             background: t?.cardAlt, color: t?.text,
                             border: `0.5px solid ${t?.border}`,
                             cursor: url ? 'pointer' : 'not-allowed',
                             fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                             textAlign: 'left', opacity: url ? 1 : 0.5,
                             transition: 'background 0.15s ease' }}
                    onMouseEnter={e => { if (url) e.currentTarget.style.background = t?.card; }}
                    onMouseLeave={e => { if (url) e.currentTarget.style.background = t?.cardAlt; }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                             display: 'flex', alignItems: 'center', justifyContent: 'center',
                             background: `${c.color}15`, color: c.color }}>
                <BrandIcon name={c.key} size={18} color={c.color}/>
              </span>
              <span style={{ flex: 1 }}>{c.label}</span>
            </button>
          ))}
        </div>
      </Modal>
      <Toast msg={toast?.msg} type={toast?.type}/>
    </>
  );
}
