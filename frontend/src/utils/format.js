// utils/format.js — Helpers d'affichage FR pour montants et dates.
// Utilise par la refonte v3 (Historique, Statistiques) et reutilisable
// partout dans l'app.

import { MS, DL } from "./dates";

const NBSP = " "; // espace insecable avant le symbole monetaire (typo FR)

// Formate un montant en cents vers "1 234,56 €" (espace milliers, virgule
// decimale, espace insecable avant €). Gere null/undefined/NaN -> "0,00 €".
export function formatCents(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + NBSP + "€";
}

// Formate avec signe explicite : "+30,00 €" / "−25,00 €" / "0,00 €".
// Le signe moins est le caractere typographique U+2212 (plus large que -).
export function formatCentsSign(cents) {
  const n = Number(cents || 0);
  const abs = formatCents(Math.abs(n));
  if (n > 0) return "+" + abs;
  if (n < 0) return "−" + abs;
  return abs;
}

// Formate une date ISO en affichage FR contextuel :
//   - meme jour     : "9 mai · 14:30"
//   - meme annee    : "9 mai"
//   - autre annee   : "9 mai 2026"
export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay  = d.toDateString() === now.toDateString();
  const sameYear = d.getFullYear() === now.getFullYear();
  const day      = d.getDate();
  const month    = MS[d.getMonth()];
  if (sameDay) {
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return day + " " + month + " · " + h + ":" + m;
  }
  if (sameYear) return day + " " + month;
  return day + " " + month + " " + d.getFullYear();
}

// Format long systematique : "9 mai 2026". Pour les pieds de page,
// exports CSV/PDF, etc.
export function formatDateLong(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.getDate() + " " + MS[d.getMonth()] + " " + d.getFullYear();
}

// Format avec jour de la semaine en tete : "Vendredi 16 mai".
// Utilise par TabReversements pour la date du prochain reversement estime.
export function formatDateWeekday(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = DL[d.getDay()];
  const cap = day.charAt(0).toUpperCase() + day.slice(1);
  return cap + " " + d.getDate() + " " + MS[d.getMonth()];
}

// Formate un pourcentage : "+12,5 %" ou "−3,2 %" ou "0 %".
export function formatPct(value, withSign = true) {
  if (value == null || isNaN(value)) return "—";
  const v = Number(value);
  const formatted = Math.abs(v).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }) + NBSP + "%";
  if (!withSign) return formatted;
  if (v > 0) return "+" + formatted;
  if (v < 0) return "−" + formatted;
  return formatted;
}
