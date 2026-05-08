// Réglages > Réservations > Configuration.
//   1. BookingSlugCard    — edition de la partie nom du slug (lien public).
//                            Source unique de modification ; mon-commerce
//                            n'affiche qu'une version read-only avec copie.
//   2. TabBookingConfig   — délai mini, avance max, description, règles,
//                            horaires, pauses. Mode flat (sans accordéon parent).
import BookingSlugCard  from '../../settings/BookingSlugCard';
import TabBookingConfig from '../../settings/TabBookingConfig';

export default function Configuration({ theme, showToast }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <BookingSlugCard  theme={theme} showToast={showToast}/>
      <TabBookingConfig theme={theme} showToast={showToast} flat />
    </div>
  );
}
