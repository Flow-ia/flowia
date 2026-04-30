// src/pages/clients/index.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clientsApi, creditsApi } from '../../utils/api';
import { useTheme } from '../../hooks/useTheme';
import { useToast } from '../../components/UI';
import { useEmployeePinGate } from '../../components/EmployeePinModal';

import { PAGE_SIZE } from './constants';
import ListView from './views/ListView';
import CreateView from './views/CreateView';
import FicheView from './views/FicheView';
import DebtsView from './views/DebtsView';

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ClientsPage() {
  const { theme }          = useTheme();
  const isDark             = theme.mode === 'dark';
  const [toast, showToast] = useToast();
  const { requestPin, PinModalNode } = useEmployeePinGate();

  // Init view depuis ?view=debts dans l'URL pour permettre les deep-links
  // depuis la page Caisse -> Credit ("Voir dans Créances (dettes) →").
  const location = useLocation();
  const navigate = useNavigate();
  const initialView = (() => {
    try {
      const v = new URLSearchParams(location.search).get('view');
      return v === 'debts' ? 'debts' : 'list';
    } catch { return 'list'; }
  })();
  const [view,      setView]      = useState(initialView);
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
  // Refonte FDS-2026 commit 8 : filtres segmentés
  // (Tous / Fidèles / Anniv. mois / Avec crédit / Nouveaux / Inactifs / Bloqués).
  // Un filtre actif (≠ 'all') force un fetch large (limit 500) et désactive
  // la pagination serveur : le predicate s'applique côté front. Pour "Tous"
  // on conserve PAGE_SIZE + pagination serveur (zéro régression).
  const [filter, setFilter] = useState('all');

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
    import('../../utils/api').then(m => {
      (m.api || m.default?.api)?.getEmployees?.()
        .then(r => setEmployees(Array.isArray(r) ? r : (r?.employees || [])))
        .catch(() => {});
    });
  }, []);

  const card = {
    background: theme.card,
    border: `0.5px solid ${theme.border}`,
    borderRadius: 12,
  };
  const inp = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box',
    border: `0.5px solid ${theme.borderInput}`,
    fontSize: 14,
    color: theme.text,
    background: theme.inputBg,
    fontFamily: 'inherit',
  };
  const lbl = {
    fontSize: 12,
    fontWeight: 500,
    color: theme.muted,
    display: 'block',
    marginBottom: 6,
  };

  // Pagination 100% serveur, y compris pour les filtres segmentes (loyal,
  // birthday_month, with_credit, new, inactive, blocked) — backend gere les
  // predicates en SQL avec WITH base AS (...) puis filter+limit+offset.
  // Charge PAGE_SIZE=5 clients par requete, jamais plus, quel que soit le filtre.
  // Min 2 caracteres pour la recherche (sinon req renvoie tout, surcharge inutile).
  const loadListSeqRef = useRef(0);
  const loadList = useCallback(async (forceSearch = search, forcePage = page) => {
    const seq = ++loadListSeqRef.current;
    setLoading(true);
    try {
      const trimmed = String(forceSearch || '').trim();
      // Min 2 chars pour la recherche : sinon on ignore le terme cote frontend.
      const sendSearch = trimmed.length >= 2 ? trimmed : '';
      const r = await clientsApi.list({
        search: sendSearch,
        sort,
        filter,
        limit:  PAGE_SIZE,
        offset: forcePage * PAGE_SIZE,
      });
      // Drop si reponse perimee (l'utilisateur a tape autre chose entre-temps)
      if (seq !== loadListSeqRef.current) return;
      setClients(r.clients || []);
      setTotal(r.total || 0);
    } catch {
      if (seq === loadListSeqRef.current) showToast('Impossible de charger les clients', 'error');
    } finally {
      if (seq === loadListSeqRef.current) setLoading(false);
    }
  }, [search, sort, page, filter]);

  // Reset page quand la recherche, le tri ou le filtre change
  useEffect(() => { setPage(0); }, [search, sort, filter]);

  // Chargement auto (mount + changement page/tri/filter) + debounce sur recherche.
  // Si l'utilisateur a tape >= 2 chars, on attend 350ms (debounce). Sinon on
  // charge tout de suite (cas changement page/tri/filter sans saisie).
  useEffect(() => {
    const trimmed = search.trim();
    const needsDebounce = trimmed.length >= 2;
    const t = setTimeout(() => { setHasSearched(true); loadList(); }, needsDebounce ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, sort, page, filter]);

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
    if (!creditEmpId) return showToast('Sélectionnez un employé signataire.', 'error');
    const emp = employees.find(e => e.id === creditEmpId) || null;
    if (!emp) return showToast('Employé introuvable.', 'error');
    await requestPin(
      emp,
      'Accorder un credit',
      async () => {
        setCreditBusy(true);
        try {
          // Backend exige PIN employé (header x-employee-pin via actingEmployeeId).
          const r = await creditsApi.grant({
            client_id:   fiche.id,
            amount:      parseFloat(creditAmt),
            note:        creditNote.trim() || undefined,
            employee_id: emp.id,
          }, emp.id);
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
          // Le backend crée une transaction 'revenue' en parallèle : on notifie
          // App.jsx pour qu'il recharge `transactions` sans attendre un reload
          // manuel (sinon Dashboard/Historique affichent état périmé).
          try { window.dispatchEvent(new Event('ff-tx-refresh')); } catch {}
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
      showToast(newBlocked ? 'Client bloqué · plus de réservation possible' : 'Client débloqué', newBlocked ? 'error' : 'ok');
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
    position: 'sticky',
    top: 0,
    zIndex: 20,
    background: theme.stickyBg || theme.bg,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: `0.5px solid ${theme.border}`,
  };

  // ══ VUE LISTE ═══════════════════════════════════════════════════════════════
  if (view === 'list') return (
    <ListView
      theme={theme} isDark={isDark} toast={toast}
      stickyHeader={stickyHeader} card={card} inp={inp}
      loading={loading} total={total} search={search} setSearch={setSearch}
      clients={clients} sort={sort} setSort={setSort}
      page={page} setPage={setPage}
      hasSearched={hasSearched} setHasSearched={setHasSearched}
      loadList={loadList} openFiche={openFiche}
      setView={setView} setForm={setForm}
      filter={filter} setFilter={setFilter}
    />
  );

  // ══ VUE CRÉANCES IMPAYÉES ═══════════════════════════════════════════════════
  if (view === 'debts') return (
    <DebtsView
      theme={theme} toast={toast} showToast={showToast}
      stickyHeader={stickyHeader} card={card}
      setView={setView}
    />
  );

  // ══ VUE CRÉER ═══════════════════════════════════════════════════════════════
  if (view === 'create') return (
    <CreateView
      theme={theme} isDark={isDark} toast={toast}
      stickyHeader={stickyHeader} inp={inp} lbl={lbl}
      form={form} setForm={setForm}
      busy={busy} handleCreate={handleCreate}
      setView={setView}
    />
  );

  // ══ VUE FICHE ═══════════════════════════════════════════════════════════════
  if (view === 'fiche') return (
    <FicheView
      theme={theme} isDark={isDark} toast={toast}
      stickyHeader={stickyHeader} card={card} inp={inp} lbl={lbl}
      fiche={fiche} ficheLoad={ficheLoad} setFiche={setFiche}
      activeTab={activeTab} setTab={setTab}
      editMode={editMode} setEditMode={setEditMode}
      form={form} setForm={setForm}
      busy={busy}
      confirmDel={confirmDel} setConfirmDel={setConfirmDel}
      confirmBlock={confirmBlock} setConfirmBlock={setConfirmBlock}
      blockBusy={blockBusy} inviting={inviting}
      noteText={noteText} setNoteText={setNoteText}
      noteEmpId={noteEmpId} setNoteEmpId={setNoteEmpId}
      noteLoad={noteLoad}
      employees={employees}
      creditData={creditData} creditLoading={creditLoading} loadCredit={loadCredit}
      creditMode={creditMode} setCreditMode={setCreditMode}
      creditAmt={creditAmt} setCreditAmt={setCreditAmt}
      creditNote={creditNote} setCreditNote={setCreditNote}
      creditEmpId={creditEmpId} setCreditEmpId={setCreditEmpId}
      repayAmt={repayAmt} setRepayAmt={setRepayAmt}
      repayNote={repayNote} setRepayNote={setRepayNote}
      repayEmpId={repayEmpId} setRepayEmpId={setRepayEmpId}
      repayMethod={repayMethod} setRepayMethod={setRepayMethod}
      creditBusy={creditBusy}
      handleDelete={handleDelete} handleBlock={handleBlock} handleInvite={handleInvite}
      handleUpdate={handleUpdate} handleNote={handleNote}
      handleGrantCredit={handleGrantCredit} handleRepayCredit={handleRepayCredit}
      setView={setView}
      PinModalNode={PinModalNode}
    />
  );

  return null;
}
