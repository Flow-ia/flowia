import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import OptInBanner from './OptInBanner';
import TabFidelite from './fidelite/TabFidelite';
import TabPromo from './promotions/TabPromo';
import TabSMS from './solde/TabSMS';
import TabMarketingIA from './ia/TabMarketingIA';

export default function TabMarketing({ theme, showToast }) {
  const isDark   = theme.mode === 'dark';
  const navigate = useNavigate();
  const location = useLocation();

  const MTABS = [
    { id: 'fidelite',    label: '💎 Fidelite' },
    { id: 'promotions',  label: '% Promos' },
    { id: 'solde',       label: 'Solde' },
    { id: 'ia',          label: '✨ IA' },
  ];

  // Extrait le sous-onglet depuis l'URL : /settings/marketing/{sub}
  const parts = location.pathname.replace(/^\/settings\/marketing\/?/, '').split('/').filter(Boolean);
  const rawSub = parts[0] || 'ia';
  // Legacy : /anniversaire et /parrainage sont fusionnés dans /fidelite
  const LEGACY_TO_FIDELITE = ['anniversaire', 'parrainage'];
  const marketingTab = LEGACY_TO_FIDELITE.includes(rawSub)
    ? 'fidelite'
    : (MTABS.some(t => t.id === rawSub) ? rawSub : 'ia');

  // Redirection silencieuse vers /fidelite si URL legacy
  useEffect(() => {
    if (LEGACY_TO_FIDELITE.includes(rawSub)) {
      navigate('/settings/marketing/fidelite', { replace: true });
    }
  }, [rawSub]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMarketingTab = (id) => {
    navigate('/settings/marketing/' + id, { replace: false });
  };

  return (
    <div className="space-y-4">
      <OptInBanner theme={theme} showToast={showToast} />
      <div style={{ display:'flex', gap:6, marginBottom:20,
        background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', borderRadius:12, padding:4 }}>
        {MTABS.map(({ id, label }) => (
          <button key={id} onClick={() => setMarketingTab(id)}
            style={{ flex:1, padding:'9px 8px', borderRadius:9, border:'none', fontWeight:700, fontSize:12,
              cursor:'pointer', background: marketingTab === id ? theme.card : 'transparent',
              color: marketingTab === id ? theme.text : theme.muted,
              boxShadow: marketingTab === id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition:'all 0.15s', whiteSpace:'nowrap' }}>
            {label}
          </button>
        ))}
      </div>

      {marketingTab === 'fidelite'    && <TabFidelite theme={theme} showToast={showToast} />}
      {marketingTab === 'promotions'  && <TabPromo theme={theme} showToast={showToast} />}
      {marketingTab === 'solde'       && <TabSMS showToast={showToast} theme={theme} />}
      {marketingTab === 'ia'          && <TabMarketingIA theme={theme} showToast={showToast} onGoToSolde={() => navigate('/settings/marketing/solde')} />}
    </div>
  );
}
