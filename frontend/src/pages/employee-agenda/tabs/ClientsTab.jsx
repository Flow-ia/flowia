// src/pages/employee-agenda/tabs/ClientsTab.jsx
import { useState, useEffect } from 'react';
import { clientNotesApi } from '../../../utils/api';
import { useEmployeePinGate } from '../../../components/EmployeePinModal';
import { glassCard } from '../styles';
import Spin from '../components/Spin';

export default function ClientsTab({ employee, theme: t }) {
  const isDark = t.mode === 'dark';
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

  useEffect(()=>{
    if (!query||query.trim().length<2){setResults([]);return;}
    setSearching(true);
    const t=setTimeout(async()=>{ try{const r=await clientNotesApi.search(query);setResults(r);}catch{setResults([]);}finally{setSearching(false);} },350);
    return()=>clearTimeout(t);
  },[query]);

  const selectClient = async cl=>{
    setClient(cl);setResults([]);setQuery(cl.name+(cl.email?' - '+cl.email:''));setLoadingData(true);
    try{const[hist,nts]=await Promise.all([clientNotesApi.getHistory(cl.email,employee?.id),clientNotesApi.getNotes(cl.email)]);setHistory(hist);setNotes(nts);}
    catch(e){console.error(e);}finally{setLoadingData(false);}
  };

  const addNote = async()=>{
    if(!newNote.trim()||!client)return;
    await requestPin(
      employee || null,
      'Ajouter une note client',
      async () => {
        setSavingNote(true);
        try{const created=await clientNotesApi.addNote({client_email:client.email,client_name:client.name,note_text:newNote.trim(),employee_id:employee.id,employee_name:employee.name});setNotes(p=>[created,...p]);setNewNote('');}
        catch(e){alert('Erreur : '+e.message);}finally{setSavingNote(false);}
      }
    );
  };
  const saveEditNote = async()=>{
    if(!editNote?.text?.trim())return;
    try{const upd=await clientNotesApi.updateNote(editNote.id,{note_text:editNote.text});setNotes(p=>p.map(n=>n.id===editNote.id?upd:n));setEditNote(null);}
    catch(e){alert('Erreur : '+e.message);}
  };
  const deleteNote = async id=>{
    try{await clientNotesApi.deleteNote(id);setNotes(p=>p.filter(n=>n.id!==id));}
    catch(e){alert('Erreur : '+e.message);}
    setDelNoteId(null);
  };
  const fmtD=d=>{if(!d)return'';return new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});};
  const fmtMoney=v=>Number(v||0).toFixed(2);
  const IS={width:'100%',padding:'11px 14px',borderRadius:12,border:`1px solid ${t.border}`,background:isDark?'rgba(255,255,255,0.05)':'#f4f4f6',color:t.text,fontSize:13,outline:'none',boxSizing:'border-box'};

  return (
    <>
    <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:12, paddingBottom:40 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Recherche */}
      <div style={{position:'relative'}}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14,position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:t.dim,pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input placeholder="Rechercher un client (nom, email, téléphone)..." value={query} onChange={e=>{setQuery(e.target.value);setClient(null);setHistory([]);setNotes([]);}} style={{...IS,paddingLeft:36,paddingRight:36}} />
        {searching&&<span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:12}}><Spin size={14}/></span>}
      </div>

      {!client && results.length>0 && (
        <div style={{...glassCard(isDark),overflow:'hidden'}}>
          {results.map((r,i)=>(
            <div key={r.email} onClick={()=>selectClient(r)} style={{padding:'12px 16px',cursor:'pointer',borderTop:i>0?`1px solid ${t.border}`:'none',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'background .12s'}}
            onMouseEnter={e=>e.currentTarget.style.background=isDark?'rgba(255,255,255,0.04)':'#f9f9fb'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div>
                <p style={{margin:0,fontWeight:700,fontSize:14,color:t.text}}>{r.name||r.email}</p>
                <p style={{margin:'2px 0 0',fontSize:12,color:t.muted}}>{r.email}{r.phone?' · '+r.phone:''}</p>
              </div>
              <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
                <span style={{fontSize:12,fontWeight:700,color:'#f59e0b'}}>{r.appt_count||0} presta.</span>
                {r.total_stamps_ever>0&&<p style={{margin:'2px 0 0',fontSize:11,color:t.muted}}>🎫 {r.total_stamps_ever}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {client && (
        <>
          {/* Fiche client */}
          <div style={{...glassCard(isDark),padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{flex:1,minWidth:0}}>
              <p style={{margin:0,fontWeight:800,fontSize:16,color:t.text,letterSpacing:'-.3px'}}>{client.name}</p>
              <p style={{margin:'3px 0 0',fontSize:12,color:t.muted}}>{client.email}{client.phone?' · '+client.phone:''}</p>
              {client.last_visit&&<p style={{margin:'4px 0 0',fontSize:11,fontWeight:600,color:'#10b981'}}>✓ Dernière visite : {fmtD(client.last_visit)}</p>}
            </div>
            <button onClick={()=>{setClient(null);setQuery('');setHistory([]);setNotes([]);}} style={{background:'none',border:'none',cursor:'pointer',color:t.muted,fontSize:18,lineHeight:1,padding:4,flexShrink:0}}>✕</button>
          </div>

          {loadingData ? (
            <div style={{display:'flex',justifyContent:'center',padding:32}}><Spin size={24}/></div>
          ) : (
            <>
              {/* Historique */}
              <div style={{...glassCard(isDark),overflow:'hidden'}}>
                <div style={{padding:'10px 16px',borderBottom:`1px solid ${t.border}`,background:isDark?'rgba(255,255,255,0.02)':'#fafafa'}}>
                  <p style={{margin:0,fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:t.muted}}>📋 Historique des prestations ({history.length})</p>
                </div>
                {history.length===0?(
                  <p style={{margin:0,padding:'20px 16px',textAlign:'center',fontSize:13,color:t.muted}}>Aucune prestation terminée</p>
                ):history.map((appt,i)=>(
                  <div key={appt.id} style={{borderTop:i>0?`1px solid ${t.border}`:'none'}}>
                    <div onClick={()=>setExpandedAppt(expandedAppt===appt.id?null:appt.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer'}}>
                      <div style={{width:34,height:34,borderRadius:10,background:appt.avatar_color||'#111827',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:14,flexShrink:0}}>{(appt.employee_name||'?').charAt(0).toUpperCase()}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{margin:0,fontWeight:700,fontSize:13,color:t.text}}>{fmtD(appt.date)}{appt.start_time?' · '+String(appt.start_time).substring(0,5):''}</p>
                        <p style={{margin:'2px 0 0',fontSize:12,color:t.muted}}>{appt.employee_name||'Employe inconnu'}{appt.total_amount?' · '+fmtMoney(appt.total_amount)+' €':''}</p>
                      </div>
                      <span style={{fontSize:12,color:t.dim,flexShrink:0}}>{expandedAppt===appt.id?'▲':'▼'}</span>
                    </div>
                    {expandedAppt===appt.id&&(
                      <div style={{padding:'0 16px 12px 62px'}}>
                        {appt.services&&appt.services.filter(s=>s.service_name).map((s,j)=>(
                          <p key={j} style={{margin:'3px 0',fontSize:12,color:t.text}}>• {s.service_name}{s.qty>1?' ×'+s.qty:''}{s.unit_price?' - '+fmtMoney(s.unit_price)+' €':''}</p>
                        ))}
                        {appt.appt_notes&&(
                          <div style={{marginTop:8,padding:'8px 12px',background:isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)',borderRadius:10,borderLeft:'3px solid #f59e0b'}}>
                            <p style={{margin:0,fontSize:12,color:t.text,fontStyle:'italic'}}>"{appt.appt_notes}"</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Notes internes */}
              <div style={{...glassCard(isDark),overflow:'hidden'}}>
                <div style={{padding:'10px 16px',borderBottom:`1px solid ${t.border}`,background:isDark?'rgba(255,255,255,0.02)':'#fafafa'}}>
                  <p style={{margin:0,fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:t.muted}}>📝 Notes internes ({notes.length})</p>
                </div>
                <div style={{padding:12,borderBottom:`1px solid ${t.border}`}}>
                  <textarea placeholder="Ex : Coloration blonde. Cheveux fragiles…" value={newNote} onChange={e=>setNewNote(e.target.value)} rows={3} style={{...IS,resize:'vertical',lineHeight:1.5,fontFamily:'inherit',marginBottom:8}} />
                  <button onClick={addNote} disabled={!newNote.trim()||savingNote} style={{width:'100%',padding:'10px',borderRadius:10,background:'#1a73e8',color:'#fff',fontWeight:700,fontSize:13,border:'none',cursor:'pointer',opacity:!newNote.trim()?.4:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                    {savingNote?<><Spin size={14}/>Enregistrement…</>:'💾 Ajouter cette note'}
                  </button>
                </div>
                {notes.length===0?(
                  <p style={{margin:0,padding:'20px 16px',textAlign:'center',fontSize:13,color:t.muted}}>Aucune note.</p>
                ):notes.map((note,i)=>(
                  <div key={note.id} style={{padding:'12px 16px',borderTop:i>0?`1px solid ${t.border}`:'none'}}>
                    {editNote?.id===note.id?(
                      <div style={{display:'flex',flexDirection:'column',gap:8}}>
                        <textarea value={editNote.text} onChange={e=>setEditNote({...editNote,text:e.target.value})} rows={3} style={{...IS,resize:'vertical',fontFamily:'inherit',lineHeight:1.5}} />
                        <div style={{display:'flex',gap:8}}>
                          <button onClick={()=>setEditNote(null)} style={{flex:1,padding:9,borderRadius:10,background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6',border:`1px solid ${t.border}`,color:t.muted,fontWeight:700,fontSize:12,cursor:'pointer'}}>Annuler</button>
                          <button onClick={saveEditNote} style={{flex:2,padding:9,borderRadius:10,background:'linear-gradient(135deg,#10b981,#059669)',color:'#fff',fontWeight:700,fontSize:12,border:'none',cursor:'pointer'}}>Enregistrer</button>
                        </div>
                      </div>
                    ):(
                      <>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                          <p style={{margin:0,fontSize:13,color:t.text,lineHeight:1.6,flex:1}}>{note.note_text}</p>
                          <div style={{display:'flex',gap:4,flexShrink:0}}>
                            <button onClick={()=>setEditNote({id:note.id,text:note.note_text})} style={{width:28,height:28,borderRadius:8,background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12}}>✏️</button>
                            <button onClick={()=>setDelNoteId(note.id)} style={{width:28,height:28,borderRadius:8,background:'rgba(239,68,68,0.08)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12}}>🗑</button>
                          </div>
                        </div>
                        <p style={{margin:'5px 0 0',fontSize:11,color:t.dim}}>Par {note.created_by_name||'Équipe'} · {new Date(note.created_at).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}{note.updated_at!==note.created_at?' (modifie)':''}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {delNoteId && (
            <div style={{position:'fixed',inset:0,zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
              <div onClick={()=>setDelNoteId(null)} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)'}} />
              <div style={{position:'relative',background:isDark?'#161620':'#fff',borderRadius:20,padding:24,width:'100%',maxWidth:320,border:`1px solid ${t.border}`,boxShadow:'0 24px 48px rgba(0,0,0,0.2)'}}>
                <p style={{fontWeight:800,fontSize:16,color:t.text,margin:'0 0 6px',letterSpacing:'-.3px'}}>Supprimer cette note ?</p>
                <p style={{fontSize:13,color:t.muted,margin:'0 0 20px'}}>Cette action est irréversible.</p>
                <div style={{display:'flex',gap:10}}>
                  <button onClick={()=>setDelNoteId(null)} style={{flex:1,padding:12,borderRadius:12,background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6',border:`1px solid ${t.border}`,color:t.muted,fontWeight:700,cursor:'pointer'}}>Annuler</button>
                  <button onClick={()=>deleteNote(delNoteId)} style={{flex:2,padding:12,borderRadius:12,background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'#fff',fontWeight:800,border:'none',cursor:'pointer'}}>Supprimer</button>
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
