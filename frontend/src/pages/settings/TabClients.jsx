import { useState, useEffect } from 'react';
import { clientsApi } from '../../utils/api';

const PAGE_SIZE = 10;

export default function TabClients({ theme, showToast }) {
  const isDark = theme.mode === 'dark';

  const [clients,    setClients]    = useState([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [sort,       setSort]       = useState('name');
  const [page,       setPage]       = useState(0);
  const [selected,   setSelected]   = useState(null);
  const [fiche,      setFiche]      = useState(null);
  const [ficheLoad,  setFicheLoad]  = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editMode,   setEditMode]   = useState(false);
  const [form,       setForm]       = useState({ first_name:'', last_name:'', email:'', phone:'', notes:'' });
  const [noteText,   setNoteText]   = useState('');
  const [noteLoad,   setNoteLoad]   = useState(false);
  const [inviting,   setInviting]   = useState(false);
  const [busy,       setBusy]       = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await clientsApi.list({
        search,
        sort,
        limit:  PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setClients(r.clients || []);
      setTotal(r.total || 0);
    } catch { showToast('Erreur chargement clients', 'error'); }
    finally { setLoading(false); }
  };

  // Reset page quand filtres changent
  useEffect(() => { setPage(0); }, [search, sort]);
  useEffect(() => { load(); }, [search, sort, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openFiche = async (cl) => {
    setSelected(cl);
    setFiche(null);
    setFicheLoad(true);
    try {
      const r = await clientsApi.get(cl.id);
      setFiche(r);
    } catch { showToast('Erreur chargement fiche', 'error'); }
    finally { setFicheLoad(false); }
  };

  const handleCreate = async () => {
    if (!form.first_name.trim() && !form.email.trim()) return showToast('Nom ou email requis', 'error');
    setBusy(true);
    try {
      await clientsApi.create(form);
      showToast('Client crée ✓', 'success');
      setShowCreate(false);
      setForm({ first_name:'', last_name:'', email:'', phone:'', notes:'' });
      load();
    } catch(e) { showToast(e.message || 'Erreur', 'error'); }
    finally { setBusy(false); }
  };

  const handleUpdate = async () => {
    if (!fiche) return;
    setBusy(true);
    try {
      const r = await clientsApi.update(fiche.id, form);
      setFiche(f => ({ ...f, ...r }));
      setEditMode(false);
      showToast('Client mis a jour ✓', 'success');
      load();
    } catch { showToast('Erreur mise a jour', 'error'); }
    finally { setBusy(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette fiche client ?')) return;
    try {
      await clientsApi.remove(id);
      setSelected(null); setFiche(null);
      showToast('Fiche supprimee', 'success');
      load();
    } catch { showToast('Erreur suppression', 'error'); }
  };

  const handleInvite = async () => {
    if (!fiche?.email) return showToast('Email client requis pour inviter', 'error');
    setInviting(true);
    try {
      await clientsApi.invite(fiche.id);
      showToast('Invitation envoyee ✓', 'success');
      openFiche(fiche);
    } catch { showToast('Erreur envoi invitation', 'error'); }
    finally { setInviting(false); }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !fiche) return;
    setNoteLoad(true);
    try {
      const r = await clientsApi.addNote(fiche.id, { note_text: noteText });
      setFiche(f => ({ ...f, notes: [r, ...(f.notes||[])] }));
      setNoteText('');
      showToast('Note ajoutee ✓', 'success');
    } catch { showToast('Erreur ajout note', 'error'); }
    finally { setNoteLoad(false); }
  };

  const Avatar = ({ name, size = 44 }) => {
    const initials = name ? name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase() : '?';
    const colors   = ['#111827','#10b981','#f59e0b','#ef4444','#374151','#8b5cf6','#ec4899'];
    const color    = colors[(name||'A').charCodeAt(0) % colors.length];
    return (
      <div style={{ width:size, height:size, borderRadius:size*0.33, background:color, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:900, fontSize:size*0.38, flexShrink:0 }}>
        {initials}
      </div>
    );
  };

  const fmt = n => Number(n||0).toFixed(2);
  const fmtDate = s => s ? new Date(s).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }) : '-';
  const statusLabel = { pending:'En attente', confirmed:'Confirme', cancelled:'Annule', completed:'Termine', no_show:'Absent' };
  const statusColor = { pending:'#f59e0b', confirmed:'#10b981', cancelled:'#ef4444', completed:'#111827', no_show:'#94a3b8' };

  if (selected) {
    return (
      <div style={{ maxWidth:700, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <button onClick={()=>{ setSelected(null); setFiche(null); setEditMode(false); }}
            style={{ padding:'8px 16px', borderRadius:12, background:'none', border:`1px solid ${theme.border}`, color:theme.muted, cursor:'pointer', fontWeight:600, fontSize:13 }}>
            ← Retour
          </button>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:theme.text, flex:1 }}>
            {fiche ? (fiche.first_name+' '+fiche.last_name).trim() || fiche.email : selected.full_name || '...'}
          </h2>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>{ setEditMode(true); setForm({ first_name:fiche?.first_name||'', last_name:fiche?.last_name||'', email:fiche?.email||'', phone:fiche?.phone||'', notes:fiche?.account_notes||'' }); }}
              style={{ padding:'8px 14px', borderRadius:12, background:theme.cardAlt, border:`1px solid ${theme.border}`, color:theme.text, cursor:'pointer', fontWeight:700, fontSize:12 }}>
              ✏️ Éditer
            </button>
            <button onClick={()=>handleDelete(fiche?.id||selected.id)}
              style={{ padding:'8px 14px', borderRadius:12, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', color:'#ef4444', cursor:'pointer', fontWeight:700, fontSize:12 }}>
              🗑 Supprimer
            </button>
          </div>
        </div>

        {ficheLoad && <div style={{ textAlign:'center', padding:40, color:theme.muted }}>Chargement...</div>}

        {fiche && !editMode && (<>
          <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:24, border:`1px solid ${theme.border}`, marginBottom:16 }}>
            <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
              <Avatar name={fiche.full_name||fiche.email} size={56} />
              <div style={{ flex:1 }}>
                <h3 style={{ margin:'0 0 4px', fontSize:18, fontWeight:800, color:theme.text }}>
                  {(fiche.first_name+' '+fiche.last_name).trim() || '-'}
                </h3>
                <p style={{ margin:'0 0 2px', fontSize:13, color:theme.muted }}>{fiche.email || '-'}</p>
                <p style={{ margin:'0', fontSize:13, color:theme.muted }}>{fiche.phone || 'Pas de télephone'}</p>
                {fiche.account_notes && <p style={{ margin:'8px 0 0', fontSize:12, color:theme.muted, fontStyle:'italic' }}>"{fiche.account_notes}"</p>}
              </div>
              <div style={{ textAlign:'right' }}>
                {fiche.has_global_account
                  ? <span style={{ fontSize:11, fontWeight:700, color:'#10b981', background:'rgba(16,185,129,0.1)', padding:'4px 10px', borderRadius:99 }}>✓ Compte plateforme</span>
                  : <button onClick={handleInvite} disabled={inviting||!fiche.email}
                      style={{ fontSize:11, fontWeight:700, color:theme.text, background:theme.cardAlt, padding:'4px 10px', borderRadius:99, border:`1px solid ${theme.border}`, cursor:fiche.email?'pointer':'not-allowed' }}>
                      {inviting ? '⏳ Envoi...' : '✉️ Inviter'}
                    </button>
                }
                {fiche.invite_sent_at && !fiche.has_global_account && (
                  <p style={{ fontSize:10, color:theme.muted, margin:'4px 0 0' }}>Invité le {fmtDate(fiche.invite_sent_at)}</p>
                )}
              </div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
            {[
              { label:'Visites',          value: fiche.total_visits, icon:'📅', color:'#111827' },
              { label:'Total dépense',    value: fmt(fiche.total_spent)+' €', icon:'💶', color:'#10b981' },
              { label:'Tampons/Points',   value: fiche.stamps||fiche.points||0, icon:'🎫', color:'#f59e0b' },
              { label:'Recompenses',      value: fiche.rewards_earned||0, icon:'🎁', color:'#8b5cf6' },
            ].map(k => (
              <div key={k.label} style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:16, padding:'14px 12px', border:`1px solid ${theme.border}`, textAlign:'center' }}>
                <div style={{ fontSize:22 }}>{k.icon}</div>
                <div style={{ fontSize:18, fontWeight:900, color:k.color, margin:'4px 0 2px', fontFamily:'monospace' }}>{k.value}</div>
                <div style={{ fontSize:10, color:theme.muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{k.label}</div>
              </div>
            ))}
          </div>

          <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:20, border:`1px solid ${theme.border}`, marginBottom:16 }}>
            <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:800, color:theme.text }}>📝 Notes internes</h4>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <input
                placeholder="Ajouter une note interne..."
                value={noteText}
                onChange={e=>setNoteText(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&handleAddNote()}
                style={{ flex:1, padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none' }}
              />
              <button onClick={handleAddNote} disabled={!noteText.trim()||noteLoad}
                style={{ padding:'0 16px', borderRadius:12, background:'rgba(17,24,39,0.12)', border:'1px solid rgba(17,24,39,0.25)', color:'#111827', fontWeight:700, cursor:'pointer' }}>
                {noteLoad ? '...' : '+'}
              </button>
            </div>
            {(fiche.notes_list||[]).length === 0 && <p style={{ color:theme.muted, fontSize:13, margin:0 }}>Aucune note pour ce client.</p>}
            {(fiche.notes_list||[]).map((n,i) => (
              <div key={i} style={{ padding:'10px 14px', borderRadius:12, background:isDark?'rgba(255,255,255,0.04)':'#f8fafc', marginBottom:8, borderLeft:'3px solid rgba(17,24,39,0.4)' }}>
                <p style={{ margin:'0 0 4px', fontSize:13, color:theme.text, lineHeight:1.5 }}>{n.note_text}</p>
                <p style={{ margin:0, fontSize:10, color:theme.muted }}>{n.employee_name ? `Par ${n.employee_name} · ` : ''}{fmtDate(n.created_at)}</p>
              </div>
            ))}
          </div>

          <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:20, border:`1px solid ${theme.border}`, marginBottom:16 }}>
            <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:800, color:theme.text }}>💳 Transactions ({(fiche.transactions||[]).length})</h4>
            {(fiche.transactions||[]).length === 0 && <p style={{ color:theme.muted, fontSize:13, margin:0 }}>Aucune transaction.</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(fiche.transactions||[]).map((t,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, background:isDark?'rgba(255,255,255,0.03)':'#f8fafc' }}>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:700, color:theme.text }}>{t.description||t.category_name||'-'}</p>
                    <p style={{ margin:0, fontSize:11, color:theme.muted }}>{fmtDate(t.date)} {t.time ? '· '+t.time.slice(0,5) : ''} {t.employee_name ? '· '+t.employee_name : ''}</p>
                    {t.client_note && <p style={{ margin:'3px 0 0', fontSize:11, color:'#111827', fontStyle:'italic' }}>"{t.client_note}"</p>}
                  </div>
                  <span style={{ fontWeight:900, fontSize:15, color:'#10b981', fontFamily:'monospace' }}>{fmt(t.amount)} €</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:20, border:`1px solid ${theme.border}`, marginBottom:16 }}>
            <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:800, color:theme.text }}>📅 Rendez-vous ({(fiche.appointments||[]).length})</h4>
            {(fiche.appointments||[]).length === 0 && <p style={{ color:theme.muted, fontSize:13, margin:0 }}>Aucun rendez-vous.</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(fiche.appointments||[]).map((a,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, background:isDark?'rgba(255,255,255,0.03)':'#f8fafc' }}>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:700, color:theme.text }}>{a.service_name||'Rendez-vous'}</p>
                    <p style={{ margin:0, fontSize:11, color:theme.muted }}>{fmtDate(a.date)} {a.start_time?.slice(0,5)||''} {a.employee_name?'· '+a.employee_name:''}</p>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:statusColor[a.status]||'#94a3b8', background:`${statusColor[a.status]||'#94a3b8'}18`, padding:'3px 10px', borderRadius:99 }}>
                    {statusLabel[a.status]||a.status}
                  </span>
                  {a.total_amount && <span style={{ fontWeight:900, fontSize:14, color:'#10b981', fontFamily:'monospace' }}>{fmt(a.total_amount)} €</span>}
                </div>
              ))}
            </div>
          </div>

          {(fiche.promos||[]).length > 0 && (
            <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:20, border:`1px solid ${theme.border}`, marginBottom:16 }}>
              <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:800, color:theme.text }}>🎁 Codes promo utilisés</h4>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(fiche.promos||[]).map((p,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, background:isDark?'rgba(255,255,255,0.03)':'#f8fafc' }}>
                    <div style={{ flex:1 }}>
                      <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:13, color:'#111827' }}>{p.code_snapshot}</span>
                      {p.is_loyalty_reward && <span style={{ marginLeft:8, fontSize:10, color:'#f59e0b', fontWeight:700 }}>FIDÉLITÉ</span>}
                    </div>
                    <span style={{ fontWeight:700, fontSize:13, color:'#ef4444' }}>-{fmt(p.discount_applied)} €</span>
                    <span style={{ fontSize:11, color:theme.muted }}>{fmtDate(p.used_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>)}

        {fiche && editMode && (
          <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:24, border:`1px solid ${theme.border}` }}>
            <h4 style={{ margin:'0 0 20px', fontSize:16, fontWeight:800, color:theme.text }}>Modifier la fiche client</h4>
            {[
              { key:'first_name', label:'Prenom' },
              { key:'last_name',  label:'Nom' },
              { key:'email',      label:'Email' },
              { key:'phone',      label:'Télephone' },
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>{label}</label>
                <input value={form[key]||''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
                  style={{ width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:14, outline:'none', boxSizing:'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Notes internes (fiche)</label>
              <textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3}
                style={{ width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:14, outline:'none', resize:'vertical', boxSizing:'border-box' }} />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={handleUpdate} disabled={busy}
                style={{ flex:1, padding:'13px', borderRadius:14, background:'#1a73e8', color:'white', border:'none', fontWeight:800, cursor:'pointer' }}>
                {busy ? 'Enregistrement...' : '✓ Enregistrer'}
              </button>
              <button onClick={()=>setEditMode(false)}
                style={{ padding:'13px 20px', borderRadius:14, background:'none', border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer' }}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:theme.text, flex:1 }}>
          👥 Clients ({total})
        </h2>
        <button onClick={()=>setShowCreate(true)}
          style={{ padding:'10px 18px', borderRadius:14, background:'#1a73e8', color:'white', border:'none', fontWeight:800, fontSize:13, cursor:'pointer' }}>
          + Nouveau client
        </button>
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <input
          placeholder="🔍 Rechercher par nom, email, téléphone..."
          value={search}
          onChange={e=>setSearch(e.target.value)}
          style={{ flex:1, minWidth:200, padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none' }}
        />
        <select value={sort} onChange={e=>setSort(e.target.value)}
          style={{ padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', cursor:'pointer' }}>
          <option value="name">Trier : Nom A→Z</option>
          <option value="visits">Trier : Visites</option>
          <option value="spending">Trier : Dépenses</option>
          <option value="recent">Trier : Récents</option>
        </select>
      </div>

      {showCreate && (
        <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:20, border:`1px solid ${theme.border}`, marginBottom:16 }}>
          <h4 style={{ margin:'0 0 16px', fontSize:15, fontWeight:800, color:theme.text }}>Nouveau client</h4>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
            {[['first_name','Prenom *'],['last_name','Nom'],['email','Email'],['phone','Télephone']].map(([k,lbl]) => (
              <input key={k} placeholder={lbl} value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                style={{ padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none' }} />
            ))}
          </div>
          <textarea placeholder="Notes internes (optionnel)" value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}
            style={{ width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box', marginBottom:12 }} />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handleCreate} disabled={busy}
              style={{ padding:'10px 20px', borderRadius:12, background:'#1a73e8', color:'white', border:'none', fontWeight:800, cursor:'pointer', fontSize:13 }}>
              {busy ? 'Creation...' : 'Creer le client'}
            </button>
            <button onClick={()=>{setShowCreate(false);setForm({first_name:'',last_name:'',email:'',phone:'',notes:''}); }}
              style={{ padding:'10px 16px', borderRadius:12, background:'none', border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer', fontSize:13 }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {loading && <div style={{ textAlign:'center', padding:40, color:theme.muted }}>Chargement...</div>}
      {!loading && clients.length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:theme.muted }}>
          <div style={{ fontSize:40, marginBottom:12 }}>👥</div>
          <p style={{ fontWeight:700 }}>Aucun client trouvé</p>
          <p style={{ fontSize:13 }}>Les clients apparaissent automatiquement après un encaissement avec email, ou vous pouvez en créer manuellement.</p>
        </div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {clients.map(cl => (
          <div key={cl.id} onClick={()=>openFiche(cl)}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', borderRadius:18, background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${theme.border}`, cursor:'pointer', transition:'all 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(17,24,39,0.4)'}
            onMouseLeave={e=>e.currentTarget.style.borderColor=theme.border}>
            <div style={{ width:44, height:44, borderRadius:14, background: ['#111827','#10b981','#f59e0b','#8b5cf6','#ef4444','#374151'][cl.full_name?.charCodeAt(0)%6||0], display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:900, fontSize:17, flexShrink:0 }}>
              {(cl.full_name||cl.email||'?').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                <span style={{ fontWeight:800, fontSize:15, color:theme.text }}>{cl.full_name||'-'}</span>
                {cl.has_global_account && <span style={{ fontSize:10, color:'#10b981', background:'rgba(16,185,129,0.1)', padding:'2px 8px', borderRadius:99, fontWeight:700 }}>✓ Compte</span>}
              </div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                {cl.email && <span style={{ fontSize:12, color:theme.muted }}>{cl.email}</span>}
                {cl.phone && <span style={{ fontSize:12, color:theme.muted }}>📱 {cl.phone}</span>}
              </div>
            </div>
            <div style={{ display:'flex', gap:16, alignItems:'center', flexShrink:0 }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:800, color:'#111827' }}>{(cl.tx_count||0)+(cl.apt_count||0)}</div>
                <div style={{ fontSize:10, color:theme.muted }}>visites</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:800, color:'#10b981', fontFamily:'monospace' }}>{Number(cl.total_spent||0).toFixed(0)}€</div>
                <div style={{ fontSize:10, color:theme.muted }}>dépensé</div>
              </div>
              {(cl.stamps||cl.points) ? (
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:14, fontWeight:800, color:'#f59e0b' }}>{cl.stamps||Math.floor(cl.points)||0}</div>
                  <div style={{ fontSize:10, color:theme.muted }}>pts</div>
                </div>
              ) : null}
              {cl.notes_count > 0 && (
                <div style={{ fontSize:11, color:'#111827', background:'rgba(17,24,39,0.08)', padding:'3px 8px', borderRadius:8 }}>
                  📝 {cl.notes_count}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination 10 par page */}
      {!loading && total > 0 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'20px 0 8px' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ padding:'8px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background: isDark?'rgba(255,255,255,0.04)':'white', color: page===0?theme.dim:theme.text, fontWeight:700, fontSize:13, cursor: page===0?'default':'pointer', opacity: page===0?0.5:1 }}>
            ‹ Préc.
          </button>
          <span style={{ fontSize:13, fontWeight:700, color:theme.muted, minWidth:80, textAlign:'center' }}>
            Page {page + 1} / {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            style={{ padding:'8px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background: isDark?'rgba(255,255,255,0.04)':'white', color: page>=totalPages-1?theme.dim:theme.text, fontWeight:700, fontSize:13, cursor: page>=totalPages-1?'default':'pointer', opacity: page>=totalPages-1?0.5:1 }}>
            Suiv. ›
          </button>
        </div>
      )}
    </div>
  );
}
