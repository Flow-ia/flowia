// src/pages/booking-page/steps/Step1Home.jsx
// Étape 1 : page d'accueil du commerçant — infos, prestations, équipe,
// commentaires Google, photos, adresse, footer.

import { mediaUrl, employeeImgUrl } from '../../booking/shared';
import { MobileHoursBlock } from '../../booking/SideCard';
import { AccordionGroup } from '../../booking/Services';
import AnnouncementBanner from '../components/AnnouncementBanner';

export function Step1Home({
  th, slug, business, services, employees, refProgram, googleRating,
  svcGroups, svcNoCat,
  setView, navigate, setSelSvc, setSelEmp, setSelDate, setSelSlot, setMonthKey, goToStep,
}) {
  return (
    <div style={{ animation:'fadeIn .2s ease' }}>

      {/* Infos commerçant mobile */}
      <div className="bk-mo" style={{ marginBottom:16, padding:20,
        background:th.card, borderRadius:16, border: `0.5px solid ${th.border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <div style={{ width:56, height:56, borderRadius:12, overflow:'hidden', flexShrink:0,
            background:th.cardAlt, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {business?.profile_url
              ? <img src={mediaUrl(business.profile_url)} alt={business.business_name}
                  style={{ width:'100%', height:'100%', objectFit:'cover' }}
                  onError={e=>e.target.style.display='none'}/>
              : <span style={{ fontSize:22, fontWeight: 500, color:'#374151' }}>
                  {(business?.business_name||'B').charAt(0).toUpperCase()}
                </span>}
          </div>
          <div>
            <h1 style={{ fontSize:18, fontWeight: 500, color:th.text, margin:'0 0 4px',
              letterSpacing:'-0.02em' }}>{business?.business_name}</h1>
          </div>
        </div>
        {business?.address && (
          <p style={{ fontSize:12, color:th.muted, margin:'0 0 4px',
            display:'flex', alignItems:'flex-start', gap:5 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{width:13,height:13,flexShrink:0,marginTop:1}}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            {business.address}
          </p>
        )}
        {business?.phone && (
          <a href={`tel:${business.phone}`}
            style={{ fontSize:12, color:th.muted, textDecoration:'none',
              display:'flex', alignItems:'center', gap:5 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{width:13,height:13,flexShrink:0}}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            {business.phone}
          </a>
        )}
        {/* Horaires compacts (meme format que la sidebar desktop) */}
        {business?.hours && Object.keys(business.hours).length > 0 && (
          <MobileHoursBlock th={th} hours={business.hours} />
        )}
        {refProgram && refProgram !== 'none' && refProgram.is_enabled === true && (
          <button onClick={() => { setView('parrain'); navigate(`/book/${slug}/parrain`, {replace:false}); }}
            style={{ marginTop:10, padding:'8px 12px', borderRadius:9, cursor:'pointer',
              background:'#8b5cf615', border: '0.5px solid #8b5cf640',
              color:'#6d28d9', fontWeight: 500, fontSize:12,
              display:'flex', alignItems:'center', gap:6, width:'100%', justifyContent:'center',
              whiteSpace:'nowrap' }}>
            🤝 Programme parrainage
          </button>
        )}
      </div>

      {/* Annonce / bandeau commercant (si activee et periode active) */}
      <AnnouncementBanner slug={slug} />

      {/* ── SECTION PRESTATIONS ── */}
      <section id="section-prestations" style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:20, fontWeight: 500, color:th.text,
          margin:'0 0 20px', letterSpacing:'-0.02em' }}>Nos prestations</h2>
        {services.length === 0 ? (
          <p style={{ color:th.muted, fontSize:14 }}>Aucune prestation disponible.</p>
        ) : (
          <div style={{ border: `0.5px solid ${th.border}`, borderRadius:12,
            overflow:'hidden', background:th.card }}>
            {[
              ...svcGroups.map(g => ({ label:g.label, svcs:g.svcs })),
              ...(svcNoCat.length>0 ? [{ label:null, svcs:svcNoCat }] : []),
            ].map(({ label, svcs: gs }, gi, arr) => (
              <AccordionGroup key={label||'__nc__'}
                label={label} svcs={gs} th={th}
                isLast={gi===arr.length-1}
                onSelect={s=>{ setSelSvc(s); setSelEmp(null); setSelDate(null);
                  setSelSlot(null); setMonthKey(''); goToStep(2, s); }}/>
            ))}
          </div>
        )}
      </section>

      {/* ── SECTION ÉQUIPE ── */}
      <section id="section-equipe" style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:20, fontWeight: 500, color:th.text,
          margin:'0 0 16px', letterSpacing:'-0.02em' }}>Équipe</h2>
        <div className="bk-emp-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
          {employees.map(e => (
            <div key={e.id}
              onClick={() => {
                // Clic employé → pré-sélectionner l'employe puis aller a l'étape 2
                // L'étape 2 affiche les prestations filtrées pour cet employé
                setSelEmp(e);
                setSelSvc(null); setSelDate(null); setSelSlot(null); setMonthKey('');
                goToStep(2, null, e);
              }}
              style={{ background:th.card, border: `0.5px solid ${th.border}`,
                borderRadius:12, padding:'16px 14px',
                display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
              onMouseEnter={ev=>ev.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,0.08)'}
              onMouseLeave={ev=>ev.currentTarget.style.boxShadow='none'}>
              <div style={{ width:48, height:48, borderRadius:99, flexShrink:0,
                background: e.has_image ? 'transparent' : th.cardAlt, overflow:'hidden',
                display:'flex', alignItems:'center', justifyContent:'center',
                border: e.has_image ? `1px solid ${th.border}` : 'none' }}>
                {e.has_image ? (
                  <img src={employeeImgUrl(e.id, e.image_version)} alt={e.name}
                    style={{ width:'100%', height:'100%', objectFit:'cover' }}
                    onError={ev => {
                      ev.currentTarget.style.display = 'none';
                      if (ev.currentTarget.nextSibling) ev.currentTarget.nextSibling.style.display = 'block';
                    }} />
                ) : (
                  <span style={{ fontSize:20, fontWeight: 500,
                    color:e.avatar_color||'#374151' }}>
                    {e.name.charAt(0)}
                  </span>
                )}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14, fontWeight: 500, color:th.text,
                  margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis',
                  whiteSpace:'nowrap' }}>{e.name}</p>
                {e.role && <p style={{ fontSize:12, color:th.muted, margin:0 }}>{e.role}</p>}
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{width:16,height:16,color:th.dim,flexShrink:0}}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION COMMENTAIRES Google ── */}
      {business?.google_business_url && (
        <section id="section-avis" style={{ marginBottom:24 }}>
          <h2 style={{ fontSize:20, fontWeight: 500, color:th.text,
            margin:'0 0 16px', letterSpacing:'-0.02em' }}>Commentaires</h2>

          {/* Widget avis Google — style page Google Maps */}
          <div style={{ background:th.card, border: `0.5px solid ${th.border}`,
            borderRadius:14, overflow:'hidden' }}>

            {/* En-tête : logo Google + titre */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'14px 18px', borderBottom: `0.5px solid ${th.border}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <svg viewBox="0 0 24 24" width="18" height="18" style={{flexShrink:0}}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span style={{ fontSize:13, fontWeight: 500, color:th.text }}>
                  Avis Google
                </span>
              </div>
              <a href={business.google_business_url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize:12, color:'#2563eb', fontWeight: 500, textDecoration:'none',
                  display:'flex', alignItems:'center', gap:4 }}>
                Voir la fiche
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{width:12,height:12}}>
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            </div>

            {/* Note réelle Google (via Places API) — affichée seulement si dispo */}
            {googleRating ? (
              <div style={{ padding:'20px 18px 16px',
                display:'flex', alignItems:'center', gap:20 }}>
                <div style={{ textAlign:'center', flexShrink:0 }}>
                  <p style={{ fontSize:40, fontWeight: 500, color:th.text,
                    margin:0, lineHeight:1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {googleRating.rating.toFixed(1)}
                  </p>
                  <div style={{ display:'flex', gap:1, justifyContent:'center', margin:'4px 0' }}>
                    {[1,2,3,4,5].map(n => {
                      const r = googleRating.rating;
                      const fill = n <= Math.floor(r) ? 1 : (n - 1 < r ? (r - (n-1)) : 0);
                      return (
                        <svg key={n} viewBox="0 0 24 24" style={{ width:14, height:14 }}>
                          <defs>
                            <linearGradient id={`gr-${n}`} x1="0" x2="1" y1="0" y2="0">
                              <stop offset={`${fill * 100}%`} stopColor="#FBBC05"/>
                              <stop offset={`${fill * 100}%`} stopColor={th.mode==='dark'?'#3f3f46':'#e5e7eb'}/>
                            </linearGradient>
                          </defs>
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                            fill={`url(#gr-${n})`} />
                        </svg>
                      );
                    })}
                  </div>
                  <p style={{ fontSize:11, color:th.muted, margin:0 }}>
                    {googleRating.total > 0
                      ? `${googleRating.total} avis Google`
                      : 'avis Google'}
                  </p>
                </div>
                <a href={business.google_business_url} target="_blank" rel="noopener noreferrer"
                  style={{ flex:1, display:'flex', alignItems:'center', gap:10,
                    padding:'14px 16px', borderRadius:12, textDecoration:'none',
                    background:th.cardAlt, border: `0.5px solid ${th.border}`,
                    color:th.text }}>
                  <span style={{ fontSize:13, fontWeight: 500, flex:1 }}>
                    Consulter les avis détaillés sur Google
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{width:14,height:14,flexShrink:0}}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </a>
              </div>
            ) : (
              <div style={{ padding:'16px 18px',
                display:'flex', alignItems:'center', gap:10,
                borderBottom: `0.5px solid ${th.border}` }}>
                <svg viewBox="0 0 24 24" fill="#FBBC05" style={{width:16,height:16,flexShrink:0}}>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <p style={{ fontSize:13, color:th.muted, margin:0, lineHeight:1.4 }}>
                  Retrouvez la note et les avis de ce commerce directement sur Google.
                </p>
              </div>
            )}

            {/* Boutons CTA */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8,
              padding:'0 18px 18px' }}>
              <a href={business.google_business_url}
                target="_blank" rel="noopener noreferrer"
                style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  padding:'10px', borderRadius:10, textDecoration:'none', fontSize:13,
                  fontWeight: 500, color:th.text,
                  background:th.cardAlt, border: `0.5px solid ${th.border}` }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{width:14,height:14}}>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                Voir les avis
              </a>
              <a href={business.google_business_url}
                target="_blank" rel="noopener noreferrer"
                style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  padding:'10px', borderRadius:10, textDecoration:'none', fontSize:13,
                  fontWeight: 500, color:th.accentText,
                  background:th.accent, border:'none' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{width:14,height:14}}>
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                Laisser un avis
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ── SECTION PHOTOS (en bas de la section avis) ── */}
      {business?.cover_urls?.length > 0 && (
        <section id="section-photos" style={{ marginBottom:24 }}>
          <h2 style={{ fontSize:20, fontWeight: 500, color:th.text,
            margin:'0 0 16px', letterSpacing:'-0.02em' }}>Photos</h2>
          <div style={{ display:'grid',
            gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:12 }}>
            {business.cover_urls.map((c, i) => (
              <div key={c.id||i} style={{ aspectRatio:'4/3',
                borderRadius:14, overflow:'hidden',
                background:th.cardAlt, border: `0.5px solid ${th.border}` }}>
                <img src={mediaUrl(c.url)} alt={`Photo ${i+1}`}
                  loading="lazy"
                  style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── SECTION ADRESSE (deplacee en bas : prestations + equipe prioritaires) ── */}
      <section id="section-adresse" style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:20, fontWeight: 500, color:th.text,
          margin:'0 0 16px', letterSpacing:'-0.02em' }}>Adresse</h2>

        {/* Carte Google Maps embed — si adresse disponible */}
        {(business?.address || business?.city) && (() => {
          const addrQ = encodeURIComponent(
            [business.address, business.postal_code, business.city]
            .filter(Boolean).join(' ')
          );
          const mapsLink = `https://www.google.com/maps/search/?api=1&query=${addrQ}`;
          // Embed direct via www.google.com (au lieu de maps.google.com qui
          // redirige) pour limiter la surface CSP frame-src et éviter que
          // certains navigateurs mobiles refusent l'iframe sur redirect.
          const embedUrl = `https://www.google.com/maps?q=${addrQ}&output=embed&hl=fr&z=15`;
          return (
            <div style={{ borderRadius:14, overflow:'hidden', marginBottom:16,
              border: `0.5px solid ${th.border}` }}>
              <iframe
                className="bk-iframe"
                src={embedUrl}
                width="100%"
                height="240"
                style={{ border:'none', display:'block' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Localisation du commerce"
              />
              {/* Lien "Ouvrir dans Maps" */}
              <a href={mapsLink} target="_blank" rel="noopener noreferrer"
                style={{ display:'flex', alignItems:'center', gap:8,
                  padding:'10px 14px', background:th.card,
                  borderTop: `0.5px solid ${th.border}`,
                  fontSize:13, fontWeight: 500, color:'#2563eb', textDecoration:'none' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{width:13,height:13}}>
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                {[business.address, business.postal_code, business.city].filter(Boolean).join(' ')}
              </a>
            </div>
          );
        })()}

        {/* Card infos : adresse textuelle + téléphone */}
        <div style={{ background:th.card, border: `0.5px solid ${th.border}`,
          borderRadius:12, overflow:'hidden' }}>
          {(business?.address || business?.city || business?.postal_code) && (
            <div style={{ display:'flex', alignItems:'flex-start', gap:12,
              padding:'14px 18px',
              borderBottom: business?.phone ? `1px solid ${th.border}` : 'none' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{width:16,height:16,flexShrink:0,marginTop:2,color:th.muted}}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <div>
                {business?.address && (
                  <p style={{ fontSize:14, color:th.text, margin:0, lineHeight:1.6, fontWeight:500 }}>
                    {business.address}
                  </p>
                )}
                {(business?.postal_code || business?.city) && (
                  <p style={{ fontSize:14, color:th.text, margin:0, lineHeight:1.6 }}>
                    {[business.postal_code, business.city].filter(Boolean).join(' ')}
                  </p>
                )}
              </div>
            </div>
          )}
          {business?.phone && (
            <a href={`tel:${business.phone}`}
              style={{ display:'flex', alignItems:'center', gap:12,
                padding:'14px 18px', fontSize:14, color:th.text,
                textDecoration:'none' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{width:16,height:16,flexShrink:0,color:th.muted}}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span style={{ fontWeight:500 }}>{business.phone}</span>
            </a>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <div className="bk-footer-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24,
        paddingTop:24, borderTop: `0.5px solid ${th.border}` }}>
        <div>
          <p style={{ fontSize:14, fontWeight: 500, color:th.text, margin:'0 0 10px' }}>
            Nous contacter
          </p>
          {business?.phone && (
            <a href={`tel:${business.phone}`}
              style={{ display:'flex', alignItems:'center', gap:7, fontSize:13,
                color:'#2563eb', textDecoration:'none', marginBottom:6 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{width:14,height:14}}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              {business.phone}
            </a>
          )}
        </div>
        <div>
          <p style={{ fontSize:14, fontWeight: 500, color:th.text, margin:'0 0 10px' }}>
            Bon à savoir
          </p>
          <a href={`/book/${slug}/politique`} target="_blank" rel="noopener noreferrer"
            style={{ display:'flex', alignItems:'center', gap:7, fontSize:13,
              color:'#2563eb', textDecoration:'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{width:14,height:14}}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Politique de réservation
          </a>
        </div>
      </div>
    </div>
  );
}
