// src/pages/booking-page/views/SuccessView.jsx
// Vue : Confirmation de réservation — icône succès, numéro, récap, actions.

import { NavBar } from '../../booking/NavBar';
import { pubApi, globalClientApi } from '../../../utils/api';

export function SuccessView({
  th, slug, base, business, clientUser, bookedAppt, selSvc, selEmp, selDate, selSlot,
  clientName, clientEmail, postRegOverlay, toggleTheme,
  setShowAuthPanel, navigate, setView, setMyApptsInitTab,
  setClientUser, setCN, setCE, setCP, resetBooking,
}) {
  return (
    <><div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      {/* Navbar persistante */}
      <NavBar th={th} slug={slug} business={business} clientUser={clientUser}
        onToggleTheme={toggleTheme} onShowAuth={()=>setShowAuthPanel(true)}
        onMyAppts={()=>{navigate(`${base}/client/rdv`,{replace:false}); setView('myAppts'); setMyApptsInitTab('appts');}}
        onLogout={()=>{ pubApi.logout(slug).catch(()=>{}); globalClientApi.logout().catch(()=>{}); localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_gc_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); }}
        onNavigateHome={(id)=>{ resetBooking(); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },300); }} />

      <div style={{ maxWidth:440, margin:'0 auto', padding:'28px 20px 40px',
        display:'flex', flexDirection:'column', alignItems:'stretch' }}>

        {/* Bloc principal compact : icone + titre + numero + recap dense */}
        <div style={{ background:th.card, border: `0.5px solid ${th.border}`,
          borderRadius:14, padding:'20px 20px 18px',
          display:'flex', flexDirection:'column', alignItems:'center', gap:0 }}>

          {/* Icone succes (taille reduite) */}
          <div style={{ width:44, height:44, borderRadius:12, background:'#22c55e',
            display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>

          <h1 style={{ fontSize:18, fontWeight: 500, color:th.text, margin:'0 0 4px',
            letterSpacing:'-0.02em', textAlign:'center' }}>
            {"Reservation confirmee"}
          </h1>
          <p style={{ fontSize:12, color:th.muted, margin:'0 0 14px', textAlign:'center' }}>
            {clientEmail ? "Email de confirmation envoye." : "Votre RDV est enregistre."}
          </p>

          {/* Numero + badge paiement (ligne compacte) */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
            justifyContent:'center', marginBottom:14 }}>
            <span style={{ fontSize:12, color:th.muted }}>{"N°"}</span>
            <span style={{ fontSize:13, fontWeight: 500, color:th.text,
              fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {`#${bookedAppt.id.substring(0,8).toUpperCase()}`}
            </span>
            {bookedAppt?.payment_status === 'paid' && bookedAppt?.paid_amount_cents > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 9px', borderRadius: 99,
                background: 'rgba(34,197,94,0.10)',
                border: '1px solid rgba(34,197,94,0.25)',
                fontSize: 11, fontWeight: 500, color: '#15803d',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {`Paye ${(bookedAppt.paid_amount_cents / 100).toFixed(2)} €`}
              </span>
            )}
          </div>

          {/* Recap dense — service en haut, ligne date/heure en bas */}
          <div style={{ width:'100%', borderTop:`0.5px solid ${th.border}`, paddingTop:14 }}>
            <p style={{ fontSize:14, fontWeight:500, color:th.text, margin:'0 0 2px',
              letterSpacing:'-0.01em', textAlign:'center' }}>
              {selSvc?.name}
            </p>
            <p style={{ fontSize:12, color:th.muted, margin:'0 0 10px', textAlign:'center' }}>
              {[
                selEmp?._anyEmployee ? 'Premier disponible' : selEmp?.name,
                `${selSvc?.duration_minutes} min`,
              ].filter(Boolean).join(' · ')}
            </p>
            <p style={{ fontSize:13, fontWeight:500, color:th.text, margin:0,
              textAlign:'center', letterSpacing:'-0.01em' }}>
              {selDate?.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}
              {' · '}
              {selSlot}
            </p>
            {selSvc?.price != null && selSvc?.price !== '' && Number(selSvc.price) > 0 && (
              <p style={{ fontSize:12, margin:'8px 0 0', textAlign:'center' }}>
                {bookedAppt?.discount_amount > 0 ? (
                  <>
                    <span style={{ textDecoration:'line-through', color:th.dim, marginRight:6 }}>
                      {`${Number(selSvc.price).toFixed(2)} €`}
                    </span>
                    <span style={{ fontWeight:500, color:'#16a34a' }}>
                      {`${(Number(selSvc.price||0) - Number(bookedAppt.discount_amount||0)).toFixed(2)} €`}
                    </span>
                  </>
                ) : (
                  <span style={{ fontWeight:500, color:th.text }}>
                    {`${Number(selSvc.price).toFixed(2)} €`}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:8, marginTop:14 }}>
          {clientUser && (
            <button onClick={() => { navigate(`${base}/client/rdv`,{replace:false}); setView('myAppts'); setMyApptsInitTab('appts'); }}
              style={{ width:'100%', padding:'13px', borderRadius:12, border:'none',
                background:th.accent, color:th.accentText, fontWeight: 500, fontSize:14,
                cursor:'pointer', letterSpacing:'-0.01em' }}>
              {"Voir mes rendez-vous"}
            </button>
          )}
          <button onClick={resetBooking}
            style={{ width:'100%', padding:'12px', borderRadius:12, cursor:'pointer',
              background:'transparent', border: `0.5px solid ${th.border}`,
              color:th.text, fontWeight: 500, fontSize:13, letterSpacing:'-0.01em' }}>
            {"Prendre un autre RDV"}
          </button>
        </div>
      </div>
    </div>{postRegOverlay}</>
  );
}
