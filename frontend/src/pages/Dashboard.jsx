// src/pages/Dashboard.jsx — Refonte visuelle 2026, logique intacte (PIN, stats, historique)
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { todayStr } from '../utils/dates';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useEmployeePin } from '../hooks/useEmployeePin';
import { bookingApi, notifApi, paymentsApi, userSettingsApi } from '../utils/api';
import { I } from '../utils/icons';

// Refonte maquette dashboard (docs/maquette-dashboard.html) — accent violet
// LOCAL a cette page (pas le theme global). FDS-2026 : pas d'emoji, fw<=500,
// bordures 0.5px, pas de gradient. Logique inchangee (stats reelles, PIN,
// notifs, filtre employe). Couleurs pastel issues de la maquette.
const VIO   = '#7F77DD';
const VIOD  = '#534AB7';
const VIOBG = '#eeedfe';
// Paires pastel (bg + texte/accent meme famille) reprises de la maquette.
const TONE = {
  green:  { bg: '#EAF3DE', c: '#3B6D11' },
  violet: { bg: '#EEEDFE', c: '#534AB7' },
  teal:   { bg: '#E1F5EE', c: '#0F6E56' },
  amber:  { bg: '#FAEEDA', c: '#854F0B' },
  grey:   { bg: '#F1EFE8', c: '#5F5E5A' },
  redUp:  { bg: '#EAF3DE', c: '#3B6D11' },
  redDn:  { bg: '#FCEBEB', c: '#A32D2D' },
};

// Initiales (2 lettres max) pour les pastilles client / employe.
const initials = (s = '') => {
  const parts = String(s).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const nd   = d => { if (!d) return ''; const s = typeof d === 'string' ? d : new Date(d).toISOString(); return s.substring(0, 10); };
const fmt  = n => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Moyens de paiement — pastels sobres (bg + accent text de meme famille).
// 'card_online' = paiement Stripe Connect (acompte / integral) cote client,
// distinct de 'card' (CB au comptoir). Inclus pour l'affichage et les totaux
// du jour, mais reste lookupOnly (pas dans le selecteur d'encaissement manuel).
const PM_CFG = {
  cash:        { label: 'Especes',  color: '#065f46', bg: '#f0fdf4' },
  card:        { label: 'Carte',    color: '#4338ca', bg: '#eef2ff' },
  card_online: { label: 'En ligne', color: '#0891b2', bg: '#cffafe' },
  transfer:    { label: 'Virement', color: '#0e7490', bg: '#ecfeff' },
  other:       { label: 'Autre',    color: '#92400e', bg: '#fffbeb' },
};

// ── Modal sobre (reutilisee par les sous-modales) ───────────────────────────
function Modal({ open, onClose, title, children, theme: t, maxW = 520 }) {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex',
                  alignItems:'center', justifyContent:'center', padding:16 }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.4)',
                    backdropFilter:'blur(4px)' }} onClick={onClose}/>
      <div style={{ position:'relative', width:'100%', maxWidth:maxW, maxHeight:'92vh',
                    display:'flex', flexDirection:'column',
                    borderRadius:12, background:t.elevated,
                    border:`0.5px solid ${t.border}`, boxShadow:t.shadowModal }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'14px 18px', borderBottom:`0.5px solid ${t.separator}` }}>
          <p style={{ fontWeight:500, fontSize:15, color:t.text, margin:0 }}>{title}</p>
          <button onClick={onClose}
                  style={{ width:28, height:28, borderRadius:8, border:'none', cursor:'pointer',
                           background:t.cardAlt, color:t.muted, fontSize:15,
                           display:'flex', alignItems:'center', justifyContent:'center',
                           fontFamily:'inherit' }}>
            ×
          </button>
        </div>
        <div style={{ overflowY:'auto', flex:1 }}>{children}</div>
      </div>
    </div>
  );
}

