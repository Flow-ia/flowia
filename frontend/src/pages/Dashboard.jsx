// src/pages/Dashboard.jsx — Refonte visuelle 2026, logique intacte (PIN, stats, historique)
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { todayStr } from '../utils/dates';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useEmployeePin } from '../hooks/useEmployeePin';
import { bookingApi, notifApi, paymentsApi, userSettingsApi } from '../utils/api';
import { StatusBadge } from '../components/primitives/StatusBadge';
import { I } from '../utils/icons';

const nd   = d => { if (!d) return ''; const s = typeof d === 'string' ? d : new Date(d).toISOString(); return s.substring(0, 10); };
const fmtN = n => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt  = n => Number(n || 0).toFixed(2);

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

// ── HistoriqueModal — ventes du jour ─────────────────────────────────────────
function HistoriqueModal({ open, onClose, theme: t, transactions, employees }) {
  const today = todayStr();
  const sep   = `0.5px solid ${t.separator}`;

  const todayRevs = transactions
    .filter(tx => nd(tx.date) === today && tx.type === 'revenue')
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const empById = Object.fromEntries(employees.map(e => [e.id, e]));

  const lines = [];
  todayRevs.forEach(tx => {
    const emp = empById[tx.employee_id];
    const items = Array.isArray(tx.items) ? tx.items : [];
    let pmLabel;
    if (tx.payment_method === 'multi' && Array.isArray(tx.payments) && tx.payments.length) {
      pmLabel = tx.payments.map(p => PM_CFG[p.method]?.label || p.method).join(' + ');
    } else {
      pmLabel = PM_CFG[tx.payment_method]?.label || 'Autre';
    }
    const pmCfg = tx.payment_method === 'multi'
      ? { color: '#3c3489', bg: '#eeedfe' }
      : (PM_CFG[tx.payment_method] || PM_CFG.other);

    if (items.length > 0) {
      items.forEach((it, i) => {
        const qty  = parseInt(it.qty) || 1;
        const unit = parseFloat(it.unit_price) || 0;
        lines.push({
          id: `${tx.id}_${i}`,
          service: it.service_name || 'Prestation',
          qty, amount: unit * qty, emp, pmLabel, pmCfg,
        });
      });
    } else {
      lines.push({
        id: tx.id,
        service: tx.description || 'Prestation',
        qty: parseInt(tx.qty_total) || 1,
        amount: parseFloat(tx.amount) || 0,
        emp, pmLabel, pmCfg,
      });
    }
  });

  const total = lines.reduce((s, l) => s + l.amount, 0);

  return (
    <Modal open={open} onClose={onClose} theme={t} title="Historique du jour">
      <div style={{ padding:'8px 0 16px' }}>
        {lines.length === 0 ? (
          <div style={{ padding:'48px 20px', textAlign:'center' }}>
            <p style={{ fontSize:13, color:t.muted, margin:0 }}>{"Aucune vente aujourd'hui"}</p>
          </div>
        ) : (
          <>
            <div style={{ padding:'14px 20px', borderBottom:sep,
                          display:'flex', alignItems:'baseline', justifyContent:'space-between',
                          background:t.cardAlt }}>
              <span style={{ fontSize:12, color:t.muted }}>
                {lines.length} vente{lines.length > 1 ? 's' : ''}
              </span>
              <span style={{ fontSize:20, fontWeight:500, color:t.text, fontFamily:'monospace' }}>
                {fmtN(total)} €
              </span>
            </div>

            {lines.map((l, idx) => (
              <div key={l.id} style={{
                display:'grid', gridTemplateColumns:'1fr auto', gap:12,
                padding:'14px 20px',
                borderBottom: idx < lines.length - 1 ? sep : 'none',
                alignItems:'center',
              }}>
                <div style={{ minWidth:0 }}>
                  <p style={{
                    fontSize:15, fontWeight:500, color:t.text,
                    margin:'0 0 6px',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  }}>
                    {l.qty > 1 && <span style={{ color:t.muted, marginRight:6 }}>{l.qty}×</span>}
                    {l.service}
                  </p>
                  <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    {l.emp && (
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{
                          width:20, height:20, borderRadius:6,
                          background:l.emp.avatar_color || t.text,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          color:'#fff', fontSize:11, fontWeight:500, flexShrink:0,
                        }}>
                          {(l.emp.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize:12, color:t.muted }}>{l.emp.name}</span>
                      </div>
                    )}
                    <span style={{
                      fontSize:11, fontWeight:500,
                      padding:'3px 8px', borderRadius:8,
                      background: l.pmCfg.bg, color: l.pmCfg.color,
                      whiteSpace:'nowrap',
                    }}>
                      {l.pmLabel}
                    </span>
                  </div>
                </div>

                <div style={{
                  fontSize:18, fontWeight:500, color:t.text,
                  fontFamily:'monospace', whiteSpace:'nowrap',
                }}>
                  {fmtN(l.amount)} €
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
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

// ── StatsModal ───────────────────────────────────────────────────────────────
function StatsModal({ open, onClose, theme: t, transactions, employees, categories }) {
  const today = todayStr();
  const sep   = `0.5px solid ${t.separator}`;

  const todayRevs  = transactions.filter(tx => nd(tx.date) === today && tx.type === 'revenue');
  const todayAll   = transactions.filter(tx => nd(tx.date) === today);
  // dayRev = SUM amount sur tous revenue (refunds negatifs subtraits) -> CA NET.
  const dayRev     = todayRevs.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
  // prestCount exclut les refunds : un remboursement n'est PAS une prestation.
  const prestCount = todayRevs.reduce((s, tx) => {
    if (tx.source === 'rdv_refund' || (parseFloat(tx.amount) || 0) < 0) return s;
    return s + (parseInt(tx.qty_total) || 1);
  }, 0);

  const byEmp = employees.map(emp => {
    const r = todayRevs.filter(tx => tx.employee_id === emp.id);
    return { ...emp, count:r.length, ca:r.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0) };
  }).filter(e => e.count > 0);

  const byPM = {};
  const addPm = (pm, amount) => {
    const key = pm || 'other';
    if (!byPM[key]) byPM[key] = { count:0, total:0 };
    byPM[key].count++;
    byPM[key].total += parseFloat(amount) || 0;
  };
  todayRevs.forEach(tx => {
    if (tx.payment_method === 'multi' && Array.isArray(tx.payments) && tx.payments.length) {
      tx.payments.forEach(p => { if (parseFloat(p.amount) > 0) addPm(p.method, p.amount); });
    } else {
      addPm(tx.payment_method, tx.amount);
    }
  });

  const byCat = {};
  todayRevs.forEach(tx => {
    const items = Array.isArray(tx.items) ? tx.items : [];
    if (items.length > 0) {
      items.forEach(it => {
        const key  = it.service_name || 'Sans nom';
        const qty  = parseInt(it.qty) || 1;
        const unit = parseFloat(it.unit_price) || 0;
        if (!byCat[key]) byCat[key] = { count:0, total:0, unit };
        byCat[key].count += qty;
        byCat[key].total += unit * qty;
        byCat[key].unit   = unit;
      });
    } else {
      const cat = categories.find(c => c.id === tx.category_id);
      const key = cat?.name || tx.description || 'Sans categorie';
      const qty = parseInt(tx.qty_total) || 1;
      const amt = parseFloat(tx.amount) || 0;
      if (!byCat[key]) byCat[key] = { count:0, total:0, unit: qty > 0 ? amt / qty : amt };
      byCat[key].count += qty;
      byCat[key].total += amt;
    }
  });

  const sectionTitle = (title) => (
    <p style={{ fontSize:11, color:t.muted, margin:'0 0 8px', padding:'0 16px' }}>
      {title}
    </p>
  );

  const row = (label, value, color = null, sub = null, key = null) => (
    <div key={key || label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                     padding:'10px 16px', borderBottom:sep }}>
      <div>
        <p style={{ fontWeight:500, fontSize:13, color:t.text, margin:0 }}>{label}</p>
        {sub && <p style={{ fontSize:11, color:t.muted, margin:0 }}>{sub}</p>}
      </div>
      <span style={{ fontWeight:500, fontSize:14, color: color || t.text, fontFamily:'monospace' }}>
        {value}
      </span>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} theme={t} title="Stats du jour">
      <div style={{ padding:'12px 0 24px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, padding:'0 16px', marginBottom:20 }}>
          {[
            { label:'CA total',    value:`${fmtN(dayRev)} €`, color:t.text },
            { label:'Prestations', value:prestCount,          color:t.text },
          ].map(k => (
            <div key={k.label} style={{ padding:'12px 14px', borderRadius:8,
                                        background:t.cardAlt,
                                        border:`0.5px solid ${t.border}` }}>
              <p style={{ fontSize:11, color:t.muted, margin:'0 0 5px' }}>{k.label}</p>
              <p style={{ fontSize:19, fontWeight:500, color:k.color, fontFamily:'monospace', margin:0 }}>
                {k.value}
              </p>
            </div>
          ))}
        </div>

        {Object.keys(byPM).length > 0 && (
          <div style={{ marginBottom:16 }}>
            {sectionTitle('Par moyen de paiement')}
            <div style={{ display:'grid',
                          gridTemplateColumns:`repeat(${Math.min(Object.keys(byPM).length, 4)}, 1fr)`,
                          gap:8, padding:'0 16px' }}>
              {Object.entries(byPM).map(([pm, v]) => {
                const cfg = PM_CFG[pm] || PM_CFG.other;
                return (
                  <div key={pm} style={{ padding:'10px 8px', borderRadius:8, textAlign:'center',
                                         background: cfg.bg }}>
                    <p style={{ fontSize:11, color:cfg.color, margin:'0 0 4px',
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {cfg.label}
                    </p>
                    <p style={{ fontSize:14, fontWeight:500, color:cfg.color,
                                fontFamily:'monospace', margin:'0 0 2px', lineHeight:1.1 }}>
                      {fmtN(v.total)} €
                    </p>
                    <p style={{ fontSize:10, color:cfg.color, opacity:0.65, margin:0 }}>
                      {v.count} tx
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {byEmp.length > 0 && (
          <div style={{ marginBottom:20 }}>
            {sectionTitle('Par employe')}
            {byEmp.map(emp => (
              <div key={emp.id} style={{ display:'flex', alignItems:'center', gap:12,
                                         padding:'10px 16px', borderBottom:sep }}>
                <div style={{ width:30, height:30, borderRadius:8, flexShrink:0,
                              background: emp.avatar_color || t.text,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              color:'#fff', fontWeight:500, fontSize:13 }}>
                  {(emp.name || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontWeight:500, fontSize:13, color:t.text, margin:0 }}>{emp.name}</p>
                  <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                    {emp.count} prestation{emp.count > 1 ? 's' : ''}
                  </p>
                </div>
                <span style={{ fontWeight:500, fontSize:14, color:t.text, fontFamily:'monospace' }}>
                  {fmtN(emp.ca)} €
                </span>
              </div>
            ))}
          </div>
        )}

        {Object.keys(byCat).length > 0 && (
          <div style={{ marginBottom:20 }}>
            {sectionTitle('Par service / produit')}
            {Object.entries(byCat).sort(([, a], [, b]) => b.total - a.total).map(([name, v]) =>
              row(name, `${v.count}×`, '#065f46', `${fmtN(v.unit || 0)} €${v.count > 1 ? ` · ${fmtN(v.total)} € total` : ''}`, name)
            )}
          </div>
        )}

        {todayAll.length === 0 && (
          <div style={{ padding:'32px 16px', textAlign:'center' }}>
            <p style={{ fontSize:13, color:t.muted, margin:0 }}>{"Aucune transaction aujourd'hui"}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Tile generique ───────────────────────────────────────────────────────────
function Tile({ theme: t, onClick, icon, iconBg, iconColor, title, sub, rightBadge }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
              display:'flex', flexDirection:'column', alignItems:'flex-start',
              padding:18, borderRadius:12, cursor:'pointer', textAlign:'left', width:'100%',
              position:'relative', fontFamily:'inherit',
              background: hov ? t.cardAlt : t.card,
              border:`0.5px solid ${t.border}`,
              transition:'background 0.15s ease',
            }}>
      {rightBadge && (
        <div style={{ position:'absolute', top:12, right:12 }}>
          {rightBadge}
        </div>
      )}
      <div style={{ width:40, height:40, borderRadius:8,
                    background:iconBg,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    marginBottom:10 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:19, height:19 }}>
          {icon}
        </svg>
      </div>
      <p style={{ fontWeight:500, fontSize:15, color:t.text, margin:'0 0 3px' }}>{title}</p>
      <p style={{ fontSize:11, color:t.muted, margin:0 }}>{sub}</p>
    </button>
  );
}

function TileAgenda({ theme: t, onClick, upcomingCount }) {
  return (
    <Tile theme={t} onClick={onClick}
          iconBg="#eef2ff" iconColor="#4338ca"
          icon={<>
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </>}
          title="Agenda"
          sub={upcomingCount > 0 ? `${upcomingCount} RDV a venir` : 'Voir les RDV'}/>
  );
}

function TileNotifications({ theme: t, unreadCount, onClick }) {
  const hasNew = unreadCount > 0;
  return (
    <Tile theme={t} onClick={onClick}
          iconBg={hasNew ? '#fef2f2' : t.cardAlt}
          iconColor={hasNew ? '#991b1b' : t.muted}
          icon={<>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </>}
          title="Notifs"
          sub={hasNew ? `${unreadCount} nouvelle${unreadCount > 1 ? 's' : ''}` : 'Tout est a jour'}
          rightBadge={hasNew
            ? <StatusBadge status="danger" variant="pastel" label={unreadCount > 99 ? '99+' : String(unreadCount)}/>
            : null}/>
  );
}

function TileEncaisser({ theme: t, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:14,
                     padding:'18px 24px', borderRadius:12, border:'none', cursor:'pointer',
                     width:'100%', fontFamily:'inherit',
                     background: t.text, color: t.bg,
                     opacity: hov ? 0.9 : 1,
                     transition:'opacity 0.15s ease' }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:22, height:22 }}>
        <circle cx="12" cy="12" r="9"/>
        <line x1="12" y1="8" x2="12" y2="16"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
      <div style={{ textAlign:'left' }}>
        <p style={{ fontWeight:500, fontSize:16, margin:'0 0 2px' }}>Encaisser</p>
        <p style={{ fontSize:12, opacity:0.7, margin:0 }}>Saisie rapide · paiement immediat</p>
      </div>
    </button>
  );
}

function TileClients({ theme: t, onClick }) {
  return (
    <Tile theme={t} onClick={onClick}
          iconBg="#f0fdf4" iconColor="#065f46"
          icon={<>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </>}
          title="Clients"
          sub="Gerer la clientele"/>
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
// PinAccessModal + NotifModal + useNotifications + Tile* exports préservés
// intacts pour ne pas casser pages/Historique, pages/caisse/Historique, App.jsx.
export default function Dashboard({ transactions, employees, onAdd, onNavigate, unreadNotifCount = 0 }) {
  const { theme: t } = useTheme();
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
  const { caToday, nbSales, byPM, ca7j, maxCA7, empActivity, todayTxAll } = useMemo(() => {
    const todayTxAll = transactions.filter(tx => nd(tx.date) === today && tx.type === 'revenue');
    const todayTx = todayTxAll;
    const caToday = todayTx.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);

    // Ventilation par moyen de paiement : 'multi' éclaté par sous-ligne.
    // 'card_online' inclus pour comptabiliser les paiements Stripe Connect
    // (acompte ou intégral) — sans cette clé, ils tombaient dans 'other'.
    const byPM = { cash:0, card:0, card_online:0, transfer:0, other:0, multi:0 };
    todayTx.forEach(tx => {
      if (tx.payment_method === 'multi' && Array.isArray(tx.payments) && tx.payments.length) {
        tx.payments.forEach(p => {
          const k = p.payment_method || 'other';
          byPM[k in byPM ? k : 'other'] += parseFloat(p.amount) || 0;
        });
      } else {
        const k = tx.payment_method || 'other';
        byPM[k in byPM ? k : 'other'] += parseFloat(tx.amount) || 0;
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

    // Activité équipe (tx aujourd'hui par employé actif, tri CA desc).
    const empActivity = employees
      .filter(e => e.is_active !== false)
      .map(e => {
        const tx = todayTx.filter(x => x.employee_id === e.id);
        return { ...e, count: tx.length, ca: tx.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0) };
      })
      .sort((a, b) => b.ca - a.ca);

    return { caToday, nbSales: todayTx.length, byPM, ca7j, maxCA7, empActivity, todayTxAll };
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
      label: "Solde SMS bas · " + smsBalance.toFixed(2) + " € (seuil " + smsThreshold + " €)",
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

  // ── Styles partagés ─────────────────────────────────────────────────────
  const card = { borderRadius: 12, background: t.card, border: "0.5px solid " + t.border, padding: 16 };

  return (
    <div style={{ minHeight:'100vh', background: t.bg, paddingBottom: 32 }}>
      <div style={{ maxWidth: 1120, margin:'0 auto', padding:'20px 16px',
                    display:'flex', flexDirection:'column', gap: 14 }}>

        {/* ── TopBar page : identité + date + cloche + Encaisser ── */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between',
                      gap: 12, flexWrap:'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin:0, fontSize: 11, color: t.muted, textTransform:'uppercase',
                        letterSpacing:'0.05em', fontWeight: 500 }}>{"Dashboard"}</p>
            <h1 style={{ margin:'2px 0 4px', fontSize: 22, fontWeight: 500, color: t.text,
                         letterSpacing:'-0.01em' }}>
              {user?.businessName || "Tableau de bord"}
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: t.muted, textTransform:'capitalize' }}>
              {dateStr}
            </p>
          </div>
          <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
            <button onClick={() => setShowNotifs(true)}
                    aria-label="Notifications"
                    style={{ position:'relative', padding:'8px 10px', borderRadius: 8,
                             border: "0.5px solid " + t.border, background: t.cardAlt,
                             color: t.text, cursor:'pointer', fontFamily:'inherit' }}>
              <I.Bell style={{ width: 14, height: 14 }}/>
              {unreadNotifCount > 0 && (
                <span style={{ position:'absolute', top: -4, right: -4,
                               background:'#ef4444', color:'#fff',
                               fontSize: 9, fontWeight: 500,
                               padding:'1px 5px', borderRadius: 99, minWidth: 14 }}>
                  {unreadNotifCount}
                </span>
              )}
            </button>
            <button onClick={onAdd}
                    style={{ display:'inline-flex', alignItems:'center', gap: 6,
                             padding:'9px 14px', borderRadius: 8, border:'none',
                             background:'#10b981', color:'#fff',
                             cursor:'pointer', fontFamily:'inherit',
                             fontSize: 13, fontWeight: 500 }}>
              <I.Zap style={{ width: 13, height: 13 }}/> {"Encaisser"}
            </button>
          </div>
        </div>

        {/* ── Alertes proactives ── */}
        {alerts.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap: 6 }}>
            {alerts.map(a => (
              <button key={a.id} onClick={a.onClick}
                      style={{ textAlign:'left', padding:'10px 14px', borderRadius: 10,
                               border: "0.5px solid " + (a.level === 'warn' ? '#fed7aa' : '#e0e7ff'),
                               borderLeft: "2px solid " + (a.level === 'warn' ? '#f97316' : '#4338ca'),
                               background: a.level === 'warn' ? '#fff7ed' : '#eef2ff',
                               color: a.level === 'warn' ? '#9a3412' : '#3c3489',
                               fontSize: 12, fontWeight: 500, cursor:'pointer',
                               fontFamily:'inherit',
                               display:'flex', alignItems:'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99,
                               background: a.level === 'warn' ? '#f97316' : '#4338ca' }}/>
                {a.label}
              </button>
            ))}
          </div>
        )}

        {/* ── 4 KPIs ── */}
        <div style={{ display:'grid',
                      gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))',
                      gap: 10 }}>
          {[
            { label:"CA jour",     value: fmt(caToday) + " €", color:'#065f46', bg:'#f0fdf4' },
            { label:"RDV jour",    value: String(todayAppts.length), color:'#4338ca', bg:'#eef2ff' },
            { label:"Ventes caisse", value: String(nbSales), color:'#0e7490', bg:'#ecfeff' },
            { label:"SMS restants",  value: smsBalance === null ? "…" : fmt(smsBalance) + " €",
              color: (smsBalance !== null && smsBalance < smsThreshold) ? '#9a3412' : '#92400e',
              bg:   (smsBalance !== null && smsBalance < smsThreshold) ? '#fff7ed' : '#fffbeb' },
          ].map((k, i) => (
            <div key={i} style={{ ...card, padding:'14px 16px',
                                  borderLeft: "2px solid " + k.color }}>
              <p style={{ margin: 0, fontSize: 10, color: k.color, textTransform:'uppercase',
                          letterSpacing:'0.04em', fontWeight: 500 }}>{k.label}</p>
              <p style={{ margin:'6px 0 0', fontSize: 20, fontWeight: 500,
                          color: t.text, fontFamily:'monospace' }}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* ── UX commit 7d : chips filtre employé (commun aux 3 blocs). ── */}
        {(employees || []).filter(e => e.is_active !== false).length > 1 && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {[
              { id: 'all', label: 'Tous', color: t.text },
              ...employees.filter(e => e.is_active !== false)
                          .map(e => ({ id: e.id, label: e.name, color: e.avatar_color || t.text })),
            ].map(chip => {
              const active = empFilter === chip.id;
              return (
                <button key={chip.id} onClick={() => setEmpFilter(chip.id)}
                        style={{ padding:'6px 12px', borderRadius: 99, border:'none',
                                 background: active ? '#111827' : t.cardAlt,
                                 color: active ? '#fff' : t.muted,
                                 fontSize: 11, fontWeight: active ? 500 : 400,
                                 cursor:'pointer', fontFamily:'inherit',
                                 whiteSpace:'nowrap' }}>
                  {chip.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── 2 colonnes : Prochains RDV / Activité équipe ── */}
        <div style={{ display:'grid',
                      gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))',
                      gap: 12 }}>
          <div style={card}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                          marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: t.text }}>
                {"Prochains RDV"}
              </p>
              <button onClick={() => navigate('/agenda')}
                      style={{ border:'none', background:'transparent', cursor:'pointer',
                               fontSize: 11, color: t.muted, fontFamily:'inherit' }}>
                {"Voir l'agenda →"}
              </button>
            </div>
            {upcoming.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: t.muted }}>
                {"Aucun RDV restant aujourd'hui."}
              </p>
            ) : upcoming.map(a => (
              <div key={a.id}
                   style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap: 10,
                            padding:'8px 0',
                            borderBottom: "0.5px solid " + t.separator,
                            alignItems:'center' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: t.text,
                               fontFamily:'monospace' }}>
                  {String(a.start_time || '').substring(0, 5)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, color: t.text,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {a.client_name || a.client_email || "Sans nom"}
                  </p>
                  <p style={{ margin:'1px 0 0', fontSize: 11, color: t.muted,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {a.service_name || ""}
                  </p>
                </div>
                <StatusBadge
                  status={a.status === 'confirmed' ? 'success' : (a.status === 'pending' ? 'warning' : 'info')}
                  label={a.status}/>
              </div>
            ))}
          </div>

          <div style={card}>
            <p style={{ margin:'0 0 10px', fontSize: 14, fontWeight: 500, color: t.text }}>
              {"Activité équipe"}
            </p>
            {empActivityFiltered.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: t.muted }}>
                {"Aucun employé actif."}
              </p>
            ) : empActivityFiltered.slice(0, 6).map(e => (
              <div key={e.id}
                   style={{ display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap: 10,
                            padding:'8px 0',
                            borderBottom: "0.5px solid " + t.separator,
                            alignItems:'center' }}>
                <span style={{ width: 8, height: 8, borderRadius: 99,
                               background: e.avatar_color || '#6b7280' }}/>
                <p style={{ margin: 0, fontSize: 13, color: t.text,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {e.name}
                </p>
                <span style={{ fontSize: 11, color: t.muted }}>
                  {e.count} {e.count === 1 ? "tx" : "tx"}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: t.text,
                               fontFamily:'monospace' }}>
                  {fmt(e.ca)} €
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── UX commit 7d : Historique du jour · ligne par ligne
            (filtrable par empFilter, multi éclatés en badges pastel §15). ── */}
        <div style={{ ...card, padding: 16, borderRadius: 10 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                        marginBottom: 10 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: t.text }}>
                {"Historique du jour"}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: t.muted }}>
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
          {todayTxFiltered.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: t.muted }}>
              {"Aucun encaissement aujourd'hui."}
            </p>
          ) : (
            <div>
              {todayTxFiltered.slice(0, 12).map(tx => {
                const emp = employees.find(e => e.id === tx.employee_id);
                const empColor = emp?.avatar_color || '#6b7280';
                const empInitial = (emp?.name || '?').charAt(0).toUpperCase();
                const svc = Array.isArray(tx.items) && tx.items[0]
                              ? tx.items[0].service_name
                              : (tx.description || '—');
                // Multi éclaté : si plusieurs paiements, plusieurs badges pastel.
                const isMulti = tx.payment_method === 'multi'
                  && Array.isArray(tx.payments) && tx.payments.length > 0;
                return (
                  <div key={tx.id}
                       style={{ display:'grid',
                                gridTemplateColumns:'60px 1fr auto auto auto',
                                gap: 10, padding:'8px 0',
                                borderBottom: "0.5px solid " + t.separator,
                                alignItems:'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: t.text,
                                   fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {String(tx.time || '').substring(0, 5) || '—'}
                    </span>
                    <div style={{ minWidth:0 }}>
                      <p style={{ margin: 0, fontSize: 13, color: t.text, fontWeight: 500,
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {svc}
                      </p>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap: 6, minWidth: 0 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 99,
                                     background: empColor, color: '#fff',
                                     display:'flex', alignItems:'center', justifyContent:'center',
                                     fontSize: 9, fontWeight: 500, flexShrink: 0 }}>
                        {empInitial}
                      </span>
                      <span style={{ fontSize: 11, color: t.muted,
                                     overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {emp?.name || '—'}
                      </span>
                    </div>
                    <div style={{ display:'flex', gap: 4, flexShrink: 0 }}>
                      {isMulti ? tx.payments.map((p, i) => {
                        const cfg = PM_CFG[p.payment_method] || PM_CFG.other;
                        return (
                          <span key={i}
                                style={{ fontSize: 10, fontWeight: 500,
                                         padding: '2px 7px', borderRadius: 99,
                                         background: cfg.bg, color: cfg.color,
                                         whiteSpace: 'nowrap' }}>
                            {cfg.label.substring(0, 3)} {fmt(p.amount)}
                          </span>
                        );
                      }) : (() => {
                        const cfg = PM_CFG[tx.payment_method] || PM_CFG.other;
                        return (
                          <span style={{ fontSize: 10, fontWeight: 500,
                                         padding: '2px 7px', borderRadius: 99,
                                         background: cfg.bg, color: cfg.color,
                                         whiteSpace: 'nowrap' }}>
                            {cfg.label}
                          </span>
                        );
                      })()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: t.text, textAlign: 'right',
                                   fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {fmt(tx.amount)} €
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 2 colonnes : Moyens paiement / CA 7j ── */}
        <div style={{ display:'grid',
                      gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))',
                      gap: 12 }}>
          <div style={card}>
            <p style={{ margin:'0 0 10px', fontSize: 14, fontWeight: 500, color: t.text }}>
              {"Encaissements du jour"}
            </p>
            <div style={{ display:'grid',
                          gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))',
                          gap: 6 }}>
              {Object.entries(PM_CFG).map(([id, cfg]) => (
                <div key={id}
                     style={{ padding:'10px 12px', borderRadius: 8,
                              background: cfg.bg,
                              border:'0.5px solid rgba(0,0,0,0.04)' }}>
                  <p style={{ margin: 0, fontSize: 10, color: cfg.color,
                              fontWeight: 500, textTransform:'uppercase',
                              letterSpacing:'0.04em' }}>{cfg.label}</p>
                  <p style={{ margin:'3px 0 0', fontSize: 15, fontWeight: 500,
                              color: cfg.color, fontFamily:'monospace' }}>
                    {fmt(byPM[id] || 0)} €
                  </p>
                </div>
              ))}
              <div style={{ padding:'10px 12px', borderRadius: 8,
                            background:'#eeedfe',
                            border:'0.5px solid rgba(0,0,0,0.04)' }}>
                <p style={{ margin: 0, fontSize: 10, color:'#3c3489',
                            fontWeight: 500, textTransform:'uppercase',
                            letterSpacing:'0.04em' }}>{"Multi"}</p>
                <p style={{ margin:'3px 0 0', fontSize: 15, fontWeight: 500,
                            color:'#3c3489', fontFamily:'monospace' }}>
                  {fmt(byPM.multi || 0)} €
                </p>
              </div>
            </div>
          </div>

          <div style={card}>
            <p style={{ margin:'0 0 14px', fontSize: 14, fontWeight: 500, color: t.text }}>
              {"Évolution CA · 7 derniers jours"}
            </p>
            <div style={{ display:'flex', alignItems:'flex-end', gap: 6, height: 120 }}>
              {ca7j.map(d => {
                const h = Math.max(2, Math.round((d.amount / maxCA7) * 100));
                const isToday = d.date === today;
                return (
                  <div key={d.date}
                       style={{ flex: 1, display:'flex', flexDirection:'column',
                                alignItems:'center', gap: 4 }}>
                    <div style={{ width:'100%', height: h + '%', borderRadius: 4,
                                  background: isToday ? t.text : t.borderInput,
                                  transition:'height 0.3s' }}
                         title={fmt(d.amount) + " € · " + d.date}/>
                    <span style={{ fontSize: 10, color: t.muted, textTransform:'capitalize' }}>
                      {d.day}
                    </span>
                  </div>
                );
              })}
            </div>
            <p style={{ margin:'10px 0 0', fontSize: 11, color: t.muted }}>
              {"Max : " + fmt(maxCA7) + " € · Aujourd'hui : " + fmt(caToday) + " €"}
            </p>
          </div>
        </div>

        {/* ── 4 raccourcis ── */}
        <div style={{ display:'grid',
                      gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',
                      gap: 8 }}>
          {[
            { label:"Encaisser",     icon:<I.Zap style={{ width:14, height:14 }}/>,     onClick: onAdd },
            { label:"Nouveau RDV",   icon:<I.Calendar style={{ width:14, height:14 }}/>, onClick: () => navigate('/agenda') },
            { label:"Créer promo",   icon:<I.Gift style={{ width:14, height:14 }}/>,     onClick: () => navigate('/marketing/promotions/create') },
            { label:"Nouveau client", icon:<I.Users style={{ width:14, height:14 }}/>,    onClick: () => navigate('/clients') },
          ].map((s, i) => (
            <button key={i} onClick={s.onClick}
                    style={{ padding:'12px 14px', borderRadius: 10,
                             border: "0.5px solid " + t.border,
                             background: t.card, color: t.text,
                             cursor:'pointer', fontFamily:'inherit',
                             fontSize: 13, fontWeight: 500,
                             display:'flex', alignItems:'center', gap: 8,
                             transition:'background 0.15s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.background = t.cardAlt; }}
                    onMouseLeave={e => { e.currentTarget.style.background = t.card; }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      <NotifModal open={showNotifs} onClose={() => setShowNotifs(false)} theme={t}/>
    </div>
  );
}
