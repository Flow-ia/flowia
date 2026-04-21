// src/pages/booking-page/views/ParrainView.jsx
// Vue : Page parrainage (programme filleul + historique).

import { NavBar } from '../../booking/NavBar';
import { ReferralPage } from '../../booking/ReferralPage';

export function ParrainView({
  th, slug, business, clientUser, refProgram,
  refMyCode, refMyHistory, refMyRewards,
  postRegOverlay, toggleTheme, setShowAuthPanel, navigate, setView,
  setMyApptsInitTab, setClientUser, setCN, setCE, setCP, handleAuth,
}) {
  return (
    <><div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      <NavBar th={th} slug={slug} business={business} clientUser={clientUser} refProgram={refProgram}
        onToggleTheme={toggleTheme} onShowAuth={()=>{ setShowAuthPanel(true); navigate(`/book/${slug}/login`, {replace:false}); }}
        onMyAppts={()=>{navigate(`/book/${slug}/client/rdv`,{replace:false}); setView('myAppts'); setMyApptsInitTab('appts');}}
        onLogout={()=>{ localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); setView('booking'); navigate(`/book/${slug}`,{replace:false}); }}
        onReferralPage={() => { /* déjà sur la page */ }}
        onNavigateHome={(id)=>{ setView('booking'); navigate(`/book/${slug}`,{replace:false}); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },200); }} />
      <ReferralPage
        th={th} slug={slug} business={business} refProgram={refProgram}
        gcConnected={!!clientUser}
        gcUser={clientUser}
        refMyCode={refMyCode}
        refMyHistory={refMyHistory}
        refMyRewards={refMyRewards}
        onLogin={() => { setShowAuthPanel(true); navigate(`/book/${slug}/login`, {replace:false}); setView('booking'); }}
        onRegister={() => { setShowAuthPanel(true); navigate(`/book/${slug}/register`, {replace:false}); setView('booking'); }}
        onAuthSuccess={(client, meta) => { handleAuth(client, meta); /* reste sur /parrain → useEffect recharge code+historique */ }}
        onBack={() => { setView('booking'); navigate(`/book/${slug}`, {replace:false}); }}
      />
    </div>{postRegOverlay}</>
  );
}
