import { useState, useEffect } from 'react';
import { bookingApi } from '../../utils/api';
import { I } from '../../utils/icons';
import { ConfigTab } from '../Agenda';
import { StatusBadge } from '../../components/primitives';

// Wrapper : rend la config du site de reservation (ConfigTab d'Agenda.jsx).
//
// Deux modes :
//   - flat=false (defaut) : accordeon ferme avec header "Config site de
//     reservation" + status badge. Utilise dans la page Categories ou
//     plusieurs sections coexistent et il faut economiser la place.
//   - flat=true : pas de wrapper, charge au mount, rend ConfigTab direct.
//     Utilise sur la page dediee /reglages/reservations/configuration ou
//     les sections internes de ConfigTab sont elles-memes en accordeons.
export default function TabBookingConfig({ theme, showToast, flat = false }) {
  const t = theme;
  const [open, setOpen]         = useState(false);
  const [settings, setSettings] = useState(null);
  const [hours, setHours]       = useState([]);
  const [loaded, setLoaded]     = useState(false);

  // En mode flat, on charge tout de suite. En mode accordeon, on attend
  // l'ouverture pour eviter un appel reseau si le commercant n'ouvre jamais.
  useEffect(() => {
    if (!flat && !open) return;
    if (loaded) return;
    Promise.all([bookingApi.getSettings(), bookingApi.getHours()])
      .then(([s, h]) => {
        setSettings(s?.settings || null);
        setHours(Array.isArray(h) ? h : []);
        setLoaded(true);
      })
      .catch(() => { setLoaded(true); showToast('Erreur chargement configuration', 'error'); });
  }, [flat, open, loaded, showToast]);

  const onSaved = (s, h) => { setSettings(s); setHours(h); };

  const Loader = () => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
      <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24"
           style={{ color:t.text }}>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
        <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  );

  // Mode plat : ConfigTab directement, sans wrapper carte ni header parent.
  // Les sections internes (Description, Regles, Horaires, Pauses) sont
  // elles-memes des accordeons dans ConfigTab.
  if (flat) {
    if (!loaded) return <Loader />;
    return (
      <ConfigTab
        settings={settings}
        hours={hours}
        onSaved={onSaved}
        showToast={showToast}
        theme={theme}
      />
    );
  }

  const isActive = settings?.is_enabled;

  return (
    <div style={{ borderRadius:12, overflow:'hidden',
                  background:t.card, border:`0.5px solid ${t.border}` }}>
      <button type="button" onClick={() => setOpen(o => !o)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                       padding:'12px 14px', border:'none', cursor:'pointer', textAlign:'left',
                       background:t.cardAlt, fontFamily:'inherit' }}>
        <div style={{ width:32, height:32, borderRadius:8, flexShrink:0,
                      background:'#eef2ff', color:'#4338ca',
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
          <I.Settings style={{ width:15, height:15 }}/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>
            Config site de reservation
          </p>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:2 }}>
            <p style={{ margin:0, fontSize:11, color:t.muted }}>
              {"Adresse de page, horaires, pauses, delai d'annulation"}
            </p>
            {loaded && (
              <StatusBadge status={isActive ? 'success' : 'danger'}
                           label={isActive ? 'en ligne' : 'desactive'}/>
            )}
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round"
             style={{ width:14, height:14, flexShrink:0,
                      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition:'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{ padding:12, borderTop:`0.5px solid ${t.separator}` }}>
          {!loaded ? <Loader /> : (
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
