// hooks/useMultiPaymentMutation.js — Wrapper autour de POST /api/transactions
// avec champ optionnel payment_breakdown (commit A backend). Traduit les codes
// d'erreur BREAKDOWN_* en messages FR et émet le toast de succès avec le
// détail des méthodes utilisées en mode multi.
//
// Utilisation type (Step4Confirm) :
//   const { submit } = useMultiPaymentMutation({ onAdd, showToast });
//   await submit(payload); // payload contient (ou non) payment_breakdown
//
// Le hook ne gère pas l'état de transition (loading/success/error) car le
// composant appelant (Step4Confirm) a déjà son propre `busy` couplé au PIN
// gate et au snapshot d'écran de succès. On veut juste centraliser ici la
// traduction des codes backend et le récap toast.

import { useState } from 'react';

const PM_LABELS = {
  cash:      'Espèces',
  card:      'CB',
  transfer:  'Virement',
  gift_card: 'Bon cadeau',
  other:     'Autre',
};

// Mapping codes backend → messages FR. Pour SUM_MISMATCH on préfère le
// message backend brut (qui contient les montants attendus / saisis).
const ERROR_MESSAGES = {
  BREAKDOWN_DUPLICATE_METHODS:
    "Vous ne pouvez pas saisir 2 fois la même méthode.",
  BREAKDOWN_SINGLE_ITEM:
    "Au moins 2 méthodes sont requises pour un paiement multiple.",
  BREAKDOWN_CARD_ONLINE_NOT_SUPPORTED:
    "Le paiement Stripe en ligne n'est pas autorisé en paiement multiple.",
  BREAKDOWN_TOO_MANY_METHODS:
    "Maximum 4 méthodes de paiement autorisées.",
};

function fmt(n) { return Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }

function buildSuccessToast(payload) {
  const bd = payload?.payment_breakdown;
  if (!Array.isArray(bd) || bd.length < 2) return "Encaissement enregistré";
  const total = bd.reduce((s, it) => s + (it.amount_cents || 0), 0) / 100;
  const detail = bd
    .map(it => (PM_LABELS[it.method] || it.method) + " " + fmt(it.amount_cents / 100) + " DA")
    .join(', ');
  return "Paiement enregistré : " + fmt(total) + " DA (" + bd.length
       + " méthodes : " + detail + ")";
}

export function useMultiPaymentMutation({ onAdd, showToast }) {
  const [status, setStatus] = useState('idle'); // idle | loading | success | error

  const submit = async (payload) => {
    setStatus('loading');
    try {
      const res = await onAdd(payload);
      if (showToast) showToast(buildSuccessToast(payload), 'ok');
      setStatus('success');
      return res;
    } catch (e) {
      const code   = e?.code;
      const status = e?.status;
      let msg;
      if (code === 'BREAKDOWN_SUM_MISMATCH') {
        // Backend renvoie déjà le détail (X,XX € vs Y,YY €) — plus utile
        // que le message générique. Fallback générique si message vide.
        msg = e?.message
          || ("La somme des paiements doit égaler "
              + fmt(payload?.amount || 0) + " DA.");
      } else if (code && ERROR_MESSAGES[code]) {
        msg = ERROR_MESSAGES[code];
      } else if (status >= 500) {
        msg = "Erreur serveur, réessayez.";
      } else {
        msg = e?.message || "Erreur lors de l'encaissement.";
      }
      if (showToast) showToast(msg, 'error');
      setStatus('error');
      throw e;
    }
  };

  const reset = () => setStatus('idle');

  return { submit, reset, status };
}
