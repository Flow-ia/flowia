// src/pages/booking-page/views/MyApptsView.jsx
// Vue : Mes RDV (+ profil + visites).

import { NavBar } from '../../booking/NavBar';
import { MyAppointments } from '../../booking/my-appointments';
import { pubApi, globalClientApi } from '../../../utils/api';

export function MyApptsView({
  th, slug, base, business, clientUser, refProgram,
  myApptsInitTab, myApptsInitVisitId, bookedAppt, location,
  postRegOverlay, toggleTheme, setShowAuthPanel, navigate, setView,
  setMyApptsInitTab, setClientUser, setCN, setCE, setCP, goToStep, resetBooking,
}) {
  return (
    <><div style={{ minHeight:'100vh', background:th.bg }}>
      <NavBar th={th} slug={slug} business={business} clientUser={clientUser} refProgram={refProgram}
        onToggleTheme={toggleTheme} onShowAuth={()=>setShowAuthPanel(true)}
        onMyAppts={()=>{navigate(`${base}/client/rdv`,{replace:false}); setMyApptsInitTab('appts');}}
        onLogout={()=>{ pubApi.logout(slug).catch(()=>{}); globalClientApi.logout().catch(()=>{}); localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_gc_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); setMyApptsInitTab('appts'); setView('booking'); }}
        onReferralPage={() => { setView('parrain'); navigate(`${base}/parrain`, {replace:false}); }}
        onNavigateHome={(id)=>{ setView('booking'); goToStep(1); navigate(`${base}`,{replace:false}); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },200); }} />
      <MyAppointments slug={slug} th={th} initialTab={myApptsInitTab} initialVisitId={myApptsInitVisitId} business={business}
        onBack={() => { setMyApptsInitTab('appts'); setView(bookedAppt ? 'success' : 'booking'); navigate(bookedAppt ? location.pathname : `${base}`, {replace:true}); }}
        onNewBooking={resetBooking}
        onLogout={() => {
          pubApi.logout(slug).catch(()=>{});
          globalClientApi.logout().catch(()=>{});
          localStorage.removeItem('ff_client_token');
          localStorage.removeItem('ff_gc_token');
          localStorage.removeItem('ff_client_info');
          setClientUser(null); setCN(''); setCE(''); setCP('');
          setMyApptsInitTab('appts');
          setView('booking');
        }} />
    </div>{postRegOverlay}</>
  );
}
