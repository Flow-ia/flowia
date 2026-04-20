// src/pages/employee-agenda/components/ApptCard.jsx
import { useState } from 'react';
import { STATUS_CFG } from '../constants';
import { fmtTime } from '../helpers';
import { glassCard, chip } from '../styles';

export default function ApptCard({ appt, onClick, theme: t }) {
  const isDark = t.mode === 'dark';
  const st = STATUS_CFG[appt.status]||STATUS_CFG.confirmed;
  const [hov, setHov] = useState(false);

  return (
    <button onClick={() => onClick(appt)} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ width:'100%', textAlign:'left', ...glassCard(isDark), padding:'18px 20px', display:'flex', alignItems:'flex-start', gap:14, cursor:'pointer', transform:hov?'translateY(-1px)':'none', transition:'transform .15s, box-shadow .15s', boxShadow:hov?'0 6px 20px rgba(0,0,0,0.08)':(isDark?'none':'0 1px 4px rgba(0,0,0,0.04)'), border:'none' }}>

      {/* Barre couleur */}
      <div style={{ width:3, alignSelf:'stretch', borderRadius:99, background:appt.service_color||appt.employee_color||'#111827', minHeight:40, flexShrink:0 }} />

      {/* Contenu */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:4 }}>
          <span style={{ fontSize:16, fontWeight:800, color:t.text, letterSpacing:'-.3px' }}>{fmtTime(appt.start_time)} — {fmtTime(appt.end_time)}</span>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            {appt.paid && <span style={chip(isDark,'#22c55e')}>✓ Payé</span>}
            <span style={{ ...chip(isDark, st.color), padding:'3px 8px' }}>{st.label}</span>
          </div>
        </div>
        <p style={{ margin:0, fontSize:15, fontWeight:700, color:t.text }}>{appt.client_name}</p>

        {appt.items && appt.items.length > 1 ? (
          <div style={{ marginTop:4 }}>
            {appt.items.map((it,i) => (
              <p key={i} style={{ margin:'1px 0', fontSize:11, color:t.muted }}>
                {it.service_name}{it.qty>1?` ×${it.qty}`:''} · {it.duration_minutes*(it.qty||1)}min{it.unit_price>0?` · ${(it.unit_price*(it.qty||1)).toFixed(2)} €`:''}
              </p>
            ))}
            <p style={{ margin:'3px 0 0', fontSize:11, fontWeight:700, color:'#10b981' }}>
              Total : {appt.total_duration||appt.duration_minutes}min{appt.total_amount>0?` · ${parseFloat(appt.total_amount).toFixed(2)} €`:''}
            </p>
          </div>
        ) : (
          <p style={{ margin:'3px 0 0', fontSize:13, color:t.muted }}>
            {appt.items?.length===1?appt.items[0].service_name:(appt.service_name||'Service')} · {appt.total_duration||appt.duration_minutes}min
            {appt.total_amount>0?` · ${parseFloat(appt.total_amount).toFixed(2)} €`:(appt.service_price?` · ${parseFloat(appt.service_price).toFixed(2)} €`:'')}
          </p>
        )}

        {appt.client_phone && <p style={{ margin:'4px 0 0', fontSize:13, color:t.muted }}>{appt.client_phone}</p>}
        {appt.employee_name && (
          <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:4 }}>
            <div style={{ width:12, height:12, borderRadius:'50%', background:appt.employee_color||'#111827', flexShrink:0 }} />
            <p style={{ margin:0, fontSize:10, color:t.dim }}>{appt.employee_name}</p>
          </div>
        )}
        <p style={{ margin:'4px 0 0', fontSize:10, fontFamily:'monospace', color:t.dim }}>#{(appt.id||'').substring(0,8).toUpperCase()}</p>
      </div>

      {/* Chevron */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14,color:t.muted,flexShrink:0,marginTop:4}}><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  );
}
