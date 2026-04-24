// Marketing > Parrainage — programme parrain/filleul (caps percent ≤ 100,
// fixed ≤ 500€, limit_count ≤ 10 000). Phrase dynamique, historique uses.
import TabReferral from '../../settings/marketing/fidelite/TabReferral';

export default function Referral({ theme, showToast }) {
  return <TabReferral theme={theme} showToast={showToast}/>;
}
