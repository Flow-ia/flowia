// components/stats/PayoutHistoryRow.jsx — Ligne de l'historique des
// reversements (table payouts v3, alimentee par webhook payout.{paid,failed}).
// Tag de statut colore (vert / dore / rouge) selon payout.status.

import { memo } from "react";
import { useTheme } from "../../hooks/useTheme";
import { formatCents, formatDate, formatDateLong } from "../../utils/format";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const SVG_BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
// ti-arrow-down (descend en banque)
const PATH_ARROW_DOWN = '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>';
// ti-circle-check
const PATH_CHECK = '<circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/>';
// ti-clock-hour-3
const PATH_CLOCK = '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 12"/>';
// ti-x
const PATH_X = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';

const Icon = ({ paths, size = 20, color }) => (
  <svg {...SVG_BASE} width={size} height={size} style={{ color, flexShrink: 0 }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);

const STATUS_CONFIG = {
  paid:       { label: "Reçu",       bg: "#E1F5EE", color: "#085041", paths: PATH_CHECK },
  in_transit: { label: "En transit", bg: "#FAEEDA", color: "#BA7517", paths: PATH_CLOCK },
  pending:    { label: "En attente", bg: "#FAEEDA", color: "#BA7517", paths: PATH_CLOCK },
  failed:     { label: "Échec",      bg: "#FCEBEB", color: "#A32D2D", paths: PATH_X },
  canceled:   { label: "Annulé",     bg: "#F1EFE8", color: "#3a3933", paths: PATH_X },
};

function PayoutHistoryRowImpl({ payout, isLast }) {
  const { theme: t } = useTheme();
  const cfg = STATUS_CONFIG[payout.status] || STATUS_CONFIG.pending;

  const requestedDate = formatDate(payout.requested_at);
  const arrivalDate   = payout.completed_at
    ? formatDateLong(payout.completed_at)
    : (payout.arrival_date ? formatDateLong(payout.arrival_date) : null);
  const last4         = payout.bank_account_last4 ? "****" + payout.bank_account_last4 : null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "14px 16px",
      borderBottom: isLast ? "none" : "0.5px solid " + t.separator,
    }}>
      {/* Icone gauche 40x40 */}
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: "#E1F5EE",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon paths={PATH_ARROW_DOWN} size={20} color="#0F6E56" />
      </div>

      {/* Centre */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: t.text }}>
            {"Reversement du " + requestedDate}
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 7px", borderRadius: 999,
            background: cfg.bg, color: cfg.color,
            fontSize: 10, fontWeight: 500,
          }}>
            <Icon paths={cfg.paths} size={10} color={cfg.color} />
            {cfg.label}
          </span>
        </div>
        <p style={{
          margin: "4px 0 0", fontSize: 12, color: t.muted,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {last4 ? "Compte " + last4 : "Compte bancaire Stripe"}
          {arrivalDate ? " · arrivé le " + arrivalDate : ""}
          {payout.failure_reason ? " · " + payout.failure_reason : ""}
        </p>
      </div>

      {/* Droite */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{
          fontSize: 16, fontWeight: 500, fontFamily: MONO,
          color: t.text, lineHeight: 1.2,
        }}>
          {formatCents(payout.amount_cents || 0)}
        </div>
        {payout.triggered_by_employee_name && (
          <div style={{ fontSize: 10, color: t.muted, marginTop: 3 }}>
            {"par " + payout.triggered_by_employee_name}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PayoutHistoryRowImpl);
