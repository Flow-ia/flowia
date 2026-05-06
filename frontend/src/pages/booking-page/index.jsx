// src/pages/booking-page/index.jsx
// Page publique /book/:slug/* — orchestrateur du flow réservation
// (6 étapes) + vues satellites (mes RDV, parrainage, confirmation).

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { pubApi, globalClientApi, publicReferralApi, isJwtLocallyExpired } from '../../utils/api';
import {
  LIGHT_THEME, DARK_THEME,
  Spinner,
} from '../booking/shared';
import { NavBar } from '../booking/NavBar';
import { SideCard } from '../booking/SideCard';
import { AuthPanel, PostRegisterPopup } from '../booking/Account';

import { PHONE_COUNTRIES, ANCHOR_MAP, REF_RE } from './constants';
import { formatPhone, validatePhone, parsePhone, stepToPath, groupServicesByCategory } from './helpers';
import { ReferralBanner } from './ReferralBanner';
import { BlockedView } from './views/BlockedView';
import { MyApptsView } from './views/MyApptsView';
import { ParrainView } from './views/ParrainView';
import { SuccessView } from './views/SuccessView';
import { Step1Home } from './steps/Step1Home';
import { Step2ServiceOrEmployee } from './steps/Step2ServiceOrEmployee';
import { Step3Date } from './steps/Step3Date';
import { Step4Slot } from './steps/Step4Slot';
import { Step5Info } from './steps/Step5Info';
import { Step6Confirm } from './steps/Step6Confirm';

