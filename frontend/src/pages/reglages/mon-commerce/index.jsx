// Réglages > Mon commerce — sous-tabs : informations / photos / compte / securite.
//
// Notes historiques :
// - 'horaires' a ete supprime : il rendait le meme TabBookingConfig que
//   /reglages/reservations/configuration. La config horaires/pauses vit
//   maintenant uniquement sous Reservations.
// - 'securite' a ete deplace depuis Equipe (commit nettoyage) : PIN admin,
//   mode tablette, durees de session, mode veille concernent l'identite
//   et l'acces global du commerce, pas l'equipe stricto sensu. Le fichier
//   Securite.jsx reste identique, on a juste deplace le fichier.
// Anciens liens rediriges vers les nouvelles routes.
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SubTabs, PageHeader } from '../shared';
import Informations from './Informations';
import Photos from './Photos';
import Compte from './Compte';
import Securite from './Securite';

const SECTIONS = [
  { id: 'informations', label: 'Informations', icon: 'storefront' },
  { id: 'photos',       label: 'Photos',       icon: 'image'      },
  { id: 'compte',       label: 'Compte',       icon: 'lock'       },
  { id: 'securite',     label: 'Sécurité',     icon: 'lock'       },
];

export default function MonCommerce(props) {
  const loc = useLocation();
  const navigate = useNavigate();
  const parts = loc.pathname.replace(/^\/reglages\/mon-commerce\/?/, '').split('/').filter(Boolean);

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
                  subtitle="Identité du salon, photos, compte, sécurité"/>
      <SubTabs tabs={SECTIONS} active={section} onChange={setSection}/>

      {section === 'informations' && <Informations {...props}/>}
      {section === 'photos'       && <Photos       {...props}/>}
      {section === 'compte'       && <Compte       {...props}/>}
      {section === 'securite'     && <Securite     {...props}/>}
    </div>
  );
}
