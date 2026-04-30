// Réglages > Mon commerce — sous-tabs : informations / photos / compte.
// Note historique : l'onglet 'horaires' rendait exactement le meme composant
// (TabBookingConfig) que /reglages/reservations/configuration. Doublon
// supprime — la config horaires/pauses vit desormais sous Reservations
// uniquement (logique : meme source de verite, meme save). On redirige
// l'ancien lien pour preserver les bookmarks et raccourcis.
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SubTabs, PageHeader } from '../shared';
import Informations from './Informations';
import Photos from './Photos';
import Compte from './Compte';

const SECTIONS = [
  { id: 'informations', label: 'Informations', icon: 'storefront' },
  { id: 'photos',       label: 'Photos',       icon: 'image'      },
  { id: 'compte',       label: 'Compte',       icon: 'lock'       },
];

export default function MonCommerce(props) {
  const loc = useLocation();
  const navigate = useNavigate();
  const parts = loc.pathname.replace(/^\/reglages\/mon-commerce\/?/, '').split('/').filter(Boolean);

  // Retro-compat : ancienne URL /reglages/mon-commerce/horaires
  // -> /reglages/reservations/configuration (la section Horaires d'ouverture
  // y est presente comme accordeon).
  useEffect(() => {
    if (parts[0] === 'horaires') {
      navigate('/reglages/reservations/configuration', { replace: true });
    }
  }, [parts, navigate]);

  const section = SECTIONS.find(s => s.id === parts[0])?.id || 'informations';

  const setSection = (id) => navigate('/reglages/mon-commerce/' + id);

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'18px 16px',
                  display:'flex', flexDirection:'column', gap:14 }}>
      <PageHeader backTo="/reglages" crumb="Réglages"
                  title="Mon commerce"
                  subtitle="Identité du salon, photos, compte"/>
      <SubTabs tabs={SECTIONS} active={section} onChange={setSection}/>

      {section === 'informations' && <Informations {...props}/>}
      {section === 'photos'       && <Photos       {...props}/>}
      {section === 'compte'       && <Compte       {...props}/>}
    </div>
  );
}
