// src/pages/booking-page/steps/Step2ServiceOrEmployee.jsx
// Étape 2 : soit choix employé (si parcours par service), soit choix
// prestation (si parcours par employé déjà pré-sélectionné).

import { employeeImgUrl } from '../../booking/shared';
import { AccordionGroup } from '../../booking/Services';

export function Step2ServiceOrEmployee({
  th, selSvc, selEmp, employees, svcGroups, svcNoCat,
  setSelSvc, setSelEmp, setSelDate, setSelSlot, setMonthKey, goToStep,
}) {
  return (
    <div>
      {selEmp && !selSvc ? (
        /* ─── Parcours par EMPLOYÉ : afficher les prestations disponibles ─── */
        <div>
          {/* Badge employé pré-sélectionné */}
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px',
            background:th.card, border: `1px solid ${th.border}`,
            borderRadius:14, marginBottom:24, boxShadow: th.shadowSm }}>
            <div style={{ width:42, height:42, borderRadius:99, flexShrink:0,
              background:th.cardAlt, border:`1px solid ${th.border}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:16, fontWeight: 500, color: selEmp.avatar_color || th.muted }}>
              {selEmp.name.charAt(0)}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:14, fontWeight: 500, color:th.text, margin:'0 0 2px',
                letterSpacing:'-0.01em' }}>
                {selEmp.name}
              </p>
              {selEmp.role && (
                <p style={{ fontSize:12, color:th.muted, margin:0 }}>{selEmp.role}</p>
              )}
            </div>
            <button onClick={()=>{ setSelEmp(null); }}
              style={{ fontSize:12, fontWeight:500, color:th.text,
                cursor:'pointer', padding:'7px 12px', borderRadius:8,
                background:th.bg, border: `1px solid ${th.border}`,
                fontFamily:'inherit',
                transition:'background 0.15s ease, border-color 0.15s ease' }}
              onMouseEnter={e=>{ e.currentTarget.style.background = th.bgHover; e.currentTarget.style.borderColor = th.borderHv; }}
              onMouseLeave={e=>{ e.currentTarget.style.background = th.bg; e.currentTarget.style.borderColor = th.border; }}>
              Changer
            </button>
          </div>

          <h2 style={{ fontSize:22, fontWeight: 500, color:th.text,
            margin:'0 0 18px', letterSpacing:'-0.025em', lineHeight:1.2 }}>Choisir une prestation</h2>

          {/* Liste des services style accordéon */}
          <div style={{ border: `1px solid ${th.border}`, borderRadius:14,
            overflow:'hidden', background:th.card, boxShadow: th.shadowSm }}>
            {[
              ...svcGroups.map(g => ({ label:g.label, svcs:g.svcs })),
              ...(svcNoCat.length>0 ? [{ label:null, svcs:svcNoCat }] : []),
            ].map(({ label, svcs: gs }, gi, arr) => (
              <AccordionGroup key={label||'__nc__'}
                label={label} svcs={gs} th={th}
                isLast={gi===arr.length-1}
                onSelect={s=>{
                  setSelSvc(s);
                  setSelDate(null); setSelSlot(null); setMonthKey('');
                  goToStep(3, s, selEmp);
                }}/>
            ))}
          </div>
        </div>
      ) : (
        /* ─── Parcours par SERVICE : choisir l'employé ─── */
        <div>
          <h2 style={{ fontSize:22, fontWeight: 500, color:th.text,
            margin:'0 0 6px', letterSpacing:'-0.025em', lineHeight:1.2 }}>
            Choisir un membre de l&apos;équipe
          </h2>
          <p style={{ fontSize:13, color:th.muted, margin:'0 0 24px' }}>
            Pour : <strong style={{color:th.text, fontWeight:500}}>{selSvc?.name}</strong>
          </p>
          <button
            onClick={()=>{ const emp={id:null,name:'Premier disponible',_anyEmployee:true,avatar_color: th.ax.blue}; setSelEmp(emp); setSelDate(null); setSelSlot(null); setMonthKey(''); goToStep(3, null, emp); }}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'18px 20px',
              background:th.card, border: `1px solid ${th.border}`, borderRadius:14,
              cursor:'pointer', marginBottom:12, textAlign:'left',
              fontFamily:'inherit', boxShadow: th.shadowSm,
              transition:'box-shadow 0.15s ease, transform 0.15s ease, border-color 0.15s ease' }}
            onMouseEnter={ev=>{ ev.currentTarget.style.boxShadow = th.shadowMd; ev.currentTarget.style.transform = 'translateY(-1px)'; ev.currentTarget.style.borderColor = th.borderHv; }}
            onMouseLeave={ev=>{ ev.currentTarget.style.boxShadow = th.shadowSm; ev.currentTarget.style.transform = 'none'; ev.currentTarget.style.borderColor = th.border; }}>
            <div style={{ width:52, height:52, borderRadius:99, flexShrink:0,
              background:th.ax.blueBg, border:`1px solid ${th.ax.blue}33`,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={th.ax.blue} strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            </div>
            <div style={{flex:1}}>
              <p style={{fontSize:15,fontWeight:500,color:th.text,margin:'0 0 3px',letterSpacing:'-0.01em'}}>Peu importe</p>
              <p style={{fontSize:13,color:th.muted,margin:0}}>Premier membre disponible</p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
              style={{width:18,height:18,color:th.dim}}><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          {employees.map(e=>(
            <button key={e.id}
              onClick={()=>{ setSelEmp(e); setSelDate(null); setSelSlot(null); setMonthKey(''); goToStep(3, null, e); }}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'18px 20px',
                background:th.card, border: `1px solid ${th.border}`, borderRadius:14,
                cursor:'pointer', marginBottom:12, textAlign:'left',
                fontFamily:'inherit', boxShadow: th.shadowSm,
                transition:'box-shadow 0.15s ease, transform 0.15s ease, border-color 0.15s ease' }}
              onMouseEnter={ev=>{ ev.currentTarget.style.boxShadow = th.shadowMd; ev.currentTarget.style.transform = 'translateY(-1px)'; ev.currentTarget.style.borderColor = th.borderHv; }}
              onMouseLeave={ev=>{ ev.currentTarget.style.boxShadow = th.shadowSm; ev.currentTarget.style.transform = 'none'; ev.currentTarget.style.borderColor = th.border; }}>
              <div style={{ width:52, height:52, borderRadius:99, flexShrink:0, overflow:'hidden',
                background: e.has_image ? th.cardAlt : (e.avatar_color ? `${e.avatar_color}1c` : th.cardAlt),
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:20, fontWeight: 500, color: e.avatar_color || th.muted,
                border:`1px solid ${e.avatar_color ? `${e.avatar_color}33` : th.border}` }}>
                {e.has_image ? (
                  <img src={employeeImgUrl(e.id, e.image_version)} alt={e.name}
                    style={{ width:'100%', height:'100%', objectFit:'cover' }}
                    onError={ev => { ev.currentTarget.style.display = 'none'; }} />
                ) : (
                  e.name.charAt(0)
                )}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:15,fontWeight:500,color:th.text,margin:'0 0 3px',letterSpacing:'-0.01em',
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.name}</p>
                {e.role && <p style={{fontSize:13,color:th.muted,margin:0}}>{e.role}</p>}
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                style={{width:18,height:18,color:th.dim}}><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
