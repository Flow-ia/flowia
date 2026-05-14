// Marketing > Anniversaires — campagne automatique (cron 09:00, rolling 330j,
// quota Brevo 300/j). Paramètres (toggle, type remise, valeur, validité).
// Feature reservee au plan Equipe.
import TabBirthday from '../../settings/marketing/fidelite/TabBirthday';
import PlanGateBanner from '../../../components/PlanGateBanner';

export default function Birthday({ theme, showToast }) {
  return (
    <>
      <PlanGateBanner requiredPlan="equipe"
                      feature="Le cadeau anniversaire automatique"
                      extraBenefits="employés illimités et support dédié"/>
      <TabBirthday theme={theme} showToast={showToast}/>
    </>
  );
}
