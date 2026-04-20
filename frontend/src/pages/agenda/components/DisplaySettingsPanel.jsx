import { useState } from 'react';

export default function DisplaySettingsPanel({ displayCfg, onChange, theme: t }) {
  const isDark = t.mode === 'dark';
  const [open, setOpen] = useState(false);

  if (!open) return (
    <button onClick={()=>setOpen(true)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0"
      style={{ background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)', color:t.muted }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>
      Affichage
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0" onClick={()=>setOpen(false)} style={{ background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-5 space-y-4"
        style={{ background:isDark?'#1c2128':'#fff', border:`1px solid ${isDark?'rgba(205,217,229,0.1)':'rgba(0,0,0,0.07)'}` }}>
        <div className="flex items-center justify-between">
          <p className="font-black text-base" style={{ color:t.text }}>⚙️ Paramètres d'affichage</p>
          <button onClick={()=>setOpen(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-sm" style={{ background:isDark?'rgba(255,255,255,0.08)':'#f3f4f6', color:t.muted }}>✕</button>
        </div>
        {/* Mode vue */}
        <div>
          <label className="text-xs font-bold uppercase block mb-2" style={{ color:t.muted }}>Mode d'affichage</label>
          <div className="grid grid-cols-2 gap-2">
            {[{id:'grid',label:'Grille (heures)',icon:'⏱'},{id:'list',label:'Liste (cartes)',icon:'📋'}].map(v=>(
              <button key={v.id} onClick={()=>onChange('viewMode',v.id)}
                className="flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-bold"
                style={{ background:displayCfg.viewMode===v.id?'rgba(17,24,39,0.15)':(isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'), border:`1px solid ${displayCfg.viewMode===v.id?'rgba(17,24,39,0.4)':t.border}`, color:displayCfg.viewMode===v.id?'#a5a0ff':t.muted }}>
                <span>{v.icon}</span>{v.label}
              </button>
            ))}
          </div>
        </div>
        {/* Plage horaire */}
        <div>
          <label className="text-xs font-bold uppercase block mb-2" style={{ color:t.muted }}>Heures affichées</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold mb-1" style={{ color:t.dim }}>Début</p>
              <input type="time" value={displayCfg.startHour} onChange={e=>onChange('startHour',e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
            </div>
            <div>
              <p className="text-[10px] font-bold mb-1" style={{ color:t.dim }}>Fin</p>
              <input type="time" value={displayCfg.endHour} onChange={e=>onChange('endHour',e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
            </div>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color:t.dim }}>Pour les horaires nocturnes (ex: 13h → 02h), entrez 13:00 et 02:00</p>
        </div>
        {/* Hauteur créneau */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold uppercase" style={{ color:t.muted }}>Hauteur par heure</label>
            <span className="text-xs font-bold" style={{ color:isDark?'#e6edf3':'#111827' }}>{displayCfg.hourH}px</span>
          </div>
          <input type="range" min="48" max="120" step="8" value={displayCfg.hourH} onChange={e=>onChange('hourH',parseInt(e.target.value))}
            className="w-full" style={{ accentColor:'#111827' }} />
        </div>
        <button onClick={()=>setOpen(false)} className="w-full py-3 rounded-2xl font-bold text-white" style={{ background:'#111827' }}>
          Appliquer
        </button>
      </div>
    </div>
  );
}
