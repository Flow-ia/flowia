// Reglages > Mon commerce > Informations.
//   1. MerchantInfoCard — nom, telephone, adresse, ville, CP, Google Business
//   2. BookingSlugCard  — edition de la partie nom du slug (nom-ville-CP)
import MerchantInfoCard from '../../settings/MerchantInfoCard';
import BookingSlugCard  from '../../settings/BookingSlugCard';

export default function Informations({ theme, showToast }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <MerchantInfoCard theme={theme} showToast={showToast}/>
      <BookingSlugCard  theme={theme} showToast={showToast}/>
    </div>
  );
}
