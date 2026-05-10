// components/historique/TransactionRow.jsx — Ligne enrichie pour la liste
// /historique. Choisit icone, couleurs, pills selon payment_status +
// payment_source. Walk-in distinct visuellement (fond dore leger sur la ligne).

import { memo } from "react";
import { useTheme } from "../../hooks/useTheme";
import { formatCents, formatCentsSign, formatDate } from "../../utils/format";

// Palette stricte du design system FlowIA (cf docs/flowia-v03/01-design-system.md)
const PALETTE = {
  stripe: { bg: "#E6F1FB", text: "#042C53", accent: "#185FA5" },
  caisse: { bg: "#E1F5EE", text: "#04342C", accent: "#0F6E56" },
  walkin: { bg: "#FAEEDA", text: "#412402", accent: "#BA7517" },
  phone:  { bg: "#EEEDFE", text: "#26215C", accent: "#534AB7" },
  refund: { bg: "#FCEBEB", text: "#501313", accent: "#A32D2D" },
  noshow: { bg: "#FAECE7", text: "#4A1B0C", accent: "#712B13" },
  neutral:{ bg: "#F1EFE8", text: "#3a3933", accent: "#888780" },
  payoutOk: { bg: "#E1F5EE", text: "#04342C", accent: "#0F6E56" },
  payoutWait: { bg: "#FAEEDA", text: "#412402", accent: "#BA7517" },
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Icones Tabler (outline) inlinees ici. On evite de polluer utils/icons.jsx.
const SVG_BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const Icon = ({ paths, size = 20, color }) => (
  <svg {...SVG_BASE} width={size} height={size} style={{ color, flexShrink: 0 }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);
// ti-credit-card
const PATH_CREDIT_CARD     = '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>';
// ti-building-bank (virement)
const PATH_BANK            = '<line x1="3" y1="21" x2="21" y2="21"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="5 6 12 3 19 6"/><line x1="4" y1="10" x2="4" y2="21"/><line x1="20" y1="10" x2="20" y2="21"/><line x1="8" y1="14" x2="8" y2="17"/><line x1="12" y1="14" x2="12" y2="17"/><line x1="16" y1="14" x2="16" y2="17"/>';
// ti-gift (bon cadeau)
const PATH_GIFT            = '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>';
// ti-dots-circle (autre)
const PATH_DOTS            = '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';

// Mapping method → icône SVG + label FR pour les sous-lignes breakdown
// (commit C). Conforme FDS-2026 : icônes vectorielles, pas d'emoji.
const BREAKDOWN_METHOD_META = {
  cash:      { paths: PATH_CASH,        label: "Espèces"     },
  transfer:  { paths: PATH_BANK,        label: "Virement"    },
  card:      { paths: PATH_CREDIT_CARD, label: "CB physique" },
  gift_card: { paths: PATH_GIFT,        label: "Bon cadeau"  },
  other:     { paths: PATH_DOTS,        label: "Autre"       },
};
// ti-credit-card-pay (carte + fleche bas-droite)
const PATH_CREDIT_CARD_PAY = '<path d="M12 19H5a2 2 0 0 1 -2 -2V7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v6"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16l3 3l-3 3"/>';
// ti-cash
const PATH_CASH            = '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="10" x2="3" y2="10"/><line x1="21" y1="10" x2="21" y2="10"/>';
// ti-walk (icone marcheur)
const PATH_WALK            = '<circle cx="13" cy="4" r="1"/><path d="M7 21l3 -4"/><path d="M16 21l-2 -4l-3 -3l1 -6"/><path d="M6 12l2 -3l4 -1l3 3l3 1"/>';
// ti-arrow-back-up
const PATH_ARROW_BACK_UP   = '<path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/>';
// ti-clock-hour-3
const PATH_CLOCK_3         = '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 12"/>';
// ti-circle-check
const PATH_CIRCLE_CHECK    = '<circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/>';

// Determine icone + couleurs selon payment_status / payment_source.
function getIconConfig(tx) {
  const ps  = tx.payment_status;
  const src = tx.payment_source;
  if (ps === "REFUNDED") {
    return { paths: PATH_ARROW_BACK_UP, bg: PALETTE.refund.bg, color: PALETTE.refund.accent };
  }
  if (ps === "STRIPE_ACOMPTE") {
    return { paths: PATH_CREDIT_CARD_PAY, bg: PALETTE.walkin.bg, color: PALETTE.walkin.accent };
  }
  if (src === "walkin") {
    return { paths: PATH_WALK, bg: PALETTE.walkin.bg, color: PALETTE.walkin.accent };
  }
  if (ps === "STRIPE_100" || src === "online_booking") {
    return { paths: PATH_CREDIT_CARD, bg: PALETTE.stripe.bg, color: PALETTE.stripe.accent };
  }
  if (src === "cash_register_rdv" || ps === "CASH_PAID") {
    return { paths: PATH_CASH, bg: PALETTE.caisse.bg, color: PALETTE.caisse.accent };
  }
  // Fallback : transaction non classifiee (ex : type='expense' mal filtre)
  return { paths: PATH_CASH, bg: PALETTE.neutral.bg, color: PALETTE.neutral.accent };
}

const STATUS_LABELS = {
  STRIPE_100:       "Stripe 100%",
  STRIPE_ACOMPTE:   "Acompte Stripe",
  NOT_PAID:         "Pas encore payé",
  CASH_PAID:        "Encaissé caisse",
  REFUNDED:         "Stripe remboursé",
  NO_SHOW_RETAINED: "No-show retenu",
};
function getStatusPill(tx) {
  const ps = tx.payment_status;
  if (!ps) return null;
  let palette;
  if (ps === "STRIPE_100") palette = PALETTE.stripe;
  else if (ps === "STRIPE_ACOMPTE") palette = PALETTE.walkin;
  else if (ps === "CASH_PAID") palette = PALETTE.caisse;
  else if (ps === "REFUNDED") palette = PALETTE.refund;
  else if (ps === "NO_SHOW_RETAINED") palette = PALETTE.noshow;
  else palette = PALETTE.neutral;
  // Pour CASH_PAID : differencier especes / carte locale dans le label
  let label = STATUS_LABELS[ps] || ps;
  if (ps === "CASH_PAID") {
    if (tx.payment_method === "cash") label = "Espèces";
    else if (tx.payment_method === "card_local") label = "Carte locale";
    else if (tx.payment_method === "transfer") label = "Virement";
  }
  return { label, bg: palette.bg, color: palette.accent };
}

const SOURCE_LABELS = {
  online_booking:    "Booking en ligne",
  phone_internal:    "RDV téléphone",
  cash_register_rdv: "Caisse RDV",
  walkin:            "⚡ Walk-in (sans RDV)",
};
function getSourcePill(tx) {
  const src = tx.payment_source;
  if (!src) return null;
  let palette;
  if (src === "online_booking") palette = PALETTE.stripe;
  else if (src === "phone_internal") palette = PALETTE.phone;
  else if (src === "cash_register_rdv") palette = PALETTE.caisse;
  else if (src === "walkin") palette = PALETTE.walkin;
  else palette = PALETTE.neutral;
  let label = SOURCE_LABELS[src] || src;
  // "RDV téléphone (par EMPLOYE)" si on a le nom employé
  if (src === "phone_internal" && tx.employee_name) {
    label = "RDV téléphone (par " + tx.employee_name + ")";
  }
  return { label, bg: palette.bg, color: palette.accent };
}

// Pill payout (uniquement pour les paiements Stripe en ligne)
function getPayoutPill(tx) {
  const ps = tx.payment_status;
  if (ps !== "STRIPE_100" && ps !== "STRIPE_ACOMPTE") return null;
  if (tx.payout_received_at) {
    return { label: "Payout reçu", bg: PALETTE.payoutOk.bg, color: PALETTE.payoutOk.accent, paths: PATH_CIRCLE_CHECK };
  }
  return { label: "En attente", bg: PALETTE.payoutWait.bg, color: PALETTE.payoutWait.accent, paths: PATH_CLOCK_3 };
}

// Couleur du montant principal selon le statut
function getAmountStyle(tx) {
  if (tx.payment_status === "REFUNDED") return { color: PALETTE.refund.accent, sign: "−" };
  if (tx.payment_status === "STRIPE_ACOMPTE") return { color: PALETTE.walkin.accent, sign: "+" };
  return { color: PALETTE.caisse.accent, sign: "+" };
}

function buildTitle(tx) {
  const client = tx.client_name || (tx.payment_source === "walkin" ? "client anonyme" : "client");
  // Priorite : description (souvent "Service — Client" ou texte specifique)
  if (tx.description) {
    // Si description est generique, on enrichit avec le client_name
    if (/^(Paiement en ligne RDV|Acompte en ligne RDV|Encaissement RDV|Remboursement RDV)$/i.test(tx.description)) {
      return tx.description + " — " + client;
    }
    return tx.description;
  }
  if (tx.payment_source === "walkin") return "Vente — " + client;
  return "Prestation — " + client;
}

function Pill({ label, bg, color, paths }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: 999,
      background: bg, color: color,
      fontSize: 10, fontWeight: 500, lineHeight: 1.4,
      whiteSpace: "nowrap",
    }}>
      {paths && <Icon paths={paths} size={10} color={color} />}
      {label}
    </span>
  );
}

