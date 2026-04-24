// Marketing > SMS > Solde + consommation + bouton Recharger.
// TabSMS monte aussi SMSRechargeModal (nouvelle carte + save / carte
// enregistrée off_session / automatic_payment_methods). Ne pas toucher
// au webhook Stripe (commit sensible, cf. regles-absolues.md §5).
import TabSMS from '../../settings/marketing/solde/TabSMS';

export default function Solde({ theme, showToast }) {
  return <TabSMS theme={theme} showToast={showToast}/>;
}
