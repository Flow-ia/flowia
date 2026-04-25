// Carte QR — inscription rapide client en boutique (audit R / session 29).
// Lit le slug du marchand via bookingApi.getSettings(), construit l'URL
// courte /j/<slug>, rend un QR (canvas via lib qrcode), et propose :
//   - télécharger PNG (pour impression / affichage vitrine)
//   - copier le lien (pour partage SMS / email / WhatsApp)
//
// Usage : <QRCard theme={theme} showToast={showToast} /> — rend rien si
// le booking n'est pas activé (slug absent).
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { bookingApi } from '../../utils/api';
import { shortJoinUrl } from '../../utils/publicUrl';

export default function QRCard({ theme, showToast }) {
  const canvasRef = useRef(null);
  const [slug,    setSlug]    = useState('');
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState(false);

  // URL partageable : shortJoinUrl résout via VITE_PUBLIC_BOOKING_ORIGIN si
  // dispo (QR plus court = plus dense = scan plus fiable de loin), sinon
  // strip du sous-domaine admin `commercant.` → le QR renvoie sur le domaine
  // public, jamais sur le dashboard. Cf. utils/publicUrl.js pour la résolution.
  const joinUrl = shortJoinUrl(slug);

  useEffect(() => {
    let cancelled = false;
    bookingApi.getSettings()
      .then(r => { if (!cancelled) setSlug(r?.settings?.slug || ''); })
      .catch(()  => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Dessine le QR sur le canvas chaque fois que l'URL change
  useEffect(() => {
    if (!joinUrl || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, joinUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).catch(() => { showToast && showToast('Erreur génération QR', 'error'); });
  }, [joinUrl, showToast]);

  const downloadPng = () => {
    if (!canvasRef.current) return;
    // Regénère en haute résolution (512px) pour l'impression
    QRCode.toDataURL(joinUrl, { width: 512, margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).then(url => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-inscription-${slug}.png`;
      a.click();
    }).catch(() => showToast && showToast('Erreur téléchargement', 'error'));
  };

  const copyLink = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { showToast && showToast('Copie impossible', 'error'); }
  };

  // Tant que les settings chargent : placeholder discret
  if (loading) {
    return (
      <div style={{ padding:16, borderRadius:14, background:theme.card,
        border:`1px solid ${theme.border}`, marginBottom:14,
        display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:18, height:18, borderRadius:99,
          border:'2px solid rgba(0,0,0,0.15)', borderTopColor:theme.text,
          animation:'spin .8s linear infinite' }} />
        <span style={{ fontSize:12, color:theme.muted }}>Chargement QR…</span>
      </div>
    );
  }

  // Booking non activé : message explicatif + lien vers la config.
  if (!slug) {
    return (
      <div style={{ padding:16, borderRadius:14, background:theme.card,
        border:`1px solid ${theme.border}`, marginBottom:14 }}>
        <p style={{ margin:'0 0 6px', fontSize:13, fontWeight:800, color:theme.text }}>
          📱 QR inscription rapide
        </p>
        <p style={{ margin:0, fontSize:12, color:theme.muted, lineHeight:1.5 }}>
          Active d'abord le site de réservation (onglet « Catégories » → « Config site »)
          pour obtenir ton lien d'inscription rapide.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding:18, borderRadius:14, background:theme.card,
      border:`1px solid ${theme.border}`, marginBottom:14 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', gap:4,
        justifyContent:'space-between', marginBottom:10 }}>
        <div>
          <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:800, color:theme.text }}>
            📱 QR inscription rapide
          </p>
          <p style={{ margin:0, fontSize:11, color:theme.muted, lineHeight:1.5 }}>
            Affiche-le en vitrine ou au comptoir. Un client le scanne → fiche créée
            en 10&nbsp;s → tu peux encaisser tout de suite.
          </p>
        </div>
      </div>

      <div style={{ display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
        {/* Canvas QR */}
        <div style={{ padding:10, background:'#fff', borderRadius:10,
          border:`1px solid ${theme.border}`, flexShrink:0 }}>
          <canvas ref={canvasRef} style={{ display:'block' }} />
        </div>

        {/* Actions + URL */}
        <div style={{ flex:'1 1 200px', minWidth:200,
          display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ padding:'8px 10px', borderRadius:8,
            background:theme.inputBg, border:`1px solid ${theme.inputBorder}`,
            fontSize:11, fontFamily:'monospace', color:theme.text,
            wordBreak:'break-all' }}>
            {joinUrl}
          </div>
          <button type="button" onClick={downloadPng}
            style={{ padding:'10px 14px', borderRadius:10, border:'none',
              background:theme.accent, color:theme.accentText,
              fontWeight:700, fontSize:13, cursor:'pointer' }}>
            ⬇ Télécharger (PNG)
          </button>
          <button type="button" onClick={copyLink}
            style={{ padding:'10px 14px', borderRadius:10,
              background:'transparent', border:`1px solid ${theme.border}`,
              color:theme.text, fontWeight:700, fontSize:13, cursor:'pointer' }}>
            {copied ? '✓ Copié' : '🔗 Copier le lien'}
          </button>
        </div>
      </div>
    </div>
  );
}
