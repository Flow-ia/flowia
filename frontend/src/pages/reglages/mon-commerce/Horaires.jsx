// Réglages > Mon commerce > Horaires commerce.
// Les horaires commerce (business_hours + breaks) vivent aujourd'hui dans
// TabBookingConfig (accordéon replié) puisque la page publique et
// l'agenda les partagent. On réutilise ce même composant pour éviter tout
// refactor. Une scission dédiée pourra arriver au commit 14 (polish).
import TabBookingConfig from '../../settings/TabBookingConfig';

export default function Horaires({ theme, showToast }) {
  return <TabBookingConfig theme={theme} showToast={showToast}/>;
}
