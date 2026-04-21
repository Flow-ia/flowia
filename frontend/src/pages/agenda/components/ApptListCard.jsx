import { STATUS_CFG } from '../constants';
import { fmtTime } from '../helpers';
import { I } from '../../../utils/icons';

export default function ApptListCard({ a, onOpen, isDark, t }) {
  const st = STATUS_CFG[a.status] || STATUS_CFG.confirmed;
  const accentColor = a.service_color || a.employee_color || t.text;

  return (
    <div
      style={{
        background: t.card,
        border: `0.5px solid ${t.border}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 2,
              borderRadius: 99,
              background: accentColor,
              flexShrink: 0,
              minHeight: 36,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 500, fontSize: 13, color: t.text }}>
                {fmtTime(a.start_time)}–{fmtTime(a.end_time)}
              </span>
              {a.paid && (
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 8,
                    background: '#f0fdf4',
                    color: '#065f46',
                    fontWeight: 500,
                  }}
                >
                  Payé
                </span>
              )}
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 8,
                  background: st.bg,
                  color: st.color,
                  fontWeight: 500,
                }}
              >
                {st.label}
              </span>
            </div>
            <p style={{ fontWeight: 500, fontSize: 13, margin: '4px 0 0', color: t.text }}>
              {a.client_name}
            </p>
            <p style={{ fontSize: 11, color: t.muted, margin: '2px 0 0' }}>
              {a.items && a.items.length > 1
                ? `${a.items.length} services · ${a.total_duration || a.duration_minutes}min`
                : `${a.service_name || 'RDV'} · ${a.total_duration || a.duration_minutes}min`}
              {parseFloat(a.total_amount || a.service_price || 0) > 0 &&
                ` · ${parseFloat(a.total_amount || a.service_price).toFixed(2)} €`}
            </p>
            {a.employee_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 500,
                    fontSize: 8,
                    flexShrink: 0,
                    background: a.employee_color || t.text,
                  }}
                >
                  {a.employee_name.charAt(0)}
                </div>
                <span style={{ fontSize: 11, color: t.muted }}>{a.employee_name}</span>
              </div>
            )}
            {a.client_phone && (
              <p style={{ fontSize: 11, color: t.muted, margin: '2px 0 0' }}>
                {a.client_phone}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpen(a)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            background: isDark ? 'rgba(255,255,255,0.05)' : t.cardAlt,
            border: 'none',
            color: t.muted,
            cursor: 'pointer',
          }}
        >
          <I.MoreH width={14} height={14} />
        </button>
      </div>
    </div>
  );
}
