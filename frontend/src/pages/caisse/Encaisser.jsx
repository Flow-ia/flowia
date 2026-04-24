// Caisse > Encaisser — ouverture du flow 4 étapes (EncaisserSheet dans App.jsx).
//
// EncaisserSheet est le composant inline d'App.jsx qui gère les 4 étapes
// (Produits → Employé → Paiement → OK) avec l'intégralité de la logique
// métier : idempotency_key UUID, multi-items, multi-paiements, check live
// promo, crédit client dispo, cartes réductions anniv/parrainage, note
// interne, signed_by_employee_id via useEmployeePinGate.
//
// Extraction du code inline vers des Step1Panier/Step2Client/Step3Payment/
// Step4Confirm dédiés = refactor profond sur ~700 lignes, risque de
// régression élevé → repoussé au commit 14 (polish). Ici on reste
// chirurgical : la page expose une carte qui déclenche la sheet.
import { Icon } from '../../components/Icon';

export default function Encaisser({ onEncaisser, theme }) {
  const t = theme;

  return (
    <div style={{ padding:24, borderRadius:12, background:t.card,
                  border:`0.5px solid ${t.border}`,
                  borderLeft:'2px solid #10b981',
                  display:'flex', flexDirection:'column', gap:18 }}>
      <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
        <div style={{ width:44, height:44, borderRadius:10,
                      background:'#ecfdf5', color:'#065f46', flexShrink:0,
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon name="zap" size={20} color="#065f46"/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:16, fontWeight:500, color:t.text }}>
            {"Nouvel encaissement"}
          </p>
          <p style={{ margin:'3px 0 0', fontSize:12, color:t.muted, lineHeight:1.6 }}>
            {"Flow en 4 étapes : panier (catégories + prix libre), choix employé, paiement simple ou multi, confirmation."}
          </p>
        </div>
      </div>

      <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))',
                    gap:8 }}>
        {[
          { label:'Multi-items', desc:'Ajoute plusieurs prestations au panier' },
          { label:'Multi-paiements', desc:'Espèces + carte + virement + autre' },
          { label:'Codes promo', desc:'Vérification en direct avant validation' },
          { label:'Crédit client', desc:'Solde affiché et appliqué en paiement' },
        ].map(it => (
          <div key={it.label}
               style={{ padding:'10px 12px', borderRadius:8,
                        background: t.cardAlt,
                        border:`0.5px solid ${t.border}` }}>
            <p style={{ margin:0, fontSize:12, fontWeight:500, color:t.text }}>{it.label}</p>
            <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>{it.desc}</p>
          </div>
        ))}
      </div>

      <button onClick={() => onEncaisser && onEncaisser()}
              style={{ alignSelf:'flex-start', padding:'12px 20px', borderRadius:10,
                       border:'none', background:'#10b981', color:'#fff',
                       fontSize:13, fontWeight:500, fontFamily:'inherit',
                       cursor:'pointer',
                       display:'inline-flex', alignItems:'center', gap:8,
                       boxShadow:'0 1px 2px rgba(0,0,0,0.04)' }}>
        <Icon name="zap" size={14} color="#fff"/>
        {"Commencer un encaissement"}
      </button>

      <p style={{ margin:0, fontSize:11, color:t.muted }}>
        {"Chaque transaction reçoit un idempotency_key UUID. Un double-clic n'enregistre pas de doublon (UNIQUE(user_id, idempotency_key))."}
      </p>
    </div>
  );
}
