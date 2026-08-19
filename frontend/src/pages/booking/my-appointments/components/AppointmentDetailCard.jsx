// src/pages/booking/my-appointments/components/AppointmentDetailCard.jsx
// Vue detail d'un RDV cote client (ouverte par clic sur une carte dans la
// liste /client/rdv/avenir|passes|annules). Pattern aligne sur
// VisitDetailCard pour les passages sur place : header avec retour, card
// principale avec toutes les infos (date, prestation, employe, prix,
// statut, paiement, contexte annulation, motif).
//
// Visible pour les 3 sous-onglets (avenir/passes/annules). Les sections
// affichees s'adaptent au statut du RDV (annulation -> bandeau de
// tracabilite ; encaisse -> bandeau paiement ; futur paye en avance ->
// bandeau acompte / paiement).
import { fmtApptDate, getDisplayStatus } from '../helpers';

function fmtDateTimeFR(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).replace(',', ' à').replace(/:/, 'h');
  } catch { return null; }
}

export function AppointmentDetailCard({ appt: a, th, onBack, onCancel }) {
  if (!a) return null;
  const st = getDisplayStatus(a);
  const cents = Number(a.paid_amount_cents || 0);
  const eur = (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const isCancelled = a.status === 'cancelled';
  const isRefunded = a.payment_status === 'refunded';
  const isPaidOnline = a.payment_status === 'paid' && cents > 0;
  const cancelDateLabel = fmtDateTimeFR(a.cancelled_at) || fmtDateTimeFR(a.updated_at);
  const cancelByLabel = a.cancelled_by === 'merchant' ? 'le salon'
    : a.cancelled_by === 'client'  ? 'vous'
    : a.cancelled_by === 'system'  ? 'le système (no-show)'
    : null;

  return (
    <div style={{ animation:'fadeIn .2s ease' }}>
      {/* Bouton retour */}
      <button onClick={onBack}
        style={{ display:'flex', alignItems:'center', gap:6,
          padding:'8px 12px', borderRadius:10, marginBottom:14, cursor:'pointer',
          background:th.cardAlt, border: `0.5px solid ${th.border}`,
          color:th.text, fontWeight:500, fontSize:12, fontFamily:'inherit' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ width:14, height:14 }}>
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Retour à la liste
      </button>

      <div style={{
        background:th.card, border: `0.5px solid ${th.border}`,
        borderLeft: `2px solid ${st.color}`,
        borderRadius:18, padding:20, display:'flex', flexDirection:'column', gap:14,
      }}>
        {/* Header : commerçant + prestation + statut + prix */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between',
          gap:12, flexWrap:'wrap' }}>
          <div style={{ minWidth:0, flex:'1 1 200px' }}>
            <span style={{
              fontSize:10, padding:'3px 8px', borderRadius:99, fontWeight:500,
              background: st.bg, color: st.color,
              border: `0.5px solid ${st.color}33`,
              display:'inline-flex', alignItems:'center', marginBottom:8,
            }}>
              {st.label}
            </span>
            {a.business_name && (
              <p style={{ fontSize:18, fontWeight:500, color:th.text, margin:'0 0 4px',
                wordBreak:'break-word' }}>
                {a.business_name}
              </p>
            )}
            <p style={{ fontSize:15, fontWeight:500, color:th.text, margin:'0 0 4px' }}>
              {a.service_name || 'Service'}
            </p>
            <p style={{ fontSize:13, color:th.muted, margin:0, textTransform:'capitalize' }}>
              {fmtApptDate(a.date)} à {(a.start_time || '').substring(0,5)}
            </p>
          </div>
          {a.service_price > 0 && (
            <div style={{ textAlign:'right', flexShrink:0 }}>
              <p style={{ fontSize:22, fontWeight:500, color:th.text, margin:0,
                fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {Number(a.service_price).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DA
              </p>
            </div>
          )}
        </div>

        {/* Employe */}
        {a.employee_name && (
          <div style={{
            paddingTop:12, borderTop: `0.5px solid ${th.border}`,
            display:'flex', alignItems:'center', gap:10,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 style={{ width:16, height:16, color:th.muted }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span style={{ fontSize:13, color:th.text }}>
              avec <strong style={{ fontWeight:500 }}>{a.employee_name}</strong>
            </span>
          </div>
        )}

        {/* Reference RDV (court) */}
        <div style={{
          paddingTop:8, borderTop: `0.5px solid ${th.border}`,
          display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap',
        }}>
          <span style={{ fontSize:11, color:th.muted }}>Référence du rendez-vous</span>
          <code style={{ fontSize:11, color:th.text,
            padding:'3px 8px', borderRadius:6, background:th.cardAlt,
            fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            #{(a.id || '').substring(0,8).toUpperCase()}
          </code>
        </div>

        {/* ── Bloc tracabilite annulation (priorite haute) ──────────────── */}
        {isCancelled && (
          <div style={{
            padding:'14px 16px', borderRadius:12,
            background:'#fef2f2', borderLeft:'2px solid #ef4444',
            display:'flex', flexDirection:'column', gap:6,
          }}>
            <p style={{ margin:0, fontSize:11, fontWeight:500, color:'#991b1b',
                        textTransform:'uppercase', letterSpacing:'0.04em' }}>
              Rendez-vous annulé
            </p>
            <p style={{ margin:0, fontSize:13, color:th.text, lineHeight:1.5 }}>
              {cancelByLabel
                ? <>Annulé par <strong style={{ fontWeight:500 }}>{cancelByLabel}</strong></>
                : 'Annulé'}
              {cancelDateLabel && <> {`le ${cancelDateLabel}`}</>}
            </p>
            {isRefunded && cents > 0 && (
              <p style={{ margin:0, fontSize:13, color:'#065f46', fontWeight:500 }}>
                Remboursement intégral de {eur} DA effectué
                {cancelDateLabel && <> le {cancelDateLabel}</>}
              </p>
            )}
            {isPaidOnline && !isRefunded && (
              <p style={{ margin:0, fontSize:13, color:'#92400e', fontWeight:500 }}>
                Acompte de {eur} DA conservé par le salon (politique no-show)
              </p>
            )}
            {!isRefunded && !isPaidOnline && (
              <p style={{ margin:0, fontSize:12, color:th.muted }}>
                Aucun paiement en ligne associé à ce RDV.
              </p>
            )}
            {a.cancel_reason && (
              <p style={{ margin:'2px 0 0', fontSize:12, color:th.muted, lineHeight:1.5 }}>
                <strong style={{ fontWeight:500, color:th.text }}>Motif :</strong>{' '}
                {a.cancel_reason}
              </p>
            )}
          </div>
        )}

        {/* ── Bloc paiement (visible uniquement si NON annule) ──────────── */}
        {!isCancelled && (a.paid || isPaidOnline) && (
          <div style={{
            padding:'14px 16px', borderRadius:12,
            background:'#f0fdf4', borderLeft:'2px solid #10b981',
          }}>
            <p style={{ margin:0, fontSize:13, fontWeight:500, color:'#065f46' }}>
              {isPaidOnline ? 'Payé en ligne' : 'Encaissé sur place'}
            </p>
            <p style={{ margin:'2px 0 0', fontSize:11, color:th.muted }}>
              {isPaidOnline ? 'Stripe' : 'Caisse'}
              {cents > 0 ? ` · ${eur} DA` : ''}
              {a.paid_at ? ` · ${fmtDateTimeFR(a.paid_at) || ''}` : ''}
            </p>
          </div>
        )}

        {/* Notes (visibles si renseignées) */}
        {a.notes && (
          <div style={{
            padding:'12px 14px', borderRadius:10,
            background:'#fffbeb', borderLeft:'2px solid #f59e0b',
          }}>
            <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:500, color:'#92400e' }}>
              Notes
            </p>
            <p style={{ margin:0, fontSize:13, color:th.text, lineHeight:1.5 }}>
              {a.notes}
            </p>
          </div>
        )}

        {/* Bouton Annuler dispo si st.canCancel ET non annule */}
        {st.canCancel && !isCancelled && (
          <button onClick={() => onCancel(a)}
            style={{ marginTop:4, padding:'12px', borderRadius:11, cursor:'pointer',
              background:'transparent', color:'#991b1b',
              border:'0.5px solid rgba(239,68,68,0.3)',
              fontWeight:500, fontSize:13, fontFamily:'inherit' }}>
            Annuler ce rendez-vous
          </button>
        )}
      </div>
    </div>
  );
}
