import FideliteAccordion from '../components/FideliteAccordion';
import TabLoyalty from './TabLoyalty';
import TabBirthday from './TabBirthday';
import TabReferral from './TabReferral';

// Agrège Programme fidélité + Anniv + Parrainage
// (onboarding.md : page unique avec accordéons fermés par défaut)
export default function TabFidelite({ theme, showToast }) {
  return (
    <div className="space-y-4">
      <FideliteAccordion theme={theme} title="💎 Programme de fidélité (tampons / points)">
        <TabLoyalty theme={theme} />
      </FideliteAccordion>
      <FideliteAccordion theme={theme} title="🎂 Offres anniversaire">
        <TabBirthday theme={theme} showToast={showToast} />
      </FideliteAccordion>
      <FideliteAccordion theme={theme} title="🤝 Programme de parrainage">
        <TabReferral theme={theme} showToast={showToast} />
      </FideliteAccordion>
    </div>
  );
}
