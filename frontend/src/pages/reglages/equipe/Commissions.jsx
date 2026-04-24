// Réglages > Équipe > Commissions (par employé/service/catégorie).
import TabCommissions from '../../settings/equipe/tabs/TabCommissions';

export default function Commissions({ employees, theme }) {
  return <TabCommissions employees={employees} theme={theme}/>;
}
