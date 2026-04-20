import { useState, useEffect } from 'react';
import { absencesApi } from '../../../../utils/api';

export default function TabAbsences({ employees, theme }) {
  const isDark = theme.mode === 'dark';
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm] = useState({
    employee_id: '', type: 'conges', start_date: '', end_date: '', reason: '',
  });
  const today = new Date().toLocaleDateString('sv-SE');

  const TYPES = {
    conges:'Conges', maladie:'Maladie', formation:'Formation',
    autre:'Autre', maternite:'Maternite', paternite:'Paternite',
    sans_solde:'Sans solde', accident_travail:'Accident travail',
  };

  const load = () => {
    setLoading(true);
    absencesApi.list({})
      .then(rows => setAbsences(Array.isArray(rows) ? rows : []))
      .catch(e => setError(e.message || 'Erreur chargement'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submit = async () => {
    if (!form.employee_id || !form.start_date || !form.end_date) {
      setError('Employé, date debut et date fin requis.'); return;
    }
    setSaving(true); setError('');
    try {
      await absencesApi.create(form);
      setShowForm(false);
      setForm({ employee_id:'', type:'conges', start_date:'', end_date:'', reason:'' });
      load();
    } catch(e) { setError(e.message || 'Erreur'); }
    finally { setSaving(false); }
  };

  const cancel = async (id) => {
    if (!window.confirm('Annuler cette absence ?')) return;
    try { await absencesApi.cancel(id); load(); }
    catch(e) { setError(e.message || 'Erreur'); }
  };

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, outline:'none',
    background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.04)',
    border:`1px solid ${theme.border}`, color:theme.text,
    fontSize:13, fontFamily:'inherit', boxSizing:'border-box' };

  const fmtDate = d => { if(!d) return '-'; const s=String(d).substring(0,10); return new Date(s+'T12:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}); };
  const nbJours = (s,e) => { if(!s||!e) return 0; return Math.max(1,Math.round((new Date(e+'T12:00')-new Date(s+'T12:00'))/(86400000))+1); };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {error && <p style={{ fontSize:12, color:'#f87171', fontWeight:600 }}>{error}</p>}

      <button onClick={()=>setShowForm(p=>!p)}
        style={{ alignSelf:'flex-end', padding:'9px 16px', borderRadius:10, border:'none',
          background:'#1a73e8', color:'white', fontWeight:700, fontSize:13, cursor:'pointer' }}>
        {showForm ? 'Annuler' : '+ Declarer une absence'}
      </button>

      {showForm && (
        <div style={{ background:theme.card, border:`1px solid ${theme.border}`,
          borderRadius:16, padding:18, display:'flex', flexDirection:'column', gap:10 }}>
          <p style={{ fontWeight:800, fontSize:14, color:theme.text, margin:0 }}>Nouvelle absence</p>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Employé *</p>
            <select value={form.employee_id} onChange={e=>setForm(f=>({...f,employee_id:e.target.value}))} style={{...inp,cursor:'pointer'}}>
              <option value="">Choisir…</option>
              {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Type</p>
            <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={{...inp,cursor:'pointer'}}>
              {Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Du *</p>
              <input type="date" value={form.start_date} min={today}
                onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} style={inp}/>
            </div>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Au *</p>
              <input type="date" value={form.end_date} min={form.start_date||today}
                onChange={e=>setForm(f=>({...f,end_date:e.target.value}))} style={inp}/>
            </div>
          </div>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Motif (optionnel)</p>
            <input value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}
              placeholder="Motif de l'absence" style={inp}/>
          </div>
          <button onClick={submit} disabled={saving}
            style={{ padding:'12px', borderRadius:11, border:'none', cursor:'pointer',
              background:'#1a73e8', color:'white', fontWeight:800, fontSize:13, opacity:saving?0.7:1 }}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding:40, textAlign:'center' }}>
          <div style={{ width:28,height:28,borderRadius:99,border:`2px solid ${isDark?'rgba(255,255,255,0.1)':'rgba(17,24,39,0.2)'}`,borderTopColor:isDark?'#e6edf3':'#111827',animation:'spin .8s linear infinite',margin:'0 auto' }}/>
        </div>
      ) : absences.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:theme.muted, fontSize:14 }}>
          Aucune absence déclarée
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {absences.map(a => {
            const emp = employees.find(e=>e.id===a.employee_id);
            return (
              <div key={a.id} style={{ background:theme.card, border:`1px solid ${theme.border}`,
                borderRadius:14, padding:'14px 16px',
                display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
                  background:`${emp?.avatar_color||'#111827'}18`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontWeight:800, fontSize:15, color:emp?.avatar_color||(isDark?'#e6edf3':'#111827') }}>
                  {emp?.name?.charAt(0)||'?'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:700, color:theme.text, margin:'0 0 2px' }}>
                    {emp?.name||'Employe'} — {TYPES[a.type]||a.type}
                  </p>
                  <p style={{ fontSize:12, color:theme.muted, margin:0 }}>
                    {fmtDate(a.start_date)} → {fmtDate(a.end_date)} · {nbJours(String(a.start_date).substring(0,10), String(a.end_date).substring(0,10))} jour(s)
                  </p>
                  {a.reason && <p style={{ fontSize:11, color:theme.dim, margin:'2px 0 0' }}>{a.reason}</p>}
                </div>
                {!a.cancelled_at && (
                  <button onClick={()=>cancel(a.id)}
                    style={{ padding:'6px 12px', borderRadius:9, border:'none', cursor:'pointer',
                      background:'rgba(248,113,113,0.1)', color:'#f87171',
                      fontWeight:700, fontSize:12 }}>
                    Annuler
                  </button>
                )}
                {a.cancelled_at && (
                  <span style={{ fontSize:11, color:'#f87171', fontWeight:700 }}>Annulé</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
