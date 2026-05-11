// hooks/useTransactionPatch.js — Wrapper PATCH /api/transactions/:id pour le
// drawer /historique (Commit F). Mappe les codes d'erreur backend en messages
// FR. La verification de verrouillage (Stripe / refund / online_booking) est
// faite cote backend (Commit E) ; le frontend ne peut que precharger la garde
// visuelle via utils/transactionLock.
//
// Note : on s'appuie sur api.updateTransaction (PUT + PIN admin auto) pour la
// transport — l'endpoint backend accepte un body partiel et retourne la row
// modifiee. Le nom "Patch" est conserve cote drawer pour coller a la
// semantique metier "modification partielle".

import { useState } from "react";
import { api } from "../utils/api";

const ERROR_MESSAGES = {
  TX_LOCKED:                    "Cette transaction ne peut pas être modifiée",
  INVALID_AMOUNT:               "Montant invalide",
  INVALID_EMPLOYEE:             "Employé non trouvé",
  NO_CHANGE_DETECTED:           "Aucun changement détecté",
  BREAKDOWN_REQUIRED:
    "Pour modifier le total d'un paiement multiple, veuillez aussi renseigner la nouvelle répartition entre les méthodes",
  BREAKDOWN_SUM_MISMATCH:       "La somme des paiements doit égaler le total",
  BREAKDOWN_DUPLICATE_METHODS:  "Vous ne pouvez pas saisir 2 fois la même méthode",
  BREAKDOWN_SINGLE_ITEM:        "Au moins 2 méthodes sont requises pour un paiement multiple",
  BREAKDOWN_TOO_MANY_METHODS:   "Maximum 4 méthodes de paiement autorisées",
  BREAKDOWN_INVALID_METHOD:     "Méthode de paiement invalide",
  BREAKDOWN_INVALID_AMOUNT:     "Montant invalide pour une méthode du breakdown",
  BREAKDOWN_CARD_ONLINE_NOT_SUPPORTED:
    "Le paiement Stripe en ligne n'est pas autorisé en paiement multiple",
};

function mapError(e) {
  const code   = e?.code;
  const status = e?.status;
  if (code === "BREAKDOWN_SUM_MISMATCH" && e?.message) return e.message;
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (status === 403) return "Cette transaction ne peut pas être modifiée";
  if (status === 404) return "Transaction introuvable";
  if (status >= 500)  return "Erreur serveur, réessayez";
  return e?.message || "Erreur lors de la modification";
}

export function useTransactionPatch({ showToast, onSuccess } = {}) {
  const [status, setStatus] = useState("idle"); // idle | loading | success | error

  const submit = async (id, body) => {
    setStatus("loading");
    try {
      const res = await api.updateTransaction(id, body);
      // FIX 2026-05-11 : différencier success réel vs 200 menteur. Le backend
      // renvoie maintenant `rows_affected` ; si 0, on signale un warning au
      // lieu du toast vert habituel.
      const rowsAffected = res?.rows_affected;
      if (rowsAffected === 0) {
        if (showToast) showToast("Aucun changement détecté", "info");
      } else {
        if (showToast) showToast("Modification enregistrée", "ok");
      }
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
