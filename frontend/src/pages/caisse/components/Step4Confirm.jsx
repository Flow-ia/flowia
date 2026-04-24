// Caisse > Encaisser > Step 4 · Confirmation.
// Récap complet + bouton Valider. Gate PIN employé via useEmployeePinGate
// (même hook qu'EncaisserSheet, TTL 5 min sessionStorage). Contrat API
// POST /api/transactions strictement identique à EncaisserSheet pour que
// idempotency_key (UNIQUE user_id + key), multi-items (transaction_items),
// multi-paiements (transaction_payments method='multi') et audit_log
// (snapshot_before/after) soient enregistrés à l'identique côté back.
// signed_by_employee_id via employeePinOptional quand PIN employé actif.
import { useState } from 'react';
import { referralsApi } from '../../../utils/api';
import { useEmployeePinGate } from '../../../components/EmployeePinModal';
import { todayStr, nowStr } from '../../../utils/dates';
import { Icon } from '../../../components/Icon';

const PM_CFG = {
  cash:     { label: 'Espèces',  text: '#065f46', bg: '#f0fdf4' },
  card:     { label: 'Carte',    text: '#4338ca', bg: '#eef2ff' },
  transfer: { label: 'Virement', text: '#0e7490', bg: '#ecfeff' },
  other:    { label: 'Autre',    text: '#92400e', bg: '#fffbeb' },
};

function fmt(n) { return Number(n || 0).toFixed(2); }