// ── Composant principal ───────────────────────────────────────────────────────
export default function BookingPage({ slug }) {
  // Thème avec persistance localStorage
  const savedMode = localStorage.getItem('ff_booking_theme') || 'light';
  const [themeMode, setThemeMode] = useState(savedMode);
  const th = themeMode === 'dark' ? DARK_THEME : LIGHT_THEME;
  const toggleTheme = () => {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    localStorage.setItem('ff_booking_theme', next);
  };

  // Synchroniser le fond du body avec le thème
  useEffect(() => {
    document.body.style.background = th.bg;
    document.documentElement.style.background = th.bg;
    return () => {
      document.body.style.background = '';
      document.documentElement.style.background = '';
    };
  }, [th.bg]);

  // ── Routing — synchronisation URL ↔ état réservation ──────────────────
  const navigate  = useNavigate();
  const location  = useLocation();

  // Code de parrainage capturé depuis ?ref=CODE (persistant dans localStorage
  // pour survivre au flow auth qui peut rediriger). Envoyé au POST /book.
  const [referralCode, setReferralCode] = useState(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('ref');
      // Garde-fou : code parrainage = alphanumérique, 4-30 chars. Rejette
      // inputs suspects (overflows, URLs, HTML) avant écriture localStorage.
      if (fromUrl) {
        const up = fromUrl.toUpperCase();
        if (REF_RE.test(up)) {
          localStorage.setItem('ff_booking_ref_' + slug, up);
          return up;
        }
      }
      const stored = localStorage.getItem('ff_booking_ref_' + slug) || '';
      return REF_RE.test(stored) ? stored : '';
    } catch { return ''; }
  });
  // Info programme parrainage (type/valeur remise) fetchée dès qu'un code
  // est connu (via ?ref= OU saisie manuelle dans le champ code promo).
  // Sert à afficher la bannière "Parrainage actif" + pré-remplir le champ
  // code promo en étape récap.
  const [referralInfo, setReferralInfo] = useState(null); // { valid, discount_type, discount_value }
  // Flag pour afficher une bannière ponctuelle juste après inscription
  // quand un code parrainage était en cours (message "promo appliquée").
  const [justRegisteredRef, setJustRegisteredRef] = useState(false);

  // Mode QR : formulaire ultra-court (prénom + tél) pour encaissement rapide
  // en boutique. Activé par `?quick=1` (via /j/:slug qui redirige ici).
  const [quickMode, setQuickMode] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('quick') === '1'; }
    catch { return false; }
  });

  // Gérer le retour Google OAuth (URL directe sans popup)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcToken  = params.get('gc_token');
    const gcClient = params.get('gc_client');
    const authErr  = params.get('auth_error');

    if (gcToken && gcClient) {
      try {
        const client = JSON.parse(decodeURIComponent(gcClient));
        // Migration cookies HttpOnly : cookie ff_client_token déjà posé par
        // le backend au callback. On ne persiste plus que les infos client.
        localStorage.setItem('ff_client_info', JSON.stringify(client));
        setClientUser(client);
        // Nettoyer l'URL
        window.history.replaceState({}, '', window.location.pathname);
      } catch {}
    }
    if (authErr) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Lire l'URL au montage et restaurer la vue (client/rdv, client/profil)
  // + gérer les ancres hash pour scroll automatique vers les sections
  useEffect(() => {
    const path = location.pathname;
    const hash = location.hash; // ex: #equipe, #adresse, #commentaires, #prestations

    // Gate auth client : toutes les routes /client/* (profil, rdv, passages…)
    // exigent un compte connecté. Sans token OU token localement expiré, on
    // redirige vers /login au lieu de laisser s'afficher la coquille vide
    // (qui faisait tourner des fetches authentifiés sans token et renvoyait
    // du contenu partiel/cassé).
    if (path.includes('/client/')) {
      // Migration cookies HttpOnly : le JWT est en cookie inaccessible JS.
      // L'indicateur "connecté" côté UI est ff_client_info (présent uniquement
      // après login validé). Si absent → pas de session → login. Si la
      // session a expiré côté backend, le prochain fetch retournera 401 et
      // les composants concernés rechargeront.
      const sessionMarker = localStorage.getItem('ff_client_info')
        || localStorage.getItem('ff_client_token'); // fallback ancien stockage
      if (!sessionMarker) {
        setAuthInitMode('login');
        setShowAuthPanel(true);
        navigate(`/book/${slug}/login`, { replace: true });
        return;
      }
    }

    if (path.endsWith('/auth') || path.endsWith('/login') || path.endsWith('/register')) {
      // Si le client est déjà connecté, court-circuiter l'AuthPanel et
      // rediriger vers sa page de compte (ou la page booking racine si
      // on vient d'un deep-link). Évite d'imposer une reconnexion inutile.
      if (localStorage.getItem('ff_client_info') || localStorage.getItem('ff_client_token')) {
        navigate(`/book/${slug}/client/profil`, { replace: true });
        setView('myAppts');
        setMyApptsInitTab('profile');
      } else {
        // /login (et /auth legacy) → mode login ; /register → mode register.
        // Permet le refresh de la page sans perdre l'écran en cours.
        setAuthInitMode(path.endsWith('/register') ? 'register' : 'login');
        setShowAuthPanel(true);
      }
    } else if (path.includes('/client/profil')) {
      setView('myAppts');
      setMyApptsInitTab('profile');
    } else if (path.includes('/client/passages')) {
      setView('myAppts');
      setMyApptsInitTab('visits');
      const m = path.match(/\/client\/passages\/([a-zA-Z0-9-]+)/);
      if (m && m[1]) setMyApptsInitVisitId(m[1]);
    } else if (path.includes('/client/rdv')) {
      setView('myAppts');
      setMyApptsInitTab('appts');
    } else if (path.endsWith('/parrain')) {
      setView('parrain');
    } else if (hash) {
      const targetId = ANCHOR_MAP[hash.toLowerCase()] || hash.replace('#','section-');
      // Scroller après chargement de la page
      setTimeout(() => {
        const el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
      }, 600);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Flow parrainage — redirect vers inscription si ?ref=CODE + pas connecté
  // Au montage, si on arrive sur la page avec un code parrainage (URL ou
  // localStorage) et sans session client, on ouvre l'AuthPanel en mode
  // 'register' pour que le filleul crée son compte en priorité (la promo
  // filleul ne peut s'appliquer qu'à un client avec un compte).
  useEffect(() => {
    if (!referralCode) return;
    // Détection session via marker non sensible (ff_client_info) + fallback
    // ancien stockage tant qu'il existe.
    const hasSession = localStorage.getItem('ff_client_info')
      || localStorage.getItem('ff_client_token');
    if (!hasSession) {
      setAuthInitMode('register');
      setShowAuthPanel(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wrapper setStep qui met aussi à jour l'URL
  const goToStep = (s, svc, emp, date, slot) => {
    const svcId   = (svc  || selSvc)?.id   || null;
    const empId   = (emp  || selEmp)?._anyEmployee ? 'any' : ((emp || selEmp)?.id || null);
    const dateStr = (date || selDate)?.toLocaleDateString('sv-SE') || null;
    const slotStr = slot || selSlot || null;
    const path    = stepToPath(slug, s, svcId, empId, dateStr, slotStr);
    navigate(path, { replace: s === 1 });
    setStep(s);
  };

  const [business, setBiz]     = useState(null);
  const [googleRating, setGoogleRating] = useState(null); // { rating, total_ratings } ou null
  // Compte client global (plateforme)
  const [gcToken,   setGcToken]   = useState(() => localStorage.getItem('ff_gc_token') || null);
  const [gcUser,    setGcUser]    = useState(() => { try { return JSON.parse(localStorage.getItem('ff_gc_user') || 'null'); } catch { return null; } });
  const [services, setSvcs]    = useState([]);
  const [employees, setEmps]   = useState([]);
  const [closedDays, setClosed]   = useState([]);
  const [monthStatus, setMonthStatus] = useState({}); // { 'YYYY-MM-DD': 'open'|'closed'|'full' }
  const [monthKey,    setMonthKey]    = useState('');  // 'YYYY-MM' courant affiché
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState('');
  const [isBlocked, setIsBlocked] = useState(false); // client bloqué par le commerçant

  // Flux réservation
  const [view, setView]          = useState('booking'); // 'booking' | 'myAppts' | 'success' | 'parrain'

  // Programme de parrainage : null tant que la requête n'est pas résolue,
  // objet { is_enabled, parrain_type, parrain_value, ... } si le commerçant a
  // configuré un programme (même désactivé), 'none' si aucun programme créé.
  const [refProgram, setRefProgram] = useState(null);
  const [refMyCode, setRefMyCode]   = useState(null);
  const [refMyHistory, setRefMyHistory] = useState([]);
  const [refMyRewards, setRefMyRewards] = useState([]);
  const [step, setStep]          = useState(1);
  const [selSvc, setSelSvc]      = useState(null);
  const [selEmp, setSelEmp]      = useState(null);
  const [selDate, setSelDate]    = useState(null);
  const [selSlot, setSelSlot]    = useState(null);
  const [slots, setSlots]        = useState([]);
  const [slotsLoading, setSL]    = useState(false);
  // Créneaux filtrés — masque les heures passées si c'est aujourd'hui
  const visibleSlots = useMemo(() => {
    if (!slots.length) return slots;
    const todayKey = new Date().toLocaleDateString('sv-SE');
    const isToday  = selDate && selDate.toLocaleDateString('sv-SE') === todayKey;
    if (!isToday) return slots;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const toMin  = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    return slots.filter(s => toMin(s) > nowMin);
  }, [slots, selDate]);
  const [calMonth, setCalMonth]  = useState(new Date());
  const [bookedAppt, setBooked]  = useState(null);

  // Infos client
  const [clientName, setCN]  = useState('');
  const [clientEmail, setCE] = useState('');
  const [clientPhone, setCP] = useState('');
  const [notes, setNotes]    = useState('');
  const [booking, setBooking] = useState(false);
  const [bookErr, setBookErr] = useState('');

  // RGPD commit 17 : consentement pour résa "sans compte" (clientUser absent).
  // Si clientUser présent, l'opt-in est lu depuis le compte ; sinon transmis
  // au POST /book pour persister à la création de la fiche locale.
  const [noAcctConsent, setNoAcctConsent] = useState({ contractAccepted: true, marketingAccepted: false });

  // Téléphone avec indicatif pays
  const [phoneCC, setPhoneCC]       = useState(PHONE_COUNTRIES[0]); // pays sélectionné
  const [phoneLocal, setPhoneLocal] = useState(''); // numéro local brut
  const [phoneDrop, setPhoneDrop]   = useState(false); // dropdown ouvert
  const [phoneErr, setPhoneErr]     = useState('');

  // Vérification email en temps réel (étape 5)
  const [emailStatus, setEmailStatus] = useState('idle'); // 'idle'|'checking'|'exists'|'free'|'invalid'
  const emailCheckTimer = useRef(null);

  // Auth client
  const [clientUser, setClientUser]   = useState(null);

  // ── Flow parrainage — fetch info programme + éligibilité filleul ─────────
  // 2 passes :
  //   1) sans email → valide le code + récupère type/valeur (pour le bandeau
  //      "inscrivez-vous pour bénéficier").
  //   2) avec email filleul connu (clientUser.email) → check complet :
  //      éligibilité (nouveau client, quota, pas self-referral) — permet de
  //      PRÉVENIR l'utilisateur AVANT qu'il ne valide sa réservation si les
  //      conditions ne sont pas remplies. Évite le faux espoir.
  // ⚠ Déclaré APRÈS clientUser : références dans la deps-array sinon TDZ.
  // Reset préemptif de referralInfo à null quand l'email change pour éviter
  // le clignotement "bandeau vert → bandeau orange" avec l'ancien state.
  useEffect(() => {
    if (!referralCode) { setReferralInfo(null); return; }
    setReferralInfo(null); // cache tout bandeau pendant le refetch
    let cancelled = false;
    const email = clientUser?.email || '';
    pubApi.checkReferral(slug, referralCode, email)
      .then(res => {
        if (cancelled) return;
        setReferralInfo(res?.valid ? res : null);
      })
      .catch(() => { if (!cancelled) setReferralInfo(null); });
    return () => { cancelled = true; };
  }, [referralCode, slug, clientUser?.email]);
  // Popup post-inscription : mois/année de naissance + tél. (optionnels).
  // Déclenché par handleAuth(client, { justRegistered: true }). Stocke aussi
  // un flag localStorage pour ne jamais re-afficher à ce même client.
  const [showPostRegister, setShowPostRegister] = useState(false);
  // showAuthPanel = true → AuthPanel flottant (navbar, hors flow)
  const [showAuthPanel, setShowAuthPanel]  = useState(false);
  const [authInitEmail, setAuthInitEmail]  = useState('');
  // Mode par défaut de AuthPanel ('login' | 'register'). Passé en 'register'
  // quand le visiteur arrive via un lien ?ref=CODE pour le rediriger
  // directement vers la création de compte.
  const [authInitMode,  setAuthInitMode]   = useState('login');
  const [requireAccount, setRequire]  = useState(false);
  // Phase 5/5 — config paiement RDV en ligne (Stripe Connect)
  const [paymentConfig, setPaymentConfig] = useState({ enabled: false });
  const [pendingBook,   setPendingBook]   = useState(false);
  const [myApptsInitTab, setMyApptsInitTab] = useState('appts');
  // Si l'URL cible un passage précis (/client/passages/:id), on propage
  // l'id à MyAppointments pour ouvrir directement la vue détail.
  const [myApptsInitVisitId, setMyApptsInitVisitId] = useState(null);
  // Auth inline dans l'étape 5 — remplace le formulaire sans compte quand cliqué
  // 'none' | 'login' | 'register'
  const [inlineAuthMode, setInlineAuthMode] = useState('none');

  // Promo / fidélité
  const [promoCode,    setPromoCode]    = useState('');
  const [promoData,    setPromoData]    = useState(null);
  const [promoErr,     setPromoErr]     = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  // Commit 24c — accepte un override pour les cards cliquables Step6 :
  // setPromoCode + checkPromo dans le même tick, sans attendre le re-render
  // (closure sur l'ancienne valeur de promoCode).
  const checkPromo = async (codeOverride) => {
    const codeRaw = (codeOverride || promoCode || '').trim();
    if (!codeRaw) return;
    setPromoLoading(true); setPromoErr('');
    try {
      // 1. Essai code promo classique
      const res = await pubApi.checkPromo(slug, {
        code:         codeRaw,
        amount:       selSvc?.price || 0,
        client_email: clientEmail || undefined,
      });
      if (res.valid) {
        setPromoData({ ...res, source: 'promo' });
        setPromoErr('');
        return;
      }
      // 2. Fallback : code parrainage (même input pour saisie manuelle).
      //    On transmet l'email du filleul (si connu) pour un check d'éligibilité
      //    complet — évite de faire miroiter une remise qui sera refusée.
      try {
        const email = clientUser?.email || clientEmail || '';
        const ref = await pubApi.checkReferral(slug, codeRaw.toUpperCase(), email);
        if (ref?.valid && ref.eligible !== false) {
          const baseAmt  = selSvc?.price || 0;
          const discount = ref.discount_type === 'percent'
            ? Math.min(baseAmt, baseAmt * parseFloat(ref.discount_value) / 100)
            : Math.min(baseAmt, parseFloat(ref.discount_value));
          setPromoData({
            source:   'referral',
            type:     ref.discount_type,
            value:    parseFloat(ref.discount_value),
            discount: Math.round(discount * 100) / 100,
          });
          // Synchroniser referralCode → sera envoyé au POST /book en
          // tant que referral_code (non pas promo_code_id)
          const up = codeRaw.toUpperCase();
          setReferralCode(up);
          try { localStorage.setItem('ff_booking_ref_' + slug, up); } catch {}
          setPromoErr('');
          return;
        }
        // Code connu mais conditions non remplies → message pédagogique
        if (ref?.valid && ref.eligible === false) {
          setPromoData(null);
          setPromoErr("Vous ne pouvez pas bénéficier de ce programme de parrainage car vous ne répondez pas aux conditions définies par le commerçant.");
          return;
        }
      } catch { /* silencieux : on retombe sur l'erreur promo */ }
      setPromoData(null);
      setPromoErr(res.error || 'Code invalide');
    } catch { setPromoErr('Erreur reseau'); }
    finally { setPromoLoading(false); }
  };

  // Pré-remplir le champ code promo avec le code parrainage seulement si
  // l'éligibilité est CONFIRMÉE (ou pas encore testée, ex: pas connecté).
  // Si le filleul est connecté et qu'on sait qu'il ne répond pas aux
  // conditions (referralInfo.eligible === false), on NE pré-remplit PAS —
  // le bandeau "vous ne pouvez pas bénéficier" prend le relais.
  useEffect(() => {
    if (!referralInfo || !referralCode) return;
    if (referralInfo.eligible === false) {
      // Client non éligible : vider toute trace pré-remplie
      if (promoData?.source === 'referral') {
        setPromoCode(''); setPromoData(null);
      }
      return;
    }
    if (promoData?.source === 'promo') return; // priorité code promo manuel
    if (promoCode && promoCode.toUpperCase() !== referralCode.toUpperCase()) return;
    const baseAmt  = selSvc?.price || 0;
    const discount = referralInfo.discount_type === 'percent'
      ? Math.min(baseAmt, baseAmt * parseFloat(referralInfo.discount_value) / 100)
      : Math.min(baseAmt, parseFloat(referralInfo.discount_value));
    setPromoCode(referralCode);
    setPromoData({
      source:   'referral',
      type:     referralInfo.discount_type,
      value:    parseFloat(referralInfo.discount_value),
      discount: Math.round(discount * 100) / 100,
    });
    setPromoErr('');
  }, [referralInfo, referralCode, selSvc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore client session — cookie HttpOnly invisible côté JS, on s'appuie
  // sur la présence de ff_client_info (écrit après login) pour restaurer
  // l'état UI. Si la session est expirée côté backend, le prochain fetch
  // remontera 401 et le composant adapté nettoiera le marker.
  useEffect(() => {
    const stored = localStorage.getItem('ff_client_info');
    if (stored) {
      try {
        const info = JSON.parse(stored);
        setClientUser(info);
        setCN(`${info.first_name} ${info.last_name}`);
        setCE(info.email);
        const ph = info.phone || '';
        setCP(ph);
        if (ph) { const p = parsePhone(ph); setPhoneCC(p.country); setPhoneLocal(p.local); }
      } catch {}
    }
  }, []);

  // ── Relancer la réservation automatiquement après connexion/inscription ──────
  // Quand pendingBook=true ET clientUser vient d'être mis à jour (re-render),
  // on relance handleBook(). À ce moment clientUser est bien à jour dans la closure.
  useEffect(() => {
    if (pendingBook && clientUser) {
      setPendingBook(false);
      // Légère pause pour laisser React finir le rendu
      setTimeout(() => { handleBook(); }, 50);
    }
  }, [clientUser, pendingBook]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load business data
  useEffect(() => {
    Promise.all([
      pubApi.getBusiness(slug),
      pubApi.getServices(slug),
      pubApi.getEmployees(slug),
      pubApi.getClosedDays ? pubApi.getClosedDays(slug) : Promise.resolve({ closedDays: [] }),
      // Phase 5/5 : config paiement RDV en ligne. Silent fail si endpoint
      // pas dispo (vieux backend) → reste { enabled:false }, booking flow normal.
      pubApi.getPaymentConfig ? pubApi.getPaymentConfig(slug).catch(() => ({ enabled: false })) : Promise.resolve({ enabled: false }),
    ])
      .then(([biz, svcs, emps, cd, payCfg]) => {
        setBiz(biz.business);
        setSvcs(svcs);
        setEmps(emps);
        // Commit 22 : compte client TOUJOURS obligatoire pour réserver.
        // La colonne require_account est ignorée — comportement non-configurable.
        setRequire(true);
        setClosed(cd?.closedDays || []);
        setPaymentConfig(payCfg || { enabled: false });
        // Récupère la note Google réelle si un lien Google Business est configuré
        if (biz.business?.google_business_url) {
          pubApi.getGoogleRating(slug)
            .then(r => { if (r?.found) setGoogleRating({ rating: r.rating, total: r.total_ratings }); })
            .catch(() => { /* silent — garde fallback visuel */ });
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  // Programme parrainage — silent si inexistant (404). La présence dans la DB
  // (active ou non) conditionne l'affichage du lien de navigation.
  useEffect(() => {
    publicReferralApi.getProgram(slug)
      .then(p => setRefProgram(p))
      .catch(() => setRefProgram('none'));
  }, [slug]);

  // Charger code perso + historique + rewards quand on entre sur la vue parrain
  // (uniquement si le client est connecté en compte global).
  useEffect(() => {
    if (view !== 'parrain') return;
    // Marker session client (cookie HttpOnly invisible côté JS) + fallback
    // ancien stockage. gcRequest envoie credentials:'include' qui propage
    // les cookies ff_gc_token / ff_client_token au backend.
    const hasSession = localStorage.getItem('ff_client_info')
      || localStorage.getItem('ff_gc_token')
      || localStorage.getItem('ff_client_token');
    if (!hasSession) { setRefMyCode(null); setRefMyHistory([]); setRefMyRewards([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const [c, h] = await Promise.all([
          globalClientApi.myReferralCode(slug).catch(() => null),
          globalClientApi.myReferralHistory(slug).catch(() => ({ history:[], rewards:[] })),
        ]);
        if (cancelled) return;
        setRefMyCode(c);
        setRefMyHistory(h?.history || []);
        setRefMyRewards(h?.rewards || []);
      } catch {/* silent */}
    })();
    return () => { cancelled = true; };
  }, [view, slug, clientUser]);

  // Load slots
  useEffect(() => {
    if (!selDate || !selEmp || !selSvc) return;
    setSL(true);
    const dateStr = selDate.toLocaleDateString('sv-SE');
    // "Au premier disponible" → envoyer sans employee_id pour union de tous les employés
    const empIdToSend = (selEmp.id && selEmp.id !== null && !selEmp._anyEmployee) ? selEmp.id : undefined;
    pubApi.getSlots(slug, { date: dateStr, ...(empIdToSend ? { employee_id: empIdToSend } : {}), service_id: selSvc.id })
      .then(r => {
        if (r.blocked) { setIsBlocked(true); setSlots([]); }
        else setSlots(r.slots || []);
      })
      .catch(() => setSlots([]))
      .finally(() => setSL(false));
  }, [selDate, selEmp, selSvc, slug]);

  // Load month status (open/closed/full par jour)
  useEffect(() => {
    if (!selSvc || !calMonth) return;
    const yr = calMonth.getFullYear();
    const mo = calMonth.getMonth() + 1;
    const empKeyPart = (selEmp && !selEmp._anyEmployee) ? `-${selEmp.id}` : '';
    const key = `${yr}-${mo}${empKeyPart}`;
    if (key === monthKey) return;
    const empIdForMonth = (selEmp && !selEmp._anyEmployee) ? selEmp.id : undefined;
    const monthParams = { year: yr, month: String(mo).padStart(2,'0'), service_id: selSvc.id };
    if (empIdForMonth) monthParams.employee_id = empIdForMonth;
    pubApi.getMonthStatus(slug, monthParams)
      .then(r => { setMonthStatus(r || {}); setMonthKey(key); })
      .catch(() => {});
  }, [selSvc, selEmp, calMonth, slug, monthKey]);

  const handleAuth = (client, meta = {}) => {
    setClientUser(client);
    setCN(`${client.first_name} ${client.last_name}`);
    setCE(client.email);
    const ph = client.phone || '';
    setCP(ph);
    if (ph) { const p = parsePhone(ph); setPhoneCC(p.country); setPhoneLocal(p.local); }
    else { setPhoneLocal(''); }
    setPhoneErr('');
    setShowAuthPanel(false);
    setInlineAuthMode('none');
    // Popup post-inscription : 1re fois seulement, si birth_date manquante.
    // Flag localStorage par email pour ne plus jamais l'afficher à ce client.
    if (meta.justRegistered && client?.email) {
      const key = `ff_post_register_shown_${client.email.toLowerCase()}`;
      if (!localStorage.getItem(key) && !client.birth_date) {
        setShowPostRegister(true);
        localStorage.setItem(key, '1');
      }
    }
    // Si connecté à l'étape 5 → avancer à 6 seulement si le téléphone est renseigné
    if (step === 5 && client.phone) {
      setTimeout(() => setStep(6), 50);
    }
  };

  const handleBook = async (paymentIntentId) => {
    // Si compte requis et pas encore connecté → ouvrir auth + mémoriser qu'on voulait réserver
    // Détection session : ff_client_info (marker non sensible) ou ancien
    // ff_client_token (transition). Le JWT lui-même est en cookie HttpOnly.
    const hasSession = !!(localStorage.getItem('ff_client_info')
      || localStorage.getItem('ff_client_token'));
    if (requireAccount && !clientUser && !hasSession) { setShowAuthPanel(true); setPendingBook(true); return; }
    // Sans compte requis : permettre la réservation si les champs obligatoires sont remplis
    if (!requireAccount && !clientUser && !hasSession && (!clientName.trim() || !clientPhone.trim())) { setBookErr('Nom et téléphone obligatoires.'); return; }
    // Connecté mais téléphone manquant → renvoyer à l'étape 5
    if ((clientUser || hasSession) && !clientPhone.trim()) { setBookErr('Téléphone obligatoire. Veuillez compléter votre profil.'); setStep(5); return; }
    setBooking(true); setBookErr('');
    try {
      // ── Re-vérification du code promo au moment de la confirmation ──────────
      // Garantit que le code n'a pas été utilisé/expiré entre la vérification
      // initiale et la confirmation finale (même page gardée ouverte)
      let finalPromoId  = null;
      let finalDiscount = 0;
      let finalPromoCode = null;

      if (promoData?.source === 'referral') {
        // Parrainage : la remise est recalculée côté backend via
        // referral_code dans le body (POST /book, secure). Ne pas recheck
        // /promo/check — le code n'est pas dans la table promo_codes.
      } else if (promoData && promoCode.trim()) {
        const recheck = await pubApi.checkPromo(slug, {
          code:         promoCode.trim(),
          amount:       selSvc?.price || 0,
          client_email: clientEmail || undefined,
        });
        if (!recheck.valid) {
          // Code devenu invalide → vider l'input, bloquer la réservation
          setPromoData(null);
          setPromoCode('');
          setPromoErr(recheck.error || "Ce code n'est plus valide.");
          setBooking(false);
          return;
        }
        finalPromoId   = recheck.promo_id;
        finalDiscount  = recheck.discount || 0;
        finalPromoCode = promoCode.trim();
      }

      const token = localStorage.getItem('ff_client_token');
      const result = await pubApi.book(slug, {
        service_id:      selSvc.id,
        employee_id:     (selEmp?._anyEmployee ? null : selEmp?.id),
        date:            selDate.toLocaleDateString('sv-SE'),
        start_time:      selSlot,
        client_name:     clientName,
        client_email:    clientEmail,
        client_phone:    clientPhone,
        notes,
        client_token:    token || undefined,
        promo_code_id:   finalPromoId,
        discount_amount: finalDiscount,
        promo_code:      finalPromoCode,
        referral_code:   referralCode || undefined,
        // Phase 5/5 — Stripe Connect : payment_intent_id passe par le client
        // apres confirmPayment cote front. Backend revalide PI.status='succeeded'
        // + matching metadata avant de creer le RDV.
        payment_intent_id: paymentIntentId || undefined,
        // RGPD commit 17 : opt-in marketing transmis seulement en mode "sans
        // compte" (le back ignore le champ si client_token + clientId valide).
        marketing_opt_in: clientUser ? undefined : noAcctConsent.marketingAccepted,
      });
      // Code parrainage consommé → on le retire pour éviter une seconde utilisation
      if (referralCode) {
        try { localStorage.removeItem('ff_booking_ref_' + slug); } catch {}
        setReferralCode('');
      }
      // Si un code parrainage a été saisi mais le backend ne l'a pas appliqué,
      // message pédagogique unifié (meilleure UX qu'une liste de raisons
      // techniques). Cas spécial 'promo_used' → on précise qu'un promo a pris
      // la place (choix volontaire du client, non une condition non remplie).
      if (result?.referral_skip_reason && referralCode) {
        const reason = result.referral_skip_reason;
        const msg = reason === 'promo_used'
          ? "Votre code promo a été appliqué à la place du parrainage (non cumulable)."
          : reason === 'code_not_found'
          ? "Le code de parrainage saisi n'existe pas chez ce commerçant."
          : "Vous ne pouvez pas bénéficier de ce programme de parrainage car vous ne répondez pas aux conditions définies par le commerçant.";
        setTimeout(() => window.alert(msg), 100);
      }
      setBooked(result);
      setView('success');
    } catch (e) {
      if (requireAccount && e.message?.includes('compte')) { setShowAuthPanel(true); setPendingBook(true); }
      else if (e.message?.includes('n\'accepte plus') || e.message?.includes('bloque')) { setIsBlocked(true); }
      // Phase 5/5 — paiement obligatoire : Step6 affichera le bloc Stripe.
      // On signale via setBookErr pour que l'utilisateur voie qu'il doit payer.
      else if (e.data?.code === 'PAYMENT_REQUIRED') {
        setBookErr('Paiement requis pour reserver. Merci de saisir votre carte ci-dessous.');
      }
      // Phase 5/5 — slot pris : si l'utilisateur avait deja paye, le backend
      // a auto-refund. On affiche le message backend (qui differencie
      // "rembourse automatiquement" vs "contacter le commercant") puis on
      // renvoie a l'etape de selection de creneau pour qu'il puisse retenter.
      else if (e.data?.code === 'SLOT_TAKEN') {
        setBookErr(e.message);
        // Force un refresh des slots + retour etape 4
        setSelSlot(null);
        setMonthKey('');
        setTimeout(() => { setStep(4); }, 1500);
      }
      else setBookErr(e.message);
    }
    finally { setBooking(false); }
  };

  const resetBooking = () => {
    setStep(1); setSelSvc(null); setSelEmp(null); setSelDate(null); setSelSlot(null);
    setNotes(''); setBookErr(''); setBooked(null); setView('booking'); setMonthKey('');
    setPromoCode(''); setPromoData(null); setPromoErr('');
    setPendingBook(false);
    setInlineAuthMode('none');
    setPhoneLocal(''); setPhoneErr(''); setPhoneDrop(false);
    navigate(`/book/${slug}`, { replace: true });
  };

  // Calendrier
  const today = new Date(); today.setHours(0,0,0,0);
  const maxDate = new Date(today); maxDate.setDate(today.getDate() + (business?.advance_booking_days || 30));
  const firstOfMonth = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const daysInMonth  = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 0).getDate();
  const startDay = (firstOfMonth.getDay() + 6) % 7;
  const calDays = [...Array(startDay).fill(null), ...Array.from({length:daysInMonth},(_,i) => new Date(calMonth.getFullYear(),calMonth.getMonth(),i+1))];

  // Grouper services par catégorie booking (booking_category_name prioritaire, fallback category_name)
  const { svcGroups, svcNoCat } = groupServicesByCategory(services);

  // ── Vues principales ──────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:th.bg }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Spinner th={th} />
    </div>
  );

  if (error && !business) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, background:th.bg }}>
      <div style={{ textAlign:'center', maxWidth:360 }}>
        <h1 style={{ fontSize:20, fontWeight:500, margin:'0 0 8px', color:th.text }}>Page introuvable</h1>
        <p style={{ fontSize:13, color:th.muted, margin:0 }}>Ce lien n&apos;existe pas ou est désactivé.</p>
      </div>
    </div>
  );

  // Vue : Client bloqué
  if (isBlocked) return <BlockedView th={th} business={business} />;

  // Overlay popup post-inscription (réutilisé dans toutes les vues).
  const postRegOverlay = showPostRegister && clientUser ? (
    <PostRegisterPopup slug={slug} th={th} client={clientUser}
      onClose={() => setShowPostRegister(false)}
      onSaved={(c) => { setClientUser(c); localStorage.setItem('ff_client_info', JSON.stringify(c)); }} />
  ) : null;

  // Vue : Mes RDV
  if (view === 'myAppts') return (
    <MyApptsView
      th={th} slug={slug} business={business} clientUser={clientUser} refProgram={refProgram}
      myApptsInitTab={myApptsInitTab} myApptsInitVisitId={myApptsInitVisitId}
      bookedAppt={bookedAppt} location={location} postRegOverlay={postRegOverlay}
      toggleTheme={toggleTheme} setShowAuthPanel={setShowAuthPanel} navigate={navigate}
      setView={setView} setMyApptsInitTab={setMyApptsInitTab}
      setClientUser={setClientUser} setCN={setCN} setCE={setCE} setCP={setCP}
      goToStep={goToStep} resetBooking={resetBooking}
    />
  );

  // Vue : Page parrainage
  if (view === 'parrain') return (
    <ParrainView
      th={th} slug={slug} business={business} clientUser={clientUser} refProgram={refProgram}
      refMyCode={refMyCode} refMyHistory={refMyHistory} refMyRewards={refMyRewards}
      postRegOverlay={postRegOverlay} toggleTheme={toggleTheme}
      setShowAuthPanel={setShowAuthPanel} navigate={navigate} setView={setView}
      setMyApptsInitTab={setMyApptsInitTab}
      setClientUser={setClientUser} setCN={setCN} setCE={setCE} setCP={setCP}
      handleAuth={handleAuth}
    />
  );

  // Vue : Confirmation
  if (view === 'success' && bookedAppt) return (
    <SuccessView
      th={th} slug={slug} business={business} clientUser={clientUser}
      bookedAppt={bookedAppt} selSvc={selSvc} selEmp={selEmp} selDate={selDate} selSlot={selSlot}
      clientName={clientName} clientEmail={clientEmail}
      postRegOverlay={postRegOverlay} toggleTheme={toggleTheme}
      setShowAuthPanel={setShowAuthPanel} navigate={navigate} setView={setView}
      setMyApptsInitTab={setMyApptsInitTab}
      setClientUser={setClientUser} setCN={setCN} setCE={setCE} setCP={setCP}
      resetBooking={resetBooking}
    />
  );

  // ── Vue : Réservation — Layout Setmore exact ────────────────────────────────
  // Desktop : navbar + 2 colonnes (contenu | sidebar)
  // Mobile  : stack vertical + bouton Réserver fixe en bas
  // Logo    = /api/media/commercant/:userId/profile  (si userId exposé par getBusiness)
  // Employés = vrais employees chargés depuis pubApi
  // Adresse/tel = business.address / business.phone
  return (
    <><div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      <style>{`
        @keyframes spin  { to { transform:rotate(360deg); } }
        @keyframes fadeIn{ from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        *{ box-sizing:border-box }
        /* Règles layout spécifiques à la vue booking (sidebar, grid services,
           footer, étapes). Les styles NavBar/drawer sont auto-inclus par le
           composant NavBar pour fonctionner sur toutes les vues. */
        @media(max-width:767px){
          .bk-2c{ flex-direction:column!important }
          .bk-sb{ order:-1!important; width:100%!important; position:static!important; padding-top:12px!important }
          .bk-footer-grid{ grid-template-columns:1fr!important; gap:16px!important }
          .bk-iframe{ height:180px!important }
          .bk-slots{ grid-template-columns:repeat(2,1fr)!important }
          .bk-grid2{ grid-template-columns:1fr!important }
          .bk-share-btns{ row-gap:8px!important }
          .bk-ref-code{ font-size:16px!important; letter-spacing:1px!important }
          .bk-side-logo{ width:64px!important; height:64px!important }
          .bk-emp-grid{ grid-template-columns:1fr!important }
          .bk-tabs{ overflow-x:auto }
          .bk-tabs button{ padding:12px 14px!important; font-size:13px!important; flex-shrink:0 }
        }
        @media(max-width:480px){
          .bk-steps{ padding:0 4px!important }
          .bk-slots{ grid-template-columns:repeat(2,1fr)!important; gap:8px!important }
          .bk-hours-row{ padding:7px 12px!important }
          .bk-tabs button{ padding:10px 10px!important; font-size:12px!important }
        }
        @media(max-width:360px){
          .bk-slots{ grid-template-columns:1fr!important }
          .bk-share-btns button{ flex:1 1 100%!important }
        }
        .bk-modal-inner{ max-height:90vh; overflow-y:auto }
        .bk-touch{ min-height:44px }
      `}</style>

      {/* ══ NAVBAR — composant partagé ══ */}
      <NavBar th={th} slug={slug} business={business} clientUser={clientUser} refProgram={refProgram}
        onToggleTheme={toggleTheme} onShowAuth={()=>{ setShowAuthPanel(true); navigate(`/book/${slug}/login`, {replace:false}); }}
        onMyAppts={()=>{ navigate(`/book/${slug}/client/rdv`, {replace:false}); setMyApptsInitTab('appts'); setView('myAppts'); }}
        onLogout={()=>{ pubApi.logout(slug).catch(()=>{}); globalClientApi.logout().catch(()=>{}); localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_gc_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); }}
        onReferralPage={() => { setView('parrain'); navigate(`/book/${slug}/parrain`, {replace:false}); }}
        onNavigateHome={(id)=>{ setView('booking'); goToStep(1); setShowAuthPanel(false); navigate(`/book/${slug}`, {replace:false}); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },200); }} />

      {/* ══ Bandeau parrainage ══ */}
      {!showAuthPanel && clientUser && view === 'booking' && (
        <ReferralBanner th={th} referralCode={referralCode} referralInfo={referralInfo}
          justRegisteredRef={justRegisteredRef} setJustRegisteredRef={setJustRegisteredRef} />
      )}

      {/* ══ CORPS 2 COLONNES ══ */}
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 16px 80px',
        display:'flex', gap:32, alignItems:'flex-start' }} className="bk-2c">

        {/* ── COLONNE GAUCHE ── */}
        <div style={{ flex:'1 1 0%', minWidth:0, paddingTop:16, width:'100%' }}>

          {/* Panneau auth */}
          {showAuthPanel && (
            <div style={{ marginBottom:24, animation:'fadeIn .2s ease' }}>
              {/* Bandeau contexte parrainage — filleul incité à créer un compte */}
              {referralCode && referralInfo && !clientUser && (
                <div style={{ marginBottom:16, padding:'12px 14px',
                  background:'#eef2ff',
                  borderLeft:'2px solid #6366f1', borderRadius:8,
                  display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight: 500, color:'#4338ca', margin:'0 0 2px' }}>
                      Vous êtes invité par un ami — créez votre compte pour en profiter
                    </p>
                    <p style={{ fontSize:12, color:'#4338ca', margin:0, lineHeight:1.5, opacity:0.85 }}>
                      Code <span style={{fontWeight:500,fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace'}}>{referralCode}</span> — remise de{' '}
                      <span style={{fontWeight:500}}>
                        {referralInfo.discount_type === 'percent'
                          ? `${referralInfo.discount_value}%`
                          : `${Number(referralInfo.discount_value).toFixed(2)} €`}
                      </span>{' '}
                      appliquée selon les conditions du commerçant.
                    </p>
                  </div>
                </div>
              )}
              <AuthPanel slug={slug} th={th} requireAccount={requireAccount}
                initialEmail={authInitEmail}
                initialMode={authInitMode}
                referralCode={referralCode}
                quickMode={quickMode}
                onModeChange={(m) => {
                  // Miroir URL : /book/:slug/login <-> /book/:slug/register
                  // pour que le refresh garde l'écran en cours.
                  if (m === 'login' || m === 'register') {
                    setAuthInitMode(m);
                    navigate(`/book/${slug}/${m}`, { replace: true });
                  }
                }}
                onAuth={(u, meta) => {
                  // Si filleul avec code de parrainage → flag pour afficher
                  // la confirmation "promotion appliquée" sur la page d'accueil
                  if (meta?.justRegistered && referralCode) setJustRegisteredRef(true);
                  handleAuth(u, meta);
                  setAuthInitEmail('');
                  setAuthInitMode('login');
                  // Inscription QR : nettoyer `?quick=1` + repartir sur l'accueil
                  if (meta?.quick) {
                    setQuickMode(false);
                    navigate(`/book/${slug}`, { replace:true });
                  }
                }}
                onClose={requireAccount ? null : ()=>{ setShowAuthPanel(false); setAuthInitEmail(''); setAuthInitMode('login'); navigate(`/book/${slug}`, {replace:true}); }} />
            </div>
          )}

          {/* ══ PAGE D'ACCUEIL (étape 1) ══ */}
          {!showAuthPanel && step === 1 && (
            <Step1Home
              th={th} slug={slug} business={business} services={services} employees={employees}
              refProgram={refProgram} googleRating={googleRating}
              svcGroups={svcGroups} svcNoCat={svcNoCat}
              setView={setView} navigate={navigate}
              setSelSvc={setSelSvc} setSelEmp={setSelEmp}
              setSelDate={setSelDate} setSelSlot={setSelSlot}
              setMonthKey={setMonthKey} goToStep={goToStep}
            />
          )}

          {/* ══ ÉTAPES 2–6 : Flow réservation ══ */}
          {!showAuthPanel && step >= 2 && (
            <div className="bk-steps" style={{ maxWidth:600, width:'100%', animation:'fadeIn .15s ease' }}>

              {/* Bouton retour */}
              <button
                onClick={()=> step===2?goToStep(1):step===3?goToStep(2):step===4?goToStep(3):step===5?goToStep(4):goToStep(5)}
                style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight: 500,
                  color:th.muted, background:'none', border:'none', cursor:'pointer',
                  padding:'0 0 20px', marginBottom:4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  style={{width:16,height:16}}><polyline points="15 18 9 12 15 6"/></svg>
                {step===2 ? (selEmp&&!selSvc ? selEmp.name : 'Nos prestations')
                  : step===3 ? (selSvc?.name || selEmp?.name)
                  : step===4 ? (selEmp?._anyEmployee ? 'Premier disponible' : selEmp?.name)
                  : step===5 ? selDate?.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})
                  : 'Informations'}
              </button>

              {/* Barre de progression */}
              <div style={{ display:'flex', gap:4, marginBottom:28 }}>
                {[1,2,3,4,5,6].map(i=>(
                  <div key={i} style={{ flex:i===step?2:1, height:3, borderRadius:99,
                    background: i<=step ? th.accent : th.border,
                    opacity: i<=step ? 1 : 0.3, transition:'all .3s' }}/>
                ))}
              </div>

              {/* ── ÉTAPE 2 ── */}
              {step === 2 && (
                <Step2ServiceOrEmployee
                  th={th} selSvc={selSvc} selEmp={selEmp}
                  employees={employees} svcGroups={svcGroups} svcNoCat={svcNoCat}
                  setSelSvc={setSelSvc} setSelEmp={setSelEmp}
                  setSelDate={setSelDate} setSelSlot={setSelSlot}
                  setMonthKey={setMonthKey} goToStep={goToStep}
                />
              )}

              {/* ── ÉTAPE 3 : Date ── */}
              {step === 3 && (
                <Step3Date
                  th={th} selEmp={selEmp} selDate={selDate}
                  calMonth={calMonth} setCalMonth={setCalMonth} setSelDate={setSelDate}
                  today={today} maxDate={maxDate} calDays={calDays}
                  monthStatus={monthStatus} closedDays={closedDays} goToStep={goToStep}
                />
              )}

              {/* ── ÉTAPE 4 : Créneau ── */}
              {step === 4 && (
                <Step4Slot
                  th={th} selSvc={selSvc} selDate={selDate} selSlot={selSlot}
                  setSelSlot={setSelSlot} visibleSlots={visibleSlots}
                  slotsLoading={slotsLoading} goToStep={goToStep}
                />
              )}

              {/* ── ÉTAPE 5 : Infos client (compte obligatoire commit 22) ── */}
              {step === 5 && (
                <Step5Info
                  th={th} slug={slug}
                  selSvc={selSvc} selEmp={selEmp} selDate={selDate} selSlot={selSlot}
                  clientUser={clientUser} setClientUser={setClientUser}
                  clientPhone={clientPhone} setCP={setCP}
                  notes={notes} setNotes={setNotes} bookErr={bookErr}
                  phoneErr={phoneErr} setPhoneErr={setPhoneErr}
                  referralCode={referralCode} handleAuth={handleAuth}
                  navigate={navigate} setMyApptsInitTab={setMyApptsInitTab}
                  setView={setView} goToStep={goToStep}
                />
              )}

              {/* ── ÉTAPE 6 : Confirmation ── */}
              {step === 6 && (
                <Step6Confirm
                  th={th} slug={slug}
                  selSvc={selSvc} selEmp={selEmp} selDate={selDate} selSlot={selSlot}
                  clientUser={clientUser} clientName={clientName}
                  clientEmail={clientEmail} clientPhone={clientPhone}
                  promoCode={promoCode} setPromoCode={setPromoCode}
                  promoData={promoData} setPromoData={setPromoData}
                  promoErr={promoErr} setPromoErr={setPromoErr}
                  promoLoading={promoLoading} checkPromo={checkPromo}
                  bookErr={bookErr} booking={booking} handleBook={handleBook}
                  paymentConfig={paymentConfig}
                  referralCode={referralCode}
                />
              )}
            </div>
          )}
        </div>

        {/* ── SIDEBAR DROITE (desktop) ── */}
        <SideCard th={th} slug={slug} business={business}
          onReserve={()=>{ if(step>1) goToStep(1);
            else { const el=document.getElementById('section-prestations');
              if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); }}} />
      </div>

      {/* ── Bouton Réserver fixe mobile ── */}
      {step === 1 && (
        <div className="bk-mo" style={{
          position:'fixed', bottom:0, left:0, right:0, zIndex:40,
          padding:'12px 16px', background:th.navBg,
          borderTop: `0.5px solid ${th.border}`,
          boxShadow: '0 -1px 3px rgba(0,0,0,0.05)',
        }}>
          <button
            onClick={()=>{ const el=document.getElementById('section-prestations');
              if(el) el.scrollIntoView({behavior:'smooth'}); }}
            style={{ width:'100%', padding:'15px', borderRadius:12,
              background:th.accent, border:'none', fontWeight: 500, fontSize:15,
              color:th.accentText, cursor:'pointer' }}>
            Réserver
          </button>
        </div>
      )}
    </div>{postRegOverlay}</>
  );
}
