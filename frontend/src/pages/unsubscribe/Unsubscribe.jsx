import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

// Commit 26 — Page de désinscription marketing FDS-2026.
// Appelle GET /api/pub/unsubscribe/:token avec Accept: application/json
// pour récupérer un statut JSON. L'effet métier (UPDATE marketing_opt_in
// + INSERT marketing_optout_log) est fait côté backend dans la route GET
// existante (rétrocompat avec les anciens emails). Bouton "Me réabonner"
// pour réactiver immédiatement en cas de désinscription accidentelle.

const API = import.meta.env.VITE_API_URL || '/api';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const C = {
  bg: '#fafafa', card: '#fff', border: '0.5px solid #e5e7eb',
  text: '#111827', muted: '#6b7280',
  okText: '#065f46', okBg: '#f0fdf4', okBorder: '#bbf7d0',
  warnText: '#92400e', warnBg: '#fffbeb', warnBorder: '#fde68a',
  errText: '#991b1b', errBg: '#fef2f2', errBorder: '#fecaca',
  accent: '#111827',
};

function IconCheck() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  );
}
function IconAlert() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}
function IconMail() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  );
}

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = (params.get('token') || '').trim();

  const [state, setState] = useState({ loading: true, status: null, email: null, businessName: null });
  const [optInState, setOptInState] = useState({ loading: false, done: false, error: null });

  const callUnsubscribe = useCallback(async () => {
    if (!UUID_RE.test(token)) {
      setState({ loading: false, status: 'invalid', email: null, businessName: null });
      return;
    }
    try {
      const res = await fetch(`${API}/pub/unsubscribe/${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      setState({
        loading: false,
        status: data.status || (res.ok ? 'unsubscribed' : 'error'),
        email: data.email || null,
        businessName: data.business_name || null,
      });
    } catch (e) {
      setState({ loading: false, status: 'error', email: null, businessName: null });
    }
  }, [token]);

  useEffect(() => { callUnsubscribe(); }, [callUnsubscribe]);

  async function handleResubscribe() {
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

  const wrap = {
    minHeight: '100vh', background: C.bg, padding: '40px 16px',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: C.text,
  };
  const card = {
    width: '100%', maxWidth: 480, background: C.card, border: C.border,
    borderRadius: 14, padding: '32px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
  };

  if (state.loading) {
    return (
      <div style={wrap}>
        <div style={card}>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, textAlign: 'center' }}>
            Vérification en cours…
          </p>
        </div>
      </div>
    );
  }

  if (state.status === 'invalid') {
    return (
      <div style={wrap}>
        <div style={card}>
          <Badge tone="warn"><IconAlert /></Badge>
          <h1 style={titleStyle}>Lien invalide</h1>
          <p style={textStyle}>
            {"Ce lien de désinscription n'est pas reconnu. Il a peut-être été tronqué ou a expiré."}
          </p>
          <p style={{ ...textStyle, marginTop: 16 }}>
            {"Si vous souhaitez vous désinscrire, contactez directement votre commerçant."}
          </p>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div style={wrap}>
        <div style={card}>
          <Badge tone="err"><IconAlert /></Badge>
          <h1 style={titleStyle}>Erreur temporaire</h1>
          <p style={textStyle}>
            {"Une erreur est survenue, merci de réessayer dans quelques instants."}
          </p>
          <button onClick={callUnsubscribe} style={btnPrimary}>Réessayer</button>
        </div>
      </div>
    );
  }

  // status === 'unsubscribed' OR 'already' — toujours afficher comme un succès
  const wasAlready = state.status === 'already';
  const businessSuffix = state.businessName ? ` de ${state.businessName}` : '';

  return (
    <div style={wrap}>
      <div style={card}>
        <Badge tone="ok"><IconCheck /></Badge>
        <h1 style={titleStyle}>
          {wasAlready ? 'Désinscription déjà effective' : 'Désinscription confirmée'}
        </h1>
        <p style={textStyle}>
          {state.email ? (
            <>
              {"L'adresse "}
              <strong style={{ color: C.text, fontWeight: 500 }}>{state.email}</strong>
              {` ne recevra plus d'emails ni SMS commerciaux${businessSuffix}.`}
            </>
          ) : (
            <>{`Vous ne recevrez plus d'emails ni SMS commerciaux${businessSuffix}.`}</>
          )}
        </p>
        <p style={{ ...textStyle, marginTop: 12 }}>
          {"Vos notifications de rendez-vous (confirmations, rappels, annulations) ne sont pas affectées."}
        </p>

        <div style={{ borderTop: C.border, marginTop: 24, paddingTop: 20 }}>
          {optInState.done ? (
            <div style={infoBox('ok')}>
              <IconMail />
              <span>{"Vous êtes à nouveau inscrit aux offres commerciales."}</span>
            </div>
          ) : (
            <>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                {"Désinscription par erreur ?"}
              </p>
              <button
                onClick={handleResubscribe}
                disabled={optInState.loading}
                style={{
                  ...btnSecondary,
                  cursor: optInState.loading ? 'wait' : 'pointer',
                  opacity: optInState.loading ? 0.6 : 1,
                }}
              >
                {optInState.loading ? '…' : "Me réinscrire aux offres"}
              </button>
              {optInState.error && (
                <p style={{ margin: '10px 0 0', fontSize: 11, color: C.errText }}>
                  {optInState.error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({ tone, children }) {
  const palette = {
    ok:   { c: C.okText,   b: C.okBg,   br: C.okBorder },
    warn: { c: C.warnText, b: C.warnBg, br: C.warnBorder },
    err:  { c: C.errText,  b: C.errBg,  br: C.errBorder },
  }[tone];
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

function infoBox(tone) {
  const palette = {
    ok: { c: C.okText, b: C.okBg, br: C.okBorder },
  }[tone] || { c: C.text, b: '#f5f5f5', br: '#e5e7eb' };
  return {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 14px', borderRadius: 10,
    background: palette.b, color: palette.c,
    border: `0.5px solid ${palette.br}`,
    fontSize: 13, lineHeight: 1.4,
  };
}

const titleStyle = {
  margin: '0 0 12px', fontSize: 18, fontWeight: 500,
  color: C.text, textAlign: 'center', lineHeight: 1.4,
};
const textStyle = {
  margin: 0, fontSize: 13, color: C.muted,
  textAlign: 'center', lineHeight: 1.6,
};
const btnPrimary = {
  width: '100%', marginTop: 18, padding: '12px 16px',
  background: C.accent, color: '#fff', border: 'none',
  borderRadius: 10, fontSize: 13, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit',
};
const btnSecondary = {
  width: '100%', padding: '12px 16px',
  background: '#fff', color: C.text,
  border: '0.5px solid #d1d5db', borderRadius: 10,
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit',
};
