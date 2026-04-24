// Marketing > IA > Historique des campagnes IA appliquées (campaignsApi.ai-history).
// TabMarketingIA rend déjà l'historique en bas de la page Suggestions. Pour
// ne pas dupliquer la logique, on rend le même composant : l'utilisateur
// reste sur la même vue. Une scission dédiée pourra arriver au commit 14.
import TabMarketingIA from '../../settings/marketing/ia/TabMarketingIA';

export default function History({ theme, showToast, onGoToSolde }) {
  return <TabMarketingIA theme={theme} showToast={showToast} onGoToSolde={onGoToSolde}/>;
}
