import { useNavigate } from 'react-router-dom';
import { I } from '../../../utils/icons';
import TabImages from '../TabImages';
import TabBookingConfig from '../TabBookingConfig';
import MerchantInfoCard from '../MerchantInfoCard';
import CaisseCategories from './components/CaisseCategories';
import BookingServices from './components/BookingServices';

// Onglet Categories (Settings) — 3 sous-onglets : caisse / booking / config
export default function TabCategories({ categories, transactions, onAdd, onUpd, onDel, onReorder, showToast, theme, subSegment }) {
  const t = theme;
  const navigate = useNavigate();
  const section = (subSegment === 'booking' || subSegment === 'config') ? subSegment : 'caisse';
  const setSection = (id) => navigate(`/settings/categories/${id}`, { replace: false });

  const SUB_TABS = [
    { id: 'caisse',  label: 'Caisse',              icon: I.Tag },
    { id: 'booking', label: 'Site de reservation', icon: I.Scissors },
    { id: 'config',  label: 'Config commerce',     icon: I.Settings },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', gap:4, padding:3, borderRadius:8,
                    background:t.cardAlt, overflowX:'auto' }}>
        {SUB_TABS.map(({ id, label, icon: Ic }) => {
          const active = section === id;
          return (
            <button key={id} onClick={() => setSection(id)}
                    style={{ flex:1, minWidth:'fit-content',
                             display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                             padding:'8px 12px', borderRadius:6, border:'none', cursor:'pointer',
                             transition:'all 0.15s',
                             background: active ? t.card : 'transparent',
                             color: active ? t.text : t.muted,
                             fontWeight: active ? 500 : 400,
                             fontSize:13, whiteSpace:'nowrap',
                             fontFamily:'inherit' }}>
              <Ic style={{ width:14, height:14 }}/>
              {label}
            </button>
          );
        })}
      </div>

      {section === 'caisse' && (
        <CaisseCategories
          categories={categories} transactions={transactions}
          onAdd={onAdd} onUpd={onUpd} onDel={onDel} onReorder={onReorder}
          showToast={showToast} theme={theme}/>
      )}
      {section === 'booking' && <BookingServices theme={theme} showToast={showToast}/>}
      {section === 'config' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <MerchantInfoCard theme={theme} showToast={showToast}/>
          <TabBookingConfig theme={theme} showToast={showToast}/>
          <TabImages theme={theme} showToast={showToast}/>
        </div>
      )}
    </div>
  );
}
