// components/stats/TabPerformance.jsx — Onglet "Performance" (4 KPI sources
// + graphique evolution 30j). Le bandeau Reversements Stripe a ete
// retire 2026-05-12 : il est present sur /reglages/paiements (doublon UX).

import { useStatsPerformance } from "../../hooks/useStats";
import { useTheme } from "../../hooks/useTheme";
import { Toast, useToast } from "../../components/UI";
import { formatCents } from "../../utils/format";
import KPICard from "./KPICard";
import LineChart from "./LineChart";

// Icon paths (Tabler outline)
const PATH_CREDIT_CARD = '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>';
const PATH_CASH        = '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>';
const PATH_WALK        = '<circle cx="13" cy="4" r="1"/><path d="M7 21l3 -4"/><path d="M16 21l-2 -4l-3 -3l1 -6"/><path d="M6 12l2 -3l4 -1l3 3l3 1"/>';
const PATH_COINS       = '<circle cx="9" cy="9" r="6"/><path d="M14.65 8.93a6 6 0 1 1 -5.72 5.72"/>';

const PALETTES = {
  stripe: { bg: "#E6F1FB", border: "#B5D4F4", footerBorder: "#B5D4F4", label: "#0C447C", accent: "#185FA5", value: "#042C53" },
  caisse: { bg: "#E1F5EE", border: "#9FE1CB", footerBorder: "#9FE1CB", label: "#085041", accent: "#0F6E56", value: "#04342C" },
  walkin: { bg: "#FAEEDA", border: "#FAC775", footerBorder: "#FAC775", label: "#7A4B0E", accent: "#BA7517", value: "#412402" },
};

export default function TabPerformance({ period }) {
  const { theme: t } = useTheme();
  const [toast, showToast] = useToast();
  const { data: perf, loading: loadingPerf, error: errPerf } = useStatsPerformance(period);

  if (loadingPerf && !perf) return <Loading />;
  if (errPerf) return <ErrorBox msg={errPerf} />;

  const p   = perf || {};
  const enLigne = p.en_ligne   || {};
  const caisse  = p.caisse_rdv || {};
  const walkin  = p.walkin     || {};
  const total   = p.total      || {};

  const totalNeutral = {
    bg: t.card,
    border: t.border,
    footerBorder: t.border,
    label: t.muted,
    accent: t.muted,
    value: t.text,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* Section 1 — 4 KPI sources */}
      <div>
        <SectionTitle theme={t} title="CHIFFRE D'AFFAIRES PAR SOURCE" />
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}>
          <KPICard
            label="EN LIGNE"
            iconPaths={PATH_CREDIT_CARD}
            palette={PALETTES.stripe}
            mainCents={enLigne.gross_cents}
            sub={(enLigne.count || 0) + (enLigne.count > 1 ? " paiements" : " paiement")}
            footer={[
              { label: "Frais Stripe",      cents: enLigne.stripe_fee_cents,   isNeg: true },
              { label: "Commission Salon DZ", cents: enLigne.platform_fee_cents, isNeg: true },
              { label: "Net",               cents: enLigne.net_cents,          isMain: true },
            ]}
          />
          <KPICard
            label="CAISSE RDV"
            iconPaths={PATH_CASH}
            palette={PALETTES.caisse}
            mainCents={caisse.gross_cents}
            sub={(caisse.count || 0) + (caisse.count > 1 ? " encaissements" : " encaissement")}
            footer={[
              { label: "Espèces",      cents: caisse.especes_cents },
              { label: "Carte locale", cents: caisse.carte_cents },
              { label: "Net",          cents: caisse.net_cents, isMain: true },
            ]}
          />
          <KPICard
            label="WALK-IN"
            iconPaths={PATH_WALK}
            palette={PALETTES.walkin}
            mainCents={walkin.gross_cents}
            sub={(walkin.count || 0) + " sans RDV"}
            footer={[
              { label: "Espèces",      cents: walkin.especes_cents },
              { label: "Carte locale", cents: walkin.carte_cents },
              { label: "Net",          cents: walkin.net_cents, isMain: true },
            ]}
          />
          <KPICard
            label="TOTAL"
            iconPaths={PATH_COINS}
            palette={totalNeutral}
            mainCents={total.gross_cents}
            sub={(total.count || 0) + (total.count > 1 ? " transactions" : " transaction")}
            vsPrev={total.vs_previous_period_pct}
            footer={[
              { label: "Total frais", cents: total.total_fees_cents, isNeg: true },
              { label: "Net total",   cents: total.net_cents,        isMain: true },
            ]}
          />
        </div>
      </div>

      {/* Section 2 — Evolution 30j */}
      <div>
        <SectionTitle theme={t} title="ÉVOLUTION SUR 30 JOURS" />
        <div style={{
          padding: "1.25rem", borderRadius: 12,
          background: t.card, border: "0.5px solid " + t.border,
        }}>
          <LineChart
            data={p.evolution_30j || []}
            lines={[
              { key: "en_ligne_cents",   color: "#185FA5", label: "En ligne (Stripe)" },
              { key: "caisse_rdv_cents", color: "#0F6E56", label: "Caisse RDV" },
              { key: "walkin_cents",     color: "#BA7517", label: "Walk-in" },
            ]}
            height={200}
          />
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ theme: t, title }) {
  return (
    <h2 style={{
      margin: "0 0 10px", fontSize: 14, fontWeight: 500,
      textTransform: "uppercase", letterSpacing: "0.04em",
      color: t.muted,
    }}>
      {title}
    </h2>
  );
}

function Loading() {
  const { theme: t } = useTheme();
  return <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>Chargement…</div>;
}
function ErrorBox({ msg }) {
  return <div style={{ padding: 16, color: "#A32D2D", fontSize: 13 }}>{"Erreur : " + msg}</div>;
}
