// src/pages/clients/tabs/CreditTab.jsx
import { fmtDate } from '../helpers';
import { PAYMENT_METHODS, PLABELS } from '../constants';

// ─── Onglet Crédit ────────────────────────────────────────────────────────────
export default function CreditTab({
  theme, card, inp,
  fiche, employees,
  creditData, creditLoading,
  creditMode, setCreditMode,
  creditAmt, setCreditAmt,
  creditNote, setCreditNote,
  creditEmpId, setCreditEmpId,
  repayAmt, setRepayAmt,
  repayNote, setRepayNote,
  repayEmpId, setRepayEmpId,
  repayMethod, setRepayMethod,
  creditBusy,
  handleGrantCredit, handleRepayCredit,
}) {
  const lbl2 = { fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' };
  const balance = creditData?.credit ? parseFloat(creditData.credit.balance) : 0;
  const hasDebt = balance > 0;

  return (
    <div style={{ marginBottom:12 }}>
      {creditLoading ? (
        <div style={{ textAlign:'center', padding:'40px 0' }}>
          <div style={{ width:32, height:32, borderRadius:'50%', border:`3px solid ${theme.border}`, borderTopColor:'#111827', animation:'spin 0.8s linear infinite', margin:'0 auto' }} />
        </div>
      ) : (<>

        {/* ── Carte solde ── */}
        <div style={{ ...card, padding:20, marginBottom:12, background: hasDebt ? 'linear-gradient(135deg,rgba(239,68,68,0.06),rgba(239,68,68,0.02))' : theme.card, border: hasDebt ? '1.5px solid rgba(239,68,68,0.2)' : `1px solid ${theme.border}` }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Solde crédit</p>
              <p style={{ fontSize:38, fontWeight:900, color: hasDebt ? '#ef4444' : '#22c55e', margin:0, lineHeight:1 }}>
                {balance.toFixed(2)} €
              </p>
            </div>
            <span style={{ fontSize:11, fontWeight:800, padding:'4px 10px', borderRadius:99,
              background: hasDebt ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
              color: hasDebt ? '#ef4444' : '#22c55e', marginTop:2 }}>
              {hasDebt ? '⚠ En attente' : creditData?.credit ? '✓ Solde' : 'Aucun credit'}
            </span>
          </div>
          {creditData?.credit && (
            <div style={{ display:'flex', gap:20, marginTop:14, paddingTop:12, borderTop:`1px solid ${theme.border}` }}>
              <div>
                <p style={{ fontSize:10, color:theme.muted, fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>Accordé</p>
                <p style={{ fontSize:15, fontWeight:900, color:'#f87171', margin:0 }}>{parseFloat(creditData.credit.total_granted).toFixed(2)} €</p>
              </div>
              <div>
                <p style={{ fontSize:10, color:theme.muted, fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>Remboursé</p>
                <p style={{ fontSize:15, fontWeight:900, color:'#4ade80', margin:0 }}>{parseFloat(creditData.credit.total_repaid).toFixed(2)} €</p>
              </div>
              {hasDebt && (
                <div>
                  <p style={{ fontSize:10, color:theme.muted, fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>Reste dû</p>
                  <p style={{ fontSize:15, fontWeight:900, color:'#ef4444', margin:0 }}>{balance.toFixed(2)} €</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Boutons actions ── */}
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <button onClick={() => setCreditMode(creditMode === 'grant' ? null : 'grant')}
            style={{ flex:1, padding:'12px 8px', borderRadius:12, cursor:'pointer', fontWeight:800, fontSize:13,
              border:`1.5px solid ${creditMode==='grant' ? '#111827' : 'rgba(17,24,39,0.3)'}`,
              background: creditMode==='grant' ? 'rgba(17,24,39,0.1)' : 'transparent',
              color:'#111827' }}>
            + Accorder un crédit
          </button>
          {hasDebt && (
            <button onClick={() => setCreditMode(creditMode === 'repay' ? null : 'repay')}
              style={{ flex:1, padding:'12px 8px', borderRadius:12, cursor:'pointer', fontWeight:800, fontSize:13,
                border:`1.5px solid ${creditMode==='repay' ? '#22c55e' : 'rgba(34,197,94,0.3)'}`,
                background: creditMode==='repay' ? 'rgba(34,197,94,0.1)' : 'transparent',
                color:'#22c55e' }}>
              ↩ Encaisser paiement
            </button>
          )}
        </div>

        {/* ── Formulaire : Accorder un crédit ── */}
        {creditMode === 'grant' && (
          <div style={{ ...card, padding:16, marginBottom:12, border:'1.5px solid rgba(17,24,39,0.2)' }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#111827', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.07em' }}>
              Accorder un crédit
            </p>

            {/* Montant */}
            <div style={{ marginBottom:12 }}>
              <label style={lbl2}>Montant (€) *</label>
              <input type="number" min="0.01" step="0.01" placeholder="0.00"
                value={creditAmt} onChange={e=>setCreditAmt(e.target.value)}
                style={{ ...inp, fontSize:22, fontWeight:900, textAlign:'center', padding:'14px' }} />
            </div>

            {/* Employé */}
            {employees.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <label style={lbl2}>Employé concerné</label>
                <select value={creditEmpId} onChange={e=>setCreditEmpId(e.target.value)}
                  style={{ ...inp, cursor:'pointer' }}>
                  <option value="" disabled>Sélectionner un employé</option>
                  {employees.filter(e=>e.is_active).map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Note */}
            <div style={{ marginBottom:14 }}>
              <label style={lbl2}>Note / motif (optionnel)</label>
              <input placeholder="Ex : Coupe du 12/03, prestation reportée…"
                value={creditNote} onChange={e=>setCreditNote(e.target.value)}
                style={inp} />
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { setCreditMode(null); setCreditAmt(''); setCreditNote(''); setCreditEmpId(''); }}
                style={{ flex:1, padding:'11px', borderRadius:10, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, fontSize:13, cursor:'pointer' }}>
                Annuler
              </button>
              <button onClick={handleGrantCredit} disabled={creditBusy||!creditAmt||parseFloat(creditAmt)<=0}
                style={{ flex:2, padding:'11px', borderRadius:10, background:'#1a73e8', border:'none', color:'white', fontWeight:800, fontSize:13, cursor:'pointer', opacity:!creditAmt||parseFloat(creditAmt)<=0?0.45:1 }}>
                {creditBusy ? '...' : `Confirmer ${creditAmt ? parseFloat(creditAmt).toFixed(2)+' €' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* ── Formulaire : Encaisser un paiement ── */}
        {creditMode === 'repay' && creditData?.credit && (
          <div style={{ ...card, padding:16, marginBottom:12, border:'1.5px solid rgba(34,197,94,0.2)' }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#22c55e', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.07em' }}>
              Encaisser un paiement — Solde dû : <span style={{ color:'#ef4444' }}>{balance.toFixed(2)} €</span>
            </p>

            {/* Montant */}
            <div style={{ marginBottom:10 }}>
              <label style={lbl2}>Montant encaissé (€) *</label>
              <input type="number" min="0.01" step="0.01" placeholder="0.00"
                max={balance}
                value={repayAmt} onChange={e=>setRepayAmt(e.target.value)}
                style={{ ...inp, fontSize:22, fontWeight:900, textAlign:'center', padding:'14px' }} />
            </div>

            {/* Raccourcis montant */}
            <div style={{ display:'flex', gap:6, marginBottom:14 }}>
              {[25, 50, 75].map(pct => {
                const v = (balance * pct / 100).toFixed(2);
                return (
                  <button key={pct} onClick={() => setRepayAmt(v)}
                    style={{ flex:1, padding:'8px 4px', borderRadius:8, border:`1px solid ${theme.border}`, background: repayAmt===v ? 'rgba(34,197,94,0.15)' : theme.inputBg, color: repayAmt===v ? '#22c55e' : theme.muted, fontWeight:700, fontSize:11, cursor:'pointer' }}>
                    {pct}%<br/><span style={{ fontSize:10 }}>{v}€</span>
                  </button>
                );
              })}
              <button onClick={() => setRepayAmt(balance.toFixed(2))}
                style={{ flex:1, padding:'8px 4px', borderRadius:8, border:'1.5px solid rgba(34,197,94,0.4)', background: repayAmt===balance.toFixed(2) ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.06)', color:'#22c55e', fontWeight:800, fontSize:11, cursor:'pointer' }}>
                Tout<br/><span style={{ fontSize:10 }}>{balance.toFixed(2)}€</span>
              </button>
            </div>

            {/* Moyen de paiement */}
            <div style={{ marginBottom:12 }}>
              <label style={lbl2}>Moyen de paiement *</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {PAYMENT_METHODS.map(pm => (
                  <button key={pm.id} onClick={() => setRepayMethod(pm.id)}
                    style={{ padding:'12px 10px', borderRadius:12, cursor:'pointer', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:8,
                      border: repayMethod===pm.id ? '2px solid #111827' : `1.5px solid ${theme.border}`,
                      background: repayMethod===pm.id ? 'rgba(17,24,39,0.08)' : theme.card,
                      color: repayMethod===pm.id ? '#111827' : theme.text }}>
                    <span style={{ fontSize:18 }}>{pm.icon}</span>
                    <span>{pm.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Employé encaissant */}
            {employees.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <label style={lbl2}>Encaissé par</label>
                <select value={repayEmpId} onChange={e=>setRepayEmpId(e.target.value)}
                  style={{ ...inp, cursor:'pointer' }}>
                  <option value="" disabled>Sélectionner un employé</option>
                  {employees.filter(e=>e.is_active).map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Note */}
            <div style={{ marginBottom:14 }}>
              <label style={lbl2}>Note (optionnelle)</label>
              <input placeholder="Référence, commentaire…"
                value={repayNote} onChange={e=>setRepayNote(e.target.value)}
                style={inp} />
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { setCreditMode(null); setRepayAmt(''); setRepayNote(''); setRepayEmpId(''); setRepayMethod('cash'); }}
                style={{ flex:1, padding:'11px', borderRadius:10, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, fontSize:13, cursor:'pointer' }}>
                Annuler
              </button>
              <button onClick={handleRepayCredit} disabled={creditBusy||!repayAmt||parseFloat(repayAmt)<=0}
                style={{ flex:2, padding:'11px', borderRadius:10, background:'linear-gradient(135deg,#22c55e,#16a34a)', border:'none', color:'white', fontWeight:800, fontSize:13, cursor:'pointer', opacity:!repayAmt||parseFloat(repayAmt)<=0?0.45:1 }}>
                {creditBusy ? '...' : `✓ Encaisser ${repayAmt ? parseFloat(repayAmt).toFixed(2)+' €' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* ── Historique des opérations ── */}
        {creditData?.history?.length > 0 ? (
          <div>
            <p style={{ fontSize:11, fontWeight:800, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Historique des opérations</p>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {creditData.history.map((op, i) => {
                const isGrant = op.type === 'grant';
                return (
                  <div key={i} style={{ ...card, padding:'12px 14px', display:'flex', alignItems:'flex-start', gap:12 }}>
                    <div style={{
                      width:38, height:38, borderRadius:11, flexShrink:0,
                      background: isGrant ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:18,
                    }}>
                      {isGrant ? '📤' : '💰'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
                        <p style={{ margin:0, fontSize:13, fontWeight:800, color:theme.text }}>
                          {isGrant ? 'Crédit accorde' : 'Remboursement encaisse'}
                        </p>
                        <span style={{ fontSize:15, fontWeight:900, color: isGrant ? '#ef4444' : '#22c55e', flexShrink:0, marginLeft:8 }}>
                          {isGrant ? '+' : '-'}{parseFloat(op.amount).toFixed(2)} €
                        </span>
                      </div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <span style={{ fontSize:11, color:theme.muted }}>{fmtDate(op.created_at)}</span>
                        {op.employee_name && (
                          <span style={{ fontSize:11, color:'#111827', fontWeight:700 }}>· {op.employee_name}</span>
                        )}
                        {!isGrant && op.payment_method && (
                          <span style={{ fontSize:11, padding:'1px 7px', borderRadius:99, background:'rgba(17,24,39,0.08)', color:'#111827', fontWeight:700 }}>
                            {PLABELS[op.payment_method] || op.payment_method}
                          </span>
                        )}
                        {!isGrant && op.transaction_id && (
                          <span style={{ fontSize:10, color:'#22c55e', fontWeight:700 }}>✓ En caisse</span>
                        )}
                      </div>
                      {op.note && <p style={{ margin:'3px 0 0', fontSize:11, color:theme.muted, fontStyle:'italic' }}>{op.note}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : !creditData?.credit ? (
          <div style={{ textAlign:'center', padding:'36px 0', color:theme.muted }}>
            <p style={{ fontSize:36, marginBottom:10 }}>💳</p>
            <p style={{ fontSize:15, fontWeight:700, color:theme.text, marginBottom:4 }}>Aucun crédit pour ce client</p>
            <p style={{ fontSize:12 }}>Cliquez sur "Accorder un crédit" pour commencer</p>
          </div>
        ) : null}

      </>)}
    </div>
  );
}
