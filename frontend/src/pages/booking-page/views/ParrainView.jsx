// src/pages/booking-page/views/ParrainView.jsx
// Vue : Page parrainage (programme filleul + historique).

import { NavBar } from '../../booking/NavBar';
import { ReferralPage } from '../../booking/ReferralPage';
import { pubApi, globalClientApi } from '../../../utils/api';

export function ParrainView({
  th, slug, base, business, clientUser, refProgram,
  refMyCode, refMyHistory, refMyRewards,
  postRegOverlay, toggleTheme, setShowAuthPanel, navigate, setView,
  setMyApptsInitTab, setClientUser, setCN, setCE, setCP, handleAuth,
}) {
  // NavBar masquée sous /marketplace/* : MarketplaceBookingShell fournit
  // déjà son header dédié.
  const inMarketplace = String(base || '').startsWith('/marketplace/');
  return (
    <><div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      {!inMarketplace && (
        <NavBar th={th} slug={slug} business={business} clientUser={clientUser} refProgram={refProgram}
          onToggleTheme={toggleTheme} onShowAuth={()=>{ setShowAuthPanel(true); navigate(`${base}/login`, {replace:false}); }}
          onMyAppts={()=>{navigate(`${base}/client/rdv`,{replace:false}); setView('myAppts'); setMyApptsInitTab('appts');}}
          onLogout={()=>{ pubApi.logout(slug).catch(()=>{}); globalClientApi.logout().catch(()=>{}); localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_gc_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); setView('booking'); navigate(`${base}`,{replace:false}); }}
          onReferralPage={() => { /* déjà sur la page */ }}
          onNavigateHome={(id)=>{ setView('booking'); navigate(`${base}`,{replace:false}); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },200); }} />
      )}
      <ReferralPage
        th={th} slug={slug} business={business} refProgram={refProgram}
        gcConnected={!!clientUser}
        gcUser={clientUser}
        refMyCode={refMyCode}
        refMyHistory={refMyHistory}
        refMyRewards={refMyRewards}
        onLogin={() => { setShowAuthPanel(true); navigate(`${base}/login`, {replace:false}); setView('booking'); }}
        onRegister={() => { setShowAuthPanel(true); navigate(`${base}/register`, {replace:false}); setView('booking'); }}
        onAuthSuccess={(client, meta) => { handleAuth(client, meta); /* reste sur /parrain → useEffect recharge code+historique */ }}
        onBack={() => { setView('booking'); navigate(`${base}`, {replace:false}); }}
      />
    </div>{postRegOverlay}</>
  );
}
