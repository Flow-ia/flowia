import { useState, useEffect } from 'react';
import { bookingApi } from '../../utils/api';
import { I } from '../../utils/icons';
import { ConfigTab } from '../Agenda';

// Wrapper : rend la config du site de réservation (ConfigTab d'Agenda.jsx)
// dans un accordéon fermé par défaut, pour laisser la place aux catégories/services.
export default function TabBookingConfig({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const [open, setOpen]         = useState(false);
  const [settings, setSettings] = useState(null);
  const [hours, setHours]       = useState([]);
  const [loaded, setLoaded]     = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    Promise.all([bookingApi.getSettings(), bookingApi.getHours()])
      .then(([s, h]) => {
        // getSettings retourne { settings: {...} } — cf. Agenda.jsx:1840
        setSettings(s?.settings || null);
        setHours(Array.isArray(h) ? h : []);
        setLoaded(true);
      })
      .catch(() => { setLoaded(true); showToast('Erreur chargement configuration', 'error'); });
  }, [open, loaded, showToast]);

  const onSaved = (s, h) => { setSettings(s); setHours(h); };

  const isActive = settings?.is_enabled;

  return (
    <div style={{ borderRadius:16, overflow:'hidden', background:theme.card, border:`1px solid ${theme.border}` }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
          padding:'12px 14px', border:'none', cursor:'pointer', textAlign:'left',
          background: isDark?'rgba(255,255,255,0.025)':'rgba(0,0,0,0.018)' }}>
        <div style={{ width:32, height:32, borderRadius:10, flexShrink:0,
          background:'rgba(99,102,241,0.12)', color:'#6366f1',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <I.Settings style={{ width:15, height:15 }} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:13, fontWeight:800, color:theme.text }}>Config site de réservation</p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>
            Adresse de page, horaires, pauses, délai d'annulation
            {loaded && (isActive ? ' · 🟢 en ligne' : ' · 🔴 désactivé')}
          </p>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke={theme.muted} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ width:14, height:14, flexShrink:0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform .2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{ padding:12, borderTop:`1px solid ${theme.border}` }}>
          {!loaded ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
              <div style={{ width:28, height:28, borderRadius:99,
                border:'2px solid rgba(17,24,39,0.2)', borderTopColor:'#111827',
                animation:'spin 0.8s linear infinite' }}/>
            </div>
          ) : (
            <ConfigTab
              settings={settings}
              hours={hours}
              onSaved={onSaved}
              showToast={showToast}
              theme={theme}
            />
          )}
        </div>
      )}
    </div>
  );
}
