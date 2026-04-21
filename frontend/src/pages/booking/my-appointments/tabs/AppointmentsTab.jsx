// src/pages/booking/my-appointments/tabs/AppointmentsTab.jsx
// Onglet "Mes RDV" : sous-onglets Futurs / Passés / Annulés + liste des RDV.
import { Spinner } from '../../shared';
import { getDisplayStatus, fmtApptDate } from '../helpers';

export function AppointmentsTab({
  th,
  loading,
  appts,
  rdvTab,
  setRdvTab,
  onCancel,
  onNewBooking,
}) {
  if (loading) return <div style={{paddingTop:40}}><Spinner color="#6366f1"/></div>;

  // Grouper les RDV par catégorie
  const apptsFuturs   = appts.filter(a => getDisplayStatus(a).group === 'futurs');
  const apptsPassees  = appts.filter(a => getDisplayStatus(a).group === 'passes');
  const apptsAnnulees = appts.filter(a => getDisplayStatus(a).group === 'annules');
  const currentAppts = rdvTab === 'futurs' ? apptsFuturs : rdvTab === 'passes' ? apptsPassees : apptsAnnulees;

  return (
    <div>
      {/* Sous-onglets Futurs / Passés / Annulés */}
      <div style={{ display:'flex', gap:6, marginBottom:20,
        background:th.cardAlt, borderRadius:12, padding:4 }}>
        {[
          { id:'futurs',  label:'À venir',  count: apptsFuturs.length },
          { id:'passes',  label:'Passes',   count: apptsPassees.length },
          { id:'annules', label:'Annules',  count: apptsAnnulees.length },
        ].map(t => (
          <button key={t.id} onClick={() => setRdvTab(t.id)}
            style={{ flex:1, padding:'9px 6px', borderRadius:9, border:'none', cursor:'pointer',
              background: rdvTab === t.id ? th.card : 'transparent',
              boxShadow: rdvTab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              transition:'all .15s' }}>
            <span style={{ fontSize:13, fontWeight: 500, color: rdvTab===t.id ? th.text : th.muted }}>
              {t.label}
            </span>
            {t.count > 0 && (
              <span style={{ fontSize:11, fontWeight: 500, padding:'1px 6px', borderRadius:99,
                background: rdvTab===t.id ? th.accent : th.border,
                color: rdvTab===t.id ? th.accentText : th.muted }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {currentAppts.length === 0 ? (
        <div style={{ textAlign:'center', paddingTop:40 }}>
          <div style={{ marginBottom:14, display:'flex', justifyContent:'center' }}>
            {rdvTab === 'futurs' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:48,height:48,color:'#d1d5db'}}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            ) : rdvTab === 'passes' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:48,height:48,color:'#d1d5db'}}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:48,height:48,color:'#d1d5db'}}>
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            )}
          </div>
          <p style={{ fontWeight: 500, color:th.muted, marginBottom: rdvTab === 'futurs' ? 20 : 0 }}>
            {rdvTab === 'futurs' ? 'Aucun rendez-vous a venir' :
             rdvTab === 'passes' ? 'Aucun rendez-vous passe' : 'Aucun rendez-vous annule'}
          </p>
          {rdvTab === 'futurs' && (
            <button onClick={onNewBooking}
              style={{ padding:'13px 28px', borderRadius:12, background:th.accent,
                color:th.accentText, fontWeight: 500, fontSize:14, border:'none', cursor:'pointer',
                boxShadow: 'none' }}>
              Prendre un RDV
            </button>
          )}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {currentAppts.map(a => {
            const st = getDisplayStatus(a);
            return (
              <div key={a.id} style={{
                background: th.card, border: `0.5px solid ${th.border}`,
                borderRadius:18, padding:16,
                opacity: st.group !== 'futurs' ? 0.85 : 1,
              }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    {/* Badge statut */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
                      <span style={{
                        fontSize:11, padding:'3px 10px', borderRadius:99, fontWeight: 500,
                        background:st.bg, color:st.color,
                        display:'flex', alignItems:'center', gap:4,
                      }}>
                        <span style={{ fontSize:9 }}>{st.icon}</span>
                        {st.label}
                      </span>
                      <span style={{ fontSize:10, fontWeight: 500, color:th.dim, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                        #{a.id.substring(0,8).toUpperCase()}
                      </span>
                    </div>
                    <p style={{ fontWeight: 500, fontSize:14, color: st.group !== 'futurs' ? th.muted : th.text, marginBottom:3 }}>
                      {a.service_name || 'Service'}
                    </p>
                    <p style={{ fontSize:13, color:th.muted }}>
                      {fmtApptDate(a.date)} à {(a.start_time||'').substring(0,5)}
                    </p>
                    {a.employee_name && (
                      <p style={{ fontSize:12, color:th.dim, marginTop:2 }}>avec {a.employee_name}</p>
                    )}
                    {a.service_price > 0 && (
                      <p style={{ fontSize:12, fontWeight: 500, color:'#6366f1', marginTop:4 }}>{a.service_price} €</p>
                    )}
                  </div>
                  <div style={{
                    width:44, height:44, borderRadius:13, flexShrink:0,
                    background: st.canCancel
                      ? (a.service_color ? `${a.service_color}22` : 'rgba(99,102,241,0.1)')
                      : st.bg,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:18,
                  }}>
                    {a.status === 'cancelled' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:18,height:18}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    ) : a.paid || a.status === 'completed' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:18,height:18}}><polyline points="20 6 9 17 4 12"/></svg>
                    ) : a.status === 'no_show' ? '-' :
                      st.group === 'passes' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.43"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    )}
                  </div>
                </div>
                {st.canCancel && (
                  <button onClick={() => onCancel(a)} style={{
                    marginTop:12, width:'100%', padding:'9px', borderRadius:10,
                    fontSize:12, fontWeight: 500,
                    background:'rgba(248,113,113,0.08)', color:'#f87171',
                    border: '0.5px solid rgba(248,113,113,0.2)', cursor:'pointer',
                  }}>Annuler ce RDV</button>
                )}
              </div>
            );
          })}
          {rdvTab === 'futurs' && (
            <button onClick={onNewBooking}
              style={{ marginTop:6, width:'100%', padding:'14px', borderRadius:12,
                background:th.accent, color:th.accentText, fontWeight: 500, fontSize:14,
                border:'none', cursor:'pointer', boxShadow: 'none' }}>
              + Nouveau rendez-vous
            </button>
          )}
        </div>
      )}
    </div>
  );
}
