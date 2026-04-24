// Marketing > SMS > Recharge Stripe (3 modes dans SMSRechargeModal).
// Pas d'écran standalone aujourd'hui : TabSMS contient le bouton
// « Recharger » qui ouvre la modale. Idempotency via UNIQUE(sumup_checkout_id)
// côté back (routes/payments.js). Refund auto sur échec.
import TabSMS from '../../settings/marketing/solde/TabSMS';

export default function Recharger({ theme, showToast }) {
  return <TabSMS theme={theme} showToast={showToast}/>;
}
