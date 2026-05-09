// SearchPage.jsx — Recherche universelle superadmin.
// Permet de retrouver un RDV par sa reference, ou tous les RDV d'un client
// par immatricule / email / telephone. Affiche un tableau ligne par ligne
// avec toutes les jointures (commercant + client + paiement).

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import { searchUniversal } from '../lib/admin.js';
import AppShell from '../components/AppShell.jsx';

const PAGE_SIZE = 50;

// Format euros depuis cents (paid_amount_cents). Renvoie '—' si nullish.
function formatEuros(cents) {
  if (cents == null) return '—';
  return `${(Number(cents) / 100).toFixed(2)} €`;
}

// Format date FR depuis ISO YYYY-MM-DD.
function formatDate(d) {
  if (!d) return '—';
  try {
    const [y, mo, da] = String(d).split('-');
    return `${da}/${mo}/${y}`;
  } catch { return String(d); }
}

// Statut du RDV en label + classe badge.
function apptStatusLabel(s) {
  const map = {
    confirmed: { label: 'Confirme',   cls: 'badge-on'     },
    pending:   { label: 'En attente', cls: 'badge-off'   },
    completed: { label: 'Termine',    cls: 'badge-on'     },
    cancelled: { label: 'Annule',     cls: 'badge-frozen' },
    no_show:   { label: 'No-show',    cls: 'badge-frozen' },
  };
  return map[s] || { label: s || '—', cls: '' };
}

// Statut paiement -> label + classe.
function paymentStatusLabel(s) {
  if (!s) return { label: '—', cls: '' };
  const map = {
    paid:           { label: 'Paye',        cls: 'badge-on'     },
    refunded:       { label: 'Rembourse',   cls: 'badge-off'   },
    partial_refund: { label: 'Partiel',     cls: 'badge-off'   },
    pending:        { label: 'En attente',  cls: 'badge-off'   },
    failed:         { label: 'Echec',       cls: 'badge-frozen' },
  };
  return map[s] || { label: s, cls: '' };
}

