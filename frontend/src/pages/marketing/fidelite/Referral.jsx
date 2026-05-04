// Marketing > Parrainage — programme parrain/filleul (caps percent ≤ 100,
// fixed ≤ 500€, limit_count ≤ 10 000). Phrase dynamique, historique uses.
import TabReferral from '../../settings/marketing/fidelite/TabReferral';
import PlanGateBanner from '../../../components/PlanGateBanner';

export default function Referral({ theme, showToast }) {
  return (
    <>
      <PlanGateBanner requiredPlan="essentiel"
                      feature="Le programme de parrainage"
                      extraBenefits="SMS clients, fidélité et IA marketing"/>
      <TabReferral theme={theme} showToast={showToast}/>
    </>
  );
}
