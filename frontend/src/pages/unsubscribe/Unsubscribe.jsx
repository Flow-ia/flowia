import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

// Commit 27 — Page de désinscription marketing en 2 étapes.
// CAS 1 LOADING  : preview en cours (GET /api/pub/unsubscribe-preview/:token)
// CAS 2 CONFIRM  : opt-in TRUE → écran d'avertissement + bouton "Confirmer"
// CAS 3 ALREADY  : opt-in déjà FALSE → "Vous êtes déjà désinscrit"
// CAS 4 SUCCESS  : POST /unsubscribe-confirm OK → "Désinscription confirmée"
// CAS 5 INVALID  : token KO ou erreur réseau
//
// Le flow 2 étapes évite les désinscriptions accidentelles (prefetch Gmail,
// bots, clic involontaire). Le header List-Unsubscribe RFC 8058 (Gmail/Apple
// bouton intégré) reste sur le GET backend 1-clic — délivrabilité préservée.

const API = import.meta.env.VITE_API_URL || '/api';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const C = {
  bg: '#fafafa', card: '#fff', border: '0.5px solid #e5e7eb',
  text: '#111827', muted: '#6b7280', mutedLight: '#9ca3af',
  okText: '#065f46', okBg: '#f0fdf4', okBorder: '#bbf7d0',
  warnText: '#92400e', warnBg: '#fffbeb', warnBorder: '#fde68a',
  warnAccent: '#f59e0b',
  infoText: '#1e40af', infoBg: '#eff6ff', infoBorder: '#bfdbfe',
  errText: '#991b1b', errBg: '#fef2f2', errBorder: '#fecaca',
  errBtn: '#991b1b',
};

