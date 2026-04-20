// src/pages/clients/views/CreateView.jsx
import BackBtn from '../components/BackBtn';
import { Toast } from '../../../components/UI';

// ══ VUE CRÉER ═══════════════════════════════════════════════════════════════
export default function CreateView({
  theme, isDark, toast,
  stickyHeader, inp, lbl,
  form, setForm,
  busy, handleCreate,
  setView,
}) {
  return (
    <div style={{ background:theme.bg, minHeight:'100vh', paddingBottom:96 }} className="lg:pb-8">
      <Toast msg={toast?.msg} type={toast?.type} />
      <div style={{ ...stickyHeader, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
        <BackBtn onClick={() => setView('list')} theme={theme} isDark={isDark} />
        <h1 style={{ margin:0, fontSize:18, fontWeight:900, color:theme.text }}>Nouveau client</h1>
      </div>
      <div style={{ padding:'20px 16px', display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div><label style={lbl}>Prénom *</label><input value={form.first_name} onChange={e => setForm(f=>({...f,first_name:e.target.value}))} placeholder="Prénom" style={inp} /></div>
          <div><label style={lbl}>Nom</label><input value={form.last_name} onChange={e => setForm(f=>({...f,last_name:e.target.value}))} placeholder="Nom" style={inp} /></div>
        </div>
        <div><label style={lbl}>Email</label><input type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} placeholder="client@email.com" style={inp} /></div>
        <div><label style={lbl}>Téléphone</label><input value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))} placeholder="+33 6 00 00 00 00" style={inp} /></div>
        <div><label style={lbl}>Notes internes</label><textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder="Préférences, allergies, remarques…" rows={3} style={{ ...inp, resize:'vertical', fontFamily:'inherit', lineHeight:1.5 }} /></div>
        <button onClick={handleCreate} disabled={busy}
          style={{ padding:'15px', borderRadius:16, background:'Black', border:'none', color:'white', fontWeight:800, fontSize:15, cursor:'pointer', opacity:busy?0.65:1, boxShadow:'0 6px 20px rgba(17,24,39,0.3)' }}>
          {busy ? 'Creation...' : '✓ Creer le client'}
        </button>
      </div>
    </div>
  );
}
