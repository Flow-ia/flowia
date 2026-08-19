// useSalonEnrichment.js — enrichissement client-side des cards marketplace
// Salon DZ.
//
// L'endpoint /api/pub/marketplace ne renvoie ni prestations, ni prix, ni
// note, ni disponibilite. On complete chaque salon via les endpoints publics
// existants (deja en prod, caches cote backend) :
//   - GET /:slug/services       → prestations + fourchette de prix (DA)
//   - GET /:slug/google-rating  → note Google Business (si configuree)
//   - GET /:slug/slots          → prochain creneau libre (jour par jour, 7 j max)
//
// Concurrence limitee + cache module partage entre navigations pour ne pas
// marteler le backend (Render free tier, cold starts). Silent fail par
// salon : une card sans enrichissement reste pleinement utilisable.

import { useEffect, useRef, useState } from 'react';
import { pubApi } from '../../../utils/api';

// Caches module : persistent tant que l'onglet vit (les donnees bougent peu,
// et le backend a deja ses propres caches 30-60 s / 6 h).
const baseCache  = new Map(); // slug → { services, priceMin, priceMax, rating, ratingCount }
const availCache = new Map(); // slug → { date, time, dayOffset } | { none: true } | null (erreur)

// Pool de concurrence minimal : lance `size` workers qui depilent `tasks`
// (fonctions async). Toutes les erreurs sont avalees par tache (best-effort).
async function runPool(tasks, size) {
  const queue = [...tasks];
  const worker = async () => {
    while (queue.length) {
      const t = queue.shift();
      if (!t) return;
      try { await t(); } catch {}
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker));
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

// Enrichissement de base d'un salon : services (prix) + note Google.
async function fetchBase(slug) {
  if (baseCache.has(slug)) return baseCache.get(slug);
  const out = { services: [], priceMin: null, priceMax: null, rating: null, ratingCount: 0 };
  const [svcRes, ratingRes] = await Promise.allSettled([
    pubApi.getServices(slug),
    pubApi.getGoogleRating(slug),
  ]);
  if (svcRes.status === 'fulfilled' && Array.isArray(svcRes.value)) {
    out.services = svcRes.value;
    const prices = svcRes.value.map(s => Number(s.price)).filter(p => Number.isFinite(p) && p > 0);
    if (prices.length) {
      out.priceMin = Math.min(...prices);
      out.priceMax = Math.max(...prices);
    }
  }
  if (ratingRes.status === 'fulfilled' && ratingRes.value?.found) {
    out.rating      = Number(ratingRes.value.rating);
    out.ratingCount = Number(ratingRes.value.total_ratings || 0);
  }
  baseCache.set(slug, out);
  return out;
}

// Prochain creneau libre d'un salon : on sonde jour par jour (7 jours max)
// avec le premier service actif — arret des le premier jour non vide. Le
// backend cache chaque (slug, date) 30 s, donc le cout reste contenu.
async function fetchNextSlot(slug) {
  if (availCache.has(slug)) return availCache.get(slug);
  const base = baseCache.get(slug);
  const svc  = base?.services?.[0];
  if (!svc?.id) { availCache.set(slug, null); return null; }
  const today = new Date();
  for (let d = 0; d < 7; d++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);
    try {
      const r = await pubApi.getSlots(slug, { date: toISODate(day), service_id: svc.id });
      if (Array.isArray(r.slots) && r.slots.length) {
        const found = { date: toISODate(day), time: r.slots[0], dayOffset: d };
        availCache.set(slug, found);
        return found;
      }
    } catch {
      availCache.set(slug, null);
      return null;
    }
  }
  const none = { none: true };
  availCache.set(slug, none);
  return none;
}

// Hook principal.
//   items          : items marketplace ({ slug, ... })
//   withAvail      : true quand le tri/filtre "prochain RDV" est actif —
//                    declenche le sondage de dispo (plus couteux, lazy).
// Retourne { enrich: { slug → base }, avail: { slug → next|none|null } }.
export function useSalonEnrichment(items, withAvail) {
  const [enrich, setEnrich] = useState({});
  const [avail,  setAvail]  = useState({});
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Phase 1 : services + note, concurrence 3, uniquement les slugs inconnus.
  useEffect(() => {
    const slugs = (items || []).map(m => m.slug).filter(Boolean);
    if (!slugs.length) return;
    // Publie d'abord ce qui est deja en cache (retour de navigation).
    const cached = {};
    slugs.forEach(s => { if (baseCache.has(s)) cached[s] = baseCache.get(s); });
    if (Object.keys(cached).length) setEnrich(prev => ({ ...prev, ...cached }));

    const missing = slugs.filter(s => !baseCache.has(s));
    if (!missing.length) return;
    let cancelled = false;
    runPool(missing.map(slug => async () => {
      const data = await fetchBase(slug);
      if (!cancelled && alive.current) setEnrich(prev => ({ ...prev, [slug]: data }));
    }), 3);
    return () => { cancelled = true; };
  }, [items]);

  // Phase 2 (lazy) : prochain creneau, seulement quand demande, concurrence 2.
  // Depend de `enrich` : il faut les services (premier service actif) avant
  // de pouvoir sonder les slots.
  useEffect(() => {
    if (!withAvail) return;
    const slugs = (items || []).map(m => m.slug).filter(s => s && enrich[s]);
    if (!slugs.length) return;
    const cached = {};
    slugs.forEach(s => { if (availCache.has(s)) cached[s] = availCache.get(s); });
    if (Object.keys(cached).length) setAvail(prev => ({ ...prev, ...cached }));

    const missing = slugs.filter(s => !availCache.has(s));
    if (!missing.length) return;
    let cancelled = false;
    runPool(missing.map(slug => async () => {
      const next = await fetchNextSlot(slug);
      if (!cancelled && alive.current) setAvail(prev => ({ ...prev, [slug]: next }));
    }), 2);
    return () => { cancelled = true; };
  }, [items, withAvail, enrich]);

  return { enrich, avail };
}

// Libelle humain du prochain creneau : "aujourd'hui 14:30", "demain 10:00",
// "ven. 22 aout 09:15". Retourne null si pas encore sonde, et un libelle
// "complet" si aucun creneau sous 7 jours.
const DAY_SHORT   = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTH_SHORT = ['janv.', 'fevr.', 'mars', 'avr.', 'mai', 'juin',
                     'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'];
export function nextSlotLabel(next) {
  if (!next) return null;
  if (next.none) return 'Complet ces 7 prochains jours';
  const [y, m, d] = next.date.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  if (next.dayOffset === 0) return `aujourd'hui ${next.time}`;
  if (next.dayOffset === 1) return `demain ${next.time}`;
  return `${DAY_SHORT[day.getDay()]} ${d} ${MONTH_SHORT[m - 1]} ${next.time}`;
}
