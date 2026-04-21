import { useState, useEffect } from 'react';
import { clientsApi } from '../../utils/api';
import QRCard from './QRCard';
import { I } from '../../utils/icons';
import { Button, Label, SegmentedControl, StatusBadge } from '../../components/primitives';

const PAGE_SIZE = 5;

export default function TabClients({ theme, showToast }) {
  const t = theme;

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
        search, sort,
        limit:  PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setClients(r.clients || []);
      setTotal(r.total || 0);
    } catch { showToast('Erreur chargement clients', 'error'); }
    finally { setLoading(false); }
  };

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
      showToast('Client cree', 'success');
      setShowCreate(false);
      setForm({ first_name:'', last_name:'', email:'', phone:'', notes:'' });
      load();
    } catch (e) { showToast(e.message || 'Erreur', 'error'); }
    finally { setBusy(false); }
  };

  const handleUpdate = async () => {
    if (!fiche) return;
    setBusy(true);
    try {
      const r = await clientsApi.update(fiche.id, form);
      setFiche(f => ({ ...f, ...r }));
      setEditMode(false);
      showToast('Client mis a jour', 'success');
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
      showToast('Invitation envoyee', 'success');
      openFiche(fiche);
    } catch { showToast('Erreur envoi invitation', 'error'); }
    finally { setInviting(false); }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !fiche) return;
    setNoteLoad(true);
    try {
      const r = await clientsApi.addNote(fiche.id, { note_text: noteText });
      setFiche(f => ({ ...f, notes: [r, ...(f.notes || [])] }));
      setNoteText('');
      showToast('Note ajoutee', 'success');
    } catch { showToast('Erreur ajout note', 'error'); }
    finally { setNoteLoad(false); }
  };

  const Avatar = ({ name, size = 44 }) => {
    const initials = name ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';
    const colors = ['#111827','#065f46','#92400e','#991b1b','#374151','#3c3489','#9a3412'];
    const color = colors[(name || 'A').charCodeAt(0) % colors.length];
    return (
      <div style={{ width:size, height:size, borderRadius:8, background:color,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:'white', fontWeight:500, fontSize: Math.round(size * 0.38), flexShrink:0 }}>
        {initials}
      </div>
    );
  };

  const fmt = n => Number(n || 0).toFixed(2);
  const fmtDate = s => s ? new Date(s).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }) : '-';

  const statusMap = {
    pending:   { status:'warning', label:'En attente' },
    confirmed: { status:'success', label:'Confirme'   },
    cancelled: { status:'danger',  label:'Annule'     },
    completed: { status:'neutral', label:'Termine'    },
    no_show:   { status:'no_show', label:'Absent'     },
  };

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  const cardS = {
    background:t.card, borderRadius:12, padding:20,
    border:`0.5px solid ${t.border}`, marginBottom:16,
  };

  // ────────────────────────── Vue FICHE ───────────────────────────
  if (selected) {
    return (
      <div style={{ maxWidth:700, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <Button variant="secondary" size="small" type="button"
                  onClick={() => { setSelected(null); setFiche(null); setEditMode(false); }}>
            ← Retour
          </Button>
          <h2 style={{ margin:0, fontSize:18, fontWeight:500, color:t.text, flex:1 }}>
            {fiche ? (fiche.first_name + ' ' + fiche.last_name).trim() || fiche.email : selected.full_name || '...'}
          </h2>
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="secondary" size="small" type="button"
                    onClick={() => {
                      setEditMode(true);
                      setForm({
                        first_name: fiche?.first_name || '',
                        last_name:  fiche?.last_name  || '',
                        email:      fiche?.email      || '',
                        phone:      fiche?.phone      || '',
                        notes:      fiche?.account_notes || '',
                      });
                    }}>
              <I.Edit style={{ width:12, height:12, marginRight:4 }}/>
              Editer
            </Button>
            <Button variant="danger" size="small" type="button"
                    onClick={() => handleDelete(fiche?.id || selected.id)}>
              <I.Trash style={{ width:12, height:12, marginRight:4 }}/>
              Supprimer
            </Button>
          </div>
        </div>

        {ficheLoad && (
          <div style={{ textAlign:'center', padding:40, color:t.muted }}>Chargement...</div>
        )}

        {fiche && !editMode && (<>
          <div style={cardS}>
            <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
              <Avatar name={fiche.full_name || fiche.email} size={52}/>
              <div style={{ flex:1 }}>
                <h3 style={{ margin:'0 0 4px', fontSize:17, fontWeight:500, color:t.text }}>
                  {(fiche.first_name + ' ' + fiche.last_name).trim() || '-'}
                </h3>
                <p style={{ margin:'0 0 2px', fontSize:13, color:t.muted }}>{fiche.email || '-'}</p>
                <p style={{ margin:0, fontSize:13, color:t.muted }}>{fiche.phone || 'Pas de telephone'}</p>
                {fiche.account_notes && (
                  <p style={{ margin:'8px 0 0', fontSize:12, color:t.muted, fontStyle:'italic' }}>
                    {`"${fiche.account_notes}"`}
                  </p>
                )}
              </div>
              <div style={{ textAlign:'right' }}>
                {fiche.has_global_account
                  ? <StatusBadge status="success" variant="pastel" label="Compte plateforme"/>
                  : (
                    <Button variant="secondary" size="small" type="button"
                            onClick={handleInvite} disabled={inviting || !fiche.email}>
                      {inviting ? 'Envoi...' : 'Inviter'}
                    </Button>
                  )}
                {fiche.invite_sent_at && !fiche.has_global_account && (
                  <p style={{ fontSize:10, color:t.muted, margin:'4px 0 0' }}>
                    Invite le {fmtDate(fiche.invite_sent_at)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10, marginBottom:16 }}>
            {[
              { label:'Visites',        value: fiche.total_visits,                          Ic:I.Calendar, color:t.text,    bg:t.cardAlt },
              { label:'Total depense',  value: `${fmt(fiche.total_spent)} €`,              Ic:I.Wallet,   color:'#065f46', bg:'#f0fdf4' },
              { label:'Tampons/Points', value: fiche.stamps || fiche.points || 0,           Ic:I.Award,    color:'#92400e', bg:'#fffbeb' },
              { label:'Recompenses',    value: fiche.rewards_earned || 0,                   Ic:I.Gift,     color:'#3c3489', bg:'#eeedfe' },
            ].map(k => (
              <div key={k.label}
                   style={{ background:k.bg, borderRadius:8, padding:'14px 12px',
                            textAlign:'center' }}>
                <k.Ic style={{ width:16, height:16, color:k.color, margin:'0 auto 4px', display:'block' }}/>
                <div style={{ fontSize:17, fontWeight:500, color:k.color,
                              margin:'4px 0 2px', fontFamily:'monospace' }}>
                  {k.value}
                </div>
                <div style={{ fontSize:10, color:k.color, opacity:0.75 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Notes internes */}
          <div style={cardS}>
            <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:500, color:t.text }}>
              Notes internes
            </h4>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <input placeholder="Ajouter une note interne..."
                     value={noteText}
                     onChange={e => setNoteText(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                     style={{ ...inp, flex:1 }}/>
              <Button variant="primary" type="button" size="small"
                      onClick={handleAddNote}
                      disabled={!noteText.trim() || noteLoad}>
                {noteLoad ? '...' : '+'}
              </Button>
            </div>
            {(fiche.notes_list || []).length === 0 && (
              <p style={{ color:t.muted, fontSize:13, margin:0 }}>Aucune note pour ce client.</p>
            )}
            {(fiche.notes_list || []).map((n, i) => (
              <div key={i}
                   style={{ padding:'10px 14px', borderRadius:8,
                            background:t.cardAlt, marginBottom:8,
                            borderLeft:'2px solid rgba(67,56,202,0.5)' }}>
                <p style={{ margin:'0 0 4px', fontSize:13, color:t.text, lineHeight:1.5 }}>
                  {n.note_text}
                </p>
                <p style={{ margin:0, fontSize:10, color:t.muted }}>
                  {n.employee_name ? `Par ${n.employee_name} · ` : ''}{fmtDate(n.created_at)}
                </p>
              </div>
            ))}
          </div>

          {/* Transactions */}
          <div style={cardS}>
            <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:500, color:t.text }}>
              Transactions ({(fiche.transactions || []).length})
            </h4>
            {(fiche.transactions || []).length === 0 && (
              <p style={{ color:t.muted, fontSize:13, margin:0 }}>Aucune transaction.</p>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(fiche.transactions || []).map((tx, i) => (
                <div key={i}
                     style={{ display:'flex', alignItems:'center', gap:12,
                              padding:'10px 14px', borderRadius:8, background:t.cardAlt }}>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:500, color:t.text }}>
                      {tx.description || tx.category_name || '-'}
                    </p>
                    <p style={{ margin:0, fontSize:11, color:t.muted }}>
                      {fmtDate(tx.date)} {tx.time ? '· ' + tx.time.slice(0, 5) : ''}{' '}
                      {tx.employee_name ? '· ' + tx.employee_name : ''}
                    </p>
                    {tx.client_note && (
                      <p style={{ margin:'3px 0 0', fontSize:11, color:t.text, fontStyle:'italic' }}>
                        {`"${tx.client_note}"`}
                      </p>
                    )}
                  </div>
                  <span style={{ fontWeight:500, fontSize:14, color:'#065f46',
                                 fontFamily:'monospace' }}>
                    {fmt(tx.amount)} €
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* RDV */}
          <div style={cardS}>
            <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:500, color:t.text }}>
              Rendez-vous ({(fiche.appointments || []).length})
            </h4>
            {(fiche.appointments || []).length === 0 && (
              <p style={{ color:t.muted, fontSize:13, margin:0 }}>Aucun rendez-vous.</p>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(fiche.appointments || []).map((a, i) => {
                const sm = statusMap[a.status] || { status:'neutral', label: a.status };
                return (
                  <div key={i}
                       style={{ display:'flex', alignItems:'center', gap:12,
                                padding:'10px 14px', borderRadius:8, background:t.cardAlt }}>
                    <div style={{ flex:1 }}>
                      <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:500, color:t.text }}>
                        {a.service_name || 'Rendez-vous'}
                      </p>
                      <p style={{ margin:0, fontSize:11, color:t.muted }}>
                        {fmtDate(a.date)} {a.start_time?.slice(0, 5) || ''}{' '}
                        {a.employee_name ? '· ' + a.employee_name : ''}
                      </p>
                    </div>
                    <StatusBadge status={sm.status} variant="pastel" label={sm.label}/>
                    {a.total_amount && (
                      <span style={{ fontWeight:500, fontSize:13, color:'#065f46',
                                     fontFamily:'monospace' }}>
                        {fmt(a.total_amount)} €
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {(fiche.promos || []).length > 0 && (
            <div style={cardS}>
              <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:500, color:t.text }}>
                Codes promo utilises
              </h4>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(fiche.promos || []).map((p, i) => (
                  <div key={i}
                       style={{ display:'flex', alignItems:'center', gap:12,
                                padding:'10px 14px', borderRadius:8, background:t.cardAlt }}>
                    <div style={{ flex:1 }}>
                      <span style={{ fontFamily:'monospace', fontWeight:500, fontSize:13, color:t.text }}>
                        {p.code_snapshot}
                      </span>
                      {p.is_loyalty_reward && (
                        <span style={{ marginLeft:8, fontSize:10, color:'#92400e', fontWeight:500 }}>
                          Fidelite
                        </span>
                      )}
                    </div>
                    <span style={{ fontWeight:500, fontSize:13, color:'#991b1b' }}>
                      -{fmt(p.discount_applied)} €
                    </span>
                    <span style={{ fontSize:11, color:t.muted }}>{fmtDate(p.used_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>)}

        {fiche && editMode && (
          <div style={cardS}>
            <h4 style={{ margin:'0 0 20px', fontSize:15, fontWeight:500, color:t.text }}>
              Modifier la fiche client
            </h4>
            {[
              { key:'first_name', label:'Prenom' },
              { key:'last_name',  label:'Nom' },
              { key:'email',      label:'Email' },
              { key:'phone',      label:'Telephone' },
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom:14 }}>
                <Label>{label}</Label>
                <input value={form[key] || ''}
                       onChange={e => setForm(f => ({ ...f, [key]:e.target.value }))}
                       style={inp}/>
              </div>
            ))}
            <div style={{ marginBottom:20 }}>
              <Label>Notes internes (fiche)</Label>
              <textarea value={form.notes || ''}
                        onChange={e => setForm(f => ({ ...f, notes:e.target.value }))} rows={3}
                        style={{ ...inp, resize:'vertical' }}/>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <Button variant="primary" type="button"
                      onClick={handleUpdate} disabled={busy} style={{ flex:1 }}>
                {busy ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
              <Button variant="secondary" type="button" onClick={() => setEditMode(false)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ────────────────────────── Vue LISTE ───────────────────────────
  return (
    <div>
      <QRCard theme={theme} showToast={showToast}/>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <h2 style={{ margin:0, fontSize:18, fontWeight:500, color:t.text, flex:1 }}>
          Clients ({total})
        </h2>
        <Button variant="primary" type="button" onClick={() => setShowCreate(true)}>
          + Nouveau client
        </Button>
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <input placeholder="Rechercher par nom, email, telephone..."
               value={search} onChange={e => setSearch(e.target.value)}
               style={{ ...inp, flex:1, minWidth:200 }}/>
        <select value={sort} onChange={e => setSort(e.target.value)}
                style={{ ...inp, cursor:'pointer', width:'auto' }}>
          <option value="name">Trier : Nom A→Z</option>
          <option value="visits">Trier : Visites</option>
          <option value="spending">Trier : Depenses</option>
          <option value="recent">Trier : Recents</option>
        </select>
      </div>

      {showCreate && (
        <div style={cardS}>
          <h4 style={{ margin:'0 0 16px', fontSize:14, fontWeight:500, color:t.text }}>
            Nouveau client
          </h4>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
            {[['first_name','Prenom *'],['last_name','Nom'],['email','Email'],['phone','Telephone']].map(([k, lbl]) => (
              <input key={k} placeholder={lbl} value={form[k] || ''}
                     onChange={e => setForm(f => ({ ...f, [k]:e.target.value }))}
                     style={inp}/>
            ))}
          </div>
          <textarea placeholder="Notes internes (optionnel)"
                    value={form.notes || ''}
                    onChange={e => setForm(f => ({ ...f, notes:e.target.value }))} rows={2}
                    style={{ ...inp, resize:'vertical', marginBottom:12 }}/>
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="primary" type="button" onClick={handleCreate} disabled={busy}>
              {busy ? 'Creation...' : 'Creer le client'}
            </Button>
            <Button variant="secondary" type="button"
                    onClick={() => {
                      setShowCreate(false);
                      setForm({ first_name:'', last_name:'', email:'', phone:'', notes:'' });
                    }}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {loading && <div style={{ textAlign:'center', padding:40, color:t.muted }}>Chargement...</div>}

      {!loading && clients.length === 0 && (
        <div style={{ textAlign:'center', padding:60 }}>
          <I.Users style={{ width:36, height:36, color:t.dim, margin:'0 auto 12px', display:'block' }}/>
          <p style={{ fontSize:14, fontWeight:500, color:t.muted, margin:'0 0 4px' }}>Aucun client trouve</p>
          <p style={{ fontSize:13, color:t.muted, margin:0 }}>
            Les clients apparaissent automatiquement apres un encaissement avec email, ou vous pouvez en creer manuellement.
          </p>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {clients.map(cl => {
          const avatarColors = ['#111827','#065f46','#92400e','#3c3489','#991b1b','#374151'];
          const avatarColor = avatarColors[cl.full_name?.charCodeAt(0) % 6 || 0];
          return (
            <div key={cl.id} onClick={() => openFiche(cl)}
                 style={{ display:'flex', alignItems:'center', gap:14,
                          padding:'14px 18px', borderRadius:12,
                          background:t.card, border:`0.5px solid ${t.border}`,
                          cursor:'pointer', transition:'border-color 0.15s' }}
                 onMouseEnter={e => { e.currentTarget.style.borderColor = t.borderStrong; }}
                 onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; }}>
              <div style={{ width:40, height:40, borderRadius:8,
                            background:avatarColor,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color:'white', fontWeight:500, fontSize:15, flexShrink:0 }}>
                {(cl.full_name || cl.email || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                  <span style={{ fontWeight:500, fontSize:14, color:t.text }}>{cl.full_name || '-'}</span>
                  {cl.has_global_account && (
                    <StatusBadge status="success" variant="pastel" label="Compte"/>
                  )}
                </div>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                  {cl.email && <span style={{ fontSize:12, color:t.muted }}>{cl.email}</span>}
                  {cl.phone && (
                    <span style={{ fontSize:12, color:t.muted, display:'inline-flex', alignItems:'center', gap:4 }}>
                      <I.Phone style={{ width:10, height:10 }}/>
                      {cl.phone}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display:'flex', gap:16, alignItems:'center', flexShrink:0 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:14, fontWeight:500, color:t.text }}>
                    {(cl.tx_count || 0) + (cl.apt_count || 0)}
                  </div>
                  <div style={{ fontSize:10, color:t.muted }}>visites</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:14, fontWeight:500, color:'#065f46', fontFamily:'monospace' }}>
                    {Number(cl.total_spent || 0).toFixed(0)}€
                  </div>
                  <div style={{ fontSize:10, color:t.muted }}>depense</div>
                </div>
                {(cl.stamps || cl.points) ? (
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:14, fontWeight:500, color:'#92400e' }}>
                      {cl.stamps || Math.floor(cl.points) || 0}
                    </div>
                    <div style={{ fontSize:10, color:t.muted }}>pts</div>
                  </div>
                ) : null}
                {cl.notes_count > 0 && (
                  <span style={{ fontSize:11, color:'#4338ca',
                                 background:'#eef2ff', padding:'3px 8px', borderRadius:99,
                                 display:'inline-flex', alignItems:'center', gap:4 }}>
                    <I.Edit style={{ width:9, height:9 }}/>
                    {cl.notes_count}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!loading && total > 0 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                      padding:'20px 0 8px' }}>
          <Button variant="secondary" size="small" type="button"
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}>
            ‹ Prec.
          </Button>
          <span style={{ fontSize:13, fontWeight:500, color:t.muted, minWidth:80, textAlign:'center' }}>
            Page {page + 1} / {totalPages}
          </span>
          <Button variant="secondary" size="small" type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>
            Suiv. ›
          </Button>
        </div>
      )}
    </div>
  );
}
