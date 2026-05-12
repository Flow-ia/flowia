// components/historique/HistoriqueKPI.jsx — 5 KPI cards en grille
// horizontale (CA total / En ligne / Caisse RDV / Walk-in / Rembourses).
// Couleurs strictes du design system FlowIA v3.

import { memo } from "react";
import { useTheme } from "../../hooks/useTheme";
import { formatCents } from "../../utils/format";
import { LedgerDebugBadge } from "../LedgerDebugBadge";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// 5 cards : CA total (neutre) + 4 sources colorees.
// Couleurs : cf docs/flowia-v03/01-design-system.md.
function buildCards(totals, t) {
  const totalCount = (totals.en_ligne_count || 0)
                   + (totals.caisse_rdv_count || 0)
                   + (totals.walkin_count || 0)
                   + (totals.refunded_count || 0);
  return [
    {
      label: "CA TOTAL",
      cents: totals.ca_total_cents,
      sub: totalCount + (totalCount > 1 ? " transactions" : " transaction"),
      bg: t.card,
      border: t.border,
      labelColor: t.muted,
      valueColor: t.text,
      subColor: t.muted,
      neg: false,
    },
    {
      label: "EN LIGNE",
      cents: totals.en_ligne_cents,
      sub: totals.en_ligne_count + (totals.en_ligne_count > 1 ? " paiements" : " paiement"),
      bg: "#E6F1FB", border: "#B5D4F4",
      labelColor: "#185FA5", valueColor: "#042C53", subColor: "#185FA5",
      neg: false,
    },
    {
      label: "CAISSE RDV",
      cents: totals.caisse_rdv_cents,
      sub: totals.caisse_rdv_count + (totals.caisse_rdv_count > 1 ? " encaissements" : " encaissement"),
      bg: "#E1F5EE", border: "#9FE1CB",
      labelColor: "#0F6E56", valueColor: "#04342C", subColor: "#0F6E56",
      neg: false,
    },
    {
      label: "WALK-IN",
      cents: totals.walkin_cents,
      sub: totals.walkin_count + " sans RDV",
      bg: "#FAEEDA", border: "#FAC775",
      labelColor: "#BA7517", valueColor: "#412402", subColor: "#BA7517",
      neg: false,
    },
    {
      label: "REMBOURSÉS",
      cents: totals.refunded_cents,
      sub: totals.refunded_count + (totals.refunded_count > 1 ? " remboursés" : " remboursé"),
      bg: "#FCEBEB", border: "#F7C1C1",
      labelColor: "#A32D2D", valueColor: "#501313", subColor: "#A32D2D",
      neg: true,
    },
  ];
}

function HistoriqueKPIImpl({ totals, ledgerDebug }) {
  const { theme: t } = useTheme();
  const cards = buildCards(totals || {}, t);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ledgerDebug && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: t.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {"Source totals"}
          </span>
          <LedgerDebugBadge debug={ledgerDebug}/>
        </div>
      )}
      <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      gap: 10,
    }}>
      {cards.map((c) => (
        <div key={c.label} style={{
          padding: "14px 16px",
          borderRadius: 12,
          background: c.bg,
          border: "0.5px solid " + c.border,
          display: "flex", flexDirection: "column", gap: 6,
          minWidth: 0,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 500, color: c.labelColor,
            textTransform: "uppercase", letterSpacing: "0.04em",
          }}>
            {c.label}
          </span>
          <span style={{
            fontSize: 22, fontWeight: 500, color: c.valueColor,
            fontFamily: MONO, lineHeight: 1.1,
          }}>
            {(c.neg && Math.abs(c.cents) > 0 ? "−" : "") + formatCents(Math.abs(c.cents || 0))}
          </span>
          <span style={{ fontSize: 12, color: c.subColor }}>
            {c.sub}
          </span>
        </div>
      ))}
      </div>
    </div>
  );
}

export default memo(HistoriqueKPIImpl);
