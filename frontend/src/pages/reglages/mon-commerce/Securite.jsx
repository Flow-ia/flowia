// Réglages > Équipe > Sécurité (NOUVEAU commit 4, étendu commit 31).
// Consomme userSettingsApi (commit 2) : mode tablette partagée, timeout
// session employé, lock on tab close, seuil SMS bas, durée session merchant
// (12h/24h/7d/30d/never), mode veille auto (désactivé/10/15/60/120/240 min).
// L'update passe par adminRequest (x-pin-session requis) côté back.
import { useEffect, useState } from 'react';
import { userSettingsApi } from '../../../utils/api';
import { Icon } from '../../../components/Icon';

const CARD = (t) => ({
  padding: 16, borderRadius: 12, background: t.card,
  border: `0.5px solid ${t.border}`,
  display: 'flex', flexDirection: 'column', gap: 12,
});

const INPUT = (t) => ({
  width: '100%', padding: '9px 12px', borderRadius: 8,
  background: t.inputBg, border: `0.5px solid ${t.borderInput}`,
  color: t.text, fontSize: 14, fontFamily: 'inherit',
  boxSizing: 'border-box', outline: 'none',
});

const SELECT = (t) => ({ ...INPUT(t), width: 180, textAlign: 'left', cursor: 'pointer' });

const SESSION_OPTIONS = [
  { value: '12h',   label: '12 heures' },
  { value: '24h',   label: '24 heures' },
  { value: '7d',    label: '1 semaine' },
  { value: '30d',   label: '1 mois' },
  { value: 'never', label: "Illimité (jusqu'à déconnexion manuelle)" },
];

const IDLE_OPTIONS = [
  { value: 0,   label: 'Désactivé' },
  { value: 10,  label: '10 minutes' },
  { value: 15,  label: '15 minutes' },
  { value: 60,  label: '1 heure' },
  { value: 120, label: '2 heures' },
  { value: 240, label: '4 heures' },
];

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
    merchant_session_duration: '7d',
    lock_screen_enabled: false,
    lock_screen_idle_minutes: 15,
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
          merchant_session_duration:    s.merchant_session_duration ?? '7d',
          lock_screen_enabled:          !!s.lock_screen_enabled,
          lock_screen_idle_minutes:     Number(s.lock_screen_idle_minutes ?? 15),
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
        merchant_session_duration: state.merchant_session_duration,
        lock_screen_enabled: state.lock_screen_enabled,
        lock_screen_idle_minutes: parseInt(state.lock_screen_idle_minutes, 10),
      };
      const r = await userSettingsApi.update(payload);
      setState(s => ({
        ...s,
        tablet_mode_enabled:          !!r.tablet_mode_enabled,
        employee_session_timeout_min: Number(r.employee_session_timeout_min),
        lock_on_tab_close:            r.lock_on_tab_close !== false,
        sms_low_balance_threshold:    Number(r.sms_low_balance_threshold),
        merchant_session_duration:    r.merchant_session_duration ?? '7d',
        lock_screen_enabled:          !!r.lock_screen_enabled,
        lock_screen_idle_minutes:     Number(r.lock_screen_idle_minutes ?? 15),
      }));
      if (showToast) showToast('Préférences enregistrées', 'ok');
      // Notifier l'app que les settings ont changé (le hook useIdleLock
      // recharge ses paramètres → la nouvelle durée d'inactivité s'applique
      // immédiatement sans rechargement de page).
      try { window.dispatchEvent(new CustomEvent('ff-user-settings-updated')); } catch {}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── Carte 1 : Session commerçant ───────────────────────────────────── */}
      <div style={CARD(t)}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:8,
                        background:'#eef2ff', color:'#4338ca',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Icon name="key" size={16} color="#4338ca"/>
          </div>
          <div>
            <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>{"Session commerçant"}</p>
            <p style={{ margin:0, fontSize:11, color:t.muted }}>
              {"Durée avant déconnexion automatique du compte commerçant"}
            </p>
          </div>
        </div>

        <Row theme={t}
             title="Durée de session"
             desc="S'applique à la prochaine connexion. Permet aux employés de garder l'application ouverte sans se reconnecter.">
          <select value={state.merchant_session_duration}
                  onChange={e => setState(s => ({ ...s, merchant_session_duration: e.target.value }))}
                  style={SELECT(t)}>
            {SESSION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Row>
      </div>

      {/* ── Carte 2 : Mode veille ──────────────────────────────────────────── */}
      <div style={CARD(t)}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:8,
                        background:'#fef3c7', color:'#92400e',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Icon name="lock" size={16} color="#92400e"/>
          </div>
          <div>
            <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>{"Mode veille"}</p>
            <p style={{ margin:0, fontSize:11, color:t.muted }}>
              {"Verrouille l'application après inactivité (déverrouillage par PIN employé ou admin)"}
            </p>
          </div>
        </div>

        <Row theme={t}
             title="Activer le mode veille"
             desc="Quand activé, l'application se verrouille après la durée d'inactivité choisie.">
          <Toggle value={state.lock_screen_enabled} theme={t}
                  onChange={v => setState(s => ({ ...s, lock_screen_enabled: v }))}/>
        </Row>

        <Row theme={t}
             title="Verrouiller après inactivité"
             desc="Aucune souris/clavier/clic pendant cette durée → mode veille. L'option « Désactivé » a le même effet que désactiver le mode veille.">
          <select value={state.lock_screen_idle_minutes}
                  onChange={e => setState(s => ({ ...s, lock_screen_idle_minutes: parseInt(e.target.value, 10) }))}
                  disabled={!state.lock_screen_enabled}
                  style={{
                    ...SELECT(t),
                    opacity: state.lock_screen_enabled ? 1 : 0.5,
                    cursor: state.lock_screen_enabled ? 'pointer' : 'not-allowed',
                  }}>
            {IDLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Row>
      </div>

      {/* ── Carte 3 : Sécurité équipe (existant) ───────────────────────────── */}
      <div style={CARD(t)}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:8,
                        background:'#eef2ff', color:'#4338ca',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Icon name="users" size={16} color="#4338ca"/>
          </div>
          <div>
            <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>{"Sécurité équipe"}</p>
            <p style={{ margin:0, fontSize:11, color:t.muted }}>
              {"Mode tablette, session employé, seuil SMS"}
            </p>
          </div>
        </div>

        <div>
          {/* Refonte FDS-2026 commit 15 : ce toggle est conservé pour persister
              la valeur en BDD (rétro-compat) mais le système commit 11
              (sidebar neutre + timer 15 min + écran « Qui encaisse ? ») est
              désactivé temporairement côté front. La bascule UX est désormais
              le bouton « Convertir en mode admin » dans la sidebar. */}
          <Row theme={t}
               title="Mode tablette partagée"
               desc="Désactivé temporairement, voir bouton « Convertir en mode admin » dans la sidebar. Le toggle reste sauvegardé en BDD pour usage futur.">
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
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:10 }}>
        <p style={{ margin:0, fontSize:11, color:t.muted, flex:1 }}>
          {"La sauvegarde exige une session PIN admin active."}
        </p>
        <button onClick={save} disabled={busy}
                style={{ padding:'10px 16px', borderRadius:8, border:'none',
                         background: busy ? t.cardAlt : t.text, color: busy ? t.muted : t.bg,
                         cursor: busy ? 'wait' : 'pointer',
                         fontSize:13, fontWeight:500, fontFamily:'inherit' }}>
          {busy ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
