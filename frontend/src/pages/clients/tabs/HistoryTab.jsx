// src/pages/clients/tabs/HistoryTab.jsx
import { fmtDate } from '../helpers';
import { STATUS_CFG, STATUS_LABEL } from '../constants';

// ─── Onglet Historique ────────────────────────────────────────────────────────
export default function HistoryTab({ theme, card, fiche }) {
  const txs = fiche.transactions || [];
  const appts = fiche.appointments || [];

  const SectionHeader = ({ label }) => (
    <p style={{
      margin: '0 0 8px',
      fontSize: 11,
      fontWeight: 500,
      color: theme.muted,
    }}>{label}</p>
  );

  return (
    <div style={{ marginBottom: 12 }}>
      {txs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader label="Encaissements" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {txs.map((tx, i) => (
              <div key={i} style={{
                ...card,
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}>
                <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'stretch', gap: 10 }}>
                  <div style={{
                    width: 2,
                    borderRadius: 99,
                    background: '#10b981',
                    flexShrink: 0,
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 500,
                      color: theme.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {tx.description || 'Encaissement'}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: theme.muted }}>
                      {fmtDate(tx.date)}{tx.employee_name ? ` · ${tx.employee_name}` : ''}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {tx.original_amount && tx.original_amount !== tx.amount && (
                    <p style={{ margin: 0, fontSize: 11, color: theme.muted, textDecoration: 'line-through' }}>
                      {Number(tx.original_amount).toFixed(2)} €
                    </p>
                  )}
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#065f46' }}>
                    {Number(tx.amount || 0).toFixed(2)} €
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {appts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader label="Rendez-vous" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {appts.map((a, i) => {
              const sc = STATUS_CFG[a.status] || STATUS_CFG.confirmed;
              return (
                <div key={i} style={{
                  ...card,
                  padding: '12px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'stretch', gap: 10 }}>
                    <div style={{
                      width: 2,
                      borderRadius: 99,
                      background: sc.accent,
                      flexShrink: 0,
                    }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 500,
                        color: theme.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {a.service_name || 'Rendez-vous'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: theme.muted }}>
                        {fmtDate(a.date)}{a.start_time ? ` · ${String(a.start_time).slice(0, 5)}` : ''}
                      </p>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '2px 8px',
                    borderRadius: 8,
                    flexShrink: 0,
                    background: sc.bg,
                    color: sc.text,
                  }}>
                    {STATUS_LABEL[a.status] || a.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {txs.length === 0 && appts.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px 16px',
          background: theme.card,
          border: `0.5px dashed ${theme.border}`,
          borderRadius: 12,
        }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: theme.muted, margin: 0 }}>
            Aucun historique disponible
          </p>
        </div>
      )}
    </div>
  );
}
