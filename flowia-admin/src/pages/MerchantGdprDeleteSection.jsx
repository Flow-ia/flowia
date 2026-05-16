import { useEffect, useMemo, useState } from 'react';
import { deleteMerchantGdpr, downloadMerchantGdprExport, getMerchantGdprDeletePreview } from '../lib/admin.js';

const DELETE_PHRASE = 'SUPPRIMER DEFINITIVEMENT';

function money(cents) {
  if (cents == null) return 'inconnu';
  return `${(Number(cents || 0) / 100).toFixed(2)} EUR`;
}

function count(preview, key) {
  return Number(preview?.counts?.[key] || 0);
}

function dateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}

export default function MerchantGdprDeleteSection({
  merchant,
  mode = 'section',
  onDeleted,
  isSuperAdmin = true,
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [confirmName, setConfirmName] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [reason, setReason] = useState('');
  const [refundFuture, setRefundFuture] = useState(true);
  const [cancelSubscription, setCancelSubscription] = useState(true);

  const expectedName = String(preview?.merchant?.business_name || merchant?.business_name || '').trim();
  const nameOk = expectedName && confirmName.trim().toLowerCase() === expectedName.toLowerCase();
  const phraseOk = confirmPhrase.trim() === DELETE_PHRASE;

  const hardBlockers = useMemo(() => {
    const blockers = preview?.blockers || [];
    const active = blockers.filter(b => b.code !== 'future_online_paid' || !refundFuture);
    if (preview?.merchant?.stripe_subscription_id && !cancelSubscription) {
      active.push({
        code: 'subscription_active',
        message: "Abonnement Stripe plateforme actif : cochez l'annulation Stripe avant suppression.",
      });
    }
    return active;
  }, [preview, refundFuture, cancelSubscription]);

  const canDelete = !!preview && !busy && nameOk && phraseOk && reason.trim().length >= 8 && hardBlockers.length === 0;
  const alreadyScheduled = !!(preview?.merchant?.deletion_requested_at || merchant?.deletion_requested_at);

  if (!isSuperAdmin) return null;

  async function loadPreview() {
    if (!merchant?.id) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const p = await getMerchantGdprDeletePreview(merchant.id);
      setPreview(p);
    } catch (err) {
      setError(err?.message || 'Erreur chargement preview.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, merchant?.id]);

  function close() {
    if (busy) return;
    setOpen(false);
    setConfirmName('');
    setConfirmPhrase('');
    setReason('');
    setError('');
  }

  async function submitDelete() {
    if (!canDelete || alreadyScheduled) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await deleteMerchantGdpr(merchant.id, {
        confirm_business_name: confirmName,
        confirm_phrase: confirmPhrase,
        reason: reason.trim(),
        refund_future_online_payments: refundFuture,
        cancel_subscription: cancelSubscription,
        delete_stripe_customer: true,
        delete_connect_account: true,
      });
      setResult(res);
      setOpen(false);
      onDeleted?.(merchant.id, res);
    } catch (err) {
      if (err?.data?.preview) setPreview(err.data.preview);
      const blockers = err?.data?.blockers || [];
      setError(blockers.length
        ? `${err.message} ${blockers.map(b => b.message).join(' ')}`
        : (err?.message || 'Suppression impossible.'));
    } finally {
      setBusy(false);
    }
  }

  async function downloadExport() {
    if (!merchant?.id) return;
    setExporting(true);
    setError('');
    try {
      const { blob, filename } = await downloadMerchantGdprExport(merchant.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.message || 'Export impossible.');
    } finally {
      setExporting(false);
    }
  }

  const trigger = mode === 'button'
    ? (
      <button
        type="button"
        className="btn-danger"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        Procedure RGPD
      </button>
    )
    : (
      <section className="card card-danger">
        <div className="card-head">
          <h2 className="card-title">Procedure RGPD compte marchand</h2>
        </div>
        <p className="card-sub">
          Ferme le compte immediatement, coupe les acces et integrations, puis
          programme la purge definitive apres la fenetre standard de retention.
          Action reservee super-admin.
        </p>
        {result && <div className="alert-success" style={{ marginBottom: 12 }}>Procedure RGPD programmee.</div>}
        <button className="btn-danger" onClick={() => setOpen(true)}>Ouvrir la procedure RGPD</button>
      </section>
    );

  return (
    <>
      {trigger}
      {open && (
        <div style={modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div style={modalContent}>
            <div style={modalHeader}>
              <div>
                <h3 style={{ margin: 0, color: '#991b1b', fontSize: 17 }}>Procedure RGPD compte marchand</h3>
                <p style={{ margin: '4px 0 0', color: '#7c2d12', fontSize: 12 }}>
                  {expectedName || merchant?.business_name || merchant?.email}
                </p>
              </div>
              <button className="btn-ghost" onClick={close} disabled={busy}>Fermer</button>
            </div>

            {loading && <div className="splash" style={{ padding: 18 }}>Chargement de l'analyse...</div>}
            {error && <div className="alert-error" style={{ marginTop: 12 }}>{error}</div>}

            {preview && (
              <div className="form-stack" style={{ marginTop: 14 }}>
                <div style={warningBox}>
                  <strong>Mode grande SaaS :</strong>
                  <div style={{ marginTop: 6 }}>
                    fermeture immediate du compte, export disponible, puis purge definitive apres {preview.retention?.days || 30} jours.
                  </div>
                  <div style={{ marginTop: 6 }}>
                    Purge prevue : {dateTime(preview.retention?.scheduled_purge_at)}
                  </div>
                </div>

                <div style={warningBox}>
                  <strong>La purge definitive effacera :</strong>
                  <div style={summaryGrid}>
                    <MiniStat label="Clients" value={count(preview, 'client_accounts')} />
                    <MiniStat label="RDV" value={count(preview, 'appointments')} />
                    <MiniStat label="Encaissements" value={count(preview, 'transactions')} />
                    <MiniStat label="Medias" value={count(preview, 'media')} />
                    <MiniStat label="Employes" value={count(preview, 'employees')} />
                    <MiniStat label="Services" value={count(preview, 'booking_services')} />
                  </div>
                </div>

                <button className="btn-ghost" onClick={downloadExport} disabled={busy || exporting}>
                  {exporting ? 'Export...' : 'Telecharger export JSON avant suppression'}
                </button>

                <div style={financeBox}>
                  <div><strong>Stripe / finance</strong></div>
                  <div>RDV futurs payes en ligne : {preview.finance.future_online_paid_count} ({money(preview.finance.future_online_paid_amount_cents)})</div>
                  <div>Reversements RDV en attente : {preview.finance.appointment_payouts_pending_count} ({money(preview.finance.appointment_payouts_pending_amount_cents)})</div>
                  <div>Payouts en transit : {preview.finance.payouts_in_transit_count} ({money(preview.finance.payouts_in_transit_amount_cents)})</div>
                  <div>Refunds echoues ouverts : {preview.finance.failed_refunds_unresolved_count}</div>
                  <div>
                    Solde Stripe Connect : disponible {money(preview.finance.stripe_balance?.available_cents)}
                    {' / '}en attente {money(preview.finance.stripe_balance?.pending_cents)}
                  </div>
                </div>

                {hardBlockers.length > 0 && (
                  <div style={blockerBox}>
                    <strong>Points a traiter avant suppression :</strong>
                    {hardBlockers.map((b) => (
                      <div key={b.code} style={{ marginTop: 5 }}>{b.message}</div>
                    ))}
                  </div>
                )}

                {alreadyScheduled && (
                  <div className="alert-error">
                    Cette suppression est deja programmee depuis le {dateTime(preview?.merchant?.deletion_requested_at || merchant?.deletion_requested_at)}.
                  </div>
                )}

                <label style={checkLine}>
                  <input type="checkbox" checked={refundFuture} onChange={e => setRefundFuture(e.target.checked)} />
                  Rembourser automatiquement les RDV futurs payes en ligne avant suppression
                </label>
                <label style={checkLine}>
                  <input type="checkbox" checked={cancelSubscription} onChange={e => setCancelSubscription(e.target.checked)} />
                  Annuler l'abonnement Stripe plateforme si present
                </label>
                <div style={infoLine}>
                  Le customer Stripe plateforme et le compte Stripe Connect seront supprimes ou rejetes lors de la purge finale, si Stripe le permet.
                </div>

                <label className="field">
                  <span>Motif interne obligatoire</span>
                  <input
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Ex: demande RGPD recue par support"
                    disabled={busy}
                  />
                </label>

                <label className="field">
                  <span>Tapez exactement le nom commercial : <code>{expectedName}</code></span>
                  <input value={confirmName} onChange={e => setConfirmName(e.target.value)} disabled={busy} />
                </label>

                <label className="field">
                  <span>Tapez la phrase : <code>{DELETE_PHRASE}</code></span>
                  <input value={confirmPhrase} onChange={e => setConfirmPhrase(e.target.value)} disabled={busy} />
                </label>

                {hardBlockers.length > 0 && (
                  <div className="alert-error">
                    Suppression bloquee tant que les points financiers ci-dessus ne sont pas resolus.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn-danger"
                    onClick={submitDelete}
                    disabled={!canDelete || alreadyScheduled}
                    style={{ flex: 1, opacity: canDelete && !alreadyScheduled ? 1 : 0.55 }}
                  >
                    {busy ? 'Programmation...' : 'Fermer et programmer la purge'}
                  </button>
                  <button className="btn-ghost" onClick={loadPreview} disabled={busy || loading}>
                    Re-verifier
                  </button>
                  <button className="btn-ghost" onClick={close} disabled={busy}>
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ padding: 8, border: '1px solid #fecaca', borderRadius: 8, background: '#fff' }}>
      <div style={{ fontSize: 11, color: '#7f1d1d' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#991b1b' }}>{value}</div>
    </div>
  );
}

const modalOverlay = {
  position: 'fixed',
  inset: 0,
  zIndex: 1100,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const modalContent = {
  width: '100%',
  maxWidth: 720,
  maxHeight: '90vh',
  overflowY: 'auto',
  background: '#fff',
  borderRadius: 12,
  border: '0.5px solid rgba(239,68,68,0.45)',
  boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
  padding: 24,
};

const modalHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
};

const warningBox = {
  padding: 12,
  borderRadius: 10,
  background: '#fef2f2',
  color: '#7f1d1d',
  border: '1px solid #fecaca',
  fontSize: 13,
  lineHeight: 1.5,
};

const financeBox = {
  padding: 12,
  borderRadius: 10,
  background: '#fff7ed',
  color: '#7c2d12',
  border: '1px solid #fed7aa',
  fontSize: 13,
  lineHeight: 1.6,
};

const blockerBox = {
  padding: 12,
  borderRadius: 10,
  background: '#fef2f2',
  color: '#991b1b',
  border: '1px solid #fca5a5',
  fontSize: 13,
  lineHeight: 1.45,
};

const summaryGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
  gap: 8,
  marginTop: 10,
};

const checkLine = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  fontSize: 13,
  color: '#3f3f46',
  lineHeight: 1.4,
};

const infoLine = {
  fontSize: 13,
  color: '#52525b',
  lineHeight: 1.45,
};
