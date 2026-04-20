import { useState } from 'react';
import { I } from '../../../../utils/icons';
import { api, mediaApi } from '../../../../utils/api';
import { EmployeeForm } from '../../../../components/Forms';
import { Card, fmt, PAY_KEYS, PAY_INFO } from '../../shared';
import EmployeePinManager from '../modals/EmployeePinManager';

export default function TabEmployees({ employees, transactions, onAdd, onUpd, onDel, onPatchEmp, showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const [form, setForm] = useState({ open: false, init: null });
  const [delId, setDelId] = useState(null);
  const [pinModal, setPinModal] = useState(null);
  const [smartDelModal, setSmartDelModal] = useState(null);
  const [futureAppts, setFutureAppts]     = useState([]);
  const [smartDelLoading, setSmartDelLoading] = useState(false);
  const [smartDelResult, setSmartDelResult]   = useState(null);

  const openSmartDelete = async (emp) => {
    setSmartDelModal(emp);
    setSmartDelResult(null);
    setSmartDelLoading(true);
    try {
      const appts = await api.getEmployeeFutureAppts(emp.id);
      setFutureAppts(appts);
    } catch { setFutureAppts([]); }
    finally { setSmartDelLoading(false); }
  };

  const doSmartDelete = async () => {
    if (!smartDelModal) return;
    setSmartDelLoading(true);
    try {
      const result = await api.smartDeleteEmployee(smartDelModal.id);
      setSmartDelResult(result);
      onDel(smartDelModal.id);
      showToast('Employé supprime avec succes');
    } catch (e) {
      showToast('Erreur : ' + (e.message || 'impossible de supprimer'), 'error');
    } finally {
      setSmartDelLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button onClick={() => setForm({ open: true, init: null })}
        className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        style={{ background: isDark?'#e6edf3':'#111827', color: isDark?'#111827':'white' }}>
        <I.Plus className="w-5 h-5" /> Ajouter un employé
      </button>

      {employees.length === 0 ? (
        <Card theme={theme}><div className="py-16 text-center"><I.Users className="w-12 h-12 mx-auto mb-3" style={{ color: theme.dim }} /><p className="text-sm" style={{ color: theme.muted }}>Aucun employé</p></div></Card>
      ) : employees.map(emp => {
        const er = transactions.filter(t => t.employee_id === emp.id && t.type === 'revenue');
        const tot = er.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
        const byPay = {};
        PAY_KEYS.forEach(k => { byPay[k] = er.filter(t => t.payment_method === k).reduce((s,t) => s+(parseFloat(t.amount)||0), 0); });
        return (
          <Card key={emp.id} theme={theme}>
            <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
              {emp.has_image ? (
                <div className="w-12 h-12 rounded-2xl flex-shrink-0 overflow-hidden"
                  style={{ border:`1px solid ${theme.border}` }}>
                  <img src={mediaApi.employeeUrl(emp.id) + `?v=${emp._imgV || emp.image_version || 1}`}
                    alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                    onError={e => { e.currentTarget.style.display='none'; }} />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                  style={{ backgroundColor: emp.avatar_color || '#111827' }}>
                  {emp.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold" style={{ color: theme.text }}>{emp.name}</p>
                {emp.role && <p className="text-xs" style={{ color: theme.muted }}>{emp.role}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setPinModal(emp)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: isDark ? 'rgba(17,24,39,0.12)' : 'rgba(17,24,39,0.08)' }} title="Gérer le code PIN">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </button>
                <button onClick={() => setForm({ open: true, init: emp })} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)' }}>
                  <I.Edit className="w-4 h-4" style={{ color: theme.muted }} />
                </button>
                <button onClick={() => openSmartDelete(emp)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(248,113,113,0.1)' }} title="Supprimer l'employé">
                  <I.Trash className="w-4 h-4" style={{ color: '#f87171' }} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-6" style={{ borderTop: `1px solid ${theme.border}` }}>
              <div className="px-2 py-3 text-center" style={{ borderRight: `1px solid ${theme.border}` }}>
                <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#4ade80' }}>CA</p>
                <p className="text-sm font-bold" style={{ color: '#4ade80' }}>{fmt(tot)} €</p>
              </div>
              <div className="px-2 py-3 text-center" style={{ borderRight: `1px solid ${theme.border}` }}>
                <p className="text-[10px] mb-0.5" style={{ color: '#a5a0ff' }}>📅</p>
                {(() => { const rv = er.filter(t=>t.source==='rdv').reduce((s,t)=>s+(parseFloat(t.amount)||0),0); return rv > 0 ? <p className="text-sm font-bold" style={{ color: '#a5a0ff' }}>{fmt(rv)} €</p> : <p className="text-sm" style={{ color: theme.dim }}>—</p>; })()}
              </div>
              {PAY_KEYS.map(k => {
                const p = PAY_INFO[k]; const PmIc = p.Ic;
                return (
                  <div key={k} className="px-2 py-3 text-center" style={{ borderRight: k !== 'other' ? `1px solid ${theme.border}` : 'none' }}>
                    <div className="flex items-center justify-center mb-1"><PmIc className="w-3 h-3" style={{ color: p.color }} /></div>
                    <p className="text-sm font-bold" style={{ color: p.color }}>{fmt(byPay[k])} €</p>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 divide-x" style={{ borderTop: `1px solid ${theme.border}`, borderColor: theme.border }}>
              <div className="px-3 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold" style={{ color: theme.text }}>Site réservation</p>
                  <p className="text-[10px]" style={{ color: emp.show_on_booking!==false ? '#4ade80' : '#f87171' }}>{emp.show_on_booking!==false ? '✓ Visible' : '✗ Masque'}</p>
                </div>
                <button onClick={async () => { const upd = await onUpd(emp.id, { ...emp, show_on_booking: emp.show_on_booking===false }); if (upd) showToast('Visibilite mise a jour'); }}
                  className="w-10 h-5 rounded-full relative flex-shrink-0"
                  style={{ background: emp.show_on_booking!==false ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: emp.show_on_booking!==false ? '22px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="px-3 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold" style={{ color: theme.text }}>Caisse</p>
                  <p className="text-[10px]" style={{ color: emp.show_in_caisse!==false ? '#4ade80' : '#f87171' }}>{emp.show_in_caisse!==false ? '✓ Visible' : '✗ Masque'}</p>
                </div>
                <button onClick={async () => { const upd = await onUpd(emp.id, { ...emp, show_in_caisse: emp.show_in_caisse===false }); if (upd) showToast('Visibilite mise a jour'); }}
                  className="w-10 h-5 rounded-full relative flex-shrink-0"
                  style={{ background: emp.show_in_caisse!==false ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: emp.show_in_caisse!==false ? '22px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
            </div>
            <div className="px-4 py-3 space-y-2" style={{ borderTop: `1px solid ${theme.border}` }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.muted }}>Permissions Agenda</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut annuler ses RDV</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Annulation + email client automatique</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_cancel: !emp.can_cancel });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_cancel ? 'linear-gradient(90deg,#111827,#374151)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_cancel ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut modifier ses RDV</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Changer date, heure, coordonnées</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_modify: !emp.can_modify });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_modify ? 'linear-gradient(90deg,#111827,#374151)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_modify ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut encaisser les RDV</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Valider paiement → ajout auto en caisse</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_encash: !emp.can_encash });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_encash ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_encash ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="flex items-center justify-between py-2" style={{ borderTop:`1px solid ${theme.border}`, marginTop:6, paddingTop:10 }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut utiliser les codes promo</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Saisir un code promo ou fidélité à la caisse</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_use_promo: !(emp.can_use_promo !== false) });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: (emp.can_use_promo !== false) ? 'linear-gradient(90deg,#111827,#8b5cf6)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: (emp.can_use_promo !== false) ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
            </div>
            <div className="px-4 py-3 space-y-2" style={{ borderTop: `1px solid ${theme.border}` }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.muted }}>Permissions Crédit</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut accorder un crédit</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Créer une dette client dans le module crédit</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_grant_credit: !emp.can_grant_credit });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_grant_credit ? 'linear-gradient(90deg,#f59e0b,#f97316)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_grant_credit ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut encaisser un remboursement crédit</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Recevoir un paiement et solder le crédit d'un client</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_repay_credit: !emp.can_repay_credit });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_repay_credit ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_repay_credit ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              </div>
          </Card>
        );
      })}

      <EmployeeForm open={form.open} onClose={() => setForm({ open: false, init: null })}
        onSubmit={async d => {
          const { _imageAction, _imageFile, ...payload } = d;
          const saved = form.init ? await onUpd(form.init.id, payload) : await onAdd(payload);
          if (_imageAction === 'upload' && _imageFile && saved?.id) {
            try {
              await mediaApi.uploadEmployeeImage(saved.id, _imageFile);
              onPatchEmp?.(saved.id, { has_image: true, _imgV: Date.now() });
            } catch { showToast('Erreur upload image', 'error'); }
          } else if (_imageAction === 'delete' && saved?.id) {
            try {
              await mediaApi.deleteEmployeeImage(saved.id);
              onPatchEmp?.(saved.id, { has_image: false });
            } catch { showToast('Erreur suppression image', 'error'); }
          }
          showToast(form.init ? 'Modifie !' : 'Ajoute !');
        }}
        init={form.init} />
      {smartDelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-lg rounded-3xl overflow-hidden animate-scaleIn"
            style={{ background: theme.card, border: `1px solid ${theme.border}`, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>

            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
              style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: smartDelModal.avatar_color || '#111827' }}>
                  {smartDelModal.name?.charAt(0)}
                </div>
                <div>
                  <p className="font-bold" style={{ color: theme.text }}>Supprimer {smartDelModal.name}</p>
                  <p className="text-xs" style={{ color: '#f87171' }}>Action irréversible</p>
                </div>
              </div>
              {!smartDelResult && (
                <button onClick={() => { setSmartDelModal(null); setFutureAppts([]); }}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
                  style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', color: theme.muted }}>✕</button>
              )}
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4">
              {smartDelLoading && !smartDelResult && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-8 h-8 rounded-full border-2 animate-spin"
                    style={{ borderColor:isDark?'rgba(255,255,255,0.15)':'rgba(17,24,39,0.2)', borderTopColor:isDark?'#e6edf3':'#111827' }} />
                  <p className="text-sm" style={{ color: theme.muted }}>Analyse des rendez-vous…</p>
                </div>
              )}

              {smartDelResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-2xl"
                    style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
                    <span className="text-2xl">✅</span>
                    <div>
                      <p className="font-bold text-sm" style={{ color: '#4ade80' }}>Employé supprimé avec succès</p>
                      <p className="text-xs mt-0.5" style={{ color: theme.muted }}>
                        {smartDelResult.reassigned?.length || 0} RDV réaffecté(s) · {smartDelResult.cancelled?.length || 0} RDV annulé(s)
                      </p>
                    </div>
                  </div>
                  {smartDelResult.reassigned?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase mb-2" style={{ color: '#4ade80' }}>✓ RDV réaffectés automatiquement</p>
                      {smartDelResult.reassigned.map((a, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl mb-1"
                          style={{ background: isDark ? 'rgba(74,222,128,0.06)' : 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.15)' }}>
                          <div>
                            <p className="text-sm font-medium" style={{ color: theme.text }}>{a.client_name}</p>
                            <p className="text-xs" style={{ color: theme.muted }}>{String(a.date).substring(0,10)} à {String(a.start_time).substring(0,5)}</p>
                          </div>
                          <span className="text-xs font-bold px-2 py-1 rounded-lg"
                            style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>→ {a.new_employee}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {smartDelResult.cancelled?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase mb-2" style={{ color: '#f87171' }}>✗ RDV annulés (client notifié)</p>
                      {smartDelResult.cancelled.map((a, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl mb-1"
                          style={{ background: isDark ? 'rgba(248,113,113,0.06)' : 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)' }}>
                          <div>
                            <p className="text-sm font-medium" style={{ color: theme.text }}>{a.client_name}</p>
                            <p className="text-xs" style={{ color: theme.muted }}>{String(a.date).substring(0,10)} à {String(a.start_time).substring(0,5)}</p>
                          </div>
                          {a.client_email && <span className="text-xs" style={{ color: theme.dim }}>📧 notifié</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => { setSmartDelModal(null); setFutureAppts([]); setSmartDelResult(null); }}
                    className="w-full py-3 rounded-2xl font-bold text-white"
                    style={{ background: isDark?'#e6edf3':'#111827', color: isDark?'#111827':'white' }}>
                    Fermer
                  </button>
                </div>
              )}

              {!smartDelLoading && !smartDelResult && (
                <div className="space-y-4">
                  {futureAppts.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-3xl mb-2">✅</p>
                      <p className="font-semibold text-sm" style={{ color: theme.text }}>Aucun rendez-vous futur</p>
                      <p className="text-xs mt-1" style={{ color: theme.muted }}>Cet employé peut être supprimé immédiatement.</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold mb-3" style={{ color: theme.text }}>
                        {futureAppts.length} rendez-vous futur{futureAppts.length > 1 ? 's' : ''} seront traités :
                      </p>
                      <div className="space-y-2 mb-4">
                        {futureAppts.map((a, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl"
                            style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa', border: `1px solid ${theme.border}` }}>
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                              style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>📅</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>{a.client_name}</p>
                              <p className="text-xs" style={{ color: theme.muted }}>
                                {String(a.date).substring(0,10)} · {String(a.start_time).substring(0,5)} · {a.service_name || 'Prestation'}
                              </p>
                            </div>
                            {a.client_email && <span style={{ fontSize:10, color: theme.dim }}>📧</span>}
                          </div>
                        ))}
                      </div>
                      <div className="p-3 rounded-xl text-sm"
                        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#d97706' }}>
                        ⚡ Les RDV seront réaffectés automatiquement si possible, sinon annulés avec notification client.
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => { setSmartDelModal(null); setFutureAppts([]); }}
                      className="flex-1 py-3 rounded-2xl font-bold text-sm"
                      style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6', color: theme.muted }}>
                      Annuler
                    </button>
                    <button onClick={doSmartDelete} disabled={smartDelLoading}
                      className="flex-1 py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                      {smartDelLoading ? 'Traitement...' : '🗑 Confirmer la suppression'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {pinModal && (
        <EmployeePinManager
          emp={pinModal}
          onClose={() => setPinModal(null)}
          showToast={showToast}
          theme={theme}
        />
      )}
    </div>
  );
}