function IconCheck() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  );
}
function IconAlertCircle() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}
function IconAlertTriangle() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}
function IconInfo() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  );
}
function IconGift({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 12 20 22 4 22 4 12"/>
      <rect width="20" height="5" x="2" y="7"/>
      <line x1="12" y1="22" x2="12" y2="7"/>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </svg>
  );
}
function IconUsers({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconBell({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    </svg>
  );
}

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = (params.get('token') || '').trim();

  // step: 'loading' | 'confirm' | 'already' | 'success' | 'invalid'
  const [step, setStep] = useState('loading');
  const [info, setInfo] = useState({ email: null, firstName: null, businessName: null, businessEmail: null });
  const [submitting, setSubmitting] = useState(false);
  const [optInState, setOptInState] = useState({ loading: false, done: false, error: null });
  const [errorMsg, setErrorMsg] = useState(null);

  const loadPreview = useCallback(async () => {
    if (!UUID_RE.test(token)) {
      setStep('invalid');
      return;
    }
    setStep('loading');
    try {
      const res = await fetch(`${API}/pub/unsubscribe-preview/${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setStep('invalid');
        return;
      }
      setInfo({
        email: data.email || null,
        firstName: data.first_name || null,
        businessName: data.business_name || null,
        businessEmail: data.business_email || null,
      });
      setStep(data.already_unsubscribed ? 'already' : 'confirm');
    } catch {
      setStep('invalid');
    }
  }, [token]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API}/pub/unsubscribe-confirm/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrorMsg("La désinscription n'a pas pu être enregistrée. Merci de réessayer.");
        setSubmitting(false);
        return;
      }
      setInfo(p => ({
        ...p,
        email: data.email || p.email,
        businessName: data.business_name || p.businessName,
      }));
      setStep('success');
      setOptInState({ loading: false, done: false, error: null });
    } catch {
      setErrorMsg("Erreur réseau, merci de réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    // Pas de slug commerçant disponible côté frontend (token UUID seulement).
    // Rediriger vers la racine — le RootSwitch gère le routing public/admin.
    if (typeof window !== 'undefined') {
      try { window.history.back(); }
      catch { window.location.href = '/'; }
    }
  }

  async function handleOptIn() {
    if (!UUID_RE.test(token) || optInState.loading) return;
    setOptInState({ loading: true, done: false, error: null });
    try {
      const res = await fetch(`${API}/pub/opt-in/${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setOptInState({ loading: false, done: true, error: null });
      } else {
        setOptInState({ loading: false, done: false, error: "Le lien n'est plus valide." });
      }
    } catch {
      setOptInState({ loading: false, done: false, error: "Erreur réseau, merci de réessayer." });
    }
  }

  // ── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div style={wrap}>
      <div style={card}>
        {step === 'loading'  && <Loading />}
        {step === 'confirm'  && (
          <ConfirmStep
            info={info}
            submitting={submitting}
            errorMsg={errorMsg}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        )}
        {step === 'already' && (
          <AlreadyStep
            info={info}
            optInState={optInState}
            onOptIn={handleOptIn}
          />
        )}
        {step === 'success' && (
          <SuccessStep
            info={info}
            optInState={optInState}
            onOptIn={handleOptIn}
          />
        )}
        {step === 'invalid' && <InvalidStep info={info} />}
      </div>
    </div>
  );
}

// ── Sous-composants ────────────────────────────────────────────────────────

function Loading() {
  return (
    <p style={{ margin: 0, fontSize: 13, color: C.muted, textAlign: 'center' }}>
      Vérification en cours…
    </p>
  );
}

function ConfirmStep({ info, submitting, errorMsg, onConfirm, onCancel }) {
  const greet = info.firstName ? `Bonjour ${info.firstName},` : 'Bonjour,';
  const bizSuffix = info.businessName ? ` de ${info.businessName}` : '';
  return (
    <>
      <Badge tone="warn"><IconAlertCircle /></Badge>
      <h1 style={titleStyle}>{"Confirmer la désinscription"}</h1>
      <p style={textStyle}>
        {greet}{' '}
        {`vous êtes sur le point de vous désabonner des communications marketing${bizSuffix}.`}
      </p>

      <div style={warnBox}>
        <p style={warnTitle}>{"Vous perdrez vos avantages exclusifs :"}</p>
        <ul style={warnList}>
          <li style={warnItem}>
            <span style={warnIcon}><IconGift /></span>
            <span>{"Code promo personnel le jour de votre anniversaire (≈ 7€ d'économie)"}</span>
          </li>
          <li style={warnItem}>
            <span style={warnIcon}><IconUsers /></span>
            <span>{"Programme parrainage (-10% pour vous et votre filleul)"}</span>
          </li>
          <li style={warnItem}>
            <span style={warnIcon}><IconBell /></span>
            <span>{"Notifications de progression de fidélité"}</span>
          </li>
        </ul>
      </div>

      <div style={btnRow}>
        <button onClick={onCancel} disabled={submitting} style={{ ...btnSecondary, flex: 1 }}>
          {"Annuler"}
        </button>
        <button
          onClick={onConfirm}
          disabled={submitting}
          style={{
            ...btnDanger, flex: 1,
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? '…' : "Confirmer le désabonnement"}
        </button>
      </div>

      {errorMsg && (
        <p style={{ margin: '12px 0 0', fontSize: 11, color: C.errText, textAlign: 'center' }}>
          {errorMsg}
        </p>
      )}

      <p style={hintStyle}>
        {"Vous pouvez vous réabonner à tout moment depuis votre profil."}
      </p>
    </>
  );
}

function AlreadyStep({ info, optInState, onOptIn }) {
  const bizSuffix = info.businessName ? ` de ${info.businessName}` : '';
  return (
    <>
      <Badge tone="info"><IconInfo /></Badge>
      <h1 style={titleStyle}>{"Vous êtes déjà désinscrit"}</h1>
      <p style={textStyle}>
        {`Vous ne recevez déjà plus les communications marketing${bizSuffix}.`}
      </p>
      <p style={{ ...textStyle, marginTop: 10 }}>
        {"Vos notifications de rendez-vous (confirmations, rappels) ne sont pas affectées."}
      </p>
      <ResubscribeBlock optInState={optInState} onOptIn={onOptIn} variant="re" />
    </>
  );
}

function SuccessStep({ info, optInState, onOptIn }) {
  const bizSuffix = info.businessName ? ` de ${info.businessName}` : '';
  return (
    <>
      <Badge tone="ok"><IconCheck /></Badge>
      <h1 style={titleStyle}>{"Désinscription confirmée"}</h1>
      <p style={textStyle}>
        {info.email ? (
          <>
            {"L'adresse "}
            <strong style={{ color: C.text, fontWeight: 500 }}>{info.email}</strong>
            {` ne recevra plus de communications marketing${bizSuffix}.`}
          </>
        ) : (
          <>{`Vous ne recevrez plus de communications marketing${bizSuffix}.`}</>
        )}
      </p>
      <p style={{ ...textStyle, marginTop: 10, fontSize: 12 }}>
        {"Vos notifications de rendez-vous (confirmations, rappels) ne sont pas affectées."}
      </p>
      <p style={{ ...textStyle, marginTop: 10, fontSize: 12 }}>
        {"Si vous changez d'avis, vous pouvez vous réabonner à tout moment."}
      </p>
      <ResubscribeBlock optInState={optInState} onOptIn={onOptIn} variant="now" />
      <button
        onClick={() => { window.location.href = '/'; }}
        style={{ ...btnSecondaryLight, marginTop: 8, width: '100%' }}
      >
        {"Retour à l'accueil"}
      </button>
    </>
  );
}

function InvalidStep({ info }) {
  return (
    <>
      <Badge tone="warn"><IconAlertTriangle /></Badge>
      <h1 style={titleStyle}>{"Lien invalide ou expiré"}</h1>
      <p style={textStyle}>
        {"Ce lien de désinscription n'est pas reconnu. Il a peut-être été tronqué ou a expiré."}
      </p>
      {info?.businessEmail ? (
        <a
          href={`mailto:${info.businessEmail}?subject=Désinscription%20marketing`}
          style={{ ...btnSecondary, display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 18 }}
        >
          {"Contacter le commerçant"}
        </a>
      ) : (
        <p style={{ ...textStyle, marginTop: 16 }}>
          {"Si vous souhaitez vous désinscrire, contactez directement votre commerçant."}
        </p>
      )}
    </>
  );
}

function ResubscribeBlock({ optInState, onOptIn, variant }) {
  if (optInState.done) {
    return (
      <div style={{ ...infoBox, marginTop: 20 }}>
        {"Vous êtes à nouveau inscrit aux offres commerciales."}
      </div>
    );
  }
  const label = variant === 'now' ? 'Me réinscrire maintenant' : 'Me réinscrire';
  return (
    <div style={{ marginTop: 20, paddingTop: 18, borderTop: C.border }}>
      <button
        onClick={onOptIn}
        disabled={optInState.loading}
        style={{
          ...btnSecondary, width: '100%',
          cursor: optInState.loading ? 'wait' : 'pointer',
          opacity: optInState.loading ? 0.6 : 1,
        }}
      >
        {optInState.loading ? '…' : label}
      </button>
      {optInState.error && (
        <p style={{ margin: '10px 0 0', fontSize: 11, color: C.errText, textAlign: 'center' }}>
          {optInState.error}
        </p>
      )}
    </div>
  );
}

function Badge({ tone, children }) {
  const palette = {
    ok:   { c: C.okText,   b: C.okBg,   br: C.okBorder },
    warn: { c: C.warnText, b: C.warnBg, br: C.warnBorder },
    info: { c: C.infoText, b: C.infoBg, br: C.infoBorder },
    err:  { c: C.errText,  b: C.errBg,  br: C.errBorder },
  }[tone] || { c: C.text, b: '#f5f5f5', br: '#e5e7eb' };
  return (
    <div style={{
      width: 56, height: 56, borderRadius: '50%',
      background: palette.b, border: `0.5px solid ${palette.br}`,
      color: palette.c,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      margin: '0 auto 18px',
    }}>{children}</div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const wrap = {
  minHeight: '100vh', background: C.bg, padding: '40px 16px',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: C.text,
};
const card = {
  width: '100%', maxWidth: 480, background: C.card, border: C.border,
  borderRadius: 14, padding: '32px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
};
const titleStyle = {
  margin: '0 0 12px', fontSize: 18, fontWeight: 500,
  color: C.text, textAlign: 'center', lineHeight: 1.4,
};
const textStyle = {
  margin: 0, fontSize: 13, color: C.muted,
  textAlign: 'center', lineHeight: 1.6,
};
const hintStyle = {
  margin: '14px 0 0', fontSize: 11, color: C.mutedLight,
  textAlign: 'center', lineHeight: 1.5,
};
const warnBox = {
  margin: '20px 0 18px',
  padding: 14,
  background: C.warnBg,
  borderLeft: `3px solid ${C.warnAccent}`,
  borderRadius: 8,
};
const warnTitle = {
  margin: '0 0 10px', fontSize: 12, fontWeight: 500, color: C.warnText,
};
const warnList = {
  margin: 0, padding: 0, listStyle: 'none',
  display: 'flex', flexDirection: 'column', gap: 8,
};
const warnItem = {
  display: 'flex', alignItems: 'flex-start', gap: 8,
  fontSize: 11, fontWeight: 400, color: C.warnText,
  lineHeight: 1.5,
};
const warnIcon = {
  flexShrink: 0, color: C.warnText,
  display: 'inline-flex', alignItems: 'center',
  paddingTop: 1,
};
const btnRow = {
  display: 'flex', gap: 10, marginTop: 6,
};
const btnSecondary = {
  padding: '12px 16px',
  background: '#fff', color: C.text,
  border: '0.5px solid #d1d5db', borderRadius: 10,
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit',
};
const btnSecondaryLight = {
  ...btnSecondary, color: C.muted,
};
const btnDanger = {
  padding: '12px 16px',
  background: C.errBtn, color: '#fff',
  border: 'none', borderRadius: 10,
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit',
};
const infoBox = {
  padding: '12px 14px', borderRadius: 10,
  background: C.okBg, color: C.okText,
  border: `0.5px solid ${C.okBorder}`,
  fontSize: 13, lineHeight: 1.4, textAlign: 'center',
};
