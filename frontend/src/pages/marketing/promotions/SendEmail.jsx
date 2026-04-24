// Marketing > Promotions > Envoi email groupé (promoApi.sendEmails).
// SendPromoEmailModal est déjà la modale de sélection clients + template
// ouverte depuis TabPromo. On rend le même TabPromo ici : le bouton
// « Envoyer par email » sur chaque ligne ouvre la modale. Préserve la
// cinématique existante sans duplication de logique (whitelist clients,
// quota Brevo 300/j).
import TabPromo from '../../settings/marketing/promotions/TabPromo';

export default function SendEmail({ theme, showToast }) {
  return <TabPromo theme={theme} showToast={showToast}/>;
}
