import { useState, useEffect } from 'react';
import { Confirm } from '../../../components/UI';
import { marketingApi } from '../../../utils/api';
import { Button } from '../../../components/primitives';

// Banniere opt-in RGPD : affiche la proportion de clients opt-in et permet
// d'envoyer un email transactionnel d'invitation aux clients pending.
export default function OptInBanner({ theme, showToast }) {
  const t = theme;
  const [stats, setStats]     = useState(null);
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
      showToast && showToast(
        `${r.sent} email${r.sent > 1 ? 's' : ''} d'invitation envoye${r.sent > 1 ? 's' : ''}.`,
        'success'
      );
      load();
    } catch (e) {
      showToast && showToast('Erreur — reessayez.', 'error');
    } finally { setSending(false); }
  };

  const low = opt_in_rate < 30;
  const bg     = low ? '#fffbeb' : '#f0fdf4';
  const color  = low ? '#92400e' : '#065f46';

  return (
    <>
      <div style={{ padding:'12px 16px', borderRadius:12, background:bg, marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 260px', minWidth:0 }}>
            <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:500, color }}>
              Audience marketing (opt-in RGPD)
            </p>
            <p style={{ margin:0, fontSize:12, color, opacity:0.85, lineHeight:1.5 }}>
              <strong style={{ fontWeight:500, fontSize:13 }}>{opted_in}/{total}</strong> clients
              {' '}({opt_in_rate}%) acceptent vos offres. Seuls ces clients recoivent vos
              campagnes (conformite CNIL).
              {invitable > 0 && ` ${invitable} client${invitable > 1 ? 's' : ''} a inviter.`}
            </p>
          </div>
          {invitable > 0 && (
            <Button variant="secondary" size="small" type="button"
                    onClick={() => setShowConfirm(true)} disabled={sending}>
              {sending ? 'Envoi…' : `Inviter ${invitable} client${invitable > 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      </div>
      <Confirm
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleInvite}
        title="Envoyer une invitation aux offres ?"
        message={`Un email transactionnel sera envoye a ${invitable} client${invitable > 1 ? 's' : ''} qui n'ont pas encore donne leur consentement marketing. Un seul envoi par client (anti-spam).`}
        danger={false}
        theme={theme}/>
    </>
  );
}
