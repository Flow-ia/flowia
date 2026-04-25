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
  const [splitAmts, setSplitAmts] = useState({ cash: '', card: '', transfer: '', other: '' });

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
    setSplitAmts({ cash: '', card: '', transfer: '', other: '' });
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
      {/* Barre de sous-tabs 1.Panier / 2.Employé / 3.Paiement / 4.OK */}
      <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 8,
                    background: t.cardAlt, overflowX: 'auto' }}>
        {STEPS.map(s => {
          const active   = step === s.id;
          const reachable = s.id === 1
                        || (s.id === 2 && cart.length > 0)
                        || (s.id === 3 && cart.length > 0 && empId)
                        || (s.id === 4 && cart.length > 0 && empId);
          return (
            <button key={s.id}
                    onClick={() => reachable && go(s.id)}
                    disabled={!reachable}
                    style={{ flex: 1, minWidth: 'fit-content',
                             padding: '8px 12px', borderRadius: 6, border: 'none',
                             cursor: reachable ? 'pointer' : 'not-allowed',
                             background: active ? t.card : 'transparent',
                             color: active ? t.text : (reachable ? t.muted : t.dim || t.muted),
                             fontWeight: active ? 500 : 400, fontSize: 13,
                             whiteSpace: 'nowrap', fontFamily: 'inherit',
                             opacity: reachable ? 1 : 0.55 }}>
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
          splitAmts={splitAmts} setSplitAmts={setSplitAmts}
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
          payMethod={payMethod} splitMode={splitMode} splitAmts={splitAmts}
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
