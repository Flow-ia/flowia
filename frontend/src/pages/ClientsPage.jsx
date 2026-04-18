// src/pages/ClientsPage.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { clientsApi, creditsApi } from '../utils/api';
import { useTheme } from '../hooks/useTheme';
import { Toast, useToast, Confirm } from '../components/UI';
import { useEmployeePinGate } from '../components/EmployeePinModal';

// ─── Utilitaires ──────────────────────────────────────────────────────────────
const fmtDate = (s) => {
  if (!s) return '-';
  try { return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(s); }
};

const initials = (cl) => {
  const n = `${cl.first_name || ''} ${cl.last_name || ''}`.trim() || cl.email || '?';
  return n.charAt(0).toUpperCase();
};

const avatarColor = (cl) => {
  const PAL = ['#111827','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#f97316','#14b8a6'];
  const s = `${cl.first_name || ''}${cl.email || ''}`;
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return PAL[Math.abs(h) % PAL.length];
};

const STATUS_COLOR = { pending:'#f59e0b', confirmed:'#10b981', cancelled:'#ef4444', completed:'#111827', no_show:'#94a3b8' };
const STATUS_LABEL = { pending:'En attente', confirmed:'Confirme', cancelled:'Annule', completed:'Termine', no_show:'Absent' };

const SORT_OPTS = [
  { value: 'name',     label: 'A → Z (nom)' },
  { value: 'visits',   label: 'Plus de visites' },
  { value: 'spending', label: 'Plus de depenses' },
  { value: 'recent',   label: 'Récemment ajoutes' },
];

function Avatar({ cl, size = 46, radius = 15, fontSize = 18 }) {
  const c = avatarColor(cl);
  return (
    <div style={{ width:size, height:size, borderRadius:radius, flexShrink:0, background:`linear-gradient(135deg,${c},${c}bb)`, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:900, fontSize }}>
      {initials(cl)}
    </div>
  );
}