export default function Step4Confirm({
  theme: t, cart, employees,
  empId, payMethod, splitMode, splitAmts,
  promoCode, promoData, clientEmail, clientName, clientNote,
  selectedRewardId, onAdd, onBack, onSuccess, showToast,
}) {
  const { requestPin, PinModalNode } = useEmployeePinGate();
  const [busy, setBusy] = useState(false);

  const total = cart.reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);
  const discount   = parseFloat(promoData?.discount || 0);
  const finalTotal = Math.max(0, total - discount);

  const paymentsEntries = splitMode
    ? Object.entries(splitAmts)
        .map(([method, raw]) => ({ method, amount: parseFloat(raw) || 0 }))
        .filter(p => p.amount > 0)
    : [{ method: payMethod, amount: finalTotal }];

  const emp = employees?.find(e => e.id === empId) || null;

  const doConfirm = async () => {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    // idempotency_key UUID — double-clic = même UUID = même transaction.
    const idemKey = (crypto?.randomUUID?.() || (Date.now() + '-' + Math.random().toString(36).slice(2)));
    const date = todayStr(), time = nowStr();
    try {
      const desc = cart.length === 1
        ? cart[0].name
        : cart.map(i => i.name).join(', ');
      const items = cart.map(i => ({
        service_name: i.name,
        qty:          i.qty,
        unit_price:   parseFloat(fmt(i.price)),
      }));
      const primaryMethod = paymentsEntries.length === 1
        ? paymentsEntries[0].method
        : 'multi';

      await onAdd({
        type:            'revenue',
        amount:          finalTotal,
        category_id:     cart.length === 1 ? cart[0].category_id : null,
        employee_id:     empId || null,
        payment_method:  primaryMethod,
        payments:        paymentsEntries,
        items,
        description:     desc,
        date, time,
        datetime_iso:    new Date(date + 'T' + time).toISOString(),
        promo_code_id:   promoData?.source === 'referral' ? null : (promoData?.promo?.id || null),
        referral_code:   promoData?.source === 'referral' ? (promoCode || '').trim().toUpperCase() : undefined,
        discount_amount: discount || 0,
        original_amount: total,
        client_note:     (clientNote  || '').trim() || null,
        client_email:    (clientEmail || '').trim() || null,
        client_name:     (clientName  || '').trim() || null,
        idempotency_key: idemKey,
      });

      if (selectedRewardId) {
        try { await referralsApi.useReward(selectedRewardId); } catch { /* non-bloquant */ }
      }
      if (showToast) showToast('Encaissement enregistré', 'ok');
      onSuccess && onSuccess();
    } catch (e) {
      if (showToast) showToast(e.message || "Erreur lors de l'encaissement", 'error');
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (cart.length === 0 || busy) return;
    await requestPin(emp, "Encaisser le paiement", doConfirm);
  };

  const card = {
    padding: 14, borderRadius: 12, background: t.card,
    border: `0.5px solid ${t.border}`,
    display: 'flex', flexDirection: 'column', gap: 10,
  };
  const title = { margin: 0, fontSize: 13, fontWeight: 500, color: t.text };

  return (
    <>
      <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: 14 }}>
        {/* Récap gauche : items + client */}
        <div style={card}>
          <p style={title}>{"Récapitulatif"}</p>
          <div>
            {cart.map((it, idx) => (
              <div key={idx}
                   style={{ display:'flex', justifyContent:'space-between',
                            padding:'8px 0',
                            borderBottom:`0.5px solid ${t.separator}`,
                            fontSize:13 }}>
                <div style={{ minWidth:0 }}>
                  <p style={{ margin:0, color:t.text, fontWeight:500,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {it.name}
                  </p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
                    {"× " + it.qty + " · " + fmt(it.price) + " €"}
                  </p>
                </div>
                <span style={{ color:t.text, fontWeight:500,
                               fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {fmt(it.price * it.qty) + " €"}
                </span>
              </div>
            ))}
          </div>

          {emp && (
            <div style={{ display:'flex', alignItems:'center', gap:8,
                          padding:'8px 0' }}>
              <div style={{ width:28, height:28, borderRadius:99,
                            background: emp.avatar_color || '#6b7280', color:'#fff',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:12, fontWeight:500 }}>
                {(emp.name || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <p style={{ margin:0, fontSize:12, fontWeight:500, color:t.text }}>{emp.name}</p>
                <p style={{ margin:0, fontSize:11, color:t.muted }}>{"Employé signataire"}</p>
              </div>
            </div>
          )}

          {(clientName || clientEmail) && (
            <div style={{ padding:'8px 0', borderTop:`0.5px solid ${t.separator}` }}>
              <p style={{ margin:0, fontSize:11, color:t.muted, textTransform:'uppercase',
                          letterSpacing:'0.04em', fontWeight:500 }}>{"Client"}</p>
              <p style={{ margin:'3px 0 0', fontSize:13, color:t.text, fontWeight:500 }}>
                {clientName || '—'}
              </p>
              {clientEmail && (
                <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>{clientEmail}</p>
              )}
            </div>
          )}

          {clientNote && (
            <div style={{ padding:'8px 0', borderTop:`0.5px solid ${t.separator}` }}>
              <p style={{ margin:0, fontSize:11, color:t.muted, textTransform:'uppercase',
                          letterSpacing:'0.04em', fontWeight:500 }}>{"Note interne"}</p>
              <p style={{ margin:'3px 0 0', fontSize:12, color:t.text, whiteSpace:'pre-wrap' }}>
                {clientNote}
              </p>
            </div>
          )}
        </div>

        {/* Récap droite : paiements + total */}
        <div style={card}>
          <p style={title}>{"Paiements"}</p>

          {paymentsEntries.length === 0 ? (
            <p style={{ margin:0, fontSize:12, color:t.muted }}>{"Aucun paiement saisi."}</p>
          ) : paymentsEntries.map((p, idx) => {
            const cfg = PM_CFG[p.method] || PM_CFG.other;
            return (
              <div key={idx}
                   style={{ padding:10, borderRadius:8,
                            background: cfg.bg, borderLeft:'2px solid ' + cfg.text,
                            display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:12, fontWeight:500, color: cfg.text }}>{cfg.label}</span>
                <span style={{ fontSize:13, fontWeight:500, color: cfg.text,
                               fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {fmt(p.amount) + " €"}
                </span>
              </div>
            );
          })}

          <div style={{ marginTop:4, padding:12, borderRadius:8, background: t.cardAlt,
                        display:'flex', flexDirection:'column', gap:4, fontSize:11 }}>
            <div style={{ display:'flex', justifyContent:'space-between', color: t.muted }}>
              <span>{"Total panier"}</span>
              <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{fmt(total)} €</span>
            </div>
            {discount > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', color:'#9a3412' }}>
                <span>{"Remise" + (promoCode ? ' · ' + promoCode : '')}</span>
                <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{"−" + fmt(discount)} €</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between',
                          fontSize:15, fontWeight:500, color:t.text,
                          borderTop:`0.5px solid ${t.separator}`, paddingTop:6, marginTop:4 }}>
              <span>{"À encaisser"}</span>
              <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{fmt(finalTotal)} €</span>
            </div>
          </div>

          <p style={{ margin:0, fontSize:10, color:t.muted }}>
            {"Le PIN employé sera exigé avant enregistrement. Un idempotency_key UUID protège contre les doubles validations."}
          </p>

          <div style={{ display:'flex', gap:8, justifyContent:'space-between' }}>
            <button onClick={onBack} disabled={busy}
                    style={{ padding:'10px 14px', borderRadius:8,
                             border:`0.5px solid ${t.border}`,
                             background:t.cardAlt, color:t.text,
                             cursor: busy ? 'wait' : 'pointer', fontFamily:'inherit',
                             fontSize:12, fontWeight:500,
                             display:'inline-flex', alignItems:'center', gap:6 }}>
              <Icon name="chevronLeft" size={13} color={t.text}/>
              {"Retour"}
            </button>
            <button onClick={confirm} disabled={busy || cart.length === 0 || !empId}
                    style={{ padding:'12px 18px', borderRadius:8, border:'none',
                             background: busy ? t.cardAlt : '#10b981',
                             color: busy ? t.muted : '#fff',
                             cursor: busy ? 'wait' : 'pointer',
                             fontFamily:'inherit', fontSize:13, fontWeight:500,
                             display:'inline-flex', alignItems:'center', gap:6 }}>
              <Icon name="zap" size={13} color={busy ? t.muted : '#fff'}/>
              {busy ? 'Enregistrement…' : 'Valider ' + fmt(finalTotal) + ' €'}
            </button>
          </div>
        </div>
      </div>
      {PinModalNode}
    </>
  );
}
