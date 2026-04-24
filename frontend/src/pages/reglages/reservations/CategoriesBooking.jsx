// Réglages > Réservations > Catégories booking.
// Les catégories booking et les prestations vivent aujourd'hui dans un seul
// composant BookingServices (pages/settings/categories/components/) qui gère
// les deux listes ensemble. On réutilise ce même composant ici pour ne pas
// scinder (refactor risqué). Une séparation dédiée pourra arriver au commit 14.
import BookingServices from '../../settings/categories/components/BookingServices';

export default function CategoriesBooking({ theme, showToast }) {
  return <BookingServices theme={theme} showToast={showToast}/>;
}
