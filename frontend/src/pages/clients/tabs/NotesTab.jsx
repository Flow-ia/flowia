// src/pages/clients/tabs/NotesTab.jsx
import { fmtDate } from '../helpers';

// ─── Onglet Notes ─────────────────────────────────────────────────────────────
export default function NotesTab({
  theme, card, inp, lbl,
  fiche, employees,
  noteText, setNoteText,
  noteEmpId, setNoteEmpId,
  noteLoad, handleNote,
}) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:12 }}>
      <div style={{ ...card, padding:14 }}>
        {/* Sélecteur employé pour la note */}
        {employees.length > 0 && (
          <div style={{ marginBottom:10 }}>
            <label style={lbl}>Employé qui ajoute la note</label>
            <select value={noteEmpId} onChange={e => setNoteEmpId(e.target.value)}
              style={{ ...inp, cursor:'pointer' }}>
              <option value="" disabled>Sélectionner un employé</option>
              {employees.filter(e => e.is_active).map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            {noteEmpId && (
              <p style={{ margin:'4px 0 0', fontSize:11, color:'#111827' }}>
                🔐 Code PIN de {employees.find(e=>e.id===noteEmpId)?.name} requis pour valider
              </p>
            )}
          </div>
        )}
        <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Ajouter une note interne sur ce client…" rows={3}
          style={{ ...inp, resize:'vertical', marginBottom:10, fontFamily:'inherit', lineHeight:1.5 }} />
        <button onClick={handleNote} disabled={noteLoad||!noteText.trim()}
          style={{ width:'100%', padding:'11px', borderRadius:12, background:'Black', border:'none', color:'white', fontWeight:800, fontSize:14, cursor:'pointer', opacity:noteLoad||!noteText.trim()?0.55:1 }}>
          {noteLoad ? 'Ajout...' : '+ Ajouter la note'}
        </button>
      </div>
      {(fiche.notes_list||[]).length === 0 ? (
        <div style={{ textAlign:'center', padding:'32px 0', color:theme.muted }}>
          <p style={{ fontSize:32, margin:'0 0 8px' }}>📝</p>
          <p style={{ fontSize:14, fontWeight:600 }}>Aucune note pour l'instant</p>
        </div>
      ) : (fiche.notes_list||[]).map((n,i) => (
        <div key={i} style={{ ...card, padding:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontSize:12, fontWeight:800, color:'#111827' }}>{n.employee_name||'Admin'}</span>
            <span style={{ fontSize:11, color:theme.muted }}>{fmtDate(n.created_at)}</span>
          </div>
          <p style={{ margin:0, fontSize:14, color:theme.text, lineHeight:1.55 }}>{n.note_text}</p>
        </div>
      ))}
    </div>
  );
}
