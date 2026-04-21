import { useNavigate, useLocation } from 'react-router-dom';
import { I } from '../../../utils/icons';
import TabEmployees from './tabs/TabEmployees';
import TabHorairesEmployes from './tabs/TabHorairesEmployes';
import TabAbsences from './tabs/TabAbsences';
import TabCommissions from './tabs/TabCommissions';

export default function TabEquipe({ employees, transactions, onAdd, onUpd, onDel, onPatchEmp, showToast, theme }) {
  const t = theme;
  const navigate = useNavigate();
  const location = useLocation();

  const segment = location.pathname.replace(/^\/settings\/?/, '').split('/')[0] || '';
  const sub = segment === 'absences'    ? 'absences'
            : segment === 'commissions' ? 'commissions'
            : segment === 'horaires'    ? 'horaires'
            : 'team';

  const setSub = (id) => {
    const target = id === 'absences'    ? '/settings/absences'
                 : id === 'commissions' ? '/settings/commissions'
                 : id === 'horaires'    ? '/settings/horaires'
                 : '/settings/equipe';
    navigate(target, { replace: false });
  };

  const SUB_TABS = [
    { id: 'team',        label: 'Equipe',      icon: I.Users },
    { id: 'horaires',    label: 'Horaires',    icon: I.Clock },
    { id: 'absences',    label: 'Absences',    icon: I.Calendar },
    { id: 'commissions', label: 'Commissions', icon: I.Award },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', gap:4, padding:3, borderRadius:8,
                    background:t.cardAlt }}>
        {SUB_TABS.map(({ id, label, icon: Ic }) => {
          const active = sub === id;
          return (
            <button key={id} onClick={() => setSub(id)}
                    style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                             padding:'8px 12px', borderRadius:6, border:'none', cursor:'pointer',
                             transition:'all 0.15s',
                             background: active ? t.card : 'transparent',
                             color: active ? t.text : t.muted,
                             fontWeight: active ? 500 : 400,
                             fontSize:13, fontFamily:'inherit' }}>
              <Ic style={{ width:14, height:14 }}/>
              {label}
            </button>
          );
        })}
      </div>

      {sub === 'team'        && <TabEmployees employees={employees} transactions={transactions} onAdd={onAdd} onUpd={onUpd} onDel={onDel} onPatchEmp={onPatchEmp} showToast={showToast} theme={theme}/>}
      {sub === 'horaires'    && <TabHorairesEmployes employees={employees} theme={theme} showToast={showToast}/>}
      {sub === 'absences'    && <TabAbsences employees={employees} theme={theme}/>}
      {sub === 'commissions' && <TabCommissions employees={employees} theme={theme}/>}
    </div>
  );
}
