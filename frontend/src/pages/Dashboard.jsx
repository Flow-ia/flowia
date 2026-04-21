// src/pages/Dashboard.jsx — Refonte visuelle 2026, logique intacte (PIN, stats, historique)
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { todayStr } from '../utils/dates';
import { useTheme } from '../hooks/useTheme';
import { useEmployeePin } from '../hooks/useEmployeePin';
import { bookingApi, notifApi } from '../utils/api';
import { StatusBadge } from '../components/primitives/StatusBadge';

const nd   = d => { if (!d) return ''; const s = typeof d === 'string' ? d : new Date(d).toISOString(); return s.substring(0, 10); };
const fmtN = n => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt  = n => Number(n || 0).toFixed(2);

// Moyens de paiement — pastels sobres (bg + accent text de meme famille)
const PM_CFG = {
  cash:     { label: 'Especes',  color: '#065f46', bg: '#f0fdf4' },
  card:     { label: 'Carte',    color: '#4338ca', bg: '#eef2ff' },
  transfer: { label: 'Virement', color: '#0e7490', bg: '#ecfeff' },
  other:    { label: 'Autre',    color: '#92400e', bg: '#fffbeb' },
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
function PinAccessModal({ open, onClose, onSuccess, employees, theme: t, title = 'Acces protege', actionLabel = 'Acceder' }) {
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

  const markRead = async id => { await notifApi.markRead({ id }).catch(() => {}); setNotifs(p => p.map(n => n.id === id ? { ...n, is_read:true } : n)); };
  const del      = async id => { await notifApi.deleteInApp(id).catch(() => {}); setNotifs(p => p.filter(n => n.id !== id)); };
  const clearAll = async ()  => { await Promise.all(notifs.map(n => notifApi.deleteInApp(n.id))).catch(() => {}); setNotifs([]); };

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
      target = '/agenda';
    }
    if (target) { onClose(); navigate(target); }
  };

  // Icones data metier (identifiants de type de notification) — conserves
  const ICON = { new_appointment:'📅', appointment_reminder:'⏰', caisse:'🧾' };
  const fmtTime = iso => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000)    return "A l'instant";
    if (diff < 3600000)  return `Il y a ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
    return new Date(iso).toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
  };
  const unread = notifs.filter(n => !n.is_read).length;
  const sep = `0.5px solid ${t.separator}`;

  return (
    <Modal open={open} onClose={onClose} theme={t} title={`Notifications${unread > 0 ? ` · ${unread} non lues` : ''}`}>
      {notifs.length > 0 && (
        <div style={{ padding:'10px 16px 8px', borderBottom:sep, display:'flex', justifyContent:'flex-end' }}>
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
      ) : notifs.map((n, i) => (
        <div key={n.id} onClick={() => openNotif(n)}
             style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'13px 16px',
                      borderBottom: i < notifs.length - 1 ? sep : 'none',
                      background: n.is_read ? 'transparent' : t.cardAlt,
                      cursor:'pointer' }}>
          <div style={{ width:34, height:34, borderRadius:8, flexShrink:0, fontSize:16,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        background:t.cardAlt }}>
            {ICON[n.type] || '📌'}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
              {!n.is_read && <span style={{ width:6, height:6, borderRadius:'50%', background:t.text, flexShrink:0 }}/>}
              <p style={{ fontWeight:500, fontSize:13, color:t.text,
                          margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {n.title}
              </p>
            </div>
            {n.body && <p style={{ fontSize:11, color:t.muted, margin:'0 0 3px', lineHeight:1.4 }}>{n.body}</p>}
            <p style={{ fontSize:10, color:t.dim, margin:0 }}>{fmtTime(n.created_at)}</p>
          </div>
          <button onClick={e => { e.stopPropagation(); del(n.id); }}
                  style={{ width:22, height:22, borderRadius:6, border:'none', cursor:'pointer', flexShrink:0,
                           background:'rgba(239,68,68,0.1)', color:'#991b1b', fontSize:13,
                           display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'inherit' }}>
            ×
          </button>
        </div>
      ))}
    </Modal>
  );
}

// ── StatsModal ───────────────────────────────────────────────────────────────
function StatsModal({ open, onClose, theme: t, transactions, employees, categories }) {
  const today = todayStr();
  const sep   = `0.5px solid ${t.separator}`;

  const todayRevs  = transactions.filter(tx => nd(tx.date) === today && tx.type === 'revenue');
  const todayAll   = transactions.filter(tx => nd(tx.date) === today);
  const dayRev     = todayRevs.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
  const prestCount = todayRevs.reduce((s, tx) => s + (parseInt(tx.qty_total) || 1), 0);

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

function TileStats({ theme: t, onClick }) {
  return (
    <Tile theme={t} onClick={onClick}
          iconBg="#ecfeff" iconColor="#0e7490"
          icon={<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>}
          title="Stats du jour"
          sub="Acces PIN"/>
  );
}

function TileHistorique({ theme: t, onClick }) {
  return (
    <Tile theme={t} onClick={onClick}
          iconBg="#eeedfe" iconColor="#3c3489"
          icon={<>
            <polyline points="3 6 3 12 9 12"/>
            <path d="M3 13a9 9 0 1 0 3-7.7L3 9"/>
            <line x1="12" y1="7" x2="12" y2="12"/>
            <line x1="12" y1="12" x2="15" y2="14"/>
          </>}
          title="Historique"
          sub="Ventes du jour · Acces PIN"/>
  );
}

function TileAdmin({ theme: t, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                     padding:'14px 20px', borderRadius:12, cursor:'pointer', width:'100%',
                     background: hov ? t.cardAlt : t.card,
                     border:`0.5px solid ${t.border}`,
                     transition:'background 0.15s ease',
                     fontFamily:'inherit' }}>
      <svg viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:18, height:18 }}>
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
      <span style={{ fontWeight:500, fontSize:14, color:t.text }}>Admin</span>
      <svg viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:13, height:13 }}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard({ transactions, employees, categories, onAdd, onNavigate, unreadNotifCount = 0 }) {
  const { theme: t } = useTheme();

  const [todayAppts,      setTodayAppts]      = useState([]);
  const [showNotifs,      setShowNotifs]      = useState(false);
  const [showStats,       setShowStats]       = useState(false);
  const [showStatsAccess, setShowStatsAccess] = useState(false);
  const [showHisto,       setShowHisto]       = useState(false);
  const [showHistoAccess, setShowHistoAccess] = useState(false);

  const today = todayStr();
  const now   = new Date();

  useEffect(() => {
    bookingApi.getAppointments({ from:today, to:today })
      .then(d => setTodayAppts(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [today]);

  const nowMin   = now.getHours() * 60 + now.getMinutes();
  const upcoming = todayAppts.filter(a => {
    if (a.status !== 'confirmed') return false;
    const [h, m] = String(a.start_time || '').substring(0, 5).split(':').map(Number);
    return h * 60 + m > nowMin;
  });

  const dateStr = now.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  const openStats = () => {
    if (employees.filter(e => e.is_active !== false).length === 0) { setShowStats(true); return; }
    setShowStatsAccess(true);
  };
  const openHisto = () => {
    if (employees.filter(e => e.is_active !== false).length === 0) { setShowHisto(true); return; }
    setShowHistoAccess(true);
  };

  return (
    <div style={{ minHeight:'100vh', background:t.bg }}>

      {/* Header */}
      <div style={{ padding:'24px 24px 16px' }}>
        <p style={{ fontSize:12, color:t.muted, textTransform:'capitalize', margin:'0 0 4px' }}>
          {dateStr}
        </p>
        <h1 style={{ fontSize:22, fontWeight:500, color:t.text, margin:0 }}>
          Tableau de bord
        </h1>
      </div>

      {/* Grille tuiles */}
      <div style={{ padding:'0 16px 32px', maxWidth:900, margin:'0 auto' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <TileAgenda theme={t} upcomingCount={upcoming.length} onClick={() => onNavigate?.('agenda')}/>
          <TileNotifications theme={t} unreadCount={unreadNotifCount} onClick={() => setShowNotifs(true)}/>
        </div>

        <div style={{ marginBottom:12 }}>
          <TileEncaisser theme={t} onClick={onAdd}/>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <TileClients theme={t} onClick={() => onNavigate?.('clients')}/>
          <TileStats   theme={t} onClick={openStats}/>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <TileHistorique theme={t} onClick={openHisto}/>
          <TileAdmin      theme={t} onClick={() => onNavigate?.('settings')}/>
        </div>
      </div>

      <NotifModal open={showNotifs} onClose={() => setShowNotifs(false)} theme={t}/>
      <PinAccessModal open={showStatsAccess} onClose={() => setShowStatsAccess(false)} onSuccess={() => setShowStats(true)} employees={employees} theme={t} title="Stats du jour" actionLabel="Voir les stats du jour"/>
      <StatsModal open={showStats} onClose={() => setShowStats(false)} theme={t} transactions={transactions} employees={employees} categories={categories}/>
      <PinAccessModal open={showHistoAccess} onClose={() => setShowHistoAccess(false)} onSuccess={() => setShowHisto(true)} employees={employees} theme={t} title="Historique du jour" actionLabel="Voir l'historique du jour"/>
      <HistoriqueModal open={showHisto} onClose={() => setShowHisto(false)} theme={t} transactions={transactions} employees={employees}/>
    </div>
  );
}
