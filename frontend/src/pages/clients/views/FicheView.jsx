// src/pages/clients/views/FicheView.jsx
import Avatar from '../components/Avatar';
import BackBtn from '../components/BackBtn';
import InfoTab from '../tabs/InfoTab';
import CreditTab from '../tabs/CreditTab';
import NotesTab from '../tabs/NotesTab';
import HistoryTab from '../tabs/HistoryTab';
import { Toast, Confirm } from '../../../components/UI';
import { Button, SegmentedControl } from '../../../components/primitives';
import { I } from '../../../utils/icons';

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
  const iconBtnStyle = {
    width: 32,
    height: 32,
    borderRadius: 8,
    cursor: 'pointer',
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ background: theme.bg, minHeight: '100vh', paddingBottom: 96 }}>
      <Toast msg={toast?.msg} type={toast?.type} />
      <Confirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={handleDelete}
        title={fiche?.global_client_id ? 'Retirer ce client ?' : 'Supprimer ce client ?'}
        desc={fiche?.global_client_id
          ? 'La relation avec ce client sera supprimee de votre liste. Son compte plateforme et son historique global restent intacts.'
          : 'Cette action supprimera definitivement la fiche de ce client interne.'}
        theme={theme} />

      <Confirm
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={handleBlock}
        title={fiche?.is_booking_blocked ? 'Debloquer ce client ?' : 'Bloquer ce client ?'}
        desc={fiche?.is_booking_blocked
          ? 'Ce client pourra a nouveau prendre rendez-vous en ligne chez vous.'
          : 'Ce client ne pourra plus effectuer de reservation en ligne chez vous. Vous pouvez le debloquer a tout moment.'}
        theme={theme} />

      <div style={{ ...stickyHeader, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackBtn onClick={() => { setView('list'); setEditMode(false); }} theme={theme} />
        <span style={{
          fontWeight: 500,
          fontSize: 15,
          color: theme.text,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {fiche ? [fiche.first_name, fiche.last_name].filter(Boolean).join(' ') || 'Fiche client' : '...'}
        </span>
        {fiche && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setConfirmBlock(true)}
              disabled={blockBusy}
              title={fiche.is_booking_blocked ? 'Debloquer les reservations' : 'Bloquer les reservations'}
              aria-label={fiche.is_booking_blocked ? 'Debloquer' : 'Bloquer'}
              style={{
                ...iconBtnStyle,
                border: `0.5px solid ${fiche.is_booking_blocked ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                color: fiche.is_booking_blocked ? '#92400e' : '#991b1b',
                opacity: blockBusy ? 0.5 : 1,
              }}
            >
              <I.Lock width={14} height={14} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              aria-label="Supprimer"
              style={{
                ...iconBtnStyle,
                border: '0.5px solid rgba(239,68,68,0.3)',
                color: '#991b1b',
              }}
            >
              <I.Trash width={14} height={14} />
            </button>
          </div>
        )}
      </div>

      {ficheLoad ? (
        <div style={{ textAlign: 'center', padding: '56px 0' }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: `0.5px solid ${theme.border}`,
            borderTopColor: theme.text,
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto',
          }} />
        </div>
      ) : fiche ? (
        <div style={{ padding: '14px 14px 0' }}>

          {/* Carte identite */}
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: editMode ? 14 : 0 }}>
              <Avatar cl={fiche} size={48} radius={14} fontSize={18} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{
                  margin: '0 0 2px',
                  fontSize: 16,
                  fontWeight: 500,
                  color: theme.text,
                }}>
                  {[fiche.first_name, fiche.last_name].filter(Boolean).join(' ') || '-'}
                </h2>
                {fiche.email && <p style={{ margin: 0, fontSize: 12, color: theme.muted }}>{fiche.email}</p>}
                {fiche.phone && <p style={{ margin: 0, fontSize: 12, color: theme.muted }}>{fiche.phone}</p>}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!editMode) setForm({
                    first_name: fiche.first_name || '',
                    last_name: fiche.last_name || '',
                    email: fiche.email || '',
                    phone: fiche.phone || '',
                    notes: fiche.notes || '',
                  });
                  setEditMode(v => !v);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: 'transparent',
                  border: `0.5px solid ${theme.borderStrong}`,
                  color: theme.text,
                  fontWeight: 500,
                  fontSize: 12,
                  cursor: 'pointer',
                  flexShrink: 0,
                  fontFamily: 'inherit',
                }}
              >
                {editMode ? 'Annuler' : 'Editer'}
              </button>
            </div>

            {/* Badges + invitation */}
            {!editMode && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 12,
                marginTop: 12,
                borderTop: `0.5px solid ${theme.border}`,
                gap: 8,
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {fiche.global_client_id ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 8px',
                      borderRadius: 8,
                      background: '#f0fdf4',
                      color: '#065f46',
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />
                      Compte plateforme
                    </span>
                  ) : fiche.source === 'booking' ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 8px',
                      borderRadius: 8,
                      background: '#eef2ff',
                      color: '#4338ca',
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366f1' }} />
                      Reservation en ligne
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 8px',
                      borderRadius: 8,
                      background: theme.cardAlt,
                      color: theme.muted,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: theme.dim }} />
                      Client interne
                    </span>
                  )}
                  {fiche.is_booking_blocked && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 8px',
                      borderRadius: 8,
                      background: '#fef2f2',
                      color: '#991b1b',
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }} />
                      Reservations bloquees
                    </span>
                  )}
                </div>

                {fiche.email && !fiche.global_client_id && (
                  <button
                    type="button"
                    onClick={handleInvite}
                    disabled={inviting || fiche.invited}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: 'transparent',
                      border: `0.5px solid ${fiche.invited ? 'rgba(16,185,129,0.3)' : theme.borderStrong}`,
                      color: fiche.invited ? '#065f46' : theme.text,
                      fontWeight: 500,
                      fontSize: 12,
                      cursor: fiche.invited ? 'default' : 'pointer',
                      opacity: inviting ? 0.6 : 1,
                      fontFamily: 'inherit',
                    }}
                  >
                    {fiche.invited ? 'Invitation envoyee' : inviting ? '...' : 'Inviter a creer un compte'}
                  </button>
                )}
              </div>
            )}

            {/* Formulaire d'edition */}
            {editMode && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                paddingTop: 12,
                borderTop: `0.5px solid ${theme.border}`,
              }}>
                {fiche.global_client_id && (
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#fffbeb',
                    borderLeft: '2px solid #f59e0b',
                  }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: '#92400e' }}>
                      Informations verrouillees
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>
                      Ce client possede un compte plateforme. Il gere lui-même son nom, email et telephone. Seules les notes internes sont modifiables.
                    </p>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={lbl}>Prenom</label>
                    <input
                      value={form.first_name}
                      onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                      disabled={!!fiche.global_client_id}
                      style={{ ...inp, opacity: fiche.global_client_id ? 0.5 : 1, cursor: fiche.global_client_id ? 'not-allowed' : 'text' }}
                    />
                  </div>
                  <div>
                    <label style={lbl}>Nom</label>
                    <input
                      value={form.last_name}
                      onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                      disabled={!!fiche.global_client_id}
                      style={{ ...inp, opacity: fiche.global_client_id ? 0.5 : 1, cursor: fiche.global_client_id ? 'not-allowed' : 'text' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    disabled={!!fiche.global_client_id}
                    style={{ ...inp, opacity: fiche.global_client_id ? 0.5 : 1, cursor: fiche.global_client_id ? 'not-allowed' : 'text' }}
                  />
                </div>
                <div>
                  <label style={lbl}>Telephone</label>
                  <input
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    disabled={!!fiche.global_client_id}
                    style={{ ...inp, opacity: fiche.global_client_id ? 0.5 : 1, cursor: fiche.global_client_id ? 'not-allowed' : 'text' }}
                  />
                </div>
                <div>
                  <label style={lbl}>Notes internes</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    style={{ ...inp, resize: 'vertical' }}
                  />
                </div>
                <Button fullWidth onClick={handleUpdate} disabled={busy}>
                  {busy ? 'Enregistrement...' : fiche.global_client_id ? 'Enregistrer les notes' : 'Enregistrer'}
                </Button>
              </div>
            )}
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { val: fiche.total_visits || fiche.tx_count || 0, label: 'Visites' },
              { val: `${Number(fiche.total_spent || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} DA`, label: 'Depense' },
              { val: fiche.loyalty_mode === 'points' ? Math.floor(fiche.points || 0) : (fiche.stamps || 0), label: fiche.loyalty_mode === 'points' ? 'Points' : 'Tampons' },
              { val: fiche.rewards_earned || 0, label: 'Recomp.' },
            ].map((kpi) => (
              <div key={kpi.label} style={{ ...card, padding: '12px 8px', textAlign: 'center' }}>
                <p style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 500, color: theme.text }}>{kpi.val}</p>
                <p style={{ margin: 0, fontSize: 11, color: theme.muted }}>{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* Onglets */}
          <div style={{ marginBottom: 12 }}>
            <SegmentedControl
              fullWidth
              value={activeTab}
              onChange={(v) => {
                setTab(v);
                if (v === 'credit' && !creditData) loadCredit(fiche.id);
              }}
              options={[
                { value: 'info',    label: 'Infos' },
                { value: 'credit',  label: 'Credit' },
                { value: 'notes',   label: 'Notes' },
                { value: 'history', label: 'Historique' },
              ]}
            />
            {activeTab === 'credit' && creditData?.credit && parseFloat(creditData.credit.balance) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingLeft: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }} />
                <span style={{ fontSize: 11, color: '#991b1b' }}>Solde du</span>
              </div>
            )}
          </div>

          {activeTab === 'info' && (
            <InfoTab fiche={fiche} theme={theme} card={card} setFiche={setFiche}/>
          )}

          {activeTab === 'credit' && (
            <CreditTab
              theme={theme} card={card} inp={inp} lbl={lbl}
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

          {activeTab === 'notes' && (
            <NotesTab
              theme={theme} card={card} inp={inp} lbl={lbl}
              fiche={fiche} employees={employees}
              noteText={noteText} setNoteText={setNoteText}
              noteEmpId={noteEmpId} setNoteEmpId={setNoteEmpId}
              noteLoad={noteLoad} handleNote={handleNote}
            />
          )}

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
