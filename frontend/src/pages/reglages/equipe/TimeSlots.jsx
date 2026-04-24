// Réglages > Équipe > Plages horaires (employee_time_slots).
// L'API existe (/booking/employee-slots) mais n'a pas d'UI dédiée aujourd'hui
// dans pages/settings. Ce stub signale la fonctionnalité au merchant sans
// créer de nouvelle logique (cf. règle #1 : rien en moins, rien en plus).
// La création d'UI réelle est un chantier à part, planifié après commit 14.
import { useTheme } from '../../../hooks/useTheme';
import { Icon } from '../../../components/Icon';

export default function TimeSlots() {
  const { theme: t } = useTheme();
  return (
    <div style={{ padding:20, borderRadius:12, background:t.card,
                  border:`0.5px solid ${t.border}`,
                  display:'flex', gap:14, alignItems:'flex-start' }}>
      <div style={{ width:42, height:42, borderRadius:10, flexShrink:0,
                    background: t.cardAlt, color: t.muted,
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Icon name="clock" size={18} color={t.muted}/>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
          {"Plages horaires multiples"}
        </p>
        <p style={{ margin:'4px 0 0', fontSize:12, color:t.muted, lineHeight:1.6 }}>
          {"Gérer les plages ponctuelles par employé (matin + après-midi séparés, jours de marché, etc.)."}
          <br/>
          {"Onglet en préparation — en attendant, configurez les horaires standards via l'onglet Horaires."}
        </p>
      </div>
    </div>
  );
}
