// Réglages > Caisse · Config > Catégories (hiérarchie + drag-reorder).
import CaisseCategories from '../../settings/categories/components/CaisseCategories';

export default function Categories({ categories, transactions,
                                     onAddCat, onUpdCat, onDelCat, onReorderCat,
                                     showToast, theme }) {
  return (
    <CaisseCategories categories={categories} transactions={transactions}
                      onAdd={onAddCat} onUpd={onUpdCat} onDel={onDelCat} onReorder={onReorderCat}
                      showToast={showToast} theme={theme}/>
  );
}
