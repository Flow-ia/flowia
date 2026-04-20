// src/pages/BookingPage.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { pubApi, globalClientApi, mediaApi, publicReferralApi } from '../utils/api';
import {
  MONTHS_FR, DAYS_MINI, LIGHT_THEME, DARK_THEME,
  withV, serviceImgUrl, employeeImgUrl, mediaUrl,
  Spinner, ThemeToggle, BackBtn,
} from './booking/shared';
import { NavBar } from './booking/NavBar';
import { SideCard, MobileHoursBlock } from './booking/SideCard';
import { AccordionGroup, ServiceThumb, ServiceCard } from './booking/Services';
import { MyAppointments } from './booking/MyAppointments';
import { AuthPanel, GlobalAccountView, PostRegisterPopup } from './booking/Account';
import { ReferralPage } from './booking/ReferralPage';

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
      const REF_RE = /^[A-Z0-9]{4,30}$/;
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
        localStorage.setItem('ff_client_token', gcToken);
        localStorage.setItem('ff_client_info', JSON.stringify(client));
        setClientUser(client);
        // Nettoyer l'URL
        window.history.replaceState({}, '', window.location.pathname);
      } catch(e) { console.error('[GOOGLE CALLBACK]', e); }
    }
    if (authErr) {
      console.warn('[GOOGLE AUTH ERROR]', decodeURIComponent(authErr));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Lire l'URL au montage et restaurer la vue (client/rdv, client/profil)
  // + gérer les ancres hash pour scroll automatique vers les sections
  useEffect(() => {
    const path = location.pathname;
    const hash = location.hash; // ex: #equipe, #adresse, #commentaires, #prestations
    if (path.endsWith('/auth')) {
      setShowAuthPanel(true);
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
      // Mapping ancres → IDs de section
      const ANCHOR_MAP = {
        '#equipe':        'section-equipe',
        '#equipes':       'section-equipe',
        '#adresse':       'section-adresse',
        '#adresses':      'section-adresse',
        '#commentaires':  'section-avis',
        '#avis':          'section-avis',
        '#commentaire':   'section-avis',
        '#prestations':   'section-prestations',
        '#prestation':    'section-prestations',
        '#services':      'section-prestations',
        '#images':        'section-photos',
        '#photos':        'section-photos',
        '#album':         'section-photos',
      };
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
    const token = localStorage.getItem('ff_client_token');
    if (!token) {
      setAuthInitMode('register');
      setShowAuthPanel(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Construire l'URL pour chaque étape
  const stepToPath = (s, svcId, empId, dateStr, slot) => {
    const base = `/book/${slug}`;
    if (s === 1) return base;
    if (s === 2 && svcId) return `${base}/service/${svcId}/employe`;
    if (s === 3 && svcId && empId) return `${base}/service/${svcId}/employe/${empId}/date`;
    if (s === 4 && svcId && empId && dateStr) return `${base}/service/${svcId}/employe/${empId}/date/${dateStr}/creneau`;
    if (s === 5 && svcId && empId && dateStr && slot) return `${base}/service/${svcId}/employe/${empId}/date/${dateStr}/creneau/${slot}/infos`;
    if (s === 6 && svcId && empId && dateStr && slot) return `${base}/service/${svcId}/employe/${empId}/date/${dateStr}/creneau/${slot}/confirmation`;
    return base;
  };

  // Wrapper setStep qui met aussi à jour l'URL
  const goToStep = (s, svc, emp, date, slot) => {
    const svcId   = (svc  || selSvc)?.id   || null;
    const empId   = (emp  || selEmp)?._anyEmployee ? 'any' : ((emp || selEmp)?.id || null);
    const dateStr = (date || selDate)?.toLocaleDateString('sv-SE') || null;
    const slotStr = slot || selSlot || null;
    const path    = stepToPath(s, svcId, empId, dateStr, slotStr);
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

  // Téléphone avec indicatif pays
  const PHONE_COUNTRIES = [
    { code:'FR', dial:'+33', flag:'🇫🇷', len:[9,10], label:'France' },
    { code:'BE', dial:'+32', flag:'🇧🇪', len:[8,9],  label:'Belgique' },
    { code:'CH', dial:'+41', flag:'🇨🇭', len:[9,10], label:'Suisse' },
    { code:'LU', dial:'+352',flag:'🇱🇺', len:[8,9],  label:'Luxembourg' },
    { code:'CA', dial:'+1',  flag:'🇨🇦', len:[10],   label:'Canada' },
    { code:'MA', dial:'+212',flag:'🇲🇦', len:[9],    label:'Maroc' },
    { code:'TN', dial:'+216',flag:'🇹🇳', len:[8],    label:'Tunisie' },
    { code:'DZ', dial:'+213',flag:'🇩🇿', len:[9],    label:'Algérie' },
    { code:'SN', dial:'+221',flag:'🇸🇳', len:[9],    label:'Sénégal' },
    { code:'CI', dial:'+225',flag:'🇨🇮', len:[10],   label:'Côte d\'Ivoire' },
    { code:'DE', dial:'+49', flag:'🇩🇪', len:[10,11],label:'Allemagne' },
    { code:'ES', dial:'+34', flag:'🇪🇸', len:[9],    label:'Espagne' },
    { code:'IT', dial:'+39', flag:'🇮🇹', len:[9,10], label:'Italie' },
    { code:'PT', dial:'+351',flag:'🇵🇹', len:[9],    label:'Portugal' },
    { code:'GB', dial:'+44', flag:'🇬🇧', len:[10,11],label:'Royaume-Uni' },
    { code:'US', dial:'+1',  flag:'🇺🇸', len:[10],   label:'États-Unis' },
  ];
  const [phoneCC, setPhoneCC]       = useState(PHONE_COUNTRIES[0]); // pays sélectionné
  const [phoneLocal, setPhoneLocal] = useState(''); // numéro local brut
  const [phoneDrop, setPhoneDrop]   = useState(false); // dropdown ouvert
  const [phoneErr, setPhoneErr]     = useState('');

  // Formater le numéro final : +<dial><numéro sans zéro initial>
  const formatPhone = (country, local) => {
    const digits = local.replace(/\D/g, '');
    if (!digits) return '';
    const stripped = digits.startsWith('0') ? digits.slice(1) : digits;
    return `${country.dial}${stripped}`;
  };
  // Valider le numéro local
  const validatePhone = (country, local) => {
    const digits = local.replace(/\D/g, '');
    if (!digits) return 'Numéro requis';
    const stripped = digits.startsWith('0') ? digits.slice(1) : digits;
    if (!country.len.includes(stripped.length)) {
      return `Numéro invalide pour ${country.label} (${country.len.join(' ou ')} chiffres attendus)`;
    }
    return '';
  };
  // Parser un numéro international existant → { country, local }
  const parsePhone = (phone) => {
    if (!phone) return { country: PHONE_COUNTRIES[0], local: '' };
    const match = PHONE_COUNTRIES.find(c => phone.startsWith(c.dial));
    if (match) {
      const rest = phone.slice(match.dial.length);
      return { country: match, local: rest };
    }
    return { country: PHONE_COUNTRIES[0], local: phone };
  };

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

  const checkPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true); setPromoErr('');
    try {
      const codeRaw = promoCode.trim();
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

  // Restore client session
  useEffect(() => {
    const token = localStorage.getItem('ff_client_token');
    const stored = localStorage.getItem('ff_client_info');
    if (token && stored) {
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
    ])
      .then(([biz, svcs, emps, cd]) => {
        setBiz(biz.business);
        setSvcs(svcs);
        setEmps(emps);
        setRequire(biz.business?.require_account ?? false);
        setClosed(cd?.closedDays || []);
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
    // Accepte les 2 jetons : ff_gc_token (compte global) OU ff_client_token
    // (login commerçant avec globalClientId). gcRequest relaie automatiquement.
    const tok = localStorage.getItem('ff_gc_token') || localStorage.getItem('ff_client_token');
    if (!tok) { setRefMyCode(null); setRefMyHistory([]); setRefMyRewards([]); return; }
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

  const handleBook = async () => {
    // Si compte requis et pas encore connecté → ouvrir auth + mémoriser qu'on voulait réserver
    const localToken = localStorage.getItem('ff_client_token');
    if (requireAccount && !clientUser && !localToken) { setShowAuthPanel(true); setPendingBook(true); return; }
    // Sans compte requis : permettre la réservation si les champs obligatoires sont remplis
    if (!requireAccount && !clientUser && !localToken && (!clientName.trim() || !clientPhone.trim())) { setBookErr('Nom et téléphone obligatoires.'); return; }
    // Connecté mais téléphone manquant → renvoyer à l'étape 5
    if ((clientUser || localToken) && !clientPhone.trim()) { setBookErr('Téléphone obligatoire. Veuillez compléter votre profil.'); setStep(5); return; }
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
  // Chaque entrée : { label, color, icon, svcs[] }
  const svcGroups = [];
  const svcNoCat  = [];
  const _catMap   = new Map(); // label → index dans svcGroups
  services.forEach(s => {
    const label = s.booking_category_name || s.category_name || null;
    const color = s.booking_category_color || null;
    const icon  = s.booking_category_icon  || null;
    if (!label) { svcNoCat.push(s); return; }
    if (!_catMap.has(label)) {
      _catMap.set(label, svcGroups.length);
      svcGroups.push({ label, color, icon, svcs: [] });
    }
    svcGroups[_catMap.get(label)].svcs.push(s);
  });

  const inp = "w-full px-4 py-3.5 rounded-2xl text-sm focus:outline-none";
  const inpSt = { background:th.inputBg, border:`1px solid ${th.inputBorder}`, color:th.text };

  // ── Vues principales ──────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:th.bg}}>
      <Spinner />
    </div>
  );

  if (error && !business) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{background:th.bg}}>
      <div className="text-center">
        <p className="text-5xl mb-4">😕</p>
        <h1 className="text-xl font-black mb-2" style={{color:th.text}}>Page introuvable</h1>
        <p className="text-sm" style={{color:th.muted}}>Ce lien n&apos;existe pas ou est désactivé.</p>
      </div>
    </div>
  );

  // Vue : Client bloqué
  if (isBlocked) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{background:th.bg}}>
      <div style={{ maxWidth:380, width:'100%', textAlign:'center' }}>
        <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(239,68,68,0.1)', border:'2px solid rgba(239,68,68,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, margin:'0 auto 24px' }}>
          🚫
        </div>
        <h1 style={{ fontSize:20, fontWeight:900, color:th.text, marginBottom:12, letterSpacing:'-.4px' }}>
          Réservation impossible
        </h1>
        <p style={{ fontSize:15, color:th.muted, lineHeight:1.6, marginBottom:28 }}>
          Ce commerçant n'accepte plus de réservation pour vous.<br/>
          Merci de prendre contact avec le commerçant directement.
        </p>
        {business?.phone && (
          <a href={`tel:${business.phone}`}
            style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'12px 24px', borderRadius:14, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontWeight:800, fontSize:14, textDecoration:'none' }}>
            📞 Appeler {business.business_name || 'le commerçant'}
          </a>
        )}
        {!business?.phone && (
          <p style={{ fontSize:13, color:th.muted, fontStyle:'italic' }}>
            Contactez {business?.business_name || 'le commerçant'} pour plus d'informations.
          </p>
        )}
      </div>
    </div>
  );

  // Vue : Mes RDV

  // Overlay popup post-inscription (réutilisé dans toutes les vues).
  const postRegOverlay = showPostRegister && clientUser ? (
    <PostRegisterPopup slug={slug} th={th} client={clientUser}
      onClose={() => setShowPostRegister(false)}
      onSaved={(c) => { setClientUser(c); localStorage.setItem('ff_client_info', JSON.stringify(c)); }} />
  ) : null;

  if (view === 'myAppts') return (
    <><div style={{ minHeight:'100vh', background:th.bg }}>
      <NavBar th={th} slug={slug} business={business} clientUser={clientUser} refProgram={refProgram}
        onToggleTheme={toggleTheme} onShowAuth={()=>setShowAuthPanel(true)}
        onMyAppts={()=>{navigate(`/book/${slug}/client/rdv`,{replace:false}); setMyApptsInitTab('appts');}}
        onLogout={()=>{ localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); setMyApptsInitTab('appts'); setView('booking'); }}
        onReferralPage={() => { setView('parrain'); navigate(`/book/${slug}/parrain`, {replace:false}); }}
        onNavigateHome={(id)=>{ setView('booking'); goToStep(1); navigate(`/book/${slug}`,{replace:false}); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },200); }} />
      <MyAppointments slug={slug} th={th} initialTab={myApptsInitTab} initialVisitId={myApptsInitVisitId} business={business}
        onBack={() => { setMyApptsInitTab('appts'); setView(bookedAppt ? 'success' : 'booking'); navigate(bookedAppt ? location.pathname : `/book/${slug}`, {replace:true}); }}
        onNewBooking={resetBooking}
        onLogout={() => {
          localStorage.removeItem('ff_client_token');
          localStorage.removeItem('ff_client_info');
          setClientUser(null); setCN(''); setCE(''); setCP('');
          setMyApptsInitTab('appts');
          setView('booking');
        }} />
    </div>{postRegOverlay}</>
  );

  // Vue : Page parrainage
  if (view === 'parrain') return (
    <><div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      <NavBar th={th} slug={slug} business={business} clientUser={clientUser} refProgram={refProgram}
        onToggleTheme={toggleTheme} onShowAuth={()=>{ setShowAuthPanel(true); navigate(`/book/${slug}/auth`, {replace:false}); }}
        onMyAppts={()=>{navigate(`/book/${slug}/client/rdv`,{replace:false}); setView('myAppts'); setMyApptsInitTab('appts');}}
        onLogout={()=>{ localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); setView('booking'); navigate(`/book/${slug}`,{replace:false}); }}
        onReferralPage={() => { /* déjà sur la page */ }}
        onNavigateHome={(id)=>{ setView('booking'); navigate(`/book/${slug}`,{replace:false}); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },200); }} />
      <ReferralPage
        th={th} slug={slug} business={business} refProgram={refProgram}
        gcConnected={!!clientUser}
        gcUser={clientUser}
        refMyCode={refMyCode}
        refMyHistory={refMyHistory}
        refMyRewards={refMyRewards}
        onLogin={() => { setShowAuthPanel(true); navigate(`/book/${slug}/auth`, {replace:false}); setView('booking'); }}
        onRegister={() => { setShowAuthPanel(true); navigate(`/book/${slug}/auth`, {replace:false}); setView('booking'); }}
        onAuthSuccess={(client, meta) => { handleAuth(client, meta); /* reste sur /parrain → useEffect recharge code+historique */ }}
        onBack={() => { setView('booking'); navigate(`/book/${slug}`, {replace:false}); }}
      />
    </div>{postRegOverlay}</>
  );

  // Vue : Confirmation
  if (view === 'success' && bookedAppt) return (
    <><div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      {/* Navbar persistante */}
      <NavBar th={th} slug={slug} business={business} clientUser={clientUser}
        onToggleTheme={toggleTheme} onShowAuth={()=>setShowAuthPanel(true)}
        onMyAppts={()=>{navigate(`/book/${slug}/client/rdv`,{replace:false}); setView('myAppts'); setMyApptsInitTab('appts');}}
        onLogout={()=>{ localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); }}
        onNavigateHome={(id)=>{ resetBooking(); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },300); }} />

      <div style={{ maxWidth:440, margin:'0 auto', padding:'48px 24px 80px',
        display:'flex', flexDirection:'column', alignItems:'center' }}>

        {/* Icône succès */}
        <div style={{ width:72, height:72, borderRadius:20, background:'#22c55e',
          display:'flex', alignItems:'center', justifyContent:'center', marginBottom:24,
          boxShadow:'0 8px 24px rgba(34,197,94,0.25)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round" style={{width:36,height:36}}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <h1 style={{ fontSize:24, fontWeight:900, color:th.text, margin:'0 0 8px',
          letterSpacing:'-0.03em', textAlign:'center' }}>
          Réservation confirmée !
        </h1>
        <p style={{ fontSize:14, color:th.muted, margin:'0 0 28px', textAlign:'center' }}>
          {clientEmail ? 'Un email de confirmation a été envoye.' : 'Votre RDV est enregistre.'}
        </p>

        {/* Numéro de réservation */}
        <div style={{ width:'100%', background:th.cardAlt, border:`1px solid ${th.border}`,
          borderRadius:14, padding:'16px 20px', textAlign:'center', marginBottom:16 }}>
          <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase',
            letterSpacing:'0.08em', color:th.muted, margin:'0 0 6px' }}>
            Numéro de réservation
          </p>
          <p style={{ fontSize:24, fontWeight:900, color:th.text, fontFamily:'monospace',
            margin:0, letterSpacing:'0.05em' }}>
            #{bookedAppt.id.substring(0,8).toUpperCase()}
          </p>
        </div>

        {/* Récap */}
        <div style={{ width:'100%', background:th.card, border:`1px solid ${th.border}`,
          borderRadius:14, overflow:'hidden', marginBottom:24 }}>
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
                <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:13, textDecoration:'line-through', color:th.dim }}>
                    {Number(selSvc.price).toFixed(2)} €
                  </span>
                  <span style={{ fontSize:13, fontWeight:800, color:'#16a34a' }}>
                    {(Number(selSvc.price||0) - Number(bookedAppt.discount_amount||0)).toFixed(2)} €
                  </span>
                </span>
              ) : (
                <span style={{ fontSize:13, fontWeight:700, color:th.text }}>{val}</span>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:10 }}>
          {clientUser && (
            <button onClick={() => { navigate(`/book/${slug}/client/rdv`,{replace:false}); setView('myAppts'); setMyApptsInitTab('appts'); }}
              style={{ width:'100%', padding:'15px', borderRadius:12, border:'none',
                background:th.accent, color:th.accentText, fontWeight:800, fontSize:14,
                cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
              Voir mes rendez-vous →
            </button>
          )}
          <button onClick={resetBooking}
            style={{ width:'100%', padding:'14px', borderRadius:12, cursor:'pointer',
              background:th.card, border:`1px solid ${th.border}`,
              color:th.text, fontWeight:600, fontSize:14 }}>
            Prendre un autre RDV
          </button>
        </div>
      </div>
    </div>{postRegOverlay}</>
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
        onToggleTheme={toggleTheme} onShowAuth={()=>{ setShowAuthPanel(true); navigate(`/book/${slug}/auth`, {replace:false}); }}
        onMyAppts={()=>{ navigate(`/book/${slug}/client/rdv`, {replace:false}); setMyApptsInitTab('appts'); setView('myAppts'); }}
        onLogout={()=>{ localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); }}
        onReferralPage={() => { setView('parrain'); navigate(`/book/${slug}/parrain`, {replace:false}); }}
        onNavigateHome={(id)=>{ setView('booking'); goToStep(1); setShowAuthPanel(false); navigate(`/book/${slug}`, {replace:false}); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },200); }} />

      {/* ══ Bandeau parrainage ══
           3 états :
           (1) Éligible (ou éligibilité non vérifiée) → vert : remise annoncée
           (2) NON éligible (clientUser présent mais ne remplit pas les
               conditions) → orange : message pédagogique unifié
           (3) Pas de bandeau si pas de code parrainage */}
      {!showAuthPanel && referralCode && referralInfo && clientUser && view === 'booking' && (
        <div style={{ maxWidth:1100, margin:'0 auto 16px', padding:'0 16px' }}>
          {referralInfo.eligible === false ? (
            <div style={{ padding:'12px 16px', borderRadius:14,
              background:'rgba(245,158,11,0.1)',
              border:'1px solid rgba(245,158,11,0.35)',
              display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
              <span style={{ fontSize:20 }}>ℹ️</span>
              <p style={{ fontSize:13, color:th.text, margin:0, flex:1, minWidth:0, lineHeight:1.5 }}>
                <strong>Vous ne pouvez pas bénéficier de ce programme de parrainage</strong>
                {' '}car vous ne répondez pas aux conditions définies par le commerçant
                (programme réservé aux nouveaux clients, quota parrain atteint, ou règles spécifiques).
                Vous pouvez continuer votre réservation au prix normal.
              </p>
            </div>
          ) : (
          <div style={{ padding:'12px 16px', borderRadius:14,
            background:'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(99,102,241,0.12))',
            border:'1px solid rgba(16,185,129,0.32)',
            display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <span style={{ fontSize:20 }}>🎁</span>
            <p style={{ fontSize:13, color:th.text, margin:0, flex:1, minWidth:0, lineHeight:1.5 }}>
              {justRegisteredRef
                ? <>Compte créé avec succès ! Votre code parrainage <strong style={{color:'#6d28d9',fontFamily:'monospace'}}>{referralCode}</strong> sera appliqué au récap — remise de{' '}
                    <strong>{referralInfo.discount_type === 'percent' ? `${referralInfo.discount_value}%` : `${Number(referralInfo.discount_value).toFixed(2)} €`}</strong>{' '}
                    selon les conditions du commerçant.</>
                : <>Parrainage actif — code <strong style={{color:'#6d28d9',fontFamily:'monospace'}}>{referralCode}</strong>, remise de{' '}
                    <strong>{referralInfo.discount_type === 'percent' ? `${referralInfo.discount_value}%` : `${Number(referralInfo.discount_value).toFixed(2)} €`}</strong>{' '}
                    appliquée au récap selon les conditions du commerçant.</>
              }
            </p>
            <button onClick={() => setJustRegisteredRef(false)} aria-label="Fermer"
              style={{ width:26, height:26, borderRadius:8, border:'none',
                background:'rgba(0,0,0,0.06)', cursor:'pointer', color:th.muted,
                display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{width:12,height:12}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          )}
        </div>
      )}

      {/* ══ CORPS 2 COLONNES ══ */}
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 16px 80px',
        display:'flex', gap:32, alignItems:'flex-start' }} className="bk-2c">

        {/* ── COLONNE GAUCHE ── */}
        <div style={{ flex:'1 1 0%', minWidth:0, paddingTop:32, width:'100%' }}>

          {/* Panneau auth */}
          {showAuthPanel && (
            <div style={{ marginBottom:24, animation:'fadeIn .2s ease' }}>
              {/* Bandeau contexte parrainage — filleul incité à créer un compte */}
              {referralCode && referralInfo && !clientUser && (
                <div style={{ marginBottom:16, padding:'14px 18px',
                  background:'linear-gradient(135deg, rgba(139,92,246,0.14), rgba(99,102,241,0.14))',
                  border:'1px solid rgba(139,92,246,0.35)', borderRadius:14,
                  display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <span style={{ fontSize:22 }}>🎁</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:800, color:th.text, margin:'0 0 2px' }}>
                      Vous êtes invité par un ami — créez votre compte pour en profiter
                    </p>
                    <p style={{ fontSize:12, color:th.muted, margin:0, lineHeight:1.5 }}>
                      Code <strong style={{color:'#6d28d9',fontFamily:'monospace'}}>{referralCode}</strong> — remise de{' '}
                      <strong style={{color:th.text}}>
                        {referralInfo.discount_type === 'percent'
                          ? `${referralInfo.discount_value}%`
                          : `${Number(referralInfo.discount_value).toFixed(2)} €`}
                      </strong>{' '}
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
            <div style={{ animation:'fadeIn .2s ease' }}>

              {/* Infos commerçant mobile */}
              <div className="bk-mo" style={{ marginBottom:24, padding:20,
                background:th.card, borderRadius:16, border:`1px solid ${th.border}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <div style={{ width:56, height:56, borderRadius:12, overflow:'hidden', flexShrink:0,
                    background:th.cardAlt, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {business?.profile_url
                      ? <img src={mediaUrl(business.profile_url)} alt={business.business_name}
                          style={{ width:'100%', height:'100%', objectFit:'cover' }}
                          onError={e=>e.target.style.display='none'}/>
                      : <span style={{ fontSize:22, fontWeight:900, color:'#374151' }}>
                          {(business?.business_name||'B').charAt(0).toUpperCase()}
                        </span>}
                  </div>
                  <div>
                    <h1 style={{ fontSize:18, fontWeight:800, color:th.text, margin:'0 0 4px',
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
                      background:'#8b5cf615', border:'1px solid #8b5cf640',
                      color:'#6d28d9', fontWeight:700, fontSize:12,
                      display:'flex', alignItems:'center', gap:6, width:'100%', justifyContent:'center',
                      whiteSpace:'nowrap' }}>
                    🤝 Programme parrainage
                  </button>
                )}
              </div>

              {/* ── SECTION PRESTATIONS ── */}
              <section id="section-prestations" style={{ marginBottom:40 }}>
                <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                  margin:'0 0 20px', letterSpacing:'-0.02em' }}>Nos prestations</h2>
                {services.length === 0 ? (
                  <p style={{ color:th.muted, fontSize:14 }}>Aucune prestation disponible.</p>
                ) : (
                  <div style={{ border:`1px solid ${th.border}`, borderRadius:12,
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
              <section id="section-equipe" style={{ marginBottom:40 }}>
                <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
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
                      style={{ background:th.card, border:`1px solid ${th.border}`,
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
                          <span style={{ fontSize:20, fontWeight:800,
                            color:e.avatar_color||'#374151' }}>
                            {e.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:14, fontWeight:700, color:th.text,
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
                <section id="section-avis" style={{ marginBottom:40 }}>
                  <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                    margin:'0 0 16px', letterSpacing:'-0.02em' }}>Commentaires</h2>

                  {/* Widget avis Google — style page Google Maps */}
                  <div style={{ background:th.card, border:`1px solid ${th.border}`,
                    borderRadius:14, overflow:'hidden' }}>

                    {/* En-tête : logo Google + titre */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'14px 18px', borderBottom:`1px solid ${th.border}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <svg viewBox="0 0 24 24" width="18" height="18" style={{flexShrink:0}}>
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span style={{ fontSize:13, fontWeight:700, color:th.text }}>
                          Avis Google
                        </span>
                      </div>
                      <a href={business.google_business_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize:12, color:'#2563eb', fontWeight:600, textDecoration:'none',
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
                          <p style={{ fontSize:40, fontWeight:900, color:th.text,
                            margin:0, lineHeight:1, fontFamily:'monospace' }}>
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
                            background:th.cardAlt, border:`1px solid ${th.border}`,
                            color:th.text }}>
                          <span style={{ fontSize:13, fontWeight:700, flex:1 }}>
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
                        borderBottom:`1px solid ${th.border}` }}>
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
                          fontWeight:700, color:th.text,
                          background:th.cardAlt, border:`1px solid ${th.border}` }}>
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
                          fontWeight:700, color:th.accentText,
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
                <section id="section-photos" style={{ marginBottom:40 }}>
                  <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                    margin:'0 0 16px', letterSpacing:'-0.02em' }}>Photos</h2>
                  <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:12 }}>
                    {business.cover_urls.map((c, i) => (
                      <div key={c.id||i} style={{ aspectRatio:'4/3',
                        borderRadius:14, overflow:'hidden',
                        background:th.cardAlt, border:`1px solid ${th.border}` }}>
                        <img src={mediaUrl(c.url)} alt={`Photo ${i+1}`}
                          loading="lazy"
                          style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── SECTION ADRESSE (deplacee en bas : prestations + equipe prioritaires) ── */}
              <section id="section-adresse" style={{ marginBottom:40 }}>
                <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                  margin:'0 0 16px', letterSpacing:'-0.02em' }}>Adresse</h2>

                {/* Carte Google Maps embed — si adresse disponible */}
                {(business?.address || business?.city) && (() => {
                  const addrQ = encodeURIComponent(
                    [business.address, business.postal_code, business.city]
                    .filter(Boolean).join(' ')
                  );
                  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${addrQ}`;
                  const embedUrl = `https://maps.google.com/maps?q=${addrQ}&output=embed&hl=fr&z=15`;
                  return (
                    <div style={{ borderRadius:14, overflow:'hidden', marginBottom:16,
                      border:`1px solid ${th.border}` }}>
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
                          borderTop:`1px solid ${th.border}`,
                          fontSize:13, fontWeight:600, color:'#2563eb', textDecoration:'none' }}>
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
                <div style={{ background:th.card, border:`1px solid ${th.border}`,
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
                paddingTop:24, borderTop:`1px solid ${th.border}` }}>
                <div>
                  <p style={{ fontSize:14, fontWeight:700, color:th.text, margin:'0 0 10px' }}>
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
                  <p style={{ fontSize:14, fontWeight:700, color:th.text, margin:'0 0 10px' }}>
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
          )}

          {/* ══ ÉTAPES 2–6 : Flow réservation ══ */}
          {!showAuthPanel && step >= 2 && (
            <div className="bk-steps" style={{ maxWidth:600, width:'100%', animation:'fadeIn .15s ease' }}>

              {/* Bouton retour */}
              <button
                onClick={()=> step===2?goToStep(1):step===3?goToStep(2):step===4?goToStep(3):step===5?goToStep(4):goToStep(5)}
                style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600,
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

              {/* ── ÉTAPE 2 : Si employé pré-sélectionné → Prestations ; sinon → Employé ── */}
              {step === 2 && (
                <div>
                  {selEmp && !selSvc ? (
                    /* ─── Parcours par EMPLOYÉ : afficher les prestations disponibles ─── */
                    <div>
                      {/* Badge employé pré-sélectionné */}
                      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
                        background:th.card, border:`1px solid ${th.border}`,
                        borderRadius:12, marginBottom:20 }}>
                        <div style={{ width:40, height:40, borderRadius:99, flexShrink:0,
                          background:th.cardAlt, display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:16, fontWeight:800, color:selEmp.avatar_color||'#374151' }}>
                          {selEmp.name.charAt(0)}
                        </div>
                        <div style={{ flex:1 }}>
                          <p style={{ fontSize:13, fontWeight:700, color:th.text, margin:'0 0 1px' }}>
                            {selEmp.name}
                          </p>
                          {selEmp.role && (
                            <p style={{ fontSize:11, color:th.muted, margin:0 }}>{selEmp.role}</p>
                          )}
                        </div>
                        <button onClick={()=>{ setSelEmp(null); }}
                          style={{ fontSize:12, color:th.muted,
                            cursor:'pointer', padding:'4px 8px', borderRadius:7,
                            background:th.cardAlt, border:`1px solid ${th.border}` }}>
                          Changer
                        </button>
                      </div>

                      <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                        margin:'0 0 16px', letterSpacing:'-0.02em' }}>Choisir une prestation</h2>

                      {/* Liste des services style accordéon */}
                      <div style={{ border:`1px solid ${th.border}`, borderRadius:12,
                        overflow:'hidden', background:th.card }}>
                        {[
                          ...svcGroups.map(g => ({ label:g.label, svcs:g.svcs })),
                          ...(svcNoCat.length>0 ? [{ label:null, svcs:svcNoCat }] : []),
                        ].map(({ label, svcs: gs }, gi, arr) => (
                          <AccordionGroup key={label||'__nc__'}
                            label={label} svcs={gs} th={th}
                            isLast={gi===arr.length-1}
                            onSelect={s=>{
                              setSelSvc(s);
                              setSelDate(null); setSelSlot(null); setMonthKey('');
                              goToStep(3, s, selEmp);
                            }}/>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* ─── Parcours par SERVICE : choisir l'employé ─── */
                    <div>
                      <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                        margin:'0 0 6px', letterSpacing:'-0.02em' }}>
                        Choisir un membre de l&apos;équipe
                      </h2>
                      <p style={{ fontSize:13, color:th.muted, margin:'0 0 20px' }}>
                        Pour : <strong style={{color:th.text}}>{selSvc?.name}</strong>
                      </p>
                      <button
                        onClick={()=>{ const emp={id:null,name:'Premier disponible',_anyEmployee:true,avatar_color:'#6366f1'}; setSelEmp(emp); setSelDate(null); setSelSlot(null); setMonthKey(''); goToStep(3, null, emp); }}
                        style={{ width:'100%', display:'flex', alignItems:'center', gap:16, padding:'18px 20px',
                          background:th.card, border:`1px solid ${th.border}`, borderRadius:16,
                          cursor:'pointer', marginBottom:12, textAlign:'left',
                          transition:'box-shadow 0.15s, transform 0.1s' }}
                        onMouseEnter={ev=>{ev.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.1)';ev.currentTarget.style.transform='translateY(-1px)';}}
                        onMouseLeave={ev=>{ev.currentTarget.style.boxShadow='none';ev.currentTarget.style.transform='none';}}>
                        <div style={{ width:56, height:56, borderRadius:99, flexShrink:0,
                          background:th.cardAlt, display:'flex', alignItems:'center',
                          justifyContent:'center', fontSize:24 }}>✨</div>
                        <div style={{flex:1}}>
                          <p style={{fontSize:14,fontWeight:700,color:th.text,margin:'0 0 2px'}}>Peu importe</p>
                          <p style={{fontSize:12,color:th.muted,margin:0}}>Premier membre disponible</p>
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{width:18,height:18,color:th.dim}}><polyline points="9 18 15 12 9 6"/></svg>
                      </button>
                      {employees.map(e=>(
                        <button key={e.id}
                          onClick={()=>{ setSelEmp(e); setSelDate(null); setSelSlot(null); setMonthKey(''); goToStep(3, null, e); }}
                          style={{ width:'100%', display:'flex', alignItems:'center', gap:16, padding:'18px 20px',
                            background:th.card, border:`1px solid ${th.border}`, borderRadius:16,
                            cursor:'pointer', marginBottom:12, textAlign:'left',
                            transition:'box-shadow 0.15s, transform 0.1s' }}
                          onMouseEnter={ev=>{ev.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.1)';ev.currentTarget.style.transform='translateY(-1px)';}}
                          onMouseLeave={ev=>{ev.currentTarget.style.boxShadow='none';ev.currentTarget.style.transform='none';}}>
                          <div style={{ width:56, height:56, borderRadius:99, flexShrink:0, overflow:'hidden',
                            background: e.has_image ? th.cardAlt : (e.avatar_color ? `${e.avatar_color}20` : th.cardAlt),
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:20, fontWeight:800, color:e.avatar_color||'#374151',
                            border:`2px solid ${e.avatar_color||th.border}30` }}>
                            {e.has_image ? (
                              <img src={employeeImgUrl(e.id, e.image_version)} alt={e.name}
                                style={{ width:'100%', height:'100%', objectFit:'cover' }}
                                onError={ev => { ev.currentTarget.style.display = 'none'; }} />
                            ) : (
                              e.name.charAt(0)
                            )}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <p style={{fontSize:14,fontWeight:700,color:th.text,margin:'0 0 2px',
                              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.name}</p>
                            {e.role && <p style={{fontSize:12,color:th.muted,margin:0}}>{e.role}</p>}
                          </div>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            style={{width:18,height:18,color:th.dim}}><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── ÉTAPE 3 : Date ── */}
              {step === 3 && (
                <div>
                  <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                    margin:'0 0 6px', letterSpacing:'-0.02em' }}>Choisir une date</h2>
                  <p style={{ fontSize:13, color:th.muted, margin:'0 0 20px' }}>
                    avec <strong style={{color:th.text}}>
                      {selEmp?._anyEmployee ? 'Premier disponible' : selEmp?.name}
                    </strong>
                  </p>
                  <div style={{ background:th.card, border:`1px solid ${th.border}`,
                    borderRadius:20, padding:'24px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                      <button onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}
                        style={{ width:36,height:36,borderRadius:8,border:`1px solid ${th.border}`,
                          background:th.cardAlt,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          style={{width:14,height:14,color:th.muted}}><polyline points="15 18 9 12 15 6"/></svg>
                      </button>
                      <p style={{fontSize:15,fontWeight:700,color:th.text}}>
                        {MONTHS_FR[calMonth.getMonth()]} {calMonth.getFullYear()}
                      </p>
                      <button onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}
                        style={{ width:36,height:36,borderRadius:8,border:`1px solid ${th.border}`,
                          background:th.cardAlt,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          style={{width:14,height:14,color:th.muted}}><polyline points="9 18 15 12 9 6"/></svg>
                      </button>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6,marginBottom:10}}>
                      {DAYS_MINI.map((d,i)=>(
                        <div key={i} style={{textAlign:'center',fontSize:13,fontWeight:800,color:th.muted,padding:'8px 0'}}>{d}</div>
                      ))}
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6}}>
                      {calDays.map((d,i)=>{
                        if(!d) return <div key={i}/>;
                        const isPast=d<today, isFuture=d>maxDate;
                        const dateKey=d.toLocaleDateString('sv-SE');
                        const ds=monthStatus[dateKey];
                        const isClosed=ds==='closed'||(ds===undefined&&closedDays.includes(d.getDay()));
                        const isFull=ds==='full';
                        const isSel=selDate&&d.toDateString()===selDate.toDateString();
                        const isToday2=d.toDateString()===today.toDateString();
                        const disabled=isPast||isFuture||isClosed||isFull;
                        return(
                          <button key={i} onClick={()=>{if(!disabled){setSelDate(d);goToStep(4,null,null,d);}}} disabled={disabled}
                            style={{ height:48, borderRadius:12, fontSize:15, fontWeight:700,
                              border:isSel?`2px solid ${th.accent}`:isToday2?`1px solid ${th.accent}40`:'1px solid transparent',
                              background:isSel?th.accent:'transparent',
                              color:isSel?th.accentText:(isClosed||isFull?th.dim:disabled?th.dim:th.text),
                              opacity:disabled&&!isClosed&&!isFull?0.3:1,
                              cursor:disabled?'default':'pointer', position:'relative' }}>
                            {d.getDate()}
                            {isClosed&&!isPast&&<span style={{position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',width:3,height:3,borderRadius:99,background:'#ef4444',display:'block'}}/>}
                            {isFull&&!isPast&&<span style={{position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',width:3,height:3,borderRadius:99,background:'#f97316',display:'block'}}/>}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{display:'flex',gap:16,marginTop:12}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:th.muted}}>
                        <div style={{width:8,height:8,borderRadius:99,background:'#ef4444'}}/>Fermé
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:th.muted}}>
                        <div style={{width:8,height:8,borderRadius:99,background:'#f97316'}}/>Complet
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ÉTAPE 4 : Créneau ── */}
              {step === 4 && (
                <div>
                  <h2 style={{fontSize:20,fontWeight:800,color:th.text,margin:'0 0 6px',letterSpacing:'-0.02em'}}>
                    Choisir un créneau
                  </h2>
                  <p style={{fontSize:13,color:th.muted,margin:'0 0 20px'}}>
                    {selDate?.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})} · {selSvc?.duration_minutes} min
                  </p>
                  {slotsLoading ? <div style={{padding:'40px 0',textAlign:'center'}}><Spinner color={th.accent}/></div>
                  : visibleSlots.length === 0 ? (
                    <div style={{textAlign:'center',padding:'40px 20px',border:`1px dashed ${th.border}`,borderRadius:12}}>
                      <p style={{fontSize:14,color:th.muted,marginBottom:12}}>Aucun créneau disponible</p>
                      <button onClick={()=>goToStep(3)}
                        style={{fontSize:13,fontWeight:700,color:'#2563eb',background:'none',border:'none',cursor:'pointer'}}>
                        ← Changer de date
                      </button>
                    </div>
                  ) : (
                    <div className="bk-slots" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                      {visibleSlots.map(s=>(
                        <button key={s} onClick={()=>{setSelSlot(s);goToStep(5,null,null,null,s);}}
                          style={{ padding:'18px 8px', borderRadius:16, fontSize:16, fontWeight:800,
                            minHeight:48,
                            border:selSlot===s?`2px solid ${th.accent}`:`1px solid ${th.border}`,
                            background:selSlot===s?th.accent:th.card,
                            color:selSlot===s?th.accentText:th.text, cursor:'pointer' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── ÉTAPE 5 : Infos client (auth-first) ── */}
              {step === 5 && (
                <div>
                  <h2 style={{fontSize:20,fontWeight:800,color:th.text,margin:'0 0 20px',letterSpacing:'-0.02em'}}>
                    Vos informations
                  </h2>
                  {/* Récap */}
                  <div style={{background:th.cardAlt,borderRadius:12,border:`1px solid ${th.border}`,
                    padding:'14px 16px',marginBottom:24}}>
                    <p style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.06em',
                      color:th.dim,margin:'0 0 8px'}}>Récapitulatif</p>
                    {[['Service',selSvc?.name],
                      ['Avec',selEmp?._anyEmployee?'Premier disponible':selEmp?.name],
                      ['Le',selDate?.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})],
                      ['À',selSlot],
                      selSvc?.price&&Number(selSvc.price)>0?['Prix',`${Number(selSvc.price).toFixed(2)} €`]:null
                    ].filter(Boolean).map(([l,v])=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',
                        padding:'5px 0',borderTop:`1px solid ${th.border}`}}>
                        <span style={{fontSize:12,color:th.muted}}>{l}</span>
                        <span style={{fontSize:12,fontWeight:700,color:th.text}}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {clientUser ? (
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:12,
                        background:th.card,border:`1px solid ${th.border}`,
                        borderRadius:12,padding:'14px 16px',marginBottom:16}}>
                        <div style={{width:44,height:44,borderRadius:99,flexShrink:0,
                          background:th.accent,display:'flex',alignItems:'center',
                          justifyContent:'center',color:th.accentText,fontWeight:800,fontSize:17}}>
                          {(clientUser.first_name||'?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{flex:1}}>
                          <p style={{fontWeight:700,fontSize:14,color:th.text,margin:'0 0 2px'}}>
                            {clientUser.first_name} {clientUser.last_name}
                          </p>
                          <p style={{fontSize:12,color:th.muted,margin:0}}>{clientUser.email}</p>
                        </div>
                        <button onClick={()=>{navigate(`/book/${slug}/client/profil`,{replace:false}); setMyApptsInitTab('profile');setView('myAppts');}}
                          style={{padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:600,
                            color:th.text,background:th.cardAlt,border:`1px solid ${th.border}`,cursor:'pointer'}}>
                          Profil
                        </button>
                      </div>
                      {/* Champ téléphone obligatoire si manquant (ex: après Google OAuth) */}
                      {!clientPhone.trim() && (
                        <div style={{background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.25)',
                          borderRadius:10,padding:'12px 14px',marginBottom:14}}>
                          <p style={{fontSize:12,fontWeight:700,color:'#d97706',margin:'0 0 8px'}}>
                            Complétez votre profil pour continuer
                          </p>
                          <label style={{display:'block',fontSize:11,fontWeight:700,
                            color:th.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                            Téléphone *
                          </label>
                          <div style={{display:'flex',gap:6,position:'relative'}}>
                            <div style={{position:'relative'}}>
                              <button type="button" onClick={()=>setPhoneDrop(!phoneDrop)}
                                style={{display:'flex',alignItems:'center',gap:4,padding:'11px 10px',
                                  borderRadius:9,background:th.inputBg,border:`1px solid ${th.inputBorder}`,
                                  color:th.text,fontSize:13,cursor:'pointer',whiteSpace:'nowrap',height:'100%'}}>
                                <span style={{fontSize:16}}>{phoneCC.flag}</span>
                                <span style={{fontSize:12,fontWeight:600}}>{phoneCC.dial}</span>
                                <span style={{fontSize:9,opacity:0.5}}>▼</span>
                              </button>
                              {phoneDrop && (
                                <div style={{position:'absolute',top:'100%',left:0,zIndex:999,marginTop:4,
                                  background:th.card,border:`1px solid ${th.border}`,borderRadius:10,
                                  boxShadow:'0 8px 24px rgba(0,0,0,0.15)',maxHeight:200,overflowY:'auto',minWidth:200}}>
                                  {PHONE_COUNTRIES.map(c=>(
                                    <button key={c.code} type="button" onClick={()=>{setPhoneCC(c);setPhoneDrop(false);setPhoneErr('');}}
                                      style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 12px',
                                        background:phoneCC.code===c.code?'rgba(99,102,241,0.08)':'transparent',
                                        border:'none',cursor:'pointer',color:th.text,fontSize:13,textAlign:'left'}}>
                                      <span style={{fontSize:16}}>{c.flag}</span>
                                      <span style={{fontWeight:600}}>{c.dial}</span>
                                      <span style={{color:th.muted,fontSize:12}}>{c.label}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <input type="tel" inputMode="tel" placeholder="6 03 04 46 17" value={phoneLocal}
                              maxLength={20} pattern="[0-9+\s\-]*"
                              onChange={e=>{setPhoneLocal(e.target.value);setPhoneErr('');}}
                              style={{flex:1,padding:'11px 12px',borderRadius:9,outline:'none',
                                background:th.inputBg,border:`1px solid ${phoneErr?'#ef4444':th.inputBorder}`,
                                color:th.text,fontSize:13,boxSizing:'border-box'}}/>
                          </div>
                          {phoneErr && <p style={{fontSize:11,color:'#ef4444',marginTop:4,fontWeight:600}}>{phoneErr}</p>}
                        </div>
                      )}
                      <label style={{display:'block',fontSize:12,fontWeight:600,color:th.muted,marginBottom:6}}>
                        Note (optionnelle)
                      </label>
                      <textarea value={notes} onChange={e=>setNotes(e.target.value.slice(0,500))} rows={3}
                        maxLength={500}
                        placeholder="Demandes particulières…"
                        style={{width:'100%',padding:'12px 14px',borderRadius:10,outline:'none',
                          background:th.inputBg,border:`1px solid ${th.inputBorder}`,
                          color:th.text,fontSize:13,resize:'none',lineHeight:1.5}}/>
                      <button onClick={async ()=>{
                        // Valider et formater le téléphone si pas encore fait
                        if(!clientPhone.trim()){
                          const err=validatePhone(phoneCC,phoneLocal);
                          if(err){setPhoneErr(err);return;}
                          const formatted=formatPhone(phoneCC,phoneLocal);
                          setCP(formatted);
                          // Sauvegarder dans le profil backend
                          if(clientUser && !clientUser.phone){
                            try{
                              const tk=localStorage.getItem('ff_client_token');
                              if(tk) await pubApi.updateClientProfile(slug,{
                                first_name:clientUser.first_name,last_name:clientUser.last_name,
                                email:clientUser.email,phone:formatted
                              });
                              const updated={...clientUser,phone:formatted};
                              setClientUser(updated);
                              localStorage.setItem('ff_client_info',JSON.stringify(updated));
                            }catch{}
                          }
                        }
                        goToStep(6);
                      }}
                        disabled={!clientPhone.trim()&&!phoneLocal.replace(/\D/g,'')}
                        style={{width:'100%',marginTop:16,padding:'15px',borderRadius:12,
                          background:(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,''))?th.border:th.accent,
                          border:'none',fontWeight:800,fontSize:15,
                          color:(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,''))?th.muted:th.accentText,
                          cursor:(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,''))?'not-allowed':'pointer',
                          opacity:(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,''))?0.5:1}}>
                        {(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,'')) ? 'Téléphone requis' : 'Continuer →'}
                      </button>
                    </div>
                  ) : (
                    <div>
                      {/* ──────────────────────────────────────────────────────────
                          LOGIQUE AUTH :
                          • requireAccount=true → AuthPanel inline obligatoire
                          • requireAccount=false + inlineAuthMode='none' → choix + form sans compte
                          • requireAccount=false + inlineAuthMode='login'/'register' → AuthPanel inline
                          ────────────────────────────────────────────────────────── */}

                      {(requireAccount || inlineAuthMode !== 'none') ? (
                        /* ── AuthPanel INLINE — login ou register directement ── */
                        /* requireAccount=true → TOUJOURS ici, pas de formulaire sans compte */
                        <div>
                          <AuthPanel
                            slug={slug} th={th}
                            requireAccount={requireAccount}
                            initialMode={inlineAuthMode === 'none' ? 'login' : inlineAuthMode}
                            initialEmail={clientEmail||''}
                            referralCode={referralCode}
                            onAuth={handleAuth}
                            onClose={requireAccount ? null : ()=>setInlineAuthMode('none')}
                          />
                        </div>
                      ) : (
                        /* ── Formulaire principal : suggestion auth + form sans compte ── */
                        <div>
                          {/* ── Bloc suggestion auth ── */}
                          <div style={{background:th.card,border:`1px solid ${th.border}`,
                            borderRadius:12,padding:16,marginBottom:16}}>
                            <p style={{fontSize:13,fontWeight:700,color:th.text,margin:'0 0 3px'}}>
                              Déjà un compte ? Connectez-vous
                            </p>
                            <p style={{fontSize:11,color:th.muted,margin:'0 0 12px',lineHeight:1.5}}>
                              Vos coordonnées sont renseignées automatiquement.
                            </p>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                              <button onClick={()=>setInlineAuthMode('login')}
                                style={{padding:'11px',borderRadius:10,background:th.accent,
                                  border:'none',fontWeight:700,fontSize:13,color:th.accentText,cursor:'pointer'}}>
                                Se connecter
                              </button>
                              <button onClick={()=>setInlineAuthMode('register')}
                                style={{padding:'11px',borderRadius:10,background:th.card,
                                  border:`1px solid ${th.border}`,fontWeight:700,fontSize:13,
                                  color:th.text,cursor:'pointer'}}>
                                Créer un compte
                              </button>
                            </div>
                            {/* Bouton Google */}
                            <button onClick={()=>{ const url=pubApi.googleAuthUrl(slug); const popup=window.open(url,'google_auth','width=500,height=600,scrollbars=yes,top=100,left='+Math.round((window.screen.width-500)/2)); const expectedOrigin=window.location.origin; const h=(e)=>{ if(e.origin!==expectedOrigin)return; if(e.data?.type!=='GOOGLE_AUTH_SUCCESS')return; window.removeEventListener('message',h); if(popup&&!popup.closed)popup.close(); const{token,client}=e.data; if(!token||!client)return; localStorage.setItem('ff_client_token',token); localStorage.setItem('ff_client_info',JSON.stringify(client)); handleAuth(client); }; window.addEventListener('message',h); }}
                              style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                                padding:'11px',borderRadius:10,background:th.card,
                                border:`1px solid ${th.border}`,cursor:'pointer',
                                fontWeight:700,fontSize:13,color:th.text}}>
                              <svg width="16" height="16" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                              </svg>
                              Continuer avec Google
                            </button>
                          </div>

                          {/* Séparateur */}
                          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                            <div style={{flex:1,height:1,background:th.border}}/>
                            <span style={{fontSize:11,color:th.dim,whiteSpace:'nowrap',padding:'0 6px'}}>
                              ou continuer sans compte
                            </span>
                            <div style={{flex:1,height:1,background:th.border}}/>
                          </div>

                          {/* Formulaire sans compte — Prénom, Nom, Email, Téléphone, Note */}
                          <div style={{display:'flex',flexDirection:'column',gap:12}}>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                              <div>
                                <label style={{display:'block',fontSize:11,fontWeight:700,
                                  color:th.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                                  Prénom *
                                </label>
                                <input placeholder="Prénom"
                                  value={clientName.split(' ')[0]||''}
                                  onChange={e=>{const nom=clientName.split(' ').slice(1).join(' ');setCN(e.target.value.trim()+(nom?' '+nom:''));}}
                                  style={{width:'100%',padding:'11px 12px',borderRadius:9,outline:'none',
                                    background:th.inputBg,border:`1px solid ${th.inputBorder}`,
                                    color:th.text,fontSize:13,boxSizing:'border-box'}}/>
                              </div>
                              <div>
                                <label style={{display:'block',fontSize:11,fontWeight:700,
                                  color:th.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                                  Nom *
                                </label>
                                <input placeholder="Nom"
                                  value={clientName.split(' ').slice(1).join(' ')||''}
                                  onChange={e=>{const prenom=clientName.split(' ')[0]||'';setCN(prenom+(e.target.value.trim()?' '+e.target.value.trim():''));}}
                                  style={{width:'100%',padding:'11px 12px',borderRadius:9,outline:'none',
                                    background:th.inputBg,border:`1px solid ${th.inputBorder}`,
                                    color:th.text,fontSize:13,boxSizing:'border-box'}}/>
                              </div>
                            </div>

                            <div>
                              <label style={{display:'block',fontSize:11,fontWeight:700,
                                color:th.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                                Email *
                              </label>
                              <div style={{position:'relative'}}>
                                <input type="email" placeholder="votre@email.com" value={clientEmail}
                                  onChange={e=>{const val=e.target.value;setCE(val);setEmailStatus('idle');
                                    clearTimeout(emailCheckTimer.current);
                                    if(!val.trim()||!val.includes('@')||!val.includes('.'))return;
                                    setEmailStatus('checking');
                                    emailCheckTimer.current=setTimeout(async()=>{
                                      try{const res=await pubApi.checkEmail(slug,val.trim());
                                        setEmailStatus(res.exists?'exists':'free');}
                                      catch{setEmailStatus('idle');}
                                    },500);
                                  }}
                                  style={{width:'100%',padding:'11px 36px 11px 12px',borderRadius:9,outline:'none',
                                    background:th.inputBg,
                                    border:`1px solid ${emailStatus==='exists'?'#ef4444':emailStatus==='free'?'#22c55e':th.inputBorder}`,
                                    color:th.text,fontSize:13}}/>
                                {emailStatus==='checking'&&<div style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',width:13,height:13,borderRadius:'50%',border:'2px solid rgba(0,0,0,0.1)',borderTopColor:th.accent,animation:'spin .7s linear infinite'}}/>}
                                {emailStatus==='free'&&<span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'#22c55e',fontWeight:700}}>✓</span>}
                                {emailStatus==='exists'&&<span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'#ef4444',fontWeight:700}}>✕</span>}
                              </div>
                              {emailStatus==='exists'&&(
                                <div style={{marginTop:6,borderRadius:9,border:'1px solid rgba(239,68,68,0.2)',
                                  background:'rgba(239,68,68,0.04)',overflow:'hidden'}}>
                                  <p style={{fontSize:12,fontWeight:700,color:'#dc2626',padding:'8px 12px 4px',margin:0}}>
                                    Un compte existe — connectez-vous
                                  </p>
                                  <button onClick={()=>{setInlineAuthMode('login');}}
                                    style={{width:'100%',padding:'9px 12px',background:'#ef4444',border:'none',
                                      color:'white',fontWeight:700,fontSize:12,cursor:'pointer'}}>
                                    Se connecter →
                                  </button>
                                </div>
                              )}
                            </div>

                            <div>
                              <label style={{display:'block',fontSize:11,fontWeight:700,
                                color:th.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                                Téléphone *
                              </label>
                              <div style={{display:'flex',gap:6,position:'relative'}}>
                                <div style={{position:'relative'}}>
                                  <button type="button" onClick={()=>setPhoneDrop(!phoneDrop)}
                                    style={{display:'flex',alignItems:'center',gap:4,padding:'11px 10px',
                                      borderRadius:9,background:th.inputBg,border:`1px solid ${th.inputBorder}`,
                                      color:th.text,fontSize:13,cursor:'pointer',whiteSpace:'nowrap',height:'100%'}}>
                                    <span style={{fontSize:16}}>{phoneCC.flag}</span>
                                    <span style={{fontSize:12,fontWeight:600}}>{phoneCC.dial}</span>
                                    <span style={{fontSize:9,opacity:0.5}}>▼</span>
                                  </button>
                                  {phoneDrop && (
                                    <div style={{position:'absolute',top:'100%',left:0,zIndex:999,marginTop:4,
                                      background:th.card,border:`1px solid ${th.border}`,borderRadius:10,
                                      boxShadow:'0 8px 24px rgba(0,0,0,0.15)',maxHeight:200,overflowY:'auto',minWidth:200}}>
                                      {PHONE_COUNTRIES.map(c=>(
                                        <button key={c.code} type="button" onClick={()=>{setPhoneCC(c);setPhoneDrop(false);setPhoneErr('');}}
                                          style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 12px',
                                            background:phoneCC.code===c.code?'rgba(99,102,241,0.08)':'transparent',
                                            border:'none',cursor:'pointer',color:th.text,fontSize:13,textAlign:'left'}}>
                                          <span style={{fontSize:16}}>{c.flag}</span>
                                          <span style={{fontWeight:600}}>{c.dial}</span>
                                          <span style={{color:th.muted,fontSize:12}}>{c.label}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <input type="tel" placeholder="6 03 04 46 17" value={phoneLocal}
                                  onChange={e=>{setPhoneLocal(e.target.value);setPhoneErr('');}}
                                  style={{flex:1,padding:'11px 12px',borderRadius:9,outline:'none',
                                    background:th.inputBg,border:`1px solid ${phoneErr?'#ef4444':th.inputBorder}`,
                                    color:th.text,fontSize:13}}/>
                              </div>
                              {phoneErr && <p style={{fontSize:11,color:'#ef4444',marginTop:4,fontWeight:600}}>{phoneErr}</p>}
                            </div>

                            <div>
                              <label style={{display:'block',fontSize:11,fontWeight:700,
                                color:th.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                                Note <span style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>(optionnelle)</span>
                              </label>
                              <textarea placeholder="Demandes particulières…" value={notes}
                                onChange={e=>setNotes(e.target.value)} rows={2}
                                style={{width:'100%',padding:'11px 12px',borderRadius:9,outline:'none',
                                  background:th.inputBg,border:`1px solid ${th.inputBorder}`,
                                  color:th.text,fontSize:13,resize:'none',lineHeight:1.5}}/>
                            </div>
                          </div>

                          <button
                            onClick={()=>{
                              const err=validatePhone(phoneCC,phoneLocal);
                              if(err){setPhoneErr(err);return;}
                              setCP(formatPhone(phoneCC,phoneLocal));
                              goToStep(6);
                            }}
                            disabled={!clientName.trim()||emailStatus==='exists'||!clientEmail.trim()||!phoneLocal.replace(/\D/g,'')}
                            style={{width:'100%',marginTop:16,padding:'14px',borderRadius:12,
                              background:(!clientName.trim()||emailStatus==='exists'||!clientEmail.trim()||!phoneLocal.replace(/\D/g,''))?th.border:th.accent,
                              border:'none',fontWeight:800,fontSize:14,
                              color:(!clientName.trim()||emailStatus==='exists'||!clientEmail.trim()||!phoneLocal.replace(/\D/g,''))?th.muted:th.accentText,
                              cursor:(!clientName.trim()||emailStatus==='exists'||!clientEmail.trim()||!phoneLocal.replace(/\D/g,''))?'not-allowed':'pointer',
                              opacity:(!clientName.trim()||emailStatus==='exists'||!clientEmail.trim()||!phoneLocal.replace(/\D/g,''))?0.5:1}}>
                            {emailStatus==='exists' ? "Connectez-vous d'abord" : 'Continuer →'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {bookErr && <p style={{fontSize:12,color:'#ef4444',marginTop:10,fontWeight:600}}>{bookErr}</p>}
                </div>
              )}

              {/* ── ÉTAPE 6 : Confirmation ── */}
              {step === 6 && (
                <div>
                  <h2 style={{fontSize:20,fontWeight:800,color:th.text,margin:'0 0 20px',letterSpacing:'-0.02em'}}>
                    Confirmer
                  </h2>
                  <div style={{background:th.card,border:`1px solid ${th.border}`,
                    borderRadius:12,padding:'16px 20px',marginBottom:20}}>
                    {[['Service',selSvc?.name],
                      ['Avec',selEmp?._anyEmployee?'Premier disponible':selEmp?.name],
                      ['Date',selDate?.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})],
                      ['Heure',selSlot],
                      ['Duree',`${selSvc?.duration_minutes} min`],
                      selSvc?.price&&selSvc.price!==''?['Prix',`${Number(selSvc.price).toFixed(2)} €`]:null,
                      ['Client',clientUser?`${clientUser.first_name} ${clientUser.last_name}`:clientName],
                      (clientUser?.email||clientEmail)?['Email',clientUser?.email||clientEmail]:null,
                      clientPhone?['Tel.',clientPhone]:null,
                    ].filter(Boolean).map(([l,v])=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',
                        padding:'8px 0',borderBottom:`1px solid ${th.border}`}}>
                        <span style={{fontSize:13,color:th.muted}}>{l}</span>
                        <span style={{fontSize:13,fontWeight:700,color:th.text}}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {selSvc?.price > 0 && (
                    <div style={{marginBottom:20}}>
                      <label style={{fontSize:12,fontWeight:600,color:th.muted,display:'block',marginBottom:4}}>
                        Code promo ou parrainage (optionnel)
                      </label>
                      <p style={{fontSize:10,color:th.dim,margin:'0 0 8px',fontStyle:'italic'}}>
                        Non cumulable avec une autre réduction (anniversaire, promo…).
                      </p>
                      <div style={{display:'flex',gap:8}}>
                        <input value={promoCode}
                          onChange={e=>{setPromoCode(e.target.value.toUpperCase());setPromoData(null);setPromoErr('');}}
                          onKeyDown={e=>e.key==='Enter'&&checkPromo()}
                          placeholder="PROMO10 ou code parrainage"
                          style={{flex:1,padding:'11px 14px',borderRadius:9,outline:'none',
                            background:th.inputBg,border:`1px solid ${promoData?(promoData.source==='referral'?'#8b5cf6':'#22c55e'):promoErr?'#ef4444':th.inputBorder}`,
                            color:th.text,fontSize:13,fontFamily:'monospace',
                            letterSpacing:'0.05em',textTransform:'uppercase'}}/>
                        <button onClick={checkPromo} disabled={promoLoading||!promoCode.trim()}
                          style={{padding:'11px 18px',borderRadius:9,border:`1px solid ${th.border}`,
                            background:th.cardAlt,color:th.text,fontSize:13,fontWeight:700,
                            cursor:'pointer',opacity:!promoCode.trim()?0.4:1}}>
                          {promoLoading?'...':'Valider'}
                        </button>
                      </div>
                      {promoData && (
                        <div style={{marginTop:8,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,
                          padding:'10px 14px',borderRadius:9,
                          background: promoData.source === 'referral' ? 'rgba(139,92,246,0.08)' : 'rgba(34,197,94,0.07)',
                          border: promoData.source === 'referral' ? '1px solid rgba(139,92,246,0.28)' : '1px solid rgba(34,197,94,0.2)'}}>
                          <div style={{display:'flex',flexDirection:'column',gap:2,minWidth:0}}>
                            {promoData.source === 'referral' && (
                              <span style={{fontSize:10,fontWeight:800,color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.05em'}}>
                                🎁 Parrainage appliqué
                              </span>
                            )}
                            <span style={{fontSize:12,fontWeight:700,color: promoData.source === 'referral' ? '#5b21b6' : '#16a34a'}}>
                              {promoData.type==='percent'?`-${promoData.value}%`:`-${promoData.discount.toFixed(2)} €`} appliqué !
                            </span>
                          </div>
                          <span style={{fontSize:13,fontWeight:900,color: promoData.source === 'referral' ? '#4c1d95' : '#166534',fontFamily:'monospace',flexShrink:0}}>
                            {((selSvc?.price||0)-promoData.discount).toFixed(2)} €
                          </span>
                        </div>
                      )}
                      {promoErr && <p style={{fontSize:12,color:'#ef4444',marginTop:6,fontWeight:600}}>{promoErr}</p>}
                    </div>
                  )}

                  {bookErr && <p style={{fontSize:12,color:'#ef4444',marginBottom:12,fontWeight:600}}>{bookErr}</p>}

                  <button onClick={handleBook} disabled={booking}
                    style={{width:'100%',padding:'16px',borderRadius:12,
                      background:th.accent,border:'none',fontWeight:800,fontSize:15,
                      color:th.accentText,cursor:booking?'wait':'pointer',
                      opacity:booking?0.7:1,letterSpacing:'-0.01em',
                      display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
                    {booking ? (
                      <>
                        <div style={{width:18,height:18,borderRadius:99,
                          border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',
                          animation:'spin .7s linear infinite'}}/>
                        Réservation en cours…
                      </>
                    ) : (
                      promoData
                        ? `Reserver - ${((selSvc?.price||0)-promoData.discount).toFixed(2)} €`
                        : selSvc?.price&&Number(selSvc.price)>0
                          ? `Reserver - ${Number(selSvc.price).toFixed(2)} €`
                          : 'Reserver'
                    )}
                  </button>
                </div>
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
          borderTop:`1px solid ${th.border}`,
          boxShadow:'0 -2px 12px rgba(0,0,0,0.08)',
        }}>
          <button
            onClick={()=>{ const el=document.getElementById('section-prestations');
              if(el) el.scrollIntoView({behavior:'smooth'}); }}
            style={{ width:'100%', padding:'15px', borderRadius:12,
              background:th.accent, border:'none', fontWeight:800, fontSize:15,
              color:th.accentText, cursor:'pointer' }}>
            Réserver
          </button>
        </div>
      )}
    </div>{postRegOverlay}</>
  );
}
