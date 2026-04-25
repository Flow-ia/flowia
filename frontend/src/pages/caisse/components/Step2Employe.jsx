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

  // Mélange une couleur accent vers du blanc pour obtenir un pastel léger
  // utilisable en background de la card sélectionnée.
  const pastelOf = (hex) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#f3f4f6';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mix = (c) => Math.round(c + (255 - c) * 0.88);
    return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
  };

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
        <p style={{ margin: '3px 0 0', fontSize: 11, color: t.muted }}>
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
                      gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: 10 }}>
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
                               minHeight: 110,
                               border: active
                                 ? '2px solid ' + accent
                                 : `0.5px solid ${t.border}`,
                               background: active ? pastelOf(accent) : t.card,
                               color: t.text, cursor: 'pointer', fontFamily: 'inherit',
                               display: 'flex', flexDirection: 'column',
                               alignItems: 'center', justifyContent: 'center',
                               gap: 8, position: 'relative',
                               boxShadow: active ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                               transform: isPicked ? 'scale(1.03)' : 'scale(1)',
                               transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease' }}>
                {isPicked && (
                  <span style={{ position: 'absolute', top: 6, right: 6,
                                 width: 20, height: 20, borderRadius: 99,
                                 background: accent, color: '#fff',
                                 display: 'inline-flex', alignItems: 'center',
                                 justifyContent: 'center' }}>
                    <Icon name="check" size={12} color="#fff" strokeWidth={2.5}/>
                  </span>
                )}
                <div style={{ width: 56, height: 56, borderRadius: 99,
                              background: accent, color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 18, fontWeight: 500 }}>
                  {(e.name || '?').charAt(0).toUpperCase()}
                </div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.text,
                            textAlign: 'center', wordBreak: 'break-word' }}>
                  {e.name}
                </p>
                {e.role && (
                  <p style={{ margin: 0, fontSize: 11, color: '#6b7280', textAlign: 'center' }}>
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
                style={{ minHeight: 42, padding: '11px 16px', borderRadius: 8,
                         border: `0.5px solid ${t.border}`,
                         background: t.cardAlt, color: t.text,
                         cursor: 'pointer', fontFamily: 'inherit',
                         fontSize: 13, fontWeight: 500,
                         display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="chevronLeft" size={14} color={t.text}/>
          {"Retour"}
        </button>
      </div>
    </div>
  );
}
