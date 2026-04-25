// Caisse > Historique — gate PinAccessModal + TabHistorique (stats jour
// + grille 4 paiements avec multi éclatés + liste ligne par ligne + edit/
// delete gated par pinAdminMiddleware côté back).
//
// Le gate PIN front (PinAccessModal) conserve l'UX de l'ancienne page
// /historique : un employé sans PIN ne voit pas le CA du jour. Si aucun
// employé actif, gate levé (cohérent avec Historique.jsx existant).
//
// BUG FIX commit 7c : TabHistorique fait transactions.filter() et
// categories.find() sans défaut — il crashe si une prop est undefined
// pendant le premier render (route atteinte avant data fetch dans App.jsx).
// On coerce tous les props en arrays à l'entrée du wrapper pour ne jamais
// propager un undefined au composant source (qui vit dans pages/settings/
// et n'est pas dans notre scope de modification).
import { useEffect, useRef, useState } from 'react';
import { PinAccessModal } from '../Dashboard';
import TabHistorique from '../settings/TabHistorique';

export default function Historique({
  transactions, employees, categories,
  onUpdTx, onDelTx, theme, showToast,
}) {
  // Coercion défensive : même si App.jsx peut passer undefined entre deux
  // renders (data loading, refresh forcé, etc.), TabHistorique reçoit
  // toujours des arrays valides pour ses .filter() / .find() / .map().
  const txs  = Array.isArray(transactions) ? transactions : [];
  const emps = Array.isArray(employees)    ? employees    : [];
  const cats = Array.isArray(categories)   ? categories   : [];

  const [unlocked, setUnlocked] = useState(false);
  const [pinOpen,  setPinOpen]  = useState(true);
  const successRef = useRef(false);

  // Si aucun employé actif, skip le gate (cohérent avec Historique.jsx legacy).
  useEffect(() => {
    if (emps.filter(e => e.is_active !== false).length === 0) {
      setUnlocked(true); setPinOpen(false);
    }
  }, [emps]);

  if (!unlocked) {
    // BUG FIX commit 7e : PinAccessModal fait employees.filter() et lit
    // theme.elevated/border/… — sans ces 2 props, page blanche + crash
    // « Cannot read properties of undefined (reading 'filter') » dès qu'on
    // navigue vers /caisse/historique avec au moins un employé actif.
    return (
      <PinAccessModal
        open={pinOpen}
        employees={emps}
        theme={theme}
        title="Acces historique"
        onSuccess={() => { successRef.current = true; setUnlocked(true); }}
        onClose={() => { if (!successRef.current) setPinOpen(false); }}
      />
    );
  }

  return (
    <TabHistorique
      transactions={txs}
      employees={emps}
      categories={cats}
      onUpdate={onUpdTx}
      onDelete={onDelTx}
      showToast={showToast}
      theme={theme}
    />
  );
}
