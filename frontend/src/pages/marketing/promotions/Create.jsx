// Marketing > Promotions > Création code promo.
// PromoForm est une modale contrôlée par TabPromo : pas d'écran standalone
// dédié aujourd'hui. On rend le même TabPromo et l'utilisateur ouvre la
// modale via le bouton « Ajouter un code ». Une page de création dédiée
// pourra être extraite au commit 14 si besoin.
import TabPromo from '../../settings/marketing/promotions/TabPromo';

export default function Create({ theme, showToast }) {
  return <TabPromo theme={theme} showToast={showToast}/>;
}