// ─── Dropdown de filtre ───────────────────────────────────────────────────────
function SortDropdown({ value, onChange, theme, isDark }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const label = SORT_OPTS.find(o => o.value === value)?.label || 'Trier';

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 13px', borderRadius:12, border:`1px solid ${open ? '#111827' : theme.border}`, background: open ? 'rgba(17,24,39,0.1)' : theme.card, color: open ? '#111827' : theme.muted, fontWeight:700, fontSize:13, cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width:13, height:13 }}>
          <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="18" x2="12" y2="18"/>
        </svg>
        {label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width:11, height:11, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform .2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, minWidth:190, background:isDark?'#1c1c28':'#fff', border:`1px solid ${theme.border}`, borderRadius:14, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', zIndex:50, overflow:'hidden' }}>
          {SORT_OPTS.map(opt => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{ width:'100%', padding:'11px 16px', border:'none', background: value === opt.value ? 'rgba(17,24,39,0.1)' : 'transparent', color: value === opt.value ? '#111827' : theme.text, fontWeight: value === opt.value ? 800 : 600, fontSize:13, cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:8 }}>
              {value === opt.value && <span style={{ fontSize:10 }}>●</span>}
              {value !== opt.value && <span style={{ fontSize:10, opacity:0 }}>●</span>}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 5;

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ClientsPage() {
  const { theme }          = useTheme();
  const isDark             = theme.mode === 'dark';
  const [toast, showToast] = useToast();
  const { requestPin, PinModalNode } = useEmployeePinGate();

  const [view,      setView]      = useState('list');
  const [activeTab, setTab]       = useState('info');
  const [clients,   setClients]   = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState('');
  const [sort,      setSort]      = useState('name');
  const [fiche,     setFiche]     = useState(null);
  const [ficheLoad, setFicheLoad] = useState(false);
  const [editMode,  setEditMode]  = useState(false);
  const [form,      setForm]      = useState({ first_name:'', last_name:'', email:'', phone:'', notes:'' });
  const [noteText,  setNoteText]  = useState('');
  const [noteLoad,  setNoteLoad]  = useState(false);
  const [noteEmpId, setNoteEmpId] = useState('');
  const [inviting,  setInviting]  = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [confirmDel,setConfirmDel]= useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false); // modal confirmation blocage
  const [blockBusy,    setBlockBusy]    = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(0);

  // ── Crédit ──
  const [creditData,    setCreditData]    = useState(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditAmt,     setCreditAmt]     = useState('');
  const [creditNote,    setCreditNote]    = useState('');
  const [creditEmpId,   setCreditEmpId]   = useState('');
  const [repayAmt,      setRepayAmt]      = useState('');
  const [repayNote,     setRepayNote]     = useState('');
  const [repayEmpId,    setRepayEmpId]    = useState('');
  const [repayMethod,   setRepayMethod]   = useState('cash');
  const [creditBusy,    setCreditBusy]    = useState(false);
  const [creditMode,    setCreditMode]    = useState(null); // 'grant'|'repay'|null
  const [employees,     setEmployees]     = useState([]);

  // Charger la liste des employés une seule fois
  useEffect(() => {
    import('../utils/api').then(m => {
      (m.api || m.default?.api)?.getEmployees?.()
        .then(r => setEmployees(Array.isArray(r) ? r : (r?.employees || [])))
        .catch(() => {});
    });
  }, []);

  const card = { background:theme.card, border:`1px solid ${theme.border}`, borderRadius:20 };
  const inp  = { width:'100%', padding:'11px 14px', borderRadius:12, outline:'none', boxSizing:'border-box', border:`1px solid ${theme.border}`, fontSize:14, color:theme.text, background:isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.04)' };
  const lbl  = { fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:4 };

  // Charger 10 clients à la fois (pagination server-side)
  const loadList = useCallback(async (forceSearch = search, forcePage = page) => {
    setLoading(true);
    try {
      const r = await clientsApi.list({
        search: forceSearch,
        sort,
        limit:  PAGE_SIZE,
        offset: forcePage * PAGE_SIZE,
      });
      setClients(r.clients || []);
      setTotal(r.total || 0);
    } catch { showToast('Impossible de charger les clients', 'error'); }
    finally { setLoading(false); }
  }, [search, sort, page]);

  // Reset page quand la recherche ou le tri change
  useEffect(() => { setPage(0); }, [search, sort]);

  // Chargement auto (mount + changement page/tri) + debounce sur recherche
  useEffect(() => {
    const t = setTimeout(() => { setHasSearched(true); loadList(); }, search.trim() ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, sort, page]);

  const doSearch = () => {
    setHasSearched(true);
    setPage(0);
    loadList(search, 0);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openFiche = async (cl) => {
    setFiche(null); setFicheLoad(true); setEditMode(false); setTab('info');
    setNoteText(''); setNoteEmpId(''); setView('fiche');
    setCreditData(null); setCreditMode(null); setCreditAmt(''); setRepayAmt('');
    try {
      const r = await clientsApi.get(cl.id);
      setFiche(r);
      setForm({ first_name:r.first_name||'', last_name:r.last_name||'', email:r.email||'', phone:r.phone||'', notes:r.notes||'' });
    } catch { showToast('Erreur chargement fiche', 'error'); }
    finally { setFicheLoad(false); }
  };

  const loadCredit = async (clientId) => {
    setCreditLoading(true);
    try {
      const r = await creditsApi.getClient(clientId);
      setCreditData(r);
    } catch { setCreditData({ credit: null, history: [] }); }
    finally { setCreditLoading(false); }
  };

  const handleGrantCredit = async () => {
    if (!fiche || !creditAmt || parseFloat(creditAmt) <= 0) return showToast('Montant invalide', 'error');
    const emp = employees.find(e => e.id === creditEmpId) || null;
    await requestPin(
      emp,
      'Accorder un credit',
      async () => {
        setCreditBusy(true);
        try {
          const r = await creditsApi.grant({
            client_id:   fiche.id,
            amount:      parseFloat(creditAmt),
            note:        creditNote.trim() || undefined,
            employee_id: creditEmpId || undefined,
          });
          showToast(r.message || 'Crédit accorde ✓', 'ok');
          setCreditAmt(''); setCreditNote(''); setCreditEmpId(''); setCreditMode(null);
          await loadCredit(fiche.id);
        } catch(e) { showToast(e.message || 'Erreur', 'error'); }
        finally { setCreditBusy(false); }
      }
    );
  };

  const handleRepayCredit = async () => {
    if (!fiche || !repayAmt || parseFloat(repayAmt) <= 0) return showToast('Montant invalide', 'error');
    const emp = employees.find(e => e.id === repayEmpId) || null;
    await requestPin(
      emp,
      'Encaisser un remboursement credit',
      async () => {
        setCreditBusy(true);
        try {
          const r = await creditsApi.repay({
            client_id:      fiche.id,
            amount:         parseFloat(repayAmt),
            payment_method: repayMethod,
            note:           repayNote.trim() || undefined,
            employee_id:    repayEmpId || undefined,
          });
          showToast(r.message || 'Paiement enregistre ✓', 'ok');
          setRepayAmt(''); setRepayNote(''); setRepayEmpId(''); setRepayMethod('cash'); setCreditMode(null);
          await loadCredit(fiche.id);
        } catch(e) { showToast(e.message || 'Erreur', 'error'); }
        finally { setCreditBusy(false); }
      }
    );
  };

  const handleCreate = async () => {
    if (!form.first_name.trim() && !form.email.trim()) return showToast('Prenom ou email requis', 'error');
    setBusy(true);
    try {
      await clientsApi.create(form);
      showToast('Client crée ✓', 'ok');
      setView('list');
      setForm({ first_name:'', last_name:'', email:'', phone:'', notes:'' });
      if (hasSearched) loadList();
    } catch(e) { showToast(e.message || 'Erreur creation', 'error'); }
    finally { setBusy(false); }
  };

  const handleUpdate = async () => {
    if (!fiche) return;
    setBusy(true);
    try {
      const r = await clientsApi.update(fiche.id, form);
      setFiche(f => ({ ...f, ...r }));
      setEditMode(false);
      showToast('Mis a jour ✓', 'ok');
      if (hasSearched) loadList();
    } catch(e) {
      // Si le backend bloque la modification d'identite d'un compte global
      if (e.message?.includes('compte plateforme') || e.message?.includes('readonly')) {
        showToast('Informations verrouillées - ce client gere ses donnees lui-même', 'error');
      } else {
        showToast(e.message || 'Erreur mise a jour', 'error');
      }
    }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!fiche) return;
    try {
      await clientsApi.remove(fiche.id);
      showToast('Fiche supprimee', 'ok');
      setView('list'); setFiche(null);
      if (hasSearched) loadList();
    } catch { showToast('Erreur suppression', 'error'); }
    finally { setConfirmDel(false); }
  };

  const handleBlock = async () => {
    if (!fiche) return;
    const newBlocked = !fiche.is_booking_blocked;
    setBlockBusy(true);
    try {
      const updated = await clientsApi.block(fiche.id, newBlocked);
      setFiche(prev => ({ ...prev, is_booking_blocked: updated.is_booking_blocked, blocked_at: updated.blocked_at }));
      // Mettre à jour la liste si visible
      setClients(prev => prev.map(c => c.id === fiche.id ? { ...c, is_booking_blocked: updated.is_booking_blocked } : c));
      showToast(newBlocked ? '🚫 Client bloqué - plus de reservation possible' : '✅ Client débloque', newBlocked ? 'error' : 'ok');
    } catch { showToast('Erreur lors du blocage', 'error'); }
    finally { setBlockBusy(false); setConfirmBlock(false); }
  };

  const handleInvite = async () => {
    if (!fiche?.email) return showToast('Email requis pour inviter', 'error');
    setInviting(true);
    try {
      await clientsApi.invite(fiche.id);
      showToast('Invitation envoyee ✓', 'ok');
      setFiche(f => ({ ...f, invited:true }));
    } catch(e) { showToast(e.message || 'Erreur invitation', 'error'); }
    finally { setInviting(false); }
  };

  const handleNote = async () => {
    if (!noteText.trim() || !fiche) return;
    const noteEmp = employees.find(e => e.id === noteEmpId) || null;
    await requestPin(
      noteEmp,
      'Ajouter une note client',
      async () => {
        setNoteLoad(true);
        try {
          const empObj = employees.find(e => e.id === noteEmpId);
          await clientsApi.addNote(fiche.id, {
            note_text:     noteText.trim(),
            employee_id:   empObj?.id   || undefined,
            employee_name: empObj?.name || undefined,
          });
          setNoteText('');
          setNoteEmpId('');
          showToast('Note ajoutee ✓', 'ok');
          const r = await clientsApi.get(fiche.id);
          setFiche(r);
        } catch { showToast('Erreur ajout note', 'error'); }
        finally { setNoteLoad(false); }
      }
    );
  };

  const stickyHeader = {
    position:'sticky', top:0, zIndex:20,
    background: isDark?'rgba(0,0,0,0.92)':'rgba(242,242,247,0.92)',
    backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
    borderBottom:`1px solid ${theme.border}`,
  };

  const BackBtn = ({ onClick }) => (
    <button onClick={onClick} style={{ width:36, height:36, borderRadius:12, border:'none', cursor:'pointer', background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width:16, height:16, color:theme.muted }}><polyline points="15 18 9 12 15 6"/></svg>
    </button>
  );

  // ══ VUE LISTE ═══════════════════════════════════════════════════════════════
  if (view === 'list') return (
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

  // ══ VUE CRÉER ═══════════════════════════════════════════════════════════════
  if (view === 'create') return (
    <div style={{ background:theme.bg, minHeight:'100vh', paddingBottom:96 }} className="lg:pb-8">
      <Toast msg={toast?.msg} type={toast?.type} />
      <div style={{ ...stickyHeader, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
        <BackBtn onClick={() => setView('list')} />
        <h1 style={{ margin:0, fontSize:18, fontWeight:900, color:theme.text }}>Nouveau client</h1>
      </div>
      <div style={{ padding:'20px 16px', display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div><label style={lbl}>Prénom *</label><input value={form.first_name} onChange={e => setForm(f=>({...f,first_name:e.target.value}))} placeholder="Prénom" style={inp} /></div>
          <div><label style={lbl}>Nom</label><input value={form.last_name} onChange={e => setForm(f=>({...f,last_name:e.target.value}))} placeholder="Nom" style={inp} /></div>
        </div>
        <div><label style={lbl}>Email</label><input type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} placeholder="client@email.com" style={inp} /></div>
        <div><label style={lbl}>Téléphone</label><input value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))} placeholder="+33 6 00 00 00 00" style={inp} /></div>
        <div><label style={lbl}>Notes internes</label><textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder="Préférences, allergies, remarques…" rows={3} style={{ ...inp, resize:'vertical', fontFamily:'inherit', lineHeight:1.5 }} /></div>
        <button onClick={handleCreate} disabled={busy}
          style={{ padding:'15px', borderRadius:16, background:'Black', border:'none', color:'white', fontWeight:800, fontSize:15, cursor:'pointer', opacity:busy?0.65:1, boxShadow:'0 6px 20px rgba(17,24,39,0.3)' }}>
          {busy ? 'Creation...' : '✓ Creer le client'}
        </button>
      </div>
    </div>
  );

  // ══ VUE FICHE ═══════════════════════════════════════════════════════════════
  if (view === 'fiche') return (
    <div style={{ background:theme.bg, minHeight:'100vh', paddingBottom:96 }}>
      <Toast msg={toast?.msg} type={toast?.type} />
      <Confirm open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={handleDelete}
        title={fiche?.global_client_id ? "Retirer ce client ?" : "Supprimer ce client ?"}
        desc={fiche?.global_client_id
          ? "La relation avec ce client sera supprimée de votre liste. Son compte plateforme et son historique global restent intacts."
          : "Cette action supprimera définitivement la fiche de ce client interne."}
        theme={theme} />

      <Confirm
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={handleBlock}
        title={fiche?.is_booking_blocked ? "Débloquer ce client ?" : "Bloquer ce client ?"}
        desc={fiche?.is_booking_blocked
          ? "Ce client pourra à nouveau prendre rendez-vous en ligne chez vous."
          : "Ce client ne pourra plus effectuer de réservation en ligne chez vous. Vous pouvez le débloquer à tout moment."}
        theme={theme} />

      <div style={{ ...stickyHeader, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
        <BackBtn onClick={() => { setView('list'); setEditMode(false); }} />
        <span style={{ fontWeight:800, fontSize:16, color:theme.text, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {fiche ? [fiche.first_name, fiche.last_name].filter(Boolean).join(' ') || 'Fiche client' : '...'}
        </span>
        {fiche && (
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {/* Bouton Bloquer / Débloquer */}
            <button
              onClick={() => setConfirmBlock(true)}
              disabled={blockBusy}
              title={fiche.is_booking_blocked ? 'Débloquer les reservations' : 'Bloquer les reservations'}
              style={{ padding:'6px 10px', borderRadius:10,
                background: fiche.is_booking_blocked ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${fiche.is_booking_blocked ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.15)'}`,
                color: fiche.is_booking_blocked ? '#f59e0b' : '#ef4444',
                fontWeight:700, fontSize:12, cursor:'pointer', opacity: blockBusy ? 0.5 : 1 }}>
              {fiche.is_booking_blocked ? '🔓' : '🚫'}
            </button>
            {/* Bouton Supprimer */}
            <button onClick={() => setConfirmDel(true)}
              style={{ padding:'6px 12px', borderRadius:10, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.15)', color:'#ef4444', fontWeight:700, fontSize:12, cursor:'pointer' }}>
              🗑
            </button>
          </div>
        )}
      </div>

      {ficheLoad ? (
        <div style={{ textAlign:'center', padding:'64px 0', color:theme.muted }}>
          <div style={{ width:40, height:40, borderRadius:'50%', border:`3px solid ${theme.border}`, borderTopColor:'#111827', animation:'spin 0.8s linear infinite', margin:'0 auto 14px' }} />
        </div>
      ) : fiche ? (
        <div style={{ padding:'14px 14px 0' }}>

          {/* Carte identité */}
          <div style={{ ...card, padding:18, marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom: editMode ? 16 : 0 }}>
              <Avatar cl={fiche} size={54} radius={17} fontSize={22} />
              <div style={{ flex:1, minWidth:0 }}>
                <h2 style={{ margin:'0 0 3px', fontSize:18, fontWeight:900, color:theme.text }}>{[fiche.first_name,fiche.last_name].filter(Boolean).join(' ')||'-'}</h2>
                {fiche.email && <p style={{ margin:'0 0 1px', fontSize:13, color:theme.muted }}>{fiche.email}</p>}
                {fiche.phone && <p style={{ margin:0, fontSize:13, color:theme.muted }}>{fiche.phone}</p>}
              </div>

              {/* ÉTAPE 2 : bouton Éditer — toujours visible mais mode différent selon type */}
              <button onClick={() => {
                if (!editMode) setForm({ first_name:fiche.first_name||'', last_name:fiche.last_name||'', email:fiche.email||'', phone:fiche.phone||'', notes:fiche.notes||'' });
                setEditMode(v=>!v);
              }}
                style={{ padding:'7px 13px', borderRadius:10, background:editMode?theme.border:'rgba(17,24,39,0.1)', border:`1px solid ${editMode?theme.border:'rgba(17,24,39,0.2)'}`, color:editMode?theme.muted:'#111827', fontWeight:700, fontSize:12, cursor:'pointer', flexShrink:0 }}>
                {editMode ? 'Annuler' : '✏️ Éditer'}
              </button>
            </div>

            {/* ÉTAPE 6 — Badge type client bien visible */}
            {!editMode && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:12, marginTop:12, borderTop:`1px solid ${theme.border}` }}>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {fiche.global_client_id ? (
                    <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:99, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.2)' }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:'#10b981' }} />
                      <span style={{ fontSize:11, fontWeight:800, color:'#10b981' }}>Compte plateforme</span>
                    </div>
                  ) : fiche.source === 'booking' ? (
                    <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:99, background:'rgba(17,24,39,0.08)', border:'1px solid rgba(17,24,39,0.15)' }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:'#111827' }} />
                      <span style={{ fontSize:11, fontWeight:800, color:'#111827' }}>Réservation en ligne</span>
                    </div>
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:99, background:'rgba(148,163,184,0.1)', border:'1px solid rgba(148,163,184,0.2)' }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:'#64748b' }} />
                      <span style={{ fontSize:11, fontWeight:800, color:'#64748b' }}>Client interne</span>
                    </div>
                  )}
                  {/* Badge BLOQUÉ */}
                  {fiche.is_booking_blocked && (
                    <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:99, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)' }}>
                      <span style={{ fontSize:11 }}>🚫</span>
                      <span style={{ fontSize:11, fontWeight:800, color:'#ef4444' }}>Réservations bloquées</span>
                    </div>
                  )}
                </div>

                {/* ÉTAPE 7 — Bouton invitation amélioré */}
                {fiche.email && !fiche.global_client_id && (
                  <button onClick={handleInvite} disabled={inviting || fiche.invited}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:10, background: fiche.invited ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.1)', border:`1px solid ${fiche.invited ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.25)'}`, color:'#10b981', fontWeight:700, fontSize:12, cursor: fiche.invited ? 'default' : 'pointer', opacity:inviting?0.6:1 }}>
                    {fiche.invited ? '✓ Invitation envoyee' : inviting ? '...' : '📧 Inviter a creer un compte'}
                  </button>
                )}
              </div>
            )}

            {/* ÉTAPE 2 — Formulaire d'édition avec champs verrouillés pour compte global */}
            {editMode && (
              <div style={{ display:'flex', flexDirection:'column', gap:10, paddingTop:14, borderTop:`1px solid ${theme.border}` }}>

                {/* Avertissement compte global */}
                {fiche.global_client_id && (
                  <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px', borderRadius:12, background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)', marginBottom:2 }}>
                    <span style={{ fontSize:15, flexShrink:0 }}>🔒</span>
                    <div>
                      <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#d97706' }}>Informations verrouillées</p>
                      <p style={{ margin:'2px 0 0', fontSize:11, color:'#92400e' }}>Ce client possède un compte plateforme. Il gère lui-même son nom, email et téléphone. Seules les notes internes sont modifiables.</p>
                    </div>
                  </div>
                )}

                {/* Champs identité — disabled si compte global */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div>
                    <label style={{ ...lbl, display:'flex', alignItems:'center', gap:4 }}>
                      Prénom {fiche.global_client_id && <span style={{ fontSize:10, color:'#f59e0b' }}>🔒</span>}
                    </label>
                    <input value={form.first_name} onChange={e=>setForm(f=>({...f,first_name:e.target.value}))}
                      disabled={!!fiche.global_client_id}
                      style={{ ...inp, opacity:fiche.global_client_id?0.5:1, cursor:fiche.global_client_id?'not-allowed':'text' }} />
                  </div>
                  <div>
                    <label style={{ ...lbl, display:'flex', alignItems:'center', gap:4 }}>
                      Nom {fiche.global_client_id && <span style={{ fontSize:10, color:'#f59e0b' }}>🔒</span>}
                    </label>
                    <input value={form.last_name} onChange={e=>setForm(f=>({...f,last_name:e.target.value}))}
                      disabled={!!fiche.global_client_id}
                      style={{ ...inp, opacity:fiche.global_client_id?0.5:1, cursor:fiche.global_client_id?'not-allowed':'text' }} />
                  </div>
                </div>
                <div>
                  <label style={{ ...lbl, display:'flex', alignItems:'center', gap:4 }}>
                    Email {fiche.global_client_id && <span style={{ fontSize:10, color:'#f59e0b' }}>🔒</span>}
                  </label>
                  <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
                    disabled={!!fiche.global_client_id}
                    style={{ ...inp, opacity:fiche.global_client_id?0.5:1, cursor:fiche.global_client_id?'not-allowed':'text' }} />
                </div>
                <div>
                  <label style={{ ...lbl, display:'flex', alignItems:'center', gap:4 }}>
                    Téléphone {fiche.global_client_id && <span style={{ fontSize:10, color:'#f59e0b' }}>🔒</span>}
                  </label>
                  <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}
                    disabled={!!fiche.global_client_id}
                    style={{ ...inp, opacity:fiche.global_client_id?0.5:1, cursor:fiche.global_client_id?'not-allowed':'text' }} />
                </div>
                <div>
                  <label style={lbl}>Notes internes</label>
                  <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}
                    style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} />
                </div>
                <button onClick={handleUpdate} disabled={busy}
                  style={{ padding:'12px', borderRadius:12, background:'Black', border:'none', color:'white', fontWeight:800, fontSize:14, cursor:'pointer', opacity:busy?0.65:1 }}>
                  {busy ? 'Enregistrement...' : fiche.global_client_id ? '✓ Enregistrer les notes' : '✓ Enregistrer'}
                </button>
              </div>
            )}
          </div>

          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
            {[
              ['👁', fiche.total_visits||fiche.tx_count||0, 'Visites'],
              ['💶', `${Number(fiche.total_spent||0).toFixed(0)}€`, 'Dépense'],
              ['🎫', fiche.loyalty_mode==='points'?Math.floor(fiche.points||0):(fiche.stamps||0), fiche.loyalty_mode==='points'?'Pts':'Tamb.'],
              ['🎁', fiche.rewards_earned||0, 'Recomp.'],
            ].map(([ic, val, l2]) => (
              <div key={l2} style={{ ...card, padding:'11px 8px', textAlign:'center' }}>
                <div style={{ fontSize:19 }}>{ic}</div>
                <p style={{ margin:'3px 0 1px', fontSize:16, fontWeight:900, color:theme.text }}>{val}</p>
                <p style={{ margin:0, fontSize:10, color:theme.muted, fontWeight:700 }}>{l2}</p>
              </div>
            ))}
          </div>

          {/* Onglets */}
          <div style={{ display:'flex', background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)', borderRadius:14, padding:4, marginBottom:12 }}>
            {[['info','ℹ️ Infos'],['credit','💳 Credit'],['notes','📝 Notes'],['history','📅 Historique']].map(([t,l2]) => (
              <button key={t} onClick={() => {
                setTab(t);
                if (t === 'credit' && !creditData) loadCredit(fiche.id);
              }}
                style={{ flex:1, padding:'9px 4px', borderRadius:10, border:'none', fontWeight:700, fontSize:11, cursor:'pointer', background:activeTab===t?theme.card:'transparent', color:activeTab===t?theme.text:theme.muted, boxShadow:activeTab===t?'0 1px 4px rgba(0,0,0,0.1)':'none', transition:'all .15s', position:'relative' }}>
                {l2}
                {/* Badge solde si crédit actif */}
                {t === 'credit' && creditData?.credit && parseFloat(creditData.credit.balance) > 0 && (
                  <span style={{ position:'absolute', top:2, right:2, width:7, height:7, borderRadius:'50%', background:'#ef4444' }} />
                )}
              </button>
            ))}
          </div>

          {/* Onglet Infos */}
          {activeTab === 'info' && (
            <div style={{ ...card, padding:'4px 16px', marginBottom:12 }}>
              {[
                ['📧','Email',fiche.email],
                ['📞','Télephone',fiche.phone],
                ['📅','Premier contact',fmtDate(fiche.created_at)],
                ['🕐','Derniere visite',fmtDate(fiche.last_visit)],
                ['📝','Notes internes',fiche.notes],
              ].filter(([,,v])=>v).map(([ic,l2,val]) => (
                <div key={l2} style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'12px 0', borderBottom:`1px solid ${theme.border}` }}>
                  <span style={{ fontSize:16, flexShrink:0, lineHeight:1.6 }}>{ic}</span>
                  <div style={{ minWidth:0 }}>
                    <p style={{ margin:0, fontSize:11, color:theme.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>{l2}</p>
                    <p style={{ margin:'2px 0 0', fontSize:14, color:theme.text, fontWeight:600, wordBreak:'break-word', lineHeight:1.5 }}>{val}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Onglet Crédit */}
          {activeTab === 'credit' && (() => {
            const PAYMENT_METHODS = [
              { id:'card',     label:'Carte bancaire', icon:'💳' },
              { id:'cash',     label:'Especes',        icon:'💵' },
              { id:'transfer', label:'Virement',       icon:'🏦' },
              { id:'other',    label:'Autre',          icon:'•••' },
            ];
            const lbl2 = { fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' };
            const balance = creditData?.credit ? parseFloat(creditData.credit.balance) : 0;
            const hasDebt = balance > 0;

            return (
            <div style={{ marginBottom:12 }}>
              {creditLoading ? (
                <div style={{ textAlign:'center', padding:'40px 0' }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', border:`3px solid ${theme.border}`, borderTopColor:'#111827', animation:'spin 0.8s linear infinite', margin:'0 auto' }} />
                </div>
              ) : (<>

                {/* ── Carte solde ── */}
                <div style={{ ...card, padding:20, marginBottom:12, background: hasDebt ? 'linear-gradient(135deg,rgba(239,68,68,0.06),rgba(239,68,68,0.02))' : theme.card, border: hasDebt ? '1.5px solid rgba(239,68,68,0.2)' : `1px solid ${theme.border}` }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
                    <div>
                      <p style={{ fontSize:11, fontWeight:700, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Solde crédit</p>
                      <p style={{ fontSize:38, fontWeight:900, color: hasDebt ? '#ef4444' : '#22c55e', margin:0, lineHeight:1 }}>
                        {balance.toFixed(2)} €
                      </p>
                    </div>
                    <span style={{ fontSize:11, fontWeight:800, padding:'4px 10px', borderRadius:99,
                      background: hasDebt ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                      color: hasDebt ? '#ef4444' : '#22c55e', marginTop:2 }}>
                      {hasDebt ? '⚠ En attente' : creditData?.credit ? '✓ Solde' : 'Aucun credit'}
                    </span>
                  </div>
                  {creditData?.credit && (
                    <div style={{ display:'flex', gap:20, marginTop:14, paddingTop:12, borderTop:`1px solid ${theme.border}` }}>
                      <div>
                        <p style={{ fontSize:10, color:theme.muted, fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>Accordé</p>
                        <p style={{ fontSize:15, fontWeight:900, color:'#f87171', margin:0 }}>{parseFloat(creditData.credit.total_granted).toFixed(2)} €</p>
                      </div>
                      <div>
                        <p style={{ fontSize:10, color:theme.muted, fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>Remboursé</p>
                        <p style={{ fontSize:15, fontWeight:900, color:'#4ade80', margin:0 }}>{parseFloat(creditData.credit.total_repaid).toFixed(2)} €</p>
                      </div>
                      {hasDebt && (
                        <div>
                          <p style={{ fontSize:10, color:theme.muted, fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>Reste dû</p>
                          <p style={{ fontSize:15, fontWeight:900, color:'#ef4444', margin:0 }}>{balance.toFixed(2)} €</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Boutons actions ── */}
                <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                  <button onClick={() => setCreditMode(creditMode === 'grant' ? null : 'grant')}
                    style={{ flex:1, padding:'12px 8px', borderRadius:12, cursor:'pointer', fontWeight:800, fontSize:13,
                      border:`1.5px solid ${creditMode==='grant' ? '#111827' : 'rgba(17,24,39,0.3)'}`,
                      background: creditMode==='grant' ? 'rgba(17,24,39,0.1)' : 'transparent',
                      color:'#111827' }}>
                    + Accorder un crédit
                  </button>
                  {hasDebt && (
                    <button onClick={() => setCreditMode(creditMode === 'repay' ? null : 'repay')}
                      style={{ flex:1, padding:'12px 8px', borderRadius:12, cursor:'pointer', fontWeight:800, fontSize:13,
                        border:`1.5px solid ${creditMode==='repay' ? '#22c55e' : 'rgba(34,197,94,0.3)'}`,
                        background: creditMode==='repay' ? 'rgba(34,197,94,0.1)' : 'transparent',
                        color:'#22c55e' }}>
                      ↩ Encaisser paiement
                    </button>
                  )}
                </div>

                {/* ── Formulaire : Accorder un crédit ── */}
                {creditMode === 'grant' && (
                  <div style={{ ...card, padding:16, marginBottom:12, border:'1.5px solid rgba(17,24,39,0.2)' }}>
                    <p style={{ fontSize:12, fontWeight:800, color:'#111827', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.07em' }}>
                      Accorder un crédit
                    </p>

                    {/* Montant */}
                    <div style={{ marginBottom:12 }}>
                      <label style={lbl2}>Montant (€) *</label>
                      <input type="number" min="0.01" step="0.01" placeholder="0.00"
                        value={creditAmt} onChange={e=>setCreditAmt(e.target.value)}
                        style={{ ...inp, fontSize:22, fontWeight:900, textAlign:'center', padding:'14px' }} />
                    </div>

                    {/* Employé */}
                    {employees.length > 0 && (
                      <div style={{ marginBottom:12 }}>
                        <label style={lbl2}>Employé concerné</label>
                        <select value={creditEmpId} onChange={e=>setCreditEmpId(e.target.value)}
                          style={{ ...inp, cursor:'pointer' }}>
                          <option value="" disabled>Sélectionner un employé</option>
                          {employees.filter(e=>e.is_active).map(e => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Note */}
                    <div style={{ marginBottom:14 }}>
                      <label style={lbl2}>Note / motif (optionnel)</label>
                      <input placeholder="Ex : Coupe du 12/03, prestation reportée…"
                        value={creditNote} onChange={e=>setCreditNote(e.target.value)}
                        style={inp} />
                    </div>

                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => { setCreditMode(null); setCreditAmt(''); setCreditNote(''); setCreditEmpId(''); }}
                        style={{ flex:1, padding:'11px', borderRadius:10, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, fontSize:13, cursor:'pointer' }}>
                        Annuler
                      </button>
                      <button onClick={handleGrantCredit} disabled={creditBusy||!creditAmt||parseFloat(creditAmt)<=0}
                        style={{ flex:2, padding:'11px', borderRadius:10, background:'#1a73e8', border:'none', color:'white', fontWeight:800, fontSize:13, cursor:'pointer', opacity:!creditAmt||parseFloat(creditAmt)<=0?0.45:1 }}>
                        {creditBusy ? '...' : `Confirmer ${creditAmt ? parseFloat(creditAmt).toFixed(2)+' €' : ''}`}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Formulaire : Encaisser un paiement ── */}
                {creditMode === 'repay' && creditData?.credit && (
                  <div style={{ ...card, padding:16, marginBottom:12, border:'1.5px solid rgba(34,197,94,0.2)' }}>
                    <p style={{ fontSize:12, fontWeight:800, color:'#22c55e', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.07em' }}>
                      Encaisser un paiement — Solde dû : <span style={{ color:'#ef4444' }}>{balance.toFixed(2)} €</span>
                    </p>

                    {/* Montant */}
                    <div style={{ marginBottom:10 }}>
                      <label style={lbl2}>Montant encaissé (€) *</label>
                      <input type="number" min="0.01" step="0.01" placeholder="0.00"
                        max={balance}
                        value={repayAmt} onChange={e=>setRepayAmt(e.target.value)}
                        style={{ ...inp, fontSize:22, fontWeight:900, textAlign:'center', padding:'14px' }} />
                    </div>

                    {/* Raccourcis montant */}
                    <div style={{ display:'flex', gap:6, marginBottom:14 }}>
                      {[25, 50, 75].map(pct => {
                        const v = (balance * pct / 100).toFixed(2);
                        return (
                          <button key={pct} onClick={() => setRepayAmt(v)}
                            style={{ flex:1, padding:'8px 4px', borderRadius:8, border:`1px solid ${theme.border}`, background: repayAmt===v ? 'rgba(34,197,94,0.15)' : theme.inputBg, color: repayAmt===v ? '#22c55e' : theme.muted, fontWeight:700, fontSize:11, cursor:'pointer' }}>
                            {pct}%<br/><span style={{ fontSize:10 }}>{v}€</span>
                          </button>
                        );
                      })}
                      <button onClick={() => setRepayAmt(balance.toFixed(2))}
                        style={{ flex:1, padding:'8px 4px', borderRadius:8, border:'1.5px solid rgba(34,197,94,0.4)', background: repayAmt===balance.toFixed(2) ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.06)', color:'#22c55e', fontWeight:800, fontSize:11, cursor:'pointer' }}>
                        Tout<br/><span style={{ fontSize:10 }}>{balance.toFixed(2)}€</span>
                      </button>
                    </div>

                    {/* Moyen de paiement */}
                    <div style={{ marginBottom:12 }}>
                      <label style={lbl2}>Moyen de paiement *</label>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                        {PAYMENT_METHODS.map(pm => (
                          <button key={pm.id} onClick={() => setRepayMethod(pm.id)}
                            style={{ padding:'12px 10px', borderRadius:12, cursor:'pointer', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:8,
                              border: repayMethod===pm.id ? '2px solid #111827' : `1.5px solid ${theme.border}`,
                              background: repayMethod===pm.id ? 'rgba(17,24,39,0.08)' : theme.card,
                              color: repayMethod===pm.id ? '#111827' : theme.text }}>
                            <span style={{ fontSize:18 }}>{pm.icon}</span>
                            <span>{pm.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Employé encaissant */}
                    {employees.length > 0 && (
                      <div style={{ marginBottom:12 }}>
                        <label style={lbl2}>Encaissé par</label>
                        <select value={repayEmpId} onChange={e=>setRepayEmpId(e.target.value)}
                          style={{ ...inp, cursor:'pointer' }}>
                          <option value="" disabled>Sélectionner un employé</option>
                          {employees.filter(e=>e.is_active).map(e => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Note */}
                    <div style={{ marginBottom:14 }}>
                      <label style={lbl2}>Note (optionnelle)</label>
                      <input placeholder="Référence, commentaire…"
                        value={repayNote} onChange={e=>setRepayNote(e.target.value)}
                        style={inp} />
                    </div>

                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => { setCreditMode(null); setRepayAmt(''); setRepayNote(''); setRepayEmpId(''); setRepayMethod('cash'); }}
                        style={{ flex:1, padding:'11px', borderRadius:10, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, fontSize:13, cursor:'pointer' }}>
                        Annuler
                      </button>
                      <button onClick={handleRepayCredit} disabled={creditBusy||!repayAmt||parseFloat(repayAmt)<=0}
                        style={{ flex:2, padding:'11px', borderRadius:10, background:'linear-gradient(135deg,#22c55e,#16a34a)', border:'none', color:'white', fontWeight:800, fontSize:13, cursor:'pointer', opacity:!repayAmt||parseFloat(repayAmt)<=0?0.45:1 }}>
                        {creditBusy ? '...' : `✓ Encaisser ${repayAmt ? parseFloat(repayAmt).toFixed(2)+' €' : ''}`}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Historique des opérations ── */}
                {creditData?.history?.length > 0 ? (
                  <div>
                    <p style={{ fontSize:11, fontWeight:800, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Historique des opérations</p>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {creditData.history.map((op, i) => {
                        const isGrant = op.type === 'grant';
                        const PLABELS = { cash:'Especes', card:'Carte', transfer:'Virement', other:'Autre' };
                        return (
                          <div key={i} style={{ ...card, padding:'12px 14px', display:'flex', alignItems:'flex-start', gap:12 }}>
                            <div style={{
                              width:38, height:38, borderRadius:11, flexShrink:0,
                              background: isGrant ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                              display:'flex', alignItems:'center', justifyContent:'center', fontSize:18,
                            }}>
                              {isGrant ? '📤' : '💰'}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
                                <p style={{ margin:0, fontSize:13, fontWeight:800, color:theme.text }}>
                                  {isGrant ? 'Crédit accorde' : 'Remboursement encaisse'}
                                </p>
                                <span style={{ fontSize:15, fontWeight:900, color: isGrant ? '#ef4444' : '#22c55e', flexShrink:0, marginLeft:8 }}>
                                  {isGrant ? '+' : '-'}{parseFloat(op.amount).toFixed(2)} €
                                </span>
                              </div>
                              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                                <span style={{ fontSize:11, color:theme.muted }}>{fmtDate(op.created_at)}</span>
                                {op.employee_name && (
                                  <span style={{ fontSize:11, color:'#111827', fontWeight:700 }}>· {op.employee_name}</span>
                                )}
                                {!isGrant && op.payment_method && (
                                  <span style={{ fontSize:11, padding:'1px 7px', borderRadius:99, background:'rgba(17,24,39,0.08)', color:'#111827', fontWeight:700 }}>
                                    {PLABELS[op.payment_method] || op.payment_method}
                                  </span>
                                )}
                                {!isGrant && op.transaction_id && (
                                  <span style={{ fontSize:10, color:'#22c55e', fontWeight:700 }}>✓ En caisse</span>
                                )}
                              </div>
                              {op.note && <p style={{ margin:'3px 0 0', fontSize:11, color:theme.muted, fontStyle:'italic' }}>{op.note}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : !creditData?.credit ? (
                  <div style={{ textAlign:'center', padding:'36px 0', color:theme.muted }}>
                    <p style={{ fontSize:36, marginBottom:10 }}>💳</p>
                    <p style={{ fontSize:15, fontWeight:700, color:theme.text, marginBottom:4 }}>Aucun crédit pour ce client</p>
                    <p style={{ fontSize:12 }}>Cliquez sur "Accorder un crédit" pour commencer</p>
                  </div>
                ) : null}

              </>)}
            </div>
            );
          })()}

          {/* Onglet Notes */}
          {activeTab === 'notes' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:12 }}>
              <div style={{ ...card, padding:14 }}>
                {/* Sélecteur employé pour la note */}
                {employees.length > 0 && (
                  <div style={{ marginBottom:10 }}>
                    <label style={lbl}>Employé qui ajoute la note</label>
                    <select value={noteEmpId} onChange={e => setNoteEmpId(e.target.value)}
                      style={{ ...inp, cursor:'pointer' }}>
                      <option value="" disabled>Sélectionner un employé</option>
                      {employees.filter(e => e.is_active).map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                    {noteEmpId && (
                      <p style={{ margin:'4px 0 0', fontSize:11, color:'#111827' }}>
                        🔐 Code PIN de {employees.find(e=>e.id===noteEmpId)?.name} requis pour valider
                      </p>
                    )}
                  </div>
                )}
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Ajouter une note interne sur ce client…" rows={3}
                  style={{ ...inp, resize:'vertical', marginBottom:10, fontFamily:'inherit', lineHeight:1.5 }} />
                <button onClick={handleNote} disabled={noteLoad||!noteText.trim()}
                  style={{ width:'100%', padding:'11px', borderRadius:12, background:'Black', border:'none', color:'white', fontWeight:800, fontSize:14, cursor:'pointer', opacity:noteLoad||!noteText.trim()?0.55:1 }}>
                  {noteLoad ? 'Ajout...' : '+ Ajouter la note'}
                </button>
              </div>
              {(fiche.notes_list||[]).length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px 0', color:theme.muted }}>
                  <p style={{ fontSize:32, margin:'0 0 8px' }}>📝</p>
                  <p style={{ fontSize:14, fontWeight:600 }}>Aucune note pour l'instant</p>
                </div>
              ) : (fiche.notes_list||[]).map((n,i) => (
                <div key={i} style={{ ...card, padding:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span style={{ fontSize:12, fontWeight:800, color:'#111827' }}>{n.employee_name||'Admin'}</span>
                    <span style={{ fontSize:11, color:theme.muted }}>{fmtDate(n.created_at)}</span>
                  </div>
                  <p style={{ margin:0, fontSize:14, color:theme.text, lineHeight:1.55 }}>{n.note_text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Onglet Historique */}
          {activeTab === 'history' && (
            <div style={{ marginBottom:12 }}>
              {(fiche.transactions||[]).length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:800, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.07em' }}>Encaissements</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {fiche.transactions.map((tx,i) => (
                      <div key={i} style={{ ...card, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div style={{ minWidth:0 }}>
                          <p style={{ margin:0, fontSize:13, fontWeight:700, color:theme.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.description||'Encaissement'}</p>
                          <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>{fmtDate(tx.date)}{tx.employee_name?` · ${tx.employee_name}`:''}</p>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0, marginLeft:10 }}>
                          {tx.original_amount && tx.original_amount !== tx.amount && (
                            <p style={{ margin:0, fontSize:11, color:theme.muted, textDecoration:'line-through' }}>{Number(tx.original_amount).toFixed(2)} €</p>
                          )}
                          <span style={{ fontSize:15, fontWeight:900, color:'#10b981' }}>{Number(tx.amount||0).toFixed(2)} €</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(fiche.appointments||[]).length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:800, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.07em' }}>Rendez-vous</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {fiche.appointments.map((a,i) => (
                      <div key={i} style={{ ...card, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div style={{ minWidth:0 }}>
                          <p style={{ margin:0, fontSize:13, fontWeight:700, color:theme.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.service_name||'Rendez-vous'}</p>
                          <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>{fmtDate(a.date)}{a.start_time?` · ${String(a.start_time).slice(0,5)}`:''}</p>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99, flexShrink:0, marginLeft:8, color:STATUS_COLOR[a.status]||'#94a3b8', background:`${STATUS_COLOR[a.status]||'#94a3b8'}18` }}>
                          {STATUS_LABEL[a.status]||a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(fiche.transactions||[]).length===0 && (fiche.appointments||[]).length===0 && (
                <div style={{ textAlign:'center', padding:'40px 0', color:theme.muted }}>
                  <p style={{ fontSize:32, margin:'0 0 8px' }}>📭</p>
                  <p style={{ fontSize:14, fontWeight:600 }}>Aucun historique disponible</p>
                </div>
              )}
            </div>
          )}

        </div>
      ) : null}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {PinModalNode}
    </div>
  );

  return null;
}
