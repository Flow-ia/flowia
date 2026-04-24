// Caisse > Historique — gate PinAccessModal + TabHistorique (stats jour
// + grille 4 paiements avec multi éclatés + liste ligne par ligne + edit/
// delete gated par pinAdminMiddleware côté back).
//
// Le gate PIN front (PinAccessModal) conserve l'UX de l'ancienne page
// /historique : un employé sans PIN ne voit pas le CA du jour. Si aucun
// employé actif, gate levé (cohérent avec Historique.jsx existant).
import { useEffect, useRef, useState } from 'react';
import { PinAccessModal } from '../Dashboard';
import TabHistorique from '../settings/TabHistorique';

export default function Historique({ transactions, employees = [], categories,
                                     onUpdTx, onDelTx, theme, showToast }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pinOpen,  setPinOpen]  = useState(true);
  const successRef = useRef(false);

  // Si aucun employé actif, skip le gate (cohérent avec Historique.jsx legacy).
  useEffect(() => {
    if (employees.filter(e => e.is_active !== false).length === 0) {
      setUnlocked(true); setPinOpen(false);
    }
  }, [employees]);

  if (!unlocked) {
    return (
      <PinAccessModal
        open={pinOpen}
        title="Acces historique"
        subtitle="Entrez votre PIN pour consulter les ventes du jour"
        onSuccess={() => { successRef.current = true; setUnlocked(true); }}
        onClose={() => { if (!successRef.current) setPinOpen(false); }}
      />
    );
  }

  return (
    <TabHistorique
      transactions={transactions}
      employees={employees}
      categories={categories}
      onUpdate={onUpdTx}
      onDelete={onDelTx}
      showToast={showToast}
      theme={theme}
    />
  );
}
