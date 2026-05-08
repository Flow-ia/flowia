// src/pages/booking-page/auth/GoogleConfirm.jsx
// RGPD commit 19 — page de confirmation OAuth Google.
// Affichée APRÈS retour OAuth pour un NOUVEAU client (le callback back a
// détecté qu'aucun compte n'existait pour cet email/google_id et a généré un
// JWT temporaire scope=oauth_pending). L'utilisateur coche ici les cases
// CGU + marketing puis on POST /api/pub/:slug/oauth-google/finalize qui crée
// effectivement le compte et renvoie un JWT classique scope=client.
//
// Le décodage JWT côté front sert UNIQUEMENT à pré-remplir l'UI ; la
// véritable validation (signature + scope + expiration) est côté back.
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useLocation } from 'react-router-dom';
import { pubApi } from '../../../utils/api';
import { getBookingBase } from '../helpers';
import { ConsentCheckboxes } from '../../../components/ConsentCheckboxes';
import { PhoneInput, isValidPhoneNumber } from '../../../components/PhoneInput';
import { Icon } from '../../../components/Icon';
import BirthMonthYearPicker from '../../../components/BirthMonthYearPicker';

const LIGHT = {
  bg:'#f7f7f7', card:'#ffffff', text:'#1a1a1a', muted:'#6b7280',
  dim:'#9ca3af', border:'#e5e7eb', inputBg:'#ffffff', inputBorder:'#e5e7eb',
  accent:'#1a1a1a', accentText:'#ffffff',
};
const DARK = {
  bg:'#0f0f0f', card:'#1a1a1a', text:'#f5f5f5', muted:'#9ca3af',
  dim:'#6b7280', border:'#2a2a2a', inputBg:'#1a1a1a', inputBorder:'#2a2a2a',
  accent:'#f5f5f5', accentText:'#000000',
};

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(part.length + (4 - part.length % 4) % 4, '=');
    const json = decodeURIComponent(escape(atob(padded)));
    return JSON.parse(json);
  } catch { return null; }
}

function initials(first, last) {
  const f = (first || '').trim().charAt(0);
  const l = (last  || '').trim().charAt(0);
  return (f + l).toUpperCase() || '?';
}

