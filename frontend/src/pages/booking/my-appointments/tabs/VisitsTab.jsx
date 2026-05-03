// src/pages/booking/my-appointments/tabs/VisitsTab.jsx
// Onglet "Sur place" : liste paginée + recherche + vue détail d'un passage.
import { Spinner } from '../../shared';
import { VISITS_PAGE_SIZE } from '../constants';
import { VisitDetailCard } from '../components/VisitDetailCard';

export function VisitsTab({
  th,
  inpStyle,
  selectedVisit,
  visitDetailLoad,
  visits,
  visitsLoading,
  visitsErr,
  visitsQuery,
  visitsDate,
  visitsDebounced,
  visitsPage,
  visitsTotal,
  setVisitsQuery,
  setVisitsDate,
  setVisitsPage,
  setVisitsErr,
  onOpenVisit,
  onCloseVisit,
}) {
  return (
    <div style={{ animation:'fadeIn .2s ease' }}>
      {selectedVisit ? (
        /* ── VUE DÉTAIL d'un passage ── */
        <VisitDetailCard visit={selectedVisit} th={th} onBack={onCloseVisit}/>
      ) : visitDetailLoad ? (
        /* Chargement direct via URL /passages/:id */
        <div style={{paddingTop:40}}><Spinner color="#6366f1"/></div>
      ) : (
        /* ── VUE LISTE paginée avec recherche ── */
        <>
          {/* Filtres : recherche commerçant + date */}
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            <div style={{ flex:'1 1 220px', minWidth:0, position:'relative' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ width:14, height:14, position:'absolute', left:12, top:'50%',
                  transform:'translateY(-50%)', color:th.muted, pointerEvents:'none' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" value={visitsQuery}
                onChange={e => setVisitsQuery(e.target.value)}
                placeholder="Rechercher un commerçant"
                style={{ ...inpStyle, paddingLeft:34 }}/>
            </div>
            <input type="date" value={visitsDate}
              onChange={e => setVisitsDate(e.target.value)}
              style={{ ...inpStyle, flex:'0 1 170px', minWidth:0 }}/>
            {(visitsQuery || visitsDate) && (
              <button onClick={() => { setVisitsQuery(''); setVisitsDate(''); }}
                style={{ padding:'0 14px', borderRadius:12, cursor:'pointer',
                  background:th.cardAlt, border: `1px solid ${th.border}`,
                  color:th.muted, fontWeight: 500, fontSize:12 }}>
                Réinitialiser
              </button>
            )}
          </div>

          {visitsLoading ? (
            <div style={{paddingTop:40}}><Spinner color="#6366f1"/></div>
          ) : visitsErr ? (
            <div style={{ textAlign:'center', paddingTop:40 }}>
              <p style={{ color:th.ax.rose, fontWeight: 500, fontSize:13, margin:'0 0 12px' }}>
                {visitsErr}
              </p>
              <button onClick={() => { setVisitsPage(p => p); setVisitsErr(''); }}
                style={{ padding:'10px 20px', borderRadius:10, cursor:'pointer',
                  background:th.accent, border:'none', color:th.accentText,
                  fontWeight: 500, fontSize:12 }}>Réessayer</button>
            </div>
          ) : visits.length === 0 ? (
            <div style={{ textAlign:'center', paddingTop:40 }}>
              <div style={{ marginBottom:14, display:'flex', justifyContent:'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                  style={{width:48,height:48,color:th.dim}}>
                  <path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <p style={{ fontWeight: 500, color:th.muted, marginBottom:6 }}>
                {(visitsDebounced || visitsDate)
                  ? 'Aucun passage ne correspond aux filtres'
                  : 'Aucun passage sur place'}
              </p>
              {!(visitsDebounced || visitsDate) && (
                <p style={{ fontSize:12, color:th.dim, maxWidth:320, margin:'0 auto' }}>
                  Quand un commerçant vous encaisse en caisse sans rendez-vous
                  préalable, la trace apparaît ici avec le détail des prestations.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Liste compacte : commerçant + montant */}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {visits.map(v => {
                  const total   = parseFloat(v.amount || 0);
                  const dateObj = v.date ? new Date(`${v.date}T12:00:00`) : null;
                  const dateStr = (dateObj && !isNaN(dateObj))
                    ? dateObj.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' })
                    : (v.date || '');
                  return (
                    <button key={v.id} onClick={() => onOpenVisit(v)}
                      style={{ width:'100%', textAlign:'left', cursor:'pointer',
                        background:th.card, border: `1px solid ${th.border}`,
                        borderRadius:14, padding:'14px 16px',
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                        gap:12, transition:'transform .08s, border-color .12s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = th.accent}
                      onMouseLeave={e => e.currentTarget.style.borderColor = th.border}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:14, fontWeight: 500, color:th.text, margin:'0 0 2px',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {v.business_name || 'Commerçant'}
                        </p>
                        <p style={{ fontSize:11, color:th.muted, margin:0 }}>
                          {dateStr}{v.time ? ` · ${v.time}` : ''}
                        </p>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                        <p style={{ fontSize:15, fontWeight: 500, color:th.ax.emerald,
                          margin:0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                          {total.toFixed(2)} €
                        </p>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2.5" style={{width:14,height:14,color:th.muted}}>
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pagination 10 par page */}
              {visitsTotal > VISITS_PAGE_SIZE && (() => {
                const totalPages = Math.max(1, Math.ceil(visitsTotal / VISITS_PAGE_SIZE));
                const pageSafe   = Math.min(visitsPage, totalPages);
                const from       = (pageSafe - 1) * VISITS_PAGE_SIZE + 1;
                const to         = Math.min(pageSafe * VISITS_PAGE_SIZE, visitsTotal);
                return (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    gap:10, marginTop:16, flexWrap:'wrap' }}>
                    <p style={{ fontSize:12, color:th.muted, margin:0 }}>
                      {from}–{to} sur {visitsTotal}
                    </p>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => setVisitsPage(p => Math.max(1, p-1))}
                        disabled={pageSafe <= 1}
                        style={{ padding:'8px 12px', borderRadius:10,
                          cursor: pageSafe<=1 ? 'not-allowed' : 'pointer',
                          background:th.cardAlt, border: `1px solid ${th.border}`,
                          color:th.text, fontWeight: 500, fontSize:12,
                          opacity: pageSafe<=1 ? 0.4 : 1 }}>
                        ← Précédent
                      </button>
                      <span style={{ padding:'8px 12px', fontSize:12, fontWeight: 500, color:th.muted }}>
                        {pageSafe} / {totalPages}
                      </span>
                      <button onClick={() => setVisitsPage(p => Math.min(totalPages, p+1))}
                        disabled={pageSafe >= totalPages}
                        style={{ padding:'8px 12px', borderRadius:10,
                          cursor: pageSafe>=totalPages ? 'not-allowed' : 'pointer',
                          background:th.cardAlt, border: `1px solid ${th.border}`,
                          color:th.text, fontWeight: 500, fontSize:12,
                          opacity: pageSafe>=totalPages ? 0.4 : 1 }}>
                        Suivant →
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}
    </div>
  );
}
