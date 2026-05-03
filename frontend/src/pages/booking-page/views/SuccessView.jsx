// src/pages/booking-page/views/SuccessView.jsx
// Vue : Confirmation de réservation — icône succès, numéro, récap, actions.

import { NavBar } from '../../booking/NavBar';
import { pubApi, globalClientApi } from '../../../utils/api';

export function SuccessView({
  th, slug, business, clientUser, bookedAppt, selSvc, selEmp, selDate, selSlot,
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
        onMyAppts={()=>{navigate(`/book/${slug}/client/rdv`,{replace:false}); setView('myAppts'); setMyApptsInitTab('appts');}}
        onLogout={()=>{ pubApi.logout(slug).catch(()=>{}); globalClientApi.logout().catch(()=>{}); localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_gc_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); }}
        onNavigateHome={(id)=>{ resetBooking(); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },300); }} />

      <div style={{ maxWidth:440, margin:'0 auto', padding:'48px 24px 80px',
        display:'flex', flexDirection:'column', alignItems:'center' }}>

        {/* Icône succès */}
        <div style={{ width:72, height:72, borderRadius:20, background:th.ax.emerald,
          display:'flex', alignItems:'center', justifyContent:'center', marginBottom:24,
          boxShadow: th.shadowLg }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" style={{width:36,height:36}}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <h1 style={{ fontSize:26, fontWeight: 500, color:th.text, margin:'0 0 8px',
          letterSpacing:'-0.03em', textAlign:'center', lineHeight:1.15 }}>
          Réservation confirmée
        </h1>
        <p style={{ fontSize:14, color:th.muted, margin:'0 0 32px', textAlign:'center',
          lineHeight:1.5 }}>
          {clientEmail ? 'Un email de confirmation a été envoyé.' : 'Votre RDV est enregistré.'}
        </p>

        {/* Numéro de réservation */}
        <div style={{ width:'100%', background:th.cardAlt, border: `1px solid ${th.border}`,
          borderRadius:14, padding:'18px 20px', textAlign:'center', marginBottom:14,
          boxShadow: th.shadowSm }}>
          <p style={{ fontSize:11, fontWeight: 500,
            letterSpacing:1, textTransform:'uppercase', color:th.muted, margin:'0 0 6px' }}>
            Numéro de réservation
          </p>
          <p style={{ fontSize:24, fontWeight: 500, color:th.text,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            margin:0, letterSpacing:'-0.01em' }}>
            #{bookedAppt.id.substring(0,8).toUpperCase()}
          </p>
        </div>

        {/* Récap */}
        <div style={{ width:'100%', background:th.card, border: `1px solid ${th.border}`,
          borderRadius:14, overflow:'hidden', marginBottom:24, boxShadow: th.shadowSm }}>
          {[
            ['Service',  selSvc?.name],
            ['Employe',  selEmp?._anyEmployee ? 'Premier disponible' : selEmp?.name],
            ['Date',     selDate?.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})],
            ['Heure',    selSlot],
            ['Duree',    `${selSvc?.duration_minutes} min`],
            selSvc?.price && bookedAppt?.discount_amount > 0
              ? ['Prix', '__PROMO__']
              : (selSvc?.price != null && selSvc?.price !== ''
                ? ['Prix', `${Number(selSvc.price).toFixed(2)} €`]
                : null),
            ['Client',   clientName],
          ].filter(Boolean).map(([label, val], i) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between',
              alignItems:'center', padding:'12px 20px',
              borderTop: i===0 ? 'none' : `1px solid ${th.border}` }}>
              <span style={{ fontSize:13, color:th.muted }}>{label}</span>
              {val === '__PROMO__' ? (
                <span style={{ display:'flex', alignItems:'center', gap:8,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  <span style={{ fontSize:13, textDecoration:'line-through', color:th.dim }}>
                    {Number(selSvc.price).toFixed(2)} €
                  </span>
                  <span style={{ fontSize:13, fontWeight: 500, color:th.ax.emerald }}>
                    {(Number(selSvc.price||0) - Number(bookedAppt.discount_amount||0)).toFixed(2)} €
                  </span>
                </span>
              ) : (
                <span style={{ fontSize:13, fontWeight: 500, color:th.text,
                  fontFamily: (label==='Heure'||label==='Prix'||label==='Duree') ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit'
                }}>{val}</span>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:10 }}>
          {clientUser && (
            <button onClick={() => { navigate(`/book/${slug}/client/rdv`,{replace:false}); setView('myAppts'); setMyApptsInitTab('appts'); }}
              style={{ width:'100%', padding:'14px', borderRadius:10,
                border: `1px solid ${th.accent}`,
                background:th.accent, color:th.accentText, fontWeight: 500, fontSize:14,
                cursor:'pointer', fontFamily:'inherit',
                transition:'opacity 0.15s ease' }}
              onMouseEnter={e=>{ e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={e=>{ e.currentTarget.style.opacity = '1'; }}>
              Voir mes rendez-vous →
            </button>
          )}
          <button onClick={resetBooking}
            style={{ width:'100%', padding:'14px', borderRadius:10, cursor:'pointer',
              background:th.bg, border: `1px solid ${th.border}`,
              color:th.text, fontWeight: 500, fontSize:14, fontFamily:'inherit',
              transition:'background 0.15s ease, border-color 0.15s ease' }}
            onMouseEnter={e=>{ e.currentTarget.style.background = th.bgHover; e.currentTarget.style.borderColor = th.borderHv; }}
            onMouseLeave={e=>{ e.currentTarget.style.background = th.bg; e.currentTarget.style.borderColor = th.border; }}>
            Prendre un autre RDV
          </button>
        </div>
      </div>
    </div>{postRegOverlay}</>
  );
}
