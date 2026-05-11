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
    };
  }

  const locked = isTransactionLocked(transaction);
  const reason = locked ? lockReason(transaction) : null;

  const hasUnsavedChanges = useMemo(() => {
    if (!editMode || !form || !transaction) return false;
    const initial = buildInitialForm(transaction);
    return JSON.stringify(initial) !== JSON.stringify(form);
  }, [editMode, form, transaction]);

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
  function validate() {
    if (!form) return "Données invalides";
    const total = parseAmount(form.total_amount);
    if (!Number.isFinite(total) || total <= 0) return "Montant invalide";
    if (!form.date) return "Date requise";
    if (form.is_multi) {
      if (form.payments.length < 2) return "Au moins 2 méthodes requises";
      if (form.payments.length > 4) return "Maximum 4 méthodes autorisées";
      const seen = new Set();
      let sum = 0;
      for (const p of form.payments) {
        if (!METHOD_META[p.method]) return "Méthode invalide";
        if (p.method === "card_online") return "Le paiement Stripe en ligne n'est pas autorisé en multi";
        if (seen.has(p.method)) return "Vous ne pouvez pas saisir 2 fois la même méthode";
        seen.add(p.method);
        const a = parseAmount(p.amount);
        if (!Number.isFinite(a) || a <= 0) return "Montant invalide pour une méthode";
        sum += a;
      }
      // Tolerance 1 centime (arrondis fr-FR).
      if (Math.abs(sum - total) > 0.01) {
        return "La somme des paiements doit égaler le total";
      }
    } else {
      if (!form.payments[0] || !METHOD_META[form.payments[0].method]) {
        return "Méthode invalide";
      }
    }
    return null;
  }

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
    setSaving(true);
    try {
      const total = parseAmount(form.total_amount);
      const body = {
        amount: total,
        description: form.description || null,
        employee_id: form.employee_id || null,
        date: form.date,
        time: form.time || null,
      };
      if (form.is_multi) {
        body.payments = form.payments.map(p => ({
          method: p.method,
          amount: parseAmount(p.amount),
        }));
        body.payment_method = "multi";
      } else {
        body.payment_method = form.payments[0]?.method || "cash";
        body.payments = [{ method: body.payment_method, amount: total }];
      }
      await onPatch?.(transaction.id, body);
      setEditMode(false);
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
              {errBanner && (
                <div style={{
                  padding: "10px 12px", borderRadius: 8,
                  background: "#fef2f2", border: "0.5px solid #fecaca",
                  color: "#991b1b", fontSize: 13, lineHeight: 1.4,
                }}>
                  {errBanner}
                </div>
              )}

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

              {/* Section 2 — Repartition */}
              {!editMode ? (
                isMulti ? (
                  <BreakdownView breakdown={breakdownArr} colors={colors} />
                ) : null
              ) : (
                <BreakdownEdit
                  form={form}
                  toggleMulti={toggleMulti}
                  setPayment={setPayment}
                  addPaymentRow={addPaymentRow}
                  removePaymentRow={removePaymentRow}
                  colors={colors}
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

            {/* Footer */}
            <div style={{
              flexShrink: 0,
              padding: "12px 16px",
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
                    disabled={saving}
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
        {tx.description || (src === "walkin" ? "Vente walk-in" : "Prestation")}
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
        <FeeLine label="Commission FlowIA" value={"−" + formatCents(platformFee)} colors={colors} muted />
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
  return (
    <SectionCard colors={colors} title="Informations">
      <MetaRow label="Client"   value={tx.client_name || "—"} colors={colors} />
      <MetaRow label="Employé"  value={tx.employee_name || "—"} colors={colors} />
      <MetaRow label="Source"   value={srcLb} colors={colors} />
      <MetaRow label="ID Transaction" value={tx.id} colors={colors} mono small selectable />
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Field label="Description" colors={colors}>
        <input type="text" value={form.description}
               onChange={e => updateForm({ description: e.target.value })}
               placeholder="Description ou nom du service"
               style={inputStyle(colors)} />
      </Field>
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
      <Field label="Montant total (€)" colors={colors}>
        <input type="number" step="0.01" min="0"
               value={form.total_amount}
               onChange={e => updateForm({ total_amount: e.target.value })}
               style={inputStyle(colors)} />
      </Field>
    </div>
  );
}

function BreakdownEdit({ form, toggleMulti, setPayment, addPaymentRow, removePaymentRow, colors }) {
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
              {"Somme : " + sum.toFixed(2).replace(".", ",") + " € / " + total.toFixed(2).replace(".", ",") + " €"}
              {sumOk ? "  ✓" : ""}
            </div>
          </div>
        </>
      )}
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
