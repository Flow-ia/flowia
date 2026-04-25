// src/pages/employee-agenda/tabs/NotificationsTab.jsx
// Onglet "Notifications" dans la page employe : meme source que la cloche admin
// (hook useNotifications). Le hook est appele dans le parent EmpAgendaMain et
// passe en props pour partager le poller 30s avec le badge "non lu".
import { I } from '../../../utils/icons';

const NOTIF_CFG = {
  new_appointment:      { Icon: I.Calendar, label: 'Nouveau RDV', bg: '#eef2ff', accent: '#6366f1', text: '#4338ca' },
  appointment_reminder: { Icon: I.Clock,    label: 'Rappel RDV',  bg: '#fffbeb', accent: '#f59e0b', text: '#92400e' },
  caisse:               { Icon: I.Wallet,   label: 'Caisse',      bg: '#f0fdf4', accent: '#10b981', text: '#065f46' },
  daily_recap:          { Icon: I.BarCh,    label: 'Recap jour',  bg: '#f9fafb', accent: '#6b7280', text: '#374151' },
};

const stripLeadingEmoji = (s = '') =>
  String(s).replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*(?:—\s*)?/u, '').trim();

const fmtApptDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0)  return "Aujourd'hui";
  if (diff === 1)  return 'Demain';
  if (diff === -1) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
};

const fmtRelative = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)    return "A l'instant";
  if (diff < 3600000)  return `Il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

export default function NotificationsTab({ theme: t, notif, onOpenAppt }) {
  const {
    notifications, unreadCount,
    markRead, markAllRead, deleteNotif, reload,
  } = notif;

  // Clic sur une notif : marque lue + bascule l'agenda sur le bon RDV via le
  // callback parent (qui sait gerer date+appt comme un deep-link). Si pas
  // d'info de RDV exploitable, on se contente de marquer lu.
  const handleOpen = (n) => {
    if (!n.is_read) markRead(n.id);
    const d = n.data || {};
    if (d.appointment_id) {
      const dateIso = typeof d.appt_date === 'string'
        ? d.appt_date.substring(0, 10)
        : null;
      onOpenAppt?.({ apptId: d.appointment_id, date: dateIso });
    }
  };

  return (
    <div style={{ padding: '12px 16px 0' }}>
      {/* Barre actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        gap: 8,
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.text }}>
            Notifications
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: t.muted }}>
            {notifications.length === 0
              ? 'Aucune notification'
              : `${notifications.length} au total${unreadCount > 0 ? ` · ${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              style={{
                fontSize: 11, fontWeight: 500,
                padding: '6px 10px', borderRadius: 8,
                background: 'transparent',
                border: `0.5px solid ${t.borderStrong}`,
                color: t.text, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Tout lire
            </button>
          )}
          <button
            type="button"
            onClick={reload}
            aria-label="Rafraichir"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'transparent',
              border: `0.5px solid ${t.border}`,
              color: t.muted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit', padding: 0,
            }}
          >
            <I.Refresh width={14} height={14} />
          </button>
        </div>
      </div>

      {/* Liste */}
      {notifications.length === 0 ? (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: t.card,
          border: `0.5px dashed ${t.border}`,
          borderRadius: 12,
        }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.muted }}>
            Aucune notification
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifications.map((n) => {
            const cfg = NOTIF_CFG[n.type] || {
              Icon: I.Bell, label: 'Info', bg: t.cardAlt, accent: t.muted, text: t.textSub,
            };
            const d       = n.data || {};
            const empName = d.employee_name || null;
            const dateStr = fmtApptDate(d.appt_date);
            const timeStr = d.start_time || '';
            const hasRich = !!(empName || dateStr || timeStr);
            const Icon    = cfg.Icon;
            const clickable = !!d.appointment_id;

            return (
              <div
                key={n.id}
                onClick={() => clickable && handleOpen(n)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: n.is_read ? t.cardAlt : cfg.bg,
                  border: `0.5px solid ${t.border}`,
                  borderLeft: `2px solid ${cfg.accent}`,
                  cursor: clickable ? 'pointer' : 'default',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: n.is_read ? t.card : '#ffffff',
                  border: `0.5px solid ${t.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon style={{ width: 17, height: 17, color: cfg.accent }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 500, letterSpacing: 0.4,
                      padding: '2px 7px', borderRadius: 99,
                      background: n.is_read ? t.card : '#ffffff',
                      border: `0.5px solid ${cfg.accent}33`,
                      color: cfg.text,
                      textTransform: 'uppercase',
                    }}>{cfg.label}</span>
                    {!n.is_read && (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: cfg.accent, flexShrink: 0,
                      }} />
                    )}
                    <span style={{
                      marginLeft: 'auto', fontSize: 10, color: t.dim, flexShrink: 0,
                    }}>
                      {fmtRelative(n.created_at)}
                    </span>
                  </div>

                  {hasRich ? (
                    <>
                      <p style={{
                        margin: 0, fontSize: 14, fontWeight: 500, color: t.text,
                        lineHeight: 1.2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {empName || "— employe non renseigne —"}
                      </p>
                      {(d.client_name || d.service_name) && (
                        <p style={{
                          margin: '3px 0 0', fontSize: 12, color: t.textSub,
                          lineHeight: 1.35,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {d.client_name || ''}
                          {d.client_name && d.service_name ? ' · ' : ''}
                          {d.service_name || ''}
                        </p>
                      )}
                      {(dateStr || timeStr) && (
                        <div style={{
                          display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8,
                        }}>
                          {dateStr && (
                            <span style={{
                              fontSize: 13, fontWeight: 500, color: t.text,
                              textTransform: 'capitalize',
                            }}>{dateStr}</span>
                          )}
                          {timeStr && (
                            <span style={{
                              fontSize: 18, fontWeight: 500, color: cfg.text,
                              fontFamily: 'monospace', letterSpacing: 0.5,
                            }}>{timeStr}</span>
                          )}
                          {n.type === 'appointment_reminder' && d.minutes_before != null && (
                            <span style={{
                              fontSize: 11, color: cfg.text,
                              padding: '2px 7px', borderRadius: 99,
                              background: cfg.bg,
                              border: `0.5px solid ${cfg.accent}55`,
                            }}>
                              dans {d.minutes_before < 60
                                ? `${d.minutes_before} min`
                                : d.minutes_before < 1440
                                  ? `${d.minutes_before / 60}h`
                                  : `${Math.round(d.minutes_before / 1440)} j`}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p style={{
                        margin: 0, fontWeight: 500, fontSize: 14, color: t.text,
                        lineHeight: 1.3,
                      }}>
                        {stripLeadingEmoji(n.title)}
                      </p>
                      {n.body && (
                        <p style={{
                          margin: '3px 0 0', fontSize: 12, color: t.textSub, lineHeight: 1.4,
                        }}>
                          {stripLeadingEmoji(n.body)}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteNotif(n.id); }}
                  aria-label="Supprimer la notification"
                  style={{
                    width: 26, height: 26, borderRadius: 8,
                    background: 'transparent',
                    border: `0.5px solid ${t.border}`,
                    cursor: 'pointer', color: t.muted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontFamily: 'inherit',
                  }}
                >
                  <I.Trash style={{ width: 13, height: 13 }} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
