// src/pages/employee-agenda/components/EmployeePicker.jsx
import { glassCard, chip } from '../styles';

export default function EmployeePicker({ employees, onSelect, theme: t }) {
  const isDark = t.mode === 'dark';
  const active = employees.filter(e => e.is_active !== false);

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px 20px 96px', background:t.bg }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>

      {/* Hero */}
      <div style={{ textAlign:'center', marginBottom:36 }}>
        <div style={{ width:72, height:72, borderRadius:24, background:'#1a73e8', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', boxShadow:'0 16px 48px rgba(17,24,39,0.3)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:32,height:32}}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <h1 style={{ margin:0, fontSize:26, fontWeight:800, color:t.text, letterSpacing:'-.5px' }}>Mon Agenda</h1>
        <p style={{ margin:'6px 0 0', fontSize:14, color:t.muted }}>Choisissez votre profil</p>
      </div>

      {active.length === 0 ? (
        <div style={{ ...glassCard(isDark), padding:'40px 24px', textAlign:'center', width:'100%', maxWidth:360 }}>
          <p style={{ margin:0, fontSize:14, color:t.muted }}>Aucun employé actif</p>
        </div>
      ) : (
        <div style={{ width:'100%', maxWidth:380, display:'flex', flexDirection:'column', gap:10 }}>
          {active.map((emp, i) => (
            <button key={emp.id} onClick={() => onSelect(emp)}
              style={{ ...glassCard(isDark), width:'100%', padding:'16px 18px', display:'flex', alignItems:'center', gap:14, textAlign:'left', cursor:'pointer', animation:`fadeUp .25s ease ${i*.06}s both`, transition:'transform .15s, box-shadow .15s' }}
              onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow=isDark?'none':'0 1px 4px rgba(0,0,0,0.04)'; }}>

              {/* Avatar */}
              <div style={{ width:48, height:48, borderRadius:14, background:emp.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:20, fontWeight:800, flexShrink:0 }}>
                {emp.name.charAt(0)}
              </div>

              {/* Info */}
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:15, fontWeight:700, color:t.text }}>{emp.name}</p>
                {emp.role && <p style={{ margin:'2px 0 6px', fontSize:12, color:t.muted }}>{emp.role}</p>}
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {emp.can_cancel && <span style={chip(isDark,'#ef4444')}>✕ Annulation</span>}
                  {emp.can_modify && <span style={chip(isDark,'#8b5cf6')}>✎ Modification</span>}
                  {emp.can_encash && <span style={chip(isDark,'#22c55e')}>$ Encaissement</span>}
                  {!emp.can_cancel && !emp.can_modify && !emp.can_encash && (
                    <span style={chip(isDark, isDark?'#64748b':'#94a3b8')}>👁 Consultation</span>
                  )}
                </div>
              </div>

              {/* Chevron */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:16, height:16, color:t.muted, flexShrink:0 }}><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
