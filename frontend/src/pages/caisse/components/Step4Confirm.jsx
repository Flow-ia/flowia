// Caisse > Encaisser > Step 4 · Confirmation.
// Récap complet + bouton Valider. Gate PIN employé via useEmployeePinGate
// (même hook qu'EncaisserSheet, TTL 5 min sessionStorage). Contrat API
// POST /api/transactions strictement identique à EncaisserSheet pour que
// idempotency_key (UNIQUE user_id + key), multi-items (transaction_items),
// multi-paiements (transaction_payments method='multi') et audit_log
// (snapshot_before/after) soient enregistrés à l'identique côté back.
// signed_by_employee_id via employeePinOptional quand PIN employé actif.
//
// UX commit 7e : après le POST réussi, on n'enchaîne plus directement le
// reset du flow. On affiche un grand écran de succès local (cercle vert
// 80×80, scale-in, récap synthétique, 2 boutons + auto-redirect 8 s vers
// l'étape 1). Le toast et le rafraîchissement du dashboard via `onAdd`
// continuent à se déclencher en arrière-plan inchangés.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { referralsApi } from '../../../utils/api';
import { useEmployeePinGate } from '../../../components/EmployeePinModal';
import { todayStr, nowStr } from '../../../utils/dates';
import { Icon } from '../../../components/Icon';
import { isValidPhoneNumber } from '../../../components/PhoneInput';
import { useMultiPaymentMutation } from '../../../hooks/useMultiPaymentMutation';

const PM_CFG = {
  cash:      { label: 'Espèces',     text: '#065f46', bg: '#f0fdf4' },
  card:      { label: 'CB physique', text: '#4338ca', bg: '#eef2ff' },
  transfer:  { label: 'Virement',    text: '#0e7490', bg: '#ecfeff' },
  gift_card: { label: 'Bon cadeau',  text: '#9a3412', bg: '#fff7ed' },
  other:     { label: 'Autre',       text: '#92400e', bg: '#fffbeb' },
  multi:     { label: 'Multi',       text: '#374151', bg: '#f3f4f6' },
};

function fmt(n) { return Number(n || 0).toFixed(2); }

// Affichage marche DZ : "1 500" (espace milliers, pas de decimales terminales).
// fmt() ci-dessus reste utilise pour les valeurs envoyees a l'API (parseFloat).
function fmtDA(n) { return Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }

