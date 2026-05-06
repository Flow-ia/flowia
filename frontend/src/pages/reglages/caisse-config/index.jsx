// Réglages > Caisse — sous-tabs : categories / qr.
// L'onglet 'categories' est etiquete "Prestations en boutique" pour distinguer
// clairement des prestations du site de reservation. La route reste 'categories'
// pour ne pas casser les liens existants.
import { useLocation, useNavigate } from 'react-router-dom';
import { SubTabs, PageHeader } from '../shared';
import Categories from './Categories';
import QR from './QR';

const SECTIONS = [
  { id: 'categories', label: 'Prestations en boutique', icon: 'tag' },
  { id: 'qr',         label: 'QR code',                 icon: 'qr'  },
];

export default function CaisseConfig(props) {
  const loc = useLocation();
  const navigate = useNavigate();
  const parts = loc.pathname.replace(/^\/reglages\/caisse-config\/?/, '').split('/').filter(Boolean);
  const section = SECTIONS.find(s => s.id === parts[0])?.id || 'categories';

  const setSection = (id) => navigate('/reglages/caisse-config/' + id);

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'18px 16px',
                  display:'flex', flexDirection:'column', gap:14 }}>
      <PageHeader backTo="/reglages" crumb="Réglages"
                  title="Caisse"
                  subtitle="Prestations en boutique et QR code inscription express"/>
      <SubTabs tabs={SECTIONS} active={section} onChange={setSection}/>

      {section === 'categories' && <Categories {...props}/>}
      {section === 'qr'         && <QR         {...props}/>}
    </div>
  );
}
