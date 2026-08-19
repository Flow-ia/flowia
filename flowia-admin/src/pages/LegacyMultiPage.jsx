// LegacyMultiPage — Migration manuelle des 4 transactions multi legacy
// (commit D). Liste des rows payment_method='multi' AND payment_group_id NULL,
// modal de saisie du breakdown (2-4 méthodes), POST /api/admin/transactions/
// :id/migrate-breakdown via useLegacyMultiMigration. Audit trail backend.
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import { listLegacyMulti } from '../lib/admin.js';
import { useLegacyMultiMigration } from '../hooks/useLegacyMultiMigration.js';
import AppShell from '../components/AppShell.jsx';

const METHOD_LABELS = {
  cash:      "Espèces",
  transfer:  "Virement",
  card:      "CB physique",
  gift_card: "Bon cadeau",
  other:     "Autre",
};
const ADD_PRIORITY = ['cash', 'transfer', 'card', 'gift_card', 'other'];
const MAX_LINES = 4;

function fmtEur(n) { return Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' DA'; }
function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('fr-FR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return s; }
}

export default function LegacyMultiPage() {
  const navigate = useNavigate();
  const [me, setMe]                 = useState(null);
  const [transactions, setTxs]      = useState([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState('');
  const [selected, setSelected]     = useState(null);   // tx en cours de migration
  const [toast, setToast]           = useState(null);   // { kind, msg }

  useEffect(() => { getMe().then(setMe).catch(() => navigate('/login', { replace: true })); }, [navigate]);

  const reload = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const data = await listLegacyMulti();
      setTxs(Array.isArray(data?.transactions) ? data.transactions : []);
    } catch (err) {
      setLoadError(err?.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // Toast auto-dismiss 4s.
  useEffect(() => {
    if (!toast) return;
    const tm = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(tm);
  }, [toast]);

  const onMigrated = (result, tx) => {
    setTxs(prev => prev.filter(t => t.id !== tx.id));
    setSelected(null);
    setToast({
      kind: 'success',
      msg: `Migration effectuée : ${result.migrated_rows} rows traçables créées (groupe ${result.payment_group_id.slice(0, 8)}…).`,
    });
  };
  const onMigrateError = (err) => {
    setToast({ kind: 'error', msg: err?.message || 'Erreur lors de la migration.' });
  };

  const remaining = transactions.length;
  const allDone   = !loading && !loadError && remaining === 0;

  return (
    <AppShell me={me} footer="Salon DZ Admin — Migration multi legacy">
      <div className="page-head">
        <h1 className="dash-title">{"Migration des paiements multi legacy"}</h1>
        <span className="page-count">
          {remaining} {remaining > 1 ? "transactions à migrer" : "transaction à migrer"}
        </span>
      </div>

      <p className="page-sub" style={{ marginBottom: 16 }}>
        {"Transactions historiques sans détail des méthodes (créées avant la refonte traçable). Saisir le breakdown manuellement pour rétablir une traçabilité complète : la row legacy est supprimée et remplacée par N rows liées par un même payment_group_id, le created_at original est conservé."}
      </p>

      {toast && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: toast.kind === 'success' ? 'rgba(15,110,86,0.12)' : 'rgba(239,68,68,0.12)',
          color:      toast.kind === 'success' ? 'var(--success)'        : 'var(--error)',
          border: '0.5px solid ' + (toast.kind === 'success' ? 'var(--success)' : 'var(--error)'),
        }}>
          {toast.msg}
        </div>
      )}

      {loadError && <div className="login-error" style={{ marginBottom: 12 }}>{loadError}</div>}

      {allDone && (
        <div style={{
          padding: '14px 16px', borderRadius: 10,
          background: 'rgba(15,110,86,0.08)',
          border: '0.5px solid var(--success)',
          color: 'var(--success)',
          fontSize: 13, marginBottom: 12,
        }}>
          {"Toutes les transactions legacy ont été migrées avec succès. Le système est maintenant 100% traçable."}
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{"Date du paiement"}</th>
              <th>{"Commerçant"}</th>
              <th>{"Client / RDV"}</th>
              <th>{"Description"}</th>
              <th style={{ textAlign: 'right' }}>{"Montant"}</th>
              <th>{"Action"}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="td-loading">{"Chargement..."}</td></tr>
            )}
            {!loading && transactions.length === 0 && (
              <tr><td colSpan={6} className="td-loading">
                {allDone ? "Aucune transaction legacy restante." : "—"}
              </td></tr>
            )}
            {!loading && transactions.map(tx => (
              <tr key={tx.id}>
                <td className="mono">{fmtDate(tx.created_at)}</td>
                <td>
                  <div className="cell-primary">{tx.merchant_name || '—'}</div>
                  <div className="cell-secondary mono">{tx.user_id?.slice(0, 8)}…</div>
                </td>
                <td>
                  <div>{tx.client_name || '—'}</div>
                  {tx.appointment_date && (
                    <div className="cell-secondary">{"RDV " + tx.appointment_date}</div>
                  )}
                </td>
                <td>{tx.description || '—'}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 500 }}>
                  {fmtEur(tx.amount)}
                </td>
                <td>
                  <button className="btn-primary" onClick={() => setSelected(tx)}>
                    {"Saisir le détail"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <BreakdownModal
          transaction={selected}
          onClose={() => setSelected(null)}
          onSuccess={(result) => onMigrated(result, selected)}
          onError={onMigrateError}
        />
      )}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de saisie du breakdown — même UX que la caisse Step3 (commit B) :
// 2 lignes pré-remplies (cash + transfer), bouton "+ Ajouter une méthode"
// (max 4), validation somme temps réel, doublons détectés via dropdown
// disable, bouton confirmer disabled tant que somme != total.
// ─────────────────────────────────────────────────────────────────────────────
function BreakdownModal({ transaction, onClose, onSuccess, onError }) {
  const [lines, setLines] = useState([
    { method: 'cash',     amount: '' },
    { method: 'transfer', amount: '' },
  ]);
  const { migrate, status } = useLegacyMultiMigration();
  const busy = status === 'loading';

  const totalCents = Math.round((parseFloat(transaction.amount) || 0) * 100);
  const totalEur   = totalCents / 100;

  const active = lines
    .map(l => ({
      method: l.method,
      amount: parseFloat(String(l.amount).replace(',', '.')) || 0,
    }))
    .filter(p => p.amount > 0);
  const sumEur     = active.reduce((s, p) => s + p.amount, 0);
  const sumCents   = Math.round(sumEur * 100);
  const diffCents  = totalCents - sumCents;
  const sumMatches = Math.abs(diffCents) === 0;
  const canSubmit  = !busy && sumMatches && active.length >= 2;

  const updateMethod = (idx, m) => setLines(prev => prev.map((l, i) => i === idx ? { ...l, method: m } : l));
  const updateAmount = (idx, raw) => {
    const cleaned = String(raw).replace(/[^0-9.,]/g, '');
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, amount: cleaned } : l));
  };
  const removeLine = (idx) => {
    if (idx < 2) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };
  const addLine = () => {
    setLines(prev => {
      if (prev.length >= MAX_LINES) return prev;
      const used = new Set(prev.map(l => l.method));
      const next = ADD_PRIORITY.find(m => !used.has(m)) || 'other';
      return [...prev, { method: next, amount: '' }];
    });
  };

  async function onConfirm() {
    if (!canSubmit) return;
    try {
      const payload = active.map(p => ({
        method: p.method,
        amount_cents: Math.round(p.amount * 100),
      }));
      const result = await migrate(transaction.id, payload);
      onSuccess(result);
    } catch (err) {
      onError(err);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, zIndex: 1000,
    }} onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div style={{
        maxWidth: 520, width: '100%', background: 'var(--surface)',
        borderRadius: 12, padding: 24,
        boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
        border: '0.5px solid var(--border)',
      }}>
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--fg)' }}>
          {"Saisir le détail du paiement"}
        </h3>
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 8,
          background: 'var(--surface-2)', border: '0.5px solid var(--border)',
          fontSize: 12, color: 'var(--fg-muted)',
        }}>
          <div><strong>{"Commerçant : "}</strong>{transaction.merchant_name || '—'}</div>
          <div><strong>{"Client : "}</strong>{transaction.client_name || '—'}</div>
          <div><strong>{"Description : "}</strong>{transaction.description || '—'}</div>
          <div><strong>{"Date originale : "}</strong>{fmtDate(transaction.created_at)}</div>
        </div>

        <div style={{
          marginTop: 14, padding: '12px 14px', borderRadius: 8,
          background: 'var(--surface-2)', border: '0.5px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 500 }}>
            {"Total à répartir"}
          </span>
          <span style={{ fontSize: 18, fontWeight: 500, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--fg)' }}>
            {fmtEur(totalEur)}
          </span>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lines.map((line, idx) => {
            const usedElsewhere = new Set(lines.filter((_, i) => i !== idx).map(l => l.method));
            const removable = idx >= 2;
            return (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: 8, borderRadius: 8,
                border: '0.5px solid var(--border)', background: 'var(--surface)',
              }}>
                <select value={line.method}
                        onChange={e => updateMethod(idx, e.target.value)}
                        disabled={busy}
                        style={{
                          flex: 1, padding: '8px 10px', borderRadius: 6,
                          border: '0.5px solid var(--border)',
                          background: 'var(--surface-2)', color: 'var(--fg)',
                          fontSize: 13, fontFamily: 'inherit',
                        }}>
                  {Object.entries(METHOD_LABELS).map(([id, label]) => (
                    <option key={id} value={id}
                            disabled={id !== line.method && usedElsewhere.has(id)}>
                      {label + (id !== line.method && usedElsewhere.has(id) ? "  (déjà utilisé)" : "")}
                    </option>
                  ))}
                </select>
                <input type="text" inputMode="decimal"
                       value={line.amount}
                       onChange={e => updateAmount(idx, e.target.value)}
                       placeholder="0"
                       disabled={busy}
                       style={{
                         width: 110, padding: '8px 10px', borderRadius: 6,
                         border: '0.5px solid var(--border)',
                         background: 'var(--surface-2)', color: 'var(--fg)',
                         fontSize: 14, fontWeight: 500, textAlign: 'right',
                         fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                       }}/>
                <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{"DA"}</span>
                {removable ? (
                  <button onClick={() => removeLine(idx)} disabled={busy}
                          aria-label="Supprimer cette méthode"
                          style={{
                            width: 30, height: 30, borderRadius: 6,
                            border: 'none', background: 'transparent',
                            color: 'var(--fg-muted)', cursor: busy ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit', fontSize: 16,
                          }}>
                    {"×"}
                  </button>
                ) : (
                  <span style={{ width: 30, flexShrink: 0 }}/>
                )}
              </div>
            );
          })}

          {lines.length < MAX_LINES && (
            <button onClick={addLine} disabled={busy}
                    style={{
                      padding: '8px 12px', borderRadius: 8,
                      border: '0.5px dashed var(--border)',
                      background: 'transparent', color: 'var(--fg-muted)',
                      cursor: busy ? 'not-allowed' : 'pointer',
                      fontSize: 12, fontFamily: 'inherit',
                    }}>
              {"+ Ajouter une méthode"}
            </button>
          )}
        </div>

        <div style={{
          marginTop: 14, padding: '10px 12px', borderRadius: 8,
          background: 'var(--surface-2)', border: '0.5px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fg-muted)' }}>
            <span>{"Somme actuelle"}</span>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{fmtEur(sumEur)}</span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            color: sumMatches ? '#1D9E75' : '#F59E0B', fontWeight: 500,
          }}>
            <span>{"Restant à répartir"}</span>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {fmtEur(Math.abs(diffCents) / 100)}
            </span>
          </div>
          {sumMatches && active.length < 2 && (
            <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 500 }}>
              {"Au moins 2 méthodes avec un montant > 0 sont requises."}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-primary" onClick={onConfirm}
                  disabled={!canSubmit}
                  style={{ flex: 1, opacity: canSubmit ? 1 : 0.55 }}>
            {busy ? 'Migration en cours...' : 'Confirmer la migration'}
          </button>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            {"Annuler"}
          </button>
        </div>
      </div>
    </div>
  );
}
