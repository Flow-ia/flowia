// src/pages/employee-agenda/components/EmployeePicker.jsx
import { I } from '../../../utils/icons';

export default function EmployeePicker({ employees, onSelect, theme: t }) {
  const active = employees.filter(e => e.is_active !== false);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 20px 96px',
      background: t.bg,
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: t.cardAlt,
          border: `0.5px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 14px',
          color: t.text,
        }}>
          <I.Calendar width={24} height={24} />
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: t.text }}>Mon agenda</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: t.muted }}>Choisissez votre profil</p>
      </div>

      {active.length === 0 ? (
        <div style={{
          background: t.card,
          border: `0.5px solid ${t.border}`,
          borderRadius: 12,
          padding: '32px 24px',
          textAlign: 'center',
          width: '100%',
          maxWidth: 360,
        }}>
          <p style={{ margin: 0, fontSize: 13, color: t.muted }}>Aucun employe actif</p>
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {active.map((emp, i) => {
            const perms = [
              emp.can_cancel && { label: 'Annulation', dot: '#ef4444' },
              emp.can_modify && { label: 'Modification', dot: '#8b5cf6' },
              emp.can_encash && { label: 'Encaissement', dot: '#10b981' },
            ].filter(Boolean);
            const isView = perms.length === 0;
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => onSelect(emp)}
                style={{
                  width: '100%',
                  background: t.card,
                  border: `0.5px solid ${t.border}`,
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                  animation: `fadeUp .25s ease ${i * .06}s both`,
                  transition: 'border-color .15s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = t.borderStrong; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; }}
              >
                {/* Avatar */}
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: emp.avatar_color || t.text,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 18,
                  fontWeight: 500,
                  flexShrink: 0,
                }}>
                  {emp.name.charAt(0)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: t.text }}>{emp.name}</p>
                  {emp.role && <p style={{ margin: '2px 0 4px', fontSize: 11, color: t.muted }}>{emp.role}</p>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                    {isView ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: t.muted }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.dim }} />
                        Consultation
                      </span>
                    ) : perms.map((p, j) => (
                      <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: t.muted }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.dot }} />
                        {p.label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Chevron */}
                <span style={{ color: t.muted, flexShrink: 0, display: 'inline-flex' }}>
                  <I.ChevR width={16} height={16} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
