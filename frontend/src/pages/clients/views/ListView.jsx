// src/pages/clients/views/ListView.jsx
import { useState, useEffect } from 'react';
import Avatar from '../components/Avatar';
import SortDropdown from '../components/SortDropdown';
import { Toast } from '../../../components/UI';
import { Button } from '../../../components/primitives';
import { I } from '../../../utils/icons';
import { PAGE_SIZE } from '../constants';
import { clientsApi } from '../../../utils/api';

// Filtres segmentes — desormais traites en SQL cote backend (params ?filter=...)
// pour preserver la pagination serveur. Le predicate frontend a ete supprime
// pour eviter de charger 500 clients d'un coup.
const FILTERS = [
  { id: 'all',            label: 'Tous'        },
  { id: 'loyal',          label: 'Fidèles'     },
  { id: 'birthday_month', label: 'Anniv. mois' },
  { id: 'with_credit',    label: 'Avec crédit' },
  { id: 'new',            label: 'Nouveaux'    },
  { id: 'inactive',       label: 'Inactifs'    },
  { id: 'blocked',        label: 'Bloqués'     },
];

// ══ VUE LISTE ═══════════════════════════════════════════════════════════════
export default function ListView({
  theme, isDark, toast,
  stickyHeader, card, inp,
  loading, total, search, setSearch,
  clients, sort, setSort,
  page, setPage,
  hasSearched, setHasSearched,
  loadList, openFiche, setView, setForm,
  filter = 'all', setFilter = () => {},
}) {
  const doSearch = () => {
    setHasSearched(true);
    setPage(0);
    loadList(search, 0);
  };

  // Filtrage 100% serveur desormais — la liste reçue est deja la bonne page.
  const isFiltered    = filter !== 'all';
  const visibleList   = clients;
  const visibleCount  = total;
  const totalPages    = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Compteur de creances impayees (RGPD post-suppression). Charge en arriere-plan
  // au mount, mis a jour si on revient de la vue debts. Pas critique donc
  // best-effort sans affichage d'erreur.
  const [debtsCount, setDebtsCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    clientsApi.listDebts('open')
      .then(r => { if (!cancelled) setDebtsCount(r.open_count || 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ background: theme.bg, minHeight: '100vh', paddingBottom: 96 }}>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* ── Header sticky ── */}
      <div style={{ ...stickyHeader, padding: '12px 16px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 500,
              color: theme.text,
            }}>Clients</h1>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: theme.muted }}>
              {loading ? '...' : `${visibleCount} client${visibleCount !== 1 ? 's' : ''}${search.trim() ? ` pour "${search}"` : ''}${isFiltered ? ' (filtre)' : ''}`}
            </p>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            {debtsCount > 0 && (
              <button type="button" onClick={() => setView('debts')}
                      title="Créances (dettes) impayées — recouvrement loi 18-07"
                      style={{ display:'inline-flex', alignItems:'center', gap:6,
                               padding:'7px 10px', borderRadius:8,
                               background:'rgba(239,68,68,0.08)', color:'#991b1b',
                               border:'0.5px solid rgba(239,68,68,0.25)',
                               fontSize:12, fontWeight:500, cursor:'pointer',
                               fontFamily:'inherit' }}>
                Créances (dettes)
                <span style={{ minWidth:18, height:18, padding:'0 5px',
                               borderRadius:99, background:'#991b1b', color:'#fff',
                               fontSize:10, fontWeight:500,
                               display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                  {debtsCount > 99 ? '99+' : debtsCount}
                </span>
              </button>
            )}
            <Button
              size="small"
              onClick={() => { setForm({ first_name:'', last_name:'', email:'', phone:'', notes:'' }); setView('create'); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <I.Plus width={13} height={13} />
              Nouveau
            </Button>
          </div>
        </div>

        {/* Barre de recherche + dropdown tri */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: theme.dim,
              pointerEvents: 'none',
              display: 'inline-flex',
            }}>
              <I.Search width={14} height={14} />
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
              placeholder="Nom, email, telephone…"
              style={{ ...inp, paddingLeft: 36, paddingRight: search ? 34 : 12 }}
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setPage(0); }}
                aria-label="Effacer"
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: theme.muted,
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                  fontFamily: 'inherit',
                }}
              >✕</button>
            )}
          </div>
          <SortDropdown value={sort} onChange={v => setSort(v)} theme={theme} />
        </div>

        {/* Refonte FDS-2026 commit 8 : filtres segmentés.
            Scroll horizontal si trop de chips pour tenir sur mobile. */}
        <div style={{ display:'flex', gap:6, marginTop:10, overflowX:'auto',
                      paddingBottom:2 }}>
          {FILTERS.map(f => {
            const active = filter === f.id;
            return (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                      style={{ padding:'6px 10px', borderRadius:999, border:'none',
                               background: active ? theme.text : theme.cardAlt,
                               color: active ? theme.bg : theme.muted,
                               fontSize:11, fontWeight: active ? 500 : 400,
                               cursor:'pointer', fontFamily:'inherit',
                               whiteSpace:'nowrap', flexShrink:0 }}>
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Corps ── */}
      <div style={{ padding: '16px 14px 0' }}>
        {/* Chargement */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '56px 0' }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: `0.5px solid ${theme.border}`,
              borderTopColor: theme.text,
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 10px',
            }} />
            <p style={{ margin: 0, fontSize: 13, color: theme.muted }}>Chargement…</p>
          </div>
        )}

        {/* Aucun resultat */}
        {!loading && visibleList.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '48px 16px',
            background: theme.card,
            border: `0.5px dashed ${theme.border}`,
            borderRadius: 12,
          }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: theme.text, margin: '0 0 6px' }}>
              {search.trim() ? `Aucun resultat pour "${search}"` : 'Aucun client'}
            </p>
            <p style={{ fontSize: 12, color: theme.muted, margin: '0 0 18px' }}>
              {search.trim() ? 'Essayez un autre terme de recherche.' : 'Creez votre premier client avec le bouton Nouveau.'}
            </p>
            {!search.trim() && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Button size="small" onClick={() => { setForm({ first_name:'', last_name:'', email:'', phone:'', notes:'' }); setView('create'); }}>
                  Creer un client
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Liste des clients */}
        {!loading && visibleList.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleList.map(cl => {
              const visits = cl.total_visits || cl.tx_count || 0;
              const hasLoyalty = cl.stamps > 0 || cl.points > 0;
              return (
                <button
                  key={cl.id}
                  type="button"
                  onClick={() => openFiche(cl)}
                  style={{
                    ...card,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    width: '100%',
                    transition: 'border-color .12s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = theme.borderStrong; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = theme.border; }}
                >
                  <Avatar cl={cl} size={40} radius={12} fontSize={15} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: '0 0 2px',
                      fontWeight: 500,
                      fontSize: 14,
                      color: theme.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {[cl.first_name, cl.last_name].filter(Boolean).join(' ') || <em style={{ color: theme.muted, fontStyle: 'normal' }}>Sans nom</em>}
                    </p>
                    <p style={{
                      margin: 0,
                      fontSize: 12,
                      color: theme.muted,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {cl.email || cl.phone || '-'}
                    </p>
                    {/* Badges en ligne */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 5 }}>
                      {cl.global_client_id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: theme.muted }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />
                          Plateforme
                        </span>
                      ) : cl.source === 'booking' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: theme.muted }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366f1' }} />
                          En ligne
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: theme.muted }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: theme.dim }} />
                          Interne
                        </span>
                      )}
                      {hasLoyalty && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: '1px 7px',
                          borderRadius: 8,
                          background: '#fffbeb',
                          color: '#92400e',
                        }}>
                          {cl.loyalty_mode === 'points' ? `${Math.floor(cl.points || 0)} pts` : `${cl.stamps || 0} tampons`}
                        </span>
                      )}
                      {cl.notes_count > 0 && (
                        <span style={{ fontSize: 11, color: theme.muted }}>
                          {cl.notes_count} note{cl.notes_count > 1 ? 's' : ''}
                        </span>
                      )}
                      {cl.is_booking_blocked && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: '1px 7px',
                          borderRadius: 8,
                          background: '#fef2f2',
                          color: '#991b1b',
                        }}>
                          Bloque
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: theme.text }}>
                      {Number(cl.total_spent || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} DA
                    </span>
                    <span style={{ fontSize: 11, color: theme.muted }}>
                      {visits} visite{visits !== 1 ? 's' : ''}
                    </span>
                    <span style={{ color: theme.muted, display: 'inline-flex' }}>
                      <I.ChevR width={12} height={12} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Pagination — affichee dans tous les cas (filtre inclus) car le
            backend pagine deja les resultats filtres en SQL. */}
        {!loading && total > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '20px 0 10px',
          }}>
            <button
              type="button"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: `0.5px solid ${theme.borderStrong}`,
                background: 'transparent',
                color: page === 0 ? theme.dim : theme.text,
                fontWeight: 500,
                fontSize: 13,
                cursor: page === 0 ? 'default' : 'pointer',
                opacity: page === 0 ? 0.5 : 1,
                fontFamily: 'inherit',
              }}
            >
              Precedent
            </button>
            <span style={{
              fontSize: 13,
              fontWeight: 500,
              color: theme.muted,
              minWidth: 80,
              textAlign: 'center',
            }}>
              Page {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: `0.5px solid ${theme.borderStrong}`,
                background: 'transparent',
                color: page >= totalPages - 1 ? theme.dim : theme.text,
                fontWeight: 500,
                fontSize: 13,
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                opacity: page >= totalPages - 1 ? 0.5 : 1,
                fontFamily: 'inherit',
              }}
            >
              Suivant
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
