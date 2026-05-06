// Réglages > Communication — refonte 2026-05-06.
// Notifications RDV/caisse extraites de "Réservations" pour clarifier la
// hiérarchie : tout ce qui concerne l'envoi de messages (rappels, recap,
// sons, push) vit ici. TabNotifs (settings/) inchangé, on l'enrobe juste.
import { PageHeader } from '../shared';
import TabNotifs from '../../settings/TabNotifs';

export default function Communication(props) {
  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'18px 16px',
                  display:'flex', flexDirection:'column', gap:14 }}>
      <PageHeader backTo="/reglages" crumb="Réglages"
                  title="Communication"
                  subtitle="Rappels SMS/email, recap quotidien, sons caisse et notifications push"/>
      <TabNotifs theme={props.theme} showToast={props.showToast}/>
    </div>
  );
}
