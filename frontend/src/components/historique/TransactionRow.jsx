// components/historique/TransactionRow.jsx — Refonte dense 6 colonnes.
// Layout horizontal compact (~64px de haut) : avatar + titre/meta + badges
// + paiements detailles + total/net + chevron. Cliquable → TxDetailDrawer.

import { memo, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { formatCents } from "../../utils/format";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const NBSP = " ";

// ── Helpers SVG (Tabler outline) ────────────────────────────────────────────
const SVG_BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const Icon = ({ paths, size = 14, color }) => (
  <svg {...SVG_BASE} width={size} height={size}
       style={{ color, flexShrink: 0, display: "block" }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);

// Paths inlines (terser-safe : on n'externalise PAS dans des consts partagees
// — cf. note historique TDZ dans la version precedente du fichier).
const PATH_CASH         = '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="10" x2="3" y2="10"/><line x1="21" y1="10" x2="21" y2="10"/>';
const PATH_BANK         = '<line x1="3" y1="21" x2="21" y2="21"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="5 6 12 3 19 6"/><line x1="4" y1="10" x2="4" y2="21"/><line x1="20" y1="10" x2="20" y2="21"/><line x1="8" y1="14" x2="8" y2="17"/><line x1="12" y1="14" x2="12" y2="17"/><line x1="16" y1="14" x2="16" y2="17"/>';
const PATH_CARD         = '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>';
const PATH_CARD_PAY     = '<path d="M12 19H5a2 2 0 0 1 -2 -2V7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v6"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16l3 3l-3 3"/>';
const PATH_GIFT         = '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>';
const PATH_DOTS         = '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';
const PATH_BOLT         = '<path d="M13 3l-9 12h6l-1 8l9 -12h-6l1 -8z"/>';
const PATH_WORLD        = '<circle cx="12" cy="12" r="9"/><line x1="3.6" y1="9" x2="20.4" y2="9"/><line x1="3.6" y1="15" x2="20.4" y2="15"/><path d="M11.5 3a17 17 0 0 0 0 18"/><path d="M12.5 3a17 17 0 0 1 0 18"/>';
const PATH_PHONE        = '<path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2"/>';
const PATH_CASH_REG     = '<rect x="3" y="9" width="18" height="11" rx="2"/><path d="M5 9V5h14v4"/><line x1="7" y1="13" x2="9" y2="13"/><line x1="11" y1="13" x2="13" y2="13"/><line x1="15" y1="13" x2="17" y2="13"/><line x1="7" y1="17" x2="9" y2="17"/><line x1="11" y1="17" x2="13" y2="17"/><line x1="15" y1="17" x2="17" y2="17"/>';
const PATH_CAL_CHECK    = '<rect x="4" y="5" width="16" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="4" y1="11" x2="20" y2="11"/><polyline points="9 16 11 18 15 14"/>';
const PATH_CAL          = '<rect x="4" y="5" width="16" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="4" y1="11" x2="20" y2="11"/>';
const PATH_CLOCK        = '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>';
const PATH_USER         = '<circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/>';
const PATH_USER_CIRCLE  = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 17.5a6.5 6.5 0 0 1 11 0"/>';
const PATH_SHUFFLE      = '<path d="M18 4l3 3l-3 3"/><path d="M18 20l3 -3l-3 -3"/><path d="M3 7h3a5 5 0 0 1 5 5a5 5 0 0 0 5 5h5"/><path d="M21 7h-5a4.978 4.978 0 0 0 -3 1"/><path d="M11 16a4.978 4.978 0 0 1 -3 1h-5"/>';
const PATH_LOCK         = '<rect x="5" y="11" width="14" height="10" rx="2"/><circle cx="12" cy="16" r="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
const PATH_ARROW_BACK   = '<path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/>';
const PATH_WALK         = '<circle cx="13" cy="4" r="1"/><path d="M7 21l3 -4"/><path d="M16 21l-2 -4l-3 -3l1 -6"/><path d="M6 12l2 -3l4 -1l3 3l3 1"/>';
const PATH_CHEVRON_R    = '<polyline points="9 6 15 12 9 18"/>';

// ── Helpers metier ──────────────────────────────────────────────────────────
const MONTHS_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

function formatDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.getDate() + " " + MONTHS_SHORT[d.getMonth()];
}

function formatTimeShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return h + ":" + m;
}

