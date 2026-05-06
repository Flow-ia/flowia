// Réglages > Réservation en ligne > Prestations (services publics + image 5Mo).
// L'encart d'aiguillage rappelle au commerçant que ce catalogue est distinct
// de celui de la caisse en boutique (prix/durée/nom peuvent diverger).
import BookingServices from '../../settings/categories/components/BookingServices';
import { CrossLinkBanner } from '../shared';

export default function Prestations({ theme, showToast }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <CrossLinkBanner
        to="/reglages/caisse-config/categories"
        color="#8b5cf6"
        label="Catalogue page de réservation uniquement"
        hint="Pour les prestations encaissées en boutique, voir Caisse."/>
      <BookingServices theme={theme} showToast={showToast}/>
    </div>
  );
}
