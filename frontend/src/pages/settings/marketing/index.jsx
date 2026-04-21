import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import OptInBanner from './OptInBanner';
import TabFidelite from './fidelite/TabFidelite';
import TabPromo from './promotions/TabPromo';
import TabSMS from './solde/TabSMS';
import TabMarketingIA from './ia/TabMarketingIA';

export default function TabMarketing({ theme, showToast }) {
  const t = theme;
  const navigate = useNavigate();
  const location = useLocation();

  const MTABS = [
    { id: 'fidelite',   label: 'Fidelite'   },
    { id: 'promotions', label: 'Promos'     },
    { id: 'solde',      label: 'Solde'      },
    { id: 'ia',         label: 'IA'         },
  ];

  const parts = location.pathname.replace(/^\/settings\/marketing\/?/, '').split('/').filter(Boolean);
  const rawSub = parts[0] || 'ia';
  const LEGACY_TO_FIDELITE = ['anniversaire', 'parrainage'];
  const marketingTab = LEGACY_TO_FIDELITE.includes(rawSub)
    ? 'fidelite'
    : (MTABS.some(t => t.id === rawSub) ? rawSub : 'ia');

  useEffect(() => {
    if (LEGACY_TO_FIDELITE.includes(rawSub)) {
      navigate('/settings/marketing/fidelite', { replace: true });
    }
  }, [rawSub]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMarketingTab = (id) => {
    navigate('/settings/marketing/' + id, { replace: false });
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <OptInBanner theme={theme} showToast={showToast}/>
      <div style={{ display:'flex', gap:4, padding:3, borderRadius:8,
                    background:t.cardAlt, marginBottom:6 }}>
        {MTABS.map(({ id, label }) => {
          const active = marketingTab === id;
          return (
            <button key={id} onClick={() => setMarketingTab(id)}
                    style={{ flex:1, padding:'8px 12px', borderRadius:6, border:'none',
                             fontWeight: active ? 500 : 400, fontSize:13,
                             cursor:'pointer',
                             background: active ? t.card : 'transparent',
                             color: active ? t.text : t.muted,
                             transition:'all 0.15s', whiteSpace:'nowrap',
                             fontFamily:'inherit' }}>
              {label}
            </button>
          );
        })}
      </div>

      {marketingTab === 'fidelite'   && <TabFidelite theme={theme} showToast={showToast}/>}
      {marketingTab === 'promotions' && <TabPromo theme={theme} showToast={showToast}/>}
      {marketingTab === 'solde'      && <TabSMS showToast={showToast} theme={theme}/>}
      {marketingTab === 'ia'         && <TabMarketingIA theme={theme} showToast={showToast}
                                                        onGoToSolde={() => navigate('/settings/marketing/solde')}/>}
    </div>
  );
}
