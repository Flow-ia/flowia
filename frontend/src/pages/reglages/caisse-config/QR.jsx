// Réglages > Caisse · Config > QR code (/j/:slug → inscription express).
import QRCard from '../../settings/QRCard';

export default function QR({ theme, showToast }) {
  return <QRCard theme={theme} showToast={showToast}/>;
}
