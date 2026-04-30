// src/pages/clients/views/DebtsView.jsx
// Page "Créances impayées" — registre RGPD Art. 17.3.e des coordonnées
// conservées 2 ans pour le recouvrement, après suppression du compte du
// client. Coordonnées EN CLAIR (motif légal). Marquer payée ou effacer.
import { useState, useEffect, useCallback } from 'react';
import { clientsApi } from '../../../utils/api';
import { Toast } from '../../../components/UI';
import { Button } from '../../../components/primitives';
import { I } from '../../../utils/icons';

const STATUS_OPTS = [
  { id: 'open', label: 'Ouvertes' },
  { id: 'paid', label: 'Réglées' },
  { id: 'all',  label: 'Toutes' },
];

function fmtDate(s) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('fr-FR'); } catch { return ''; }
}
function fmtMoney(n) {
  return Number(n || 0).toFixed(2) + ' €';
}
function daysUntil(retentionStr) {
  if (!retentionStr) return null;
  const ms = new Date(retentionStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export default function DebtsView({ theme, toast, showToast, stickyHeader, card, setView }) {
  const t = theme;
  const [status, setStatus]     = useState('open');
  const [records, setRecords]   = useState([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading]   = useState(false);
  const [busyId, setBusyId]     = useState(null);
  const [confirmDelId, setConfirmDelId] = useState(null);
  const [paidNoteOpen, setPaidNoteOpen] = useState(null); // { id }
  const [paidNote, setPaidNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await clientsApi.listDebts(status);
      setRecords(r.records || []);
      setOpenCount(r.open_count || 0);
    } catch { showToast('Impossible de charger les créances', 'error'); }
    finally { setLoading(false); }
  }, [status, showToast]);

  useEffect(() => { load(); }, [load]);

  const markPaid = async (id, note) => {
    setBusyId(id);
    try {
      await clientsApi.markDebtPaid(id, note);
      showToast('Créance marquée comme payée', 'ok');
      setPaidNoteOpen(null); setPaidNote('');
      await load();
    } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    finally { setBusyId(null); }
  };

  const removeRecord = async (id) => {
    setBusyId(id);
    try {
      await clientsApi.removeDebt(id);
      showToast('Créance effacée', 'ok');
      setConfirmDelId(null);
      await load();
    } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    finally { setBusyId(null); }
  };

  return (
    <div style={{ background: t.bg, minHeight: '100vh', paddingBottom: 96 }}>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* Header */}
      <div style={{ ...stickyHeader, padding: '12px 16px 10px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <button type="button" onClick={() => setView('list')}
                  style={{ background:'transparent', border:'none', cursor:'pointer',
                           color:t.text, fontFamily:'inherit', padding:0,
                           display:'inline-flex', alignItems:'center', gap:4, fontSize:13 }}>
            <I.ChevronLeft width={14} height={14}/> Clients
          </button>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
          <div style={{ minWidth:0, flex:1 }}>
            <h1 style={{ margin:0, fontSize:20, fontWeight:500, color:t.text }}>Créances impayées</h1>
            <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted, lineHeight:1.5 }}>
              {"Coordonnées conservées 2 ans pour le recouvrement (RGPD Art. 17.3.e). Au-delà, effacement automatique."}
            </p>
          </div>
        </div>

        {/* Filtres status */}
        <div style={{ display:'flex', gap:6, marginTop:10 }}>
          {STATUS_OPTS.map(s => {
            const active = status === s.id;
            const showBadge = s.id === 'open' && openCount > 0;
            return (
              <button key={s.id} type="button" onClick={() => setStatus(s.id)}
                      style={{ padding:'6px 12px', borderRadius:999, border:'none',
                               background: active ? t.text : t.cardAlt,
                               color: active ? t.bg : t.muted,
                               fontSize:11, fontWeight: active ? 500 : 400,
                               cursor:'pointer', fontFamily:'inherit',
                               display:'inline-flex', alignItems:'center', gap:6 }}>
                {s.label}
                {showBadge && (
                  <span style={{ minWidth:16, height:16, padding:'0 5px',
                                 borderRadius:99, background: active ? t.bg : '#ef4444',
                                 color: active ? '#ef4444' : '#fff',
                                 fontSize:10, fontWeight:500,
                                 display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                    {openCount > 99 ? '99+' : openCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Corps */}
      <div style={{ padding:'16px 14px 0' }}>
        {loading && (
          <div style={{ textAlign:'center', padding:'48px 0' }}>
            <div style={{ width:24, height:24, borderRadius:'50%',
                          border:`0.5px solid ${t.border}`, borderTopColor:t.text,
                          animation:'spin 0.8s linear infinite', margin:'0 auto' }}/>
          </div>
        )}

        {!loading && records.length === 0 && (
          <div style={{ textAlign:'center', padding:'48px 16px',
                        background:t.card, border:`0.5px dashed ${t.border}`, borderRadius:12 }}>
            <p style={{ fontSize:14, fontWeight:500, color:t.text, margin:'0 0 6px' }}>
              {"Aucune créance"}
            </p>
            <p style={{ fontSize:12, color:t.muted, margin:0 }}>
              {status === 'open'
                ? "Aucune créance impayée pour le moment."
                : status === 'paid'
                ? "Aucune créance réglée à afficher."
                : "Aucun enregistrement de créance."}
            </p>
          </div>
        )}

        {!loading && records.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {records.map(r => {
              const fullName = [r.client_first_name, r.client_last_name].filter(Boolean).join(' ') || 'Client anonyme';
              const days = daysUntil(r.retention_until);
              const isPaid = r.status === 'paid';
              return (
                <div key={r.id} style={{ ...card, padding:14 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>{fullName}</p>
                        {isPaid && (
                          <span style={{ fontSize:10, fontWeight:500, padding:'1px 7px',
                                         borderRadius:8, background:'#f0fdf4', color:'#065f46' }}>
                            réglée
                          </span>
                        )}
                      </div>
                      {r.client_email && (
                        <p style={{ margin:'2px 0', fontSize:12, color:t.muted,
                                    fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                          {r.client_email}
                        </p>
                      )}
                      {r.client_phone && (
                        <p style={{ margin:'2px 0', fontSize:12, color:t.muted,
                                    fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                          {r.client_phone}
                        </p>
                      )}
                      <div style={{ display:'flex', gap:14, marginTop:8, fontSize:11, color:t.muted, flexWrap:'wrap' }}>
                        <span>Suppression : {fmtDate(r.recorded_at)}</span>
                        {!isPaid && days != null && (
                          <span style={{ color: days < 30 ? '#92400e' : t.muted }}>
                            Effacement auto dans {days} j
                          </span>
                        )}
                        {isPaid && r.paid_at && <span>Réglée : {fmtDate(r.paid_at)}</span>}
                      </div>
                      {r.debt_origin && (
                        <p style={{ margin:'8px 0 0', fontSize:11, color:t.dim, lineHeight:1.4, fontStyle:'italic' }}>
                          {r.debt_origin}
                        </p>
                      )}
                      {r.paid_note && (
                        <p style={{ margin:'6px 0 0', fontSize:11, color:t.muted, lineHeight:1.4 }}>
                          Note : {r.paid_note}
                        </p>
                      )}
                    </div>
                    <div style={{ flexShrink:0, textAlign:'right' }}>
                      <p style={{ margin:0, fontSize:18, fontWeight:500, color: isPaid ? '#10b981' : '#991b1b' }}>
                        {fmtMoney(r.debt_amount)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
                    {!isPaid && (
                      <button type="button"
                              disabled={busyId === r.id}
                              onClick={() => { setPaidNoteOpen({ id: r.id }); setPaidNote(''); }}
                              style={{ padding:'7px 12px', borderRadius:8, border:'none',
                                       background:'#10b981', color:'#fff',
                                       fontWeight:500, fontSize:12, cursor:'pointer',
                                       fontFamily:'inherit' }}>
                        Marquer payée
                      </button>
                    )}
                    <button type="button"
                            disabled={busyId === r.id}
                            onClick={() => setConfirmDelId(r.id)}
                            style={{ padding:'7px 12px', borderRadius:8,
                                     background:'transparent', color:t.muted,
                                     border:`0.5px solid ${t.border}`,
                                     fontWeight:500, fontSize:12, cursor:'pointer',
                                     fontFamily:'inherit' }}>
                      Effacer définitivement
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal saisie note paiement */}
      {paidNoteOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:1000,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      padding:16, background:'rgba(0,0,0,0.5)' }}
             onClick={(e) => { if (e.target === e.currentTarget) setPaidNoteOpen(null); }}>
          <div style={{ background:t.card, borderRadius:12, padding:20,
                        maxWidth:420, width:'100%', border:`0.5px solid ${t.border}` }}>
            <p style={{ margin:'0 0 12px', fontWeight:500, fontSize:15, color:t.text }}>
              Marquer comme payée
            </p>
            <p style={{ margin:'0 0 12px', fontSize:12, color:t.muted, lineHeight:1.5 }}>
              {"Une note optionnelle peut être ajoutée (mode de paiement, contexte du recouvrement)."}
            </p>
            <textarea value={paidNote} onChange={e => setPaidNote(e.target.value)}
                      placeholder="Ex : payé en espèces le 12/03 lors de son retour"
                      rows={3}
                      style={{ width:'100%', padding:'10px 12px', borderRadius:8,
                               background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
                               color:t.text, fontSize:13, fontFamily:'inherit',
                               boxSizing:'border-box', resize:'none', outline:'none', marginBottom:12 }}/>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" onClick={() => setPaidNoteOpen(null)}
                      style={{ flex:1 }}>Annuler</Button>
              <Button variant="primary"
                      onClick={() => markPaid(paidNoteOpen.id, paidNote.trim())}
                      disabled={busyId === paidNoteOpen.id}
                      style={{ flex:2 }}>
                {busyId === paidNoteOpen.id ? '…' : 'Confirmer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmation suppression */}
      {confirmDelId && (
        <div style={{ position:'fixed', inset:0, zIndex:1000,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      padding:16, background:'rgba(0,0,0,0.5)' }}
             onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelId(null); }}>
          <div style={{ background:t.card, borderRadius:12, padding:20,
                        maxWidth:420, width:'100%', border:'0.5px solid rgba(239,68,68,0.3)' }}>
            <p style={{ margin:'0 0 8px', fontWeight:500, fontSize:15, color:'#991b1b' }}>
              Effacer cette créance ?
            </p>
            <p style={{ margin:'0 0 16px', fontSize:12, color:t.muted, lineHeight:1.5 }}>
              {"Les coordonnées du client seront définitivement effacées de votre registre. Action irréversible."}
            </p>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" onClick={() => setConfirmDelId(null)}
                      style={{ flex:1 }}>Annuler</Button>
              <button type="button"
                      onClick={() => removeRecord(confirmDelId)}
                      disabled={busyId === confirmDelId}
                      style={{ flex:2, padding:'10px', borderRadius:8, border:'none',
                               background:'#991b1b', color:'#fff',
                               fontWeight:500, fontSize:13, cursor:'pointer',
                               fontFamily:'inherit', opacity: busyId === confirmDelId ? 0.7 : 1 }}>
                {busyId === confirmDelId ? '…' : 'Effacer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