function TransactionRowImpl({ transaction: tx, isLast }) {
  const { theme: t } = useTheme();
  const cfg     = getIconConfig(tx);
  const statusP = getStatusPill(tx);
  const sourceP = getSourcePill(tx);
  const payoutP = getPayoutPill(tx);
  const amount  = getAmountStyle(tx);
  const isWalkin = tx.payment_source === "walkin";

  // Breakdown multi-paiement (commit C). breakdown_payments = array
  // [{method, amount_cents}, ...] uniquement si payment_group_id IS NOT NULL.
  // Les rows legacy (payment_method='multi' sans group) ont breakdown_payments
  // null → on affiche le badge "Détail non disponible (legacy)".
  const breakdown = Array.isArray(tx.breakdown_payments) && tx.breakdown_payments.length >= 2
    ? tx.breakdown_payments
    : null;
  const isLegacyMulti = !breakdown && tx.payment_method === "multi";

  const grossCents   = Math.abs(parseInt(tx.gross_amount_cents || 0, 10));
  const netCents     = parseInt(tx.net_amount_cents || 0, 10);
  const stripeFee    = parseInt(tx.stripe_fee_cents || 0, 10);
  const platformFee  = parseInt(tx.platform_fee_cents || 0, 10);
  const isStripe     = tx.payment_status === "STRIPE_100" || tx.payment_status === "STRIPE_ACOMPTE";
  const isAcompte    = tx.payment_status === "STRIPE_ACOMPTE";
  const isRefund     = tx.payment_status === "REFUNDED";
  // Total du RDV pour acompte (estimation : si on a payment_type='deposit' et
  // un appointment_id, on n'a pas le total ici cote /historique. On affiche
  // juste le brut de l'acompte. Le "/Y,XX € total" sera remontable via
  // fetch separe sur l'appointment, hors scope ici.)

  const dateIso = tx.created_at || (tx.date && tx.time ? tx.date + "T" + tx.time : tx.date);
  const dateStr = formatDate(dateIso);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "14px 16px",
      borderBottom: isLast ? "none" : "0.5px solid " + t.separator,
      background: isWalkin ? "rgba(250, 238, 218, 0.30)" : "transparent",
    }}>
      {/* Icone gauche 40x40 */}
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: cfg.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon paths={cfg.paths} size={20} color={cfg.color} />
      </div>

      {/* Centre : titre + pills + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 14, fontWeight: 500, color: t.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {buildTitle(tx)}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
          {statusP && <Pill {...statusP} />}
          {sourceP && <Pill {...sourceP} />}
          {payoutP && <Pill {...payoutP} />}
          {isLegacyMulti && (
            <span style={{
              fontSize: 11, color: t.muted, fontStyle: "italic",
            }}>
              {"Détail non disponible (legacy)"}
            </span>
          )}
        </div>
        {breakdown && (
          <div style={{
            marginTop: 6,
            display: "flex", flexDirection: "column", gap: 2,
            paddingLeft: 4,
          }}>
            {breakdown.map((sub, i) => {
              const meta = BREAKDOWN_METHOD_META[sub.method] || BREAKDOWN_METHOD_META.other;
              const subCents = Math.abs(parseInt(sub.amount_cents || 0, 10));
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 12, color: "rgba(0,0,0,0.65)",
                }}>
                  <span style={{ color: t.muted, flexShrink: 0 }}>{"├─"}</span>
                  <Icon paths={meta.paths} size={12} color="rgba(0,0,0,0.55)" />
                  <span style={{ flex: 1 }}>{meta.label}</span>
                  <span style={{ fontFamily: MONO, color: "rgba(0,0,0,0.75)" }}>
                    {formatCents(subCents)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <p style={{
          margin: "5px 0 0", fontSize: 12, color: t.muted,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {dateStr}
          {tx.employee_name ? " · " + tx.employee_name : ""}
          {isStripe && grossCents > 0 ? (
            <>
              {" · brut " + formatCents(grossCents)}
              {stripeFee   > 0 ? " · frais Stripe −" + formatCents(stripeFee)   : ""}
              {platformFee > 0 ? " · commission FlowIA −" + formatCents(platformFee) : ""}
            </>
          ) : null}
        </p>
      </div>

      {/* Droite : montant principal + sous-texte */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{
          fontSize: 16, fontWeight: 500, fontFamily: MONO,
          color: amount.color,
          lineHeight: 1.2,
        }}>
          {amount.sign + formatCents(grossCents)}
        </div>
        <div style={{ fontSize: 10, color: t.muted, marginTop: 3, fontFamily: MONO }}>
          {isRefund
            ? "Impact net : 0" + " " + "€"
            : isAcompte
              ? "Acompte"
              : netCents > 0
                ? "Net : " + formatCents(netCents)
                : ""}
        </div>
      </div>
    </div>
  );
}

export default memo(TransactionRowImpl);
