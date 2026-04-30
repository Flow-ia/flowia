import { useState, useEffect } from 'react';
import { notifApi } from '../../utils/api';
import { I } from '../../utils/icons';
import { Button } from '../../components/primitives';

export default function TabNotifs({ theme, showToast }) {
  const t = theme;
  const [cfg, setCfg]         = useState(null);
  const [loading, setLoad]    = useState(true);
  const [saving, setSaving]   = useState(false);
  const [soundsOpen, setSoundsOpen] = useState(false);

  const DELAY_OPTS = [
    { v:'60',   l:'1 heure avant' },
    { v:'120',  l:'2 heures avant' },
    { v:'360',  l:'6 heures avant' },
    { v:'720',  l:'12 heures avant' },
    { v:'1440', l:'24 heures avant' },
    { v:'2880', l:'48 heures avant' },
  ];

  const SOUND_REPEAT_OPTS = [
    { v: 1, l: '1 fois' },
    { v: 2, l: '2 fois' },
    { v: 3, l: '3 fois' },
    { v: 5, l: '5 fois' },
  ];

  const SOUND_RDV_OPTS = [
    { v: 10, l: '10 min avant' },
    { v: 15, l: '15 min avant' },
    { v: 30, l: '30 min avant' },
    { v: 60, l: '1h avant' },
  ];

  const testSound = (type) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      const configs = {
        caisse:          [{ freq:880, start:0, dur:.10, gain:.8 },{ freq:1100, start:.07, dur:.14, gain:.7 },{ freq:1320, start:.15, dur:.22, gain:.9 }],
        new_appointment: [{ freq:523, start:0, dur:.18, gain:.7 },{ freq:659,  start:.14, dur:.18, gain:.7 },{ freq:784,  start:.28, dur:.30, gain:.8 },{ freq:1047, start:.42, dur:.35, gain:.9 }],
        reminder:        [{ freq:880, start:0, dur:.12, gain:.6 },{ freq:880,  start:.20, dur:.12, gain:.6 },{ freq:880,  start:.40, dur:.15, gain:.8 }],
      };
      const repeat = cfg.sound_repeat || 2;
      const notes  = configs[type] || configs.caisse;
      const lastN  = notes[notes.length - 1];
      const singleDur = lastN.start + lastN.dur + 0.08;
      const gap    = 0.35;
      for (let r = 0; r < repeat; r++) {
        const off = r * (singleDur + gap);
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.55, now + off);
        master.connect(ctx.destination);
        notes.forEach(({ freq, start, dur, gain }) => {
          const osc = ctx.createOscillator(); const gn = ctx.createGain();
          osc.type = type === 'reminder' ? 'square' : 'sine';
          osc.frequency.setValueAtTime(freq, now + off + start);
          gn.gain.setValueAtTime(gain, now + off + start);
          gn.gain.exponentialRampToValueAtTime(0.001, now + off + start + dur);
          osc.connect(gn); gn.connect(master);
          osc.start(now + off + start); osc.stop(now + off + start + dur + 0.05);
        });
      }
      setTimeout(() => { try { ctx.close(); } catch {} }, ((repeat - 1) * (singleDur + gap) + singleDur + .2) * 1000);
    } catch {}
  };

  useEffect(() => {
    notifApi.getSettings()
      .then(s => setCfg(s))
      .catch(() => showToast('Erreur chargement', 'error'))
      .finally(() => setLoad(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await notifApi.saveSettings(cfg);
      showToast('Parametres sauvegardes');
    } catch { showToast('Erreur sauvegarde', 'error'); }
    finally { setSaving(false); }
  };

  const toggle = (key) => setCfg(p => ({ ...p, [key]: !p[key] }));
  const set    = (key, val) => setCfg(p => ({ ...p, [key]: val }));

  const cardS  = { borderRadius:12, overflow:'hidden',
                   background:t.card, border:`0.5px solid ${t.border}`,
                   marginBottom:12 };
  const rowS   = { display:'flex', alignItems:'center', justifyContent:'space-between',
                   padding:'14px 16px' };
  const labelS = { fontSize:13, fontWeight:500, color:t.text, margin:0 };
  const subS   = { fontSize:11, color:t.muted, margin:'2px 0 0' };

  const Tog = ({ on, onChange }) => (
    <button onClick={onChange}
            style={{ width:40, height:22, borderRadius:99, border:'none', cursor:'pointer',
                     position:'relative', flexShrink:0,
                     background: on ? t.text : t.cardAlt,
                     transition:'background 0.2s', fontFamily:'inherit' }}>
      <div style={{ width:18, height:18, borderRadius:'50%',
                    background: on ? t.bg : 'white',
                    position:'absolute', top:2, left: on ? 20 : 2,
                    transition:'left 0.15s',
                    boxShadow: t.shadowSm }}/>
    </button>
  );

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box',
  };

  const chip = (active, color) => ({
    padding:'7px 12px', borderRadius:99, fontSize:12, fontWeight:500,
    cursor:'pointer', fontFamily:'inherit',
    border:`0.5px solid ${active ? color : t.border}`,
    background: active ? `${color}18` : 'transparent',
    color: active ? color : t.muted,
  });

  const sectionHeader = (title) => (
    <div style={{ padding:'12px 16px', borderBottom:`0.5px solid ${t.separator}` }}>
      <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>{title}</p>
    </div>
  );

  if (loading) {
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
  if (!cfg) return null;

  return (
    <div>
      {/* Recap journalier — entete supprimee : la rangee toggle/sub-label
          se suffit a elle-meme. */}
      <div style={cardS}>
        <div style={rowS}>
          <div>
            <p style={labelS}>Activer le recap journalier</p>
            <p style={subS}>Recois un email de synthese chaque soir</p>
          </div>
          <Tog on={cfg.daily_recap_enabled} onChange={() => toggle('daily_recap_enabled')}/>
        </div>
        {cfg.daily_recap_enabled && (
          <div style={{ padding:'0 16px 14px', display:'flex', flexDirection:'column', gap:10 }}>
            <div>
              <p style={{ fontSize:12, color:t.muted, margin:'0 0 6px' }}>{"Heure d'envoi"}</p>
              <input type="time" value={cfg.daily_recap_time || '20:00'}
                     onChange={e => set('daily_recap_time', e.target.value)} style={inp}/>
            </div>
            <div>
              <p style={{ fontSize:12, color:t.muted, margin:'0 0 6px' }}>Email de reception</p>
              <input type="email" placeholder="ton@email.com"
                     value={cfg.daily_recap_email || ''}
                     onChange={e => set('daily_recap_email', e.target.value)} style={inp}/>
            </div>
            <Button variant="secondary" size="small" type="button"
                    onClick={() => notifApi.testRecap()
                      .then(() => showToast('Email test envoye'))
                      .catch(() => showToast('Erreur', 'error'))}>
              Envoyer un recap test
            </Button>
          </div>
        )}
      </div>

      {/* Rappels RDV clients — entete supprimee. */}
      <div style={cardS}>
        <div style={rowS}>
          <div>
            <p style={labelS}>Activer les rappels</p>
            <p style={subS}>Email automatique avant chaque RDV</p>
          </div>
          <Tog on={cfg.reminder_enabled} onChange={() => toggle('reminder_enabled')}/>
        </div>
        {cfg.reminder_enabled && (
          <div style={{ padding:'0 16px 14px' }}>
            <p style={{ fontSize:12, color:t.muted, margin:'0 0 8px' }}>Delai avant le RDV</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {DELAY_OPTS.map(d => (
                <button key={d.v} onClick={() => set('reminder_delays', d.v)}
                        style={chip(cfg.reminder_delays === d.v, t.text)}>
                  {d.l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rappels employes — entete supprimee. */}
      <div style={cardS}>
        <div style={rowS}>
          <div>
            <p style={labelS}>Rappels pour les employes</p>
            <p style={subS}>Email pour preparer leur journee</p>
          </div>
          <Tog on={cfg.employee_reminder_enabled} onChange={() => toggle('employee_reminder_enabled')}/>
        </div>
        {cfg.employee_reminder_enabled && (
          <div style={{ padding:'0 16px 14px' }}>
            <p style={{ fontSize:12, color:t.muted, margin:'0 0 8px' }}>Delai avant le RDV</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {DELAY_OPTS.slice(0, 4).map(d => (
                <button key={d.v} onClick={() => set('employee_reminder_delays', d.v)}
                        style={chip(cfg.employee_reminder_delays === d.v, t.text)}>
                  {d.l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sons & alertes — accordeon ferme par defaut (gros bloc avec
          plusieurs sous-options). Header cliquable avec chevron rotatif. */}
      <div style={cardS}>
        <button
          type="button"
          onClick={() => setSoundsOpen(o => !o)}
          aria-expanded={soundsOpen}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
            color: t.text,
            borderBottom: soundsOpen ? `0.5px solid ${t.separator}` : 'none',
          }}
        >
          <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>
            Sons &amp; alertes
          </p>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               style={{
                 flexShrink: 0,
                 color: t.muted,
                 transform: soundsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                 transition: 'transform .2s ease',
               }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {soundsOpen && (
          <>
            {[
              { type:'caisse',          keyOn:'sound_caisse',     label:'Son validation encaissement', sub:'Joue apres validation du paiement (caisse + PIN)' },
              { type:'new_appointment', keyOn:'sound_new_appt',   label:'Son nouveau rendez-vous',     sub:"Joue des reception d'un nouveau RDV" },
              { type:'reminder',        keyOn:'sound_reminder',   label:'Son rappel de rendez-vous',   sub:'Alerte sonore quand un RDV approche' },
            ].map(({ type, keyOn, label, sub }) => (
              <div key={type}
                   style={{ ...rowS, borderBottom:`0.5px solid ${t.separator}` }}>
                <div style={{ flex:1 }}>
                  <p style={labelS}>{label}</p>
                  <p style={subS}>{sub}</p>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                  <button onClick={() => testSound(type)}
                          style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:500,
                                   cursor:'pointer', fontFamily:'inherit',
                                   border:`0.5px solid ${t.border}`,
                                   background:t.cardAlt, color:t.muted }}>
                    ▶ Tester
                  </button>
                  <Tog on={cfg[keyOn] ?? true}
                       onChange={() => setCfg(p => ({ ...p, [keyOn]: !(p[keyOn] ?? true) }))}/>
                </div>
              </div>
            ))}

            {(cfg.sound_reminder ?? true) && (
              <div style={{ padding:'12px 16px', borderBottom:`0.5px solid ${t.separator}` }}>
                <p style={{ fontSize:12, color:t.muted, margin:'0 0 8px' }}>Alerte RDV avant :</p>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {SOUND_RDV_OPTS.map(d => (
                    <button key={d.v} onClick={() => setCfg(p => ({ ...p, sound_rdv_before: d.v }))}
                            style={chip((cfg.sound_rdv_before || 15) === d.v, '#4338ca')}>
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ padding:'12px 16px' }}>
              <p style={{ fontSize:12, color:t.muted, margin:'0 0 8px' }}>Repeter les sons :</p>
              <div style={{ display:'flex', gap:6 }}>
                {SOUND_REPEAT_OPTS.map(d => (
                  <button key={d.v} onClick={() => setCfg(p => ({ ...p, sound_repeat: d.v }))}
                          style={chip((cfg.sound_repeat || 2) === d.v, '#4338ca')}>
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <Button variant="primary" fullWidth type="button" onClick={save} disabled={saving}>
        {saving ? 'Sauvegarde...' : 'Enregistrer les parametres'}
      </Button>
    </div>
  );
}
