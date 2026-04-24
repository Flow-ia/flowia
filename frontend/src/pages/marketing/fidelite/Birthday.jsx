// Marketing > Anniversaires — campagne automatique (cron 09:00, rolling 330j,
// quota Brevo 300/j). Paramètres (toggle, type remise, valeur, validité).
import TabBirthday from '../../settings/marketing/fidelite/TabBirthday';

export default function Birthday({ theme, showToast }) {
  return <TabBirthday theme={theme} showToast={showToast}/>;
}
