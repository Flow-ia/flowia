// Marketing > Promotions > Liste des codes (actifs/expirés/auto-générés).
// TabPromo gère liste + modale création (PromoForm) + modale envoi email
// (SendPromoEmailModal). On garde tout dans le même composant : pas de
// refactor, PromoForm reste ouvert via le bouton « Ajouter un code ».
import TabPromo from '../../settings/marketing/promotions/TabPromo';

export default function List({ theme, showToast }) {
  return <TabPromo theme={theme} showToast={showToast}/>;
}
