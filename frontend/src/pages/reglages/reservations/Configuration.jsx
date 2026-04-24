// Réglages > Réservations > Configuration (slug, advance_days, min_notice, etc.).
import TabBookingConfig from '../../settings/TabBookingConfig';

export default function Configuration({ theme, showToast }) {
  return <TabBookingConfig theme={theme} showToast={showToast}/>;
}
