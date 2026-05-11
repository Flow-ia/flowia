// hooks/useTransactionDelete.js — Wrapper DELETE /api/transactions/:id pour le
// drawer /historique (Commit F). Le backend (Commit E) gere :
//   - verrouillage anti-fraude (Stripe / online_booking / refund)
//   - rollback fidelite / promo / referral
//   - reset paid=FALSE sur l'appointment associe
// On centralise ici le toast + mapping erreur FR + propagation au refresh.

import { useState } from "react";
import { api } from "../utils/api";

function mapError(e) {
  const code   = e?.code;
  const status = e?.status;
  if (code === "TX_LOCKED" || status === 403) {
    return "Cette transaction ne peut pas être supprimée";
  }
  if (status === 404) return "Transaction introuvable";
  if (status >= 500)  return "Erreur serveur, réessayez";
  return e?.message || "Erreur lors de la suppression";
}

export function useTransactionDelete({ showToast, onSuccess } = {}) {
  const [status, setStatus] = useState("idle");

  const submit = async (id) => {
    setStatus("loading");
    try {
      const res = await api.deleteTransaction(id);
      if (showToast) showToast("Transaction supprimée", "ok");
      if (onSuccess) onSuccess(res);
      setStatus("success");
      return res;
    } catch (e) {
      if (showToast) showToast(mapError(e), "error");
      setStatus("error");
      throw e;
    }
  };

  return { submit, status };
}
