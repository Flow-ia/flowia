// Marketing > SMS > Historique sms_transactions (recharge/refund/débit).
// Déjà rendu dans TabSMS (sms_transactions + message_log). Préserve le
// prix SMS ≈ 0,0585 € (SMS_COST × (1 + SMS_MARGIN/100)).
import TabSMS from '../../settings/marketing/solde/TabSMS';

export default function Historique({ theme, showToast }) {
  return <TabSMS theme={theme} showToast={showToast}/>;
}
