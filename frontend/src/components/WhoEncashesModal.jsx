// WhoEncashesModal — refonte FDS-2026 commit 11.
// S'intercale AVANT l'ouverture d'EncaisserSheet en mode tablette partagée.
// Liste les employés autorisés à encaisser (can_encash=true, is_active=true).
// Le PIN employé est demandé au submit final par useEmployeePinGate (déjà
// en place dans EncaisserSheet) — pas dupliqué ici.
import { useTheme } from '../hooks/useTheme';
import { Icon } from './Icon';

export default function WhoEncashesModal({ open, employees = [], onSelect, onClose }) {
  const { theme: t } = useTheme();
  if (!open) return null;

  const eligible = employees.filter(e => e.is_active !== false && e.can_encash === true);

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}
         style={{ position:'fixed', inset:0, zIndex: 1000, padding: 20,
                  background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:'100%', maxWidth: 440, borderRadius: 16,
                    background: t.card, color: t.text,
                    border: '0.5px solid ' + t.border,
                    boxShadow: t.shadowModal || '0 10px 30px rgba(0,0,0,0.2)',
                    padding: 20, display:'flex', flexDirection:'column', gap: 14 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap: 10 }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: t.text }}>
              {"Qui encaisse ?"}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: t.muted }}>
              {"Choisissez l'employé avant de démarrer l'encaissement."}
            </p>
          </div>
          <button onClick={onClose}
                  style={{ border:'none', background:'transparent', cursor:'pointer',
                           padding: 6, color: t.muted, fontFamily:'inherit' }}
                  aria-label="Fermer">
            <Icon name="x" size={16} color={t.muted}/>
          </button>
        </div>

        {eligible.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: t.muted,
                      padding: 16, borderRadius: 8, background: t.cardAlt }}>
            {"Aucun employé actif avec la permission can_encash. Configurez-les depuis Réglages > Équipe > Membres."}
          </p>
        ) : (
          <div style={{ display:'grid',
                        gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: 8 }}>
            {eligible.map(e => (
              <button key={e.id}
                      onClick={() => onSelect && onSelect(e.id)}
                      style={{ padding: 14, borderRadius: 10,
                               border: '0.5px solid ' + t.border,
                               background: t.cardAlt, color: t.text,
                               cursor:'pointer', fontFamily:'inherit',
                               display:'flex', flexDirection:'column',
                               alignItems:'center', gap: 8,
                               transition:'background 0.15s ease, transform 0.15s ease' }}
                      onMouseEnter={ev => { ev.currentTarget.style.background = t.card; ev.currentTarget.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={ev => { ev.currentTarget.style.background = t.cardAlt; ev.currentTarget.style.transform = 'none'; }}>
                <div style={{ width: 42, height: 42, borderRadius: 99,
                              background: e.avatar_color || '#6b7280', color:'#fff',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize: 16, fontWeight: 500 }}>
                  {(e.name || '?').charAt(0).toUpperCase()}
                </div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.text,
                            textAlign:'center', wordBreak:'break-word' }}>
                  {e.name}
                </p>
                {e.role && (
                  <p style={{ margin: 0, fontSize: 11, color: t.muted, textAlign:'center' }}>
                    {e.role}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}

        <p style={{ margin: 0, fontSize: 10, color: t.muted }}>
          {"Le PIN employé sera demandé à la validation de l'encaissement."}
        </p>
      </div>
    </div>
  );
}
