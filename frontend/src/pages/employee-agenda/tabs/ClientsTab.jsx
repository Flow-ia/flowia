// src/pages/employee-agenda/tabs/ClientsTab.jsx
import { useState, useEffect } from 'react';
import { clientNotesApi } from '../../../utils/api';
import { useEmployeePinGate } from '../../../components/EmployeePinModal';
import { Button } from '../../../components/primitives';
import { I } from '../../../utils/icons';
import Spin from '../components/Spin';

export default function ClientsTab({ employee, theme: t }) {
  const { requestPin, PinModalNode: NotePinModal } = useEmployeePinGate();
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [client,      setClient]      = useState(null);
  const [history,     setHistory]     = useState([]);
  const [notes,       setNotes]       = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [newNote,     setNewNote]     = useState('');
  const [savingNote,  setSavingNote]  = useState(false);
  const [editNote,    setEditNote]    = useState(null);
  const [delNoteId,   setDelNoteId]   = useState(null);
  const [expandedAppt,setExpandedAppt]= useState(null);

  useEffect(() => {
    if (!query || query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const h = setTimeout(async () => {
      try { const r = await clientNotesApi.search(query); setResults(r); }
      catch { setResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(h);
  }, [query]);

  const selectClient = async cl => {
    setClient(cl); setResults([]);
    setQuery(cl.name + (cl.email ? ' - ' + cl.email : ''));
    setLoadingData(true);
    try {
      const [hist, nts] = await Promise.all([
        clientNotesApi.getHistory(cl.email, employee?.id),
        clientNotesApi.getNotes(cl.email),
      ]);
      setHistory(hist); setNotes(nts);
    } catch {} finally { setLoadingData(false); }
  };

  const addNote = async () => {
    if (!newNote.trim() || !client) return;
    await requestPin(
      employee || null,
      'Ajouter une note client',
      async () => {
        setSavingNote(true);
        try {
          const created = await clientNotesApi.addNote({
            client_email: client.email,
            client_name:  client.name,
            note_text:    newNote.trim(),
            employee_id:  employee.id,
            employee_name: employee.name,
          });
          setNotes(p => [created, ...p]);
          setNewNote('');
        } catch(e) { alert('Erreur : ' + e.message); }
        finally { setSavingNote(false); }
      }
    );
  };

  const saveEditNote = async () => {
    if (!editNote?.text?.trim()) return;
    try {
      const upd = await clientNotesApi.updateNote(editNote.id, { note_text: editNote.text });
      setNotes(p => p.map(n => n.id === editNote.id ? upd : n));
      setEditNote(null);
    } catch(e) { alert('Erreur : ' + e.message); }
  };

  const deleteNote = async id => {
    try {
      await clientNotesApi.deleteNote(id);
      setNotes(p => p.filter(n => n.id !== id));
    } catch(e) { alert('Erreur : ' + e.message); }
    setDelNoteId(null);
  };

  const fmtD = d => {
    if (!d) return '';
    return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
  };
  const fmtMoney = v => Number(v||0).toFixed(2);

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: `0.5px solid ${t.borderInput}`,
    background: t.inputBg,
    color: t.text,
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const sectionCard = {
    background: t.card,
    border: `0.5px solid ${t.border}`,
    borderRadius: 12,
    overflow: 'hidden',
  };

  const sectionHeader = {
    padding: '10px 16px',
    borderBottom: `0.5px solid ${t.border}`,
    background: t.cardAlt,
  };

  return (
    <>
    <div style={{
      padding: '12px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      paddingBottom: 40,
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Recherche */}
      <div style={{ position: 'relative' }}>
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
          placeholder="Rechercher un client (nom, email, telephone)..."
          value={query}
          onChange={e => { setQuery(e.target.value); setClient(null); setHistory([]); setNotes([]); }}
          style={{ ...inputStyle, paddingLeft: 36, paddingRight: 36 }}
        />
        {searching && (
          <span style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
          }}>
            <Spin size={14} />
          </span>
        )}
      </div>

      {!client && results.length > 0 && (
        <div style={sectionCard}>
          {results.map((r, i) => (
            <div
              key={r.email}
              onClick={() => selectClient(r)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                borderTop: i > 0 ? `0.5px solid ${t.border}` : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'background .12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = t.cardAlt}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div>
                <p style={{ margin:0, fontWeight:500, fontSize:13, color:t.text }}>
                  {r.name || r.email}
                </p>
                <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
                  {r.email}{r.phone ? ' · ' + r.phone : ''}
                </p>
              </div>
              <div style={{ textAlign:'right', flexShrink:0, marginLeft:12 }}>
                <span style={{ fontSize:11, fontWeight:500, color:t.muted }}>
                  {r.appt_count || 0} presta.
                </span>
                {r.total_stamps_ever > 0 && (
                  <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
                    {r.total_stamps_ever} tampons
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {client && (
        <>
          {/* Fiche client */}
          <div style={{
            ...sectionCard,
            padding: '14px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontWeight:500, fontSize:15, color:t.text }}>{client.name}</p>
              <p style={{ margin:'3px 0 0', fontSize:11, color:t.muted }}>
                {client.email}{client.phone ? ' · ' + client.phone : ''}
              </p>
              {client.last_visit && (
                <div style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:4 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:'#10b981' }} />
                  <p style={{ margin:0, fontSize:11, color:t.muted }}>
                    Derniere visite : {fmtD(client.last_visit)}
                  </p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setClient(null); setQuery(''); setHistory([]); setNotes([]); }}
              aria-label="Fermer"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: t.muted,
                fontSize: 16,
                lineHeight: 1,
                padding: 4,
                flexShrink: 0,
                fontFamily: 'inherit',
              }}
            >✕</button>
          </div>

          {loadingData ? (
            <div style={{ display:'flex', justifyContent:'center', padding:32 }}>
              <Spin size={24} />
            </div>
          ) : (
            <>
              {/* Historique */}
              <div style={sectionCard}>
                <div style={sectionHeader}>
                  <p style={{ margin:0, fontSize:11, fontWeight:500, color:t.muted }}>
                    Historique des prestations ({history.length})
                  </p>
                </div>
                {history.length === 0 ? (
                  <p style={{ margin:0, padding:'20px 16px', textAlign:'center', fontSize:13, color:t.muted }}>
                    Aucune prestation terminee
                  </p>
                ) : history.map((appt, i) => (
                  <div key={appt.id} style={{ borderTop: i > 0 ? `0.5px solid ${t.border}` : 'none' }}>
                    <div
                      onClick={() => setExpandedAppt(expandedAppt === appt.id ? null : appt.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: appt.avatar_color || t.text,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 500,
                        fontSize: 13,
                        flexShrink: 0,
                      }}>
                        {(appt.employee_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ margin:0, fontWeight:500, fontSize:13, color:t.text }}>
                          {fmtD(appt.date)}
                          {appt.start_time ? ' · ' + String(appt.start_time).substring(0,5) : ''}
                        </p>
                        <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
                          {appt.employee_name || 'Employe inconnu'}
                          {appt.total_amount ? ' · ' + fmtMoney(appt.total_amount) + ' €' : ''}
                        </p>
                      </div>
                      <span style={{
                        color: t.muted,
                        flexShrink: 0,
                        transform: expandedAppt === appt.id ? 'rotate(180deg)' : 'none',
                        transition: 'transform .15s',
                        display: 'inline-flex',
                      }}>
                        <I.ChevD width={12} height={12} />
                      </span>
                    </div>
                    {expandedAppt === appt.id && (
                      <div style={{ padding:'0 16px 12px 60px' }}>
                        {appt.services && appt.services.filter(s => s.service_name).map((s, j) => (
                          <p key={j} style={{ margin:'3px 0', fontSize:12, color:t.text }}>
                            • {s.service_name}{s.qty > 1 ? ' ×' + s.qty : ''}
                            {s.unit_price ? ' - ' + fmtMoney(s.unit_price) + ' €' : ''}
                          </p>
                        ))}
                        {appt.appt_notes && (
                          <div style={{
                            marginTop: 8,
                            padding: '8px 12px',
                            background: '#fffbeb',
                            borderLeft: '2px solid #f59e0b',
                            borderRadius: 8,
                          }}>
                            <p style={{ margin:0, fontSize:12, color:'#92400e', fontStyle:'italic' }}>
                              &quot;{appt.appt_notes}&quot;
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Notes internes */}
              <div style={sectionCard}>
                <div style={sectionHeader}>
                  <p style={{ margin:0, fontSize:11, fontWeight:500, color:t.muted }}>
                    Notes internes ({notes.length})
                  </p>
                </div>
                <div style={{ padding:12, borderBottom:`0.5px solid ${t.border}` }}>
                  <textarea
                    placeholder="Ex : Coloration blonde. Cheveux fragiles…"
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    rows={3}
                    style={{ ...inputStyle, resize:'vertical', lineHeight:1.5, marginBottom:8 }}
                  />
                  <Button
                    fullWidth
                    onClick={addNote}
                    disabled={!newNote.trim() || savingNote}
                  >
                    {savingNote ? (
                      <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                        <Spin size={14}/>Enregistrement…
                      </span>
                    ) : 'Ajouter cette note'}
                  </Button>
                </div>
                {notes.length === 0 ? (
                  <p style={{ margin:0, padding:'20px 16px', textAlign:'center', fontSize:13, color:t.muted }}>
                    Aucune note.
                  </p>
                ) : notes.map((note, i) => (
                  <div key={note.id} style={{
                    padding: '12px 16px',
                    borderTop: i > 0 ? `0.5px solid ${t.border}` : 'none',
                  }}>
                    {editNote?.id === note.id ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        <textarea
                          value={editNote.text}
                          onChange={e => setEditNote({ ...editNote, text: e.target.value })}
                          rows={3}
                          style={{ ...inputStyle, resize:'vertical', lineHeight:1.5 }}
                        />
                        <div style={{ display:'flex', gap:8 }}>
                          <Button variant="secondary" fullWidth onClick={() => setEditNote(null)}>Annuler</Button>
                          <Button fullWidth onClick={saveEditNote} style={{ flex: 2 }}>Enregistrer</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                          <p style={{ margin:0, fontSize:13, color:t.text, lineHeight:1.6, flex:1 }}>
                            {note.note_text}
                          </p>
                          <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                            <button
                              type="button"
                              onClick={() => setEditNote({ id: note.id, text: note.note_text })}
                              aria-label="Modifier"
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 8,
                                background: 'transparent',
                                border: `0.5px solid ${t.border}`,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: t.muted,
                                fontFamily: 'inherit',
                              }}
                            >
                              <I.Edit width={12} height={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDelNoteId(note.id)}
                              aria-label="Supprimer"
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 8,
                                background: 'transparent',
                                border: '0.5px solid rgba(239,68,68,0.3)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#991b1b',
                                fontFamily: 'inherit',
                              }}
                            >
                              <I.Trash width={12} height={12} />
                            </button>
                          </div>
                        </div>
                        <p style={{ margin:'5px 0 0', fontSize:11, color:t.dim }}>
                          Par {note.created_by_name || 'Equipe'} ·{' '}
                          {new Date(note.created_at).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' })}
                          {note.updated_at !== note.created_at ? ' (modifie)' : ''}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {delNoteId && (
            <div style={{
              position: 'fixed',
              inset: 0,
              zIndex: 300,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}>
              <div
                onClick={() => setDelNoteId(null)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(4px)',
                }}
              />
              <div style={{
                position: 'relative',
                background: t.elevated,
                borderRadius: 16,
                padding: 22,
                width: '100%',
                maxWidth: 320,
                border: `0.5px solid ${t.border}`,
                boxShadow: t.shadowModal,
              }}>
                <p style={{ fontWeight:500, fontSize:15, color:t.text, margin:'0 0 6px' }}>
                  Supprimer cette note ?
                </p>
                <p style={{ fontSize:13, color:t.muted, margin:'0 0 18px' }}>
                  Cette action est irreversible.
                </p>
                <div style={{ display:'flex', gap:10 }}>
                  <Button variant="secondary" fullWidth onClick={() => setDelNoteId(null)}>Annuler</Button>
                  <Button variant="danger" fullWidth onClick={() => deleteNote(delNoteId)} style={{ flex: 2 }}>Supprimer</Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    {NotePinModal}
    </>
  );
}
