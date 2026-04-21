import { useState, useEffect } from 'react';
import { absencesApi } from '../../../../utils/api';
import { Button, Label } from '../../../../components/primitives';

export default function TabAbsences({ employees, theme }) {
  const t = theme;
  const [absences, setAbsences] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form, setForm] = useState({
    employee_id:'', type:'conges', start_date:'', end_date:'', reason:'',
  });
  const today = new Date().toLocaleDateString('sv-SE');

  const TYPES = {
    conges:'Conges',         maladie:'Maladie',          formation:'Formation',
    autre:'Autre',           maternite:'Maternite',      paternite:'Paternite',
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
      setError('Employe, date debut et date fin requis.'); return;
    }
    setSaving(true); setError('');
    try {
      await absencesApi.create(form);
      setShowForm(false);
      setForm({ employee_id:'', type:'conges', start_date:'', end_date:'', reason:'' });
      load();
    } catch (e) { setError(e.message || 'Erreur'); }
    finally { setSaving(false); }
  };

  const cancel = async (id) => {
    if (!window.confirm('Annuler cette absence ?')) return;
    try { await absencesApi.cancel(id); load(); }
    catch (e) { setError(e.message || 'Erreur'); }
  };

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  const fmtDate = d => {
    if (!d) return '-';
    const s = String(d).substring(0, 10);
    return new Date(s + 'T12:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
  };
  const nbJours = (s, e) => {
    if (!s || !e) return 0;
    return Math.max(1, Math.round((new Date(e + 'T12:00') - new Date(s + 'T12:00')) / 86400000) + 1);
  };

  const Spinner = ({ size = 26 }) => (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24"
         style={{ color:t.text, display:'inline-block' }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
      <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {error && <p style={{ fontSize:12, color:'#991b1b', margin:0 }}>{error}</p>}

      <div style={{ alignSelf:'flex-end' }}>
        <Button variant={showForm ? 'secondary' : 'primary'} type="button" size="small"
                onClick={() => setShowForm(p => !p)}>
          {showForm ? 'Annuler' : '+ Declarer une absence'}
        </Button>
      </div>

      {showForm && (
        <div style={{ background:t.card, border:`0.5px solid ${t.border}`,
                      borderRadius:12, padding:18,
                      display:'flex', flexDirection:'column', gap:12 }}>
          <p style={{ fontSize:14, fontWeight:500, color:t.text, margin:0 }}>Nouvelle absence</p>
          <div>
            <Label>Employe *</Label>
            <select value={form.employee_id}
                    onChange={e => setForm(f => ({ ...f, employee_id:e.target.value }))}
                    style={{ ...inp, cursor:'pointer' }}>
              <option value="">Choisir…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Type</Label>
            <select value={form.type}
                    onChange={e => setForm(f => ({ ...f, type:e.target.value }))}
                    style={{ ...inp, cursor:'pointer' }}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <Label>Du *</Label>
              <input type="date" value={form.start_date} min={today}
                     onChange={e => setForm(f => ({ ...f, start_date:e.target.value }))}
                     style={inp}/>
            </div>
            <div>
              <Label>Au *</Label>
              <input type="date" value={form.end_date} min={form.start_date || today}
                     onChange={e => setForm(f => ({ ...f, end_date:e.target.value }))}
                     style={inp}/>
            </div>
          </div>
          <div>
            <Label>Motif (optionnel)</Label>
            <input value={form.reason}
                   onChange={e => setForm(f => ({ ...f, reason:e.target.value }))}
                   placeholder={"Motif de l'absence"} style={inp}/>
          </div>
          <Button variant="primary" fullWidth type="button" onClick={submit} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      )}

      {loading ? (
        <div style={{ padding:40, textAlign:'center' }}><Spinner/></div>
      ) : absences.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:t.muted, fontSize:14 }}>
          Aucune absence declaree
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {absences.map(a => {
            const emp = employees.find(e => e.id === a.employee_id);
            return (
              <div key={a.id}
                   style={{ background:t.card, border:`0.5px solid ${t.border}`,
                            borderRadius:12, padding:'14px 16px',
                            display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:8, flexShrink:0,
                              background:`${emp?.avatar_color || t.text}18`,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontWeight:500, fontSize:15, color: emp?.avatar_color || t.text }}>
                  {emp?.name?.charAt(0) || '?'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:500, color:t.text, margin:'0 0 2px' }}>
                    {emp?.name || 'Employe'} — {TYPES[a.type] || a.type}
                  </p>
                  <p style={{ fontSize:12, color:t.muted, margin:0 }}>
                    {fmtDate(a.start_date)} → {fmtDate(a.end_date)} · {nbJours(String(a.start_date).substring(0, 10), String(a.end_date).substring(0, 10))} jour(s)
                  </p>
                  {a.reason && <p style={{ fontSize:11, color:t.dim, margin:'2px 0 0' }}>{a.reason}</p>}
                </div>
                {!a.cancelled_at && (
                  <button onClick={() => cancel(a.id)}
                          style={{ padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer',
                                   background:'rgba(239,68,68,0.1)', color:'#991b1b',
                                   fontWeight:500, fontSize:12, fontFamily:'inherit' }}>
                    Annuler
                  </button>
                )}
                {a.cancelled_at && (
                  <span style={{ fontSize:11, color:'#991b1b', fontWeight:500 }}>Annule</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
