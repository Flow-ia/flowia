// src/pages/booking/my-appointments/index.jsx
// Écran "Mes RDV" + onglets Profil et Parrainage du compte client.
import { useState, useEffect, useRef } from 'react';
import { pubApi, globalClientApi } from '../../../utils/api';
import { VISITS_PAGE_SIZE, TAB_URL, DELETE_PHRASE } from './constants';
import { ymd, makeInpStyle } from './helpers';
import { AppointmentsTab } from './tabs/AppointmentsTab';
import { VisitsTab } from './tabs/VisitsTab';
import { ProfileTab } from './tabs/ProfileTab';
import { ReferralTab } from './tabs/ReferralTab';
import { CancelApptModal } from './modals/CancelApptModal';
import { TooLateModal } from './modals/TooLateModal';
import { DeleteAccountModal } from './modals/DeleteAccountModal';
import { ChangeEmailModal } from './modals/ChangeEmailModal';
import { ChangePwdModal } from './modals/ChangePwdModal';

export function MyAppointments({ slug, th, onBack, onNewBooking, onLogout, initialTab = 'appts', initialVisitId = null, business = null }) {
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTabRaw] = useState(initialTab); // 'appts' | 'visits' | 'profile' | 'parrain'
  const setActiveTab = (tab) => {
    setActiveTabRaw(tab);
    const nextUrl = TAB_URL[tab]?.(slug);
    if (nextUrl && window.location.pathname !== nextUrl) {
      try { window.history.replaceState({}, '', nextUrl); } catch { /* ignore */ }
    }
  };

  // Passages "sur place" — pagination 10/page + recherche (commerçant, date)
  const [visits,         setVisits]         = useState([]);   // page courante
  const [visitsLoading,  setVisitsLoading]  = useState(false);
  const [visitsPage,     setVisitsPage]     = useState(1);
  const [visitsTotal,    setVisitsTotal]    = useState(0);
  const [visitsQuery,    setVisitsQuery]    = useState('');     // input recherche live
  const [visitsDebounced,setVisitsDebounced]= useState('');     // pour fetch (debounced)
  const [visitsDate,     setVisitsDate]     = useState('');     // YYYY-MM-DD
  const [visitsErr,      setVisitsErr]      = useState('');

  // Vue détail d'un passage (cliqué dans la liste ou via URL /passages/:id)
  const [selectedVisit,   setSelectedVisit]   = useState(null);
  const [visitDetailLoad, setVisitDetailLoad] = useState(false);
  const visitDetailFetched = useRef(false);

  // Updater d'URL spécifique au tab visits : garde /client/passages OU
  // /client/passages/:id selon la vue active.
  const setVisitUrl = (visitId = null) => {
    const next = visitId
      ? `/book/${slug}/client/passages/${visitId}`
      : `/book/${slug}/client/passages`;
    if (window.location.pathname !== next) {
      try { window.history.replaceState({}, '', next); } catch { /* ignore */ }
    }
  };

  const openVisit = (v) => {
    setSelectedVisit(v);
    setVisitUrl(v.id);
  };
  const closeVisit = () => {
    setSelectedVisit(null);
    setVisitUrl(null);
  };

  // Parrainage : code perso + historique + réductions (uniquement si compte global connecté + programme actif)
  const [refInfo,    setRefInfo]    = useState(null);   // { code, uses_count, program }
  const [refHistory, setRefHistory] = useState([]);     // filleuls
  const [refRewards, setRefRewards] = useState([]);     // toutes les réductions client
  const [refAvail,   setRefAvail]   = useState(false);  // programme dispo → afficher onglet
  const [refCopied,  setRefCopied]  = useState(false);

  // ── Profil client ──
  const [clientInfo, setClientInfo] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ff_client_info') || 'null'); } catch { return null; }
  });
  const [editFirst,    setEditFirst]    = useState('');
  const [editLast,     setEditLast]     = useState('');
  const [editEmail,    setEditEmail]    = useState('');
  const [editPhone,    setEditPhone]    = useState('');
  const [editBirth,    setEditBirth]    = useState(''); // YYYY-MM-DD
  const [editPostal,   setEditPostal]   = useState('');
  const [editCity,     setEditCity]     = useState('');
  // Audit Z (RGPD) : opt-in marketing modifiable depuis le profil.
  const [editOptIn,    setEditOptIn]    = useState(false);
  const [profLoad,     setProfLoad]     = useState(false);
  const [profErr,      setProfErr]      = useState('');
  const [profOk,       setProfOk]       = useState('');
  const [editing,      setEditing]      = useState(false);

  // initialiser les champs d'édition
  const startEdit = () => {
    setEditFirst(clientInfo?.first_name   || '');
    setEditLast(clientInfo?.last_name     || '');
    setEditEmail(clientInfo?.email        || '');
    setEditPhone(clientInfo?.phone        || '');
    setEditBirth(ymd(clientInfo?.birth_date));
    setEditPostal(clientInfo?.postal_code || '');
    setEditCity(clientInfo?.city          || '');
    setEditOptIn(!!clientInfo?.marketing_opt_in);
    setEditing(true);
    setProfErr(''); setProfOk('');
  };
  const cancelEdit = () => { setEditing(false); setProfErr(''); setProfOk(''); };

  const saveProfile = async () => {
    if (!editFirst.trim() || !editLast.trim()) { setProfErr('Prenom et nom requis.'); return; }
    // Email volontairement exclu : change via modal dédiée (code OTP).
    setProfLoad(true); setProfErr(''); setProfOk('');
    try {
      // birth_date : '' → effacer (null), sinon passer tel quel si format OK
      const bdPayload = editBirth === '' ? '' :
        (/^\d{4}-\d{2}-\d{2}$/.test(editBirth) || /^\d{4}-\d{2}$/.test(editBirth)) ? editBirth : undefined;
      const payload = {
        first_name: editFirst.trim(),
        last_name:  editLast.trim(),
        phone:      editPhone.trim() || undefined,
        postal_code: editPostal.trim(),
        city:        editCity.trim(),
        marketing_opt_in: editOptIn,
      };
      if (bdPayload !== undefined) payload.birth_date = bdPayload;
      const res = await pubApi.updateClientProfile(slug, payload);
      const updated = { ...(clientInfo||{}), ...res };
      localStorage.setItem('ff_client_info', JSON.stringify(updated));
      setClientInfo(updated);
      setEditing(false);
      setProfOk('Profil mis a jour ✓');
      setTimeout(() => setProfOk(''), 3000);
    } catch(e) { setProfErr(e.message || 'Erreur'); }
    finally { setProfLoad(false); }
  };

  // ── Modal changement d'email (2 étapes : saisie → code OTP) ────────────
  const [emailModal,      setEmailModal]      = useState(false);
  const [emailStep,       setEmailStep]       = useState(1); // 1 = saisie, 2 = code
  const [emailNew,        setEmailNew]        = useState('');
  const [emailCode,       setEmailCode]       = useState('');
  const [emailSentTo,     setEmailSentTo]     = useState('');
  const [emailLoading,    setEmailLoading]    = useState(false);
  const [emailErr,        setEmailErr]        = useState('');

  const openEmailModal = () => {
    setEmailModal(true); setEmailStep(1);
    setEmailNew(''); setEmailCode(''); setEmailSentTo(''); setEmailErr('');
  };
  const closeEmailModal = () => {
    if (emailLoading) return;
    setEmailModal(false);
  };
  const submitEmailInit = async () => {
    const v = emailNew.trim().toLowerCase();
    if (!v || !v.includes('@')) { setEmailErr('Email invalide.'); return; }
    setEmailLoading(true); setEmailErr('');
    try {
      const res = await globalClientApi.changeEmailInit({ new_email: v });
      setEmailSentTo(res?.sent_to || clientInfo?.email || '');
      setEmailStep(2);
      setEmailCode('');
    } catch (e) { setEmailErr(e.message || 'Erreur'); }
    finally { setEmailLoading(false); }
  };
  const submitEmailConfirm = async () => {
    const c = emailCode.trim();
    if (!/^\d{6}$/.test(c)) { setEmailErr('Code à 6 chiffres requis.'); return; }
    setEmailLoading(true); setEmailErr('');
    try {
      const res = await globalClientApi.changeEmailConfirm({ code: c });
      const updated = { ...(clientInfo||{}), email: res?.new_email || emailNew.trim().toLowerCase() };
      localStorage.setItem('ff_client_info', JSON.stringify(updated));
      setClientInfo(updated);
      setEmailModal(false);
      setProfOk('Email mis à jour ✓');
      setTimeout(() => setProfOk(''), 3000);
    } catch (e) { setEmailErr(e.message || 'Erreur'); }
    finally { setEmailLoading(false); }
  };

  // ── Modal changement de mot de passe ────────────────────────────────────
  // 2 modes :
  //  - 'current' : nécessite le mot de passe actuel + code OTP à l'email
  //  - 'forgot'  : bypass du current_password, code OTP à l'email (route
  //                forgot-password / reset-password — OBLIGATOIRE)
  const [pwdModal,     setPwdModal]     = useState(false);
  const [pwdStep,      setPwdStep]      = useState(1);
  const [pwdMode,      setPwdMode]      = useState('current'); // 'current' | 'forgot'
  const [pwdCurrent,   setPwdCurrent]   = useState('');
  const [pwdNew,       setPwdNew]       = useState('');
  const [pwdNew2,      setPwdNew2]      = useState('');
  const [pwdCode,      setPwdCode]      = useState('');
  const [pwdSentTo,    setPwdSentTo]    = useState('');
  const [pwdLoading,   setPwdLoading]   = useState(false);
  const [pwdErr,       setPwdErr]       = useState('');

  const resetPwdState = () => {
    setPwdStep(1);
    setPwdCurrent(''); setPwdNew(''); setPwdNew2('');
    setPwdCode(''); setPwdSentTo(''); setPwdErr('');
  };
  const openPwdModal = () => {
    setPwdModal(true);
    setPwdMode('current');
    resetPwdState();
  };
  const switchToForgot = () => {
    setPwdMode('forgot');
    resetPwdState();
  };
  const switchToCurrent = () => {
    setPwdMode('current');
    resetPwdState();
  };
  const closePwdModal = () => { if (!pwdLoading) setPwdModal(false); };

  const submitPwdInit = async () => {
    // Validation des nouveaux mots de passe (commune aux 2 modes)
    if (!pwdNew) { setPwdErr('Nouveau mot de passe requis.'); return; }
    if (pwdNew.length < 6) { setPwdErr('Le nouveau mot de passe doit faire 6 caractères min.'); return; }
    if (pwdNew !== pwdNew2) { setPwdErr('Les deux mots de passe ne correspondent pas.'); return; }
    if (pwdMode === 'current' && !pwdCurrent) { setPwdErr('Mot de passe actuel requis.'); return; }

    setPwdLoading(true); setPwdErr('');
    try {
      if (pwdMode === 'current') {
        const res = await globalClientApi.changePwdInit({
          current_password: pwdCurrent,
          new_password:     pwdNew,
        });
        setPwdSentTo(res?.sent_to || clientInfo?.email || '');
      } else {
        // Mode 'forgot' : envoyer le code via forgot-password (email obligatoire)
        const email = clientInfo?.email;
        if (!email) { setPwdErr('Aucun email associé au compte.'); setPwdLoading(false); return; }
        await globalClientApi.forgotPassword({ email });
        setPwdSentTo(email);
      }
      setPwdStep(2); setPwdCode('');
    } catch (e) { setPwdErr(e.message || 'Erreur'); }
    finally { setPwdLoading(false); }
  };

  const submitPwdConfirm = async () => {
    const c = pwdCode.trim();
    if (!/^\d{6}$/.test(c)) { setPwdErr('Code à 6 chiffres requis.'); return; }
    setPwdLoading(true); setPwdErr('');
    try {
      if (pwdMode === 'current') {
        await globalClientApi.changePwdConfirm({ code: c });
      } else {
        // Mode 'forgot' : reset-password avec email + code + nouveau mdp
        await globalClientApi.resetPassword({
          email:        clientInfo?.email,
          code:         c,
          new_password: pwdNew,
        });
      }
      setPwdModal(false);
      setProfOk('Mot de passe mis à jour ✓');
      setTimeout(() => setProfOk(''), 3000);
    } catch (e) { setPwdErr(e.message || 'Erreur'); }
    finally { setPwdLoading(false); }
  };

  // Resync l'onglet actif si la prop initialTab change (navigation
  // externe depuis la NavBar alors que MyAppointments est déjà monté).
  useEffect(() => { setActiveTabRaw(initialTab); }, [initialTab]);

  useEffect(() => {
    // Liste cross-commerçants : on interroge /global-clients/appointments
    // (cookie ff_client_token) pour récupérer TOUS les RDV du client (tous
    // statuts, tous commerçants). Fallback sur /pub/:slug/client/appointments
    // si pas de session globale (ex: compte local legacy).
    const hasSession = localStorage.getItem('ff_client_info')
      || localStorage.getItem('ff_client_token');
    const useGlobal = !!hasSession;
    const fetcher = useGlobal
      ? globalClientApi.appointments()
      : pubApi.myAppointments(slug);
    fetcher
      .then(setAppts)
      .catch(() => {
        // Si /global-clients fail (token invalide ou compte non lié),
        // retry sur l'endpoint local du commerçant en cours.
        if (useGlobal) {
          pubApi.myAppointments(slug).then(setAppts).catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Debounce de la recherche (300ms) pour éviter de spammer l'API.
  useEffect(() => {
    const t = setTimeout(() => setVisitsDebounced(visitsQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [visitsQuery]);

  // Reset à la page 1 dès qu'un filtre change (sinon on resterait sur une
  // page orpheline quand le total rétrécit).
  useEffect(() => { setVisitsPage(1); }, [visitsDebounced, visitsDate]);

  // Charger la page courante quand on est sur l'onglet visits, en vue liste
  // (pas dans la vue détail). Appelle GET /me/visits?page=&limit=&q=&date=.
  useEffect(() => {
    if (activeTab !== 'visits' || selectedVisit) return;
    let cancelled = false;
    setVisitsLoading(true); setVisitsErr('');
    globalClientApi.myVisits({
      page:  visitsPage,
      limit: VISITS_PAGE_SIZE,
      q:     visitsDebounced,
      date:  visitsDate,
    })
      .then(res => {
        if (cancelled) return;
        // Compat : backend renvoie { items, total, ... } depuis ce fix.
        const items = Array.isArray(res) ? res : (res?.items || []);
        const total = Array.isArray(res) ? res.length : (res?.total || 0);
        setVisits(items);
        setVisitsTotal(total);
      })
      .catch((e) => {
        if (cancelled) return;
        setVisits([]); setVisitsTotal(0);
        setVisitsErr(e?.message || 'Impossible de charger les passages.');
      })
      .finally(() => { if (!cancelled) setVisitsLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, selectedVisit, visitsPage, visitsDebounced, visitsDate]);

  // Ouverture directe d'un passage via URL /passages/:id — fetch ciblé
  // (utile en bookmark ou refresh de la vue détail).
  useEffect(() => {
    if (!initialVisitId || visitDetailFetched.current) return;
    visitDetailFetched.current = true;
    setVisitDetailLoad(true);
    globalClientApi.myVisit(initialVisitId)
      .then(v => { setSelectedVisit(v); })
      .catch(() => { setVisitUrl(null); /* fallback liste */ })
      .finally(() => setVisitDetailLoad(false));
  }, [initialVisitId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tenter de charger le programme parrainage (si compte global connecté et programme actif)
  useEffect(() => {
    // Marker session global (cookie HttpOnly inaccessible JS) : on tente
    // si on a un info client connecté, gcRequest enverra credentials:'include'.
    const hasSession = localStorage.getItem('ff_client_info')
      || localStorage.getItem('ff_gc_token');
    if (!hasSession) return;
    let cancelled = false;
    (async () => {
      try {
        const [code, hist] = await Promise.all([
          globalClientApi.myReferralCode(slug),
          globalClientApi.myReferralHistory(slug),
        ]);
        if (cancelled) return;
        setRefInfo(code);
        setRefHistory(hist.history || []);
        setRefRewards(hist.rewards || []);
        setRefAvail(true);
      } catch {
        if (!cancelled) setRefAvail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const copyReferralLink = async () => {
    if (!refInfo?.code) return;
    const url = `${window.location.origin}/book/${slug}?ref=${refInfo.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 2000);
    } catch {/* ignore */}
  };

  const cancel = (appt) => { setCancelModal(appt); };

  const inpStyle = makeInpStyle(th);

  const [rdvTab, setRdvTab] = useState('futurs');

  // Modals annulation
  const [cancelModal, setCancelModal] = useState(null); // appt à annuler
  const [tooLateModal, setTooLateModal] = useState(null); // appt dont délai dépassé
  const [cancelLoading, setCancelLoading] = useState(false);

  // Modal suppression de compte (RGPD)
  const [deleteModal, setDeleteModal]       = useState(false);
  const [deleteConfirm, setDeleteConfirm]   = useState('');
  // Resume credits/dettes pour avertissement RGPD Art. 17.3.e avant suppression.
  // Charge a l'ouverture de la modal de suppression (lazy : evite fetch inutile
  // si l'user ne supprime jamais son compte). Best-effort : si l'API echoue,
  // la modal s'ouvre quand meme avec credits/dettes vides (ne bloque pas le
  // droit RGPD a l'effacement).
  const [creditsSummary, setCreditsSummary] = useState({ credits: [], debts: [] });
  const [deleteLoading, setDeleteLoading]   = useState(false);
  const [deleteErr, setDeleteErr]           = useState('');
  const deleteConfirmOk = deleteConfirm.trim().toLowerCase() === DELETE_PHRASE;

  const openDeleteModal = () => {
    setDeleteConfirm('');
    setDeleteErr('');
    setDeleteModal(true);
    // Lazy-load credits/dettes au moment d'ouvrir la modal. Affiche les
    // avertissements RGPD : credits abandonnes et dettes archivees 2 ans.
    globalClientApi.creditsSummary()
      .then(r => setCreditsSummary(r || { credits: [], debts: [] }))
      .catch(() => setCreditsSummary({ credits: [], debts: [] }));
  };
  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setDeleteModal(false);
    setDeleteConfirm('');
    setDeleteErr('');
  };
  const doDeleteAccount = async () => {
    if (!deleteConfirmOk) {
      setDeleteErr(`Veuillez saisir « ${DELETE_PHRASE} » pour confirmer.`);
      return;
    }
    setDeleteLoading(true); setDeleteErr('');
    try {
      await globalClientApi.deleteAccount();
      // Migration cookies HttpOnly : on demande au backend de purger les
      // cookies (logout) en plus du nettoyage localStorage.
      try { await globalClientApi.logout(); } catch {/* ignore */}
      try { await pubApi.logout(slug); } catch {/* ignore */}
      localStorage.removeItem('ff_gc_token');
      localStorage.removeItem('ff_client_token');
      localStorage.removeItem('ff_client_info');
      if (onLogout) onLogout(); else onBack();
    } catch (e) {
      setDeleteErr(e.message || 'Erreur lors de la suppression.');
      setDeleteLoading(false);
    }
  };

  const doCancel = async () => {
    if (!cancelModal) return;
    setCancelLoading(true);
    try {
      // Si le RDV vient d'un autre commerçant (cross-merchant list), on
      // utilise le slug porté par l'appointment lui-même, pas le slug de
      // la page courante.
      const cancelSlug = cancelModal.slug || slug;
      await pubApi.cancel(cancelSlug, cancelModal.id, { reason: 'Annule par le client' });
      setAppts(p => p.map(a => a.id === cancelModal.id ? {...a, status:'cancelled'} : a));
      setCancelModal(null);
    } catch(e) {
      const payload = e.data || {};
      setCancelModal(null);
      // Backend renvoie code=TOO_LATE avec policy_hours + coordonnées merchant
      if (payload.code === 'TOO_LATE' || (e.message || '').includes('TOO_LATE') || (e.message || '').includes('moins de')) {
        setTooLateModal({
          ...cancelModal,
          _policyHours:     payload.policy_hours || 2,
          _businessName:    payload.business_name    || business?.businessName || business?.business_name || null,
          _businessPhone:   payload.merchant_phone   || business?.phone   || null,
          _businessAddress: payload.merchant_address || business?.address || null,
          _businessPostal:  business?.postal_code || null,
          _businessCity:    business?.city    || null,
        });
      } else {
        alert(e.message || 'Erreur lors de l\'annulation');
      }
    } finally { setCancelLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}} *{box-sizing:border-box}
        /* Polish responsive — grilles 2 colonnes (prénom/nom, postal/ville)
           collapsent en colonne unique sous 480px pour rester confortables
           sur petits écrans Android. */
        @media(max-width:480px){
          .pt-grid-stack{ grid-template-columns:1fr!important; gap:10px!important }
          .pt-sub-header-pad{ padding:12px 16px!important }
        }
        /* Tactile iOS : tous les inputs et boutons du compte client respectent
           la cible Apple HIG min-height 44px. */
        .pt-touch{ min-height:44px }`}</style>

      {/* ── Sub-header (non-sticky) : bouton retour + identité client ──
          La NavBar principale (avec logo + hamburger) est rendue par
          BookingPage et reste le seul header sticky de la page. */}
      <div style={{ background:th.navBg, borderBottom: `0.5px solid ${th.navBorder}` }}>
        <div style={{ maxWidth:720, margin:'0 auto', padding:'12px 24px',
          display:'flex', alignItems:'center', gap:16 }}>
          <button onClick={onBack} aria-label="Retour"
            style={{ width:34, height:34, borderRadius:8, border: `0.5px solid ${th.border}`,
              background:th.cardAlt, display:'flex', alignItems:'center', justifyContent:'center',
              cursor:'pointer', flexShrink:0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{width:16,height:16,color:th.text}}>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
            <div style={{ width:36, height:36, borderRadius:99, flexShrink:0,
              background:th.accent, display:'flex', alignItems:'center', justifyContent:'center',
              color:th.accentText, fontWeight: 500, fontSize:15 }}>
              {(clientInfo?.first_name||'?').charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth:0 }}>
              <p style={{ fontWeight: 500, fontSize:14, color:th.text, margin:0,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {clientInfo?.first_name} {clientInfo?.last_name}
              </p>
              <p style={{ fontSize:12, color:th.muted, margin:0 }}>{clientInfo?.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ background:th.navBg, borderBottom: `0.5px solid ${th.border}` }}>
        <div className="bk-tabs bk-nav-pad" style={{ maxWidth:720, margin:'0 auto', padding:'0 24px',
          display:'flex', gap:0 }}>
          {[
              ['appts',
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>Mes RDV
                </span>
              ],
              ['visits',
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}>
                    <path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>Sur place
                </span>
              ],
              ['profile',
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>Mon profil
                </span>
              ],
              ...(refAvail ? [['parrain',
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>Parrainage
                </span>
              ]] : []),
            ].map(([tab, label]) => (
            <button key={tab} onClick={()=>setActiveTab(tab)}
              style={{ padding:'14px 20px', fontSize:13, fontWeight: 500, cursor:'pointer',
                background:'none', border:'none',
                color: activeTab===tab ? th.text : th.muted,
                borderBottom: activeTab===tab ? `2px solid ${th.accent}` : '2px solid transparent',
                transition:'all .15s' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenu ── */}
      <div style={{ maxWidth:720, margin:'0 auto', padding:'28px 24px 60px', animation:'fadeIn .2s ease' }}>

        {/* ── ONGLET RDV ── */}
        {activeTab === 'appts' && (
          <AppointmentsTab
            th={th}
            loading={loading}
            appts={appts}
            rdvTab={rdvTab}
            setRdvTab={setRdvTab}
            onCancel={cancel}
            onNewBooking={onNewBooking}
          />
        )}

        {/* ── ONGLET PASSAGES SUR PLACE ── */}
        {/* Transactions encaissées en caisse sans RDV préalable (cross-commerçant).
            Liste compacte (commerçant + montant) paginée 10/page avec recherche
            par nom de commerçant et filtre par date. Clic sur un passage →
            vue détail (URL /client/passages/:id) avec toutes les infos. */}
        {activeTab === 'visits' && (
          <VisitsTab
            th={th}
            inpStyle={inpStyle}
            selectedVisit={selectedVisit}
            visitDetailLoad={visitDetailLoad}
            visits={visits}
            visitsLoading={visitsLoading}
            visitsErr={visitsErr}
            visitsQuery={visitsQuery}
            visitsDate={visitsDate}
            visitsDebounced={visitsDebounced}
            visitsPage={visitsPage}
            visitsTotal={visitsTotal}
            setVisitsQuery={setVisitsQuery}
            setVisitsDate={setVisitsDate}
            setVisitsPage={setVisitsPage}
            setVisitsErr={setVisitsErr}
            onOpenVisit={openVisit}
            onCloseVisit={closeVisit}
          />
        )}

        {/* ── ONGLET PROFIL — design noir/blanc unifié ── */}
        {activeTab === 'profile' && (
          <ProfileTab
            th={th}
            inpStyle={inpStyle}
            clientInfo={clientInfo}
            editing={editing}
            editFirst={editFirst} setEditFirst={setEditFirst}
            editLast={editLast} setEditLast={setEditLast}
            editPhone={editPhone} setEditPhone={setEditPhone}
            editBirth={editBirth} setEditBirth={setEditBirth}
            editPostal={editPostal} setEditPostal={setEditPostal}
            editCity={editCity} setEditCity={setEditCity}
            editOptIn={editOptIn} setEditOptIn={setEditOptIn}
            profLoad={profLoad}
            profErr={profErr}
            profOk={profOk}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSaveProfile={saveProfile}
            onOpenEmailModal={openEmailModal}
            onOpenPwdModal={openPwdModal}
            onOpenDeleteModal={openDeleteModal}
            onLogout={onLogout}
            onBack={onBack}
            slug={slug}
          />
        )}

        {/* ── ONGLET PARRAINAGE ── */}
        {activeTab === 'parrain' && refAvail && refInfo && (
          <ReferralTab
            th={th}
            refInfo={refInfo}
            refHistory={refHistory}
            refRewards={refRewards}
            refCopied={refCopied}
            onCopyReferralLink={copyReferralLink}
          />
        )}

      </div>

      {/* ── Modal confirmation annulation ── */}
      <CancelApptModal
        th={th}
        cancelModal={cancelModal}
        cancelLoading={cancelLoading}
        onClose={() => setCancelModal(null)}
        onConfirm={doCancel}
      />

      {/* ── Modal délai dépassé (RDV dans moins de 2h) ── */}
      <TooLateModal
        th={th}
        tooLateModal={tooLateModal}
        onClose={() => setTooLateModal(null)}
      />

      {/* ── Modal suppression de compte (RGPD) ── */}
      <DeleteAccountModal
        th={th}
        inpStyle={inpStyle}
        deleteModal={deleteModal}
        deleteConfirm={deleteConfirm}
        deleteConfirmOk={deleteConfirmOk}
        deleteLoading={deleteLoading}
        deleteErr={deleteErr}
        slug={slug}
        creditsSummary={creditsSummary}
        onChangeConfirm={e => { setDeleteConfirm(e.target.value); if (deleteErr) setDeleteErr(''); }}
        onClose={closeDeleteModal}
        onConfirm={doDeleteAccount}
      />

      {/* ── Modal changement d'email (2 étapes) ── */}
      <ChangeEmailModal
        th={th}
        inpStyle={inpStyle}
        emailModal={emailModal}
        emailStep={emailStep}
        emailNew={emailNew}
        emailCode={emailCode}
        emailSentTo={emailSentTo}
        emailLoading={emailLoading}
        emailErr={emailErr}
        clientInfo={clientInfo}
        setEmailStep={setEmailStep}
        onChangeNew={e => { setEmailNew(e.target.value); if (emailErr) setEmailErr(''); }}
        onChangeCode={e => { setEmailCode(e.target.value.replace(/\D/g,'').slice(0,6)); if (emailErr) setEmailErr(''); }}
        onClose={closeEmailModal}
        onSubmitInit={submitEmailInit}
        onSubmitConfirm={submitEmailConfirm}
      />

      {/* ── Modal changement de mot de passe (2 étapes) ── */}
      <ChangePwdModal
        th={th}
        inpStyle={inpStyle}
        pwdModal={pwdModal}
        pwdStep={pwdStep}
        pwdMode={pwdMode}
        pwdCurrent={pwdCurrent}
        pwdNew={pwdNew}
        pwdNew2={pwdNew2}
        pwdCode={pwdCode}
        pwdSentTo={pwdSentTo}
        pwdLoading={pwdLoading}
        pwdErr={pwdErr}
        clientInfo={clientInfo}
        setPwdStep={setPwdStep}
        onChangeCurrent={e => { setPwdCurrent(e.target.value); if (pwdErr) setPwdErr(''); }}
        onChangeNew={e => { setPwdNew(e.target.value); if (pwdErr) setPwdErr(''); }}
        onChangeNew2={e => { setPwdNew2(e.target.value); if (pwdErr) setPwdErr(''); }}
        onChangeCode={e => { setPwdCode(e.target.value.replace(/\D/g,'').slice(0,6)); if (pwdErr) setPwdErr(''); }}
        onClose={closePwdModal}
        onSubmitInit={submitPwdInit}
        onSubmitConfirm={submitPwdConfirm}
        onSwitchToForgot={switchToForgot}
        onSwitchToCurrent={switchToCurrent}
      />
    </div>
  );
}
