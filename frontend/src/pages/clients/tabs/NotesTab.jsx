// src/pages/clients/tabs/NotesTab.jsx
import { useEffect, useRef } from 'react';
import { fmtDate } from '../helpers';
import { Button } from '../../../components/primitives';

// Refonte FDS-2026 commit 8 : brouillon auto-save sessionStorage (2 s).
// Le modèle DB `client_notes` stocke plusieurs notes horodatées, chacune
// avec PIN employé pour validation. On NE fait PAS un POST toutes les 2 s
// (créerait des dizaines de notes par pause). À la place : on sauvegarde
// le texte en cours dans sessionStorage pour survivre à un refresh
// accidentel, puis on efface après envoi validé.
const DRAFT_KEY = (clientId) => 'ff_client_note_draft_' + clientId;

// ─── Onglet Notes ─────────────────────────────────────────────────────────────
export default function NotesTab({
  theme, card, inp, lbl,
  fiche, employees,
  noteText, setNoteText,
  noteEmpId, setNoteEmpId,
  noteLoad, handleNote,
}) {
  const list = fiche.notes_list || [];
  const hydrated = useRef(false);

  // Restauration du brouillon au mount (une seule fois par fiche).
  useEffect(() => {
    if (hydrated.current || !fiche?.id) return;
    hydrated.current = true;
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY(fiche.id));
      if (saved && !noteText) setNoteText(saved);
    } catch { /* sessionStorage indisponible (mode privé) */ }
  }, [fiche?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save brouillon : debounce 2 s après la dernière frappe.
  useEffect(() => {
    if (!fiche?.id) return;
    const tm = setTimeout(() => {
      try {
        if (noteText) sessionStorage.setItem(DRAFT_KEY(fiche.id), noteText);
        else          sessionStorage.removeItem(DRAFT_KEY(fiche.id));
      } catch { /* noop */ }
    }, 2000);
    return () => clearTimeout(tm);
  }, [noteText, fiche?.id]);

  const onSubmit = async () => {
    await handleNote();
    // handleNote vide noteText en cas de succès — on purge le brouillon.
    try { sessionStorage.removeItem(DRAFT_KEY(fiche.id)); } catch { /* noop */ }
  };

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
        <Button fullWidth onClick={onSubmit} disabled={noteLoad || !noteText.trim()}>
          {noteLoad ? 'Ajout...' : 'Ajouter la note'}
        </Button>
        <p style={{ margin:'6px 0 0', fontSize:10, color:theme.muted }}>
          {"Brouillon sauvegardé localement toutes les 2 s."}
        </p>
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
