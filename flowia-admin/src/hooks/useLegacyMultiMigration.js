// hooks/useLegacyMultiMigration.js — Wrapper autour de POST /api/admin/
// transactions/:id/migrate-breakdown (commit D). Etat idle/loading/success/
// error + mapping des codes BREAKDOWN_* en messages FR pour les toasts admin.

import { useState } from 'react';
import { migrateLegacyMultiBreakdown } from '../lib/admin.js';

const ERROR_MESSAGES = {
  NOT_LEGACY_MULTI:
    "Cette transaction n'est pas une transaction multi legacy.",
  NOT_FOUND:
    "Transaction introuvable (déjà migrée ?).",
  BREAKDOWN_DUPLICATE_METHODS:
    "Vous ne pouvez pas saisir 2 fois la même méthode.",
  BREAKDOWN_SINGLE_ITEM:
    "Au moins 2 méthodes sont requises pour un paiement multiple.",
  BREAKDOWN_CARD_ONLINE_NOT_SUPPORTED:
    "Le paiement Stripe en ligne n'est pas autorisé en paiement multiple.",
  BREAKDOWN_TOO_MANY_METHODS:
    "Maximum 4 méthodes de paiement autorisées.",
  BREAKDOWN_MISSING:
    "Le détail des paiements est manquant.",
  MIGRATION_FAILED:
    "La migration a échoué côté serveur. Réessayez ou consultez l'audit log.",
};

function translate(err) {
  const code = err?.code;
  if (code === 'BREAKDOWN_SUM_MISMATCH') {
    // Le backend renvoie déjà un message FR précis avec les montants.
    return err?.message || "La somme des paiements ne correspond pas au total.";
  }
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (err?.status >= 500)           return "Erreur serveur, réessayez.";
  return err?.message || "Erreur lors de la migration.";
}

export function useLegacyMultiMigration() {
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [error,  setError]  = useState(null);
  const [data,   setData]   = useState(null);

  const migrate = async (transactionId, payment_breakdown) => {
    setStatus('loading'); setError(null); setData(null);
    try {
      const res = await migrateLegacyMultiBreakdown(transactionId, payment_breakdown);
      setData(res);
      setStatus('success');
      return res;
    } catch (e) {
      const message = translate(e);
      setError({ code: e?.code || null, message });
      setStatus('error');
      throw Object.assign(new Error(message), { code: e?.code, status: e?.status });
    }
  };

  const reset = () => { setStatus('idle'); setError(null); setData(null); };

  return { migrate, reset, status, error, data };
}