// Affiche la liste des prestations si tx.items est dispo, sinon fallback
// sur la description (rétro-compat transactions legacy sans items en BDD).
// Format : "2× Coupe homme · 1× Coupe femme". L'ellipsis CSS gère le débord.
function formatItemsList(tx) {
  if (Array.isArray(tx.items) && tx.items.length > 0) {
    return tx.items
      .map(it => {
        const q = parseInt(it.qty || it.quantity || 1, 10) || 1;
        const n = it.service_name || it.name || it.label || it.title || "Prestation";
        return q + "× " + n;
      })
      .join(" · ");
  }
  if (tx.description) return String(tx.description);
  return "Vente libre";
}

function isTransactionLocked(tx) {
  if (tx.stripe_payment_intent_id) return true;
  if (["REFUNDED", "STRIPE_100", "STRIPE_ACOMPTE"].includes(tx.payment_status)) return true;
  if (tx.payment_type === "refund") return true;
  if (tx.payment_method === "card_online") return true;
  if (tx.payment_source === "online_booking") return true;
  return false;
}

function isRefundTx(tx) {
  return tx.payment_type === "refund" || tx.payment_status === "REFUNDED";
}

// ── Meta methodes de paiement (badges + sous-lignes detaillees) ─────────────
const METHOD_META = {
  cash:        { label: "Espèces",    paths: PATH_CASH,     bg: "#E1F5EE", color: "#0F6E56" },
  transfer:    { label: "Virement",   paths: PATH_BANK,     bg: "#E1F5EE", color: "#0F6E56" },
  card:        { label: "CB",         paths: PATH_CARD,     bg: "#EEEDFE", color: "#3C3489" },
  card_local:  { label: "CB",         paths: PATH_CARD,     bg: "#EEEDFE", color: "#3C3489" },
  card_online: { label: "Stripe",     paths: PATH_CARD_PAY, bg: "#E6F1FB", color: "#0C447C" },
  gift_card:   { label: "Bon cadeau", paths: PATH_GIFT,     bg: "#FBEAF0", color: "#72243E" },
  other:       { label: "Autre",      paths: PATH_DOTS,     bg: "#F3F4F6", color: "#4B5563" },
};
function getMethodMeta(method) {
  return METHOD_META[method] || METHOD_META.other;
}

// ── Meta source (avatar + badge + fond ligne) ───────────────────────────────
function getSourceMeta(tx) {
  if (isRefundTx(tx)) {
    return {
      label: "Remboursé",
      paths: PATH_ARROW_BACK,
      badgeBg: "#FCEBEB", badgeColor: "#791F1F",
      avatarBg: "#F7C1C1", avatarColor: "#791F1F",
      rowBg: "#FCEBEB", rowOpacity: 0.85,
      rowBorder: null,
    };
  }
  const src = tx.payment_source;
  if (src === "walkin") {
    return {
      label: "Walk-in",
      paths: PATH_BOLT,
      badgeBg: "#FAEEDA", badgeColor: "#854F0B",
      avatarBg: "#FAEEDA", avatarColor: "#854F0B",
      avatarPaths: PATH_WALK,
      rowBg: "#FEF9ED", rowOpacity: 1,
      rowBorder: null,
    };
  }
  if (src === "online_booking") {
    return {
      label: "RDV en ligne",
      paths: PATH_WORLD,
      badgeBg: "#E6F1FB", badgeColor: "#0C447C",
      avatarBg: "#E6F1FB", avatarColor: "#185FA5",
      avatarPaths: PATH_CAL_CHECK,
      rowBg: null, rowOpacity: 1,
      rowBorder: true,
    };
  }
  if (src === "cash_register_rdv") {
    return {
      label: "Caisse RDV",
      paths: PATH_CASH_REG,
      badgeBg: "#C0DD97", badgeColor: "#27500A",
      avatarBg: "#C0DD97", avatarColor: "#27500A",
      avatarPaths: PATH_CASH_REG,
      rowBg: "#EAF3DE", rowOpacity: 1,
      rowBorder: null,
    };
  }
  if (src === "phone_internal") {
    return {
      label: "RDV téléphone",
      paths: PATH_PHONE,
      badgeBg: "#C0DD97", badgeColor: "#27500A",
      avatarBg: "#C0DD97", avatarColor: "#27500A",
      avatarPaths: PATH_CASH_REG,
      rowBg: "#EAF3DE", rowOpacity: 1,
      rowBorder: null,
    };
  }
  // Fallback : transaction non classifiee
  return {
    label: "Autre",
    paths: PATH_DOTS,
    badgeBg: "#F3F4F6", badgeColor: "#4B5563",
    avatarBg: "#F3F4F6", avatarColor: "#4B5563",
    avatarPaths: PATH_CASH,
    rowBg: null, rowOpacity: 1,
    rowBorder: true,
  };
}

