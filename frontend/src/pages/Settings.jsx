import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { I } from '../utils/icons';
import { Toast, useToast } from '../components/UI';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import Agenda from './Agenda';
import TabStats from './settings/TabStats';
import TabHistorique from './settings/TabHistorique';
import TabEquipe from './settings/TabEquipe';
import TabCategories from './settings/TabCategories';
import TabMarketing from './settings/TabMarketing';
import TabClients from './settings/TabClients';
import TabNotifs from './settings/TabNotifs';
import TabExport from './settings/TabExport';
import TabPrevisions from './settings/TabPrevisions';
import TabHeures from './settings/TabHeures';
import TabCompte from './settings/TabCompte';

export default function Settings({ transactions, employees, categories, onAddCat, onUpdCat, onDelCat, onReorderCat, onAddEmp, onUpdEmp, onDelEmp, onPatchEmp, onUpdTx, onDelTx, onLock }) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const [t, show] = useToast();
  const navigate  = useNavigate();
  const location  = useLocation();

  const URL_TO_TAB = {
    '':             'stats',
    'stats':        'stats',
    'ventes':       'stats',
    'agenda':       'agenda',
    'historique':   'transactions',
    'equipe':       'employees',
    'categories':   'categories',
    'profil':       'categories',   // legacy → redirigé vers /settings/categories/booking (Site de réservation)
    'marketing':    'marketing',
    'clients':      'clients',
    'export':       'export',
    'previsions':   'forecast',
    'heures':       'heatmap',
    'notifications':'notifications',
    'compte':       'account',
    'absences':     'employees',
    'commissions':  'employees',
    'horaires':     'employees',
  };

  const TAB_TO_URL = {
    'stats':        '/settings',
    'agenda':       '/settings/agenda',
    'transactions': '/settings/historique',
    'employees':    '/settings/equipe',
    'categories':   '/settings/categories',
    'marketing':    '/settings/marketing',
    'clients':      '/settings/clients',
    'export':       '/settings/export',
    'forecast':     '/settings/previsions',
    'heatmap':      '/settings/heures',
    'notifications':'/settings/notifications',
    'account':      '/settings/compte',
  };

  const pathSegments = location.pathname.replace(/^\/settings\/?/, '').split('/').filter(Boolean);
  const segment    = pathSegments[0] || '';
  // legacy : /settings/profil → /settings/categories/config (Images dans Config commerce)
  const subSegment = segment === 'profil' ? 'config' : (pathSegments[1] || '');
  const tab = URL_TO_TAB[segment] ?? 'stats';

  // Redirection URL legacy :
  // /settings/profil           → /settings/categories/config   (Images)
  // /settings/agenda/config    → /settings/categories/config   (Config site)
  useEffect(() => {
    if (segment === 'profil') navigate('/settings/categories/config', { replace: true });
    if (segment === 'agenda' && pathSegments[1] === 'config') {
      navigate('/settings/categories/config', { replace: true });
    }
  }, [segment, pathSegments, navigate]);

  const setTab = (id) => navigate(TAB_TO_URL[id] || '/settings', { replace: false });

  const TABS = [
    { id: 'stats',        label: 'Stats',      icon: I.BarCh },
    { id: 'transactions', label: 'Historique', icon: I.Edit },
    { id: 'agenda',       label: 'Agenda',     icon: I.Calendar },
    { id: 'employees',    label: 'Équipe',     icon: I.Users },
    { id: 'categories',   label: 'Categories', icon: I.Tag },
    { id: 'marketing',    label: 'Marketing',  icon: I.Gift },
    { id: 'clients',      label: 'Clients',    icon: I.UserCheck },
    { id: 'notifications',label: 'Notifs',     icon: I.Bell },
    { id: 'export',       label: 'Export',     icon: I.Download },
    { id: 'forecast',     label: 'Previsions', icon: I.TrendUp },
    { id: 'heatmap',      label: 'Heures',     icon: I.Flame },
    { id: 'account',      label: 'Compte',     icon: I.User },
  ];

  return (
    <div className="min-h-screen pb-24 lg:pb-8" style={{ background: theme.bg }}>
      <Toast msg={t?.msg} type={t?.type} />

      {/* Refonte FDS-2026 commit 4 : cette interface Settings monolithique
          est conservée pendant la transition (anciennes URLs préservées).
          La nouvelle navigation est sur /reglages (4 pages thématiques). */}
      <div style={{ padding:'10px 16px', background:'#eef2ff',
                    borderBottom:`0.5px solid ${theme.border}`,
                    display:'flex', alignItems:'center', gap:10 }}>
        <p style={{ margin:0, fontSize:12, color:'#4338ca', flex:1 }}>
          {"Nouvelle interface disponible : utilisez Réglages pour gérer commerce, équipe, réservations et caisse."}
        </p>
        <button onClick={() => navigate('/reglages')}
                style={{ padding:'5px 10px', borderRadius:6, border:'none',
                         background:'#4338ca', color:'#fff', cursor:'pointer',
                         fontSize:11, fontWeight:500, fontFamily:'inherit',
                         flexShrink:0 }}>
          {"Ouvrir /reglages"}
        </button>
      </div>

      <div className="px-5 pt-12 pb-5" style={{ background: theme.headerGrad }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Admin</h1>
              <span className="text-[11px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1"
                style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80' }}>
                <I.Check className="w-3 h-3" /> Accès accordé
              </span>
            </div>
            <p className="text-sm" style={{ color: theme.muted }}>{user?.businessName}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={onLock} title="Verrouiller"
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
              style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', border: `1px solid ${theme.border}` }}>
              <I.LogOut className="w-5 h-5" style={{ color: theme.muted }} />
            </button>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10" style={{ background: theme.stickyBg, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${theme.border}` }}>
        <div className="flex max-w-screen-sm mx-auto overflow-x-auto">
          {TABS.map(({ id, label, icon: TabIcon }) => {
            const active = tab === id;
            const activeColor = isDark ? '#a5a0ff' : '#6c63ff';
            const inactiveColor = theme.muted;
            return (
              <button key={id} onClick={() => setTab(id)}
                className="flex-none flex flex-col items-center px-4 py-3 gap-0.5 text-[10px] font-bold min-w-max transition-all relative"
                style={{ color: active ? activeColor : inactiveColor }}>
                {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{ background: 'linear-gradient(90deg,#111827,#374151)' }} />}
                <TabIcon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-4 max-w-screen-sm mx-auto">
        {tab === 'stats'        && <TabStats transactions={transactions} employees={employees} categories={categories} theme={theme} />}
        {tab === 'agenda'       && <Agenda employees={employees} categories={categories} theme={theme} />}
        {tab === 'transactions' && <TabHistorique transactions={transactions} employees={employees} categories={categories} onUpdate={onUpdTx} onDelete={onDelTx} showToast={show} theme={theme} />}
        {tab === 'employees'    && <TabEquipe employees={employees} transactions={transactions} onAdd={onAddEmp} onUpd={onUpdEmp} onDel={onDelEmp} onPatchEmp={onPatchEmp} showToast={show} theme={theme} />}
        {tab === 'categories'   && <TabCategories categories={categories} transactions={transactions} onAdd={onAddCat} onUpd={onUpdCat} onDel={onDelCat} onReorder={onReorderCat} showToast={show} theme={theme} subSegment={subSegment} />}
        {tab === 'clients'      && <TabClients theme={theme} showToast={show} />}
        {tab === 'marketing'    && <TabMarketing theme={theme} showToast={show} />}
        {tab === 'export'       && <TabExport employees={employees} categories={categories} theme={theme} />}
        {tab === 'forecast'     && <TabPrevisions theme={theme} />}
        {tab === 'heatmap'      && <TabHeures theme={theme} />}
        {tab === 'notifications'&& <TabNotifs theme={theme} showToast={show} />}
        {tab === 'account'      && <TabCompte showToast={show} theme={theme} onLock={onLock} />}
      </div>
    </div>
  );
}
