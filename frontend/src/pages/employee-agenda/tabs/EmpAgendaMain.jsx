// src/pages/employee-agenda/tabs/EmpAgendaMain.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { bookingApi } from '../../../utils/api';
import { Toast, useToast } from '../../../components/UI';
import { Button, SegmentedControl } from '../../../components/primitives';
import { I } from '../../../utils/icons';
import { DAYS_FR, MONTHS_FR } from '../constants';
import { svLocal } from '../helpers';
import Spin from '../components/Spin';
import ApptCard from '../components/ApptCard';
import ApptActionModal from '../modals/ApptActionModal';
import QuickAddApptModal from '../modals/QuickAddApptModal';
import ClientsTab from './ClientsTab';

export default function EmpAgendaMain({ employee, services, allEmployees, onBack, onTxCreated, theme: t }) {
  const [toast, showToast]             = useToast();
  const [weekOffset, setWeekOffset]    = useState(0);
  const [selectedDate, setSelectedDate]= useState(new Date());
  const [allAppts, setAllAppts]        = useState([]);
  const [loading, setLoading]          = useState(false);
  const [detailAppt, setDetailAppt]    = useState(null);
  const [newApptOpen, setNewApptOpen]  = useState(false);
  const [searchQ, setSearchQ]          = useState('');
  const [filterEmpId, setFilterEmpId]  = useState(employee.id);
  const [mainTab, setMainTab]          = useState('agenda');
  const refreshRef = useRef(null);
  const location   = useLocation();
  const navigate   = useNavigate();
  const pendingApptRef = useRef(null);

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
  const weekDays = Array.from({length:7}, (_,i) => {
    const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i); return d;
  });
  const weekFrom = svLocal(weekDays[0]);
  const weekTo   = svLocal(weekDays[6]);

  const loadAppts = useCallback(async () => {
    setLoading(true);
    try {
      if (filterEmpId && filterEmpId !== 'all') {
        const data = await bookingApi.getEmployeeAgenda(filterEmpId, { from: weekFrom, to: weekTo });
        setAllAppts(Array.isArray(data?.appointments) ? data.appointments : []);
      } else {
        const data = await bookingApi.getAppointments({ from: weekFrom, to: weekTo });
        setAllAppts(Array.isArray(data) ? data : []);
      }
    } catch {}
    finally { setLoading(false); }
  }, [weekFrom, weekTo, filterEmpId]);

  useEffect(() => {
    loadAppts();
    clearInterval(refreshRef.current);
    refreshRef.current = setInterval(loadAppts, 30000);
    return () => clearInterval(refreshRef.current);
  }, [loadAppts]);

  // Deep-link depuis une notif : ?date=YYYY-MM-DD&appt=<id> → bascule sur le
  // bon jour + ouvre le modal détails du RDV dès qu'il est chargé. Params
  // strippés après usage pour éviter la ré-ouverture au remount.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const dateParam = params.get('date');
    const apptParam = params.get('appt');
    if (!apptParam && !dateParam) return;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const d = new Date(dateParam + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setSelectedDate(d);
        const today = new Date(); today.setHours(0,0,0,0);
        const target = new Date(d); target.setHours(0,0,0,0);
        const mondayOf = (x) => { const m = new Date(x); m.setDate(x.getDate() - ((x.getDay()+6)%7)); m.setHours(0,0,0,0); return m; };
        const diffWeeks = Math.round((mondayOf(target) - mondayOf(today)) / (7*86400000));
        setWeekOffset(diffWeeks);
      }
    }
    if (apptParam) pendingApptRef.current = apptParam;
    navigate(location.pathname, { replace: true });
  }, [location.search]); // eslint-disable-line

  useEffect(() => {
    if (!pendingApptRef.current || !allAppts.length) return;
    const found = allAppts.find(a => String(a.id) === String(pendingApptRef.current));
    if (found) { setDetailAppt(found); pendingApptRef.current = null; }
  }, [allAppts]);

  const selStr   = svLocal(selectedDate);
  const dayAppts = allAppts.filter(a => {
    const d = typeof a.date === 'string' ? a.date.substring(0, 10) : '';
    if (d !== selStr) return false;
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      return (a.client_name || '').toLowerCase().includes(q)
          || (a.client_phone || '').toLowerCase().includes(q)
          || (a.client_email || '').toLowerCase().includes(q)
          || (a.id || '').substring(0, 8).toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => a.start_time.localeCompare(b.start_time));

  const dayCounts = {};
  weekDays.forEach(d => {
    const ds = svLocal(d);
    const ap = allAppts.filter(a => a.date?.substring(0, 10) === ds);
    dayCounts[ds] = {
      total:     ap.length,
      paid:      ap.filter(a => a.paid).length,
      confirmed: ap.filter(a => a.status === 'confirmed').length,
    };
  });

  const todayStats = dayCounts[selStr] || { total:0, paid:0, confirmed:0 };

  const perms = [
    employee.can_cancel && { label: 'Annulation', dot: '#ef4444' },
    employee.can_modify && { label: 'Modification', dot: '#8b5cf6' },
    employee.can_encash && { label: 'Encaissement', dot: '#10b981' },
  ].filter(Boolean);

  const iconBtnStyle = {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'transparent',
    border: `0.5px solid ${t.border}`,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: t.muted,
    fontFamily: 'inherit',
    padding: 0,
  };

  const sectionCard = {
    background: t.card,
    border: `0.5px solid ${t.border}`,
    borderRadius: 12,
  };

  return (
    <div style={{ background: t.bg, minHeight: '100vh', paddingBottom: 96 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* ── HEADER ── */}
      <div style={{ padding: '14px 16px 0', display:'flex', alignItems:'center', gap:10 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour"
          style={iconBtnStyle}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <div style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          background: employee.avatar_color || t.text,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 16,
          fontWeight: 500,
          flexShrink: 0,
        }}>{employee.name.charAt(0)}</div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <p style={{ margin:0, fontSize:15, fontWeight:500, color:t.text }}>{employee.name}</p>
            {loading && <Spin size={14} />}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginTop:3 }}>
            {perms.length === 0 ? (
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, color:t.muted }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:t.dim }} />
                Consultation
              </span>
            ) : perms.map((p, j) => (
              <span key={j} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, color:t.muted }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:p.dot }} />
                {p.label}
              </span>
            ))}
          </div>
        </div>

        <Button
          size="small"
          onClick={() => setNewApptOpen(true)}
          style={{ display:'inline-flex', alignItems:'center', gap:6, flexShrink:0 }}
        >
          <I.Plus width={12} height={12} />
          RDV
        </Button>
      </div>

      {/* ── TABS ── */}
      <div style={{ padding:'12px 16px 0' }}>
        <SegmentedControl
          fullWidth
          value={mainTab}
          onChange={setMainTab}
          options={[
            { value: 'agenda',  label: 'Mon agenda' },
            { value: 'clients', label: 'Clients & notes' },
          ]}
        />
      </div>

      {mainTab === 'agenda' && (
        <>
          {/* ── CALENDRIER SEMAINE ── */}
          <div style={{ padding:'12px 16px 0' }}>
            <div style={{ ...sectionCard, padding: 14 }}>
              {/* Nav */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <button
                  type="button"
                  onClick={() => setWeekOffset(w => w - 1)}
                  aria-label="Semaine precedente"
                  style={iconBtnStyle}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div style={{ textAlign:'center' }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text, textTransform:'capitalize' }}>
                    {MONTHS_FR[weekDays[0].getMonth()]} {weekDays[0].getFullYear()}
                  </p>
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <button
                    type="button"
                    onClick={() => { setSelectedDate(new Date()); setWeekOffset(0); }}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 500,
                      background: 'transparent',
                      color: t.text,
                      border: `0.5px solid ${t.borderStrong}`,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Auj.
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekOffset(w => w + 1)}
                    aria-label="Semaine suivante"
                    style={iconBtnStyle}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              </div>

              {/* Jours */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
                {weekDays.map((d, i) => {
                  const ds   = svLocal(d);
                  const info = dayCounts[ds] || { total:0, paid:0 };
                  const isT  = d.toDateString() === today.toDateString();
                  const isSel= d.toDateString() === selectedDate.toDateString();
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedDate(new Date(d))}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '8px 0',
                        borderRadius: 8,
                        cursor: 'pointer',
                        border: `0.5px solid ${
                          isSel ? 'transparent' : (isT ? t.border : 'transparent')
                        }`,
                        background: isSel ? t.text : (isT ? t.cardAlt : 'transparent'),
                        fontFamily: 'inherit',
                      }}
                    >
                      <span style={{
                        fontSize: 10,
                        fontWeight: 500,
                        color: isSel ? 'rgba(255,255,255,0.7)' : t.muted,
                      }}>{DAYS_FR[d.getDay()]}</span>
                      <span style={{
                        fontSize: 14,
                        fontWeight: 500,
                        marginTop: 2,
                        color: isSel ? t.bg : t.text,
                      }}>{d.getDate()}</span>
                      {info.total > 0 ? (
                        <div style={{ display:'flex', alignItems:'center', gap:2, marginTop:3 }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 500,
                            padding: '1px 6px',
                            borderRadius: 99,
                            background: isSel ? 'rgba(255,255,255,0.18)' : t.cardAlt,
                            color: isSel ? t.bg : t.muted,
                          }}>{info.total}</span>
                          {info.paid > 0 && (
                            <span style={{ width:5, height:5, borderRadius:'50%', background:'#10b981', flexShrink:0 }} />
                          )}
                        </div>
                      ) : <div style={{ height:14 }} />}
                    </button>
                  );
                })}
              </div>

              {/* Legende */}
              <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:10, paddingTop:8, borderTop:`0.5px solid ${t.border}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:'#6366f1' }} />
                  <span style={{ fontSize:10, color:t.muted }}>RDV</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:'#10b981' }} />
                  <span style={{ fontSize:10, color:t.muted }}>Encaisse</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── STATS RAPIDES ── */}
          {todayStats.total > 0 && (
            <div style={{ padding:'10px 16px 0' }}>
              <div style={{ display:'flex', gap:8 }}>
                <div style={{ flex:1, ...sectionCard, padding:'10px 14px' }}>
                  <p style={{ margin:0, fontSize:11, fontWeight:500, color:t.muted }}>RDV du jour</p>
                  <p style={{ margin:'4px 0 0', fontSize:20, fontWeight:500, color:t.text,
                              fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{todayStats.total}</p>
                </div>
                <div style={{ flex:1, ...sectionCard, padding:'10px 14px' }}>
                  <p style={{ margin:0, fontSize:11, fontWeight:500, color:t.muted }}>Confirmes</p>
                  <p style={{ margin:'4px 0 0', fontSize:20, fontWeight:500, color:'#4338ca',
                              fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{todayStats.confirmed}</p>
                </div>
                <div style={{ flex:1, ...sectionCard, padding:'10px 14px' }}>
                  <p style={{ margin:0, fontSize:11, fontWeight:500, color:t.muted }}>Encaisses</p>
                  <p style={{ margin:'4px 0 0', fontSize:20, fontWeight:500, color:'#065f46',
                              fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{todayStats.paid}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── FILTRES + RECHERCHE ── */}
          <div style={{ padding:'10px 16px 0', display:'flex', flexDirection:'column', gap:8 }}>
            {allEmployees.length > 1 && (
              <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
                <button
                  type="button"
                  onClick={() => setFilterEmpId(employee.id)}
                  style={{
                    flexShrink: 0,
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    border: `0.5px solid ${filterEmpId === employee.id ? t.borderStrong : t.border}`,
                    background: filterEmpId === employee.id ? t.cardAlt : 'transparent',
                    color: filterEmpId === employee.id ? t.text : t.muted,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                  }}
                >
                  Mes RDV
                </button>
                {allEmployees.filter(e => e.is_active !== false).map(emp => {
                  const active = filterEmpId === emp.id;
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => setFilterEmpId(emp.id === filterEmpId && emp.id !== employee.id ? employee.id : emp.id)}
                      style={{
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 10px',
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 500,
                        border: `0.5px solid ${active ? t.borderStrong : t.border}`,
                        background: active ? t.cardAlt : 'transparent',
                        color: active ? t.text : t.muted,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        fontFamily: 'inherit',
                      }}
                    >
                      <div style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: emp.avatar_color || t.text,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 8,
                        fontWeight: 500,
                      }}>{emp.name.charAt(0)}</div>
                      {emp.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ position:'relative' }}>
              <span style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: t.dim,
                pointerEvents: 'none',
                display: 'inline-flex',
              }}>
                <I.Search width={14} height={14} />
              </span>
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Nom, telephone, email, n° reservation…"
                style={{
                  width: '100%',
                  padding: '10px 36px',
                  borderRadius: 8,
                  background: t.inputBg,
                  border: `0.5px solid ${searchQ ? t.borderStrong : t.borderInput}`,
                  color: t.text,
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
              {searchQ && (
                <button
                  type="button"
                  onClick={() => setSearchQ('')}
                  aria-label="Vider"
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: t.muted,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                >✕</button>
              )}
            </div>
          </div>

          {/* ── LISTE DU JOUR ── */}
          <div style={{ padding:'12px 16px 0' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, gap:8 }}>
              <div style={{ minWidth:0 }}>
                <p style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 500,
                  color: t.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {selectedDate.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}
                </p>
                <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
                  {dayAppts.length} rendez-vous
                </p>
              </div>
              <button
                type="button"
                onClick={loadAppts}
                aria-label="Rafraichir"
                style={iconBtnStyle}
              >
                <I.Refresh width={14} height={14} />
              </button>
            </div>

            {dayAppts.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                background: t.card,
                border: `0.5px dashed ${t.border}`,
                borderRadius: 12,
              }}>
                <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.muted }}>
                  {searchQ ? 'Aucun resultat' : 'Aucun rendez-vous ce jour'}
                </p>
                {!searchQ && (
                  <div style={{ display:'flex', justifyContent:'center', marginTop:12 }}>
                    <Button size="small" onClick={() => setNewApptOpen(true)}>Nouveau RDV</Button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {dayAppts.map((a, i) => (
                  <div key={a.id} style={{ animation: `fadeUp .2s ease ${i*.05}s both` }}>
                    <ApptCard appt={a} theme={t} onClick={setDetailAppt} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {mainTab === 'clients' && <ClientsTab employee={employee} theme={t} />}

      {detailAppt && (
        <ApptActionModal
          appt={detailAppt}
          employee={employee}
          services={services}
          theme={t}
          onClose={() => setDetailAppt(null)}
          onUpdated={upd => {
            setAllAppts(p => p.map(a => a.id === upd.id ? { ...a, ...upd } : a));
            setDetailAppt(prev => ({ ...prev, ...upd }));
            showToast('RDV mis a jour ✓');
          }}
          onTxCreated={tx => {
            onTxCreated(tx);
            showToast('Encaisse ! Ajoute a la caisse.');
          }}
        />
      )}

      {newApptOpen && (
        <QuickAddApptModal
          employees={allEmployees}
          defaultEmpId={employee.id}
          services={services}
          theme={t}
          onClose={() => setNewApptOpen(false)}
          onSave={async form => {
            const appt = await bookingApi.createEmpAppt(form);
            await loadAppts();
            showToast('RDV cree ✓');
            return appt;
          }}
        />
      )}
    </div>
  );
}
