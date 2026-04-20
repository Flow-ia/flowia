import { useNavigate } from 'react-router-dom';
import { I } from '../../../utils/icons';
import TabImages from '../TabImages';
import TabBookingConfig from '../TabBookingConfig';
import MerchantInfoCard from '../MerchantInfoCard';
import CaisseCategories from './components/CaisseCategories';
import BookingServices from './components/BookingServices';

// Onglet Categories (Settings) — 3 sous-onglets : caisse / booking / config
export default function TabCategories({ categories, transactions, onAdd, onUpd, onDel, onReorder, showToast, theme, subSegment }) {
  const isDark = theme.mode === 'dark';
  const navigate = useNavigate();
  // URL-driven : /settings/categories/{caisse|booking|config}
  const section = (subSegment === 'booking' || subSegment === 'config') ? subSegment : 'caisse';
  const setSection = (id) => navigate(`/settings/categories/${id}`, { replace: false });

  const SUB_TABS = [
    { id: 'caisse',  label: 'Caisse',              icon: I.Tag },
    { id: 'booking', label: 'Site de reservation', icon: I.Scissors },
    { id: 'config',  label: 'Config commerce',     icon: I.Settings },
  ];

  return (
    <div className="space-y-4">
      <div style={{ display:'flex', gap:6, background:theme.inputBg, borderRadius:16, padding:4,
        border:`1px solid ${theme.border}`, overflowX:'auto' }}>
        {SUB_TABS.map(({ id, label, icon: Ic }) => {
          const active = section === id;
          return (
            <button key={id} onClick={() => setSection(id)}
              style={{ flex:1, minWidth:'fit-content',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                padding:'9px 8px', borderRadius:12, border:'none', cursor:'pointer', transition:'all .15s',
                background: active ? (isDark ? 'rgba(17,24,39,0.25)' : '#fff') : 'transparent',
                color: active ? (isDark?'#e6edf3':'#111827') : theme.muted,
                fontWeight: active ? 800 : 600, fontSize:13,
                whiteSpace:'nowrap',
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
              <Ic style={{ width:15, height:15 }} />
              {label}
            </button>
          );
        })}
      </div>

      {section === 'caisse'  && (
        <CaisseCategories
          categories={categories}
          transactions={transactions}
          onAdd={onAdd}
          onUpd={onUpd}
          onDel={onDel}
          onReorder={onReorder}
          showToast={showToast}
          theme={theme}
        />
      )}
      {section === 'booking' && (
        <BookingServices theme={theme} showToast={showToast} />
      )}
      {section === 'config' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <MerchantInfoCard theme={theme} showToast={showToast} />
          <TabBookingConfig theme={theme} showToast={showToast} />
          <TabImages theme={theme} showToast={showToast} />
        </div>
      )}
    </div>
  );
}
