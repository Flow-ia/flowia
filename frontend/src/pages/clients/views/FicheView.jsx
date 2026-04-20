// src/pages/clients/views/FicheView.jsx
import Avatar from '../components/Avatar';
import BackBtn from '../components/BackBtn';
import InfoTab from '../tabs/InfoTab';
import CreditTab from '../tabs/CreditTab';
import NotesTab from '../tabs/NotesTab';
import HistoryTab from '../tabs/HistoryTab';
import { Toast, Confirm } from '../../../components/UI';

// ══ VUE FICHE ═══════════════════════════════════════════════════════════════
export default function FicheView({
  theme, isDark, toast,
  stickyHeader, card, inp, lbl,
  fiche, ficheLoad, setFiche,
  activeTab, setTab,
  editMode, setEditMode,
  form, setForm,
  busy,
  confirmDel, setConfirmDel,
  confirmBlock, setConfirmBlock,
  blockBusy, inviting,
  noteText, setNoteText,
  noteEmpId, setNoteEmpId,
  noteLoad,
  employees,
  creditData, creditLoading, loadCredit,
  creditMode, setCreditMode,
  creditAmt, setCreditAmt,
  creditNote, setCreditNote,
  creditEmpId, setCreditEmpId,
  repayAmt, setRepayAmt,
  repayNote, setRepayNote,
  repayEmpId, setRepayEmpId,
  repayMethod, setRepayMethod,
  creditBusy,
  handleDelete, handleBlock, handleInvite, handleUpdate, handleNote,
  handleGrantCredit, handleRepayCredit,
  setView,
  PinModalNode,
}) {
  return (
    <div style={{ background:theme.bg, minHeight:'100vh', paddingBottom:96 }}>
      <Toast msg={toast?.msg} type={toast?.type} />
      <Confirm open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={handleDelete}
        title={fiche?.global_client_id ? "Retirer ce client ?" : "Supprimer ce client ?"}
        desc={fiche?.global_client_id
          ? "La relation avec ce client sera supprimée de votre liste. Son compte plateforme et son historique global restent intacts."
          : "Cette action supprimera définitivement la fiche de ce client interne."}
        theme={theme} />

      <Confirm
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={handleBlock}
        title={fiche?.is_booking_blocked ? "Débloquer ce client ?" : "Bloquer ce client ?"}
        desc={fiche?.is_booking_blocked
          ? "Ce client pourra à nouveau prendre rendez-vous en ligne chez vous."
          : "Ce client ne pourra plus effectuer de réservation en ligne chez vous. Vous pouvez le débloquer à tout moment."}
        theme={theme} />

      <div style={{ ...stickyHeader, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
        <BackBtn onClick={() => { setView('list'); setEditMode(false); }} theme={theme} isDark={isDark} />
        <span style={{ fontWeight:800, fontSize:16, color:theme.text, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {fiche ? [fiche.first_name, fiche.last_name].filter(Boolean).join(' ') || 'Fiche client' : '...'}
        </span>
        {fiche && (
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {/* Bouton Bloquer / Débloquer */}
            <button
              onClick={() => setConfirmBlock(true)}
              disabled={blockBusy}
              title={fiche.is_booking_blocked ? 'Débloquer les reservations' : 'Bloquer les reservations'}
              style={{ padding:'6px 10px', borderRadius:10,
                background: fiche.is_booking_blocked ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${fiche.is_booking_blocked ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.15)'}`,
                color: fiche.is_booking_blocked ? '#f59e0b' : '#ef4444',
                fontWeight:700, fontSize:12, cursor:'pointer', opacity: blockBusy ? 0.5 : 1 }}>
              {fiche.is_booking_blocked ? '🔓' : '🚫'}
            </button>
            {/* Bouton Supprimer */}
            <button onClick={() => setConfirmDel(true)}
              style={{ padding:'6px 12px', borderRadius:10, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.15)', color:'#ef4444', fontWeight:700, fontSize:12, cursor:'pointer' }}>
              🗑
            </button>
          </div>
        )}
      </div>

      {ficheLoad ? (
        <div style={{ textAlign:'center', padding:'64px 0', color:theme.muted }}>
          <div style={{ width:40, height:40, borderRadius:'50%', border:`3px solid ${theme.border}`, borderTopColor:'#111827', animation:'spin 0.8s linear infinite', margin:'0 auto 14px' }} />
        </div>
      ) : fiche ? (
        <div style={{ padding:'14px 14px 0' }}>

          {/* Carte identité */}
          <div style={{ ...card, padding:18, marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom: editMode ? 16 : 0 }}>
              <Avatar cl={fiche} size={54} radius={17} fontSize={22} />
              <div style={{ flex:1, minWidth:0 }}>
                <h2 style={{ margin:'0 0 3px', fontSize:18, fontWeight:900, color:theme.text }}>{[fiche.first_name,fiche.last_name].filter(Boolean).join(' ')||'-'}</h2>
                {fiche.email && <p style={{ margin:'0 0 1px', fontSize:13, color:theme.muted }}>{fiche.email}</p>}
                {fiche.phone && <p style={{ margin:0, fontSize:13, color:theme.muted }}>{fiche.phone}</p>}
              </div>

              {/* ÉTAPE 2 : bouton Éditer — toujours visible mais mode différent selon type */}
              <button onClick={() => {
                if (!editMode) setForm({ first_name:fiche.first_name||'', last_name:fiche.last_name||'', email:fiche.email||'', phone:fiche.phone||'', notes:fiche.notes||'' });
                setEditMode(v=>!v);
              }}
                style={{ padding:'7px 13px', borderRadius:10, background:editMode?theme.border:'rgba(17,24,39,0.1)', border:`1px solid ${editMode?theme.border:'rgba(17,24,39,0.2)'}`, color:editMode?theme.muted:'#111827', fontWeight:700, fontSize:12, cursor:'pointer', flexShrink:0 }}>
                {editMode ? 'Annuler' : '✏️ Éditer'}
              </button>
            </div>

            {/* ÉTAPE 6 — Badge type client bien visible */}
            {!editMode && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:12, marginTop:12, borderTop:`1px solid ${theme.border}` }}>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {fiche.global_client_id ? (
                    <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:99, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.2)' }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:'#10b981' }} />
                      <span style={{ fontSize:11, fontWeight:800, color:'#10b981' }}>Compte plateforme</span>
                    </div>
                  ) : fiche.source === 'booking' ? (
                    <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:99, background:'rgba(17,24,39,0.08)', border:'1px solid rgba(17,24,39,0.15)' }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:'#111827' }} />
                      <span style={{ fontSize:11, fontWeight:800, color:'#111827' }}>Réservation en ligne</span>
                    </div>
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:99, background:'rgba(148,163,184,0.1)', border:'1px solid rgba(148,163,184,0.2)' }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:'#64748b' }} />
                      <span style={{ fontSize:11, fontWeight:800, color:'#64748b' }}>Client interne</span>
                    </div>
                  )}
                  {/* Badge BLOQUÉ */}
                  {fiche.is_booking_blocked && (
                    <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:99, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)' }}>
                      <span style={{ fontSize:11 }}>🚫</span>
                      <span style={{ fontSize:11, fontWeight:800, color:'#ef4444' }}>Réservations bloquées</span>
                    </div>
                  )}
                </div>

                {/* ÉTAPE 7 — Bouton invitation amélioré */}
                {fiche.email && !fiche.global_client_id && (
                  <button onClick={handleInvite} disabled={inviting || fiche.invited}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:10, background: fiche.invited ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.1)', border:`1px solid ${fiche.invited ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.25)'}`, color:'#10b981', fontWeight:700, fontSize:12, cursor: fiche.invited ? 'default' : 'pointer', opacity:inviting?0.6:1 }}>
                    {fiche.invited ? '✓ Invitation envoyee' : inviting ? '...' : '📧 Inviter a creer un compte'}
                  </button>
                )}
              </div>
            )}

            {/* ÉTAPE 2 — Formulaire d'édition avec champs verrouillés pour compte global */}
            {editMode && (
              <div style={{ display:'flex', flexDirection:'column', gap:10, paddingTop:14, borderTop:`1px solid ${theme.border}` }}>

                {/* Avertissement compte global */}
                {fiche.global_client_id && (
                  <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px', borderRadius:12, background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)', marginBottom:2 }}>
                    <span style={{ fontSize:15, flexShrink:0 }}>🔒</span>
                    <div>
                      <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#d97706' }}>Informations verrouillées</p>
                      <p style={{ margin:'2px 0 0', fontSize:11, color:'#92400e' }}>Ce client possède un compte plateforme. Il gère lui-même son nom, email et téléphone. Seules les notes internes sont modifiables.</p>
                    </div>
                  </div>
                )}

                {/* Champs identité — disabled si compte global */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div>
                    <label style={{ ...lbl, display:'flex', alignItems:'center', gap:4 }}>
                      Prénom {fiche.global_client_id && <span style={{ fontSize:10, color:'#f59e0b' }}>🔒</span>}
                    </label>
                    <input value={form.first_name} onChange={e=>setForm(f=>({...f,first_name:e.target.value}))}
                      disabled={!!fiche.global_client_id}
                      style={{ ...inp, opacity:fiche.global_client_id?0.5:1, cursor:fiche.global_client_id?'not-allowed':'text' }} />
                  </div>
                  <div>
                    <label style={{ ...lbl, display:'flex', alignItems:'center', gap:4 }}>
                      Nom {fiche.global_client_id && <span style={{ fontSize:10, color:'#f59e0b' }}>🔒</span>}
                    </label>
                    <input value={form.last_name} onChange={e=>setForm(f=>({...f,last_name:e.target.value}))}
                      disabled={!!fiche.global_client_id}
                      style={{ ...inp, opacity:fiche.global_client_id?0.5:1, cursor:fiche.global_client_id?'not-allowed':'text' }} />
                  </div>
                </div>
                <div>
                  <label style={{ ...lbl, display:'flex', alignItems:'center', gap:4 }}>
                    Email {fiche.global_client_id && <span style={{ fontSize:10, color:'#f59e0b' }}>🔒</span>}
                  </label>
                  <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
                    disabled={!!fiche.global_client_id}
                    style={{ ...inp, opacity:fiche.global_client_id?0.5:1, cursor:fiche.global_client_id?'not-allowed':'text' }} />
                </div>
                <div>
                  <label style={{ ...lbl, display:'flex', alignItems:'center', gap:4 }}>
                    Téléphone {fiche.global_client_id && <span style={{ fontSize:10, color:'#f59e0b' }}>🔒</span>}
                  </label>
                  <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}
                    disabled={!!fiche.global_client_id}
                    style={{ ...inp, opacity:fiche.global_client_id?0.5:1, cursor:fiche.global_client_id?'not-allowed':'text' }} />
                </div>
                <div>
                  <label style={lbl}>Notes internes</label>
                  <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}
                    style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} />
                </div>
                <button onClick={handleUpdate} disabled={busy}
                  style={{ padding:'12px', borderRadius:12, background:'Black', border:'none', color:'white', fontWeight:800, fontSize:14, cursor:'pointer', opacity:busy?0.65:1 }}>
                  {busy ? 'Enregistrement...' : fiche.global_client_id ? '✓ Enregistrer les notes' : '✓ Enregistrer'}
                </button>
              </div>
            )}
          </div>

          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
            {[
              ['👁', fiche.total_visits||fiche.tx_count||0, 'Visites'],
              ['💶', `${Number(fiche.total_spent||0).toFixed(0)}€`, 'Dépense'],
              ['🎫', fiche.loyalty_mode==='points'?Math.floor(fiche.points||0):(fiche.stamps||0), fiche.loyalty_mode==='points'?'Pts':'Tamb.'],
              ['🎁', fiche.rewards_earned||0, 'Recomp.'],
            ].map(([ic, val, l2]) => (
              <div key={l2} style={{ ...card, padding:'11px 8px', textAlign:'center' }}>
                <div style={{ fontSize:19 }}>{ic}</div>
                <p style={{ margin:'3px 0 1px', fontSize:16, fontWeight:900, color:theme.text }}>{val}</p>
                <p style={{ margin:0, fontSize:10, color:theme.muted, fontWeight:700 }}>{l2}</p>
              </div>
            ))}
          </div>

          {/* Onglets */}
          <div style={{ display:'flex', background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)', borderRadius:14, padding:4, marginBottom:12 }}>
            {[['info','ℹ️ Infos'],['credit','💳 Credit'],['notes','📝 Notes'],['history','📅 Historique']].map(([t,l2]) => (
              <button key={t} onClick={() => {
                setTab(t);
                if (t === 'credit' && !creditData) loadCredit(fiche.id);
              }}
                style={{ flex:1, padding:'9px 4px', borderRadius:10, border:'none', fontWeight:700, fontSize:11, cursor:'pointer', background:activeTab===t?theme.card:'transparent', color:activeTab===t?theme.text:theme.muted, boxShadow:activeTab===t?'0 1px 4px rgba(0,0,0,0.1)':'none', transition:'all .15s', position:'relative' }}>
                {l2}
                {/* Badge solde si crédit actif */}
                {t === 'credit' && creditData?.credit && parseFloat(creditData.credit.balance) > 0 && (
                  <span style={{ position:'absolute', top:2, right:2, width:7, height:7, borderRadius:'50%', background:'#ef4444' }} />
                )}
              </button>
            ))}
          </div>

          {/* Onglet Infos */}
          {activeTab === 'info' && (
            <InfoTab fiche={fiche} theme={theme} card={card} />
          )}

          {/* Onglet Crédit */}
          {activeTab === 'credit' && (
            <CreditTab
              theme={theme} card={card} inp={inp}
              fiche={fiche} employees={employees}
              creditData={creditData} creditLoading={creditLoading}
              creditMode={creditMode} setCreditMode={setCreditMode}
              creditAmt={creditAmt} setCreditAmt={setCreditAmt}
              creditNote={creditNote} setCreditNote={setCreditNote}
              creditEmpId={creditEmpId} setCreditEmpId={setCreditEmpId}
              repayAmt={repayAmt} setRepayAmt={setRepayAmt}
              repayNote={repayNote} setRepayNote={setRepayNote}
              repayEmpId={repayEmpId} setRepayEmpId={setRepayEmpId}
              repayMethod={repayMethod} setRepayMethod={setRepayMethod}
              creditBusy={creditBusy}
              handleGrantCredit={handleGrantCredit}
              handleRepayCredit={handleRepayCredit}
            />
          )}

          {/* Onglet Notes */}
          {activeTab === 'notes' && (
            <NotesTab
              theme={theme} card={card} inp={inp} lbl={lbl}
              fiche={fiche} employees={employees}
              noteText={noteText} setNoteText={setNoteText}
              noteEmpId={noteEmpId} setNoteEmpId={setNoteEmpId}
              noteLoad={noteLoad} handleNote={handleNote}
            />
          )}

          {/* Onglet Historique */}
          {activeTab === 'history' && (
            <HistoryTab theme={theme} card={card} fiche={fiche} />
          )}

        </div>
      ) : null}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {PinModalNode}
    </div>
  );
}
