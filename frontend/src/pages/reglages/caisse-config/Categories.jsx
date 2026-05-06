// Réglages > Caisse > Prestations en boutique (hiérarchie + drag-reorder).
// L'encart d'aiguillage rappelle au commerçant que ce catalogue est distinct
// de celui des réservations en ligne (prix/durée/nom peuvent diverger).
import CaisseCategories from '../../settings/categories/components/CaisseCategories';
import { CrossLinkBanner } from '../shared';

export default function Categories({ categories, transactions,
                                     onAddCat, onUpdCat, onDelCat, onReorderCat,
                                     showToast, theme }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <CrossLinkBanner
        to="/reglages/reservations/prestations"
        color="#3b82f6"
        label="Catalogue boutique uniquement"
        hint="Pour les prestations réservables sur votre site, voir Réservation en ligne."/>
      <CaisseCategories categories={categories} transactions={transactions}
                        onAdd={onAddCat} onUpd={onUpdCat} onDel={onDelCat} onReorder={onReorderCat}
                        showToast={showToast} theme={theme}/>
    </div>
  );
}
