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
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
            background:th.card, border: `1px solid ${th.border}`,
            borderRadius:12, marginBottom:20 }}>
            <div style={{ width:40, height:40, borderRadius:99, flexShrink:0,
              background:th.cardAlt, display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:16, fontWeight: 500, color:selEmp.avatar_color||'#374151' }}>
              {selEmp.name.charAt(0)}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, fontWeight: 500, color:th.text, margin:'0 0 1px' }}>
                {selEmp.name}
              </p>
              {selEmp.role && (
                <p style={{ fontSize:11, color:th.muted, margin:0 }}>{selEmp.role}</p>
              )}
            </div>
            <button onClick={()=>{ setSelEmp(null); }}
              style={{ fontSize:12, color:th.muted,
                cursor:'pointer', padding:'4px 8px', borderRadius:7,
                background:th.cardAlt, border: `1px solid ${th.border}` }}>
              Changer
            </button>
          </div>

          <h2 style={{ fontSize:20, fontWeight: 500, color:th.text,
            margin:'0 0 16px', letterSpacing:'-0.02em' }}>Choisir une prestation</h2>

          {/* Liste des services style accordéon */}
          <div style={{ border: `1px solid ${th.border}`, borderRadius:12,
            overflow:'hidden', background:th.card }}>
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
          <h2 style={{ fontSize:20, fontWeight: 500, color:th.text,
            margin:'0 0 6px', letterSpacing:'-0.02em' }}>
            Choisir un membre de l&apos;équipe
          </h2>
          <p style={{ fontSize:13, color:th.muted, margin:'0 0 20px' }}>
            Pour : <strong style={{color:th.text}}>{selSvc?.name}</strong>
          </p>
          <button
            onClick={()=>{ const emp={id:null,name:'Premier disponible',_anyEmployee:true,avatar_color:'#6366f1'}; setSelEmp(emp); setSelDate(null); setSelSlot(null); setMonthKey(''); goToStep(3, null, emp); }}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:16, padding:'18px 20px',
              background:th.card, border: `1px solid ${th.border}`, borderRadius:16,
              cursor:'pointer', marginBottom:12, textAlign:'left',
              transition:'box-shadow 0.15s, transform 0.1s' }}
            onMouseEnter={ev=>{ev.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.1)';ev.currentTarget.style.transform='translateY(-1px)';}}
            onMouseLeave={ev=>{ev.currentTarget.style.boxShadow='none';ev.currentTarget.style.transform='none';}}>
            <div style={{ width:56, height:56, borderRadius:99, flexShrink:0,
              background:th.cardAlt, display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:24 }}>✨</div>
            <div style={{flex:1}}>
              <p style={{fontSize:14,fontWeight: 500,color:th.text,margin:'0 0 2px'}}>Peu importe</p>
              <p style={{fontSize:12,color:th.muted,margin:0}}>Premier membre disponible</p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{width:18,height:18,color:th.dim}}><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          {employees.map(e=>(
            <button key={e.id}
              onClick={()=>{ setSelEmp(e); setSelDate(null); setSelSlot(null); setMonthKey(''); goToStep(3, null, e); }}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:16, padding:'18px 20px',
                background:th.card, border: `1px solid ${th.border}`, borderRadius:16,
                cursor:'pointer', marginBottom:12, textAlign:'left',
                transition:'box-shadow 0.15s, transform 0.1s' }}
              onMouseEnter={ev=>{ev.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.1)';ev.currentTarget.style.transform='translateY(-1px)';}}
              onMouseLeave={ev=>{ev.currentTarget.style.boxShadow='none';ev.currentTarget.style.transform='none';}}>
              <div style={{ width:56, height:56, borderRadius:99, flexShrink:0, overflow:'hidden',
                background: e.has_image ? th.cardAlt : (e.avatar_color ? `${e.avatar_color}20` : th.cardAlt),
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:20, fontWeight: 500, color:e.avatar_color||'#374151',
                border:`2px solid ${e.avatar_color||th.border}30` }}>
                {e.has_image ? (
                  <img src={employeeImgUrl(e.id, e.image_version)} alt={e.name}
                    style={{ width:'100%', height:'100%', objectFit:'cover' }}
                    onError={ev => { ev.currentTarget.style.display = 'none'; }} />
                ) : (
                  e.name.charAt(0)
                )}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:14,fontWeight: 500,color:th.text,margin:'0 0 2px',
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.name}</p>
                {e.role && <p style={{fontSize:12,color:th.muted,margin:0}}>{e.role}</p>}
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{width:18,height:18,color:th.dim}}><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
