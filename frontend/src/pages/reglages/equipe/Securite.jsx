// Réglages > Équipe > Sécurité (NOUVEAU commit 4).
// Consomme userSettingsApi (commit 2) : mode tablette partagée, timeout
// session employé, lock on tab close, seuil SMS bas. Prépare le commit 11
// (activation complète du mode tablette). L'update passe par adminRequest
// (x-pin-session requis) côté back.
import { useEffect, useState } from 'react';
import { userSettingsApi } from '../../../utils/api';
import { Icon } from '../../../components/Icon';

const CARD = (t) => ({
  padding: 16, borderRadius: 12, background: t.card,
  border: `0.5px solid ${t.border}`,
  display: 'flex', flexDirection: 'column', gap: 12,
});

const LABEL = (t) => ({ fontSize: 12, fontWeight: 500, color: t.muted, marginBottom: 4 });
const INPUT = (t) => ({
  width: '100%', padding: '9px 12px', borderRadius: 8,
  background: t.inputBg, border: `0.5px solid ${t.borderInput}`,
  color: t.text, fontSize: 14, fontFamily: 'inherit',
  boxSizing: 'border-box', outline: 'none',
});

function Row({ theme: t, title, desc, children }) {
  return (
    <div style={{ display:'flex', gap:12, padding:'12px 0',
                  borderBottom:`0.5px solid ${t.separator}` }}>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>{title}</p>
        {desc && <p style={{ margin:'3px 0 0', fontSize:11, color:t.muted, lineHeight:1.5 }}>{desc}</p>}
      </div>
      <div style={{ flexShrink:0 }}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange, theme: t }) {
  return (
    <button onClick={() => onChange(!value)}
            style={{ width:42, height:24, borderRadius:99, border:'none', cursor:'pointer',
                     background: value ? '#10b981' : t.borderInput,
                     position:'relative', transition:'background 0.15s',
                     fontFamily:'inherit' }}>
      <span style={{ position:'absolute', top:2, left: value ? 20 : 2,
                     width:20, height:20, borderRadius:99, background:'#fff',
                     transition:'left 0.15s', boxShadow:'0 1px 2px rgba(0,0,0,0.1)' }}/>
    </button>
  );
}

export default function Securite({ theme, showToast }) {
  const t = theme;
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState({
    tablet_mode_enabled: false,
    employee_session_timeout_min: 15,
    lock_on_tab_close: true,
    sms_low_balance_threshold: 20,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    userSettingsApi.get()
      .then(s => {
        setState({
          tablet_mode_enabled:          !!s.tablet_mode_enabled,
          employee_session_timeout_min: Number(s.employee_session_timeout_min ?? 15),
          lock_on_tab_close:            s.lock_on_tab_close !== false,
          sms_low_balance_threshold:    Number(s.sms_low_balance_threshold ?? 20),
        });
        setLoaded(true);
      })
      .catch(e => {
        setLoaded(true);
        if (showToast) showToast(e.message || 'Erreur chargement', 'error');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        tablet_mode_enabled: state.tablet_mode_enabled,
        employee_session_timeout_min: Math.max(1, Math.min(180,
          parseInt(state.employee_session_timeout_min, 10) || 15)),
        lock_on_tab_close: state.lock_on_tab_close,
        sms_low_balance_threshold: Math.max(0, Math.min(10000,
          parseFloat(state.sms_low_balance_threshold) || 0)),
      };
      const r = await userSettingsApi.update(payload);
      setState(s => ({
        ...s,
        tablet_mode_enabled:          !!r.tablet_mode_enabled,
        employee_session_timeout_min: Number(r.employee_session_timeout_min),
        lock_on_tab_close:            r.lock_on_tab_close !== false,
        sms_low_balance_threshold:    Number(r.sms_low_balance_threshold),
      }));
      if (showToast) showToast('Préférences enregistrées', 'ok');
    } catch (e) {
      if (showToast) showToast(e.message || 'Erreur enregistrement', 'error');
    } finally { setBusy(false); }
  };

  if (!loaded) {
    return (
      <div style={{ padding:48, textAlign:'center' }}>
        <svg className="animate-spin" width="26" height="26" viewBox="0 0 24 24"
             style={{ color:t.text, display:'inline-block' }}>
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
          <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
    );
  }

  return (
    <div style={CARD(t)}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:36, height:36, borderRadius:8,
                      background:'#eef2ff', color:'#4338ca',
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon name="lock" size={16} color="#4338ca"/>
        </div>
        <div>
          <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>{"Sécurité équipe"}</p>
          <p style={{ margin:0, fontSize:11, color:t.muted }}>
            {"Mode tablette, session employé, seuil SMS"}
          </p>
        </div>
      </div>

      <div>
        <Row theme={t}
             title="Mode tablette partagée"
             desc="Sidebar neutre 3 items et PIN exigé à chaque action sensible. Active le workflow tablette au salon (commit 11).">
          <Toggle value={state.tablet_mode_enabled} theme={t}
                  onChange={v => setState(s => ({ ...s, tablet_mode_enabled: v }))}/>
        </Row>

        <Row theme={t}
             title="Durée de session employé (minutes)"
             desc="Timeout côté UI après bascule admin. Borné 1 à 180 min côté back.">
          <input type="number" min="1" max="180"
                 value={state.employee_session_timeout_min}
                 onChange={e => setState(s => ({ ...s, employee_session_timeout_min: e.target.value }))}
                 style={{ ...INPUT(t), width:90, textAlign:'right' }}/>
        </Row>

        <Row theme={t}
             title="Verrouiller à la fermeture d'onglet"
             desc="Purge les sessions PIN dès que la tablette est rangée (beforeunload).">
          <Toggle value={state.lock_on_tab_close} theme={t}
                  onChange={v => setState(s => ({ ...s, lock_on_tab_close: v }))}/>
        </Row>

        <Row theme={t}
             title="Seuil SMS bas (€)"
             desc="Alerte sur le dashboard quand le solde SMS passe sous ce montant.">
          <input type="number" min="0" max="10000" step="1"
                 value={state.sms_low_balance_threshold}
                 onChange={e => setState(s => ({ ...s, sms_low_balance_threshold: e.target.value }))}
                 style={{ ...INPUT(t), width:110, textAlign:'right' }}/>
        </Row>
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', paddingTop:4 }}>
        <button onClick={save} disabled={busy}
                style={{ padding:'10px 16px', borderRadius:8, border:'none',
                         background: busy ? t.cardAlt : t.text, color: busy ? t.muted : t.bg,
                         cursor: busy ? 'wait' : 'pointer',
                         fontSize:13, fontWeight:500, fontFamily:'inherit' }}>
          {busy ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>

      <p style={{ margin:0, fontSize:10, color:t.muted }}>
        {"La sauvegarde exige une session PIN admin active."}
      </p>
    </div>
  );
}
