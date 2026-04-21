// src/pages/employee-agenda/components/ApptCard.jsx
import { STATUS_CFG } from '../constants';
import { fmtTime } from '../helpers';
import { I } from '../../../utils/icons';

export default function ApptCard({ appt, onClick, theme: t }) {
  const st = STATUS_CFG[appt.status] || STATUS_CFG.confirmed;
  const accent = appt.service_color || appt.employee_color || t.text;

  return (
    <button
      type="button"
      onClick={() => onClick(appt)}
      style={{
        width: '100%',
        textAlign: 'left',
        background: t.card,
        border: `0.5px solid ${t.border}`,
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {/* Barre verticale 2px */}
      <div style={{
        width: 2,
        alignSelf: 'stretch',
        borderRadius: 99,
        background: accent,
        minHeight: 40,
        flexShrink: 0,
      }} />

      {/* Contenu */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: t.text }}>
            {fmtTime(appt.start_time)} — {fmtTime(appt.end_time)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {appt.paid && (
              <span style={{
                fontSize: 11,
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: 8,
                background: '#f0fdf4',
                color: '#065f46',
              }}>Paye</span>
            )}
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: 8,
              background: st.bg,
              color: st.color,
            }}>{st.label}</span>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: t.text }}>
          {appt.client_name}
        </p>

        {appt.items && appt.items.length > 1 ? (
          <div style={{ marginTop: 4 }}>
            {appt.items.map((it, i) => (
              <p key={i} style={{ margin: '1px 0', fontSize: 11, color: t.muted }}>
                {it.service_name}{it.qty > 1 ? ` ×${it.qty}` : ''} · {it.duration_minutes * (it.qty || 1)}min
                {it.unit_price > 0 ? ` · ${(it.unit_price * (it.qty || 1)).toFixed(2)} €` : ''}
              </p>
            ))}
            <p style={{ margin: '3px 0 0', fontSize: 11, fontWeight: 500, color: '#065f46' }}>
              Total : {appt.total_duration || appt.duration_minutes}min
              {appt.total_amount > 0 ? ` · ${parseFloat(appt.total_amount).toFixed(2)} €` : ''}
            </p>
          </div>
        ) : (
          <p style={{ margin: '2px 0 0', fontSize: 12, color: t.muted }}>
            {appt.items?.length === 1 ? appt.items[0].service_name : (appt.service_name || 'Service')}
            {' · '}{appt.total_duration || appt.duration_minutes}min
            {appt.total_amount > 0
              ? ` · ${parseFloat(appt.total_amount).toFixed(2)} €`
              : (appt.service_price ? ` · ${parseFloat(appt.service_price).toFixed(2)} €` : '')}
          </p>
        )}

        {appt.client_phone && (
          <p style={{ margin: '3px 0 0', fontSize: 11, color: t.muted }}>{appt.client_phone}</p>
        )}

        {appt.employee_name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <div style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: appt.employee_color || t.text,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 500,
              fontSize: 8,
              flexShrink: 0,
            }}>{appt.employee_name.charAt(0)}</div>
            <span style={{ fontSize: 11, color: t.muted }}>{appt.employee_name}</span>
          </div>
        )}

        <p style={{
          margin: '4px 0 0',
          fontSize: 10,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: t.dim,
        }}>
          #{(appt.id || '').substring(0, 8).toUpperCase()}
        </p>
      </div>

      <span style={{ color: t.muted, flexShrink: 0, marginTop: 4, display: 'inline-flex' }}>
        <I.ChevR width={14} height={14} />
      </span>
    </button>
  );
}
