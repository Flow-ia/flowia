// Caisse > Encaisser > Step 2 · Employé.
// Grille d'avatars des employés autorisés à encaisser
// (can_encash=true, is_active=true). Sélection = carte mise en évidence.
// Le PIN employé n'est PAS demandé ici — il sera exigé à l'étape 4
// (Confirm) via useEmployeePinGate pour valider la transaction. Source
// de vérité anti-spoofing : employeePinOptional côté back substitue
// req.employee.id à body.employee_id quand le PIN est fourni.
//
// UX commit 7d : auto-advance — clic sur un avatar = setEmpId + onContinue()
// après 50 ms (feedback visuel). Le bouton "Continuer" est retiré de cette
// étape, "Précédent" reste. Les étapes 1 et 3 gardent leur bouton Continuer.
import { Icon } from '../../../components/Icon';

export default function Step2Employe({ employees = [], empId, setEmpId, theme: t, onBack, onContinue }) {
  const eligible = employees.filter(e => e.is_active !== false && e.can_encash === true);

  const card = {
    padding: 14, borderRadius: 12, background: t.card,
    border: `0.5px solid ${t.border}`,
    display: 'flex', flexDirection: 'column', gap: 12,
  };

  return (
    <div style={card}>
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.text }}>
          {"Qui encaisse ?"}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: t.muted }}>
          {"Seuls les employés avec la permission can_encash apparaissent. Le PIN employé sera demandé à la validation."}
        </p>
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
          {eligible.map(e => {
            const active = empId === e.id;
            const accent = e.avatar_color || '#6b7280';
            const pick = () => {
              setEmpId(e.id);
              // Petit délai pour que l'utilisateur perçoive la sélection
              // avant de basculer sur l'étape 3 (confort UX).
              setTimeout(() => { onContinue && onContinue(); }, 80);
            };
            return (
              <button key={e.id} onClick={pick}
                      style={{ padding: 14, borderRadius: 10,
                               border: `0.5px solid ${active ? accent : t.border}`,
                               borderLeft: `2px solid ${active ? accent : 'transparent'}`,
                               background: active ? t.cardAlt : t.card,
                               color: t.text, cursor: 'pointer', fontFamily: 'inherit',
                               display: 'flex', flexDirection: 'column',
                               alignItems: 'center', gap: 8,
                               transition: 'border-color 0.15s ease, background 0.15s ease' }}>
                <div style={{ width: 42, height: 42, borderRadius: 99,
                              background: accent, color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 16, fontWeight: 500 }}>
                  {(e.name || '?').charAt(0).toUpperCase()}
                </div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.text,
                            textAlign: 'center', wordBreak: 'break-word' }}>
                  {e.name}
                </p>
                {e.role && (
                  <p style={{ margin: 0, fontSize: 11, color: t.muted, textAlign: 'center' }}>
                    {e.role}
                  </p>
                )}
                {active && (
                  <span style={{ fontSize: 10, color: accent, fontWeight: 500,
                                 textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {"Sélectionné"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Auto-advance : pas de bouton "Continuer", seul "Retour" est visible. */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
        <button onClick={onBack}
                style={{ padding: '10px 14px', borderRadius: 8,
                         border: `0.5px solid ${t.border}`,
                         background: t.cardAlt, color: t.text,
                         cursor: 'pointer', fontFamily: 'inherit',
                         fontSize: 12, fontWeight: 500,
                         display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="chevronLeft" size={13} color={t.text}/>
          {"Retour"}
        </button>
      </div>
    </div>
  );
}
