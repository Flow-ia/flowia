import { useState } from 'react';
import { bookingApi, referralsApi } from '../../../utils/api';
import { Modal } from '../../../components/UI';
import { Button, Field, Label } from '../../../components/primitives';
import { useEmployeePinGate } from '../../../components/EmployeePinModal';
import { STATUS_CFG, PAY_OPTS } from '../constants';
import { fmtTime, fmtDateL, toMin, fromMin } from '../helpers';
import Toggle from '../components/Toggle';
import InfoRow from '../components/InfoRow';

export default function ApptModal({
  appt: init,
  employees,
  employee,
  onUpdated,
  onDeleted,
  onTxCreated,
  onClose,
  theme: t,
}) {
  const [appt, setAppt] = useState(init);
  const [tab, setTab] = useState('detail');
  const [saving, setSaving] = useState(false);
  const { requestPin, PinModalNode } = useEmployeePinGate();

  // droits : si employee = null → admin (tous droits)
  const isAdmin = !employee;
  const canMod = isAdmin || !!employee?.can_modify;
  const canCnl = isAdmin || !!employee?.can_cancel;
  const canEnc = isAdmin || !!employee?.can_encash;

  const canAct = appt.status !== 'cancelled' && appt.status !== 'completed';

  /* formulaire édition */
  const [ef, setEf] = useState({
    date: appt.date || '',
    start_time: fmtTime(appt.start_time),
    status: appt.status,
    employee_id: appt.employee_id || '',
    client_name: appt.client_name || '',
    client_email: appt.client_email || '',
    client_phone: appt.client_phone || '',
    notes: appt.notes || '',
    cancel_reason: '',
  });
  const setE = (k, v) => setEf((p) => ({ ...p, [k]: v }));

  /* encaissement */
  const basePrice = parseFloat(appt.total_amount) || parseFloat(appt.service_price) || 0;
  const [checkAmt, setCheckAmt] = useState(basePrice > 0 ? basePrice.toFixed(2) : '');
  const [payMethod, setPayMethod] = useState('card');
  const [cnlNotify, setCnlNotify] = useState(true);

  const finalAmt = parseFloat(checkAmt) || 0;
  const st = STATUS_CFG[appt.status] || STATUS_CFG.confirmed;

  /* onglets disponibles */
  const TABS = [
    { id: 'detail', label: 'Détail' },
    canMod && canAct ? { id: 'edit', label: 'Modifier' } : null,
    canCnl && canAct ? { id: 'cancel', label: 'Annuler' } : null,
    canEnc && !appt.paid && canAct ? { id: 'checkout', label: 'Encaisser' } : null,
    isAdmin ? { id: 'delete', label: 'Supprimer' } : null,
  ].filter(Boolean);

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 14,
    background: t.inputBg,
    border: `0.5px solid ${t.borderInput}`,
    color: t.text,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const doEdit = async () => {
    setSaving(true);
    try {
      const dur = appt.total_duration || appt.duration_minutes || 30;
      const end = fromMin(toMin(ef.start_time) + dur);
      const upd = await bookingApi.updateAppt(appt.id, {
        date: ef.date,
        start_time: ef.start_time,
        end_time: end,
        status: ef.status,
        employee_id: ef.employee_id || null,
        client_name: ef.client_name,
        client_email: ef.client_email || null,
        client_phone: ef.client_phone || null,
        notes: ef.notes || null,
      });
      const merged = { ...appt, ...upd };
      setAppt(merged);
      onUpdated(merged);
      setTab('detail');
    } catch (e) {
      alert(e.message || 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  };

  const doCancel = async () => {
    setSaving(true);
    try {
      const upd = await bookingApi.updateAppt(appt.id, {
        status: 'cancelled',
        cancel_reason: ef.cancel_reason || null,
        notify_client: cnlNotify && !!appt.client_email,
      });
      const merged = { ...appt, ...upd, status: 'cancelled' };
      setAppt(merged);
      onUpdated(merged);
      setTab('detail');
    } catch (e) {
      alert(e.message || 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  };

  const doCheckout = async () => {
    await requestPin(employee || null, 'Encaisser le rendez-vous', async () => {
      setSaving(true);
      try {
        const payload = { payment_method: payMethod, amount: finalAmt };
        if (employee) payload.employee_id = employee.id;
        // AUDIT perms C : passe actingEmployeeId pour injecter header
        // x-employee-pin si token stocké — backend override body.employee_id
        // par req.employee.id (anti-spoofing).
        const res = await bookingApi.checkoutAppt(appt.id, payload, employee?.id);
        // Si le back a auto-validé un parrainage lié au RDV, remonter le
        // nouveau statut dans le state local pour que le badge agenda
        // passe de "À valider" à "Validé" immédiatement.
        const refPatch = res?.referral_validated ? { referral_status: 'validated' } : {};
        const merged = {
          ...appt,
          status: 'completed',
          paid: true,
          paid_method: payMethod,
          ...refPatch,
        };
        setAppt(merged);
        onUpdated(merged);
        if (res.transaction) onTxCreated(res.transaction);
        setTab('detail');
      } catch (e) {
        alert(e.message || 'Une erreur est survenue.');
      } finally {
        setSaving(false);
      }
    });
  };

  const doDelete = async () => {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm('Supprimer ce rendez-vous ?')) return;
    setSaving(true);
    try {
      await bookingApi.deleteAppt(appt.id);
      onDeleted(appt.id);
      onClose();
    } catch (e) {
      alert(e.message || 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal open={true} onClose={onClose} title="Rendez-vous" theme={t} maxW={520}>
        {/* Tabs */}
        {TABS.length > 1 && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: 3,
              borderRadius: 8,
              marginBottom: 14,
              background: t.cardAlt,
            }}
          >
            {TABS.map((tb) => {
              const active = tab === tb.id;
              return (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => setTab(tb.id)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: active ? 500 : 400,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: active ? t.card : 'transparent',
                    color: active ? t.text : t.muted,
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tb.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── DÉTAIL ── */}
        {tab === 'detail' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Badge statut */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 12,
                background: t.cardAlt,
                borderLeft: `2px solid ${st.accent}`,
              }}
            >
              <div>
                <p style={{ fontSize: 11, color: t.muted, margin: 0 }}>Réservation</p>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: t.text,
                    margin: '2px 0 0',
                    fontFamily: 'monospace',
                  }}
                >
                  #{(appt.id || '').substring(0, 8).toUpperCase()}
                </p>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  borderRadius: 8,
                  background: st.bg,
                  color: st.color,
                  fontWeight: 500,
                }}
              >
                {st.label}
              </span>
            </div>

            {/* Horaire + services */}
            <div style={{ borderRadius: 12, border: `0.5px solid ${t.border}`, overflow: 'hidden' }}>
              <InfoRow label="Date" value={fmtDateL(appt.date)} t={t} />
              <InfoRow
                label="Heure"
                value={`${fmtTime(appt.start_time)} — ${fmtTime(appt.end_time)}`}
                t={t}
                border
              />
              {appt.employee_name && (
                <InfoRow label="Employé" value={appt.employee_name} t={t} border />
              )}

              {appt.items && appt.items.length > 0 ? (
                <div style={{ borderTop: `0.5px solid ${t.separator || t.border}` }}>
                  <div style={{ padding: '8px 14px', background: t.cardAlt }}>
                    <p style={{ fontSize: 11, color: t.muted, margin: 0 }}>Services</p>
                  </div>
                  {appt.items.map((it, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderTop: `0.5px solid ${t.separator || t.border}`,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: t.text, margin: 0 }}>
                          {it.service_name}
                          {(it.qty || 1) > 1 && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 11,
                                padding: '1px 6px',
                                borderRadius: 99,
                                background: t.cardAlt,
                                color: t.muted,
                                fontWeight: 500,
                              }}
                            >
                              ×{it.qty}
                            </span>
                          )}
                        </p>
                        <p style={{ fontSize: 11, color: t.muted, margin: '2px 0 0' }}>
                          {it.duration_minutes * (it.qty || 1)}min
                        </p>
                      </div>
                      {(it.unit_price || 0) > 0 && (
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: t.text,
                            margin: 0,
                            marginLeft: 12,
                            fontFamily: 'monospace',
                          }}
                        >
                          {(parseFloat(it.unit_price) * (it.qty || 1)).toFixed(2)} €
                        </p>
                      )}
                    </div>
                  ))}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: '#f0fdf4',
                      borderTop: '0.5px solid #bbf7d0',
                    }}
                  >
                    <p style={{ fontSize: 12, color: '#065f46', fontWeight: 500, margin: 0 }}>
                      {appt.discount_amount > 0
                        ? appt.referral_use_id
                          ? 'Total après parrainage'
                          : 'Total après remise'
                        : 'Total'}
                    </p>
                    <div style={{ textAlign: 'right' }}>
                      {appt.discount_amount > 0 && (
                        <p
                          style={{
                            fontSize: 11,
                            color: t.muted,
                            textDecoration: 'line-through',
                            fontFamily: 'monospace',
                            margin: 0,
                          }}
                        >
                          {parseFloat(appt.original_amount || 0).toFixed(2)} €
                        </p>
                      )}
                      <p
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: '#065f46',
                          fontFamily: 'monospace',
                          margin: 0,
                        }}
                      >
                        {parseFloat(appt.total_amount || 0) > 0
                          ? parseFloat(appt.total_amount).toFixed(2)
                          : appt.items
                              .reduce((s, it) => s + parseFloat(it.unit_price || 0) * (it.qty || 1), 0)
                              .toFixed(2)}{' '}
                        €
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <InfoRow
                  label="Service"
                  value={`${appt.service_name || '-'}  ${appt.total_duration || appt.duration_minutes || '?'}min${
                    basePrice > 0 ? ' · ' + basePrice.toFixed(2) + ' €' : ''
                  }`}
                  t={t}
                  border
                />
              )}
            </div>

            {/* Client */}
            <div style={{ borderRadius: 12, border: `0.5px solid ${t.border}`, overflow: 'hidden' }}>
              <InfoRow label="Client" value={appt.client_name} t={t} />
              {appt.client_phone && (
                <InfoRow label="Téléphone" value={appt.client_phone} t={t} border />
              )}
              {appt.client_email && (
                <InfoRow label="Email" value={appt.client_email} t={t} border />
              )}
            </div>

            {/* Parrainage : traçabilité parrain + statut (pending/validated/cancelled) */}
            {appt.referral_use_id &&
              (() => {
                const parrainName =
                  [appt.referral_parrain_first_name, appt.referral_parrain_last_name]
                    .filter(Boolean)
                    .join(' ') ||
                  appt.referral_parrain_email ||
                  'Parrain';
                const refSt = appt.referral_status || 'pending';
                const refLabel =
                  refSt === 'validated'
                    ? 'Validé'
                    : refSt === 'cancelled'
                      ? 'Refusé'
                      : 'À valider en caisse';
                const refCfg =
                  refSt === 'validated'
                    ? { bg: '#f0fdf4', color: '#065f46', accent: '#10b981' }
                    : refSt === 'cancelled'
                      ? { bg: '#fef2f2', color: '#991b1b', accent: '#ef4444' }
                      : { bg: '#fffbeb', color: '#92400e', accent: '#f59e0b' };
                const discount = parseFloat(appt.discount_amount || 0);
                const refuseParrainage = async () => {
                  if (
                    !window.confirm(
                      "Refuser ce parrainage ? Le parrain ne sera pas récompensé. La réduction déjà appliquée au RDV reste acquise au filleul.",
                    )
                  )
                    return;
                  try {
                    await referralsApi.cancelUse(appt.referral_use_id);
                    const next = { ...appt, referral_status: 'cancelled' };
                    setAppt(next);
                    onUpdated(next);
                  } catch (e) {
                    alert(e.message || 'Erreur');
                  }
                };
                return (
                  <div
                    style={{
                      borderRadius: 12,
                      padding: 12,
                      background: '#eeedfe',
                      borderLeft: '2px solid #8b5cf6',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <p style={{ fontSize: 11, color: '#3c3489', margin: 0, fontWeight: 500 }}>
                        Parrainage
                      </p>
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 8,
                          background: refCfg.bg,
                          color: refCfg.color,
                          fontWeight: 500,
                        }}
                      >
                        {refLabel}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: t.text, margin: 0 }}>
                      Parrainé par {parrainName}
                    </p>
                    <p style={{ fontSize: 11, color: t.muted, margin: '2px 0 0' }}>
                      Code <span style={{ fontFamily: 'monospace', color: '#3c3489' }}>{appt.referral_code}</span>
                      {discount > 0 && (
                        <>
                          {' · Réduction parrainage '}
                          <span style={{ fontWeight: 500, color: '#065f46' }}>
                            -{discount.toFixed(2)} €
                          </span>
                        </>
                      )}
                    </p>
                    {refSt === 'pending' && (
                      <button
                        type="button"
                        onClick={refuseParrainage}
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          fontWeight: 500,
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: 'transparent',
                          color: '#991b1b',
                          border: '0.5px solid rgba(239,68,68,0.3)',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Refuser le parrainage
                      </button>
                    )}
                  </div>
                );
              })()}

            {appt.notes && (
              <div
                style={{
                  borderRadius: 12,
                  padding: 12,
                  background: '#fffbeb',
                  borderLeft: '2px solid #f59e0b',
                }}
              >
                <p style={{ fontSize: 11, color: '#92400e', margin: '0 0 4px', fontWeight: 500 }}>
                  Notes
                </p>
                <p style={{ fontSize: 13, color: t.text, margin: 0 }}>{appt.notes}</p>
              </div>
            )}
            {appt.cancel_reason && (
              <div
                style={{
                  borderRadius: 12,
                  padding: 12,
                  background: '#fef2f2',
                  borderLeft: '2px solid #ef4444',
                }}
              >
                <p style={{ fontSize: 11, color: '#991b1b', margin: '0 0 4px', fontWeight: 500 }}>
                  Motif d{"'"}annulation
                </p>
                <p style={{ fontSize: 13, color: t.text, margin: 0 }}>{appt.cancel_reason}</p>
              </div>
            )}
            {appt.paid && (
              <div
                style={{
                  borderRadius: 12,
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#f0fdf4',
                  borderLeft: '2px solid #10b981',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#10b981',
                    flexShrink: 0,
                  }}
                />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#065f46', margin: 0 }}>
                    Encaissé
                  </p>
                  <p style={{ fontSize: 11, color: t.muted, margin: '2px 0 0' }}>
                    {PAY_OPTS.find((p) => p.id === appt.paid_method)?.label || appt.paid_method}
                  </p>
                </div>
              </div>
            )}
            {TABS.length === 1 && employee && (
              <div
                style={{
                  borderRadius: 12,
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: t.cardAlt,
                  border: `0.5px solid ${t.border}`,
                }}
              >
                <p style={{ fontSize: 12, color: t.muted, margin: 0 }}>
                  Mode consultation — aucune action autorisée
                </p>
              </div>
            )}

            {/* Source du RDV (commit 25) — info discrète en bas de la modale.
                Lookup nom employé via prop employees pour la source 'employee'. */}
            {appt.source && (() => {
              const lookup = (employees || []).find(e => e.id === appt.created_by_employee_id);
              const empName = lookup?.name || appt.created_by_employee_name || 'un employé';
              const label =
                appt.source === 'public'    ? 'Réservé en ligne par le client'
              : appt.source === 'admin'     ? "Créé par l'administrateur"
              : appt.source === 'employee'  ? `Créé par ${empName} (tablette employé)`
              : appt.source === 'migration' ? 'Antérieur à la traçabilité'
              : null;
              if (!label) return null;
              return (
                <p style={{ fontSize: 11, color: '#6b7280', margin: '12px 0 0', fontStyle: 'italic' }}>
                  {label}
                </p>
              );
            })()}
          </div>
        )}

        {/* ── MODIFIER ── */}
        {tab === 'edit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <Label>Date *</Label>
                <input
                  type="date"
                  value={ef.date}
                  onChange={(e) => setE('date', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <Label>Heure *</Label>
                <input
                  type="time"
                  value={ef.start_time}
                  onChange={(e) => setE('start_time', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <Field label="Statut" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(STATUS_CFG).map(([k, v]) => {
                  const active = ef.status === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setE('status', k)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 500,
                        background: active ? v.bg : 'transparent',
                        borderLeft: active ? `2px solid ${v.accent}` : `0.5px solid ${t.border}`,
                        borderTop: active ? `0.5px solid ${v.bg}` : `0.5px solid ${t.border}`,
                        borderRight: active ? `0.5px solid ${v.bg}` : `0.5px solid ${t.border}`,
                        borderBottom: active ? `0.5px solid ${v.bg}` : `0.5px solid ${t.border}`,
                        color: active ? v.color : t.muted,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            {isAdmin && employees.length > 0 && (
              <Field label="Employé" style={{ marginBottom: 0 }}>
                <select
                  value={ef.employee_id}
                  onChange={(e) => setE('employee_id', e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Sans employé</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Nom client" style={{ marginBottom: 0 }}>
              <input
                value={ef.client_name}
                onChange={(e) => setE('client_name', e.target.value)}
                style={inputStyle}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Téléphone" style={{ marginBottom: 0 }}>
                <input
                  value={ef.client_phone}
                  onChange={(e) => setE('client_phone', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Email" style={{ marginBottom: 0 }}>
                <input
                  type="email"
                  value={ef.client_email}
                  onChange={(e) => setE('client_email', e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>
            <Field label="Notes" style={{ marginBottom: 0 }}>
              <textarea
                value={ef.notes}
                onChange={(e) => setE('notes', e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'none' }}
              />
            </Field>
            <Button
              fullWidth
              disabled={saving || !ef.client_name.trim()}
              onClick={doEdit}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        )}

        {/* ── ANNULER ── */}
        {tab === 'cancel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                borderRadius: 12,
                padding: 12,
                background: '#fef2f2',
                borderLeft: '2px solid #ef4444',
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 500, color: '#991b1b', margin: 0 }}>
                Annuler ce rendez-vous ?
              </p>
              <p style={{ fontSize: 11, color: t.muted, margin: '4px 0 0' }}>
                {appt.client_name} · {fmtDateL(appt.date)} à {fmtTime(appt.start_time)}
              </p>
            </div>
            <Field label="Motif (facultatif)" style={{ marginBottom: 0 }}>
              <textarea
                value={ef.cancel_reason}
                onChange={(e) => setE('cancel_reason', e.target.value)}
                rows={3}
                placeholder="Raison…"
                style={{ ...inputStyle, resize: 'none' }}
              />
            </Field>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 8,
                background: t.cardAlt,
              }}
            >
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: t.text, margin: 0 }}>
                  Notifier le client
                </p>
                <p style={{ fontSize: 11, color: t.muted, margin: '2px 0 0' }}>
                  {appt.client_email ? `→ ${appt.client_email}` : 'Aucun email'}
                </p>
              </div>
              <Toggle
                on={cnlNotify && !!appt.client_email}
                onChange={() => setCnlNotify((p) => !p)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setTab('detail')}
              >
                Retour
              </Button>
              <Button
                variant="danger"
                fullWidth
                disabled={saving}
                onClick={doCancel}
              >
                {saving ? '…' : 'Confirmer'}
              </Button>
            </div>
          </div>
        )}

        {/* ── ENCAISSER ── */}
        {tab === 'checkout' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ borderRadius: 12, border: `0.5px solid ${t.border}`, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: t.cardAlt,
                  borderBottom: `0.5px solid ${t.border}`,
                }}
              >
                <span style={{ fontSize: 11, color: t.muted }}>Client</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: t.text }}>
                  {appt.client_name}
                </span>
              </div>
              {appt.items && appt.items.length > 0 ? (
                appt.items.map((it, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderTop: i === 0 ? 'none' : `0.5px solid ${t.separator || t.border}`,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: t.text, margin: 0 }}>
                        {it.service_name}
                        {(it.qty || 1) > 1 && (
                          <span style={{ marginLeft: 4, fontSize: 11, color: t.muted }}>
                            ×{it.qty}
                          </span>
                        )}
                      </p>
                      <p style={{ fontSize: 11, color: t.muted, margin: '2px 0 0' }}>
                        {(it.duration_minutes || 0) * (it.qty || 1)}min
                      </p>
                    </div>
                    {(it.unit_price || 0) > 0 && (
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: t.text,
                          fontFamily: 'monospace',
                        }}
                      >
                        {(parseFloat(it.unit_price) * (it.qty || 1)).toFixed(2)} €
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ padding: '10px 14px' }}>
                  <p style={{ fontSize: 13, color: t.text, margin: 0 }}>
                    {appt.service_name || '-'}
                  </p>
                </div>
              )}
              {basePrice > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: '#f0fdf4',
                    borderTop: '0.5px solid #bbf7d0',
                  }}
                >
                  <p style={{ fontSize: 12, color: '#065f46', fontWeight: 500, margin: 0 }}>
                    Total
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#065f46',
                      fontFamily: 'monospace',
                      margin: 0,
                    }}
                  >
                    {basePrice.toFixed(2)} €
                  </p>
                </div>
              )}
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <Label style={{ marginBottom: 0 }}>Montant à encaisser</Label>
                {basePrice > 0 && checkAmt !== basePrice.toFixed(2) && (
                  <button
                    type="button"
                    onClick={() => setCheckAmt(basePrice.toFixed(2))}
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'transparent',
                      border: `0.5px solid ${t.border}`,
                      color: t.muted,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {basePrice.toFixed(2)} €
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={checkAmt}
                  onChange={(e) => setCheckAmt(e.target.value)}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    padding: '18px 16px',
                    borderRadius: 12,
                    fontSize: 32,
                    fontWeight: 500,
                    textAlign: 'center',
                    background: t.inputBg,
                    border: `0.5px solid ${t.borderInput}`,
                    color: t.text,
                    outline: 'none',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    right: 16,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: 18,
                    color: t.muted,
                    pointerEvents: 'none',
                  }}
                >
                  €
                </span>
              </div>
            </div>

            <div>
              <Label>Mode de paiement</Label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {PAY_OPTS.map((p) => {
                  const active = payMethod === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPayMethod(p.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 500,
                        background: active ? t.cardAlt : 'transparent',
                        border: `0.5px solid ${active ? t.borderStrong : t.border}`,
                        color: active ? t.text : t.muted,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{p.icon}</span>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              fullWidth
              size="large"
              disabled={saving || finalAmt < 0}
              onClick={doCheckout}
            >
              {saving
                ? '…'
                : `Encaisser${finalAmt > 0 ? ' — ' + finalAmt.toFixed(2) + ' €' : ''}`}
            </Button>
          </div>
        )}

        {/* ── SUPPRIMER ── */}
        {tab === 'delete' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                borderRadius: 12,
                padding: 14,
                background: '#fef2f2',
                borderLeft: '2px solid #ef4444',
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 500, color: '#991b1b', margin: 0 }}>
                Supprimer définitivement ce RDV ?
              </p>
              <p style={{ fontSize: 11, color: t.muted, margin: '4px 0 0' }}>
                {appt.client_name} · {fmtDateL(appt.date)} à {fmtTime(appt.start_time)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setTab('detail')}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                fullWidth
                disabled={saving}
                onClick={doDelete}
              >
                {saving ? '…' : 'Supprimer'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {PinModalNode}
    </>
  );
}
