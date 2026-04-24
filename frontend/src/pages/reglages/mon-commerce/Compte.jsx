// Réglages > Mon commerce > Compte (email, password, PIN admin, RGPD, verrouiller).
import TabCompte from '../../settings/TabCompte';

export default function Compte({ theme, showToast, onLock }) {
  return <TabCompte theme={theme} showToast={showToast} onLock={onLock}/>;
}
