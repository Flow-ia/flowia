// hooks/usePayoutMutation.js — Wrapper autour de POST /api/stripe/payout/create.
//
// Mappe les codes d'erreur backend vers des messages utilisateur en FR.
// Etat de transition : idle -> loading -> success | error (auto-reset apres
// le toast pour permettre un nouveau click si solde re-disponible).

import { useState } from "react";
import { payoutsV3Api } from "../utils/api";

const ERROR_MESSAGES = {
  NO_STRIPE_ACCOUNT:
    "Compte Stripe non connecté. Configurez-le dans Réglages › Paiements.",
  ALREADY_IN_PROGRESS:
    "Un reversement est déjà en cours, attendez qu'il soit traité (généralement 1-3 jours ouvrés).",
  INSUFFICIENT_BALANCE:
    "Aucun solde disponible pour le moment. Vos paiements deviendront disponibles 3 jours après chaque RDV.",
  STRIPE_AUTH_ERROR:
    "Erreur d'authentification Stripe. Reconnectez votre compte dans Réglages › Paiements.",
  STRIPE_PERMISSION_ERROR:
    "Votre compte Stripe n'a pas la permission de payout. Contactez le support.",
  STRIPE_BALANCE_ERROR:
    "Impossible de récupérer le solde Stripe. Réessayez dans quelques instants.",
  STRIPE_INVALID_REQUEST: null, // utilise le message backend brut
  STRIPE_UNKNOWN:
    "Erreur Stripe inattendue. Réessayez ou contactez le support.",
  INTERNAL_ERROR:
    "Erreur serveur. Réessayez dans quelques instants.",
};

export function usePayoutMutation() {
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [data,   setData]   = useState(null);
  const [error,  setError]  = useState(null);

  const mutate = async () => {
    setStatus("loading");
    setError(null);
    setData(null);
    try {
      const res = await payoutsV3Api.create();
      setData(res);
      setStatus("success");
      return res;
    } catch (e) {
      const code = e?.code;
      const mapped = code && ERROR_MESSAGES[code] !== undefined
        ? (ERROR_MESSAGES[code] || e?.message || "Erreur inconnue.")
        : (e?.message || "Erreur inconnue.");
      setError({ code, message: mapped });
      setStatus("error");
      throw e;
    }
  };

  const reset = () => {
    setStatus("idle");
    setError(null);
    setData(null);
  };

  return { mutate, reset, status, data, error };
}
