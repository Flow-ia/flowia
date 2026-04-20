// src/pages/clients/views/ListView.jsx
import Avatar from '../components/Avatar';
import SortDropdown from '../components/SortDropdown';
import { Toast } from '../../../components/UI';
import { PAGE_SIZE } from '../constants';

// ══ VUE LISTE ═══════════════════════════════════════════════════════════════
export default function ListView({
  theme, isDark, toast,
  stickyHeader, card, inp,
  loading, total, search, setSearch,
  clients, sort, setSort,
  page, setPage,
  hasSearched, setHasSearched,
  loadList, openFiche, setView, setForm,
}) {
  const doSearch = () => {
    setHasSearched(true);
    setPage(0);
    loadList(search, 0);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ background: isDark?'#0c0c10':theme.bg, minHeight:'100vh', paddingBottom:96 }}>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* ── Header sticky ── */}
      <div style={{ ...stickyHeader, padding:'13px 16px 11px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:11 }}>
          <div>
            <h1 style={{ margin:0, fontFamily:"'Outfit',sans-serif", fontSize:20, fontWeight:800, letterSpacing:'-0.025em', color:theme.text }}>Clients</h1>
            <p style={{ margin:'2px 0 0', fontSize:11.5, color:theme.muted }}>
              {loading ? '...' : `${total} client${total !== 1 ? 's' : ''}${search.trim() ? ` pour "${search}"` : ''}`}
            </p>
          </div>
          <button onClick={() => { setForm({ first_name:'', last_name:'', email:'', phone:'', notes:'' }); setView('create'); }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 16px', borderRadius:14, background:'#1a73e8', border:'none', color:'white', boxShadow:'0 4px 14px rgba(17,24,39,0.35)', fontWeight:800, fontSize:13, cursor:'pointer' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{ width:14, height:14 }}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nouveau
          </button>
        </div>

        {/* Barre de recherche + dropdown tri */}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ position:'relative', flex:1 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', width:15, height:15, color:theme.muted, pointerEvents:'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
              placeholder="Nom, email, téléphone… (Entrée pour chercher)"
              style={{ ...inp, paddingLeft:36, paddingRight: search ? 36 : 14 }}
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(0); }}
                style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:theme.muted, fontSize:15, lineHeight:1, padding:0 }}>✕</button>
            )}
          </div>
          <SortDropdown value={sort} onChange={v => setSort(v)} theme={theme} isDark={isDark} />
        </div>
      </div>

      {/* ── Corps ── */}
      <div style={{ padding:'16px 14px 0' }}>

        {/* Chargement */}
        {loading && (
          <div style={{ textAlign:'center', padding:'56px 0', color:theme.muted }}>
            <div style={{ width:40, height:40, borderRadius:'50%', border:`3px solid ${theme.border}`, borderTopColor:'#111827', animation:'spin 0.8s linear infinite', margin:'0 auto 14px' }} />
            <p style={{ margin:0, fontSize:13 }}>Chargement…</p>
          </div>
        )}

        {/* Aucun résultat */}
        {!loading && clients.length === 0 && (
          <div style={{ textAlign:'center', padding:'56px 16px' }}>
            <div style={{ fontSize:52, marginBottom:14 }}>🔍</div>
            <p style={{ fontSize:16, fontWeight:700, color:theme.text, marginBottom:6 }}>
              {search.trim() ? `Aucun resultat pour "${search}"` : 'Aucun client'}
            </p>
            <p style={{ fontSize:13, color:theme.muted, marginBottom:24 }}>
              {search.trim() ? 'Essayez un autre terme de recherche.' : 'Creez votre premier client avec le bouton Nouveau.'}
            </p>
            {!search.trim() && (
              <button onClick={() => { setForm({ first_name:'', last_name:'', email:'', phone:'', notes:'' }); setView('create'); }}
                style={{ padding:'12px 24px', borderRadius:14, background:'Black', border:'none', color:'white', fontWeight:800, fontSize:14, cursor:'pointer' }}>
                + Créer un client
              </button>
            )}
          </div>
        )}

        {/* Liste des clients */}
        {!loading && clients.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {clients.map(cl => {
              const visits = cl.total_visits || cl.tx_count || 0;
              const hasLoyalty = cl.stamps > 0 || cl.points > 0;
              return (
                <button key={cl.id} onClick={() => openFiche(cl)}
                  style={{ ...card, padding:'13px 15px', display:'flex', alignItems:'center', gap:13, textAlign:'left', border:'none', cursor:'pointer', width:'100%', transition:'transform .12s,box-shadow .12s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
                  <Avatar cl={cl} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:'0 0 3px', fontWeight:800, fontSize:15, color:theme.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {[cl.first_name, cl.last_name].filter(Boolean).join(' ') || <em style={{ color:theme.muted }}>Sans nom</em>}
                    </p>
                    <p style={{ margin:0, fontSize:12, color:theme.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {cl.email || cl.phone || '-'}
                    </p>
                    {/* Badges en ligne */}
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:5 }}>
                      {cl.global_client_id ? (
                        <span style={{ fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:99, background:'rgba(16,185,129,0.14)', color:'#10b981' }}>✓ Plateforme</span>
                      ) : cl.source === 'booking' ? (
                        <span style={{ fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:99, background:'rgba(17,24,39,0.1)', color:'#111827' }}>🌐 En ligne</span>
                      ) : (
                        <span style={{ fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:99, background:'rgba(148,163,184,0.15)', color:'#64748b' }}>Interne</span>
                      )}
                      {hasLoyalty && (
                        <span style={{ fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:99, background:'rgba(245,158,11,0.12)', color:'#f59e0b' }}>
                          {cl.loyalty_mode === 'points' ? `${Math.floor(cl.points || 0)} pts` : `${cl.stamps || 0} 🎫`}
                        </span>
                      )}
                      {cl.notes_count > 0 && (
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99, background:'rgba(17,24,39,0.08)', color:'#111827' }}>📝 {cl.notes_count}</span>
                      )}
                      {cl.is_booking_blocked && (
                        <span style={{ fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:99, background:'rgba(239,68,68,0.1)', color:'#ef4444' }}>🚫 Bloqué</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                    <span style={{ fontSize:13, fontWeight:800, color:'#10b981' }}>{Number(cl.total_spent || 0).toFixed(0)} €</span>
                    <span style={{ fontSize:11, color:theme.muted }}>{visits} visite{visits !== 1 ? 's' : ''}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width:13, height:13, color:theme.muted }}><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Pagination 10 par page */}
        {!loading && total > 0 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'22px 0 12px' }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              style={{ padding:'8px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background: isDark?'#161620':'#ffffff', color: page===0?theme.dim:theme.text, fontWeight:700, fontSize:13, cursor: page===0?'default':'pointer', opacity: page===0?0.5:1 }}>
              ‹ Préc.
            </button>
            <span style={{ fontSize:13, fontWeight:700, color:theme.muted, minWidth:80, textAlign:'center' }}>
              Page {page + 1} / {totalPages}
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              style={{ padding:'8px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background: isDark?'#161620':'#ffffff', color: page>=totalPages-1?theme.dim:theme.text, fontWeight:700, fontSize:13, cursor: page>=totalPages-1?'default':'pointer', opacity: page>=totalPages-1?0.5:1 }}>
              Suiv. ›
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
