// src/pages/clients/tabs/NotesTab.jsx
import { fmtDate } from '../helpers';
import { Button } from '../../../components/primitives';

// ─── Onglet Notes ─────────────────────────────────────────────────────────────
export default function NotesTab({
  theme, card, inp, lbl,
  fiche, employees,
  noteText, setNoteText,
  noteEmpId, setNoteEmpId,
  noteLoad, handleNote,
}) {
  const list = fiche.notes_list || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
      <div style={{ ...card, padding: 14 }}>
        {/* Selecteur employe */}
        {employees.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Employe qui ajoute la note</label>
            <select
              value={noteEmpId}
              onChange={e => setNoteEmpId(e.target.value)}
              style={{ ...inp, cursor: 'pointer' }}
            >
              <option value="" disabled>Selectionner un employe</option>
              {employees.filter(e => e.is_active).map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            {noteEmpId && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: theme.muted, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b' }} />
                Code PIN de {employees.find(e => e.id === noteEmpId)?.name} requis pour valider
              </p>
            )}
          </div>
        )}
        <textarea
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="Ajouter une note interne sur ce client…"
          rows={3}
          style={{ ...inp, resize: 'vertical', marginBottom: 10, lineHeight: 1.5 }}
        />
        <Button fullWidth onClick={handleNote} disabled={noteLoad || !noteText.trim()}>
          {noteLoad ? 'Ajout...' : 'Ajouter la note'}
        </Button>
      </div>
      {list.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '32px 16px',
          background: theme.card,
          border: `0.5px dashed ${theme.border}`,
          borderRadius: 12,
        }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: theme.muted, margin: 0 }}>
            Aucune note pour l{"'"}instant
          </p>
        </div>
      ) : list.map((n, i) => (
        <div key={i} style={{ ...card, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: theme.text }}>
              {n.employee_name || 'Admin'}
            </span>
            <span style={{ fontSize: 11, color: theme.muted }}>{fmtDate(n.created_at)}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: theme.text, lineHeight: 1.55 }}>
            {n.note_text}
          </p>
        </div>
      ))}
    </div>
  );
}
