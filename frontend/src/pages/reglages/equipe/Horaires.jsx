// Réglages > Équipe > Horaires par employé (surcharge business_hours + use_business_hours).
import TabHorairesEmployes from '../../settings/equipe/tabs/TabHorairesEmployes';

export default function Horaires({ employees, theme, showToast }) {
  return <TabHorairesEmployes employees={employees} theme={theme} showToast={showToast}/>;
}
