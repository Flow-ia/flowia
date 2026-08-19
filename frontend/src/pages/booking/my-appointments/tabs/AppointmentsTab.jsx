// src/pages/booking/my-appointments/tabs/AppointmentsTab.jsx
// Onglet "Mes RDV" : sous-onglets Futurs / Passés / Annulés + liste des RDV.
// (1) Pagination 5 RDV / page par sous-onglet (evite de tout afficher d'un
//     coup sur les vieux comptes avec des dizaines de RDV).
// (2) Clic sur une carte -> vue detail AppointmentDetailCard (memo pattern
//     que VisitsTab pour les passages).
import { useState, useEffect } from 'react';
import { Spinner } from '../../shared';
import { getDisplayStatus, fmtApptDate } from '../helpers';
import { AppointmentDetailCard } from '../components/AppointmentDetailCard';

const APPTS_PAGE_SIZE = 5;

export function AppointmentsTab({
  th,
  loading,
  appts,
  rdvTab,
  setRdvTab,
  onCancel,
  onNewBooking,
}) {
  // Vue detail : si selectedAppt set, on affiche le detail au lieu de la liste.
  const [selectedAppt, setSelectedAppt] = useState(null);
  // Pagination : 1 indexed (page 1 = 5 premiers RDV).
  const [page, setPage] = useState(1);
  // Reset a la page 1 quand on change de sous-onglet ou ferme le detail
  // (sinon on reste sur une page potentiellement vide).
  useEffect(() => { setPage(1); }, [rdvTab]);

  if (loading) return <div style={{paddingTop:40}}><Spinner color="#6366f1"/></div>;

  // Vue detail : pas de liste, juste la card detail + retour.
  if (selectedAppt) {
    // On re-resolve le RDV depuis la liste appts pour avoir les donnees a
    // jour (ex: apres un cancel, le contexte est merge dans appts par le
    // parent et on veut afficher 'Annule par vous' immediatement).
    const fresh = appts.find(a => a.id === selectedAppt.id) || selectedAppt;
    return (
      <AppointmentDetailCard
        appt={fresh}
        th={th}
        onBack={() => setSelectedAppt(null)}
        onCancel={onCancel}
      />
    );
  }

  // Grouper les RDV par catégorie
  const apptsFuturs   = appts.filter(a => getDisplayStatus(a).group === 'futurs');
  const apptsPassees  = appts.filter(a => getDisplayStatus(a).group === 'passes');
  const apptsAnnulees = appts.filter(a => getDisplayStatus(a).group === 'annules');
  const currentAppts = rdvTab === 'futurs' ? apptsFuturs : rdvTab === 'passes' ? apptsPassees : apptsAnnulees;

  // Pagination cote client (les 200 RDV de l'api sont tous deja recus mais
  // on n'en affiche que 5 par page pour eviter les listes interminables).
  const totalPages = Math.max(1, Math.ceil(currentAppts.length / APPTS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * APPTS_PAGE_SIZE;
  const pageAppts = currentAppts.slice(startIdx, startIdx + APPTS_PAGE_SIZE);

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
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {pageAppts.map(a => {
            const st = getDisplayStatus(a);
            // Card compacte 2 lignes :
            // - Ligne 1 : 'Salon — Prestation' + 'Montant € + Statut + ›'
            // - Ligne 2 (sous-ligne discrete muted) : 'date courte HH:MM'
            // Tout le detail (employe, refund, motif, paiement, ref) est
            // dans la vue detail au clic.
            const titleLeft = [a.business_name, a.service_name || 'Service']
              .filter(Boolean).join(' — ');
            const dateStr = fmtApptDate(a.date);
            const timeStr = (a.start_time || '').substring(0, 5);
            const dateTimeLabel = [dateStr, timeStr].filter(Boolean).join(' à ');
            return (
              <div key={a.id}
                onClick={() => setSelectedAppt(a)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedAppt(a); } }}
                role="button" tabIndex={0}
                style={{
                  background: th.card,
                  border: `0.5px solid ${th.border}`,
                  borderLeft: `2px solid ${st.color}`,
                  borderRadius: 10,
                  padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  cursor: 'pointer',
                  opacity: st.group !== 'futurs' ? 0.92 : 1,
                  transition: 'background .15s, border-color .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = th.cardAlt; }}
                onMouseLeave={e => { e.currentTarget.style.background = th.card; }}>
                {/* Gauche : 2 lignes compactes — titre + date/heure muted */}
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{
                    margin: 0,
                    fontSize: 14, fontWeight: 500, color: th.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    letterSpacing: '-0.01em',
                  }}>
                    {titleLeft}
                  </p>
                  <p style={{
                    margin: '2px 0 0',
                    fontSize: 12, fontWeight: 400, color: th.muted,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {dateTimeLabel}
                  </p>
                </div>

                {/* Droite : montant + status pill + chevron */}
                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  {a.service_price > 0 && (
                    <span style={{
                      fontSize: 13, fontWeight: 500, color: th.text,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      whiteSpace: 'nowrap',
                    }}>
                      {Number(a.service_price).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DA
                    </span>
                  )}
                  <span style={{
                    fontSize: 12, fontWeight: 500,
                    padding: '4px 10px', borderRadius: 99,
                    background: st.bg, color: st.color,
                    border: `0.5px solid ${st.color}33`,
                    whiteSpace: 'nowrap',
                  }}>
                    {st.label}
                  </span>
                  {/* Chevron > pour signaler que la carte est cliquable */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round"
                       style={{ width:14, height:14, color:th.muted, flexShrink:0 }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </div>
            );
          })}
          {/* Pagination — visible UNIQUEMENT si plus de 5 RDV. Affiche la
              page courante + total + boutons Prev/Next. Disabled au bord. */}
          {totalPages > 1 && (
            <div style={{
              marginTop:8, paddingTop:12,
              borderTop: `0.5px solid ${th.border}`,
              display:'flex', alignItems:'center', justifyContent:'space-between',
              gap:10,
            }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                style={{ padding:'8px 14px', borderRadius:9, cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                  background: th.cardAlt, border: `0.5px solid ${th.border}`,
                  color: safePage <= 1 ? th.dim : th.text, fontWeight:500, fontSize:12,
                  fontFamily:'inherit', opacity: safePage <= 1 ? 0.5 : 1 }}>
                ← Précédent
              </button>
              <span style={{ fontSize:12, color:th.muted }}>
                Page {safePage} / {totalPages}
                <span style={{ color:th.dim }}> · {currentAppts.length} RDV</span>
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                style={{ padding:'8px 14px', borderRadius:9, cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                  background: th.cardAlt, border: `0.5px solid ${th.border}`,
                  color: safePage >= totalPages ? th.dim : th.text, fontWeight:500, fontSize:12,
                  fontFamily:'inherit', opacity: safePage >= totalPages ? 0.5 : 1 }}>
                Suivant →
              </button>
            </div>
          )}
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
