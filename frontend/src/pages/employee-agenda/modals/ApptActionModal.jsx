// src/pages/employee-agenda/modals/ApptActionModal.jsx
import { useState } from 'react';
import { bookingApi, referralsApi } from '../../../utils/api';
import { Modal, Toast, useToast, Confirm } from '../../../components/UI';
import { Button, Label } from '../../../components/primitives';
import { useEmployeePinGate } from '../../../components/EmployeePinModal';
import { STATUS_CFG, PAY_OPTIONS } from '../constants';
import { fmtTime, fmtDateFull, toMin, fromMin } from '../helpers';
import Spin from '../components/Spin';
import Toggle from '../components/Toggle';
import InfoRow from '../components/InfoRow';

export default function ApptActionModal({ appt: initAppt, employee, services, onUpdated, onClose, onTxCreated, theme: t }) {
  const [appt, setAppt]     = useState(initAppt);
  const [tab, setTab]       = useState('detail');
  const [saving, setSaving] = useState(false);
  const [toast, showToast]  = useToast();
  const [confirmCancel, setConfirmCancel]   = useState(false);
  const [confirmRefuse, setConfirmRefuse]   = useState(false);
  const { requestPin, PinModalNode } = useEmployeePinGate();

  const [editForm, setEditForm] = useState({
    date: appt.date||'', start_time: fmtTime(appt.start_time),
    client_name: appt.client_name||'', client_email: appt.client_email||'',
    client_phone: appt.client_phone||'', notes: appt.notes||'',
  });
  const setE = (k,v) => setEditForm(p=>({...p,[k]:v}));

  const [cancelReason,  setCancelReason]  = useState('');
  const [cancelNotify,  setCancelNotify]  = useState(true);
  const [payMethod,     setPayMethod]     = useState('card');
  // Split paiement : 1 ou 2 méthodes max (suffit dans la grande majorité
  // des cas terrain). `splitMode=false` → encaissement single (UI inchangée).
  // `splitMode=true` → 2 lignes {method, amount}, somme doit égaler finalAmt.
  const [splitMode,     setSplitMode]     = useState(false);
  const [splitA,        setSplitA]        = useState({ method:'card', amount:'' });
  const [splitB,        setSplitB]        = useState({ method:'cash', amount:'' });

  const st       = STATUS_CFG[appt.status]||STATUS_CFG.confirmed;
  const canAct   = appt.status !== 'cancelled' && appt.status !== 'completed';
  const canModify = !employee || employee.can_modify;
  const canCancel = !employee || employee.can_cancel;
  const canEncash = !employee || employee.can_encash;
  const basePrice = parseFloat(appt.total_amount)||parseFloat(appt.service_price)||0;
  const [checkAmt, setCheckAmt] = useState(basePrice>0 ? basePrice.toFixed(2) : '');
  const finalAmt  = parseFloat(checkAmt)||0;
  const splitTotal = (parseFloat(splitA.amount)||0) + (parseFloat(splitB.amount)||0);
  const splitMatches = Math.abs(splitTotal - finalAmt) < 0.01;
  const splitDistinct = splitA.method !== splitB.method;
  const canCheckout = !saving && finalAmt > 0
    && (!splitMode || (splitMatches && splitDistinct
                       && (parseFloat(splitA.amount)||0) > 0
                       && (parseFloat(splitB.amount)||0) > 0));

  // Validation date/heure : interdit de déplacer un RDV dans le passé
  // (employé ou commerçant). Pour rétro-encaisser sans RDV, passer par la
  // caisse. La comparaison se fait en heure locale du navigateur.
  const nowLocal = new Date();
  const todayStr = nowLocal.toLocaleDateString('sv-SE');
  const nowHHMM = nowLocal.toTimeString().slice(0,5);
  const editIsPast = (() => {
    if (!editForm.date || !editForm.start_time) return false;
    if (editForm.date < todayStr) return true;
    if (editForm.date === todayStr && editForm.start_time < nowHHMM) return true;
    return false;
  })();

  const TABS = [
    { id:'detail',   label:'Details' },
    canModify && canAct ? { id:'edit',     label:'Modifier' } : null,
    canCancel && canAct ? { id:'cancel',   label:'Annuler'  } : null,
    canEncash && !appt.paid && canAct ? { id:'checkout', label:'Encaisser' } : null,
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

  const sectionCard = {
    background: t.card,
    border: `0.5px solid ${t.border}`,
    borderRadius: 12,
    overflow: 'hidden',
  };

  const doEdit = async () => {
    if (editIsPast) {
      showToast("Impossible de déplacer un RDV dans le passé. Passez par la caisse pour enregistrer une prestation déjà rendue.", 'error');
      return;
    }
    setSaving(true);
    try {
      const dur = appt.total_duration||appt.duration_minutes||30;
      const end = fromMin(toMin(editForm.start_time)+dur);
      const upd = await bookingApi.updateAppt(appt.id, {
        date: editForm.date,
        start_time: editForm.start_time,
        end_time: end,
        client_name: editForm.client_name,
        client_email: editForm.client_email||null,
        client_phone: editForm.client_phone||null,
        notes: editForm.notes||null,
      });
      const merged = {...appt,...upd}; setAppt(merged); onUpdated(merged); setTab('detail');
    } catch(e) { showToast(e.message || 'Une erreur est survenue.', 'error'); } finally { setSaving(false); }
  };

  // Detection RDV paye en ligne (Stripe Connect) -> declenchera un refund
  // automatique si le commercant annule. Le warning est affiche dans l'onglet
  // 'Annuler' pour que le merchant comprenne avant de confirmer.
  const wasPaidOnline = appt.payment_status === 'paid' && !!appt.stripe_payment_intent_id;
  const paidAmount = Number(appt.paid_amount_cents || 0) / 100;

  const doCancel = () => setConfirmCancel(true);
  const performCancel = async () => {
    setSaving(true);
    try {
      const upd = await bookingApi.updateAppt(appt.id, {
        status: 'cancelled',
        cancel_reason: cancelReason||null,
        notify_client: cancelNotify && !!appt.client_email,
      });
      const merged = {...appt,...upd, status:'cancelled', cancel_reason:cancelReason};
      setAppt(merged); onUpdated(merged); setTab('detail');

      // Toast informatif sur l'issue du refund (le backend a retourne
      // upd.refund = { ok, refunded?, error? }).
      if (upd?.refund) {
        if (upd.refund.refunded) {
          showToast(`RDV annule. Remboursement de ${paidAmount.toFixed(2)} € envoye au client.`, 'ok');
        } else if (upd.refund.ok === false) {
          showToast(`RDV annule mais le remboursement a echoue : ${upd.refund.error || 'erreur Stripe'}. Le support va le traiter.`, 'error');
        }
      }
    } catch(e) { showToast(e.message || 'Une erreur est survenue.', 'error'); } finally { setSaving(false); }
  };

  const performRefuseParrainage = async () => {
    try {
      await referralsApi.cancelUse(appt.referral_use_id);
      const next = { ...appt, referral_status: 'cancelled' };
      setAppt(next); onUpdated(next);
    } catch(e) { showToast(e.message || 'Erreur', 'error'); }
  };

  const doCheckout = async () => {
    await requestPin(
      employee || null,
      'Encaisser le rendez-vous',
      async () => {
        setSaving(true);
        try {
          // Split → array `payments`. Single → champ `payment_method`.
          // Le backend gère les 2 et insère transaction_payments si multi.
          const payments = splitMode
            ? [
                { method: splitA.method, amount: parseFloat(splitA.amount)||0 },
                { method: splitB.method, amount: parseFloat(splitB.amount)||0 },
              ]
            : [{ method: payMethod, amount: finalAmt }];
          const finalMethod = splitMode ? 'multi' : payMethod;
          const payload = {
            payment_method: finalMethod,
            amount: finalAmt,
            payments,
          };
          if (employee) payload.employee_id = employee.id;
          const res = await bookingApi.checkoutAppt(appt.id, payload, employee?.id);
          const refPatch = res?.referral_validated ? { referral_status: 'validated' } : {};
          const merged = {...appt, status:'completed', paid:true, paid_method:finalMethod, ...refPatch};
          setAppt(merged); onUpdated(merged);
          if (res.transaction) onTxCreated(res.transaction);
          setTab('detail');
        } catch(e) { showToast(e.message || 'Une erreur est survenue.', 'error'); } finally { setSaving(false); }
      }
    );
  };

  return (
    <>
    <Toast msg={toast?.msg} type={toast?.type}/>
    <Confirm
      open={confirmCancel}
      onClose={() => setConfirmCancel(false)}
      onConfirm={performCancel}
      title="Annuler ce rendez-vous ?"
      message={wasPaidOnline
        ? `Le client a payé ${paidAmount.toFixed(2)} € en ligne — un remboursement automatique de ce montant sera émis. Cette action est définitive.`
        : "Cette action est définitive."}
      danger
      theme={t}/>
    <Confirm
      open={confirmRefuse}
      onClose={() => setConfirmRefuse(false)}
      onConfirm={performRefuseParrainage}
      title="Refuser ce parrainage ?"
      message="Le parrain ne sera pas récompensé."
      danger
      theme={t}/>
    <Modal open={true} onClose={onClose} title="" theme={t} maxW={520}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header compact */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0, flex:1 }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: st.accent,
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 17,
            fontWeight: 500,
            color: t.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{appt.client_name}</span>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            padding: '3px 8px',
            borderRadius: 8,
            background: st.bg,
            color: st.color,
            flexShrink: 0,
          }}>{st.label}</span>
        </div>
        <span style={{
          fontSize: 11,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: t.muted,
        }}>#{(appt.id||'').substring(0,8).toUpperCase()}</span>
      </div>

      {/* Tab bar */}
      {TABS.length > 1 && (
        <div style={{
          display: 'flex',
          gap: 3,
          marginBottom: 18,
          background: t.cardAlt,
          padding: 3,
          borderRadius: 8,
        }}>
          {TABS.map(tb => {
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                style={{
                  flex: 1,
                  padding: '7px 6px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  background: active ? t.card : 'transparent',
                  color: active ? t.text : t.muted,
                  fontFamily: 'inherit',
                  transition: 'all .15s',
                }}
              >
                {tb.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── DETAIL ── */}
      {tab === 'detail' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Horaire card */}
          <div style={sectionCard}>
            <InfoRow icon={null} label="Date"  value={fmtDateFull(appt.date)} t={t} />
            <InfoRow icon={null} label="Heure" value={`${fmtTime(appt.start_time)} - ${fmtTime(appt.end_time)}`} t={t} border />

            {appt.items && appt.items.length > 0 ? (
              <>
                <div style={{
                  padding: '8px 16px 4px',
                  borderTop: `0.5px solid ${t.border}`,
                  background: t.cardAlt,
                }}>
                  <p style={{ margin:0, fontSize:11, fontWeight:500, color:t.muted }}>Services</p>
                </div>
                {appt.items.map((it, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderTop: `0.5px solid ${t.border}`,
                    gap: 8,
                  }}>
                    <div style={{ minWidth:0, flex:1 }}>
                      <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
                        {it.service_name}
                        {(it.qty||1) > 1 && (
                          <span style={{
                            marginLeft: 6,
                            fontSize: 11,
                            fontWeight: 500,
                            padding: '1px 6px',
                            borderRadius: 8,
                            background: t.cardAlt,
                            color: t.muted,
                          }}>×{it.qty}</span>
                        )}
                      </p>
                      <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
                        {it.duration_minutes}min
                        {(it.qty||1) > 1 ? ` · ${it.duration_minutes * (it.qty||1)}min total` : ''}
                      </p>
                    </div>
                    {(it.unit_price || 0) > 0 && (
                      <span style={{ fontSize:13, fontWeight:500, color:'#065f46' }}>
                        {(parseFloat(it.unit_price) * (it.qty||1)).toFixed(2)} €
                      </span>
                    )}
                  </div>
                ))}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 16px',
                  borderTop: `0.5px solid ${t.border}`,
                  background: '#f0fdf4',
                  borderLeft: '2px solid #10b981',
                }}>
                  <p style={{ margin:0, fontSize:11, fontWeight:500, color:'#065f46' }}>Total</p>
                  <p style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#065f46',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}>
                    {parseFloat(appt.total_amount || 0) > 0
                      ? parseFloat(appt.total_amount).toFixed(2)
                      : appt.items.reduce((s,it)=>s+parseFloat(it.unit_price||0)*(it.qty||1),0).toFixed(2)} €
                  </p>
                </div>
                {appt.discount_amount > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderTop: `0.5px solid ${t.border}`,
                    background: '#f0fdf4',
                    gap: 8,
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                      <div>
                        <p style={{ margin:0, fontSize:11, fontWeight:500, color: appt.referral_use_id ? '#3c3489' : '#065f46' }}>
                          {appt.referral_use_id ? 'Reduction parrainage' : 'Code promo'}
                        </p>
                        {appt.referral_use_id ? (
                          <p style={{ margin:0, fontSize:10, color:t.muted, fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                            {appt.referral_code}
                          </p>
                        ) : (appt.promo_code && (
                          <p style={{ margin:0, fontSize:10, color:t.muted, fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                            {appt.promo_code}
                          </p>
                        ))}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: '#991b1b',
                      background: '#fef2f2',
                      padding: '3px 10px',
                      borderRadius: 8,
                    }}>-{parseFloat(appt.discount_amount).toFixed(2)} €</span>
                  </div>
                )}
              </>
            ) : (
              <InfoRow
                icon={null}
                label="Service"
                value={`${appt.service_name||'-'} · ${appt.total_duration||appt.duration_minutes}min${basePrice>0?' · '+basePrice.toFixed(2)+' €':''}`}
                t={t}
                border
              />
            )}
          </div>

          {/* Client card */}
          <div style={sectionCard}>
            <InfoRow icon={null} label="Client"    value={appt.client_name} t={t} />
            {appt.client_phone && <InfoRow icon={null} label="Telephone" value={appt.client_phone} t={t} border />}
            {appt.client_email && <InfoRow icon={null} label="Email"     value={appt.client_email} t={t} border />}
          </div>

          {/* Parrainage */}
          {appt.referral_use_id && (() => {
            const parrainName = [appt.referral_parrain_first_name, appt.referral_parrain_last_name].filter(Boolean).join(' ')
              || appt.referral_parrain_email || 'Parrain';
            const rst = appt.referral_status || 'pending';
            const stLabel = rst==='validated' ? 'Valide' : rst==='cancelled' ? 'Refuse' : 'A valider en caisse';
            const stBg    = rst==='validated' ? '#f0fdf4' : rst==='cancelled' ? '#fef2f2' : '#fffbeb';
            const stColor = rst==='validated' ? '#065f46' : rst==='cancelled' ? '#991b1b' : '#92400e';
            const stAccent= rst==='validated' ? '#10b981' : rst==='cancelled' ? '#ef4444' : '#f59e0b';
            const refuseParrainage = () => setConfirmRefuse(true);
            return (
              <div style={{
                padding: '12px 16px',
                borderRadius: 12,
                background: '#eeedfe',
                borderLeft: '2px solid #8b5cf6',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <p style={{ margin:0, fontSize:11, fontWeight:500, color:'#3c3489' }}>Parrainage</p>
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '2px 8px',
                    borderRadius: 8,
                    background: stBg,
                    color: stColor,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}>
                    <span style={{ width:5, height:5, borderRadius:'50%', background:stAccent }} />
                    {stLabel}
                  </span>
                </div>
                <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>Parraine par {parrainName}</p>
                <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
                  Code <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', color:'#3c3489' }}>{appt.referral_code}</span>
                </p>
                {rst === 'pending' && (
                  <button
                    type="button"
                    onClick={refuseParrainage}
                    style={{
                      marginTop: 8,
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 500,
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
            <div style={{
              padding: '12px 16px',
              borderRadius: 12,
              background: '#fffbeb',
              borderLeft: '2px solid #f59e0b',
            }}>
              <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:500, color:'#92400e' }}>Notes</p>
              <p style={{ margin:0, fontSize:13, color:t.text, lineHeight:1.5 }}>{appt.notes}</p>
            </div>
          )}
          {/* ── Bloc tracabilite annulation (priorite haute) ─────────────────
              Affiche tout le contexte d'une annulation en 1 bloc lisible :
              qui a annule + quand + statut refund + montant + motif. Evite
              les blocs disparates 'Motif' + 'Encaisse' (qui faisait apparaitre
              'null · Source : RDV' a tort sur les RDV payes online refundes).
              Visible UNIQUEMENT si status='cancelled'. */}
          {appt.status === 'cancelled' && (() => {
            // Format date+heure FR : '8 mai 2026 à 14:32'
            const fmtDateTime = (iso) => {
              if (!iso) return null;
              try {
                const d = new Date(iso);
                if (isNaN(d.getTime())) return null;
                return d.toLocaleString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                }).replace(',', ' à').replace(/:/, 'h').replace(/h(\d{2})$/, 'h$1');
              } catch { return null; }
            };
            const cancelledByLabel = appt.cancelled_by === 'merchant'
              ? 'le salon'
              : appt.cancelled_by === 'client'
                ? 'le client'
                : appt.cancelled_by === 'system'
                  ? 'le système (no-show)'
                  : null;
            const cancelDateLabel = fmtDateTime(appt.cancelled_at) || fmtDateTime(appt.updated_at);
            const cents = Number(appt.paid_amount_cents || 0);
            const eur = (cents / 100).toFixed(2).replace('.', ',');
            const wasRefunded = appt.payment_status === 'refunded';
            const wasPaidNotRefunded = appt.payment_status === 'paid' && cents > 0;

            return (
              <div style={{
                padding: '12px 16px',
                borderRadius: 12,
                background: '#fef2f2',
                borderLeft: '2px solid #ef4444',
                display:'flex', flexDirection:'column', gap:6,
              }}>
                <p style={{ margin:0, fontSize:11, fontWeight:500, color:'#991b1b',
                            textTransform:'uppercase', letterSpacing:'0.04em' }}>
                  Rendez-vous annulé
                </p>
                {/* Ligne 1 : qui a annule + quand */}
                <p style={{ margin:0, fontSize:13, color:t.text, lineHeight:1.5 }}>
                  {cancelledByLabel
                    ? <>Annulé par <strong style={{ fontWeight:500 }}>{cancelledByLabel}</strong></>
                    : 'Annulé'}
                  {cancelDateLabel && <> {`le ${cancelDateLabel}`}</>}
                </p>
                {/* Ligne 2 : statut refund / acompte conserve */}
                {wasRefunded && cents > 0 && (
                  <p style={{ margin:0, fontSize:13, color:'#065f46', fontWeight:500 }}>
                    Remboursement intégral de {eur} € effectué
                    {cancelDateLabel && <> le {cancelDateLabel}</>}
                  </p>
                )}
                {wasPaidNotRefunded && (
                  <p style={{ margin:0, fontSize:13, color:'#92400e', fontWeight:500 }}>
                    Acompte de {eur} € conservé par le salon (politique no-show)
                  </p>
                )}
                {!wasRefunded && !wasPaidNotRefunded && (
                  <p style={{ margin:0, fontSize:12, color:t.muted }}>
                    Aucun paiement en ligne associé à ce RDV.
                  </p>
                )}
                {/* Ligne 3 : motif (si renseigne) */}
                {appt.cancel_reason && (
                  <p style={{ margin:'2px 0 0', fontSize:12, color:t.muted, lineHeight:1.5 }}>
                    <strong style={{ fontWeight:500, color:t.text }}>Motif :</strong>{' '}
                    {appt.cancel_reason}
                  </p>
                )}
              </div>
            );
          })()}

          {/* ── Blocs paiement (visibles uniquement si NON annule) ──────────
              Refactor pour eviter le bug 'null · Source : RDV' : on n'affiche
              le moyen de paiement que s'il est present, et l'ordre des
              conditions priorise refunded > paid online > paid manuel. */}
          {appt.status !== 'cancelled' && appt.paid && (() => {
            const isOnline = appt.payment_status === 'paid' && !!appt.stripe_payment_intent_id;
            const cents = Number(appt.paid_amount_cents || 0);
            const eur = cents > 0 ? (cents / 100).toFixed(2) : null;
            const methodLabel = appt.paid_method
              ? (PAY_OPTIONS.find(p => p.id === appt.paid_method)?.label || appt.paid_method)
              : null;
            return (
              <div style={{
                padding: '12px 16px', borderRadius: 12,
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#f0fdf4',
                borderLeft: '2px solid #10b981',
              }}>
                <div>
                  <p style={{ margin:0, fontSize:13, fontWeight:500, color:'#065f46' }}>
                    {isOnline ? 'Payé en ligne' : 'Encaissé'}
                  </p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
                    {isOnline
                      ? `Stripe${eur ? ` · ${eur} €` : ''}`
                      : methodLabel
                        ? `${methodLabel}${eur ? ` · ${eur} €` : ''} · Source : RDV`
                        : `Source : RDV${eur ? ` · ${eur} €` : ''}`}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Acompte paye en ligne : merchant doit encaisser le reste */}
          {appt.status !== 'cancelled' && !appt.paid
            && appt.payment_status === 'paid'
            && appt.stripe_payment_intent_id && appt.paid_amount_cents > 0 && (
            <div style={{
              padding: '12px 16px', borderRadius: 12,
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#eff6ff', borderLeft: '2px solid #2563eb',
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#1e3a8a' }}>
                  {`Acompte payé · ${(Number(appt.paid_amount_cents) / 100).toFixed(2)} €`}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: t.muted }}>
                  {`Reste à encaisser : ${Math.max(0, Number(appt.total_amount || 0) - Number(appt.paid_amount_cents)/100).toFixed(2)} € · Stripe`}
                </p>
              </div>
            </div>
          )}

          {/* Paiement Stripe Connect echoue (statut intermediaire) */}
          {appt.status !== 'cancelled' && !appt.paid
            && appt.payment_status === 'failed' && (
            <div style={{
              padding: '12px 16px', borderRadius: 12,
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#fef2f2', borderLeft: '2px solid #dc2626',
            }}>
              <div>
                <p style={{ margin:0, fontSize:13, fontWeight:500, color:'#991b1b' }}>
                  {"Paiement en ligne échoué"}
                </p>
              </div>
            </div>
          )}
          {TABS.length === 1 && employee && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: t.cardAlt,
              border: `0.5px solid ${t.border}`,
            }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:t.dim }} />
              <p style={{ margin:0, fontSize:12, color:t.muted }}>
                Mode consultation — aucune action autorisee pour votre profil
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── MODIFIER ── */}
      {tab === 'edit' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <Label>Date *</Label>
              <input type="date" min={todayStr} value={editForm.date}
                onChange={e=>setE('date',e.target.value)} style={inputStyle} />
            </div>
            <div>
              <Label>Heure *</Label>
              <input type="time" value={editForm.start_time}
                min={editForm.date === todayStr ? nowHHMM : undefined}
                onChange={e=>setE('start_time',e.target.value)} style={inputStyle} />
            </div>
          </div>
          {editIsPast && (
            <div style={{ padding:'10px 12px', borderRadius:8,
              background:'rgba(239,68,68,0.08)',
              border:'0.5px solid rgba(239,68,68,0.3)',
              borderLeft:'2px solid #ef4444' }}>
              <p style={{ margin:0, fontSize:12, color:'#991b1b', fontWeight:500 }}>
                Vous ne pouvez pas déplacer un RDV à une date ou heure passée.
              </p>
              <p style={{ margin:'4px 0 0', fontSize:11, color:'#991b1b' }}>
                Pour enregistrer une prestation déjà rendue, passez par la caisse.
              </p>
            </div>
          )}
          <div>
            <Label>Nom client</Label>
            <input value={editForm.client_name} onChange={e=>setE('client_name',e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <Label>Telephone</Label>
              <input value={editForm.client_phone} onChange={e=>setE('client_phone',e.target.value)} placeholder="06…" style={inputStyle} />
            </div>
            <div>
              <Label>Email</Label>
              <input type="email" value={editForm.client_email} onChange={e=>setE('client_email',e.target.value)} placeholder="email@…" style={inputStyle} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <textarea value={editForm.notes} onChange={e=>setE('notes',e.target.value)} rows={2} style={{ ...inputStyle, resize:'none' }} />
          </div>
          <Button fullWidth disabled={saving || !editForm.client_name.trim() || editIsPast} onClick={doEdit}>
            {saving ? (
              <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <Spin size={16}/> Enregistrement...
              </span>
            ) : 'Enregistrer'}
          </Button>
        </div>
      )}

      {/* ── ANNULER ── */}
      {tab === 'cancel' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: '#fef2f2',
            borderLeft: '2px solid #ef4444',
          }}>
            <p style={{ margin:0, fontSize:13, fontWeight:500, color:'#991b1b' }}>Annuler ce rendez-vous ?</p>
            <p style={{ margin:'4px 0 0', fontSize:12, color:t.muted }}>
              {appt.client_name} · {fmtDateFull(appt.date)} a {fmtTime(appt.start_time)}
            </p>
          </div>

          {/* Warning refund automatique : le RDV a ete paye en ligne par le
              client. Annulation par le commercant -> refund Stripe automatique
              sur le compte Connect du salon (impossible a bypasser, faute du
              salon = client doit etre rembourse). Bandeau ambre pour signaler
              clairement les consequences avant la confirmation. */}
          {wasPaidOnline && (
            <div style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: '#fffbeb',
              border: '0.5px solid #fde68a',
              borderLeft: '2px solid #d97706',
            }}>
              <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:500, color:'#92400e' }}>
                Remboursement automatique
              </p>
              <p style={{ margin:0, fontSize:12, color:'#92400e', lineHeight:1.55 }}>
                Le client a payé <strong style={{ fontWeight:500 }}>{paidAmount.toFixed(2)} €</strong> en
                ligne. Comme l&apos;annulation vient du salon, un remboursement
                intégral sera émis automatiquement vers la carte du client
                depuis votre compte Stripe.
              </p>
            </div>
          )}
          <div>
            <Label>Motif (facultatif)</Label>
            <textarea
              value={cancelReason}
              onChange={e=>setCancelReason(e.target.value)}
              rows={3}
              placeholder="Raison de l'annulation…"
              style={{ ...inputStyle, resize:'none' }}
            />
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderRadius: 12,
            background: t.cardAlt,
            border: `0.5px solid ${t.border}`,
          }}>
            <div>
              <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>Notifier le client</p>
              <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
                {appt.client_email ? `→ ${appt.client_email}` : 'Aucun email renseigne'}
              </p>
            </div>
            <Toggle on={cancelNotify && !!appt.client_email} onChange={()=>setCancelNotify(p=>!p)} />
          </div>
          {cancelNotify && appt.client_email && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: '#fffbeb',
              borderLeft: '2px solid #f59e0b',
            }}>
              <p style={{ margin:0, fontSize:12, color:'#92400e' }}>
                Email d{"'"}annulation envoye a {appt.client_email}
              </p>
            </div>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="secondary" fullWidth onClick={()=>setTab('detail')}>Retour</Button>
            <Button variant="danger" fullWidth onClick={doCancel} disabled={saving}>
              {saving ? 'Annulation...' : 'Confirmer'}
            </Button>
          </div>
        </div>
      )}

      {/* ── ENCAISSER ── */}
      {tab === 'checkout' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Recap */}
          <div style={sectionCard}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              background: t.cardAlt,
              borderBottom: `0.5px solid ${t.border}`,
            }}>
              <span style={{ fontSize:11, fontWeight:500, color:t.muted }}>Client</span>
              <span style={{ fontSize:17, fontWeight:500, color:t.text }}>{appt.client_name}</span>
            </div>
            {appt.items && appt.items.length > 0 ? (
              <>
                {appt.items.map((it, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderTop: `0.5px solid ${t.border}`,
                    gap: 8,
                  }}>
                    <div style={{ minWidth:0, flex:1 }}>
                      <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
                        {it.service_name}
                        {(it.qty||1) > 1 && <span style={{ marginLeft:4, fontSize:11, color:t.muted }}>×{it.qty}</span>}
                      </p>
                      <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
                        {(it.duration_minutes||0) * (it.qty||1)}min
                      </p>
                    </div>
                    {(it.unit_price || 0) > 0 && (
                      <span style={{ fontSize:13, fontWeight:500, color:'#065f46' }}>
                        {(parseFloat(it.unit_price) * (it.qty||1)).toFixed(2)} €
                      </span>
                    )}
                  </div>
                ))}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 16px',
                  borderTop: `0.5px solid ${t.border}`,
                  background: '#f0fdf4',
                  borderLeft: '2px solid #10b981',
                }}>
                  <span style={{ fontSize:11, fontWeight:500, color:'#065f46' }}>Total</span>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#065f46',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}>{basePrice.toFixed(2)} €</span>
                </div>
              </>
            ) : (
              <div style={{ padding:'10px 16px', borderTop:`0.5px solid ${t.border}` }}>
                <p style={{ margin:0, fontSize:13, color:t.text }}>{appt.service_name||'-'}</p>
              </div>
            )}
          </div>

          {/* Montant */}
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <p style={{ margin:0, fontSize:11, fontWeight:500, color:t.muted }}>Montant a encaisser</p>
              {basePrice > 0 && checkAmt !== basePrice.toFixed(2) && (
                <button
                  type="button"
                  onClick={() => setCheckAmt(basePrice.toFixed(2))}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '4px 10px',
                    borderRadius: 8,
                    background: 'transparent',
                    color: t.text,
                    border: `0.5px solid ${t.borderStrong}`,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Reset {basePrice.toFixed(2)} €
                </button>
              )}
            </div>
            <div style={{ position:'relative' }}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={checkAmt}
                onChange={e=>setCheckAmt(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  padding: '20px 48px 20px 20px',
                  fontSize: 32,
                  fontWeight: 500,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  textAlign: 'center',
                  background: '#f0fdf4',
                  border: '0.5px solid rgba(16,185,129,0.3)',
                  borderRadius: 12,
                  color: '#065f46',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{
                position: 'absolute',
                right: 18,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 20,
                fontWeight: 500,
                color: 'rgba(16,185,129,0.5)',
                pointerEvents: 'none',
              }}>€</span>
            </div>
            {checkAmt !== '' && basePrice > 0 && parseFloat(checkAmt) !== basePrice && (
              <p style={{ margin:'6px 0 0', fontSize:11, textAlign:'center', color:'#92400e' }}>
                Montant modifié — base : {basePrice.toFixed(2)} € · ce nouveau montant sera utilisé pour la fidélité et l'historique du client.
              </p>
            )}
          </div>

          {/* Toggle Single / Split */}
          <div style={{ display:'flex', gap:8 }}>
            <button type="button" onClick={() => setSplitMode(false)}
              style={{ flex:1, padding:'10px', borderRadius:8, fontSize:12,
                fontWeight:500, cursor:'pointer', fontFamily:'inherit',
                background: !splitMode ? t.text : 'transparent',
                color: !splitMode ? t.bg : t.text,
                border: `0.5px solid ${t.border}` }}>
              Paiement simple
            </button>
            <button type="button" onClick={() => {
              setSplitMode(true);
              if (!splitA.amount && !splitB.amount && finalAmt > 0) {
                const half = (finalAmt / 2).toFixed(2);
                setSplitA(p => ({ ...p, amount: half }));
                setSplitB(p => ({ ...p, amount: (finalAmt - parseFloat(half)).toFixed(2) }));
              }
            }}
              style={{ flex:1, padding:'10px', borderRadius:8, fontSize:12,
                fontWeight:500, cursor:'pointer', fontFamily:'inherit',
                background: splitMode ? t.text : 'transparent',
                color: splitMode ? t.bg : t.text,
                border: `0.5px solid ${t.border}` }}>
              Paiement en 2 fois
            </button>
          </div>

          {/* Mode paiement */}
          {!splitMode ? (
            <div>
              <Label>Mode de paiement</Label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {PAY_OPTIONS.map(p => {
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
                        padding: '12px 14px',
                        borderRadius: 8,
                        fontWeight: 500,
                        fontSize: 13,
                        cursor: 'pointer',
                        background: active ? '#f0fdf4' : 'transparent',
                        border: `0.5px solid ${active ? 'rgba(16,185,129,0.3)' : t.border}`,
                        color: active ? '#065f46' : t.text,
                        fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ fontSize:16 }}>{p.icon}</span>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <Label>Répartition (2 méthodes distinctes)</Label>
              {[{ key:'A', state:splitA, set:setSplitA, label:'Méthode 1' },
                { key:'B', state:splitB, set:setSplitB, label:'Méthode 2' }].map(row => (
                <div key={row.key} style={{ display:'grid', gridTemplateColumns:'1fr 110px', gap:8, alignItems:'center' }}>
                  <select value={row.state.method}
                    onChange={e => row.set(p => ({ ...p, method: e.target.value }))}
                    style={{ ...inputStyle, padding:'10px 12px' }}>
                    {PAY_OPTIONS.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  <div style={{ position:'relative' }}>
                    <input type="number" step="0.01" min="0"
                      value={row.state.amount}
                      onChange={e => row.set(p => ({ ...p, amount: e.target.value }))}
                      placeholder="0.00"
                      style={{ ...inputStyle, paddingRight:28, textAlign:'right',
                        fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}/>
                    <span style={{ position:'absolute', right:10, top:'50%',
                      transform:'translateY(-50%)', fontSize:13, color:t.muted,
                      pointerEvents:'none' }}>€</span>
                  </div>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between',
                fontSize:12, padding:'8px 12px', borderRadius:8,
                background: splitMatches && splitDistinct ? '#f0fdf4' : 'rgba(245,158,11,0.08)',
                border: `0.5px solid ${splitMatches && splitDistinct ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                <span style={{ color: splitMatches ? '#065f46' : '#92400e', fontWeight:500 }}>
                  {!splitDistinct ? 'Choisissez 2 méthodes différentes' :
                   splitMatches ? 'Total OK' : `Écart : ${(splitTotal - finalAmt).toFixed(2)} €`}
                </span>
                <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: splitMatches ? '#065f46' : '#92400e', fontWeight:500 }}>
                  {splitTotal.toFixed(2)} / {finalAmt.toFixed(2)} €
                </span>
              </div>
            </div>
          )}

          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: t.cardAlt,
            border: `0.5px solid ${t.border}`,
          }}>
            <p style={{ margin:0, fontSize:12, color:t.muted }}>
              La transaction sera ajoutée dans la <span style={{ color:t.text, fontWeight:500 }}>Caisse</span> avec la source <span style={{ color:t.text, fontWeight:500 }}>RDV</span>. Le montant final est aussi pris en compte par la fidélité et le profil client.
            </p>
          </div>

          <Button
            fullWidth
            size="large"
            onClick={doCheckout}
            disabled={!canCheckout}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
          >
            {saving ? (<><Spin size={18}/>Encaissement…</>) : `Encaisser${finalAmt > 0 ? ' - ' + finalAmt.toFixed(2) + ' €' : ''}`}
          </Button>
        </div>
      )}
    </Modal>
    {PinModalNode}
    </>
  );
}
