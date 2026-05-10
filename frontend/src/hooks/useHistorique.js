// hooks/useHistorique.js — Hook qui appelle GET /api/historique avec filtres.
//
// Pas de SWR/React Query dans le projet : implementation custom avec
// useState + useEffect + AbortController. Le backend cache deja 5 min via
// global.memCache cote serveur (cf utils/paymentV3.js), donc la 2e requete
// sur les memes filtres revient immediate. Le frontend ne re-cache pas.

import { useEffect, useRef, useState } from "react";
import { historiqueApi } from "../utils/api";

const EMPTY_TOTALS = {
  ca_total_cents:    0,
  en_ligne_cents:    0,  en_ligne_count:    0,
  caisse_rdv_cents:  0,  caisse_rdv_count:  0,
  walkin_cents:      0,  walkin_count:      0,
  refunded_cents:    0,  refunded_count:    0,
  unclassified_count: 0,
};

export function useHistorique(filters) {
  const [data,    setData]    = useState({ transactions: [], totals: EMPTY_TOTALS, pagination: { page: 1, per_page: 50, total: 0 } });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  // Increment a chaque fetch pour eviter les race conditions (un fetch tardif
  // qui revient apres un fetch plus recent ne doit PAS ecraser l'etat).
  const reqIdRef = useRef(0);

  // Serialise les filtres en string stable pour la cle de dependance React
  // (l'objet filters change de reference a chaque render parent).
  const key = JSON.stringify(filters || {});

  useEffect(() => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    historiqueApi.list(filters || {})
      .then(res => {
        if (myReqId !== reqIdRef.current) return; // race : un fetch plus recent a pris la main
        setData({
          transactions: Array.isArray(res?.transactions) ? res.transactions : [],
          totals:       res?.totals || EMPTY_TOTALS,
          pagination:   res?.pagination || { page: 1, per_page: 50, total: 0 },
          period:       res?.period || null,
        });
        setLoading(false);
      })
      .catch(err => {
        if (myReqId !== reqIdRef.current) return;
        setError(err?.message || "Erreur chargement historique");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error };
}
