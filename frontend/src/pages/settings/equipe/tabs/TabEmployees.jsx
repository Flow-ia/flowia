import { useState } from 'react';
import { I } from '../../../../utils/icons';
import { api, mediaApi } from '../../../../utils/api';
import { EmployeeForm } from '../../../../components/Forms';
import { Card, fmt, PAY_KEYS, PAY_INFO } from '../../shared';
import EmployeePinManager from '../modals/EmployeePinManager';
import Toggle from '../components/Toggle';
import { Button } from '../../../../components/primitives';

export default function TabEmployees({ employees, transactions, onAdd, onUpd, onDel, onPatchEmp, showToast, theme }) {
  const t = theme;
  const [form, setForm]         = useState({ open:false, init:null });
  const [delId, setDelId]       = useState(null);
  const [pinModal, setPinModal] = useState(null);
  const [smartDelModal, setSmartDelModal] = useState(null);
  const [futureAppts, setFutureAppts]     = useState([]);
  const [smartDelLoading, setSmartDelLoading] = useState(false);
  const [smartDelResult,  setSmartDelResult]  = useState(null);

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
      showToast('Employe supprime avec succes');
    } catch (e) {
      showToast('Erreur : ' + (e.message || 'impossible de supprimer'), 'error');
    } finally {
      setSmartDelLoading(false);
    }
  };

  // Ligne permission (toggle + label + description)
  const PermRow = ({ title, desc, value, onChange, colorOn }) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <div>
        <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>{title}</p>
        <p style={{ fontSize:11, color:t.muted, margin:0 }}>{desc}</p>
      </div>
      <Toggle on={value} onChange={onChange} colorOn={colorOn || t.text}/>
    </div>
  );

  const Spinner = ({ size = 28 }) => (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24"
         style={{ color:t.text, display:'inline-block' }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
      <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <Button variant="primary" fullWidth type="button"
              onClick={() => setForm({ open:true, init:null })}>
        <I.Plus style={{ width:15, height:15, marginRight:6 }}/>
        Ajouter un employe
      </Button>

      {employees.length === 0 ? (
        <Card theme={theme}>
          <div style={{ padding:'64px 0', textAlign:'center' }}>
            <I.Users style={{ width:40, height:40, margin:'0 auto 12px', color:t.dim, display:'block' }}/>
            <p style={{ fontSize:13, color:t.muted, margin:0 }}>Aucun employe</p>
          </div>
        </Card>
      ) : employees.map(emp => {
        const er = transactions.filter(tx => tx.employee_id === emp.id && tx.type === 'revenue');
        const tot = er.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
        const byPay = {};
        PAY_KEYS.forEach(k => {
          byPay[k] = er.filter(tx => tx.payment_method === k)
                       .reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
        });
        const rvCaRdv = er.filter(tx => tx.source === 'rdv').reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);

        return (
          <Card key={emp.id} theme={theme}>
            {/* Header : avatar + nom + actions */}
            <div style={{ display:'flex', alignItems:'center', gap:12,
                          padding:'14px 16px',
                          borderBottom:`0.5px solid ${t.separator}` }}>
              {emp.has_image ? (
                <div style={{ width:46, height:46, borderRadius:8, flexShrink:0, overflow:'hidden',
                              border:`0.5px solid ${t.border}` }}>
                  <img src={mediaApi.employeeUrl(emp.id) + `?v=${emp._imgV || emp.image_version || 1}`}
                       alt=""
                       style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                       onError={e => { e.currentTarget.style.display = 'none'; }}/>
                </div>
              ) : (
                <div style={{ width:46, height:46, borderRadius:8, flexShrink:0,
                              backgroundColor: emp.avatar_color || t.text,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              color:'white', fontWeight:500, fontSize:18 }}>
                  {emp.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14, fontWeight:500, color:t.text, margin:0 }}>{emp.name}</p>
                {emp.role && <p style={{ fontSize:11, color:t.muted, margin:0 }}>{emp.role}</p>}
              </div>
              <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                <button onClick={() => setPinModal(emp)} title="Gerer le code PIN"
                        style={{ width:34, height:34, borderRadius:8, border:'none', cursor:'pointer',
                                 background:t.cardAlt,
                                 display:'flex', alignItems:'center', justifyContent:'center',
                                 fontFamily:'inherit' }}>
                  <I.Lock style={{ width:14, height:14, color:t.text }}/>
                </button>
                <button onClick={() => setForm({ open:true, init:emp })}
                        style={{ width:34, height:34, borderRadius:8, border:'none', cursor:'pointer',
                                 background:t.cardAlt,
                                 display:'flex', alignItems:'center', justifyContent:'center',
                                 fontFamily:'inherit' }}>
                  <I.Edit style={{ width:14, height:14, color:t.muted }}/>
                </button>
                <button onClick={() => openSmartDelete(emp)} title={"Supprimer l'employe"}
                        style={{ width:34, height:34, borderRadius:8, border:'none', cursor:'pointer',
                                 background:'rgba(239,68,68,0.1)',
                                 display:'flex', alignItems:'center', justifyContent:'center',
                                 fontFamily:'inherit' }}>
                  <I.Trash style={{ width:14, height:14, color:'#991b1b' }}/>
                </button>
              </div>
            </div>

            {/* Grille stats : CA + RDV + 4 modes paiement */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)',
                          borderBottom:`0.5px solid ${t.separator}` }}>
              <div style={{ padding:'12px 8px', textAlign:'center',
                            borderRight:`0.5px solid ${t.separator}` }}>
                <p style={{ fontSize:10, color:'#065f46', margin:'0 0 2px' }}>CA</p>
                <p style={{ fontSize:13, fontWeight:500, color:'#065f46', margin:0 }}>{fmt(tot)} €</p>
              </div>
              <div style={{ padding:'12px 8px', textAlign:'center',
                            borderRight:`0.5px solid ${t.separator}` }}>
                <I.Calendar style={{ width:12, height:12, color:'#4338ca', margin:'0 auto 2px', display:'block' }}/>
                {rvCaRdv > 0
                  ? <p style={{ fontSize:13, fontWeight:500, color:'#4338ca', margin:0 }}>{fmt(rvCaRdv)} €</p>
                  : <p style={{ fontSize:13, color:t.dim, margin:0 }}>—</p>}
              </div>
              {PAY_KEYS.map(k => {
                const p = PAY_INFO[k]; const PmIc = p.Ic;
                return (
                  <div key={k}
                       style={{ padding:'12px 8px', textAlign:'center',
                                borderRight: k !== 'other' ? `0.5px solid ${t.separator}` : 'none' }}>
                    <PmIc style={{ width:12, height:12, color:p.color, margin:'0 auto 2px', display:'block' }}/>
                    <p style={{ fontSize:13, fontWeight:500, color:p.color, margin:0 }}>{fmt(byPay[k])} €</p>
                  </div>
                );
              })}
            </div>

            {/* Visibilite site/caisse */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
                          borderBottom:`0.5px solid ${t.separator}` }}>
              <div style={{ padding:'12px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
                            borderRight:`0.5px solid ${t.separator}` }}>
                <div>
                  <p style={{ fontSize:12, fontWeight:500, color:t.text, margin:0 }}>Site reservation</p>
                  <p style={{ fontSize:10, margin:0,
                              color: emp.show_on_booking !== false ? '#065f46' : '#991b1b' }}>
                    {emp.show_on_booking !== false ? 'Visible' : 'Masque'}
                  </p>
                </div>
                <Toggle on={emp.show_on_booking !== false}
                        colorOn="#065f46"
                        onChange={async () => {
                          const upd = await onUpd(emp.id, { ...emp, show_on_booking: emp.show_on_booking === false });
                          if (upd) showToast('Visibilite mise a jour');
                        }}/>
              </div>
              <div style={{ padding:'12px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                <div>
                  <p style={{ fontSize:12, fontWeight:500, color:t.text, margin:0 }}>Caisse</p>
                  <p style={{ fontSize:10, margin:0,
                              color: emp.show_in_caisse !== false ? '#065f46' : '#991b1b' }}>
                    {emp.show_in_caisse !== false ? 'Visible' : 'Masque'}
                  </p>
                </div>
                <Toggle on={emp.show_in_caisse !== false}
                        colorOn="#065f46"
                        onChange={async () => {
                          const upd = await onUpd(emp.id, { ...emp, show_in_caisse: emp.show_in_caisse === false });
                          if (upd) showToast('Visibilite mise a jour');
                        }}/>
              </div>
            </div>

            {/* Permissions Agenda */}
            <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:12,
                          borderBottom:`0.5px solid ${t.separator}` }}>
              <p style={{ fontSize:11, color:t.muted, margin:0 }}>Permissions Agenda</p>
              <PermRow title="Peut annuler ses RDV"
                       desc="Annulation + email client automatique"
                       value={!!emp.can_cancel}
                       onChange={async () => {
                         const updated = await onUpd(emp.id, { ...emp, can_cancel: !emp.can_cancel });
                         if (updated) showToast('Permission mise a jour');
                       }}/>
              <PermRow title="Peut modifier ses RDV"
                       desc="Changer date, heure, coordonnees"
                       value={!!emp.can_modify}
                       onChange={async () => {
                         const updated = await onUpd(emp.id, { ...emp, can_modify: !emp.can_modify });
                         if (updated) showToast('Permission mise a jour');
                       }}/>
              <PermRow title="Peut encaisser les RDV"
                       desc="Valider paiement → ajout auto en caisse"
                       value={!!emp.can_encash}
                       colorOn="#065f46"
                       onChange={async () => {
                         const updated = await onUpd(emp.id, { ...emp, can_encash: !emp.can_encash });
                         if (updated) showToast('Permission mise a jour');
                       }}/>
              <div style={{ borderTop:`0.5px solid ${t.separator}`, paddingTop:10 }}>
                <PermRow title="Peut utiliser les codes promo"
                         desc="Saisir un code promo ou fidelite a la caisse"
                         value={emp.can_use_promo !== false}
                         colorOn="#3c3489"
                         onChange={async () => {
                           const updated = await onUpd(emp.id, { ...emp, can_use_promo: !(emp.can_use_promo !== false) });
                           if (updated) showToast('Permission mise a jour');
                         }}/>
              </div>
            </div>

            {/* Permissions Credit */}
            <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
              <p style={{ fontSize:11, color:t.muted, margin:0 }}>Permissions Credit</p>
              <PermRow title="Peut accorder un credit"
                       desc="Creer une dette client dans le module credit"
                       value={!!emp.can_grant_credit}
                       colorOn="#92400e"
                       onChange={async () => {
                         const updated = await onUpd(emp.id, { ...emp, can_grant_credit: !emp.can_grant_credit });
                         if (updated) showToast('Permission mise a jour');
                       }}/>
              <PermRow title="Peut encaisser un remboursement credit"
                       desc={"Recevoir un paiement et solder le credit d'un client"}
                       value={!!emp.can_repay_credit}
                       colorOn="#065f46"
                       onChange={async () => {
                         const updated = await onUpd(emp.id, { ...emp, can_repay_credit: !emp.can_repay_credit });
                         if (updated) showToast('Permission mise a jour');
                       }}/>
            </div>
          </Card>
        );
      })}

      <EmployeeForm open={form.open} onClose={() => setForm({ open:false, init:null })}
                    onSubmit={async d => {
                      const { _imageAction, _imageFile, ...payload } = d;
                      const saved = form.init ? await onUpd(form.init.id, payload) : await onAdd(payload);
                      if (_imageAction === 'upload' && _imageFile && saved?.id) {
                        try {
                          await mediaApi.uploadEmployeeImage(saved.id, _imageFile);
                          onPatchEmp?.(saved.id, { has_image:true, _imgV:Date.now() });
                        } catch (e) {
                          showToast(e?.message || 'Erreur upload image', 'error');
                          return;
                        }
                      } else if (_imageAction === 'delete' && saved?.id) {
                        try {
                          await mediaApi.deleteEmployeeImage(saved.id);
                          onPatchEmp?.(saved.id, { has_image:false });
                        } catch (e) {
                          showToast(e?.message || 'Erreur suppression image', 'error');
                          return;
                        }
                      }
                      showToast(form.init ? 'Modifie' : 'Ajoute');
                    }}
                    init={form.init}/>

      {/* Modal smart delete */}
      {smartDelModal && (
        <div style={{ position:'fixed', inset:0, zIndex:50,
                      display:'flex', alignItems:'center', justifyContent:'center', padding:16,
                      background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}>
          <div className="anim-scaleIn"
               style={{ width:'100%', maxWidth:500, borderRadius:16, overflow:'hidden',
                        background:t.elevated,
                        border:`0.5px solid ${t.border}`,
                        boxShadow:t.shadowModal,
                        maxHeight:'85vh', display:'flex', flexDirection:'column' }}>

            <div style={{ padding:'14px 20px', flexShrink:0,
                          borderBottom:`0.5px solid ${t.separator}`,
                          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:8,
                              backgroundColor: smartDelModal.avatar_color || t.text,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              color:'white', fontWeight:500 }}>
                  {smartDelModal.name?.charAt(0)}
                </div>
                <div>
                  <p style={{ fontSize:14, fontWeight:500, color:t.text, margin:0 }}>
                    Supprimer {smartDelModal.name}
                  </p>
                  <p style={{ fontSize:11, color:'#991b1b', margin:0 }}>Action irreversible</p>
                </div>
              </div>
              {!smartDelResult && (
                <button onClick={() => { setSmartDelModal(null); setFutureAppts([]); }}
                        style={{ width:28, height:28, borderRadius:8, border:'none', cursor:'pointer',
                                 background:t.cardAlt, color:t.muted, fontSize:15,
                                 display:'flex', alignItems:'center', justifyContent:'center',
                                 fontFamily:'inherit' }}>×</button>
              )}
            </div>

            <div style={{ overflowY:'auto', flex:1, padding:'16px 20px' }}>
              {smartDelLoading && !smartDelResult && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:'32px 0' }}>
                  <Spinner/>
                  <p style={{ fontSize:13, color:t.muted, margin:0 }}>Analyse des rendez-vous…</p>
                </div>
              )}

              {smartDelResult && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, padding:14, borderRadius:12,
                                background:'#f0fdf4' }}>
                    <I.Check style={{ width:22, height:22, color:'#065f46', flexShrink:0 }}/>
                    <div>
                      <p style={{ fontSize:13, fontWeight:500, color:'#065f46', margin:0 }}>
                        Employe supprime avec succes
                      </p>
                      <p style={{ fontSize:11, color:t.muted, margin:'2px 0 0' }}>
                        {smartDelResult.reassigned?.length || 0} RDV reaffecte(s) · {smartDelResult.cancelled?.length || 0} RDV annule(s)
                      </p>
                    </div>
                  </div>
                  {smartDelResult.reassigned?.length > 0 && (
                    <div>
                      <p style={{ fontSize:11, fontWeight:500, color:'#065f46', margin:'0 0 8px' }}>
                        RDV reaffectes automatiquement
                      </p>
                      {smartDelResult.reassigned.map((a, i) => (
                        <div key={i}
                             style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                      padding:'8px 12px', borderRadius:8, marginBottom:4,
                                      background:'#f0fdf4' }}>
                          <div>
                            <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>{a.client_name}</p>
                            <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                              {String(a.date).substring(0, 10)} a {String(a.start_time).substring(0, 5)}
                            </p>
                          </div>
                          <span style={{ fontSize:11, fontWeight:500, padding:'3px 10px', borderRadius:99,
                                         background:'rgba(16,185,129,0.15)', color:'#065f46' }}>
                            → {a.new_employee}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {smartDelResult.cancelled?.length > 0 && (
                    <div>
                      <p style={{ fontSize:11, fontWeight:500, color:'#991b1b', margin:'0 0 8px' }}>
                        RDV annules (client notifie)
                      </p>
                      {smartDelResult.cancelled.map((a, i) => (
                        <div key={i}
                             style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                      padding:'8px 12px', borderRadius:8, marginBottom:4,
                                      background:'#fef2f2' }}>
                          <div>
                            <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>{a.client_name}</p>
                            <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                              {String(a.date).substring(0, 10)} a {String(a.start_time).substring(0, 5)}
                            </p>
                          </div>
                          {a.client_email && (
                            <span style={{ fontSize:10, color:t.dim,
                                           display:'inline-flex', alignItems:'center', gap:4 }}>
                              <I.Mail style={{ width:10, height:10 }}/>
                              notifie
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="primary" fullWidth type="button"
                          onClick={() => { setSmartDelModal(null); setFutureAppts([]); setSmartDelResult(null); }}>
                    Fermer
                  </Button>
                </div>
              )}

              {!smartDelLoading && !smartDelResult && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {futureAppts.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'24px 0' }}>
                      <I.Check style={{ width:28, height:28, color:'#065f46', margin:'0 auto 8px', display:'block' }}/>
                      <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>
                        Aucun rendez-vous futur
                      </p>
                      <p style={{ fontSize:12, color:t.muted, margin:'4px 0 0' }}>
                        Cet employe peut etre supprime immediatement.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:'0 0 12px' }}>
                        {futureAppts.length} rendez-vous futur{futureAppts.length > 1 ? 's' : ''} seront traites :
                      </p>
                      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
                        {futureAppts.map((a, i) => (
                          <div key={i}
                               style={{ display:'flex', alignItems:'center', gap:12,
                                        padding:12, borderRadius:8,
                                        background:t.cardAlt,
                                        border:`0.5px solid ${t.border}` }}>
                            <div style={{ width:32, height:32, borderRadius:8, flexShrink:0,
                                          background:'#fffbeb',
                                          display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <I.Calendar style={{ width:14, height:14, color:'#92400e' }}/>
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0,
                                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {a.client_name}
                              </p>
                              <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                                {String(a.date).substring(0, 10)} · {String(a.start_time).substring(0, 5)} · {a.service_name || 'Prestation'}
                              </p>
                            </div>
                            {a.client_email && (
                              <I.Mail style={{ width:11, height:11, color:t.dim, flexShrink:0 }}/>
                            )}
                          </div>
                        ))}
                      </div>
                      <div style={{ padding:12, borderRadius:8, fontSize:12,
                                    background:'#fffbeb', color:'#92400e' }}>
                        Les RDV seront reaffectes automatiquement si possible, sinon annules avec notification client.
                      </div>
                    </div>
                  )}

                  <div style={{ display:'flex', gap:10 }}>
                    <Button variant="secondary" type="button"
                            onClick={() => { setSmartDelModal(null); setFutureAppts([]); }}
                            style={{ flex:1 }}>
                      Annuler
                    </Button>
                    <button onClick={doSmartDelete} disabled={smartDelLoading}
                            style={{ flex:1, padding:'10px', borderRadius:8, border:'none', cursor:'pointer',
                                     background:'#991b1b', color:'white',
                                     fontWeight:500, fontSize:13, opacity: smartDelLoading ? 0.7 : 1,
                                     fontFamily:'inherit' }}>
                      {smartDelLoading ? 'Traitement...' : 'Confirmer la suppression'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {pinModal && (
        <EmployeePinManager emp={pinModal} onClose={() => setPinModal(null)}
                            showToast={showToast} theme={theme}/>
      )}
    </div>
  );
}
