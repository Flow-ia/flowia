// components/historique/TxDetailDrawer.jsx — Drawer detail + edition + soft
// delete pour /historique (Commit F).
//
// Mode visualisation : recapitulatif + repartition + frais + meta + footer
//   "Modifier" / "Supprimer" (disabled si transaction verrouillee).
// Mode edition : inputs inline pour description, date/heure, employe, total
//   et breakdown multi-methodes (2..4 rows). Validation locale puis appel
//   onPatch -> backend (PIN admin + verrou anti-fraude cote serveur).
// Suppression : modal de confirmation, puis appel onDelete.
//
// La verification finale est cote backend. Le helper utils/transactionLock
// sert uniquement a griser les actions destructives cote UI.

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { formatCents } from "../../utils/format";
import { isTransactionLocked, lockReason } from "../../utils/transactionLock";
import ServiceDropdown from "./ServiceDropdown";

// ── SVG inline (memes regles que TransactionRow) ─────────────────────────────
const SVG_BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const Icon = ({ paths, size = 16, color, style }) => (
  <svg {...SVG_BASE} width={size} height={size}
       style={{ color, flexShrink: 0, ...(style || {}) }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);
const PATH_RECEIPT     = '<path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2"/><path d="M14 8h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5"/><path d="M12 7v10"/>';
const PATH_X           = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';
const PATH_EDIT        = '<path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1"/><path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z"/><line x1="16" y1="5" x2="19" y2="8"/>';
const PATH_TRASH       = '<line x1="4" y1="7" x2="20" y2="7"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>';
const PATH_LOCK        = '<rect x="5" y="11" width="14" height="10" rx="2"/><circle cx="12" cy="16" r="1"/><path d="M8 11v-4a4 4 0 0 1 8 0v4"/>';
const PATH_INFO        = '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12.01" y2="8"/><polyline points="11 12 12 12 12 16 13 16"/>';
const PATH_PLUS        = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
const PATH_CHECK       = '<polyline points="5 12 11 18 19 7"/>';
const PATH_CASH        = '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>';
const PATH_BANK        = '<line x1="3" y1="21" x2="21" y2="21"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="5 6 12 3 19 6"/><line x1="4" y1="10" x2="4" y2="21"/><line x1="20" y1="10" x2="20" y2="21"/><line x1="8" y1="14" x2="8" y2="17"/><line x1="12" y1="14" x2="12" y2="17"/><line x1="16" y1="14" x2="16" y2="17"/>';
const PATH_CARD        = '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>';
const PATH_GIFT        = '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>';
const PATH_DOTS        = '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Methodes autorisees pour le breakdown (alignees BREAKDOWN_METHODS backend).
const METHOD_META = {
  cash:      { paths: PATH_CASH, label: "Espèces"     },
  card:      { paths: PATH_CARD, label: "CB physique" },
  transfer:  { paths: PATH_BANK, label: "Virement"    },
  gift_card: { paths: PATH_GIFT, label: "Bon cadeau"  },
  other:     { paths: PATH_DOTS, label: "Autre"       },
};
const METHOD_OPTIONS = [
  { value: "cash",      label: "Espèces"     },
  { value: "card",      label: "CB physique" },
  { value: "transfer",  label: "Virement"    },
  { value: "gift_card", label: "Bon cadeau"  },
  { value: "other",     label: "Autre"       },
];
const SOURCE_LABELS_FR = {
  online_booking:    "Réservation en ligne",
  phone_internal:    "RDV téléphone",
  cash_register_rdv: "Caisse RDV",
  walkin:            "Walk-in (sans RDV)",
};

// Detect breakpoint mobile pour drawer 100% width <640px.
function useIsMobile() {
  const [m, setM] = useState(
    typeof window !== "undefined" ? window.innerWidth < 640 : false
  );
  useEffect(() => {
    const onResize = () => setM(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return m;
}

// Convertit le breakdown_payments du backend (array de {method, amount_cents})
// en lignes d'edition {method, amount} ou amount est un string format FR.
function breakdownToRows(tx) {
  const bd = Array.isArray(tx?.breakdown_payments) ? tx.breakdown_payments : [];
  if (bd.length >= 2) {
    return bd.map(r => ({
      method: r.method || "cash",
      amount: ((parseInt(r.amount_cents || 0, 10) || 0) / 100).toFixed(2),
    }));
  }
  return [];
}

// Determine si la transaction est en mode "multi" (breakdown traçable).
function txIsMulti(tx) {
  return Array.isArray(tx?.breakdown_payments) && tx.breakdown_payments.length >= 2;
}

function totalAmountFromTx(tx) {
  const cents = Math.abs(parseInt(tx?.gross_amount_cents || 0, 10));
  return (cents / 100).toFixed(2);
}

function parseAmount(str) {
  if (typeof str === "number") return str;
  const n = parseFloat(String(str || "0").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

// Formate les items granulaires en "3× Coupe homme · 1× Coupe femme" pour
// affichage. Dédupe par (service_name + unit_price) au cas où la caisse
// aurait stocké N rows séparées avec qty=1 au lieu d'1 row avec qty=N.
// Fallback sur tx.description si pas d'items en BDD (tx legacy).
// Séparateur " · " (point milieu) — cohérent avec TransactionRow et
// /caisse/historique pour que le titre soit identique partout.
function formatItemsLabel(tx) {
  const items = Array.isArray(tx?.items) ? tx.items : [];
  if (items.length === 0) return tx?.description || "";
  const map = new Map();
  for (const it of items) {
    const name  = String(it.service_name || "Prestation").trim();
    const cents = Math.round((parseFloat(it.unit_price) || 0) * 100);
    const key   = name + "|" + cents;
    const qty   = parseInt(it.qty, 10) || 1;
    if (map.has(key)) map.get(key).qty += qty;
    else map.set(key, { name, qty });
  }
  return Array.from(map.values())
    .map(it => it.qty + "× " + it.name)
    .join(" · ");
}

// Normalise une date BDD (DATE Postgres serialisee en ISO via node-pg, ou
// string "YYYY-MM-DD" via TO_CHAR, ou timestamptz ISO) vers le format attendu
// par <input type="date"> : "YYYY-MM-DD". Tolere null/undefined.
function normalizeDate(value) {
  if (!value) return "";
  const s = String(value);
  // Cas 1 : deja "YYYY-MM-DD" (TO_CHAR ou string raw)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Cas 2 : ISO timestamp (cree par JSON.stringify d'une Date JS)
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  // Utiliser les composants UTC pour eviter le decalage timezone (le DATE
  // backend n'a pas de TZ ; node-pg le pose a 00:00:00 UTC).
  const y  = d.getUTCFullYear();
  const m  = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return y + "-" + m + "-" + dd;
}

// Normalise une heure BDD (TIME Postgres -> "HH:MM:SS", ou ISO timestamp via
// created_at) vers le format <input type="time"> : "HH:MM". Tolere null.
function normalizeTime(value) {
  if (!value) return "";
  const s = String(value);
  // Cas 1 : "HH:MM" ou "HH:MM:SS" (TIME column)
  if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
  // Cas 2 : ISO timestamp (created_at fallback)
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return hh + ":" + mm;
}

// Validation pure d'un form d'édition. Retourne null si OK, sinon une string FR.
// Extrait du composant pour pouvoir être appelé depuis un useMemo (canSave)
// sans dépendances de closure changeantes.
//
// La règle d'or de cohérence : total_amount = somme(paiements) = somme(items).
// Si une de ces 3 valeurs diverge, le save est bloqué avec un message qui
// précise EXACTEMENT le couple en conflit pour que l'utilisateur sache quoi
// corriger (item, paiement, ou montant total).
function validateForm(form) {
  if (!form) return "Données invalides";
  const total = parseAmount(form.total_amount);
  if (!Number.isFinite(total) || total <= 0) return "Montant invalide";
  if (!form.date) return "Date requise";
  if (form.is_multi) {
    if (form.payments.length < 2) return "Au moins 2 méthodes requises";
    if (form.payments.length > 4) return "Maximum 4 méthodes autorisées";
    const seen = new Set();
    let paymentsSum = 0;
    for (const p of form.payments) {
      if (!METHOD_META[p.method]) return "Méthode invalide";
      if (p.method === "card_online") return "Le paiement Stripe en ligne n'est pas autorisé en multi";
      if (seen.has(p.method)) return "Vous ne pouvez pas saisir 2 fois la même méthode";
      seen.add(p.method);
      const a = parseAmount(p.amount);
      if (!Number.isFinite(a) || a <= 0) return "Montant invalide pour une méthode";
      paymentsSum += a;
    }
    // Tolerance 1 centime (arrondis fr-FR).
    if (Math.abs(paymentsSum - total) > 0.01) {
      return "Somme des paiements (" + Number(paymentsSum || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
        + " DA) ≠ total (" + Number(total || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " DA).";
    }
  } else {
    if (!form.payments[0] || !METHOD_META[form.payments[0].method]) {
      return "Méthode invalide";
    }
  }
  // Items granulaires : si présents, leur somme doit égaler le total. Sans
  // cette règle, le backend rejettera avec ITEMS_AMOUNT_MISMATCH et le drawer
  // ne saurait pas lequel des champs corriger. Avec items.length === 0, on
  // laisse passer (rétro-compat tx legacy sans items détaillés).
  const items = Array.isArray(form.items) ? form.items : [];
  if (items.length > 0) {
    let itemsSum = 0;
    for (const it of items) {
      const name = String(it.service_name || "").trim();
      if (!name) return "Chaque prestation doit avoir un nom";
      const q = parseInt(it.qty, 10);
      if (!Number.isFinite(q) || q < 1) return "Quantité invalide sur une prestation";
      const u = parseAmount(it.unit_price);
      if (!Number.isFinite(u) || u < 0) return "Prix unitaire invalide sur une prestation";
      itemsSum += q * u;
    }
    if (Math.abs(itemsSum - total) > 0.01) {
      return "Somme des prestations (" + Number(itemsSum || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
        + " DA) ≠ total (" + Number(total || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
        + " DA) — utilisez le bouton « Synchroniser ».";
    }
  }
  return null;
}

function TxDetailDrawerImpl({
  transaction,
  onClose,
  onPatch,
  onDelete,
  employees = [],
  // categories est accepte pour compat (pas utilise en mode caisse).
  // eslint-disable-next-line no-unused-vars
  categories = [],
}) {
  const { theme: t } = useTheme();
  const isMobile = useIsMobile();
  const open = !!transaction;
  const closeBtnRef = useRef(null);

  // ── State edition ─────────────────────────────────────────────────────────
  const [editMode, setEditMode]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [form, setForm]               = useState(null);
  const [errBanner, setErrBanner]     = useState(null);

  // Reset state a chaque changement de transaction.
  useEffect(() => {
    if (!transaction) return;
    setEditMode(false);
    setSaving(false);
    setDeleting(false);
    setConfirmDelete(false);
    setConfirmDiscard(false);
    setErrBanner(null);
    setForm(buildInitialForm(transaction));
  }, [transaction?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Echap ferme (avec garde si edits non sauves).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      tryClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editMode, form]);

  // Focus initial sur bouton close.
  useEffect(() => {
    if (open && closeBtnRef.current) {
      closeBtnRef.current.focus();
    }
  }, [open, transaction?.id]);

  // Lock body scroll quand drawer ouvert.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  function buildInitialForm(tx) {
    const total = totalAmountFromTx(tx);
    const breakdown = breakdownToRows(tx);
    const isMulti = breakdown.length >= 2;
    // Items granulaires : 1 entrée par prestation. Rétro-compat — si la tx
    // n'a pas d'items en BDD, on garde un array vide ; l'UI bascule alors
    // sur le fallback description (mode lecture) ou sur un message d'aide
    // (mode édition : "Ajouter une prestation").
    const rawItems = Array.isArray(tx?.items) ? tx.items : [];
    const items = rawItems.map(it => ({
      service_id:   it.service_id || null,
      service_name: it.service_name || it.name || "Prestation",
      qty:          String(parseInt(it.qty || 1, 10) || 1),
      unit_price:   String(Number(it.unit_price || 0).toFixed(2)),
    }));
    return {
      description: tx?.description || "",
      date:        normalizeDate(tx?.date || tx?.created_at),
      time:        normalizeTime(tx?.time || tx?.created_at),
      employee_id: tx?.employee_id || "",
      total_amount: total,
      is_multi:    isMulti,
      payment_method: isMulti ? "multi" : (tx?.payment_method || "cash"),
      payments:    isMulti
        ? breakdown
        : [
            { method: tx?.payment_method && METHOD_META[tx.payment_method] ? tx.payment_method : "cash",
              amount: total },
          ],
      items,
    };
  }

  const locked = isTransactionLocked(transaction);
  const reason = locked ? lockReason(transaction) : null;

  const hasUnsavedChanges = useMemo(() => {
    if (!editMode || !form || !transaction) return false;
    const initial = buildInitialForm(transaction);
    return JSON.stringify(initial) !== JSON.stringify(form);
  }, [editMode, form, transaction]);

  // Validation live : Save désactivé tant que validate() retourne une erreur
  // (ex: somme(breakdown) != total). On ne masque pas l'erreur — handleSave
  // re-vérifie et affichera errBanner si quelqu'un force le clic via clavier.
  const canSave = useMemo(() => {
    if (!editMode || !form) return false;
    return validateForm(form) === null;
  }, [editMode, form]);

  function tryClose() {
    if (editMode && hasUnsavedChanges) {
      setConfirmDiscard(true);
      return;
    }
    onClose?.();
  }

  function handleSwitchToEdit() {
    if (locked) return;
    setEditMode(true);
  }

  function handleCancelEdit() {
    if (hasUnsavedChanges) {
      setConfirmDiscard(true);
      return;
    }
    setEditMode(false);
    setForm(buildInitialForm(transaction));
  }

  function discardAndClose() {
    setConfirmDiscard(false);
    setEditMode(false);
    setForm(transaction ? buildInitialForm(transaction) : null);
    onClose?.();
  }

  function discardAndStayClosed() {
    setConfirmDiscard(false);
    setEditMode(false);
    setForm(transaction ? buildInitialForm(transaction) : null);
  }

  function updateForm(patch) {
    setForm(f => ({ ...f, ...patch }));
  }

  function setPayment(idx, patch) {
    setForm(f => ({
      ...f,
      payments: f.payments.map((p, i) => i === idx ? { ...p, ...patch } : p),
    }));
  }

  function addPaymentRow() {
    setForm(f => {
      if (f.payments.length >= 4) return f;
      const used = new Set(f.payments.map(p => p.method));
      const next = METHOD_OPTIONS.find(o => !used.has(o.value))?.value || "other";
      return { ...f, payments: [...f.payments, { method: next, amount: "0.00" }] };
    });
  }

  function removePaymentRow(idx) {
    setForm(f => {
      if (f.payments.length <= 2) return f;
      return { ...f, payments: f.payments.filter((_, i) => i !== idx) };
    });
  }

  // ── Items granulaires : helpers d'édition ──────────────────────────────
  function setItem(idx, patch) {
    setForm(f => ({
      ...f,
      items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it),
    }));
  }
  function addItem() {
    setForm(f => ({
      ...f,
      items: [...(f.items || []), {
        service_id:   null,
        service_name: "Prestation",
        qty:          "1",
        unit_price:   "0.00",
      }],
    }));
  }
  function removeItem(idx) {
    setForm(f => ({
      ...f,
      items: f.items.filter((_, i) => i !== idx),
    }));
  }
  function syncTotalToItems() {
    setForm(f => {
      const sum = (f.items || []).reduce(
        (s, it) => s + (parseAmount(it.qty) * parseAmount(it.unit_price)),
        0
      );
      // Si la tx est en multi, on aligne aussi le 1er sous-paiement
      // (validation backend rejette sinon avec BREAKDOWN_SUM_MISMATCH).
      const totalStr = sum.toFixed(2);
      if (f.is_multi) {
        return { ...f, total_amount: totalStr };
      }
      return {
        ...f,
        total_amount: totalStr,
        payments: f.payments.length
          ? f.payments.map((p, i) => i === 0 ? { ...p, amount: totalStr } : p)
          : [{ method: "cash", amount: totalStr }],
      };
    });
  }

  function toggleMulti(isMulti) {
    setForm(f => {
      if (isMulti) {
        // Single -> Multi : on commence avec 2 rows, premier = methode courante,
        // deuxieme = "cash" (ou "card" si la premiere etait cash).
        const first = f.payments[0] || { method: "cash", amount: f.total_amount };
        const second = first.method === "cash" ? "card" : "cash";
        return {
          ...f,
          is_multi: true,
          payment_method: "multi",
          payments: [
            { method: first.method, amount: f.total_amount },
            { method: second,       amount: "0.00" },
          ],
        };
      }
      // Multi -> Single : on garde la premiere methode et reaffecte le total.
      const first = f.payments[0] || { method: "cash", amount: f.total_amount };
      return {
        ...f,
        is_multi: false,
        payment_method: first.method,
        payments: [{ method: first.method, amount: f.total_amount }],
      };
    });
  }

  // ── Validation locale ────────────────────────────────────────────────────
  function validate() { return validateForm(form); }

  async function handleSave() {
    if (!transaction) return;
    const err = validate();
    if (err) {
      // Pas de showToast disponible ici, on affiche en bandeau dans le drawer.
      // On stocke l'erreur en state local pour rendu inline (cf. errBanner).
      setErrBanner(err);
      return;
    }
    setErrBanner(null);

    // ── Construction du payload : 2 groupes de champs ─────────────────────
    //  - Métadonnées indépendantes (description, date, time, employee_id) →
    //    diff vs initial, on n'envoie que ce qui a changé.
    //  - Trio cohérent (amount + items + payment_breakdown) → si UNE des trois
    //    valeurs a bougé, on envoie les TROIS ensemble. Sinon le backend
    //    pourrait recevoir un items[] qui ne matche pas l'ancien amount, ou
    //    un nouvel amount qui ne matche pas le breakdown initial. validateForm()
    //    a déjà garanti que les 3 sont cohérents avant qu'on arrive ici.
    const initial = buildInitialForm(transaction);
    const body = {};
    const totalCurrent = parseAmount(form.total_amount);
    const totalInitial = parseAmount(initial.total_amount);

    if (form.description !== initial.description) {
      body.description = form.description || null;
    }
    if (form.date !== initial.date && form.date) {
      body.date = form.date;
    }
    if (form.time !== initial.time) {
      body.time = form.time || null;
    }
    if (form.employee_id !== initial.employee_id) {
      body.employee_id = form.employee_id || null;
    }

    // Détection des changements sur le trio cohérent.
    const paymentsChanged =
      form.is_multi !== initial.is_multi
      || form.payments.length !== initial.payments.length
      || form.payments.some((p, i) => {
        const init = initial.payments[i];
        if (!init) return true;
        return p.method !== init.method
            || parseAmount(p.amount) !== parseAmount(init.amount);
      });
    const totalChanged = Math.abs(totalCurrent - totalInitial) > 0.005;

    const itemsCurrent = (form.items || []).map(it => ({
      service_id:   it.service_id || null,
      service_name: String(it.service_name || "").trim() || "Prestation",
      qty:          parseInt(it.qty, 10) || 1,
      unit_price:   parseAmount(it.unit_price),
    }));
    const itemsInitial = (initial.items || []).map(it => ({
      service_id:   it.service_id || null,
      service_name: String(it.service_name || "").trim() || "Prestation",
      qty:          parseInt(it.qty, 10) || 1,
      unit_price:   parseAmount(it.unit_price),
    }));
    const itemsChanged = itemsCurrent.length !== itemsInitial.length
      || itemsCurrent.some((it, i) => {
        const init = itemsInitial[i];
        if (!init) return true;
        return it.service_id   !== init.service_id
            || it.service_name !== init.service_name
            || it.qty          !== init.qty
            || Math.abs(it.unit_price - init.unit_price) > 0.005;
      });

    // Si UNE des 3 valeurs du trio a bougé → on envoie les 3 ensemble pour
    // garantir la cohérence côté BDD (sinon ITEMS_AMOUNT_MISMATCH ou
    // BREAKDOWN_REQUIRED côté backend, avec une UX dégradée).
    const trioChanged = paymentsChanged || totalChanged || itemsChanged;
    if (trioChanged) {
      body.amount = totalCurrent;
      if (form.is_multi) {
        // Multi : backend attend payment_breakdown[] avec amount_cents.
        body.payment_breakdown = form.payments.map(p => ({
          method:       p.method,
          amount_cents: Math.round(parseAmount(p.amount) * 100),
        }));
      } else {
        // Single : envoyer un breakdown single-element pour que le backend
        // traite proprement une éventuelle transition multi → single
        // (clear payment_group_id sur la rep_row + soft-delete des sister rows).
        // Envoyer `payment_breakdown: null` déclenchait BREAKDOWN_REQUIRED côté
        // backend quand la tx d'origine était un multi.
        const singleMethod = form.payments[0]?.method || "cash";
        body.payment_method    = singleMethod;
        body.payment_breakdown = [{
          method:       singleMethod,
          amount_cents: Math.round(totalCurrent * 100),
        }];
      }
      // Items toujours co-envoyés si on en a (création rétroactive ou update).
      // Items vide ET initial vide → on n'envoie pas items[] (rétro-compat
      // tx legacy sans détail des prestations).
      if (itemsCurrent.length > 0 || itemsInitial.length > 0) {
        body.items = itemsCurrent;
      }
    }

    // Si rien n'a réellement changé : warning UX (pas d'appel backend).
    if (Object.keys(body).length === 0) {
      setErrBanner("Aucun changement détecté.");
      return;
    }

    setSaving(true);
    try {
      const result = await onPatch?.(transaction.id, body);
      // Le hook useTransactionPatch nous renvoie l'objet réponse complet.
      // Si rows_affected = 0 (cas edge) : on signale + on garde le drawer ouvert.
      if (result && typeof result === "object" && result.rows_affected === 0) {
        setErrBanner("Aucun changement détecté.");
      } else {
        setEditMode(false);
      }
    } catch {
      // Le toast est gere par le hook useTransactionPatch.
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!transaction) return;
    setDeleting(true);
    try {
      await onDelete?.(transaction.id);
      setConfirmDelete(false);
      onClose?.();
    } catch {
      // Toast gere cote hook.
    } finally {
      setDeleting(false);
    }
  }

  // Width drawer responsive.
  const drawerWidth = isMobile ? "100%" : 450;

  // Snapshot des montants pour les sections "Frais" / "Net".
  const grossCents   = transaction ? Math.abs(parseInt(transaction.gross_amount_cents || 0, 10)) : 0;
  const netCents     = transaction ? parseInt(transaction.net_amount_cents   || 0, 10) : 0;
  const stripeFee    = transaction ? parseInt(transaction.stripe_fee_cents   || 0, 10) : 0;
  const platformFee  = transaction ? parseInt(transaction.platform_fee_cents || 0, 10) : 0;
  const hasFees      = stripeFee > 0 || platformFee > 0;
  const isMulti      = transaction ? txIsMulti(transaction) : false;
  const breakdownArr = Array.isArray(transaction?.breakdown_payments) ? transaction.breakdown_payments : [];
  const isRefund     = transaction?.payment_status === "REFUNDED";

  // Couleurs : design system (var --color-* si dispo via theme, sinon fallback).
  const colors = {
    pageBg:      t.bg          || "#f8f9fc",
    drawerBg:    t.card        || "#ffffff",
    cardBg:      t.cardAlt     || "#f9f9fb",
    border:      t.border      || "rgba(0,0,0,0.08)",
    separator:   t.separator   || "rgba(0,0,0,0.06)",
    text:        t.text        || "#111827",
    muted:       t.muted       || "#6B7280",
    dim:         t.dim         || "#9CA3AF",
    inputBg:     t.inputBg     || "#f9f9fb",
    inputBorder: t.borderInput || "rgba(0,0,0,0.12)",
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={tryClose}
        style={{
          position: "fixed", inset: 0, zIndex: 70,
          background: "rgba(0,0,0,0.4)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 200ms ease-out",
        }}
        aria-hidden
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Détail transaction"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: drawerWidth, maxWidth: "100%",
          zIndex: 71,
          background: colors.drawerBg,
          borderLeft: "0.5px solid " + colors.border,
          boxShadow: open ? "-20px 0 60px rgba(0,0,0,0.14)" : "none",
          transform: open ? "translateX(0)" : "translateX(110%)",
          transition: "transform 200ms ease-out",
          display: "flex", flexDirection: "column",
          // Safe-area : en plein ecran mobile (PWA/standalone), le header ne
          // passe plus sous la status bar du telephone (croix cliquable).
          paddingTop: "env(safe-area-inset-top, 0px)",
          fontFamily: "inherit",
        }}>
        {transaction ? (
          <>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "14px 16px", flexShrink: 0,
              borderBottom: "0.5px solid " + colors.separator,
            }}>
              <Icon paths={PATH_RECEIPT} size={18} color={colors.muted} />
              <h2 style={{
                margin: 0, flex: 1,
                fontSize: 15, fontWeight: 500, color: colors.text,
              }}>
                {editMode ? "Modifier la transaction" : "Détail transaction"}
              </h2>
              <button
                ref={closeBtnRef}
                onClick={tryClose}
                aria-label="Fermer"
                style={{
                  width: 30, height: 30, borderRadius: 8, border: "none",
                  cursor: "pointer", background: colors.cardBg,
                  color: colors.muted,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "inherit",
                }}>
                <Icon paths={PATH_X} size={14} color={colors.muted} />
              </button>
            </div>

            {/* Body scrollable */}
            <div style={{
              flex: 1, overflowY: "auto",
              padding: "16px",
              display: "flex", flexDirection: "column", gap: 16,
            }}>
              {/* errBanner déplacé au bas de la section Paiement (BreakdownEdit)
                  pour que les erreurs business (paiements/prestations/total
                  désaccordés) s'affichent à côté du champ qui les déclenche.
                  En mode lecture, il n'y a pas d'edit donc pas d'errBanner. */}

              {/* Section 1 — Recapitulatif */}
              {!editMode ? (
                <ViewRecap
                  tx={transaction}
                  colors={colors}
                  locked={locked}
                  isMulti={isMulti}
                  breakdownCount={breakdownArr.length}
                  isRefund={isRefund}
                  grossCents={grossCents}
                  netCents={netCents}
                />
              ) : (
                <EditRecap
                  form={form}
                  updateForm={updateForm}
                  employees={employees}
                  colors={colors}
                />
              )}

              {/* Section 1bis — Prestations granulaires (items) */}
              {!editMode ? (
                <ItemsView tx={transaction} colors={colors} grossCents={grossCents} />
              ) : (
                <ItemsEdit
                  form={form}
                  setItem={setItem}
                  addItem={addItem}
                  removeItem={removeItem}
                  syncTotalToItems={syncTotalToItems}
                  colors={colors}
                  // Catalogue intelligent : si la tx a un appointment_id, on
                  // pioche dans booking_services (catalogue réservation) ;
                  // sinon dans categories niveau 2 (catalogue caisse physique).
                  dropdownContext={transaction?.appointment_id ? "appointment" : "walkin"}
                />
              )}

              {/* Section 2 — Repartition */}
              {!editMode ? (
                isMulti ? (
                  <BreakdownView breakdown={breakdownArr} colors={colors} />
                ) : null
              ) : (
                <BreakdownEdit
                  form={form}
                  updateForm={updateForm}
                  toggleMulti={toggleMulti}
                  setPayment={setPayment}
                  addPaymentRow={addPaymentRow}
                  removePaymentRow={removePaymentRow}
                  colors={colors}
                  errBanner={errBanner}
                />
              )}

              {/* Section 3 — Detail des frais (mode visualisation, Stripe only) */}
              {!editMode && hasFees && (
                <FeesView
                  grossCents={grossCents}
                  stripeFee={stripeFee}
                  platformFee={platformFee}
                  netCents={netCents}
                  colors={colors}
                />
              )}

              {/* Section 4 — Metadonnees (mode visualisation seulement) */}
              {!editMode && (
                <MetaView tx={transaction} colors={colors} />
              )}

              {/* Panneau d'info verrouille */}
              {!editMode && locked && (
                <div style={{
                  padding: "12px 14px", borderRadius: 10,
                  background: "#fef2f2", border: "0.5px solid #fecaca",
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}>
                  <Icon paths={PATH_INFO} size={16} color="#991b1b"
                        style={{ marginTop: 1 }} />
                  <div style={{ fontSize: 12, color: "#991b1b", lineHeight: 1.5 }}>
                    {reason + "."}
                    {" "}
                    {"Pour rembourser ce client, utilisez le bouton « Annuler le RDV » qui déclenchera un remboursement automatique."}
                  </div>
                </div>
              )}
            </div>

            {/* Footer — safe-area bas : boutons au-dessus de la barre de
                navigation systeme Android/iOS, donc toujours cliquables. */}
            <div style={{
              flexShrink: 0,
              padding: "12px 16px",
              paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
              borderTop: "0.5px solid " + colors.separator,
              display: "flex", gap: 8, alignItems: "center",
              background: colors.drawerBg,
            }}>
              {!editMode ? (
                <>
                  <FooterButton
                    onClick={handleSwitchToEdit}
                    disabled={locked}
                    title={locked ? reason : undefined}
                    colors={colors}
                    iconPaths={PATH_EDIT}
                    label="Modifier"
                  />
                  <FooterButton
                    onClick={() => setConfirmDelete(true)}
                    disabled={locked}
                    title={locked ? reason : undefined}
                    colors={colors}
                    iconPaths={PATH_TRASH}
                    label="Supprimer"
                    variant="danger"
                  />
                </>
              ) : (
                <>
                  <FooterButton
                    onClick={handleCancelEdit}
                    colors={colors}
                    label="Annuler"
                    disabled={saving}
                  />
                  <FooterButton
                    onClick={handleSave}
                    colors={colors}
                    iconPaths={PATH_CHECK}
                    label={saving ? "Enregistrement…" : "Enregistrer"}
                    variant="primary"
                    disabled={saving || !canSave}
                    title={!canSave ? (validateForm(form) || "") : undefined}
                  />
                </>
              )}
            </div>
          </>
        ) : null}
      </aside>

      {/* Modal suppression — z-index local > drawer (71) */}
      <LocalConfirm
        open={confirmDelete && !deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Supprimer cette transaction ?"
        message={"Cette action est définitive et la transaction n'apparaîtra plus dans votre historique. Si vous confirmez, le RDV associé redeviendra « à encaisser » (si applicable)."}
        confirmLabel="Confirmer la suppression"
        danger
        colors={colors}
      />

      {/* Modal discard */}
      <LocalConfirm
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={discardAndClose}
        title="Annuler les modifications ?"
        message={"Vos modifications seront perdues. Voulez-vous continuer ?"}
        confirmLabel="Continuer"
        danger
        colors={colors}
      />
    </>
  );
}

// ── LocalConfirm ────────────────────────────────────────────────────────────
// Confirm dialog dedie au drawer. Identique visuellement au composant Confirm
// global (UI.jsx) mais avec z-index 90 (au-dessus du drawer 71). Necessaire
// car le Confirm global a z-index 60 et restait masque par le drawer.
function LocalConfirm({ open, onClose, onConfirm, title, message, confirmLabel, danger, colors }) {
  // Echap ferme le confirm sans propager au drawer (qui ecouterait aussi).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  const confirmBg    = danger ? "#991b1b" : (colors?.text || "#111827");
  const confirmColor = danger ? "#ffffff" : "#ffffff";
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 90,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div onClick={onClose}
           style={{ position: "absolute", inset: 0,
                    background: "rgba(0,0,0,0.55)" }} />
      <div style={{
        position: "relative", width: "100%", maxWidth: 400,
        overflow: "hidden", borderRadius: 14,
        background: colors?.drawerBg || "#ffffff",
        border: "0.5px solid " + (colors?.border || "rgba(0,0,0,0.08)"),
        boxShadow: "0 20px 60px rgba(0,0,0,0.30)",
        fontFamily: "inherit",
      }}>
        <div style={{ padding: 22 }}>
          <h3 style={{
            fontSize: 15, fontWeight: 500,
            color: colors?.text || "#111827",
            margin: "0 0 8px",
          }}>
            {title}
          </h3>
          {message && (
            <p style={{
              fontSize: 13, color: colors?.muted || "#6B7280",
              margin: 0, lineHeight: 1.5,
            }}>
              {message}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, padding: "0 22px 22px" }}>
          <button type="button" onClick={onClose}
                  style={{
                    flex: 1, padding: 10, borderRadius: 8,
                    fontSize: 13, fontWeight: 500, cursor: "pointer",
                    background: "transparent",
                    color: colors?.text || "#111827",
                    border: "0.5px solid " + (colors?.inputBorder || "rgba(0,0,0,0.14)"),
                    fontFamily: "inherit",
                  }}>
            {"Annuler"}
          </button>
          <button type="button"
                  onClick={() => { onConfirm?.(); }}
                  style={{
                    flex: 1, padding: 10, borderRadius: 8,
                    fontSize: 13, fontWeight: 500, cursor: "pointer",
                    background: confirmBg, color: confirmColor,
                    border: "none", fontFamily: "inherit",
                  }}>
            {confirmLabel || "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

function ViewRecap({ tx, colors, locked, isMulti, breakdownCount, isRefund, grossCents, netCents }) {
  const src   = tx.payment_source;
  const srcLb = SOURCE_LABELS_FR[src] || src || "—";
  const dateDisplay = formatDateTimeFR(tx);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 16, fontWeight: 500, color: colors.text, lineHeight: 1.35 }}>
        {formatItemsLabel(tx) || (src === "walkin" ? "Vente walk-in" : "Prestation")}
      </div>
      <div style={{ fontSize: 12, color: colors.muted }}>
        {dateDisplay}
        {tx.employee_name ? " · " + tx.employee_name : ""}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 22, fontWeight: 500, fontFamily: MONO,
          color: isRefund ? "#E24B4A" : "#1D9E75",
        }}>
          {(isRefund ? "−" : "+") + formatCents(grossCents)}
        </span>
        {netCents > 0 && !isRefund && (
          <span style={{ fontSize: 12, color: colors.muted, fontFamily: MONO }}>
            {"Net : " + formatCents(netCents)}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {isMulti && (
          <Badge bg="#F3F4F6" color="#4B5563" label={"Multi (" + breakdownCount + ")"} />
        )}
        <Badge
          bg={src === "walkin" ? "#FAEEDA" : src === "online_booking" ? "#E6F1FB" : "#E1F5EE"}
          color={src === "walkin" ? "#BA7517" : src === "online_booking" ? "#185FA5" : "#0F6E56"}
          label={srcLb}
        />
        {locked ? (
          <Badge bg="#FCEBEB" color="#A32D2D" label="Verrouillé" iconPaths={PATH_LOCK} />
        ) : (
          <Badge bg="#E1F5EE" color="#0F6E56" label="Modifiable" />
        )}
      </div>
    </div>
  );
}

function BreakdownView({ breakdown, colors }) {
  return (
    <SectionCard colors={colors} title="Répartition">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {breakdown.map((sub, i) => {
          const meta = METHOD_META[sub.method] || METHOD_META.other;
          const cents = Math.abs(parseInt(sub.amount_cents || 0, 10));
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 13, color: colors.text,
            }}>
              <Icon paths={meta.paths} size={14} color={colors.muted} />
              <span style={{ flex: 1 }}>{meta.label}</span>
              <span style={{ fontFamily: MONO, color: colors.text }}>
                {formatCents(cents)}
              </span>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function FeesView({ grossCents, stripeFee, platformFee, netCents, colors }) {
  return (
    <SectionCard colors={colors} title="Détail des frais">
      <FeeLine label="Brut"             value={"+" + formatCents(grossCents)} colors={colors} />
      {stripeFee > 0 && (
        <FeeLine label="Frais Stripe"     value={"−" + formatCents(stripeFee)}   colors={colors} muted />
      )}
      {platformFee > 0 && (
        <FeeLine label="Commission Salon DZ" value={"−" + formatCents(platformFee)} colors={colors} muted />
      )}
      <div style={{
        marginTop: 4, paddingTop: 8,
        borderTop: "0.5px solid " + colors.separator,
      }}>
        <FeeLine label="Net pour vous" value={formatCents(netCents)} colors={colors} bold />
      </div>
    </SectionCard>
  );
}

function FeeLine({ label, value, colors, muted, bold }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      fontSize: 13, color: muted ? colors.muted : colors.text,
      fontWeight: bold ? 500 : 400,
      padding: "2px 0",
    }}>
      <span>{label}</span>
      <span style={{ fontFamily: MONO }}>{value}</span>
    </div>
  );
}

function MetaView({ tx, colors }) {
  const src = tx.payment_source;
  const srcLb = SOURCE_LABELS_FR[src] || src || "—";
  // Client : nom prioritaire, sinon email, sinon "—". Évite d'afficher juste
  // "—" quand le caissier n'a saisi qu'un email (cas fréquent identification
  // rapide d'un client fidélité).
  const clientDisplay =
    (tx.client_name && tx.client_name.trim())
      ? tx.client_name.trim()
      : (tx.client_email && tx.client_email.trim())
        ? tx.client_email.trim()
        : "—";
  // Description = formatItemsLabel (toujours format "Qte× Nom, Qte× Nom" si
  // items présents, fallback sur tx.description sinon).
  const descDisplay = formatItemsLabel(tx) || "—";
  return (
    <SectionCard colors={colors} title="Informations">
      <MetaRow label="Client"      value={clientDisplay}     colors={colors} />
      {tx.client_name && tx.client_email && (
        <MetaRow label="Email"     value={tx.client_email}   colors={colors} small />
      )}
      <MetaRow label="Prestations" value={descDisplay}       colors={colors} />
      <MetaRow label="Employé"     value={tx.employee_name || "—"} colors={colors} />
      <MetaRow label="Source"      value={srcLb}             colors={colors} />
      <MetaRow label="ID Transaction" value={tx.id}          colors={colors} mono small selectable />
      {tx.stripe_payment_intent_id && (
        <MetaRow label="PI Stripe" value={tx.stripe_payment_intent_id}
                 colors={colors} mono small selectable />
      )}
    </SectionCard>
  );
}

function MetaRow({ label, value, colors, mono, small, selectable }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 12,
      padding: "4px 0",
      fontSize: small ? 11 : 13,
      alignItems: "baseline",
    }}>
      <span style={{ color: colors.muted, flexShrink: 0 }}>{label}</span>
      <span style={{
        color: colors.text,
        fontFamily: mono ? MONO : "inherit",
        textAlign: "right",
        wordBreak: "break-all",
        userSelect: selectable ? "all" : "auto",
      }}>{value}</span>
    </div>
  );
}

// ── Edit ────────────────────────────────────────────────────────────────────

function EditRecap({ form, updateForm, employees, colors }) {
  // Description supprimée : le titre est dérivé automatiquement de la
  // composition des prestations (qty × service_name) via formatItemsLabel.
  // Modifier les prestations dans la section Prestations met à jour le titre
  // automatiquement — pas besoin de saisir 2 fois la même information.
  //
  // "Montant total (€)" est affiché en BAS de la section Paiement
  // (BreakdownEdit) pour que les erreurs de validation business
  // (somme paiements/prestations ≠ total) s'affichent juste sous ce champ.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Date" colors={colors}>
          <input type="date" value={form.date}
                 onChange={e => updateForm({ date: e.target.value })}
                 style={inputStyle(colors)} />
        </Field>
        <Field label="Heure" colors={colors}>
          <input type="time" value={form.time}
                 onChange={e => updateForm({ time: e.target.value })}
                 style={inputStyle(colors)} />
        </Field>
      </div>
      <Field label="Employé" colors={colors}>
        <select value={form.employee_id}
                onChange={e => updateForm({ employee_id: e.target.value })}
                style={inputStyle(colors)}>
          <option value="">{"— aucun —"}</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.name}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function BreakdownEdit({ form, updateForm, toggleMulti, setPayment,
                         addPaymentRow, removePaymentRow, colors, errBanner }) {
  const total = parseAmount(form.total_amount);
  const sum = form.payments.reduce((s, p) => s + parseAmount(p.amount), 0);
  const sumOk = Math.abs(sum - total) <= 0.01;
  const usedMethods = new Set(form.payments.map(p => p.method));

  return (
    <SectionCard colors={colors} title="Paiement">
      <label style={{
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 13, color: colors.text,
        marginBottom: form.is_multi ? 10 : 4,
        cursor: "pointer",
      }}>
        <input type="checkbox" checked={form.is_multi}
               onChange={e => toggleMulti(e.target.checked)} />
        {"Paiement en plusieurs méthodes"}
      </label>

      {!form.is_multi ? (
        <Field label="Méthode" colors={colors}>
          <select value={form.payments[0]?.method || "cash"}
                  onChange={e => setPayment(0, { method: e.target.value, amount: form.total_amount })}
                  style={inputStyle(colors)}>
            {METHOD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {form.payments.map((p, i) => {
              const dup = form.payments.filter(x => x.method === p.method).length > 1;
              return (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 110px auto", gap: 8,
                  alignItems: "center",
                }}>
                  <select value={p.method}
                          onChange={e => setPayment(i, { method: e.target.value })}
                          style={{
                            ...inputStyle(colors),
                            borderColor: dup ? "#E24B4A" : colors.inputBorder,
                          }}>
                    {METHOD_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}
                              disabled={o.value !== p.method && usedMethods.has(o.value)}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input type="number" step="0.01" min="0" value={p.amount}
                         onChange={e => setPayment(i, { amount: e.target.value })}
                         style={inputStyle(colors)} />
                  <button type="button"
                          onClick={() => removePaymentRow(i)}
                          disabled={form.payments.length <= 2}
                          title="Supprimer cette méthode"
                          style={{
                            width: 32, height: 32, borderRadius: 8,
                            border: "0.5px solid " + colors.inputBorder,
                            background: colors.inputBg,
                            color: form.payments.length <= 2 ? colors.dim : colors.muted,
                            cursor: form.payments.length <= 2 ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontFamily: "inherit",
                          }}>
                    <Icon paths={PATH_X} size={12}
                          color={form.payments.length <= 2 ? colors.dim : colors.muted} />
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: 10, gap: 8, flexWrap: "wrap",
          }}>
            <button type="button"
                    onClick={addPaymentRow}
                    disabled={form.payments.length >= 4}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "8px 12px", borderRadius: 8, border: "0.5px solid " + colors.inputBorder,
                      background: colors.inputBg, color: colors.text,
                      cursor: form.payments.length >= 4 ? "not-allowed" : "pointer",
                      opacity: form.payments.length >= 4 ? 0.5 : 1,
                      fontSize: 12, fontWeight: 500, fontFamily: "inherit",
                    }}>
              <Icon paths={PATH_PLUS} size={12} color={colors.text} />
              {"Ajouter une méthode"}
            </button>
            <div style={{
              fontSize: 12, fontWeight: 500,
              color: sumOk ? "#1D9E75" : "#BA7517",
              fontFamily: MONO,
            }}>
              {"Somme : " + Number(sum || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " DA / " + Number(total || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " DA"}
              {sumOk ? "  ✓" : ""}
            </div>
          </div>
        </>
      )}

      {/* ── Montant total — pivot des calculs ────────────────────────────
          Positionné en BAS de la section Paiement (et non plus dans
          EditRecap) pour que les erreurs business (somme paiements ≠ total,
          somme prestations ≠ total, prestations ≠ paiements) s'affichent
          directement sous le champ qui en est responsable. */}
      <div style={{
        marginTop: 12, paddingTop: 12,
        borderTop: "0.5px solid " + colors.separator,
      }}>
        <Field label="Montant total (DA)" colors={colors}>
          <input type="number" step="0.01" min="0"
                 value={form.total_amount}
                 onChange={e => updateForm({ total_amount: e.target.value })}
                 style={inputStyle(colors)} />
        </Field>
        {errBanner && (
          <div role="alert" style={{
            marginTop: 8,
            padding: "8px 10px", borderRadius: 8,
            background: "#fef2f2", border: "0.5px solid #fecaca",
            color: "#991b1b", fontSize: 12, lineHeight: 1.4,
            display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            <span style={{
              flexShrink: 0, width: 16, height: 16, borderRadius: 99,
              background: "#fee2e2", color: "#991b1b",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 500,
            }}>!</span>
            <span style={{ flex: 1 }}>{errBanner}</span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Primitives ──────────────────────────────────────────────────────────────

function SectionCard({ colors, title, children }) {
  return (
    <div style={{
      borderRadius: 10, background: colors.cardBg,
      border: "0.5px solid " + colors.border,
      padding: 12,
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      {title && (
        <div style={{
          fontSize: 11, fontWeight: 500,
          color: colors.muted, textTransform: "uppercase",
          letterSpacing: 0.3, marginBottom: 4,
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function Field({ label, colors, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: colors.muted }}>{label}</span>
      {children}
    </label>
  );
}

function inputStyle(colors) {
  return {
    width: "100%", boxSizing: "border-box",
    padding: "9px 10px", borderRadius: 8,
    border: "0.5px solid " + colors.inputBorder,
    background: colors.inputBg, color: colors.text,
    fontSize: 13, fontFamily: "inherit",
    outline: "none",
  };
}

function Badge({ bg, color, label, iconPaths }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 999,
      background: bg, color: color,
      fontSize: 11, fontWeight: 500, lineHeight: 1.3,
      whiteSpace: "nowrap",
    }}>
      {iconPaths && <Icon paths={iconPaths} size={11} color={color} />}
      {label}
    </span>
  );
}

function FooterButton({ onClick, disabled, title, colors, iconPaths, label, variant }) {
  const isPrimary = variant === "primary";
  const isDanger  = variant === "danger";
  const bg = isPrimary ? colors.text : "transparent";
  const fg = isPrimary ? colors.drawerBg
           : isDanger  ? "#A32D2D"
           : colors.text;
  const border = isPrimary ? "none"
               : isDanger  ? "0.5px solid #E24B4A"
               : "0.5px solid " + colors.inputBorder;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        flex: 1, padding: "10px 12px", borderRadius: 8,
        background: bg, color: fg, border,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontSize: 13, fontWeight: 500, fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>
      {iconPaths && <Icon paths={iconPaths} size={13} color={fg} />}
      {label}
    </button>
  );
}

// ── Items granulaires ───────────────────────────────────────────────────────
// Mode lecture : liste structurée des prestations + total. Si la tx n'a pas
// d'items en BDD (legacy), on retombe sur tx.description avec un libellé
// explicite pour ne pas faire croire à un bug.
function ItemsView({ tx, colors, grossCents }) {
  const items = Array.isArray(tx?.items) ? tx.items : [];
  if (items.length === 0) {
    if (!tx?.description) return null;
    return (
      <SectionCard colors={colors} title="Description">
        <p style={{ fontSize: 13, color: colors.text, margin: 0, lineHeight: 1.45 }}>
          {tx.description}
        </p>
        <p style={{ fontSize: 11, color: colors.muted, fontStyle: "italic",
                    margin: "6px 0 0", lineHeight: 1.4 }}>
          {"(Transaction sans détail de prestations en base — affichage simplifié.)"}
        </p>
      </SectionCard>
    );
  }
  return (
    <SectionCard colors={colors} title="Prestations">
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {items.map((it, idx) => {
          const q = parseInt(it.qty || 1, 10) || 1;
          const unit = parseFloat(it.unit_price) || 0;
          const lineTotal = q * unit;
          return (
            <div key={idx} style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              padding: "7px 0",
              borderBottom: idx < items.length - 1
                ? "0.5px solid " + colors.separator
                : "none",
              fontSize: 13, gap: 10,
            }}>
              <span style={{
                color: colors.text, flex: 1, minWidth: 0,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                <span style={{ fontWeight: 500, color: colors.muted, marginRight: 4 }}>
                  {q + "×"}
                </span>
                {it.service_name || "Prestation"}
              </span>
              <span style={{
                color: colors.muted, fontSize: 12, flexShrink: 0,
                fontFamily: MONO, fontVariantNumeric: "tabular-nums",
              }}>
                {Number(unit || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " DA"}
              </span>
              <span style={{
                color: colors.text, fontWeight: 500, minWidth: 64,
                textAlign: "right", flexShrink: 0,
                fontFamily: MONO, fontVariantNumeric: "tabular-nums",
              }}>
                {Number(lineTotal || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " DA"}
              </span>
            </div>
          );
        })}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          paddingTop: 8, marginTop: 4,
          borderTop: "0.5px solid " + colors.border,
          fontSize: 13, fontWeight: 500, color: colors.text,
        }}>
          <span>{"Total prestations"}</span>
          <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
            {formatCents(grossCents)}
          </span>
        </div>
      </div>
    </SectionCard>
  );
}

// Mode édition : inputs qty + ServiceDropdown + unit_price + bouton remove.
// Bouton "Ajouter une prestation" + bandeau d'écart vs montant total si
// somme(items) ≠ form.total_amount + bouton Synchroniser.
function ItemsEdit({ form, setItem, addItem, removeItem, syncTotalToItems, colors, dropdownContext }) {
  const items = form?.items || [];
  const totalAmount = parseAmount(form?.total_amount);
  const itemsSum = items.reduce(
    (s, it) => s + (parseAmount(it.qty) * parseAmount(it.unit_price)),
    0
  );
  const diff = itemsSum - totalAmount;
  const mismatch = Math.abs(diff) > 0.01;

  return (
    <SectionCard colors={colors} title="Prestations">
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: colors.muted, fontStyle: "italic",
                    margin: 0, lineHeight: 1.45 }}>
          {"Aucune prestation détaillée. Ajoutez-en une pour activer l'édition fine."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it, idx) => (
            <div key={idx} style={{
              display: "grid",
              gridTemplateColumns: "56px 1fr 86px auto",
              gap: 6, alignItems: "center",
            }}>
              <input type="number" min="1" step="1"
                     value={it.qty}
                     onChange={e => setItem(idx, { qty: e.target.value })}
                     aria-label="Quantité"
                     style={{
                       width: "100%", boxSizing: "border-box",
                       padding: "8px 8px", borderRadius: 6,
                       border: "0.5px solid " + colors.inputBorder,
                       background: colors.inputBg, color: colors.text,
                       fontSize: 12, fontFamily: "inherit", outline: "none",
                       textAlign: "center",
                     }} />
              <ServiceDropdown
                value={it.service_id}
                displayName={it.service_name}
                context={dropdownContext}
                onChange={(svc) => {
                  // is_free_price (catalogue caisse uniquement) : ne PAS
                  // auto-remplir unit_price — le caissier doit le saisir.
                  const patch = { service_id: svc.id, service_name: svc.name };
                  if (!svc.is_free_price && svc.price != null) {
                    patch.unit_price = String(Number(svc.price).toFixed(2));
                  }
                  setItem(idx, patch);
                }}
                colors={colors}
              />
              <input type="number" min="0" step="0.01"
                     value={it.unit_price}
                     onChange={e => setItem(idx, { unit_price: e.target.value })}
                     aria-label="Prix unitaire (DA)"
                     style={{
                       width: "100%", boxSizing: "border-box",
                       padding: "8px 8px", borderRadius: 6,
                       border: "0.5px solid " + colors.inputBorder,
                       background: colors.inputBg, color: colors.text,
                       fontSize: 12, fontFamily: MONO, outline: "none",
                       textAlign: "right",
                     }} />
              <button type="button"
                      onClick={() => removeItem(idx)}
                      aria-label="Supprimer cette prestation"
                      title="Supprimer"
                      style={{
                        width: 30, height: 30, borderRadius: 6,
                        border: "0.5px solid " + colors.inputBorder,
                        background: colors.inputBg, color: "#A32D2D",
                        cursor: "pointer", fontFamily: "inherit",
                        fontSize: 14, lineHeight: 1,
                      }}>
                {"×"}
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={addItem}
              style={{
                marginTop: 8, padding: "7px 12px", borderRadius: 8,
                border: "0.5px dashed " + colors.inputBorder,
                background: "transparent", color: colors.text,
                cursor: "pointer", fontFamily: "inherit",
                fontSize: 12, fontWeight: 500, alignSelf: "flex-start",
              }}>
        {"+ Ajouter une prestation"}
      </button>

      {items.length > 0 && (
        <div style={{
          marginTop: 8, paddingTop: 8,
          borderTop: "0.5px solid " + colors.separator,
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          fontSize: 13, color: colors.text, fontWeight: 500,
        }}>
          <span>{"Total prestations"}</span>
          <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
            {Number(itemsSum || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " DA"}
          </span>
        </div>
      )}

      {mismatch && items.length > 0 && (
        <div style={{
          marginTop: 6, padding: "8px 10px", borderRadius: 8,
          background: "#FAEEDA", color: "#854F0B",
          fontSize: 11, lineHeight: 1.4,
          display: "flex", justifyContent: "space-between",
          alignItems: "center", gap: 8, flexWrap: "wrap",
        }}>
          <span>
            {"Écart de " + Number(Math.abs(diff) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
              + " DA entre le total prestations et le montant saisi."}
          </span>
          <button type="button" onClick={syncTotalToItems}
                  style={{
                    padding: "4px 10px", borderRadius: 6,
                    background: "#854F0B", color: "#fff",
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                    fontSize: 11, fontWeight: 500,
                  }}>
            {"Synchroniser"}
          </button>
        </div>
      )}
    </SectionCard>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTimeFR(tx) {
  const iso = tx?.created_at || (tx?.date && tx?.time ? tx.date + "T" + tx.time : tx?.date);
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = d.getDate();
  const months = ["janvier","février","mars","avril","mai","juin",
                  "juillet","août","septembre","octobre","novembre","décembre"];
  const month = months[d.getMonth()];
  const year  = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return day + " " + month + " " + year + " · " + hh + ":" + mm;
}

export default memo(TxDetailDrawerImpl);
