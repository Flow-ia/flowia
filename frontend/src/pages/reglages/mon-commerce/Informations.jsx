// Reglages > Mon commerce > Informations.
//   1. MerchantInfoCard      — nom, telephone, adresse, ville, CP, Google Business
//   2. BookingLinkReadOnly   — affichage du lien de reservation (lecture seule + copie).
//                              L'edition se fait UNIQUEMENT dans
//                              /reglages/reservations/configuration pour
//                              eviter le doublon.
import MerchantInfoCard    from '../../settings/MerchantInfoCard';
import BookingLinkReadOnly from '../../settings/BookingLinkReadOnly';

export default function Informations({ theme, showToast }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <MerchantInfoCard    theme={theme} showToast={showToast}/>
      <BookingLinkReadOnly theme={theme} showToast={showToast}/>
    </div>
  );
}
