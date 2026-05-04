// Marketing > Fidélité — programme tampons/points (caps 100/100/500/100/3650/10000).
// Caps métier enforced dans le backend (routes/loyalty.js + utils/loyalty-utils.js)
// et dans le composant TabLoyalty existant. Zéro refactor.
import TabLoyalty from '../../settings/marketing/fidelite/TabLoyalty';
import PlanGateBanner from '../../../components/PlanGateBanner';

export default function Loyalty({ theme }) {
  return (
    <>
      <PlanGateBanner requiredPlan="essentiel"
                      feature="Le programme fidélité"
                      extraBenefits="SMS clients, parrainage et IA marketing"/>
      <TabLoyalty theme={theme}/>
    </>
  );
}
