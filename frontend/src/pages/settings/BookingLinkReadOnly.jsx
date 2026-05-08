// BookingLinkReadOnly.jsx — affichage en lecture seule du lien public de
// réservation (slug = nom-ville-codepostal). Visible dans Réglages > Mon
// commerce > Informations.
//
// Pourquoi read-only ici : le lien se modifie UNIQUEMENT depuis Réglages >
// Réservation en ligne > Configuration (BookingSlugCard editable). Cette
// carte sert juste à le copier en 1 clic depuis la fiche commerce.
//
// La partie ville-CP du slug suit automatiquement l'adresse du commerce
// (ville + code postal) éditée dans la carte MerchantInfoCard juste au-
// dessus. Pas de modification directe possible.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bookingApi } from '../../utils/api';
import { Button } from '../../components/primitives';
import { getBookingUrl } from '../../utils/publicUrl';

export default function BookingLinkReadOnly({ theme, showToast }) {
  const t = theme;
  const [open,    setOpen]    = useState(false);
  const [info,    setInfo]    = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await bookingApi.getSlugInfo();
      setInfo(r);
    } catch { /* silent — backend peut renvoyer 404 si pas de booking_settings */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const url = info?.slug ? getBookingUrl(info.slug) : '';
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast && showToast('Lien copié dans le presse-papiers');
    } catch {
      showToast && showToast('Sélectionnez le lien et copiez-le manuellement', 'error');
    }
  };

  if (loading) return null;
  if (!info)   return null;

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden',
                  background: t.card, border: `0.5px solid ${t.border}` }}>
      <button type="button" onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                       padding: '12px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                       background: t.cardAlt, fontFamily: 'inherit' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: '#eff6ff', color: '#1e40af',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round"
               style={{ width: 15, height: 15 }}>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.text }}>
            Lien de réservation publique
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: t.muted,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {url}
          </p>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round"
             style={{ width: 14, height: 14, flexShrink: 0,
                      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{ borderTop: `0.5px solid ${t.separator}`, padding: 18,
                      display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: t.muted, lineHeight: 1.55 }}>
            Format <strong>nom-ville-codepostal</strong>. La partie ville et code
            postal suit l&apos;adresse du commerce ci-dessus — pour la changer,
            modifiez l&apos;adresse dans la carte <em>Informations du commerce</em>.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 12px', borderRadius: 8,
                        background: t.cardAlt, border: `0.5px solid ${t.border}` }}>
            <code style={{ flex: 1, minWidth: 0,
                           fontSize: 12, color: t.text, wordBreak: 'break-all',
                           fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {url}
            </code>
            <Button variant="secondary" size="small" type="button" onClick={copy}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round"
                   style={{ width: 12, height: 12, marginRight: 5 }}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copier
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 11, color: t.muted }}>
              Pour modifier la partie nom du lien :
            </p>
            <Link to="/reglages/reservations/configuration" style={{
              fontSize: 12, fontWeight: 500, color: '#2563eb',
              textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              Réservation en ligne &gt; Configuration
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round"
                   style={{ width: 12, height: 12 }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
