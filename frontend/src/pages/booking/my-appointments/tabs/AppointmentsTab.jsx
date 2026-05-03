// src/pages/booking/my-appointments/tabs/AppointmentsTab.jsx
// Onglet "Mes RDV" : sous-onglets Futurs / Passés / Annulés + liste des RDV.
import { Spinner } from '../../shared';
import { getDisplayStatus, fmtApptDate } from '../helpers';
import { I } from '../../../../utils/icons';

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
                background: th.card,
                border: `1px solid ${th.border}`,
                borderLeft: `2px solid ${st.color}`,
                borderRadius: 12, padding: 16,
                opacity: st.group !== 'futurs' ? 0.92 : 1,
              }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:14 }}>
                  {/* ── Bloc info (gauche) ── */}
                  <div style={{ flex:1, minWidth:0 }}>
                    {/* Commerçant — titre principal */}
                    {a.business_name && (
                      <p style={{ fontWeight: 500, fontSize:16, color: st.group !== 'futurs' ? th.muted : th.text, margin:'0 0 4px', letterSpacing:'-0.015em', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {a.business_name}
                      </p>
                    )}
                    {/* Prestation */}
                    <p style={{ fontWeight: 400, fontSize:15, color:th.text, margin:'0 0 4px', letterSpacing:'-0.015em' }}>
                      {a.service_name || 'Service'}
                    </p>
                    {/* Date + heure */}
                    <p style={{ fontWeight: 400, fontSize:14, color:th.muted, margin:0, letterSpacing:'-0.015em' }}>
                      {fmtApptDate(a.date)} à {(a.start_time||'').substring(0,5)}
                    </p>
                    {/* Ref en bas à gauche, très discret */}
                    <p style={{ fontSize:10, fontWeight:500, color:th.dim,
                      fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                      margin:'8px 0 0', letterSpacing:0.3 }}>
                      #{a.id.substring(0,8).toUpperCase()}
                    </p>
                  </div>

                  {/* ── Bloc statut + prix + action (droite) ── */}
                  <div style={{
                    display:'flex', flexDirection:'column', alignItems:'flex-end',
                    gap:8, flexShrink:0,
                  }}>
                    {/* Statut — juste au-dessus du prix (recommandation) */}
                    <span style={{
                      fontSize:11, fontWeight:500, padding:'3px 9px', borderRadius:99,
                      background: st.bg, color: st.color,
                      border: `1px solid ${st.color}33`,
                      whiteSpace:'nowrap',
                    }}>
                      {st.label}
                    </span>
                    {/* Prix sous le statut */}
                    {a.service_price > 0 && (
                      <p style={{ fontSize:16, fontWeight:500, color:th.text, margin:0,
                        fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                        letterSpacing:'-0.01em', whiteSpace:'nowrap' }}>
                        {Number(a.service_price).toFixed(2)} €
                      </p>
                    )}
                    {/* Action : Annuler uniquement si le RDV est annulable */}
                    {st.canCancel && (
                      <button onClick={() => onCancel(a)} style={{
                        display:'flex', alignItems:'center', gap:6,
                        padding:'7px 11px', borderRadius:8,
                        background:th.card, color:th.text,
                        border:`1px solid ${th.border}`,
                        cursor:'pointer', fontFamily:'inherit',
                        fontSize:12, fontWeight:500, letterSpacing:'-0.01em',
                        transition:'background .15s, border-color .15s',
                        marginTop:2,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = th.cardAlt; e.currentTarget.style.borderColor = th.borderStrong || th.border; }}
                      onMouseLeave={e => { e.currentTarget.style.background = th.card; e.currentTarget.style.borderColor = th.border; }}
                      >
                        <I.X style={{ width:13, height:13 }} />
                        Annuler
                      </button>
                    )}
                  </div>
                </div>
                {/* Employé — centré sous la ligne principale, séparateur fin
                    pour identifier d'un coup d'œil avec qui se passe le RDV. */}
                {a.employee_name && (
                  <div style={{
                    marginTop:14, paddingTop:12,
                    borderTop:`1px solid ${th.border}`,
                    display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  }}>
                    <I.User style={{ width:15, height:15, color:th.muted }} />
                    <span style={{ fontSize:14, fontWeight:500, color:th.text, letterSpacing:'-0.01em' }}>
                      avec {a.employee_name}
                    </span>
                  </div>
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
