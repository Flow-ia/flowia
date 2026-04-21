import FideliteAccordion from '../components/FideliteAccordion';
import TabLoyalty from './TabLoyalty';
import TabBirthday from './TabBirthday';
import TabReferral from './TabReferral';

// Agrege Programme fidelite + Anniv + Parrainage dans une page a accordeons.
export default function TabFidelite({ theme, showToast }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <FideliteAccordion theme={theme} title="Programme de fidelite (tampons / points)">
        <TabLoyalty theme={theme}/>
      </FideliteAccordion>
      <FideliteAccordion theme={theme} title="Offres anniversaire">
        <TabBirthday theme={theme} showToast={showToast}/>
      </FideliteAccordion>
      <FideliteAccordion theme={theme} title="Programme de parrainage">
        <TabReferral theme={theme} showToast={showToast}/>
      </FideliteAccordion>
    </div>
  );
}
