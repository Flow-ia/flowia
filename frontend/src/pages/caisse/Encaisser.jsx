// Caisse > Encaisser — refonte commit 7b.
// Flow 4 étapes matérialisé directement dans la page (plus de modale) :
// 1. Panier (catégories hiérarchiques + montant libre)
// 2. Employé (can_encash=true)
// 3. Paiement (simple ou multi, promo/parrainage, crédit client, rewards)
// 4. Confirm (récap + PIN employé + idempotency_key UUID)
//
// L'EncaisserSheet inline dans App.jsx reste montée pour le FAB Dashboard
// (scope commit 7b §4), elle sera retirée au commit 14 si plus utilisée.
import { useState } from 'react';
import Step1Panier   from './components/Step1Panier';
import Step2Employe  from './components/Step2Employe';
import Step3Paiement from './components/Step3Paiement';
import Step4Confirm  from './components/Step4Confirm';
import { Icon } from '../../components/Icon';

const STEPS = [
  { id: 1, label: 'Panier'   },
  { id: 2, label: 'Employé'  },
  { id: 3, label: 'Paiement' },
  { id: 4, label: 'OK'       },
];

export default function Encaisser({ theme, employees = [], categories = [], onAdd, showToast }) {
  const t = theme;

  // State du flow (lifté ici pour survivre aux changements d'étape).
  const [step, setStep] = useState(1);
  const [cart, setCart] = useState([]);
  const [empId, setEmpId] = useState('');

  const [payMethod, setPayMethod] = useState('cash');
  const [splitMode, setSplitMode] = useState(false);
  // Commit B — multi-paiement traçable. Liste ordonnée de lignes (chaque
  // ligne = une méthode + un montant en €). Défaut : Espèces + Virement
  // (méthodes les plus fréquentes hors carte en France). 4 lignes max,
  // les 2 premières non supprimables. card_online absent (réservé Stripe).
  const [breakdownLines, setBreakdownLines] = useState([
    { method: 'cash',     amount: '' },
    { method: 'transfer', amount: '' },
  ]);

  const [promoCode, setPromoCode] = useState('');
  const [promoData, setPromoData] = useState(null);
  const [promoErr,  setPromoErr]  = useState('');

  const [clientEmail, setClientEmail] = useState('');
  const [clientName,  setClientName]  = useState('');
  const [clientNote,  setClientNote]  = useState('');

  const [selectedRewardId, setSelectedRewardId] = useState(null);

  const resetAll = () => {
    setStep(1); setCart([]); setEmpId('');
    setPayMethod('cash'); setSplitMode(false);
    setBreakdownLines([
      { method: 'cash',     amount: '' },
      { method: 'transfer', amount: '' },
    ]);
    setPromoCode(''); setPromoData(null); setPromoErr('');
    setClientEmail(''); setClientName(''); setClientNote('');
    setSelectedRewardId(null);
  };

  const go = (n) => {
    // Ne pas laisser sauter aux étapes suivantes si pré-requis manquants.
    if (n === 2 && cart.length === 0) return;
    if (n === 3 && (cart.length === 0 || !empId)) return;
    if (n === 4 && (cart.length === 0 || !empId)) return;
    setStep(n);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Barre de sous-tabs 1.Panier / 2.Employé / 3.Paiement / 4.OK
          Tablette confort : padding 12×18, font 13/500, min-height 44.
          Étape complétée = icône check vert. État actif = #111827 + blanc.
          Cliquable sur une étape passée pour revenir en arrière. */}
      <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 8,
                    background: t.cardAlt, overflowX: 'auto' }}>
        {STEPS.map(s => {
          const active     = step === s.id;
          const completed  = s.id < step
                          && (s.id !== 2 || empId)
                          && (s.id !== 1 || cart.length > 0);
          const reachable  = s.id === 1
                          || (s.id === 2 && cart.length > 0)
                          || (s.id === 3 && cart.length > 0 && empId)
                          || (s.id === 4 && cart.length > 0 && empId);
          return (
            <button key={s.id}
                    onClick={() => reachable && go(s.id)}
                    disabled={!reachable}
                    style={{ flex: 1, minWidth: 'fit-content', minHeight: 36,
                             padding: '8px 12px', borderRadius: 6, border: 'none',
                             cursor: reachable ? 'pointer' : 'not-allowed',
                             background: active ? '#111827' : 'transparent',
                             color: active ? '#fff' : (reachable ? t.muted : t.dim || t.muted),
                             fontWeight: 500, fontSize: 12,
                             whiteSpace: 'nowrap', fontFamily: 'inherit',
                             opacity: reachable ? 1 : 0.55,
                             display: 'inline-flex', alignItems: 'center',
                             justifyContent: 'center', gap: 5 }}>
              {completed && !active && (
                <Icon name="check" size={12} color="#10b981" strokeWidth={2.5}/>
              )}
              {s.id + '. ' + s.label}
            </button>
          );
        })}
      </div>

      {step === 1 && (
        <Step1Panier
          categories={categories}
          cart={cart} setCart={setCart}
          theme={t}
          onContinue={() => go(2)}
        />
      )}

      {step === 2 && (
        <Step2Employe
          employees={employees}
          empId={empId} setEmpId={setEmpId}
          theme={t}
          onBack={() => go(1)}
          onPickEmployee={(id) => { setEmpId(id); setStep(3); }}
        />
      )}

      {step === 3 && (
        <Step3Paiement
          theme={t} cart={cart}
          payMethod={payMethod} setPayMethod={setPayMethod}
          splitMode={splitMode} setSplitMode={setSplitMode}
          breakdownLines={breakdownLines} setBreakdownLines={setBreakdownLines}
          promoCode={promoCode} setPromoCode={setPromoCode}
          promoData={promoData} setPromoData={setPromoData}
          promoErr={promoErr}   setPromoErr={setPromoErr}
          clientEmail={clientEmail} setClientEmail={setClientEmail}
          clientName={clientName}   setClientName={setClientName}
          clientNote={clientNote}   setClientNote={setClientNote}
          selectedRewardId={selectedRewardId} setSelectedRewardId={setSelectedRewardId}
          showToast={showToast}
          onBack={() => go(2)}
          onContinue={() => go(4)}
        />
      )}

      {step === 4 && (
        <Step4Confirm
          theme={t} cart={cart} employees={employees}
          empId={empId}
          payMethod={payMethod} splitMode={splitMode} breakdownLines={breakdownLines}
          promoCode={promoCode} promoData={promoData}
          clientEmail={clientEmail} clientName={clientName} clientNote={clientNote}
          selectedRewardId={selectedRewardId}
          onAdd={onAdd}
          showToast={showToast}
          onBack={() => go(3)}
          onSuccess={resetAll}
        />
      )}
    </div>
  );
}
