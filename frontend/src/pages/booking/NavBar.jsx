// src/pages/booking/NavBar.jsx
// NavBar persistante — affichée sur toutes les vues du site de réservation.
// Desktop : liens horizontaux classiques. Mobile : 3 liens rapides visibles
// (Prestations / Équipe / Adresse) + bouton hamburger ouvrant un drawer
// glissant depuis la droite (contient tous les liens + auth + thème + tel).
import { useState, useEffect } from 'react';
import { mediaUrl } from './shared';

export function NavBar({ th, slug, business, clientUser, refProgram, onToggleTheme, onShowAuth, onMyAppts, onLogout, onNavigateHome, onReferralPage }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  // Fermer avec Esc + bloquer le scroll body tant que le drawer est ouvert.
  // Au cleanup on remet toujours overflow='' pour garantir que le scroll reste
  // disponible même si la NavBar est démontée pendant que le menu est ouvert
  // (ex : click sur un lien qui change de view pendant la transition).
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const scrollTo = (id) => {
    close();
    if (!id) { if (onNavigateHome) onNavigateHome(null); return; }
    if (id === '__parrain__') { if (onReferralPage) onReferralPage(); return; }
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ behavior:'smooth', block:'start' }); return; }
    // Section non visible (autre vue) → retour accueil puis scroll
    if (onNavigateHome) onNavigateHome(id);
  };

  // Liste complète des liens — utilisée desktop ET drawer mobile
  const allLinks = [
    ['section-prestations','Nos prestations'],
    ['section-equipe','Équipe'],
    ...(business?.google_business_url ? [['section-avis','Commentaires']] : []),
    ...(refProgram && refProgram !== 'none' && refProgram.is_enabled === true
        ? [['__parrain__','Programme parrainage']] : []),
    ...((business?.cover_urls?.length > 0) ? [['section-photos','Photos']] : []),
    ['section-adresse','Adresse'],
  ];

  return (
    <nav style={{ position:'sticky', top:0, zIndex:50, background:th.navBg,
      borderBottom:`1px solid ${th.navBorder}`, boxShadow:'0 1px 3px rgba(0,0,0,0.06)',
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      <div className="bk-nav-pad" style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px', height:60,
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>

        {/* Logo + nom — cliquable → retour accueil */}
        <button onClick={()=>{ if(onNavigateHome) onNavigateHome(null); }}
          style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0,
            background:'none', border:'none', cursor:'pointer', padding:0, minWidth:0 }}>
          <div style={{ width:36, height:36, borderRadius:8, overflow:'hidden', flexShrink:0,
            background:th.cardAlt, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {business?.profile_url
              ? <img src={mediaUrl(business.profile_url)} alt={business.business_name}
                  style={{ width:'100%', height:'100%', objectFit:'cover' }}
                  onError={e=>e.target.style.display='none'}/>
              : <span style={{ fontSize:15, fontWeight:900, color:'#374151' }}>
                  {(business?.business_name||'B').charAt(0).toUpperCase()}
                </span>}
          </div>
          <span className="bk-nav-title" style={{ fontSize:15, fontWeight:700, color:th.text, letterSpacing:'-0.01em' }}>
            {business?.business_name}
          </span>
        </button>

        {/* Liens de navigation — desktop uniquement */}
        <div style={{ display:'flex', alignItems:'center', gap:2 }}
          className="bk-do">
          {allLinks.map(([id, label]) => (
            <button key={id}
              onClick={() => scrollTo(id)}
              style={{ padding:'8px 14px', borderRadius:8, fontSize:13, fontWeight:600,
                color:th.muted, background:'none', border:'none', cursor:'pointer',
                whiteSpace:'nowrap' }}
              onMouseEnter={e=>e.currentTarget.style.color=th.text}
              onMouseLeave={e=>e.currentTarget.style.color=th.muted}>
              {label}
            </button>
          ))}
        </div>

        {/* Liens rapides mobile — visibles entre 481px et 767px */}
        <div className="bk-mo-quick" style={{ alignItems:'center', gap:2, flex:1,
          justifyContent:'center', overflowX:'auto' }}>
          {[
            ['section-prestations','Prestations'],
            ['section-equipe','Équipe'],
            ['section-adresse','Adresse'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => scrollTo(id)}
              style={{ padding:'6px 10px', borderRadius:8, fontSize:12, fontWeight:600,
                color:th.muted, background:'none', border:'none', cursor:'pointer',
                whiteSpace:'nowrap', flexShrink:0 }}>
              {label}
            </button>
          ))}
        </div>

        {/* Droite desktop : tel + toggle + auth */}
        <div className="bk-do-right" style={{ alignItems:'center', gap:10, flexShrink:0 }}>
          {business?.phone && (
            <a href={`tel:${business.phone}`}
              style={{ display:'flex', alignItems:'center', gap:6, fontSize:13,
                fontWeight:600, color:th.text, textDecoration:'none' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{width:15,height:15}}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Appelez-nous {business.phone}
            </a>
          )}
          <button onClick={onToggleTheme}
            style={{ width:36, height:36, borderRadius:99, display:'flex',
              alignItems:'center', justifyContent:'center',
              background:th.cardAlt, border:`1px solid ${th.border}`, cursor:'pointer' }}>
            {th.mode === 'dark'
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{width:16,height:16,color:th.text}}>
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{width:16,height:16,color:th.text}}>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
            }
          </button>
          {clientUser ? (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={onMyAppts}
                style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 12px 6px 8px',
                  borderRadius:20, background:th.cardAlt, border:`1px solid ${th.border}`,
                  cursor:'pointer' }}>
                <div style={{ width:24, height:24, borderRadius:99, background:th.accent,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:th.accentText, fontWeight:800, fontSize:11, flexShrink:0 }}>
                  {(clientUser.first_name||'?').charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize:12, fontWeight:600, color:th.text, maxWidth:80,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {clientUser.first_name}
                </span>
              </button>
              <button onClick={onLogout}
                style={{ padding:'6px 10px', borderRadius:9, fontSize:12, fontWeight:600,
                  color:'#ef4444', background:'rgba(239,68,68,0.06)',
                  border:'1px solid rgba(239,68,68,0.15)', cursor:'pointer' }}>
                Déco.
              </button>
            </div>
          ) : (
            <button onClick={onShowAuth}
              style={{ padding:'8px 16px', borderRadius:9, fontSize:13, fontWeight:700,
                background:th.accent, color:th.accentText, border:'none', cursor:'pointer' }}>
              Connexion
            </button>
          )}
        </div>

        {/* Bouton hamburger — mobile uniquement */}
        <button className="bk-mo-hamb" aria-label="Ouvrir le menu"
          onClick={() => setMenuOpen(true)}
          style={{ width:40, height:40, borderRadius:10, alignItems:'center',
            justifyContent:'center', background:th.cardAlt, border:`1px solid ${th.border}`,
            cursor:'pointer', flexShrink:0, padding:0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={th.text} strokeWidth="2"
            strokeLinecap="round" style={{ width:20, height:20 }}>
            <line x1="3" y1="6"  x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Drawer mobile */}
      <div className={`bk-drawer ${menuOpen ? 'open' : ''}`} aria-hidden={!menuOpen}>
        <div className="bk-drawer-backdrop" onClick={close} />
        <aside className="bk-drawer-panel" style={{ background:th.navBg,
          borderLeft:`1px solid ${th.navBorder}`, color:th.text }}>

          {/* Header drawer : logo + close */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 16px', borderBottom:`1px solid ${th.border}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
              <div style={{ width:32, height:32, borderRadius:8, overflow:'hidden', flexShrink:0,
                background:th.cardAlt, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {business?.profile_url
                  ? <img src={mediaUrl(business.profile_url)} alt={business.business_name}
                      style={{ width:'100%', height:'100%', objectFit:'cover' }}
                      onError={e=>e.target.style.display='none'}/>
                  : <span style={{ fontSize:14, fontWeight:900, color:'#374151' }}>
                      {(business?.business_name||'B').charAt(0).toUpperCase()}
                    </span>}
              </div>
              <span style={{ fontSize:14, fontWeight:700, color:th.text,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {business?.business_name}
              </span>
            </div>
            <button onClick={close} aria-label="Fermer"
              style={{ width:36, height:36, borderRadius:10, display:'flex',
                alignItems:'center', justifyContent:'center', background:th.cardAlt,
                border:`1px solid ${th.border}`, cursor:'pointer', flexShrink:0, padding:0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={th.text} strokeWidth="2"
                strokeLinecap="round" style={{ width:18, height:18 }}>
                <line x1="6" y1="6"  x2="18" y2="18"/>
                <line x1="18" y1="6" x2="6"  y2="18"/>
              </svg>
            </button>
          </div>

          {/* Bloc user / auth */}
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${th.border}` }}>
            {clientUser ? (
              <>
                <button onClick={() => { close(); onMyAppts && onMyAppts(); }}
                  style={{ display:'flex', alignItems:'center', gap:10, width:'100%',
                    padding:'10px 12px', borderRadius:10, background:th.cardAlt,
                    border:`1px solid ${th.border}`, cursor:'pointer', marginBottom:8 }}>
                  <div style={{ width:32, height:32, borderRadius:99, background:th.accent,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:th.accentText, fontWeight:800, fontSize:13, flexShrink:0 }}>
                    {(clientUser.first_name||'?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ textAlign:'left', flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:th.text,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {clientUser.first_name} {clientUser.last_name||''}
                    </div>
                    <div style={{ fontSize:11, color:th.muted }}>Mes rendez-vous</div>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke={th.muted} strokeWidth="2"
                    style={{ width:16, height:16 }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
                <button onClick={() => { close(); onLogout && onLogout(); }}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, fontSize:13,
                    fontWeight:700, color:'#ef4444', background:'rgba(239,68,68,0.06)',
                    border:'1px solid rgba(239,68,68,0.2)', cursor:'pointer' }}>
                  Se déconnecter
                </button>
              </>
            ) : (
              <button onClick={() => { close(); onShowAuth && onShowAuth(); }}
                style={{ width:'100%', padding:'12px', borderRadius:10, fontSize:14,
                  fontWeight:700, background:th.accent, color:th.accentText,
                  border:'none', cursor:'pointer' }}>
                Connexion / Créer un compte
              </button>
            )}
          </div>

          {/* Liens navigation */}
          <nav style={{ display:'flex', flexDirection:'column', padding:'8px 8px' }}>
            {allLinks.map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)}
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'12px 14px', borderRadius:10, fontSize:14, fontWeight:600,
                  color:th.text, background:'none', border:'none', cursor:'pointer',
                  textAlign:'left' }}>
                <span>{label}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke={th.muted} strokeWidth="2"
                  style={{ width:14, height:14 }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            ))}
          </nav>

          {/* Footer drawer : tel + thème */}
          <div style={{ marginTop:'auto', padding:'12px 16px', borderTop:`1px solid ${th.border}`,
            display:'flex', flexDirection:'column', gap:8 }}>
            {business?.phone && (
              <a href={`tel:${business.phone}`} onClick={close}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                  borderRadius:10, background:th.cardAlt, border:`1px solid ${th.border}`,
                  fontSize:13, fontWeight:600, color:th.text, textDecoration:'none' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ width:16, height:16 }}>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  Appelez-nous · {business.phone}
                </span>
              </a>
            )}
            <button onClick={onToggleTheme}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                borderRadius:10, background:th.cardAlt, border:`1px solid ${th.border}`,
                fontSize:13, fontWeight:600, color:th.text, cursor:'pointer' }}>
              {th.mode === 'dark'
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{width:16,height:16}}>
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{width:16,height:16}}>
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
              }
              <span>{th.mode === 'dark' ? 'Mode clair' : 'Mode sombre'}</span>
            </button>
          </div>
        </aside>
      </div>
    </nav>
  );
}
