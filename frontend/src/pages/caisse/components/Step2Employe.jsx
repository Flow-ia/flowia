// Caisse > Encaisser > Step 2 · Employé.
// Grille d'avatars des employés autorisés à encaisser
// (can_encash=true, is_active=true). Sélection = carte mise en évidence.
// Le PIN employé n'est PAS demandé ici — il sera exigé à l'étape 4
// (Confirm) via useEmployeePinGate pour valider la transaction. Source
// de vérité anti-spoofing : employeePinOptional côté back substitue
// req.employee.id à body.employee_id quand le PIN est fourni.
//
// UX commit 7e : auto-advance en 1 seul clic. Auparavant Encaisser.jsx
// passait `onContinue={() => go(3)}` qui re-vérifiait `!empId` depuis une
// closure stale (empId encore '' à ce moment, le re-render n'avait pas eu
// lieu) → le passage step 3 était bloqué et il fallait re-cliquer. On
// remplace par `onPickEmployee(id)` qui fait setEmpId+setStep en un seul
// callback côté parent. Petit feedback visuel via `pickedId` local pendant
// 120 ms (border accent + scale) avant que le DOM bascule sur l'étape 3.
import { useState } from 'react';
import { Icon } from '../../../components/Icon';

export default function Step2Employe({ employees = [], empId, setEmpId, theme: t, onBack, onPickEmployee }) {
  const eligible = employees.filter(e => e.is_active !== false && e.can_encash === true);
  const [pickedId, setPickedId] = useState(null);

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
            const isPicked = pickedId === e.id;
            const active = empId === e.id || isPicked;
            const accent = e.avatar_color || '#6b7280';
            const pick = () => {
              if (pickedId) return; // anti double-clic pendant l'animation
              setPickedId(e.id);
              setEmpId(e.id);
              // 120 ms de feedback visuel avant le switch d'étape, pour que
              // l'utilisateur voie clairement quel employé il a choisi.
              setTimeout(() => { onPickEmployee && onPickEmployee(e.id); }, 120);
            };
            return (
              <button key={e.id} onClick={pick}
                      style={{ padding: 14, borderRadius: 10,
                               border: `0.5px solid ${active ? accent : t.border}`,
                               borderLeft: `2px solid ${active ? accent : 'transparent'}`,
                               background: active ? t.cardAlt : t.card,
                               color: t.text, cursor: 'pointer', fontFamily: 'inherit',
                               display: 'flex', flexDirection: 'column',
                               alignItems: 'center', gap: 8, position: 'relative',
                               transform: isPicked ? 'scale(1.03)' : 'scale(1)',
                               transition: 'border-color 0.15s ease, background 0.15s ease, transform 0.12s ease' }}>
                {isPicked && (
                  <span style={{ position: 'absolute', top: 6, right: 6,
                                 width: 18, height: 18, borderRadius: 99,
                                 background: accent, color: '#fff',
                                 display: 'inline-flex', alignItems: 'center',
                                 justifyContent: 'center' }}>
                    <Icon name="check" size={11} color="#fff" strokeWidth={2.5}/>
                  </span>
                )}
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