// ── Composants internes ─────────────────────────────────────────────────────
function Badge({ label, bg, color, paths }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: 8,
      background: bg, color: color,
      fontSize: 10, fontWeight: 500, lineHeight: 1.4,
      whiteSpace: "nowrap",
    }}>
      {paths && <Icon paths={paths} size={10} color={color} />}
      {label}
    </span>
  );
}

function MetaItem({ paths, iconSize = 14, color, weight = 500, fontSize = 13, text, textColor }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize, fontWeight: weight, color: textColor,
      whiteSpace: "nowrap",
    }}>
      <Icon paths={paths} size={iconSize} color={color} />
      {text}
    </span>
  );
}

// ── Composant principal ─────────────────────────────────────────────────────
function TransactionRowImpl({ transaction: tx, isLast, onOpenDetail }) {
  const { theme: t } = useTheme();
  const [hover, setHover] = useState(false);

  const src       = getSourceMeta(tx);
  const refund    = isRefundTx(tx);
  const locked    = isTransactionLocked(tx);
  const breakdown = Array.isArray(tx.breakdown_payments) && tx.breakdown_payments.length >= 2
    ? tx.breakdown_payments
    : null;
  const isMulti   = !!breakdown;

  // Methode unique (cas non-multi). Mapping CASH_PAID → method reel.
  const singleMethod = (() => {
    if (tx.payment_status === "STRIPE_100" || tx.payment_status === "STRIPE_ACOMPTE") return "card_online";
    if (tx.payment_method) return tx.payment_method;
    if (tx.payment_status === "CASH_PAID") return "cash";
    return "other";
  })();

  // Montants
  const grossCents   = Math.abs(parseInt(tx.gross_amount_cents || 0, 10));
  const stripeFee    = parseInt(tx.stripe_fee_cents   || 0, 10);
  const platformFee  = parseInt(tx.platform_fee_cents || 0, 10);
  const netRaw       = parseInt(tx.net_amount_cents   || 0, 10);
  // Si la valeur net cents est renseignee (Stripe), on l'utilise. Sinon on
  // calcule gross - frais. Si pas de frais, net = gross.
  const netCents     = netRaw > 0
    ? netRaw
    : Math.max(0, grossCents - stripeFee - platformFee);
  const showNetLine  = netCents !== grossCents;

  // Date / heure
  const dateIso = tx.created_at || (tx.date && tx.time ? tx.date + "T" + tx.time : tx.date);
  const dateStr = formatDateShort(dateIso);
  const timeStr = tx.time ? tx.time.slice(0, 5) : formatTimeShort(dateIso);

  // Client : affiche uniquement pour les RDV (pas pour walk-in)
  const showClient = tx.client_name
    && tx.payment_source !== "walkin"
    && !refund;

  // Couleur du total
  const totalColor = refund ? "#E24B4A" : "#1D9E75";
  const totalSign  = refund ? "−" : "+";

  // Couleur du fond (avec hover : 10% plus fonce)
  const baseBg = src.rowBg || t.card;
  const hoverBg = src.rowBg
    ? darken(src.rowBg, 0.06)
    : (t.cardAlt || "rgba(0,0,0,0.03)");

  const clickable = typeof onOpenDetail === "function";

  return (
    <div
      onClick={clickable ? () => onOpenDetail(tx) : undefined}
      onMouseEnter={clickable ? () => setHover(true) : undefined}
      onMouseLeave={clickable ? () => setHover(false) : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetail(tx);
        }
      } : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "10px 14px",
        background: hover ? hoverBg : baseBg,
        opacity: src.rowOpacity,
        borderBottom: isLast ? "none" : "0.5px solid " + t.separator,
        borderLeft: src.rowBorder ? "0.5px solid " + t.border : "0.5px solid transparent",
        borderRight: src.rowBorder ? "0.5px solid " + t.border : "0.5px solid transparent",
        cursor: clickable ? "pointer" : "default",
        transition: "background 150ms ease",
        outline: "none",
      }}>

      {/* Col 1 — Avatar 36x36 */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: src.avatarBg,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon paths={src.avatarPaths || src.paths} size={18} color={src.avatarColor} />
      </div>

      {/* Col 2 — Titre + meta */}
      <div style={{ flex: 1.6, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{
          margin: 0, fontSize: 14, fontWeight: 500, color: t.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginBottom: 3,
        }}>
          {formatItemsList(tx)}
        </div>
        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center",
          gap: "0 12px", rowGap: 2,
        }}>
          {dateStr && (
            <MetaItem paths={PATH_CAL} iconSize={14} color={t.muted}
                      fontSize={13} weight={500} textColor={t.text}
                      text={dateStr} />
          )}
          {timeStr && (
            <MetaItem paths={PATH_CLOCK} iconSize={14} color={t.muted}
                      fontSize={13} weight={500} textColor={t.text}
                      text={timeStr} />
          )}
          {tx.employee_name && (
            <MetaItem paths={PATH_USER} iconSize={12} color={t.muted}
                      fontSize={13} weight={500} textColor={t.text}
                      text={tx.employee_name} />
          )}
          {showClient && (
            <MetaItem paths={PATH_USER_CIRCLE} iconSize={12} color={t.muted}
                      fontSize={11} weight={400} textColor={t.muted}
                      text={tx.client_name} />
          )}
        </div>
      </div>

      {/* Col 3 — Badges (source + multi/locked) */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 2,
        alignItems: "flex-start", flexShrink: 0,
      }}>
        <Badge label={src.label} bg={src.badgeBg} color={src.badgeColor} paths={src.paths} />
        {isMulti && (
          <Badge label={"Multi (" + breakdown.length + ")"}
                 bg="#F3F4F6" color="#4B5563" paths={PATH_SHUFFLE} />
        )}
        {locked && (
          <Badge label="Verrouillé" bg="#FCEBEB" color="#791F1F" paths={PATH_LOCK} />
        )}
      </div>

      {/* Col 4 — Paiements detailles */}
      <div style={{
        flex: 1.1, minWidth: 0,
        borderLeft: "0.5px solid rgba(0,0,0,0.08)",
        paddingLeft: 12,
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        {isMulti ? (
          breakdown.map((sub, i) => {
            const meta = getMethodMeta(sub.method);
            const subCents = Math.abs(parseInt(sub.amount_cents || 0, 10));
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 8, fontSize: 12,
              }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  color: t.muted, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  <Icon paths={meta.paths} size={13} color={t.muted} />
                  <span style={{
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{meta.label}</span>
                </span>
                <span style={{
                  fontWeight: 500, color: t.text,
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: MONO,
                  flexShrink: 0,
                }}>
                  {formatCents(subCents)}
                </span>
              </div>
            );
          })
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 9px", borderRadius: 8,
              background: getMethodMeta(singleMethod).bg,
              color: getMethodMeta(singleMethod).color,
              fontSize: 11, fontWeight: 500, lineHeight: 1.3,
              whiteSpace: "nowrap",
            }}>
              <Icon paths={getMethodMeta(singleMethod).paths} size={11}
                    color={getMethodMeta(singleMethod).color} />
              {getMethodMeta(singleMethod).label}
            </span>
            <span style={{
              fontSize: 13, fontWeight: 500, color: t.text,
              fontVariantNumeric: "tabular-nums",
              fontFamily: MONO,
            }}>
              {formatCents(grossCents)}
            </span>
          </div>
        )}
      </div>

      {/* Col 5 — Total + Net */}
      <div style={{
        minWidth: 90, flexShrink: 0, textAlign: "right",
      }}>
        <div style={{
          fontSize: 15, fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          fontFamily: MONO,
          color: totalColor, lineHeight: 1.2,
        }}>
          {totalSign + formatCents(grossCents)}
        </div>
        {showNetLine && (
          <div style={{
            fontSize: 10, color: t.dim,
            fontVariantNumeric: "tabular-nums",
            fontFamily: MONO,
            marginTop: 1,
          }}>
            {"Net" + NBSP + formatCents(netCents)}
          </div>
        )}
      </div>

      {/* Col 6 — Chevron */}
      <Icon paths={PATH_CHEVRON_R} size={16} color={t.dim} />
    </div>
  );
}

// Assombrit un hex/CSS color d'un facteur (0..1). Pour les fonds pastel, on
// vise ~6-10% plus fonce au hover. Implementation simple : convertit hex →
// rgb → applique un multiplicateur. Fallback : retourne la couleur d'origine.
function darken(color, amount) {
  if (!color || typeof color !== "string") return color;
  const hex = color.trim();
  if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) return color;
  let r, g, b;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  const f = Math.max(0, 1 - amount);
  r = Math.max(0, Math.min(255, Math.round(r * f)));
  g = Math.max(0, Math.min(255, Math.round(g * f)));
  b = Math.max(0, Math.min(255, Math.round(b * f)));
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

export default memo(TransactionRowImpl);
