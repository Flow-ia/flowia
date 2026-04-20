import { useNavigate, useLocation } from 'react-router-dom';
import { I } from '../../../utils/icons';
import TabEmployees from './tabs/TabEmployees';
import TabHorairesEmployes from './tabs/TabHorairesEmployes';
import TabAbsences from './tabs/TabAbsences';
import TabCommissions from './tabs/TabCommissions';

export default function TabEquipe({ employees, transactions, onAdd, onUpd, onDel, onPatchEmp, showToast, theme }) {
  const isDark = theme.mode === 'dark';
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
    { id: 'team',        label: "Équipe",               icon: I.Users },
    { id: 'horaires',    label: 'Horaires',              icon: I.Clock },
    { id: 'absences',    label: 'Absences',              icon: I.Calendar },
    { id: 'commissions', label: 'Commissions',           icon: I.Award },
  ];

  return (
    <div className="space-y-4">
      <div style={{ display:'flex', gap:6, background:theme.inputBg, borderRadius:16, padding:4, border:`1px solid ${theme.border}` }}>
        {SUB_TABS.map(({ id, label, icon: Ic }) => {
          const active = sub === id;
          return (
            <button key={id} onClick={() => setSub(id)}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                padding:'9px 8px', borderRadius:12, border:'none', cursor:'pointer', transition:'all .15s',
                background: active ? (isDark ? 'rgba(17,24,39,0.25)' : '#fff') : 'transparent',
                color: active ? (isDark?'#e6edf3':'#111827') : theme.muted,
                fontWeight: active ? 800 : 600, fontSize:13,
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
              <Ic style={{ width:15, height:15 }} />
              {label}
            </button>
          );
        })}
      </div>

      {sub === 'team'        && <TabEmployees employees={employees} transactions={transactions} onAdd={onAdd} onUpd={onUpd} onDel={onDel} onPatchEmp={onPatchEmp} showToast={showToast} theme={theme} />}
      {sub === 'horaires'    && <TabHorairesEmployes employees={employees} theme={theme} showToast={showToast} />}
      {sub === 'absences'    && <TabAbsences employees={employees} theme={theme} />}
      {sub === 'commissions' && <TabCommissions employees={employees} theme={theme} />}
    </div>
  );
}
