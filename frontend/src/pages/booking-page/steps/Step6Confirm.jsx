// src/pages/booking-page/steps/Step6Confirm.jsx
// Étape "Vos infos + confirmation" -- page fusionnée (anciennement Step5+Step6).
// Si pas connecté -> AuthPanel inline. Sinon : récap + profil ligne + tel +
// réductions + code promo + notes + mode paiement + Stripe + bouton Réserver.
import { useEffect, useState } from 'react';
import { pubApi, globalClientApi } from '../../../utils/api';
import { StripePaymentSection } from '../components/StripePaymentSection';
import { Confirm } from '../../../components/UI';
import { AuthPanel } from '../../booking/Account';
import { PhoneInput, isValidPhoneNumber } from '../../../components/PhoneInput';

const NOTES_MAX = 250;

export function Step6Confirm({
  th, slug, base, selSvc, selEmp, selDate, selSlot,
  clientUser, setClientUser, clientName, clientEmail, clientPhone, setCP,
  notes, setNotes, phoneErr, setPhoneErr,
  promoCode, setPromoCode, promoData, setPromoData, promoErr, setPromoErr,
  promoLoading, checkPromo,
  bookErr, booking, handleBook,
  paymentConfig, referralCode,
  navigate, setMyApptsInitTab, setView, handleAuth,
}) {
  // Réhydratation défensive : le marker `ff_client_info` (écrit au login,
  // register, OAuth Google, register rapide) est la source de vérité côté
  // navigateur pour "session active" (le JWT lui-même est en cookie HttpOnly
  // invisible au JS). Si Step6 monte avec clientUser=null MAIS que ce marker
  // existe (timing au retour OAuth, multi-onglets mobile, navigation interne
  // depuis un autre composant qui n'a pas propagé le state), on réinjecte la
  // session via handleAuth — au lieu de redemander une connexion à tort.
  useEffect(() => {
    if (clientUser) return;
    try {
      const stored = localStorage.getItem('ff_client_info');
      if (!stored) return;
      const info = JSON.parse(stored);
      if (info && info.id && typeof handleAuth === 'function') {
        handleAuth(info);
      } else if (info && info.id) {
        setClientUser(info);
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Commit 24c — réductions disponibles pour le client connecté chez ce
  // commerce. Cards cliquables, pré-remplit le promoCode + déclenche le
  // checkPromo. No cumul : sélectionner une card écrase la précédente
  // (le checkPromo back recalcule la remise).
  const [availList, setAvailList] = useState([]);
  const [availCredit, setAvailCredit] = useState(null);
  const [availLoad, setAvailLoad] = useState(false);
  const [selectedDiscountId, setSelectedDiscountId] = useState(null);

  // Toggles UX : note et code promo sont optionnels, on les masque par
  // defaut derriere un bouton "Ajouter…". S'ouvre automatiquement si une
  // valeur est deja saisie (retour arriere depuis Step6, ou pre-saisie via
  // available discount cards).
  const [showNote,  setShowNote]  = useState(!!(notes && notes.trim()));
  const [showPromo, setShowPromo] = useState(!!(promoCode && promoCode.trim()));

  // Phase 5/5 — Stripe Connect : paiement RDV en ligne (option ou requis).
  // - mandatory : payNow force a true, pas de toggle (visible seulement)
  // - optional  : toggle visible, defaut false ("Payer en boutique")
  const isMandatory = !!(paymentConfig?.enabled && paymentConfig.policy === 'mandatory');
  const canOpt      = !!(paymentConfig?.enabled && paymentConfig.policy === 'optional');
  const [payNow, setPayNow] = useState(isMandatory);
  // Verrou pour ne pas changer de mode pendant que Stripe tourne
  useEffect(() => {
    if (isMandatory && !payNow) setPayNow(true);
  }, [isMandatory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cartes sauvegardees globales FlowIA (Stripe Shared Customer dual flow).
  // canSaveCards : booleen indiquant si le client a un compte global FlowIA
  //   lie (= scope='client' avec globalClientId, ou scope='global_client').
  //   Si non (compte interne au salon sans liaison FlowIA globale), l'API
  //   /me/payment-methods retourne 401 -> on cache la checkbox + radio.
  // selectedPmId : null = nouvelle carte, sinon ID DB d'une carte sauvegardee.
  // saveCard : checkbox active uniquement quand canSaveCards=true et nouvelle.
  const [savedMethods, setSavedMethods] = useState([]);
  const [canSaveCards, setCanSaveCards] = useState(false);
  const [methodsLoaded, setMethodsLoaded] = useState(false);
  const [selectedPmId, setSelectedPmId] = useState(null);
  const [saveCard, setSaveCard] = useState(false);
  const [confirmDelPmId, setConfirmDelPmId] = useState(null);

  // Quand le client est connecte global, on coche "sauvegarder" par defaut.
  // L'utilisateur peut decocher s'il ne veut pas conserver la carte. Cette
  // decision est appliquee APRES le paiement (detach Stripe) -- elle ne
  // re-mount pas le PaymentElement.
  useEffect(() => {
    if (canSaveCards && selectedPmId === null) setSaveCard(true);
  }, [canSaveCards, selectedPmId]);

  const reloadSavedMethods = async () => {
    try {
      const r = await globalClientApi.paymentMethods();
      const list = Array.isArray(r?.methods) ? r.methods : [];
      setSavedMethods(list);
      // Si la carte selectionnee a ete supprimee, on bascule sur "Nouvelle".
      if (selectedPmId && !list.find(m => m.id === selectedPmId)) {
        setSelectedPmId(null);
      }
    } catch { /* noop */ }
  };

  const handleDeleteSavedPm = async () => {
    const id = confirmDelPmId;
    setConfirmDelPmId(null);
    if (!id) return;
    try {
      await globalClientApi.deletePaymentMethod(id);
      await reloadSavedMethods();
    } catch { /* noop, l'erreur sera visible si rechargement echoue */ }
  };
  useEffect(() => {
    if (!clientUser?.id || !payNow) {
      setSavedMethods([]); setCanSaveCards(false);
      setMethodsLoaded(false); setSelectedPmId(null); setSaveCard(false);
      return;
    }
    let cancelled = false;
    globalClientApi.paymentMethods()
      .then(r => {
        if (cancelled) return;
        const list = Array.isArray(r?.methods) ? r.methods : [];
        setSavedMethods(list);
        setCanSaveCards(true);
        setMethodsLoaded(true);
        const def = list.find(m => m.is_default) || list[0] || null;
        setSelectedPmId(def?.id || null);
      })
      .catch(() => {
        if (cancelled) return;
        // 401 ou autre : pas de compte global lie -> pas de cartes sauvegardees,
        // pas d'option "Sauvegarder" affichee. Le client paie en flow direct.
        setMethodsLoaded(true);
        setSavedMethods([]);
        setCanSaveCards(false);
      });
    return () => { cancelled = true; };
  }, [clientUser?.id, payNow]);

  useEffect(() => {
    if (!clientUser?.id || !slug) {
      setAvailList([]); setAvailCredit(null); return;
    }
    let cancelled = false;
    setAvailLoad(true);
    pubApi.availableDiscounts(slug, clientUser.id)
      .then(r => {
        if (cancelled) return;
        setAvailList(Array.isArray(r?.discounts) ? r.discounts : []);
        setAvailCredit(r?.credit || null);
      })
      .catch(() => { if (!cancelled) { setAvailList([]); setAvailCredit(null); } })
      .finally(() => { if (!cancelled) setAvailLoad(false); });
    return () => { cancelled = true; };
  }, [clientUser?.id, slug]);

  const applyDiscount = (d) => {
    if (!d.code) return;
    if (selectedDiscountId === d.id) {
      setSelectedDiscountId(null);
      setPromoCode(''); setPromoData(null); setPromoErr('');
      return;
    }
    setSelectedDiscountId(d.id);
    setPromoCode(d.code);
    setPromoData(null); setPromoErr('');
    setShowPromo(true);
    setTimeout(() => checkPromo(d.code), 0);
  };
  const cardableList = availList.filter(d => d.source === 'birthday' || d.source === 'loyalty');
  const referralPending = availList.filter(d => d.source === 'referral_pending');

  // Validation telephone (anciennement Step5). Le bouton "Reserver" est
  // desactive si le numero est invalide. Avant le handleBook, on persiste
  // le phone dans le profil client si c'est la 1ere saisie.
  const phoneOk = isValidPhoneNumber(clientPhone || '');
  const commitBook = async (piId) => {
    if (!phoneOk) {
      if (setPhoneErr) setPhoneErr('Numero de telephone requis.');
      return;
    }
    if (clientUser && !clientUser.phone && clientPhone) {
      try {
        await pubApi.updateClientProfile(slug, {
          first_name: clientUser.first_name,
          last_name:  clientUser.last_name,
          email:      clientUser.email,
          phone:      clientPhone,
        });
        const updated = { ...clientUser, phone: clientPhone };
        if (setClientUser) setClientUser(updated);
        try { localStorage.setItem('ff_client_info', JSON.stringify(updated)); } catch {}
      } catch { /* non-bloquant : le book backend va revalider */ }
    }
    return handleBook(piId);
  };
  // Recap compact "wallet style" : tout le RDV en 3 lignes denses au lieu
  // d'un long tableau. Les coordonnees client (email/tel) ont deja ete
  // saisies a l'etape 5 -- pas besoin de les ressortir ici.
  const finalPriceCents = (() => {
    const p = Number(selSvc?.price || 0);
    if (!p) return 0;
    if (promoData) return Math.max(0, p - Number(promoData.discount || 0));
    return p;
  })();

  // Si pas connecte, on affiche l'AuthPanel inline (anciennement Step5).
  // IMPORTANT : ce return conditionnel doit rester APRES tous les hooks
  // (useState/useEffect ci-dessus) — sinon le passage clientUser null -> set
  // (retour OAuth Google) change le nombre de hooks rendus entre deux renders
  // et React crashe en page blanche (Minified React error #310).
  if (!clientUser) {
    // Mais si une session existe (marker localStorage) → on est en cours
    // d'hydratation via l'effect ci-dessus, on affiche un placeholder neutre
    // au lieu du formulaire de connexion (Bug : "redemande de se connecter
    // alors que le compte est bien connecté").
    let hasSessionMarker = false;
    try { hasSessionMarker = !!localStorage.getItem('ff_client_info'); } catch {}
    if (hasSessionMarker) {
      return (
        <div style={{ padding:'24px 0', textAlign:'center' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ width:22, height:22, margin:'0 auto', borderRadius:'50%',
            border:`2px solid ${th.border}`, borderTopColor:th.accent,
            animation:'spin .7s linear infinite' }}/>
          <p style={{ marginTop:12, fontSize:13, color:th.muted }}>
            {"Restauration de votre session..."}
          </p>
        </div>
      );
    }
    return (
      <div>
        <h2 style={{fontSize:18,fontWeight:500,color:th.text,margin:'0 0 12px',letterSpacing:'-0.02em'}}>
          {"Connectez-vous pour reserver"}
        </h2>
        <div style={{background:th.cardAlt,borderRadius:10,border:`0.5px solid ${th.border}`,
          padding:'10px 12px',marginBottom:12}}>
          <p style={{fontSize:13,fontWeight:500,color:th.text,margin:'0 0 2px',letterSpacing:'-0.01em'}}>
            {selSvc?.name}
          </p>
          <p style={{fontSize:11,color:th.muted,margin:0,display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8}}>
            <span>
              {[
                selEmp?._anyEmployee ? 'Premier dispo' : selEmp?.name,
                selDate?.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}),
                selSlot,
              ].filter(Boolean).join(' · ')}
            </span>
            {selSvc?.price && Number(selSvc.price) > 0 && (
              <span style={{fontWeight:500,color:th.text,
                fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace'}}>
                {`${Number(selSvc.price).toFixed(2)} €`}
              </span>
            )}
          </p>
        </div>
        <AuthPanel
          slug={slug} th={th}
          requireAccount={true}
          initialMode="login"
          referralCode={referralCode}
          onAuth={handleAuth}
          onClose={null}
        />
      </div>
    );
  }

  return (
    <div>
      <h2 style={{fontSize:18,fontWeight:500,color:th.text,margin:'0 0 12px',letterSpacing:'-0.02em'}}>
        {"Confirmer"}
      </h2>
      <div style={{
        background:th.card, border:`0.5px solid ${th.border}`,
        borderRadius:14, padding:'14px 16px', marginBottom:16,
      }}>
        <p style={{ fontSize:14, fontWeight:500, color:th.text, margin:'0 0 2px',
          letterSpacing:'-0.01em' }}>
          {selSvc?.name}
        </p>
        <p style={{ fontSize:11, color:th.muted, margin:'0 0 10px' }}>
          {[
            selEmp?._anyEmployee ? 'Premier disponible' : selEmp?.name,
            selSvc?.duration_minutes ? `${selSvc.duration_minutes} min` : null,
          ].filter(Boolean).join(' · ')}
        </p>
        <div style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          paddingTop:10, borderTop:`0.5px solid ${th.border}`,
        }}>
          <span style={{ fontSize:12, color:th.muted }}>
            {selDate?.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})}
            {' · '}
            {selSlot}
          </span>
          {selSvc?.price && Number(selSvc.price) > 0 && (
            <span style={{ display:'flex', alignItems:'baseline', gap:6 }}>
              {promoData && (
                <span style={{ fontSize:11, textDecoration:'line-through', color:th.dim }}>
                  {`${Number(selSvc.price).toFixed(2)} €`}
                </span>
              )}
              <span style={{ fontSize:14, fontWeight:500, color:th.text,
                fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {`${(finalPriceCents).toFixed(2)} €`}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Profil minimal -- 1 ligne discrete avec lien 'Profil' (anciennement
          dans Step5, fusionne ici). */}
      <div style={{display:'flex',alignItems:'center',gap:8,
        padding:'2px 2px',marginBottom:14,fontSize:12,color:th.muted}}>
        <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {clientUser.first_name} {clientUser.last_name} · {clientUser.email}
        </span>
        <button type="button"
          onClick={()=>{ if (navigate) navigate(`${base}/client/profil`,{replace:false}); if (setMyApptsInitTab) setMyApptsInitTab('profile'); if (setView) setView('myAppts'); }}
          style={{padding:0,fontSize:12,fontWeight:500,
            color:th.accent,background:'transparent',border:'none',cursor:'pointer'}}>
          {"Profil"}
        </button>
      </div>

      {/* Telephone obligatoire si manquant sur le profil (ex: apres OAuth
          Google) OU si le numero effectif n'est pas un E.164 valide (ex: tel
          stocke au mauvais format sur un ancien compte). On garde !clientUser.phone
          comme 1er critere pour NE PAS masquer le bloc des le premier caractere
          tape quand le profil est vide (sinon l'input disparaitrait en cours de
          saisie, laissant le bouton grise sans moyen de corriger). Le 2e critere
          (!phoneOk) couvre le cas ou un numero existe mais reste invalide : sans
          lui, le bouton resterait bloque "Telephone requis" SANS input pour le
          corriger. Un numero partiel/en cours de frappe etant invalide, le bloc
          reste affiche pendant la saisie. */}
      {clientUser && (!clientUser.phone || !phoneOk) && (
        <div style={{
          background: phoneOk ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.06)',
          border: `0.5px solid ${phoneOk ? 'rgba(16,185,129,0.40)' : 'rgba(245,158,11,0.25)'}`,
          borderRadius:10, padding:'10px 12px', marginBottom:14,
        }}>
          <p style={{ fontSize:12, fontWeight:500, margin:'0 0 6px',
            color: phoneOk ? '#065f46' : '#d97706',
            display:'inline-flex', alignItems:'center', gap:6 }}>
            {phoneOk && (
              <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ width:15, height:15, flexShrink:0 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            )}
            {phoneOk
              ? "Numéro valide — il sera enregistré à la réservation"
              : "Telephone requis pour finaliser la reservation"}
          </p>
          <PhoneInput value={clientPhone || ''} onChange={setCP}
            label="Telephone *" required
            theme={{ text: th.text, muted: th.muted, dim: th.dim,
              border: th.border, inputBg: th.inputBg, inputBorder: th.inputBorder }}/>
        </div>
      )}

      {/* Réductions disponibles — commit 24c. Affiché uniquement pour client
          authentifié et si l'API renvoie au moins une réduction. Cards
          cliquables, sélection unique (no cumul) — un click pré-remplit le
          champ promo + valide automatiquement. Crédit affiché en informatif
          (sera utilisable en boutique à l'encaissement, pas applicable au
          booking en ligne). */}
      {clientUser?.id && selSvc?.price > 0 && (cardableList.length > 0 || availCredit || referralPending.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: th.text, margin: '0 0 4px' }}>
            {"Vos réductions disponibles"}
          </p>
          <p style={{ fontSize: 10, color: th.dim, margin: '0 0 10px', fontStyle: 'italic' }}>
            {"Cliquez pour appliquer. Une seule réduction par réservation."}
          </p>
          {availLoad && (
            <p style={{ fontSize: 11, color: th.muted, margin: 0 }}>{"Chargement…"}</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cardableList.map(d => {
              const isBday = d.source === 'birthday';
              const accentBg   = isBday ? '#fff7ed' : '#eef2ff';
              const accentText = isBday ? '#9a3412' : '#4338ca';
              const accentBar  = isBday ? '#f97316' : '#4338ca';
              const isSelected = selectedDiscountId === d.id;
              const discountStr = d.discount_type === 'percent'
                ? `-${d.discount_value}%`
                : `-${Number(d.discount_value).toFixed(2)} €`;
              return (
                <button key={d.id} type="button"
                        onClick={() => applyDiscount(d)}
                        style={{ padding: 10, borderRadius: 9,
                                 background: accentBg,
                                 borderLeft: '2px solid ' + accentBar,
                                 border: `0.5px solid ${isSelected ? accentText : accentBg}`,
                                 borderLeftWidth: 2, borderLeftColor: accentBar,
                                 borderLeftStyle: 'solid',
                                 cursor: 'pointer', fontFamily: 'inherit',
                                 textAlign: 'left', width: '100%',
                                 display: 'flex', justifyContent: 'space-between',
                                 alignItems: 'center', gap: 8,
                                 boxShadow: isSelected ? `0 0 0 2px ${accentBar}33` : 'none',
                                 transition: 'box-shadow 0.15s ease' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: accentText }}>
                      {isBday ? 'Offre anniversaire' : 'Récompense fidélité'}
                    </span>
                    <span style={{ fontSize: 11, color: th.muted,
                                   overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                   fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {d.code}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: accentText, flexShrink: 0 }}>
                    {isSelected ? 'Appliqué' : discountStr}
                  </span>
                </button>
              );
            })}
            {referralPending.map(d => (
              <div key={d.id}
                   style={{ padding: 10, borderRadius: 9,
                            background: '#eeedfe', borderLeft: '2px solid #8b5cf6',
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#3c3489' }}>
                    {"Parrainage en attente"}
                  </span>
                  <span style={{ fontSize: 10, color: th.muted, lineHeight: 1.4 }}>
                    {d.info || "À valider lors de votre encaissement en boutique."}
                  </span>
                </span>
              </div>
            ))}
            {availCredit && (
              <div style={{ padding: 10, borderRadius: 9,
                            background: '#f0fdf4', borderLeft: '2px solid #10b981',
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#065f46' }}>
                    {"Crédit disponible"}
                  </span>
                  <span style={{ fontSize: 10, color: th.muted, lineHeight: 1.4 }}>
                    {"Utilisable lors de votre encaissement en boutique."}
                  </span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#065f46',
                               fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                               flexShrink: 0 }}>
                  {Number(availCredit.balance).toFixed(2)} €
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {selSvc?.price > 0 && (
        <div style={{marginBottom:20}}>
          {!showPromo ? (
            <button type="button"
              onClick={() => setShowPromo(true)}
              style={{display:'flex',alignItems:'center',gap:8,
                padding:'10px 12px',width:'100%',borderRadius:9,
                background:th.cardAlt,border:`0.5px dashed ${th.border}`,
                color:th.text,fontSize:13,fontWeight:500,cursor:'pointer',
                fontFamily:'inherit',textAlign:'left'}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14,color:th.muted}}>
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {"Ajouter un code promo ou parrainage"}
            </button>
          ) : (
            <>
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:4}}>
                <label style={{fontSize:12,fontWeight:500,color:th.muted}}>
                  Code promo ou parrainage (optionnel)
                </label>
                <button type="button"
                  onClick={() => {
                    setShowPromo(false);
                    setPromoCode(''); setPromoData(null); setPromoErr('');
                    setSelectedDiscountId(null);
                  }}
                  style={{padding:0,background:'transparent',border:'none',cursor:'pointer',
                    fontSize:11,color:th.dim,fontFamily:'inherit'}}>
                  {"Retirer"}
                </button>
              </div>
              <p style={{fontSize:10,color:th.dim,margin:'0 0 8px',fontStyle:'italic'}}>
                Non cumulable avec une autre réduction (anniversaire, promo…).
              </p>
              <div style={{display:'flex',gap:8}}>
                <input value={promoCode}
                  onChange={e=>{setPromoCode(e.target.value.toUpperCase());setPromoData(null);setPromoErr('');setSelectedDiscountId(null);}}
                  onKeyDown={e=>e.key==='Enter'&&checkPromo()}
                  placeholder="PROMO10 ou code parrainage"
                  autoFocus
                  style={{flex:1,padding:'11px 14px',borderRadius:9,outline:'none',
                    background:th.inputBg,border: `1.5px solid ${promoData?(promoData.source==='referral'?'#8b5cf6':'#22c55e'):promoErr?'#ef4444':th.inputBorder}`,
                    color:th.text,fontSize:13,fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'}}/>
                <button onClick={checkPromo} disabled={promoLoading||!promoCode.trim()}
                  style={{padding:'11px 18px',borderRadius:9,border: `1.5px solid ${th.border}`,
                    background:th.cardAlt,color:th.text,fontSize:13,fontWeight: 500,
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
                      <span style={{fontSize:10,fontWeight: 500,color:'#6d28d9'}}>
                        🎁 Parrainage appliqué
                      </span>
                    )}
                    <span style={{fontSize:12,fontWeight: 500,color: promoData.source === 'referral' ? '#5b21b6' : '#16a34a'}}>
                      {promoData.type==='percent'?`-${promoData.value}%`:`-${promoData.discount.toFixed(2)} €`} appliqué !
                    </span>
                  </div>
                  <span style={{fontSize:13,fontWeight: 500,color: promoData.source === 'referral' ? '#4c1d95' : '#166534',fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',flexShrink:0}}>
                    {((selSvc?.price||0)-promoData.discount).toFixed(2)} €
                  </span>
                </div>
              )}
              {promoErr && <p style={{fontSize:12,color:'#ef4444',marginTop:6,fontWeight: 500}}>{promoErr}</p>}
            </>
          )}
        </div>
      )}

      {/* Note (anciennement Step5, deplacee sous le code promo comme demande)
          + compteur caracteres (limite 250). Toggleable : bouton "Ajouter une
          note" par defaut, textarea + bouton "Retirer" quand ouverte. */}
      <div style={{marginBottom:16}}>
        {!showNote ? (
          <button type="button"
            onClick={() => setShowNote(true)}
            style={{display:'flex',alignItems:'center',gap:8,
              padding:'10px 12px',width:'100%',borderRadius:9,
              background:th.cardAlt,border:`0.5px dashed ${th.border}`,
              color:th.text,fontSize:13,fontWeight:500,cursor:'pointer',
              fontFamily:'inherit',textAlign:'left'}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14,color:th.muted}}>
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {"Ajouter une note"}
          </button>
        ) : (
          <>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:4}}>
              <label style={{fontSize:12,fontWeight:500,color:th.muted}}>
                {"Note (optionnelle)"}
              </label>
              <div style={{display:'flex',alignItems:'baseline',gap:10}}>
                <span style={{fontSize:10,color:th.dim,
                  fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace'}}>
                  {`${(notes||'').length}/${NOTES_MAX}`}
                </span>
                <button type="button"
                  onClick={() => {
                    setShowNote(false);
                    if (setNotes) setNotes('');
                  }}
                  style={{padding:0,background:'transparent',border:'none',cursor:'pointer',
                    fontSize:11,color:th.dim,fontFamily:'inherit'}}>
                  {"Retirer"}
                </button>
              </div>
            </div>
            <textarea value={notes || ''}
              onChange={e=>setNotes && setNotes(e.target.value.slice(0, NOTES_MAX))}
              rows={2} maxLength={NOTES_MAX}
              placeholder="Demandes particulieres..."
              autoFocus
              style={{width:'100%',padding:'10px 12px',borderRadius:10,outline:'none',
                background:th.inputBg,border:`1.5px solid ${th.inputBorder}`,
                color:th.text,fontSize:13,resize:'none',lineHeight:1.4,
                fontFamily:'inherit'}}/>
          </>
        )}
      </div>

      {bookErr && <p style={{fontSize:12,color:'#ef4444',marginBottom:12,fontWeight: 500}}>{bookErr}</p>}

      {/* ── Phase 5/5 : paiement RDV en ligne ──────────────────────────── */}
      {paymentConfig?.enabled && Number(selSvc?.price) > 0 && (
        <div style={{ marginBottom: 16 }}>
          {isMandatory ? (
            <p style={{ fontSize: 12, fontWeight: 500, color: th.text, margin: '0 0 8px' }}>
              {paymentConfig.percentage && paymentConfig.percentage < 100
                ? `Acompte de ${paymentConfig.percentage}% requis pour reserver`
                : "Paiement requis pour reserver"}
            </p>
          ) : canOpt ? (
            <>
              <p style={{ fontSize: 12, fontWeight: 500, color: th.text, margin: '0 0 8px' }}>
                {"Mode de paiement"}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button"
                  onClick={() => setPayNow(false)}
                  disabled={booking}
                  style={{
                    flex: 1, padding: '12px 14px', borderRadius: 9,
                    background: !payNow ? th.accent : th.cardAlt,
                    color: !payNow ? th.accentText : th.text,
                    border: `0.5px solid ${!payNow ? th.accent : th.border}`,
                    fontSize: 13, fontWeight: 500, cursor: booking ? 'not-allowed' : 'pointer',
                  }}>
                  {"Payer en boutique"}
                </button>
                <button type="button"
                  onClick={() => setPayNow(true)}
                  disabled={booking}
                  style={{
                    flex: 1, padding: '12px 14px', borderRadius: 9,
                    background: payNow ? th.accent : th.cardAlt,
                    color: payNow ? th.accentText : th.text,
                    border: `0.5px solid ${payNow ? th.accent : th.border}`,
                    fontSize: 13, fontWeight: 500, cursor: booking ? 'not-allowed' : 'pointer',
                  }}>
                  {paymentConfig.percentage && paymentConfig.percentage < 100
                    ? `Payer un acompte (${paymentConfig.percentage}%)`
                    : "Payer en ligne"}
                </button>
              </div>
            </>
          ) : null}

          {payNow && (
            <>
              {/* Liste des moyens de paiement style "wallet" : cartes
                  sauvegardees + bouton "Nouvelle carte". Suppression inline
                  via icone poubelle (avec Confirm modal). */}
              {canSaveCards && methodsLoaded && savedMethods.length > 0 && (
                <div style={{ marginTop: 14, marginBottom: 4 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: th.text, margin: '0 0 8px' }}>
                    {"Moyen de paiement"}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {savedMethods.map(m => {
                      const isSel = selectedPmId === m.id;
                      const brandLabel = (m.brand || 'Carte').replace(/^./, c => c.toUpperCase());
                      return (
                        <div key={m.id}
                             style={{
                               display: 'flex', alignItems: 'stretch', gap: 6,
                             }}>
                          <button type="button"
                                  onClick={() => { setSelectedPmId(m.id); setSaveCard(false); }}
                                  style={{
                                    flex: 1, padding: 12, borderRadius: 12, textAlign: 'left',
                                    background: isSel ? th.cardAlt : 'transparent',
                                    border: `0.5px solid ${isSel ? th.accent : th.border}`,
                                    boxShadow: isSel ? `0 0 0 1px ${th.accent}33` : 'none',
                                    cursor: 'pointer', fontFamily: 'inherit',
                                    display: 'flex', justifyContent: 'space-between',
                                    alignItems: 'center', gap: 8,
                                  }}>
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 13, color: th.text, fontWeight: 500 }}>
                                {`${brandLabel} ···· ${m.last4 || '????'}`}
                                {m.is_default && (
                                  <span style={{ fontSize: 10, color: th.muted, fontWeight: 400, marginLeft: 6 }}>
                                    {"(par defaut)"}
                                  </span>
                                )}
                              </span>
                              {m.exp_month && m.exp_year && (
                                <span style={{ fontSize: 11, color: th.muted,
                                               fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                                  {`Exp ${String(m.exp_month).padStart(2,'0')}/${String(m.exp_year).slice(-2)}`}
                                </span>
                              )}
                            </span>
                          </button>
                          <button type="button"
                                  onClick={() => setConfirmDelPmId(m.id)}
                                  title="Supprimer cette carte"
                                  style={{
                                    width: 38, padding: 0, borderRadius: 12,
                                    background: 'transparent',
                                    border: `0.5px solid ${th.border}`,
                                    color: '#ef4444', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                 strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6"/>
                              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                    <button type="button"
                            onClick={() => setSelectedPmId(null)}
                            style={{
                              padding: 12, borderRadius: 12, textAlign: 'left',
                              background: selectedPmId === null ? th.cardAlt : 'transparent',
                              border: `0.5px ${selectedPmId === null ? 'solid' : 'dashed'} ${selectedPmId === null ? th.accent : th.border}`,
                              boxShadow: selectedPmId === null ? `0 0 0 1px ${th.accent}33` : 'none',
                              cursor: 'pointer', fontFamily: 'inherit',
                              fontSize: 13, color: th.text, fontWeight: 500,
                              display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                           strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      {"Ajouter une nouvelle carte"}
                    </button>
                  </div>
                </div>
              )}

              {/* IMPORTANT : on n'instancie StripePaymentSection QU'APRES
                  le chargement de paymentMethods (methodsLoaded=true).
                  Pourquoi : le composant utilise canSaveCards et selectedPmId
                  pour choisir son mode (direct/save/saved). Si on le rend
                  trop tot avec canSaveCards=false (etat initial), il cree
                  un PaymentIntent en mode 'direct' qui devient orphelin
                  Incomplet quand canSaveCards passe a true et le mode
                  flippe -- d'ou les rows 'Saon de Test · beard · ...'
                  observees sur le dashboard Stripe. Skeleton pendant le
                  chargement (~100-300ms typiquement). */}
              {methodsLoaded ? (
                <StripePaymentSection
                  th={th} slug={slug}
                  booking={{
                    service_id:    selSvc?.id,
                    date:          selDate?.toLocaleDateString('sv-SE'),
                    start_time:    selSlot,
                    promo_code_id: promoData?.source === 'promo' ? (promoData.promo_id || null) : null,
                    referral_code: promoData?.source === 'referral' ? (referralCode || null) : null,
                  }}
                  bookingError={bookErr}
                  selectedPmId={selectedPmId}
                  saveCard={saveCard}
                  onSaveCardChange={setSaveCard}
                  isLoggedGlobal={canSaveCards}
                  onSavedNewCard={(newDbId) => {
                    reloadSavedMethods();
                    setSelectedPmId(newDbId);
                    setSaveCard(false);
                  }}
                  onPaid={(piId) => { commitBook(piId); }}
                />
              ) : (
                <div style={{
                  marginTop: 12, padding: 16, borderRadius: 12,
                  background: th.card, border: `0.5px solid ${th.border}`,
                  textAlign: 'center', fontSize: 13, color: th.muted,
                }}>
                  {"Chargement des moyens de paiement…"}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Bouton "Reserver" — masque quand on est en mode payNow (Stripe a son
          propre bouton "Payer X € et reserver"). Desactive si tel invalide. */}
      {!payNow && (
        <button onClick={() => commitBook()} disabled={booking || !phoneOk}
          style={{width:'100%',padding:'16px',borderRadius:99,
            background: phoneOk ? th.accent : th.border, border:'none',
            fontWeight: 500,fontSize:15,
            color: phoneOk ? th.accentText : th.muted,
            cursor: booking ? 'wait' : (phoneOk ? 'pointer' : 'not-allowed'),
            opacity: booking ? 0.7 : (phoneOk ? 1 : 0.5),
            letterSpacing:'-0.01em',
            display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
          {booking ? (
            <>
              <div style={{width:18,height:18,borderRadius:99,
                border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',
                animation:'spin .7s linear infinite'}}/>
              Réservation en cours…
            </>
          ) : (
            !phoneOk ? 'Telephone requis'
              : promoData
                ? `Reserver - ${((selSvc?.price||0)-promoData.discount).toFixed(2)} €`
                : selSvc?.price&&Number(selSvc.price)>0
                  ? `Reserver - ${Number(selSvc.price).toFixed(2)} €`
                  : 'Reserver'
          )}
        </button>
      )}

      {/* Modal confirmation suppression carte sauvegardee */}
      <Confirm
        open={!!confirmDelPmId}
        onClose={() => setConfirmDelPmId(null)}
        onConfirm={handleDeleteSavedPm}
        title="Supprimer cette carte ?"
        message="Vous devrez la ressaisir pour vos prochaines reservations FlowIA."
        danger
      />
    </div>
  );
}