export default function GoogleConfirm() {
  const { slug } = useParams();
  const [search] = useSearchParams();
  const location = useLocation();
  const base = getBookingBase(slug, location.pathname);
  const preToken = search.get('pre_token') || '';

  const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('ff_booking_theme')) || 'light';
  const th = saved === 'dark' ? DARK : LIGHT;

  const [payload, setPayload]   = useState(null);
  const [expired, setExpired]   = useState(false);
  const [phone, setPhone]       = useState('');
  // Commit 24a : date de naissance optionnelle (mois + année).
  const [birthDate, setBirthDate] = useState(null);
  const [consents, setConsents] = useState({ contractAccepted: true, marketingAccepted: false });
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState('');
  const [contractError, setContractError] = useState(false);

  useEffect(() => {
    const decoded = decodeJwtPayload(preToken);
    if (!decoded || decoded.scope !== 'oauth_pending') {
      setExpired(true);
      return;
    }
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      setExpired(true);
      return;
    }
    setPayload(decoded);
  }, [preToken]);

  const submit = async () => {
    setErr(''); setContractError(false);
    if (!consents.contractAccepted) {
      setContractError(true);
      setErr("L'acceptation des conditions est obligatoire.");
      return;
    }
    if (!isValidPhoneNumber(phone || '')) {
      setErr('Numéro de téléphone invalide pour le pays.');
      return;
    }
    setBusy(true);
    try {
      const res = await pubApi.oauthGoogleFinalize(slug, {
        pre_token:          preToken,
        contract_accepted:  consents.contractAccepted,
        marketing_accepted: consents.marketingAccepted,
        phone:              phone || undefined,
        birth_date:         birthDate || null,
      });
      if (!res?.client) throw new Error('Réponse invalide');
      // Persistance cohérente avec AuthPanel.applyClientLogin.
      // Cookie ff_client_token déjà posé par le backend (HttpOnly) — on
      // ne stocke plus que l'objet client (non sensible) en localStorage.
      localStorage.setItem('ff_client_info', JSON.stringify(res.client));
      try { localStorage.removeItem('ff_oauth_pre_register'); } catch {}
      // Redirect vers la page de réservation du commerce — onAuth-équivalent.
      window.location.assign(`${base}`);
    } catch (e) {
      // Côté back : 400 CGU_REQUIRED, 401 OAUTH_PRE_TOKEN_INVALID,
      // 410 OAUTH_PRE_TOKEN_EXPIRED. On mappe vers l'écran approprié.
      const msg = e?.message || '';
      if (/expir|410|OAUTH_PRE_TOKEN_EXPIRED/i.test(msg)) {
        setExpired(true);
      } else if (/CGU_REQUIRED|conditions/i.test(msg)) {
        setContractError(true);
        setErr("L'acceptation des conditions est obligatoire.");
      } else if (/OAUTH_PRE_TOKEN_INVALID|401/i.test(msg)) {
        setExpired(true);
      } else {
        setErr(msg || 'Erreur, réessayez.');
      }
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    try { localStorage.removeItem('ff_oauth_pre_register'); } catch {}
    window.location.assign(`${base}/login`);
  };

  // ─── Écran d'erreur expiré / invalide ────────────────────────────────────
  if (expired) {
    return (
      <Wrapper th={th}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
          gap:14, textAlign:'center' }}>
          <div style={{ width:48, height:48, borderRadius:99, background:'#fef2f2',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Icon name="x" size={24} color="#b91c1c"/>
          </div>
          <h1 style={{ margin:0, fontSize:18, fontWeight:500, color:th.text,
            letterSpacing:'-0.01em' }}>{"Délai dépassé"}</h1>
          <p style={{ margin:0, fontSize:13, color:th.muted, lineHeight:1.6 }}>
            {"Pour des raisons de sécurité, votre session de confirmation a expiré. Recommencez la connexion Google."}
          </p>
          <button onClick={cancel}
            style={{ marginTop:6, width:'100%', padding:'13px',
              borderRadius:11, border:'none', background:th.accent,
              color:th.accentText, fontWeight:500, fontSize:14,
              fontFamily:'inherit', cursor:'pointer' }}>
            {"Recommencer"}
          </button>
        </div>
      </Wrapper>
    );
  }

  // ─── État de chargement (décodage en cours) ──────────────────────────────
  if (!payload) {
    return (
      <Wrapper th={th}>
        <p style={{ margin:0, fontSize:13, color:th.muted, textAlign:'center' }}>
          {"Chargement…"}
        </p>
      </Wrapper>
    );
  }

  const fullName = [payload.first_name, payload.last_name].filter(Boolean).join(' ').trim();

  return (
    <Wrapper th={th}>
      {/* En-tête icône + titre */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
        gap:10, marginBottom:18 }}>
        <div style={{ width:48, height:48, borderRadius:99, background:'#ecfdf5',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon name="checkCircle" size={24} color="#059669"/>
        </div>
        <h1 style={{ margin:0, fontSize:18, fontWeight:500, color:th.text,
          letterSpacing:'-0.01em' }}>{"Connecté avec Google"}</h1>
        <p style={{ margin:0, fontSize:12, color:th.muted, textAlign:'center',
          lineHeight:1.5 }}>
          {"Quelques informations pour finaliser votre inscription."}
        </p>
      </div>

      {/* Bloc Google read-only */}
      <div style={{ display:'flex', alignItems:'center', gap:12,
        padding:'12px 14px', borderRadius:11,
        background:th.inputBg, border:`0.5px solid ${th.border}`,
        marginBottom:14 }}>
        {payload.picture ? (
          <img src={payload.picture} alt=""
            style={{ width:40, height:40, borderRadius:99, flexShrink:0,
              objectFit:'cover', border:`0.5px solid ${th.border}` }}/>
        ) : (
          <div style={{ width:40, height:40, borderRadius:99, flexShrink:0,
            background:th.accent, color:th.accentText, fontWeight:500, fontSize:14,
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            {initials(payload.first_name, payload.last_name)}
          </div>
        )}
        <div style={{ minWidth:0, flex:1 }}>
          <p style={{ margin:0, fontSize:14, fontWeight:500, color:th.text,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {fullName || payload.email}
          </p>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2,
            minWidth:0 }}>
            <span style={{ fontSize:12, color:th.muted, overflow:'hidden',
              textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
              {payload.email}
            </span>
            <span style={{ display:'inline-flex', alignItems:'center', gap:3,
              padding:'2px 6px', borderRadius:99, background:'#ecfdf5',
              color:'#065f46', fontSize:10, fontWeight:500, flexShrink:0 }}>
              <Icon name="check" size={10} color="#065f46"/>
              {"Vérifié"}
            </span>
          </div>
        </div>
      </div>

      {/* RGPD commit 20 : téléphone obligatoire + validé E.164 */}
      <div style={{ marginBottom:14 }}>
        <PhoneInput value={phone} onChange={setPhone}
          label="Téléphone *" required
          theme={{ text: th.text, muted: th.muted, dim: th.dim,
            border: th.border, inputBg: th.inputBg, inputBorder: th.inputBorder }}/>
      </div>

      {/* Commit 24a : mois + année de naissance, optionnels. */}
      <div style={{ marginBottom:14 }}>
        <BirthMonthYearPicker value={birthDate} onChange={setBirthDate}
          label="Date de naissance"
          theme={{ text: th.text, muted: th.muted, inputBg: th.inputBg, inputBorder: th.inputBorder }}/>
      </div>

      {/* ConsentCheckboxes (commit 17) */}
      <div style={{
        outline: contractError ? '0.5px solid #ef4444' : 'none',
        outlineOffset: 2, borderRadius: 10,
      }}>
        <ConsentCheckboxes slug={slug} th={th} onChange={setConsents}/>
      </div>

      {err && (
        <p style={{ margin:'10px 0 0', fontSize:12, color:'#dc2626',
          fontWeight:500 }}>{err}</p>
      )}

      {/* Bouton finaliser — RGPD commit 20 : phone valide aussi obligatoire */}
      {(() => {
        const phoneOk = isValidPhoneNumber(phone || '');
        const blocked = busy || !consents.contractAccepted || !phoneOk;
        return (
          <button onClick={submit} disabled={blocked}
            style={{ width:'100%', marginTop:16, padding:'14px',
              borderRadius:12, border:'none',
              background: blocked ? th.border : th.accent,
              color:      blocked ? th.muted  : th.accentText,
              fontWeight:500, fontSize:14, fontFamily:'inherit',
              cursor: blocked ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1 }}>
            {busy ? "..." : "Finaliser mon inscription →"}
          </button>
        );
      })()}

      {/* Lien annuler */}
      <button onClick={cancel} disabled={busy}
        style={{ display:'block', margin:'12px auto 0',
          background:'none', border:'none', cursor: busy ? 'wait' : 'pointer',
          fontSize:12, color:th.muted, fontFamily:'inherit',
          textDecoration:'underline' }}>
        {"Annuler et utiliser un autre compte"}
      </button>
    </Wrapper>
  );
}

function Wrapper({ th, children }) {
  return (
    <div style={{ minHeight:'100dvh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:'24px 16px' }}>
      <div style={{ width:'100%', maxWidth:480, background:th.card,
        border:`0.5px solid ${th.border}`, borderRadius:14,
        padding:24 }}>
        {children}
      </div>
    </div>
  );
}