// ── PinKeypad ────────────────────────────────────────────────────────────────
function PinKeypad({ onPress, theme: t }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, maxWidth:260, margin:'0 auto' }}>
      {keys.map((k, i) => k === '' ? <div key={i}/> : (
        <button key={k + i} onClick={() => onPress(k)}
                style={{ height:54, borderRadius:12, fontSize:19, fontWeight:500,
                         cursor:'pointer', userSelect:'none',
                         border:`0.5px solid ${t.border}`,
                         background: k === '⌫' ? t.cardAlt : t.card,
                         color: k === '⌫' ? t.muted : t.text,
                         boxShadow: t.shadowSm,
                         transition:'transform 0.08s', fontFamily:'inherit' }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                onMouseUp={e   => { e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
          {k}
        </button>
      ))}
    </div>
  );
}

// ── PinDots ──────────────────────────────────────────────────────────────────
function PinDots({ count, shake, theme: t }) {
  return (
    <div style={{ display:'flex', justifyContent:'center', gap:14, margin:'20px 0',
                  animation: shake ? 'shake 0.4s ease' : 'none' }}>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
      {[0,1,2,3].map(i => (
        <div key={i} style={{
          width:12, height:12, borderRadius:'50%',
          background: i < count ? t.text : t.separator,
          transition:'all 0.2s',
          transform: i < count ? 'scale(1.15)' : 'scale(1)',
        }}/>
      ))}
    </div>
  );
}

// ── PinAccessModal — selection employe + clavier PIN ────────────────────────
// Exporté pour être réutilisé par la page Historique (gate PIN à l'entrée).
export function PinAccessModal({ open, onClose, onSuccess, employees, theme: t, title = 'Acces protege', actionLabel = 'Acceder' }) {
  const { requiresPin, isSessionValid, verifyPin } = useEmployeePin();

  const [step, setStep]         = useState('select');
  const [selEmp, setSelEmp]     = useState(null);
  const [pin, setPin]           = useState('');
  const [err, setErr]           = useState('');
  const [shake, setShake]       = useState(false);
  const [busy, setBusy]         = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (open) { setStep('select'); setSelEmp(null); setPin(''); setErr(''); setShake(false); setBusy(false); setAttempts(0); }
  }, [open]);

  const activeEmps = employees.filter(e => e.is_active !== false);

  const handleSelectEmp = async (emp) => {
    setChecking(true);
    try {
      const needs = await requiresPin(emp.id);
      if (!needs) { onSuccess(); onClose(); return; }
      const sessionOk = await isSessionValid(emp.id);
      if (sessionOk) { onSuccess(); onClose(); return; }
      setSelEmp(emp); setPin(''); setErr(''); setAttempts(0); setStep('pin');
    } catch { onSuccess(); onClose(); }
    finally { setChecking(false); }
  };

  const press = async (k) => {
    if (busy) return;
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setErr(''); return; }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next); setErr('');
    if (next.length === 4) {
      setBusy(true);
      await new Promise(r => setTimeout(r, 80));
      const result = await verifyPin(selEmp.id, next);
      if (result.success) {
        setAttempts(0); onSuccess(); onClose();
      } else {
        const na = attempts + 1; setAttempts(na); setShake(true);
        const remaining = 3 - na;
        if (remaining <= 0) {
          setErr('Trop de tentatives. Acces refuse.');
          setTimeout(() => onClose(), 1500);
        } else {
          setErr(`Code incorrect (${na}/3)`);
          setTimeout(() => { setPin(''); setShake(false); setBusy(false); }, 700);
        }
      }
    }
  };

  if (!open) return null;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:16,
                  background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)' }}
         onClick={e => e.target === e.currentTarget && onClose()}>

      <div style={{ position:'relative', width:'100%', maxWidth:420, maxHeight:'92vh', overflowY:'auto',
                    borderRadius:12, padding:'24px 20px 28px',
                    background:t.elevated,
                    border:`0.5px solid ${t.border}`,
                    boxShadow:t.shadowModal }}>

        <button onClick={onClose}
                style={{ position:'absolute', top:14, right:14, width:28, height:28, borderRadius:'50%',
                         display:'flex', alignItems:'center', justifyContent:'center', border:'none', cursor:'pointer',
                         background:t.cardAlt, color:t.muted, fontSize:14, fontFamily:'inherit' }}>
          ×
        </button>

        {step === 'select' && (
          <>
            <p style={{ fontWeight:500, fontSize:15, color:t.text, margin:'0 0 4px', textAlign:'center' }}>{title}</p>
            <p style={{ fontSize:13, color:t.muted, margin:'0 0 20px', textAlign:'center' }}>Selectionnez votre profil</p>
            {checking ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:t.muted, fontSize:13 }}>Verification…</div>
            ) : activeEmps.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px 0' }}>
                <p style={{ fontSize:13, color:t.muted, marginBottom:14 }}>Aucun employe actif</p>
                <button onClick={() => { onSuccess(); onClose(); }}
                        style={{ padding:'10px 20px', borderRadius:8, border:'none', cursor:'pointer',
                                 background:t.text, color:t.bg, fontWeight:500, fontSize:14, fontFamily:'inherit' }}>
                  Acceder directement
                </button>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {activeEmps.map(emp => (
                  <button key={emp.id} onClick={() => handleSelectEmp(emp)}
                          style={{ display:'flex', alignItems:'center', gap:12,
                                   padding:'12px 14px', borderRadius:8, textAlign:'left', cursor:'pointer',
                                   border:`0.5px solid ${t.border}`, background:t.card,
                                   transition:'background 0.15s', fontFamily:'inherit' }}
                          onMouseEnter={e => { e.currentTarget.style.background = t.cardAlt; }}
                          onMouseLeave={e => { e.currentTarget.style.background = t.card; }}>
                    <div style={{ width:36, height:36, borderRadius:8, flexShrink:0,
                                  background: emp.avatar_color || t.text,
                                  display:'flex', alignItems:'center', justifyContent:'center',
                                  color:'#fff', fontWeight:500, fontSize:15 }}>
                      {(emp.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:500, fontSize:14, color:t.text, margin:0 }}>{emp.name}</p>
                      {emp.role && <p style={{ fontSize:12, color:t.muted, margin:0 }}>{emp.role}</p>}
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14, flexShrink:0 }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === 'pin' && selEmp && (
          <>
            <button onClick={() => { setStep('select'); setPin(''); setErr(''); }}
                    style={{ position:'absolute', top:14, left:14, width:28, height:28, borderRadius:'50%',
                             display:'flex', alignItems:'center', justifyContent:'center', border:'none', cursor:'pointer',
                             background:t.cardAlt, color:t.muted, fontSize:13, fontFamily:'inherit' }}>
              ←
            </button>

            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:6 }}>
              <div style={{ width:52, height:52, borderRadius:12, marginBottom:10,
                            background: selEmp.avatar_color || t.text,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color:'#fff', fontWeight:500, fontSize:20 }}>
                {(selEmp.name || '?').charAt(0).toUpperCase()}
              </div>
              <p style={{ fontWeight:500, fontSize:15, color:t.text, margin:0 }}>{selEmp.name}</p>
              <p style={{ fontSize:12, marginTop:6, padding:'3px 10px', borderRadius:99,
                          background:t.cardAlt, color:t.muted, margin:'6px 0 0' }}>
                {actionLabel}
              </p>
            </div>

            <p style={{ textAlign:'center', fontSize:13, color:t.muted, margin:'4px 0 0' }}>
              Code PIN requis pour valider
            </p>

            <PinDots count={pin.length} shake={shake} theme={t}/>

            <p style={{ fontSize:12, textAlign:'center', marginBottom:16, height:16,
                        color: err ? '#991b1b' : 'transparent' }}>
              {err || '·'}
            </p>

            <PinKeypad onPress={press} theme={t}/>

            <button onClick={onClose}
                    style={{ width:'100%', marginTop:20, padding:'10px', borderRadius:8,
                             fontSize:13, fontWeight:500, cursor:'pointer',
                             background:'transparent', color:t.text,
                             border:`0.5px solid ${t.borderStrong}`, fontFamily:'inherit' }}>
              Annuler
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── NotifModal ───────────────────────────────────────────────────────────────
// FDS-2026 : cartes pastel + borderLeft 2px accent, icônes Lucide, employé
// concerné + date + heure affichés en grand pour lecture rapide. Distinction
// visuelle claire : Nouveau RDV (indigo) · Rappel (ambre) · Caisse (vert).
// Refonte FDS-2026 commit 13 : type daily_recap ajouté (carte neutre).
const NOTIF_CFG = {
  new_appointment:      { Icon: I.Calendar, label: 'Nouveau RDV', bg: '#eef2ff', accent: '#6366f1', text: '#4338ca' },
  appointment_reminder: { Icon: I.Clock,    label: 'Rappel RDV',  bg: '#fffbeb', accent: '#f59e0b', text: '#92400e' },
  caisse:               { Icon: I.Wallet,   label: 'Caisse',      bg: '#f0fdf4', accent: '#10b981', text: '#065f46' },
  daily_recap:          { Icon: I.BarCh,    label: 'Récap jour',  bg: '#f9fafb', accent: '#6b7280', text: '#374151' },
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
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};

const fmtRelative = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)    return "A l'instant";
  if (diff < 3600000)  return `Il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

function NotifModal({ open, onClose, theme: t }) {
  const [notifs, setNotifs]   = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate              = useNavigate();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    notifApi.getInApp({ limit:50 })
      .then(d => setNotifs(d.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const markRead    = async id => { await notifApi.markRead({ id }).catch(() => {}); setNotifs(p => p.map(n => n.id === id ? { ...n, is_read:true } : n)); };
  const del         = async id => { await notifApi.deleteInApp(id).catch(() => {}); setNotifs(p => p.filter(n => n.id !== id)); };
  const clearAll    = async ()  => { await Promise.all(notifs.map(n => notifApi.deleteInApp(n.id))).catch(() => {}); setNotifs([]); };
  // Refonte FDS-2026 commit 13 : "Tout marquer lu" côté serveur
  // (PATCH /api/notifications/inapp/read {all:true}), pas de DELETE.
  const markAllRead = async ()  => {
    await notifApi.markRead({ all: true }).catch(() => {});
    setNotifs(p => p.map(n => ({ ...n, is_read: true })));
  };

  // Clic sur une notif : marque lue + deep-link vers le RDV concerné
  // (ou /agenda générique si pas d'url). Même validation path interne que le SW
  // et la cloche NotificationCenter — refuse javascript:, data:, //evil, etc.
  const openNotif = (n) => {
    if (!n.is_read) markRead(n.id);
    const raw = n?.data?.url;
    let target = null;
    if (typeof raw === 'string' && raw.length && raw[0] === '/' && !raw.startsWith('//')
        && !/[\x00-\x1f]/.test(raw) && !raw.includes('\\')) {
      target = raw;
    } else if (n?.data?.appointment_id) {
      // Fallback intelligent : reconstruit le deep-link depuis les champs
      // data.appointment_id + data.appt_date pour les anciennes notifs sans
      // data.url. L'agenda saute alors au bon jour + ouvre le modal du RDV.
      const apptId = n.data.appointment_id;
      const apptDate = n.data.appt_date;
      if (apptId && apptDate && /^\d{4}-\d{2}-\d{2}$/.test(apptDate)) {
        target = `/agenda?date=${apptDate}&appt=${encodeURIComponent(apptId)}`;
      } else {
        target = '/agenda';
      }
    }
    if (target) { onClose(); navigate(target); }
  };

  const unread = notifs.filter(n => !n.is_read).length;
  const sep = `0.5px solid ${t.separator}`;

  return (
    <Modal open={open} onClose={onClose} theme={t} title={`Notifications${unread > 0 ? ` · ${unread} non lues` : ''}`}>
      {notifs.length > 0 && (
        <div style={{ padding:'10px 16px 8px', borderBottom:sep, display:'flex',
                      justifyContent:'flex-end', gap: 8 }}>
          {unread > 0 && (
            <button onClick={markAllRead}
                    style={{ fontSize:12, color: t.text,
                             background: t.cardAlt, border:'none', cursor:'pointer',
                             padding:'5px 10px', borderRadius:8, fontFamily:'inherit', fontWeight:500 }}>
              {"Tout marquer lu"}
            </button>
          )}
          <button onClick={clearAll}
                  style={{ fontSize:12, color:'#991b1b',
                           background:'rgba(239,68,68,0.08)', border:'none', cursor:'pointer',
                           padding:'5px 10px', borderRadius:8, fontFamily:'inherit', fontWeight:500 }}>
            Effacer tout
          </button>
        </div>
      )}
      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:t.muted, fontSize:13 }}>Chargement…</div>
      ) : notifs.length === 0 ? (
        <div style={{ padding:'48px 20px', textAlign:'center' }}>
          <p style={{ fontSize:13, color:t.muted, margin:0 }}>Aucune notification</p>
        </div>
      ) : (
        <div style={{ padding:'8px 0 14px' }}>
          {notifs.map((n) => {
            const cfg = NOTIF_CFG[n.type] || {
              Icon: I.Bell, label: 'Info', bg: t.cardAlt, accent: t.muted, text: t.textSub,
            };
            const d = n.data || {};
            const empName = d.employee_name || null;
            const dateStr = fmtApptDate(d.appt_date);
            const timeStr = d.start_time || '';
            const hasRich = !!(empName || dateStr || timeStr);
            const Icon    = cfg.Icon;

            return (
              <div key={n.id} onClick={() => openNotif(n)}
                   style={{ margin:'10px 16px', padding:'14px 16px',
                            borderRadius:12,
                            background: n.is_read ? t.cardAlt : cfg.bg,
                            border:`0.5px solid ${t.border}`,
                            borderLeft:`2px solid ${cfg.accent}`,
                            cursor:'pointer',
                            display:'flex', gap:12, alignItems:'flex-start' }}>
                <div style={{ width:44, height:44, borderRadius:8,
                              background: n.is_read ? t.card : '#ffffff',
                              border:`0.5px solid ${t.border}`,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              flexShrink:0 }}>
                  <Icon style={{ width:20, height:20, color:cfg.accent }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:10, fontWeight:500, letterSpacing:'0.05em',
                                   padding:'3px 8px', borderRadius:99,
                                   background: n.is_read ? t.card : '#ffffff',
                                   border:`0.5px solid ${cfg.accent}33`,
                                   color:cfg.text, textTransform:'uppercase' }}>
                      {cfg.label}
                    </span>
                    {!n.is_read && (
                      <span style={{ width:7, height:7, borderRadius:'50%', background:cfg.accent }} />
                    )}
                    <span style={{ marginLeft:'auto', fontSize:11, color:t.dim }}>
                      {fmtRelative(n.created_at)}
                    </span>
                  </div>

                  {hasRich ? (
                    <>
                      <div style={{ display:'flex', alignItems:'center', gap:6,
                                    marginBottom:2, minWidth:0 }}>
                        <I.User style={{ width:14, height:14, color:t.muted, flexShrink:0 }} />
                        <p style={{ margin:0, fontSize:18, fontWeight:500, color:t.text,
                                    lineHeight:1.2, overflow:'hidden',
                                    textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {empName || '— employé non renseigné —'}
                        </p>
                      </div>
                      {(d.client_name || d.service_name) && (
                        <p style={{ margin:'4px 0 0', fontSize:13, color:t.textSub,
                                    lineHeight:1.35, overflow:'hidden',
                                    textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {d.client_name || ''}
                          {d.client_name && d.service_name ? ' · ' : ''}
                          {d.service_name || ''}
                        </p>
                      )}
                      {(dateStr || timeStr) && (
                        <div style={{ display:'flex', alignItems:'baseline', gap:12,
                                      marginTop:10, flexWrap:'wrap' }}>
                          {dateStr && (
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6,
                                           fontSize:15, fontWeight:500, color:t.text,
                                           textTransform:'capitalize' }}>
                              <I.Calendar style={{ width:14, height:14, color:t.muted }} />
                              {dateStr}
                            </span>
                          )}
                          {timeStr && (
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6,
                                           fontSize:22, fontWeight:500, color:cfg.text,
                                           fontFamily:'monospace', letterSpacing:0.5, lineHeight:1 }}>
                              <I.Clock style={{ width:15, height:15, color:cfg.accent }} />
                              {timeStr}
                            </span>
                          )}
                          {n.type === 'appointment_reminder' && d.minutes_before != null && (
                            <span style={{ fontSize:11, color:cfg.text,
                                           padding:'3px 9px', borderRadius:99,
                                           background:cfg.bg,
                                           border:`0.5px solid ${cfg.accent}55` }}>
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
                      <p style={{ margin:0, fontWeight:500, fontSize:14, color:t.text,
                                  lineHeight:1.3 }}>
                        {stripLeadingEmoji(n.title)}
                      </p>
                      {n.body && (
                        <p style={{ margin:'4px 0 0', fontSize:12, color:t.textSub,
                                    lineHeight:1.4 }}>
                          {stripLeadingEmoji(n.body)}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <button onClick={e => { e.stopPropagation(); del(n.id); }}
                        aria-label="Supprimer la notification"
                        style={{ width:28, height:28, borderRadius:8,
                                 border:`0.5px solid ${t.border}`,
                                 cursor:'pointer', flexShrink:0,
                                 background:'transparent', color:t.muted,
                                 display:'flex', alignItems:'center', justifyContent:'center',
                                 fontFamily:'inherit' }}>
                  <I.Trash style={{ width:14, height:14 }} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {/* Refonte FDS-2026 commit 13 : pied "Voir tout l'historique".
          Les notifs sont liées aux RDV, on renvoie vers l'agenda qui
          montre les RDV du jour + passés via sa vue Liste. */}
      {notifs.length > 0 && (
        <div style={{ padding:'10px 16px 14px', borderTop:sep,
                      display:'flex', justifyContent:'center' }}>
          <button onClick={() => { onClose(); navigate('/agenda'); }}
                  style={{ fontSize:12, color: t.muted,
                           background:'transparent', border:'none', cursor:'pointer',
                           fontFamily:'inherit', fontWeight:500,
                           padding:'6px 10px', borderRadius:8 }}>
            {"Voir tout l'historique →"}
          </button>
        </div>
      )}
    </Modal>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
// Stats/Historique : les 2 anciennes popups ont été fusionnées dans la page
// /historique (accès PIN au chargement, filtre employé qui recalcule tout le
// CA/stats en direct). Les tuiles Dashboard pointent maintenant vers cette
// page unique.
// Refonte FDS-2026 commit 9 : Dashboard orienté métier.
// - 4 KPIs (CA jour, RDV, ventes caisse, SMS restants)
// - Alertes proactives (SMS bas, notifications non lues)
// - 2 colonnes Prochains RDV / Activité équipe
// - 2 colonnes Moyens paiement pastel / CA 7j bars
// - 4 raccourcis (Encaisser, Nouveau RDV, Créer promo, Nouveau client)
// Seuls `PinAccessModal` (consommé par pages/Historique + pages/caisse/Historique)
// et `export default Dashboard` (App.jsx) sont exposés. HistoriqueModal/StatsModal
// (fusionnés dans /historique) et le bloc Tile* (remplacé par des boutons inline)
// ont été retirés : code mort non rendu, non exporté.
export default function Dashboard({ transactions, employees, onAdd, onNavigate, unreadNotifCount = 0 }) {
  const { theme: t, toggle, isLight } = useTheme();
  const { user }     = useAuth();
  const navigate     = useNavigate();

  const [todayAppts,    setTodayAppts]    = useState([]);
  const [showNotifs,    setShowNotifs]    = useState(false);
  const [smsBalance,    setSmsBalance]    = useState(null);
  const [smsThreshold,  setSmsThreshold]  = useState(20);
  // UX commit 7d : filtre employé commun à Prochains RDV / Activité équipe
  // / Historique du jour. 'all' = tous. Les chips passent actif bg #111827.
  const [empFilter,     setEmpFilter]     = useState('all');

  const today = todayStr();
  const now   = new Date();

  useEffect(() => {
    bookingApi.getAppointments({ from: today, to: today })
      .then(d => setTodayAppts(Array.isArray(d) ? d : []))
      .catch(() => {});
    paymentsApi.getSMSBalance()
      .then(r => setSmsBalance(parseFloat(r?.balance ?? 0)))
      .catch(() => setSmsBalance(null));
    userSettingsApi.get()
      .then(r => setSmsThreshold(Number(r?.sms_low_balance_threshold ?? 20)))
      .catch(() => {});
  }, [today]);

  // ── Calculs dérivés depuis `transactions` (déjà scoped user_id côté back).
  const { caToday, nbSales, byPM, pmTxCount, ca7j, maxCA7, empActivity, todayTxAll, caYest, ySales } = useMemo(() => {
    const todayTxAll = transactions.filter(tx => nd(tx.date) === today && tx.type === 'revenue');
    const todayTx = todayTxAll;
    const caToday = todayTx.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);

    // Ventilation par moyen de paiement : 'multi' éclaté par sous-ligne.
    // 'card_online' inclus pour comptabiliser les paiements Stripe Connect
    // (acompte ou intégral) — sans cette clé, ils tombaient dans 'other'.
    const byPM      = { cash:0, card:0, card_online:0, transfer:0, other:0, multi:0 };
    // Nombre de transactions par moyen de paiement (au niveau ligne, le
    // 'multi' compte 1 fois — affiche "{n} tx" sous chaque carte maquette).
    const pmTxCount = { cash:0, card:0, card_online:0, transfer:0, other:0, multi:0 };
    todayTx.forEach(tx => {
      if (tx.payment_method === 'multi' && Array.isArray(tx.payments) && tx.payments.length) {
        pmTxCount.multi += 1;
        tx.payments.forEach(p => {
          const k = p.payment_method || 'other';
          byPM[k in byPM ? k : 'other'] += parseFloat(p.amount) || 0;
        });
      } else {
        const k = tx.payment_method || 'other';
        const kk = k in byPM ? k : 'other';
        byPM[kk]      += parseFloat(tx.amount) || 0;
        pmTxCount[kk] += 1;
      }
    });

    // CA 7 derniers jours (J-6 → J).
    const ca7j = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const amount = transactions
        .filter(tx => nd(tx.date) === key && tx.type === 'revenue')
        .reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
      ca7j.push({ date: key, day: d.toLocaleDateString('fr-FR', { weekday: 'short' }), amount });
    }
    const maxCA7 = Math.max(1, ...ca7j.map(d => d.amount));

    // Hier (J-1) : CA + nb ventes — pour les pastilles de variation "vs hier".
    const yKey  = ca7j.length >= 2 ? ca7j[ca7j.length - 2].date : null;
    const yTx   = yKey ? transactions.filter(tx => nd(tx.date) === yKey && tx.type === 'revenue') : [];
    const caYest = yTx.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
    const ySales = yTx.length;

    // Activité équipe (tx aujourd'hui par employé actif, tri CA desc).
    const empActivity = employees
      .filter(e => e.is_active !== false)
      .map(e => {
        const tx = todayTx.filter(x => x.employee_id === e.id);
        return { ...e, count: tx.length, ca: tx.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0) };
      })
      .sort((a, b) => b.ca - a.ca);

    return { caToday, nbSales: todayTx.length, byPM, pmTxCount, ca7j, maxCA7, empActivity, todayTxAll, caYest, ySales };
  }, [transactions, today, employees]);

  // Prochains RDV aujourd'hui (heure > maintenant, non annulés).
  // Filtré par empFilter si chip actif.
  const nowMin   = now.getHours() * 60 + now.getMinutes();
  const upcoming = todayAppts
    .filter(a => {
      if (a.status === 'cancelled' || a.status === 'completed') return false;
      if (empFilter !== 'all' && a.employee_id !== empFilter) return false;
      const [h, m] = String(a.start_time || '').substring(0, 5).split(':').map(Number);
      return (h * 60 + m) > nowMin;
    })
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
    .slice(0, 6);

  // UX commit 7d : activité équipe filtrée par chip (ou tous si 'all').
  const empActivityFiltered = empFilter === 'all'
    ? empActivity
    : empActivity.filter(e => e.id === empFilter);

  // UX commit 7d : historique du jour ligne par ligne, filtrable par employé.
  const todayTxFiltered = (todayTxAll || [])
    .filter(tx => empFilter === 'all' || tx.employee_id === empFilter)
    .slice()
    .sort((a, b) => {
      const ta = String(a.time || '').padStart(5, '0');
      const tb = String(b.time || '').padStart(5, '0');
      return tb.localeCompare(ta); // desc (dernier encaissé en haut)
    });

  // Alertes proactives.
  const alerts = [];
  if (smsBalance !== null && smsBalance < smsThreshold) {
    alerts.push({
      id: 'sms', level: 'warn',
      label: "Solde SMS bas · " + fmt(smsBalance) + " DA (seuil " + fmt(smsThreshold) + " DA)",
      onClick: () => navigate('/marketing/sms'),
    });
  }
  if (unreadNotifCount > 0) {
    alerts.push({
      id: 'notifs', level: 'info',
      label: unreadNotifCount + " notification" + (unreadNotifCount > 1 ? "s" : "") + " non lue" + (unreadNotifCount > 1 ? "s" : ""),
      onClick: () => setShowNotifs(true),
    });
  }

  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  const activeEmps = (employees || []).filter(e => e.is_active !== false);
  const empNames   = activeEmps.map(e => e.name).filter(Boolean).join(', ');
  const empById    = id => (employees || []).find(e => e.id === id);

  // Montants façon maquette : entier + séparateur milliers ("1 179 DA").
  const eur = n => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  // KPIs maquette : ticket moyen + RDV terminés/restants.
  const ticket     = nbSales  ? caToday / nbSales : 0;
  const ticketYest = ySales   ? caYest  / ySales  : 0;
  const rdvDone    = todayAppts.filter(a => a.status === 'completed').length;
  const rdvLeft    = todayAppts.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length;
  const smsLow     = smsBalance !== null && smsBalance < smsThreshold;
  const total7j    = ca7j.reduce((s, d) => s + d.amount, 0);

  // ── Styles partagés (maquette : carte blanche, radius 10, bordure 0.5px) ──
  const card  = { borderRadius: 10, background: t.card, border: "0.5px solid " + t.border, padding: 14 };
  const label = { margin: 0, fontSize: 10, fontWeight: 500, color: t.muted,
                  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 };

  // Pastille de variation "vs hier" (vert si hausse, rouge si baisse).
  const Pill = ({ cur, prev }) => {
    if (!prev || prev <= 0) return null;
    const pct = Math.round(((cur - prev) / prev) * 100);
    const up  = pct >= 0;
    const tn  = up ? TONE.redUp : TONE.redDn;
    const Ic  = up ? I.TrendUp : I.TrendDown;
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap: 3,
                     marginTop: 6, fontSize: 10, fontWeight: 500,
                     borderRadius: 99, padding:'2px 8px',
                     background: tn.bg, color: tn.c }}>
        <Ic style={{ width: 10, height: 10 }}/>
        {(up ? "+" : "") + pct + "% vs hier"}
      </span>
    );
  };

  // 4 moyens de paiement maquette + Autre/Multi ajoutés seulement si > 0
  // (zéro perte de visibilité sur les montants encaissés).
  const pmCards = [
    { id:'cash',        tone: TONE.green,  Icon: I.Wallet },
    { id:'card',        tone: TONE.violet, Icon: I.CreditCard },
    { id:'card_online', tone: TONE.teal,   Icon: I.Wifi },
    { id:'transfer',    tone: TONE.amber,  Icon: I.Refresh },
  ];
  if ((byPM.other || 0) > 0) pmCards.push({ id:'other', tone: TONE.grey,   Icon: I.MoreH });
  if ((byPM.multi || 0) > 0) pmCards.push({ id:'multi', tone: TONE.violet, Icon: I.Wallet });

  // Grille de navigation 4×2 (routes réelles, protégées RequireAdminMode).
  const navItems = [
    { label:'Agenda',     Icon: I.Calendar, to:'/agenda',       badge: todayAppts.length ? todayAppts.length + " RDV" : null },
    { label:'Caisse',     Icon: I.Wallet,   to:'/caisse'      },
    { label:'Clients',    Icon: I.Users,    to:'/clients'     },
    { label:'Marketing',  Icon: I.Send,     to:'/marketing'   },
    { label:'Historique', Icon: I.Clock,    to:'/historique'  },
    { label:'Stats',      Icon: I.BarCh,    to:'/statistiques', lock: true },
    { label:'Abonnement', Icon: I.Star,     to:'/abonnement'  },
    { label:'Réglages',   Icon: I.Settings, to:'/reglages'    },
  ];

  // Sparkline CA 7j (SVG polyline + aire). Repère maquette : 580×52.
  const SW = 580, SH = 52, TOP = 6, BOT = 46;
  const pts = ca7j.map((d, i) => {
    const x = ca7j.length > 1 ? (i * SW) / (ca7j.length - 1) : 0;
    const y = BOT - (d.amount / maxCA7) * (BOT - TOP);
    return [Math.round(x), Math.round(y)];
  });
  const line = pts.map(p => p.join(',')).join(' ');
  const area = "0," + SH + " " + line + " " + SW + "," + SH;
  const last = pts[pts.length - 1] || [SW, TOP];

  return (
    <div style={{ minHeight:'100vh', background: t.bg, paddingBottom: 32 }}>
      {/* ── TopBar sticky : avatar salon + date/équipe + cloche + thème + Encaisser ── */}
      <div style={{ position:'sticky', top: 0, zIndex: 10,
                    background: t.card, borderBottom: "0.5px solid " + t.border,
                    padding:'12px 16px', display:'flex', alignItems:'center',
                    justifyContent:'space-between', gap: 10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: VIO, color:'#fff', fontWeight: 500, fontSize: 14,
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
            {(user?.businessName || 'F').charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: t.text,
                        lineHeight: 1.2, overflow:'hidden', textOverflow:'ellipsis',
                        whiteSpace:'nowrap' }}>
              {user?.businessName || "Tableau de bord"}
            </p>
            <p style={{ margin:'2px 0 0', fontSize: 11, color: t.muted,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {dateCap}{empNames ? " · " + empNames : ""}
            </p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap: 8, flexShrink: 0 }}>
          <button onClick={() => setShowNotifs(true)} aria-label="Notifications"
                  style={{ position:'relative', width: 34, height: 34, borderRadius: 8,
                           border: "0.5px solid " + t.border, background: t.card,
                           color: t.muted, cursor:'pointer', fontFamily:'inherit',
                           display:'flex', alignItems:'center', justifyContent:'center' }}>
            <I.Bell style={{ width: 16, height: 16 }}/>
            {unreadNotifCount > 0 && (
              <span style={{ position:'absolute', top: -4, right: -4,
                             background:'#E24B4A', color:'#fff', fontSize: 9,
                             fontWeight: 500, padding:'1px 5px', borderRadius: 99,
                             border: "2px solid " + t.card }}>
                {unreadNotifCount}
              </span>
            )}
          </button>
          <button onClick={toggle} aria-label="Changer de thème"
                  style={{ width: 34, height: 34, borderRadius: 8,
                           border: "0.5px solid " + t.border, background: t.card,
                           color: t.muted, cursor:'pointer', fontFamily:'inherit',
                           display:'flex', alignItems:'center', justifyContent:'center' }}>
            {isLight ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            )}
          </button>
          <button onClick={onAdd}
                  style={{ display:'inline-flex', alignItems:'center', gap: 5,
                           padding:'8px 14px', borderRadius: 8, border:'none',
                           background: VIO, color:'#fff', cursor:'pointer',
                           fontFamily:'inherit', fontSize: 13, fontWeight: 500 }}>
            <I.Zap style={{ width: 13, height: 13 }}/> {"Encaisser"}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1120, margin:'0 auto', padding:'14px 16px',
                    display:'flex', flexDirection:'column', gap: 12 }}>

        {/* ── Bannières alertes (maquette : pastel ambre / violet) ── */}
        {alerts.map(a => {
          const warn = a.level === 'warn';
          return (
            <div key={a.id}
                 style={{ display:'flex', alignItems:'center', gap: 8,
                          borderRadius: 8, padding:'8px 12px',
                          background: warn ? '#FAEEDA' : VIOBG,
                          border: "0.5px solid " + (warn ? '#EF9F27' : '#AFA9EC') }}>
              {warn
                ? <svg viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round"
                       style={{ width: 15, height: 15, flexShrink: 0 }}>
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                : <I.Bell style={{ width: 15, height: 15, color: VIOD, flexShrink: 0 }}/>}
              <span style={{ flex: 1, fontSize: 12, color: warn ? '#633806' : VIOD }}>
                {a.label}
              </span>
              <button onClick={a.onClick}
                      style={{ border:'none', background:'transparent', cursor:'pointer',
                               fontFamily:'inherit', fontSize: 11, fontWeight: 500,
                               textDecoration:'underline',
                               color: warn ? '#854F0B' : VIOD }}>
                {warn ? "Recharger" : "Voir"}
              </button>
            </div>
          );
        })}

        {/* ── Encaissements du jour (4 cartes moyen de paiement) ── */}
        <div>
          <p style={label}>{"Encaissements du jour"}</p>
          <div style={{ display:'grid',
                        gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: 8 }}>
            {pmCards.map(({ id, tone, Icon }) => (
              <div key={id} style={{ ...card, padding:'11px 10px',
                                      display:'flex', flexDirection:'column', gap: 4 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6,
                              background: tone.bg, marginBottom: 2,
                              display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon style={{ width: 14, height: 14, color: tone.c }}/>
                </div>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 500, color: t.muted }}>
                  {id === 'multi' ? "Multi" : PM_CFG[id]?.label}
                </p>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 500, color: t.text,
                            lineHeight: 1 }}>
                  {eur(byPM[id] || 0)} DA
                </p>
                <p style={{ margin: 0, fontSize: 10, color: t.muted }}>
                  {(pmTxCount[id] || 0) + " tx"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Navigation rapide 4×2 ── */}
        <div>
          <p style={label}>{"Navigation rapide"}</p>
          <div style={{ display:'grid',
                        gridTemplateColumns:'repeat(auto-fit, minmax(84px, 1fr))',
                        gap: 8 }}>
            {navItems.map(n => (
              <button key={n.to} onClick={() => navigate(n.to)}
                      style={{ ...card, padding:'11px 6px', cursor:'pointer',
                               fontFamily:'inherit', display:'flex',
                               flexDirection:'column', alignItems:'center', gap: 5,
                               transition:'background 0.15s ease' }}
                      onMouseEnter={e => { e.currentTarget.style.background = t.cardAlt; }}
                      onMouseLeave={e => { e.currentTarget.style.background = t.card; }}>
                <n.Icon style={{ width: 20, height: 20, color: t.muted }}/>
                <span style={{ fontSize: 10, fontWeight: 500, color: t.muted,
                               textAlign:'center', lineHeight: 1.2,
                               display:'inline-flex', alignItems:'center', gap: 3 }}>
                  {n.label}
                  {n.lock && <I.Lock style={{ width: 10, height: 10 }}/>}
                </span>
                {n.badge && (
                  <span style={{ background: VIOBG, color: VIOD, fontSize: 9,
                                 fontWeight: 500, borderRadius: 99, padding:'2px 7px' }}>
                    {n.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── KPIs du jour 2×2 ── */}
        <div>
          <p style={label}>{"KPIs du jour"}</p>
          <div style={{ display:'grid',
                        gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: 8 }}>
            <div style={{ ...card }}>
              <p style={{ ...label, marginBottom: 5 }}>{"CA total"}</p>
              <p style={{ margin: 0, fontSize: 21, fontWeight: 500, color: t.text,
                          lineHeight: 1 }}>{eur(caToday)} DA</p>
              <Pill cur={caToday} prev={caYest}/>
            </div>
            <div style={{ ...card }}>
              <p style={{ ...label, marginBottom: 5 }}>{"Ticket moyen"}</p>
              <p style={{ margin: 0, fontSize: 21, fontWeight: 500, color: t.text,
                          lineHeight: 1 }}>{eur(ticket)} DA</p>
              <Pill cur={ticket} prev={ticketYest}/>
            </div>
            <div style={{ ...card }}>
              <p style={{ ...label, marginBottom: 5 }}>{"RDV du jour"}</p>
              <p style={{ margin: 0, fontSize: 21, fontWeight: 500, color: t.text,
                          lineHeight: 1 }}>{todayAppts.length}</p>
              <p style={{ margin:'4px 0 0', fontSize: 11, color: t.muted }}>
                {rdvDone + " terminés · " + rdvLeft + " restants"}
              </p>
            </div>
            <div style={{ ...card }}>
              <p style={{ ...label, marginBottom: 5,
                          color: smsLow ? '#A32D2D' : t.muted }}>{"SMS restants"}</p>
              <p style={{ margin: 0, fontSize: 21, fontWeight: 500,
                          color: smsLow ? '#A32D2D' : t.text, lineHeight: 1 }}>
                {smsBalance === null ? "…" : fmt(smsBalance) + " DA"}
              </p>
              <p style={{ margin:'4px 0 0', fontSize: 11, color: t.muted }}>
                {"seuil alerte : " + smsThreshold + " DA"}
              </p>
            </div>
          </div>
        </div>

        {/* ── Sparkline CA · 7 derniers jours ── */}
        <div style={{ ...card }}>
          <div style={{ display:'flex', justifyContent:'space-between',
                        alignItems:'baseline', marginBottom: 8 }}>
            <span style={{ ...label, marginBottom: 0 }}>{"CA · 7 derniers jours"}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: t.text }}>
              {"Total : " + eur(total7j) + " DA"}
            </span>
          </div>
          <svg width="100%" height="52" viewBox={"0 0 " + SW + " " + SH}
               preserveAspectRatio="none">
            <polyline points={area} fill={VIOBG} stroke="none" opacity="0.6"/>
            <polyline points={line} fill="none" stroke={VIO} strokeWidth="1.5"
                      strokeLinejoin="round" strokeLinecap="round"/>
            <circle cx={last[0]} cy={last[1]} r="3" fill={VIO}/>
          </svg>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop: 5 }}>
            {ca7j.map((d, i) => {
              const isToday = d.date === today;
              return (
                <span key={d.date}
                      style={{ fontSize: 10, textTransform:'capitalize',
                               fontWeight: isToday ? 500 : 400,
                               color: isToday ? VIOD : t.muted }}>
                  {isToday ? "Auj." : d.day}
                </span>
              );
            })}
          </div>
        </div>

        {/* ── Chips filtre employé (commun RDV / équipe / historique) ── */}
        {activeEmps.length > 1 && (
          <div style={{ display:'flex', gap: 6, flexWrap:'wrap' }}>
            {[{ id:'all', label:'Tous' },
              ...activeEmps.map(e => ({ id: e.id, label: e.name }))].map(chip => {
              const on = empFilter === chip.id;
              return (
                <button key={chip.id} onClick={() => setEmpFilter(chip.id)}
                        style={{ padding:'6px 12px', borderRadius: 99, border:'none',
                                 background: on ? VIO : t.cardAlt,
                                 color: on ? '#fff' : t.muted,
                                 fontSize: 11, fontWeight: 500, cursor:'pointer',
                                 fontFamily:'inherit', whiteSpace:'nowrap' }}>
                  {chip.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Prochains RDV ── */}
        <div>
          <p style={label}>{"Prochains RDV"}</p>
          <div style={{ ...card, padding: 0, overflow:'hidden' }}>
            {upcoming.length === 0 ? (
              <p style={{ margin: 0, padding:'16px 14px', fontSize: 12, color: t.muted }}>
                {"Aucun RDV restant aujourd'hui."}
              </p>
            ) : (
              <>
                {upcoming.map(a => {
                  const emp   = empById(a.employee_id);
                  const tone  = emp?.avatar_color || VIO;
                  const cName = a.client_name || a.client_email || "Sans nom";
                  const price = parseFloat(a.total_amount) || parseFloat(a.service_price) || 0;
                  return (
                    <div key={a.id}
                         style={{ display:'flex', alignItems:'center', gap: 10,
                                  padding:'10px 12px',
                                  borderBottom: "0.5px solid " + t.separator }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: t.muted,
                                     minWidth: 36, fontFamily:'monospace' }}>
                        {String(a.start_time || '').substring(0, 5)}
                      </span>
                      <span style={{ width: 6, height: 6, borderRadius:'50%',
                                     background: tone, flexShrink: 0 }}/>
                      <span style={{ width: 30, height: 30, borderRadius:'50%',
                                     background: tone, color:'#fff', flexShrink: 0,
                                     display:'flex', alignItems:'center',
                                     justifyContent:'center', fontSize: 11,
                                     fontWeight: 500 }}>
                        {initials(cName)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: t.text,
                                    overflow:'hidden', textOverflow:'ellipsis',
                                    whiteSpace:'nowrap' }}>
                          {cName}
                        </p>
                        <p style={{ margin: 0, fontSize: 10, color: t.muted,
                                    overflow:'hidden', textOverflow:'ellipsis',
                                    whiteSpace:'nowrap' }}>
                          {(a.service_name || "RDV") + (emp ? " · " + emp.name : "")}
                        </p>
                      </div>
                      {price > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 500, color: t.text,
                                       flexShrink: 0 }}>
                          {eur(price)} DA
                        </span>
                      )}
                    </div>
                  );
                })}
                <button onClick={() => navigate('/agenda')}
                        style={{ width:'100%', padding:'12px 14px', border:'none',
                                 background:'transparent', cursor:'pointer',
                                 fontFamily:'inherit', fontSize: 12, color: t.muted }}>
                  {"Voir l'agenda complet →"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Équipe · CA du jour ── */}
        <div>
          <p style={label}>{"Équipe · CA du jour"}</p>
          <div style={{ ...card, padding: 0, overflow:'hidden' }}>
            {empActivityFiltered.length === 0 ? (
              <p style={{ margin: 0, padding:'16px 14px', fontSize: 12, color: t.muted }}>
                {"Aucun employé actif."}
              </p>
            ) : empActivityFiltered.slice(0, 6).map(e => (
              <div key={e.id}
                   style={{ display:'flex', alignItems:'center', gap: 10,
                            padding:'9px 12px',
                            borderBottom: "0.5px solid " + t.separator }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                               background: e.avatar_color || VIO, color:'#fff',
                               display:'flex', alignItems:'center',
                               justifyContent:'center', fontSize: 11, fontWeight: 500 }}>
                  {(e.name || '?').charAt(0).toUpperCase()}
                </span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: t.text,
                               overflow:'hidden', textOverflow:'ellipsis',
                               whiteSpace:'nowrap' }}>
                  {e.name}
                </span>
                <span style={{ fontSize: 10, color: t.muted, minWidth: 40,
                               textAlign:'right' }}>
                  {e.count + " tx"}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500, color: t.text }}>
                  {eur(e.ca)} DA
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Historique du jour · ligne par ligne (multi éclatés §15) ── */}
        <div>
          <div style={{ display:'flex', alignItems:'flex-end',
                        justifyContent:'space-between', marginBottom: 5 }}>
            <div>
              <p style={label}>{"Historique du jour"}</p>
              <p style={{ margin:'-3px 0 0', fontSize: 11, color: t.muted }}>
                {todayTxFiltered.length + (todayTxFiltered.length > 1 ? ' encaissements' : ' encaissement')
                  + (empFilter !== 'all' ? ' · filtré' : '')}
              </p>
            </div>
            <button onClick={() => navigate('/caisse/historique')}
                    style={{ border:'none', background:'transparent', cursor:'pointer',
                             fontSize: 11, color: t.muted, fontFamily:'inherit' }}>
              {"Détail complet →"}
            </button>
          </div>
          <div style={{ ...card, padding: 0, overflow:'hidden' }}>
            {todayTxFiltered.length === 0 ? (
              <p style={{ margin: 0, padding:'16px 14px', fontSize: 12, color: t.muted }}>
                {"Aucun encaissement aujourd'hui."}
              </p>
            ) : todayTxFiltered.slice(0, 12).map(tx => {
              const emp = employees.find(e => e.id === tx.employee_id);
              const empColor = emp?.avatar_color || VIO;
              const empInitial = (emp?.name || '?').charAt(0).toUpperCase();
              const svc = Array.isArray(tx.items) && tx.items[0]
                            ? tx.items[0].service_name
                            : (tx.description || '—');
              const isMulti = tx.payment_method === 'multi'
                && Array.isArray(tx.payments) && tx.payments.length > 0;
              return (
                <div key={tx.id}
                     style={{ display:'grid',
                              gridTemplateColumns:'46px 1fr auto auto auto',
                              gap: 8, padding:'9px 12px', alignItems:'center',
                              borderBottom: "0.5px solid " + t.separator }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: t.muted,
                                 fontFamily:'monospace' }}>
                    {String(tx.time || '').substring(0, 5) || '—'}
                  </span>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: t.text,
                              minWidth: 0, overflow:'hidden', textOverflow:'ellipsis',
                              whiteSpace:'nowrap' }}>
                    {svc}
                  </p>
                  <div style={{ display:'flex', alignItems:'center', gap: 6, minWidth: 0 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 99,
                                   background: empColor, color:'#fff',
                                   display:'flex', alignItems:'center',
                                   justifyContent:'center', fontSize: 9,
                                   fontWeight: 500, flexShrink: 0 }}>
                      {empInitial}
                    </span>
                    <span style={{ fontSize: 11, color: t.muted,
                                   overflow:'hidden', textOverflow:'ellipsis',
                                   whiteSpace:'nowrap' }}>
                      {emp?.name || '—'}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap: 4, flexShrink: 0 }}>
                    {isMulti ? tx.payments.map((p, i) => {
                      const cfg = PM_CFG[p.payment_method] || PM_CFG.other;
                      return (
                        <span key={i}
                              style={{ fontSize: 10, fontWeight: 500,
                                       padding:'2px 7px', borderRadius: 99,
                                       background: cfg.bg, color: cfg.color,
                                       whiteSpace:'nowrap' }}>
                          {cfg.label.substring(0, 3)} {fmt(p.amount)}
                        </span>
                      );
                    }) : (() => {
                      const cfg = PM_CFG[tx.payment_method] || PM_CFG.other;
                      return (
                        <span style={{ fontSize: 10, fontWeight: 500,
                                       padding:'2px 7px', borderRadius: 99,
                                       background: cfg.bg, color: cfg.color,
                                       whiteSpace:'nowrap' }}>
                          {cfg.label}
                        </span>
                      );
                    })()}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: t.text,
                                 textAlign:'right', fontFamily:'monospace' }}>
                    {fmt(tx.amount)} DA
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      <NotifModal open={showNotifs} onClose={() => setShowNotifs(false)} theme={t}/>
    </div>
  );
}
