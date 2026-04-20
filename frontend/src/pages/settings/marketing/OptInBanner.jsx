import { useState, useEffect } from 'react';
import { Confirm } from '../../../components/UI';
import { marketingApi } from '../../../utils/api';

// Bannière opt-in RGPD (Audit Z4)
// Affiche la proportion de clients opt-in vs total + CTA pour envoyer un
// email transactionnel d'invitation aux clients pending. Filtre
// `marketing_opt_in=TRUE` appliqué SQL-level côté backend.
export default function OptInBanner({ theme, showToast }) {
  const [stats, setStats]   = useState(null);
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const load = () => {
    marketingApi.getOptInStats()
      .then(setStats)
      .catch(() => setStats(null));
  };
  useEffect(() => { load(); }, []);

  if (!stats) return null;

  const { total, opted_in, invitable, opt_in_rate } = stats;

  if (total === 0) return null;
  if (invitable === 0 && opt_in_rate >= 95) return null;

  const handleInvite = async () => {
    setShowConfirm(false);
    setSending(true);
    try {
      const r = await marketingApi.sendOptInInvite();
      showToast && showToast(`${r.sent} email${r.sent > 1 ? 's' : ''} d'invitation envoyé${r.sent > 1 ? 's' : ''}.`, 'success');
      load();
    } catch (e) {
      showToast && showToast('Erreur — réessayez.', 'error');
    } finally { setSending(false); }
  };

  const bg = opt_in_rate < 30
    ? 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(234,179,8,0.05))'
    : 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(34,197,94,0.05))';
  const border = opt_in_rate < 30 ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.25)';
  const color  = opt_in_rate < 30 ? '#d97706' : '#059669';

  return (
    <>
      <div style={{ padding:'14px 16px', borderRadius:12, background:bg,
        border:`1px solid ${border}`, marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 260px', minWidth:0 }}>
            <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:800, color:theme.text }}>
              📬 Audience marketing (opt-in RGPD)
            </p>
            <p style={{ margin:0, fontSize:12, color:theme.muted, lineHeight:1.5 }}>
              <strong style={{ color, fontSize:13 }}>{opted_in}/{total}</strong> clients
              ({opt_in_rate}%) acceptent vos offres. Seuls ces clients reçoivent vos
              campagnes (conformité CNIL).
              {invitable > 0 && ` ${invitable} client${invitable > 1 ? 's' : ''} à inviter.`}
            </p>
          </div>
          {invitable > 0 && (
            <button type="button" onClick={() => setShowConfirm(true)}
              disabled={sending}
              style={{ padding:'9px 14px', borderRadius:10, border:'none', background:color,
                color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer',
                opacity: sending ? 0.5 : 1, flexShrink:0 }}>
              {sending ? 'Envoi…' : `Inviter ${invitable} client${invitable > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
      <Confirm
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleInvite}
        title="Envoyer une invitation aux offres ?"
        message={`Un email transactionnel sera envoyé à ${invitable} client${invitable > 1 ? 's' : ''} qui n'ont pas encore donné leur consentement marketing. Un seul envoi par client (anti-spam).`}
        danger={false}
        theme={theme}
      />
    </>
  );
}
