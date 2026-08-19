// MaintenancePage.jsx — Toggle kill-switch maintenance par super-admin.
// 3 perimetres independants + whitelist bypass (emails / user_ids).
// Backend : GET/PATCH /api/admin/maintenance (cf. routes/admin/maintenance.js).

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import { apiJson } from '../lib/api.js';
import AppShell from '../components/AppShell.jsx';

const SCOPES = [
  {
    key:    'merchant_portal',
    label:  'Portail commercant',
    desc:   "Bloque le dashboard commercant, l'agenda, la caisse, etc. Les whitelisted continuent d'avoir acces.",
  },
  {
    key:    'booking_public',
    label:  'Reservation publique',
    desc:   "Bloque les pages /book/:slug que les clients utilisent pour reserver un RDV.",
  },
  {
    key:    'merchant_signup',
    label:  'Inscription commercant',
    desc:   "Bloque uniquement /api/auth/register. Les connexions existantes restent fonctionnelles.",
  },
];

const DEFAULT_MSG = "Notre plateforme est en cours de maintenance. Merci de reessayer plus tard ou de contacter directement le support.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function MaintenancePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving]   = useState(false);

  const [newEmail, setNewEmail]     = useState('');
  const [newUserId, setNewUserId]   = useState('');

  useEffect(() => {
    (async () => {
      try { setMe(await getMe()); }
      catch { navigate('/login', { replace: true }); return; }
      try {
        const data = await apiJson('/api/admin/maintenance');
        setState(normalize(data));
      } catch (e) {
        setError(e?.message || 'Lecture impossible.');
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  function normalize(d) {
    return {
      merchant_portal:  d?.merchant_portal  || { enabled: false, message: DEFAULT_MSG },
      booking_public:   d?.booking_public   || { enabled: false, message: DEFAULT_MSG },
      merchant_signup:  d?.merchant_signup  || { enabled: false, message: DEFAULT_MSG },
      bypass_emails:    Array.isArray(d?.bypass_emails)   ? d.bypass_emails   : [],
      bypass_user_ids:  Array.isArray(d?.bypass_user_ids) ? d.bypass_user_ids : [],
    };
  }

  function toggleScope(scope) {
    setState(s => ({ ...s, [scope]: { ...s[scope], enabled: !s[scope].enabled } }));
  }

  function setMessage(scope, msg) {
    setState(s => ({ ...s, [scope]: { ...s[scope], message: msg } }));
  }

  function addEmail() {
    const e = newEmail.trim().toLowerCase();
    if (!e) return;
    if (!EMAIL_RE.test(e)) { setError("Email invalide."); return; }
    if (state.bypass_emails.includes(e)) { setError("Email deja dans la liste."); return; }
    setState(s => ({ ...s, bypass_emails: [...s.bypass_emails, e] }));
    setNewEmail('');
    setError('');
  }

  function removeEmail(e) {
    setState(s => ({ ...s, bypass_emails: s.bypass_emails.filter(x => x !== e) }));
  }

  function addUserId() {
    const u = newUserId.trim().toLowerCase();
    if (!u) return;
    if (!UUID_RE.test(u)) { setError("UUID invalide (format attendu : 8-4-4-4-12 hex)."); return; }
    if (state.bypass_user_ids.includes(u)) { setError("UUID deja dans la liste."); return; }
    setState(s => ({ ...s, bypass_user_ids: [...s.bypass_user_ids, u] }));
    setNewUserId('');
    setError('');
  }

  function removeUserId(u) {
    setState(s => ({ ...s, bypass_user_ids: s.bypass_user_ids.filter(x => x !== u) }));
  }

  async function save() {
    setError(''); setSuccess('');
    setSaving(true);
    try {
      const next = await apiJson('/api/admin/maintenance', {
        method: 'PATCH',
        body: JSON.stringify({
          merchant_portal:  state.merchant_portal,
          booking_public:   state.booking_public,
          merchant_signup:  state.merchant_signup,
          bypass_emails:    state.bypass_emails,
          bypass_user_ids:  state.bypass_user_ids,
        }),
      });
      setState(normalize(next));
      setSuccess('Modifications enregistrees. Effet immediat (cache 5s).');
    } catch (e) {
      setError(e?.message || 'Sauvegarde impossible.');
    } finally {
      setSaving(false);
    }
  }

  const anyOn = state && (
    state.merchant_portal.enabled ||
    state.booking_public.enabled  ||
    state.merchant_signup.enabled
  );

  return (
    <AppShell me={me} footer="Salon DZ Admin — Maintenance">
      <h1 className="dash-title">{"Maintenance plateforme"}</h1>

      {loading && <section className="card"><p className="card-sub">{"Chargement..."}</p></section>}

      {!loading && state && (
        <>
          {/* Bandeau global d'etat */}
          <section className="card" style={{ borderColor: anyOn ? '#f59e0b' : undefined }}>
            <div className="card-head">
              <h2 className="card-title">{"Etat global"}</h2>
              <span className={"badge " + (anyOn ? 'badge-on' : 'badge-off')}>
                {anyOn ? 'Maintenance active' : 'Plateforme operationnelle'}
              </span>
            </div>
            <p className="card-sub">
              {anyOn
                ? "Au moins un perimetre est en maintenance. Les non-whitelisted voient un overlay plein ecran sur les routes concernees."
                : "Tous les perimetres sont actifs. Aucune restriction en cours."}
            </p>
          </section>

          {error   && <div className="login-error">{error}</div>}
          {success && <div className="login-success">{success}</div>}

          {/* 3 perimetres */}
          {SCOPES.map(s => (
            <section key={s.key} className="card">
              <div className="card-head">
                <h2 className="card-title">{s.label}</h2>
                <span className={"badge " + (state[s.key].enabled ? 'badge-on' : 'badge-off')}>
                  {state[s.key].enabled ? 'Bloque' : 'Actif'}
                </span>
              </div>
              <p className="card-sub">{s.desc}</p>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 16px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={state[s.key].enabled}
                  onChange={() => toggleScope(s.key)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span style={{ fontWeight: 500 }}>
                  {state[s.key].enabled ? 'Maintenance ACTIVE — desactiver ?' : 'Activer la maintenance'}
                </span>
              </label>

              <label className="field" style={{ display: 'block' }}>
                <span>{"Message affiche aux utilisateurs"}</span>
                <textarea
                  value={state[s.key].message || ''}
                  onChange={(e) => setMessage(s.key, e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder={DEFAULT_MSG}
                  style={{
                    width: '100%',
                    padding: 10,
                    fontFamily: 'inherit',
                    fontSize: 14,
                    border: '0.5px solid #d4d4d8',
                    borderRadius: 6,
                    resize: 'vertical',
                  }}
                />
                <span style={{ fontSize: 12, color: '#71717a', marginTop: 4, display: 'block' }}>
                  {(state[s.key].message || '').length}{"/1000 caracteres"}
                </span>
              </label>
            </section>
          ))}

          {/* Whitelist emails */}
          <section className="card">
            <h2 className="card-title">{"Whitelist emails (bypass)"}</h2>
            <p className="card-sub">
              {"Les commercants dont l'email correspond auront acces meme quand la maintenance est active. Utile pour que tu puisses tester en mode bloque."}
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email@exemple.com"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                style={{ flex: 1, padding: 10, fontSize: 14, border: '0.5px solid #d4d4d8', borderRadius: 6 }}
              />
              <button type="button" className="btn-primary" onClick={addEmail}>{"Ajouter"}</button>
            </div>

            {state.bypass_emails.length === 0 ? (
              <p className="card-sub" style={{ marginTop: 16, fontStyle: 'italic' }}>
                {"Aucun email dans la whitelist."}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
                {state.bypass_emails.map(e => (
                  <li key={e} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    border: '0.5px solid #e4e4e7',
                    borderRadius: 6,
                    marginBottom: 6,
                    fontSize: 14,
                  }}>
                    <code style={{ background: 'transparent', fontFamily: 'monospace' }}>{e}</code>
                    <button type="button" className="btn-ghost" onClick={() => removeEmail(e)}>
                      {"Retirer"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Whitelist user_ids */}
          <section className="card">
            <h2 className="card-title">{"Whitelist user_ids (bypass)"}</h2>
            <p className="card-sub">
              {"Alternative a l'email : par UUID exact de la row users. Utile si l'email change ou pour cibler un test specifique."}
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input
                type="text"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUserId(); } }}
                style={{ flex: 1, padding: 10, fontSize: 14, fontFamily: 'monospace', border: '0.5px solid #d4d4d8', borderRadius: 6 }}
              />
              <button type="button" className="btn-primary" onClick={addUserId}>{"Ajouter"}</button>
            </div>

            {state.bypass_user_ids.length === 0 ? (
              <p className="card-sub" style={{ marginTop: 16, fontStyle: 'italic' }}>
                {"Aucun user_id dans la whitelist."}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
                {state.bypass_user_ids.map(u => (
                  <li key={u} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    border: '0.5px solid #e4e4e7',
                    borderRadius: 6,
                    marginBottom: 6,
                    fontSize: 13,
                  }}>
                    <code style={{ background: 'transparent', fontFamily: 'monospace' }}>{u}</code>
                    <button type="button" className="btn-ghost" onClick={() => removeUserId(u)}>
                      {"Retirer"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Action save */}
          <section className="card">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={save}
                disabled={saving}
                style={{ flex: '0 1 200px' }}
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
              <span className="card-sub" style={{ margin: 0 }}>
                {"Modifications loggees dans admin_audit_log."}
              </span>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