export default function Step4Confirm({
  theme: t, cart, employees,
  empId, payMethod, splitMode, breakdownLines,
  promoCode, promoData, clientEmail, clientName, clientPhone, clientNote,
  selectedRewardId, onAdd, onBack, onSuccess, showToast,
}) {
  const { requestPin, PinModalNode } = useEmployeePinGate();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  // Hook commit B : wrappe POST /transactions, traduit les codes
  // BREAKDOWN_* en messages FR et déclenche le toast récap multi-méthodes.
  const { submit: submitTx } = useMultiPaymentMutation({ onAdd, showToast });

  // Snapshot figé après succès : on ne dépend plus des props (qu'on va
  // bientôt reset) pour afficher le récap final.
  const [done, setDone] = useState(null); // { cart, finalTotal, methodLabel, empName, clientName, clientEmail }
  const [countdown, setCountdown] = useState(8);
  const countdownRef = useRef(null);

  const total = cart.reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);
  const discount   = parseFloat(promoData?.discount || 0);
  const finalTotal = Math.max(0, total - discount);

  // Lignes breakdown actives (montant > 0) — accepte virgule FR.
  const breakdownActive = (breakdownLines || [])
    .map(l => ({
      method: l.method,
      amount: parseFloat(String(l.amount).replace(',', '.')) || 0,
    }))
    .filter(p => p.amount > 0);
  const paymentsEntries = splitMode
    ? breakdownActive
    : [{ method: payMethod, amount: finalTotal }];

  const emp = employees?.find(e => e.id === empId) || null;

  // Garde defensive (le gate principal est au Step3) : si un client est
  // rattache, un telephone valide est requis avant d'encaisser.
  const clientAttached = !!((clientName || '').trim() || (clientEmail || '').trim());
  const phoneGateOk    = !clientAttached || isValidPhoneNumber((clientPhone || '').trim());

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
      // Commit B — payment_breakdown envoyé au backend uniquement en mode
      // multi avec >= 2 sous-paiements. Le backend crée alors N rows liées
      // par un payment_group_id UUID. payment_method='multi' reste pour la
      // compat historique (filtres/affichages legacy).
      const paymentBreakdown = (splitMode && paymentsEntries.length >= 2)
        ? paymentsEntries.map(p => ({
            method: p.method,
            amount_cents: Math.round(p.amount * 100),
          }))
        : undefined;

      await submitTx({
        type:            'revenue',
        amount:          finalTotal,
        category_id:     cart.length === 1 ? cart[0].category_id : null,
        employee_id:     empId || null,
        payment_method:  primaryMethod,
        payments:        paymentsEntries,
        payment_breakdown: paymentBreakdown,
        items,
        description:     desc,
        date, time,
        datetime_iso:    new Date(date + 'T' + time).toISOString(),
        promo_code_id:   promoData?.source === 'referral' ? null : (promoData?.promo?.id || null),
        // client_reward_id : transmet la reward sélectionnée dans la même
        // requête → backend marque cette ligne 'used' atomiquement (anti
        // double-utilisation). Source de vérité côté serveur, non blocable
        // par un retry réseau côté client.
        client_reward_id: selectedRewardId || null,
        referral_code:   promoData?.source === 'referral' ? (promoCode || '').trim().toUpperCase() : undefined,
        discount_amount: discount || 0,
        original_amount: total,
        client_note:     (clientNote  || '').trim() || null,
        client_email:    (clientEmail || '').trim() || null,
        client_name:     (clientName  || '').trim() || null,
        client_phone:    (clientPhone || '').trim() || null,
        idempotency_key: idemKey,
      });

      // Filet de sécurité côté front (idempotent) — le backend a déjà marqué
      // la reward 'used' via client_reward_id. Ce 2e appel garantit la
      // désactivation même si le front et le back se désynchronisent.
      if (selectedRewardId) {
        try { await referralsApi.useReward(selectedRewardId); } catch { /* non-bloquant */ }
      }
      // Le hook submitTx a déjà émis le toast vert (avec récap multi-méthodes
      // en mode breakdown). Pas de double-toast ici.
      // Figer un snapshot pour l'écran de succès, puis basculer en mode
      // « done ». Le reset (onSuccess) n'a lieu qu'au clic « Nouvel
      // encaissement » ou à l'expiration du compteur 8 s.
      setDone({
        cart: cart.map(it => ({ ...it })),
        finalTotal,
        methodLabel: (PM_CFG[primaryMethod] || PM_CFG.other).label,
        methodColor: (PM_CFG[primaryMethod] || PM_CFG.other).text,
        empName: emp?.name || '—',
        clientName: (clientName || '').trim() || '',
        clientEmail: (clientEmail || '').trim() || '',
      });
    } catch (e) {
      // Le hook a déjà émis le toast d'erreur traduit (mapping FR par code).
      // On absorbe ici pour réactiver le bouton et permettre une nouvelle
      // tentative.
      setBusy(false);
    }
  };

  // Compte à rebours visible (8 → 0) pour l'auto-redirect vers étape 1.
  useEffect(() => {
    if (!done) return;
    setCountdown(8);
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownRef.current);
          onSuccess && onSuccess();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (done) {
    return (
      <>
        <style>{
          '@keyframes ff-success-pop { 0% { transform: scale(0.6); opacity: 0; } ' +
          '60% { transform: scale(1.08); opacity: 1; } ' +
          '100% { transform: scale(1); opacity: 1; } }'
        }</style>
        <div style={{ display:'flex', justifyContent:'center', padding:'14px 0' }}>
          <div style={{ width:'100%', maxWidth: 500,
                        background: t.card,
                        border: `0.5px solid ${t.border}`, borderRadius: 12,
                        padding: 28,
                        display:'flex', flexDirection:'column',
                        alignItems:'center', gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: 99,
                          background: '#10b981',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          animation: 'ff-success-pop 280ms ease-out' }}>
              <Icon name="check" size={32} color="#fff" strokeWidth={2.5}/>
            </div>

            <div style={{ textAlign:'center' }}>
              <p style={{ margin:0, fontSize:18, fontWeight:500, color: t.text }}>
                {"Encaissement enregistré"}
              </p>
              <p style={{ margin:'6px 0 0', fontSize:13, color:'#6b7280' }}>
                {fmtDA(done.finalTotal) + " DA · " + done.methodLabel + " · " + done.empName}
              </p>
            </div>

            <div style={{ width:'100%', padding:14, borderRadius:10,
                          background: t.cardAlt,
                          border: `0.5px solid ${t.border}`,
                          display:'flex', flexDirection:'column', gap:6 }}>
              {done.cart.map((it, idx) => (
                <div key={idx}
                     style={{ display:'flex', justifyContent:'space-between',
                              fontSize:12, color:t.text }}>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis',
                                 whiteSpace:'nowrap', paddingRight:8 }}>
                    {it.name + (it.qty > 1 ? ' × ' + it.qty : '')}
                  </span>
                  <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                                 color: t.muted, flexShrink:0 }}>
                    {fmtDA((it.price || 0) * (it.qty || 1)) + " DA"}
                  </span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between',
                            borderTop:`0.5px solid ${t.separator}`,
                            paddingTop:6, marginTop:2,
                            fontSize:13, fontWeight:500, color:t.text }}>
                <span>{"Total"}</span>
                <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {fmtDA(done.finalTotal) + " DA"}
                </span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between',
                            fontSize:11, color: t.muted }}>
                <span>{"Méthode"}</span>
                <span style={{ color: done.methodColor, fontWeight:500 }}>{done.methodLabel}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between',
                            fontSize:11, color: t.muted }}>
                <span>{"Employé"}</span>
                <span style={{ color: t.text, fontWeight:500 }}>{done.empName}</span>
              </div>
              {(done.clientName || done.clientEmail) && (
                <div style={{ display:'flex', justifyContent:'space-between',
                              fontSize:11, color: t.muted }}>
                  <span>{"Client"}</span>
                  <span style={{ color: t.text, fontWeight:500,
                                 overflow:'hidden', textOverflow:'ellipsis',
                                 whiteSpace:'nowrap', maxWidth:'60%' }}>
                    {done.clientName || done.clientEmail}
                  </span>
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:8, width:'100%',
                          flexWrap:'wrap', justifyContent:'center' }}>
              <button onClick={() => {
                        if (countdownRef.current) clearInterval(countdownRef.current);
                        onSuccess && onSuccess();
                      }}
                      style={{ flex:'1 1 200px', minHeight:46,
                               padding:'12px 18px', borderRadius:8, border:'none',
                               background:'#10b981', color:'#fff',
                               cursor:'pointer', fontFamily:'inherit',
                               fontSize:14, fontWeight:500,
                               display:'inline-flex', alignItems:'center',
                               justifyContent:'center', gap:6 }}>
                <Icon name="plus" size={14} color="#fff"/>
                {"Nouvel encaissement"}
              </button>
              <button onClick={() => {
                        if (countdownRef.current) clearInterval(countdownRef.current);
                        navigate('/caisse/historique');
                      }}
                      style={{ flex:'1 1 200px', minHeight:46,
                               padding:'12px 18px', borderRadius:8,
                               border:`0.5px solid ${t.border}`,
                               background: t.cardAlt, color: t.text,
                               cursor:'pointer', fontFamily:'inherit',
                               fontSize:14, fontWeight:500,
                               display:'inline-flex', alignItems:'center',
                               justifyContent:'center', gap:6 }}>
                <Icon name="chart" size={14} color={t.text}/>
                {"Voir l'historique"}
              </button>
            </div>

            <p style={{ margin:0, fontSize:11, color: t.muted, textAlign:'center' }}>
              {"Retour automatique à l'étape 1 dans " + countdown + " s"}
            </p>
          </div>
        </div>
        {PinModalNode}
      </>
    );
  }

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
                    {"× " + it.qty + " · " + fmtDA(it.price) + " DA"}
                  </p>
                </div>
                <span style={{ color:t.text, fontWeight:500,
                               fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {fmtDA(it.price * it.qty) + " DA"}
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
                  {fmtDA(p.amount) + " DA"}
                </span>
              </div>
            );
          })}

          <div style={{ marginTop:4, padding:12, borderRadius:8, background: t.cardAlt,
                        display:'flex', flexDirection:'column', gap:4, fontSize:11 }}>
            <div style={{ display:'flex', justifyContent:'space-between', color: t.muted }}>
              <span>{"Total panier"}</span>
              <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{fmtDA(total)} DA</span>
            </div>
            {discount > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', color:'#9a3412' }}>
                <span>{"Remise" + (promoCode ? ' · ' + promoCode : '')}</span>
                <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{"−" + fmtDA(discount)} DA</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between',
                          fontSize:15, fontWeight:500, color:t.text,
                          borderTop:`0.5px solid ${t.separator}`, paddingTop:6, marginTop:4 }}>
              <span>{"À encaisser"}</span>
              <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{fmtDA(finalTotal)} DA</span>
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
            <button onClick={confirm} disabled={busy || cart.length === 0 || !empId || !phoneGateOk}
                    title={!phoneGateOk ? "Téléphone client valide requis avant d'encaisser" : undefined}
                    style={{ padding:'12px 18px', borderRadius:8, border:'none',
                             background: (busy || !phoneGateOk) ? t.cardAlt : '#10b981',
                             color: (busy || !phoneGateOk) ? t.muted : '#fff',
                             cursor: busy ? 'wait' : (!phoneGateOk ? 'not-allowed' : 'pointer'),
                             fontFamily:'inherit', fontSize:13, fontWeight:500,
                             display:'inline-flex', alignItems:'center', gap:6 }}>
              <Icon name="zap" size={13} color={(busy || !phoneGateOk) ? t.muted : '#fff'}/>
              {busy ? 'Enregistrement…' : 'Valider ' + fmtDA(finalTotal) + ' DA'}
            </button>
          </div>
        </div>
      </div>
      {PinModalNode}
    </>
  );
}
