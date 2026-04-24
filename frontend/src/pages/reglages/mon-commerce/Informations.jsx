// Réglages > Mon commerce > Informations — wrapper sur MerchantInfoCard existant.
import MerchantInfoCard from '../../settings/MerchantInfoCard';

export default function Informations({ theme, showToast }) {
  return <MerchantInfoCard theme={theme} showToast={showToast}/>;
}
