import { useState, useEffect } from 'react';
import { notifApi } from '../../utils/api';

export default function TabNotifs({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const [cfg, setCfg]       = useState(null);
  const [loading, setLoad]  = useState(true);
  const [saving, setSaving] = useState(false);

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
        caisse:          [{ freq:880,start:0,dur:.10,gain:.8 },{ freq:1100,start:.07,dur:.14,gain:.7 },{ freq:1320,start:.15,dur:.22,gain:.9 }],
        new_appointment: [{ freq:523,start:0,dur:.18,gain:.7 },{ freq:659,start:.14,dur:.18,gain:.7 },{ freq:784,start:.28,dur:.30,gain:.8 },{ freq:1047,start:.42,dur:.35,gain:.9 }],
        reminder:        [{ freq:880,start:0,dur:.12,gain:.6 },{ freq:880,start:.20,dur:.12,gain:.6 },{ freq:880,start:.40,dur:.15,gain:.8 }],
      };
      const repeat = cfg.sound_repeat || 2;
      const notes  = configs[type] || configs.caisse;
      const lastN  = notes[notes.length-1];
      const singleDur = lastN.start + lastN.dur + 0.08;
      const gap    = 0.35;
      for (let r = 0; r < repeat; r++) {
        const off = r * (singleDur + gap);
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.55, now+off);
        master.connect(ctx.destination);
        notes.forEach(({freq, start, dur, gain}) => {
          const osc = ctx.createOscillator(); const gn = ctx.createGain();
          osc.type = type==='reminder'?'square':'sine';
          osc.frequency.setValueAtTime(freq, now+off+start);
          gn.gain.setValueAtTime(gain, now+off+start);
          gn.gain.exponentialRampToValueAtTime(0.001, now+off+start+dur);
          osc.connect(gn); gn.connect(master);
          osc.start(now+off+start); osc.stop(now+off+start+dur+0.05);
        });
      }
      setTimeout(() => { try { ctx.close(); } catch {} }, ((repeat-1)*(singleDur+gap)+singleDur+.2)*1000);
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
      showToast('Parametres sauvegardes ✓');
    } catch { showToast('Erreur sauvegarde', 'error'); }
    finally { setSaving(false); }
  };

  const toggle = (key) => setCfg(p => ({ ...p, [key]: !p[key] }));
  const set    = (key, val) => setCfg(p => ({ ...p, [key]: val }));

  const cardS = { borderRadius:16, overflow:'hidden', background:theme.card, border:`1px solid ${theme.border}`, marginBottom:12 };
  const rowS  = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px' };
  const labelS = { fontSize:13, fontWeight:700, color:theme.text, margin:0 };
  const subS   = { fontSize:11, color:theme.muted, margin:'2px 0 0' };
  const Tog = ({ on, onChange }) => (
    <button onClick={onChange}
      style={{ width:44, height:24, borderRadius:99, border:'none', cursor:'pointer',
        position:'relative', flexShrink:0,
        background: on ? 'linear-gradient(90deg,#111827,#374151)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'),
        transition:'background .2s' }}>
      <div style={{ width:20, height:20, borderRadius:99, background:'white',
        position:'absolute', top:2, left:on?22:2, transition:'left .15s',
        boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }}/>
    </button>
  );
  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, outline:'none',
    background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.05)',
    border:`1px solid ${theme.border}`, color:theme.text, fontSize:13, fontFamily:'inherit' };

  if (loading) return <div style={{ padding:48, textAlign:'center' }}><div style={{ width:28,height:28,borderRadius:99,border:`2px solid ${isDark?'rgba(255,255,255,0.1)':'rgba(17,24,39,0.2)'}`,borderTopColor:isDark?'#e6edf3':'#111827',animation:'spin .8s linear infinite',margin:'0 auto' }}/></div>;
  if (!cfg) return null;

  return (
    <div>
      <div style={cardS}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>📊</span>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>Récap journalier</p>
        </div>
        <div style={rowS}>
          <div><p style={labelS}>Activer le récap journalier</p><p style={subS}>Reçois un email de synthèse chaque soir</p></div>
          <Tog on={cfg.daily_recap_enabled} onChange={() => toggle('daily_recap_enabled')} />
        </div>
        {cfg.daily_recap_enabled && (
          <div style={{ padding:'0 16px 14px', display:'flex', flexDirection:'column', gap:10 }}>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5 }}>Heure d&apos;envoi</p>
              <input type="time" value={cfg.daily_recap_time || '20:00'} onChange={e => set('daily_recap_time', e.target.value)} style={inp}/>
            </div>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5 }}>Email de réception</p>
              <input type="email" placeholder="ton@email.com" value={cfg.daily_recap_email || ''} onChange={e => set('daily_recap_email', e.target.value)} style={inp}/>
            </div>
            <button onClick={() => notifApi.testRecap().then(()=>showToast('Email test envoye ✓')).catch(()=>showToast('Erreur', 'error'))}
              style={{ padding:'9px 0', borderRadius:10, border:`1px solid ${theme.border}`, background:'transparent', color:theme.muted, fontSize:12, fontWeight:700, cursor:'pointer' }}>
              📨 Envoyer un récap test
            </button>
          </div>
        )}
      </div>

      <div style={cardS}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>📅</span>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>Rappels RDV clients</p>
        </div>
        <div style={rowS}>
          <div><p style={labelS}>Activer les rappels</p><p style={subS}>Email automatique avant chaque RDV</p></div>
          <Tog on={cfg.reminder_enabled} onChange={() => toggle('reminder_enabled')} />
        </div>
        {cfg.reminder_enabled && (
          <div style={{ padding:'0 16px 14px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:8 }}>Délai avant le RDV</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {DELAY_OPTS.map(d => (
                <button key={d.v} onClick={() => set('reminder_delays', d.v)}
                  style={{ padding:'7px 12px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer',
                    border:`1px solid ${cfg.reminder_delays===d.v?'#111827':theme.border}`,
                    background: cfg.reminder_delays===d.v?'rgba(17,24,39,0.12)':'transparent',
                    color: cfg.reminder_delays===d.v?'#111827':theme.muted }}>
                  {d.l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={cardS}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>👥</span>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>Rappels employés</p>
        </div>
        <div style={rowS}>
          <div><p style={labelS}>Rappels pour les employés</p><p style={subS}>Email pour préparer leur journée</p></div>
          <Tog on={cfg.employee_reminder_enabled} onChange={() => toggle('employee_reminder_enabled')} />
        </div>
        {cfg.employee_reminder_enabled && (
          <div style={{ padding:'0 16px 14px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:8 }}>Délai avant le RDV</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {DELAY_OPTS.slice(0,4).map(d => (
                <button key={d.v} onClick={() => set('employee_reminder_delays', d.v)}
                  style={{ padding:'7px 12px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer',
                    border:`1px solid ${cfg.employee_reminder_delays===d.v?'#374151':theme.border}`,
                    background: cfg.employee_reminder_delays===d.v?'rgba(55,65,81,0.12)':'transparent',
                    color: cfg.employee_reminder_delays===d.v?'#374151':theme.muted }}>
                  {d.l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={cardS}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>🔊</span>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>Sons & alertes</p>
        </div>

        <div style={{ ...rowS, borderBottom:`1px solid ${theme.border}` }}>
          <div style={{ flex:1 }}>
            <p style={labelS}>Son validation encaissement</p>
            <p style={subS}>Joué après validation du paiement (caisse + PIN)</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <button onClick={()=>testSound('caisse')}
              style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer',
                border:`1px solid ${theme.border}`, background:theme.cardAlt, color:theme.muted }}>
              ▶ Tester
            </button>
            <Tog on={cfg.sound_caisse ?? true} onChange={()=>setCfg(p=>({...p, sound_caisse:!(p.sound_caisse??true)}))} />
          </div>
        </div>

        <div style={{ ...rowS, borderBottom:`1px solid ${theme.border}` }}>
          <div style={{ flex:1 }}>
            <p style={labelS}>Son nouveau rendez-vous</p>
            <p style={subS}>Joué dès réception d'un nouveau RDV</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <button onClick={()=>testSound('new_appointment')}
              style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer',
                border:`1px solid ${theme.border}`, background:theme.cardAlt, color:theme.muted }}>
              ▶ Tester
            </button>
            <Tog on={cfg.sound_new_appt ?? true} onChange={()=>setCfg(p=>({...p, sound_new_appt:!(p.sound_new_appt??true)}))} />
          </div>
        </div>

        <div style={{ ...rowS, borderBottom:`1px solid ${theme.border}` }}>
          <div style={{ flex:1 }}>
            <p style={labelS}>Son rappel de rendez-vous</p>
            <p style={subS}>Alerte sonore quand un RDV approche</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <button onClick={()=>testSound('reminder')}
              style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer',
                border:`1px solid ${theme.border}`, background:theme.cardAlt, color:theme.muted }}>
              ▶ Tester
            </button>
            <Tog on={cfg.sound_reminder ?? true} onChange={()=>setCfg(p=>({...p, sound_reminder:!(p.sound_reminder??true)}))} />
          </div>
        </div>

        {(cfg.sound_reminder ?? true) && (
          <div style={{ padding:'10px 16px', borderBottom:`1px solid ${theme.border}` }}>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:8 }}>⏱ Alerte RDV avant :</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {SOUND_RDV_OPTS.map(d => (
                <button key={d.v} onClick={()=>setCfg(p=>({...p, sound_rdv_before:d.v}))}
                  style={{ padding:'7px 12px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer',
                    border:`1px solid ${(cfg.sound_rdv_before||15)===d.v?'#1a73e8':theme.border}`,
                    background:(cfg.sound_rdv_before||15)===d.v?'rgba(26,115,232,0.1)':'transparent',
                    color:(cfg.sound_rdv_before||15)===d.v?'#1a73e8':theme.muted }}>
                  {d.l}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding:'10px 16px' }}>
          <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:8 }}>🔁 Répéter les sons :</p>
          <div style={{ display:'flex', gap:6 }}>
            {SOUND_REPEAT_OPTS.map(d => (
              <button key={d.v} onClick={()=>setCfg(p=>({...p, sound_repeat:d.v}))}
                style={{ padding:'7px 12px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer',
                  border:`1px solid ${(cfg.sound_repeat||2)===d.v?'#1a73e8':theme.border}`,
                  background:(cfg.sound_repeat||2)===d.v?'rgba(26,115,232,0.1)':'transparent',
                  color:(cfg.sound_repeat||2)===d.v?'#1a73e8':theme.muted }}>
                {d.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        style={{ width:'100%', padding:'14px', borderRadius:16, border:'none', cursor:'pointer',
          background:'#1a73e8', color:'white', fontWeight:800, fontSize:14,
          boxShadow:'0 4px 16px rgba(17,24,39,0.3)', opacity:saving?0.7:1 }}>
        {saving ? 'Sauvegarde...' : 'Enregistrer les parametres'}
      </button>
    </div>
  );
}
