// src/pages/clients/tabs/CreditTab.jsx
import { fmtDate } from '../helpers';
import { PAYMENT_METHODS, PLABELS } from '../constants';
import { Button, Label } from '../../../components/primitives';

// ─── Onglet Credit ────────────────────────────────────────────────────────────
export default function CreditTab({
  theme, card, inp, lbl,
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
  const balance = creditData?.credit ? parseFloat(creditData.credit.balance) : 0;
  const hasDebt = balance > 0;

  const amountInputStyle = {
    ...inp,
    fontSize: 22,
    fontWeight: 500,
    textAlign: 'center',
    padding: '14px',
  };

  return (
    <div style={{ marginBottom: 12 }}>
      {creditLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: `0.5px solid ${theme.border}`,
            borderTopColor: theme.text,
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto',
          }} />
        </div>
      ) : (<>

        {/* Carte solde — pattern pastel + barre 2px si dette */}
        <div style={{
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          background: hasDebt ? '#fef2f2' : (creditData?.credit ? '#f0fdf4' : theme.card),
          border: hasDebt ? 'none' : `0.5px solid ${theme.border}`,
          borderLeft: hasDebt ? '2px solid #ef4444' : (creditData?.credit ? '2px solid #10b981' : `0.5px solid ${theme.border}`),
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{
                fontSize: 11,
                fontWeight: 500,
                color: hasDebt ? '#991b1b' : (creditData?.credit ? '#065f46' : theme.muted),
                marginBottom: 4,
              }}>Solde credit</p>
              <p style={{
                fontSize: 32,
                fontWeight: 500,
                color: hasDebt ? '#991b1b' : (creditData?.credit ? '#065f46' : theme.text),
                margin: 0,
                lineHeight: 1,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}>
                {balance.toFixed(2)} €
              </p>
            </div>
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '3px 8px',
              borderRadius: 8,
              background: theme.card,
              color: hasDebt ? '#991b1b' : (creditData?.credit ? '#065f46' : theme.muted),
              border: `0.5px solid ${hasDebt ? 'rgba(239,68,68,0.25)' : creditData?.credit ? 'rgba(16,185,129,0.25)' : theme.border}`,
              flexShrink: 0,
            }}>
              {hasDebt ? 'En attente' : creditData?.credit ? 'Solde' : 'Aucun credit'}
            </span>
          </div>
          {creditData?.credit && (
            <div style={{
              display: 'flex',
              gap: 20,
              marginTop: 12,
              paddingTop: 12,
              borderTop: `0.5px solid ${hasDebt ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}`,
            }}>
              <div>
                <p style={{ fontSize: 10, color: hasDebt ? '#991b1b' : '#065f46', opacity: 0.7, fontWeight: 500, margin: '0 0 2px' }}>Accorde</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: hasDebt ? '#991b1b' : '#065f46', margin: 0 }}>
                  {parseFloat(creditData.credit.total_granted).toFixed(2)} €
                </p>
              </div>
              <div>
                <p style={{ fontSize: 10, color: hasDebt ? '#991b1b' : '#065f46', opacity: 0.7, fontWeight: 500, margin: '0 0 2px' }}>Rembourse</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: hasDebt ? '#991b1b' : '#065f46', margin: 0 }}>
                  {parseFloat(creditData.credit.total_repaid).toFixed(2)} €
                </p>
              </div>
              {hasDebt && (
                <div>
                  <p style={{ fontSize: 10, color: '#991b1b', opacity: 0.7, fontWeight: 500, margin: '0 0 2px' }}>Reste du</p>
                  <p style={{ fontSize: 14, fontWeight: 500, color: '#991b1b', margin: 0 }}>
                    {balance.toFixed(2)} €
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Boutons actions */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setCreditMode(creditMode === 'grant' ? null : 'grant')}
            style={{
              flex: 1,
              padding: '10px 8px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: 13,
              border: `0.5px solid ${creditMode === 'grant' ? theme.borderStrong : theme.border}`,
              background: creditMode === 'grant' ? theme.cardAlt : 'transparent',
              color: theme.text,
              fontFamily: 'inherit',
            }}
          >
            Accorder un credit
          </button>
          {hasDebt && (
            <button
              type="button"
              onClick={() => setCreditMode(creditMode === 'repay' ? null : 'repay')}
              style={{
                flex: 1,
                padding: '10px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 13,
                border: `0.5px solid ${creditMode === 'repay' ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.25)'}`,
                background: creditMode === 'repay' ? '#f0fdf4' : 'transparent',
                color: '#065f46',
                fontFamily: 'inherit',
              }}
            >
              Encaisser paiement
            </button>
          )}
        </div>

        {/* Formulaire : Accorder */}
        {creditMode === 'grant' && (
          <div style={{ ...card, padding: 14, marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: theme.text, margin: '0 0 12px' }}>
              Accorder un credit
            </p>

            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Montant (€) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={creditAmt}
                onChange={e => setCreditAmt(e.target.value)}
                style={amountInputStyle}
              />
            </div>

            {employees.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>Employe concerne</label>
                <select
                  value={creditEmpId}
                  onChange={e => setCreditEmpId(e.target.value)}
                  style={{ ...inp, cursor: 'pointer' }}
                >
                  <option value="" disabled>Selectionner un employe</option>
                  {employees.filter(e => e.is_active).map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Note / motif (optionnel)</label>
              <input
                placeholder="Ex : Coupe du 12/03, prestation reportee…"
                value={creditNote}
                onChange={e => setCreditNote(e.target.value)}
                style={inp}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => { setCreditMode(null); setCreditAmt(''); setCreditNote(''); setCreditEmpId(''); }}
              >
                Annuler
              </Button>
              <Button
                fullWidth
                onClick={handleGrantCredit}
                disabled={creditBusy || !creditAmt || parseFloat(creditAmt) <= 0}
                style={{ flex: 2 }}
              >
                {creditBusy ? '...' : `Confirmer ${creditAmt ? parseFloat(creditAmt).toFixed(2) + ' €' : ''}`}
              </Button>
            </div>
          </div>
        )}

        {/* Formulaire : Encaisser */}
        {creditMode === 'repay' && creditData?.credit && (
          <div style={{ ...card, padding: 14, marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: theme.text, margin: '0 0 12px' }}>
              Encaisser un paiement — Solde du :{' '}
              <span style={{ color: '#991b1b' }}>{balance.toFixed(2)} €</span>
            </p>

            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Montant encaisse (€) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                max={balance}
                value={repayAmt}
                onChange={e => setRepayAmt(e.target.value)}
                style={amountInputStyle}
              />
            </div>

            {/* Raccourcis */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {[25, 50, 75].map(pct => {
                const v = (balance * pct / 100).toFixed(2);
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setRepayAmt(v)}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      borderRadius: 8,
                      border: `0.5px solid ${repayAmt === v ? 'rgba(16,185,129,0.35)' : theme.border}`,
                      background: repayAmt === v ? '#f0fdf4' : 'transparent',
                      color: repayAmt === v ? '#065f46' : theme.muted,
                      fontWeight: 500,
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {pct}%<br/>
                    <span style={{ fontSize: 10 }}>{v} €</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setRepayAmt(balance.toFixed(2))}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  borderRadius: 8,
                  border: `0.5px solid ${repayAmt === balance.toFixed(2) ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.25)'}`,
                  background: repayAmt === balance.toFixed(2) ? '#f0fdf4' : 'transparent',
                  color: '#065f46',
                  fontWeight: 500,
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Tout<br/>
                <span style={{ fontSize: 10 }}>{balance.toFixed(2)} €</span>
              </button>
            </div>

            {/* Moyen de paiement */}
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Moyen de paiement *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {PAYMENT_METHODS.map(pm => {
                  const active = repayMethod === pm.id;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setRepayMethod(pm.id)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        border: `0.5px solid ${active ? theme.borderStrong : theme.border}`,
                        background: active ? theme.cardAlt : 'transparent',
                        color: theme.text,
                        fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{pm.icon}</span>
                      <span>{pm.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Employe */}
            {employees.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>Encaisse par</label>
                <select
                  value={repayEmpId}
                  onChange={e => setRepayEmpId(e.target.value)}
                  style={{ ...inp, cursor: 'pointer' }}
                >
                  <option value="" disabled>Selectionner un employe</option>
                  {employees.filter(e => e.is_active).map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Note (optionnelle)</label>
              <input
                placeholder="Reference, commentaire…"
                value={repayNote}
                onChange={e => setRepayNote(e.target.value)}
                style={inp}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => { setCreditMode(null); setRepayAmt(''); setRepayNote(''); setRepayEmpId(''); setRepayMethod('cash'); }}
              >
                Annuler
              </Button>
              <Button
                fullWidth
                onClick={handleRepayCredit}
                disabled={creditBusy || !repayAmt || parseFloat(repayAmt) <= 0}
                style={{ flex: 2 }}
              >
                {creditBusy ? '...' : `Encaisser ${repayAmt ? parseFloat(repayAmt).toFixed(2) + ' €' : ''}`}
              </Button>
            </div>
          </div>
        )}

        {/* Historique operations */}
        {creditData?.history?.length > 0 ? (
          <div>
            <p style={{ fontSize: 11, fontWeight: 500, color: theme.muted, margin: '0 0 10px' }}>
              Historique des operations
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {creditData.history.map((op, i) => {
                const isGrant = op.type === 'grant';
                const accent = isGrant ? '#ef4444' : '#10b981';
                const textColor = isGrant ? '#991b1b' : '#065f46';
                return (
                  <div
                    key={i}
                    style={{
                      ...card,
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'stretch',
                      gap: 10,
                    }}
                  >
                    <div style={{
                      width: 2,
                      borderRadius: 99,
                      background: accent,
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: theme.text }}>
                          {isGrant ? 'Credit accorde' : 'Remboursement encaisse'}
                        </p>
                        <span style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: textColor,
                          flexShrink: 0,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}>
                          {isGrant ? '+' : '-'}{parseFloat(op.amount).toFixed(2)} €
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: theme.muted }}>{fmtDate(op.created_at)}</span>
                        {op.employee_name && (
                          <span style={{ fontSize: 11, color: theme.muted }}>· {op.employee_name}</span>
                        )}
                        {!isGrant && op.payment_method && (
                          <span style={{
                            fontSize: 11,
                            padding: '1px 7px',
                            borderRadius: 8,
                            background: theme.cardAlt,
                            color: theme.textSub || theme.text,
                            fontWeight: 500,
                          }}>
                            {PLABELS[op.payment_method] || op.payment_method}
                          </span>
                        )}
                        {!isGrant && op.transaction_id && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: theme.muted }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />
                            En caisse
                          </span>
                        )}
                      </div>
                      {op.note && (
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: theme.muted, fontStyle: 'italic' }}>
                          {op.note}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : !creditData?.credit ? (
          <div style={{
            textAlign: 'center',
            padding: '36px 16px',
            background: theme.card,
            border: `0.5px dashed ${theme.border}`,
            borderRadius: 12,
          }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: theme.text, margin: '0 0 4px' }}>
              Aucun credit pour ce client
            </p>
            <p style={{ fontSize: 12, color: theme.muted, margin: 0 }}>
              Cliquez sur &quot;Accorder un credit&quot; pour commencer
            </p>
          </div>
        ) : null}

      </>)}
    </div>
  );
}
