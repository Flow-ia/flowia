// Marketing > IA > Suggestions (campaignsApi.auto-plan).
// TabMarketingIA gère suggestions + historique dans un même composant,
// avec callback onGoToSolde pour naviguer vers la recharge SMS quand le
// solde est insuffisant. La prop est injectée depuis marketing/index.jsx.
import TabMarketingIA from '../../settings/marketing/ia/TabMarketingIA';
import PlanGateBanner from '../../../components/PlanGateBanner';

export default function Suggestions({ theme, showToast, onGoToSolde }) {
  return (
    <>
      <PlanGateBanner requiredPlan="essentiel"
                      feature="L'IA marketing"
                      extraBenefits="SMS clients, fidélité et parrainage"/>
      <TabMarketingIA theme={theme} showToast={showToast} onGoToSolde={onGoToSolde}/>
    </>
  );
}
