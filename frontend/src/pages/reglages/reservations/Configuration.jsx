// Réglages > Réservations > Configuration (slug, advance_days, min_notice, etc.).
// Mode flat : ConfigTab affiche directement, sans wrapper accordeon parent.
// Les sections internes (Description, Regles, Horaires, Pauses) restent
// chacune dans leur propre accordeon (ferme par defaut).
import TabBookingConfig from '../../settings/TabBookingConfig';

export default function Configuration({ theme, showToast }) {
  return <TabBookingConfig theme={theme} showToast={showToast} flat />;
}
