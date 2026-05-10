// hooks/useStats.js — 4 hooks separes pour les 4 onglets de /statistiques.
// Chaque onglet ne charge que ses propres donnees (lazy par tab actif).
//
// Le backend cache deja 5 min via global.memCache (cf utils/paymentV3.js),
// donc revenir sur un onglet apres l'avoir quitte revient instantane.
//
// Race-protection : reqIdRef ignore les reponses tardives si l'utilisateur
// change rapidement de periode (filter chip Aujourd'hui -> 30j -> 7j).

import { useEffect, useRef, useState } from "react";
import { statsApi, payoutsV3Api, stripeBalanceV3Api } from "../utils/api";

function useApiCall(fetcher, depKey) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    Promise.resolve(fetcher())
      .then(res => {
        if (myReqId !== reqIdRef.current) return;
        setData(res);
        setLoading(false);
      })
      .catch(err => {
        if (myReqId !== reqIdRef.current) return;
        setError(err?.message || "Erreur chargement");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  return { data, loading, error };
}

export function useStatsPerformance(period) {
  return useApiCall(() => statsApi.getPerformance({ period: period || "month" }), "perf:" + period);
}

export function useStatsRDV(period) {
  return useApiCall(() => statsApi.getRdv({ period: period || "month" }), "rdv:" + period);
}

export function useStatsOnlinePayments(period) {
  return useApiCall(() => statsApi.getOnlinePayments({ period: period || "month" }), "online:" + period);
}

// Balance Stripe Connect seule. Utilise par TabPerformance (section "Argent
// a recevoir") ET TabReversements (hero card vert). 2 fetches au pire si
// l'utilisateur navigue entre les 2 onglets — acceptable.
export function useStatsBalance() {
  return useApiCall(() => stripeBalanceV3Api.get(), "balance");
}

// Reversements = combinaison de 2 endpoints (balance Stripe + historique payouts).
// On fait Promise.all et on retourne un objet { balance, payouts }.
export function useStatsPayouts(period, { perPage = 5 } = {}) {
  return useApiCall(
    () => Promise.all([
      stripeBalanceV3Api.get(),
      payoutsV3Api.list({ period: period || "month", per_page: perPage }),
    ]).then(([balance, payouts]) => ({ balance, payouts })),
    "payouts:" + period + ":" + perPage
  );
}