// Bouton compact "copier" : icone + feedback visuel 1.2s sur clic.
// Utilise navigator.clipboard.writeText (HTTPS only) ; fallback document
// .execCommand pour les contextes non-secure (rare en admin mais defensif).
// Disabled si pas de valeur a copier (evite les copies de '—').
function CopyButton({ value, title }) {
  const [copied, setCopied] = useState(false);
  if (!value || value === '—') return null;

  async function handleCopy(e) {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(String(value));
      } else {
        // Fallback (dev local non-HTTPS, vieux navigateurs).
        const ta = document.createElement('textarea');
        ta.value = String(value);
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* navigator interdit copy : silent, l'admin peut selectionner manuellement */ }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copie !' : (title || 'Copier')}
      aria-label={title || 'Copier'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginLeft: 4, padding: 2, border: 'none', background: 'transparent',
        cursor: 'pointer', color: copied ? 'var(--success)' : 'var(--fg-muted)',
        verticalAlign: 'middle', transition: 'color 0.15s ease',
      }}
    >
      {copied
        ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )
        : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        )
      }
    </button>
  );
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [me, setMe]           = useState(null);
  const [q, setQ]             = useState('');
  const [type, setType]       = useState('auto');
  const [data, setData]       = useState({ rows: [], total: 0, type_detected: null });
  const [offset, setOffset]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => { getMe().then(setMe).catch(() => navigate('/login', { replace: true })); }, [navigate]);

  const load = useCallback(async (queryStr, currentOffset) => {
    if (!queryStr || !queryStr.trim()) return;
    setLoading(true); setError('');
    try {
      const d = await searchUniversal({ q: queryStr.trim(), type, limit: PAGE_SIZE, offset: currentOffset });
      setData(d);
      setHasSearched(true);
    } catch (err) {
      setError(err && err.message ? err.message : 'Erreur de recherche.');
      setData({ rows: [], total: 0, type_detected: null });
    } finally {
      setLoading(false);
    }
  }, [type]);

  function onSubmit(e) {
    e.preventDefault();
    setOffset(0);
    load(q, 0);
  }

  function changePage(newOffset) {
    setOffset(newOffset);
    load(q, newOffset);
  }

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // Format human-readable du type detecte par le backend.
  const typeLabels = {
    rdv:   'Reference RDV',
    immat: 'Immatricule client',
    email: 'Email',
    phone: 'Telephone',
  };

  return (
    <AppShell me={me} footer="FlowIA Admin — Recherche">
      <div className="page-head">
        <h1 className="dash-title">{"Recherche universelle"}</h1>
        {hasSearched && <span className="page-count">{data.total} {"resultats"}</span>}
      </div>

      <p className="page-sub" style={{ marginBottom: '16px' }}>
        {"Cherche par reference RDV (ex DDE26904), immatricule client (CLI-A1B2C3D4), email ou numero de telephone. Auto-detection du type via format ou selection manuelle."}
      </p>

      <form className="filters" onSubmit={onSubmit}>
        <input
          type="text"
          placeholder={"Reference RDV / CLI-XXXXXXXX / email / telephone"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          style={{ flex: 1, minWidth: 280 }}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="auto">{"Auto-detection"}</option>
          <option value="rdv">{"Reference RDV"}</option>
          <option value="immat">{"Immatricule client"}</option>
          <option value="email">{"Email"}</option>
          <option value="phone">{"Telephone"}</option>
        </select>
        <button type="submit" className="btn-ghost" disabled={loading || !q.trim()}>
          {loading ? 'Recherche…' : 'Rechercher'}
        </button>
      </form>

      {hasSearched && data.type_detected && (
        <p className="page-sub" style={{ marginTop: 0, marginBottom: '12px', fontSize: 12 }}>
          {`Type detecte : ${typeLabels[data.type_detected] || data.type_detected}`}
        </p>
      )}

      {error && <div className="login-error">{error}</div>}

      {hasSearched && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{"Date"}</th>
                <th>{"Heure"}</th>
                <th>{"Ref RDV"}</th>
                <th>{"Salon"}</th>
                <th>{"Client"}</th>
                <th>{"Immatricule"}</th>
                <th>{"Contact"}</th>
                <th>{"Service"}</th>
                <th>{"Employe"}</th>
                <th>{"Statut RDV"}</th>
                <th>{"Paiement"}</th>
                <th>{"Montant"}</th>
                <th>{"PI Stripe"}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={13} className="td-loading">{"Chargement..."}</td></tr>}
              {!loading && data.rows.length === 0 && <tr><td colSpan={13} className="td-loading">{"Aucun resultat."}</td></tr>}
              {!loading && data.rows.map(r => {
                // Prefere les infos global_clients (cross-merchant stable)
                // sinon client_accounts (per-merchant) sinon les infos
                // saisies au booking (appt_*).
                const clientName = [r.global_first_name || r.client_first_name, r.global_last_name || r.client_last_name]
                  .filter(Boolean).join(' ') || r.appt_client_name || '—';
                const clientEmail = r.global_email || r.client_email || r.appt_client_email || '—';
                const clientPhone = r.global_phone || r.client_phone || r.appt_client_phone || '—';
                // Immatricule : prefere global, sinon per-merchant.
                const immat = r.global_immatricule
                  ? `CLI-${r.global_immatricule}`
                  : (r.client_immatricule ? `CLI-${r.client_immatricule}` : '—');
                const apptSt = apptStatusLabel(r.status);
                const paySt  = paymentStatusLabel(r.payment_status);
                // Lien vers la fiche client global si existe, sinon fiche
                // per-merchant (pas de page dediee admin pour client_accounts
                // -> on tombe sur le merchant).
                const clientLink = r.global_client_id
                  ? `/clients/${r.global_client_id}`
                  : (r.merchant_id ? `/merchants/${r.merchant_id}` : null);
                return (
                  <tr key={r.appointment_id}>
                    <td className="mono">{formatDate(r.date)}</td>
                    <td className="mono">{r.start_time || '—'}</td>
                    <td className="mono">
                      <span style={{ fontWeight: 500 }}>{`RDV-${r.appointment_ref}`}</span>
                    </td>
                    <td>
                      {r.merchant_id
                        ? <a href={`/merchants/${r.merchant_id}`} className="row-link" onClick={(e) => { e.preventDefault(); navigate(`/merchants/${r.merchant_id}`); }}>
                            {r.merchant_business_name || '—'}
                          </a>
                        : '—'}
                    </td>
                    <td>
                      {clientLink
                        ? <a href={clientLink} className="row-link" onClick={(e) => { e.preventDefault(); navigate(clientLink); }}>
                            {clientName}
                          </a>
                        : clientName}
                    </td>
                    <td className="mono">{immat}</td>
                    <td>
                      <div style={{ fontSize: 11, lineHeight: 1.4 }}>
                        <div className="mono" style={{ display: 'flex', alignItems: 'center' }}>
                          <span>{clientEmail}</span>
                          <CopyButton value={clientEmail} title="Copier l'email" />
                        </div>
                        <div className="mono" style={{ opacity: 0.7, display: 'flex', alignItems: 'center' }}>
                          <span>{clientPhone}</span>
                          <CopyButton value={clientPhone} title="Copier le telephone" />
                        </div>
                      </div>
                    </td>
                    <td>{r.service_name || '—'}</td>
                    <td>{r.employee_name || '—'}</td>
                    <td>
                      <span className={`badge ${apptSt.cls}`}>{apptSt.label}</span>
                    </td>
                    <td>
                      <span className={`badge ${paySt.cls}`}>{paySt.label}</span>
                    </td>
                    <td className="mono">{formatEuros(r.paid_amount_cents)}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      <div style={{ display: 'flex', alignItems: 'center', maxWidth: 200 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {r.payment_intent_id || '—'}
                        </span>
                        <CopyButton value={r.payment_intent_id} title="Copier le PaymentIntent ID Stripe" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasSearched && totalPages > 1 && (
        <div className="pager">
          <button className="btn-ghost" disabled={offset === 0} onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}>{"Precedent"}</button>
          <span className="page-info">{currentPage} / {totalPages}</span>
          <button className="btn-ghost" disabled={offset + PAGE_SIZE >= (data.total || 0)} onClick={() => changePage(offset + PAGE_SIZE)}>{"Suivant"}</button>
        </div>
      )}
    </AppShell>
  );
}
