// pages/statistiques/index.jsx — Refonte v3 (Commit 4).
//
// 4 onglets : Performance / RDV / Paiements en ligne / Reversements.
// Tab actif via query param ?tab= pour deep linking. Lazy loading par
// onglet (le hook n'est appele que pour l'onglet actif).
//
// Les anciens onglets (Forecast, Heatmap, Products, Export) sont retires
// du mount mais leurs fichiers JSX restent presents dans le repo
// (Performance.jsx, Forecast.jsx, Heatmap.jsx, Products.jsx, Export.jsx)
// pour reintegration future eventuelle.
//
// Les props transactions/employees/categories sont conservees dans la
// signature pour compat avec App.jsx mais non utilisees (les donnees
// viennent des nouveaux endpoints /api/stats/*).

import { useSearchParams } from "react-router-dom";
import { Toast, useToast } from "../../components/UI";
import { useTheme } from "../../hooks/useTheme";
import { PageHeader } from "../reglages/shared";

import TabPerformance      from "../../components/stats/TabPerformance";
import TabRDV              from "../../components/stats/TabRDV";
import TabPaiementsLigne   from "../../components/stats/TabPaiementsLigne";
import TabReversements     from "../../components/stats/TabReversements";

const TABS = [
  { id: "performance",     label: "Performance",        iconPaths: PATH_TREND_UP() },
  { id: "rdv",             label: "RDV",                iconPaths: PATH_CAL() },
  { id: "online-payments", label: "Paiements en ligne", iconPaths: PATH_CC() },
  { id: "payouts",         label: "Reversements",       iconPaths: PATH_WALLET() },
];

const PERIODS = [
  { id: "today",  label: "Aujourd'hui" },
  { id: "week",   label: "7 jours" },
  { id: "month",  label: "30 jours" },
  { id: "90days", label: "90 jours" },
];

// Tabler icon paths (declared as functions to bind at module load time only)
function PATH_TREND_UP() { return '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>'; }
function PATH_CAL()      { return '<rect x="4" y="5" width="16" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="4" y1="11" x2="20" y2="11"/><rect x="8" y="15" width="2" height="2"/>'; }
function PATH_CC()       { return '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>'; }
function PATH_WALLET()   { return '<path d="M17 8V7a2 2 0 0 0 -2 -2H5a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-1"/><path d="M19 12h2a1 1 0 0 0 1 -1v-2a1 1 0 0 0 -1 -1h-2a2 2 0 0 0 0 4z"/>'; }

const Icon = ({ paths, size = 14, color }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}
       fill="none" stroke="currentColor" strokeWidth={2}
       strokeLinecap="round" strokeLinejoin="round"
       style={{ color, flexShrink: 0 }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);

// eslint-disable-next-line no-unused-vars
export default function Statistiques({ employees, transactions, categories }) {
  const { theme: t } = useTheme();
  const [toast] = useToast();
  const [params, setParams] = useSearchParams();

  const tabId    = TABS.find(x => x.id === params.get("tab"))?.id || "performance";
  const periodId = PERIODS.find(x => x.id === params.get("period"))?.id || "today";

  const setTab = (id) => {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };
  const setPeriod = (id) => {
    const next = new URLSearchParams(params);
    next.set("period", id);
    setParams(next, { replace: true });
  };

  // L'API backend supporte today / week / month / 90days nativement (cf
  // utils/paymentV3.resolvePeriodRange qui prend en compte la TZ Europe/Paris).
  const apiPeriod = periodId;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, paddingBottom: 32 }}>
      <Toast msg={toast?.msg} type={toast?.type} />

      <div style={{
        maxWidth: 1100, margin: "0 auto", padding: "18px 16px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div>
          <PageHeader title="Statistiques" />
          <p style={{ margin: "4px 0 0", fontSize: 13, color: t.muted, lineHeight: 1.5 }}>
            {"Performance, RDV, paiements en ligne, reversements."}
          </p>
        </div>

        {/* TabBar */}
        <div style={{
          display: "inline-flex", gap: 4, padding: 4,
          background: t.cardAlt, borderRadius: 10,
          border: "0.5px solid " + t.border,
          alignSelf: "flex-start",
          maxWidth: "100%", overflowX: "auto",
        }}>
          {TABS.map((tab) => {
            const active = tab.id === tabId;
            return (
              <button key={tab.id} type="button"
                      onClick={() => setTab(tab.id)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "8px 14px",
                        background: active ? t.card : "transparent",
                        border: active ? "0.5px solid " + t.border : "0.5px solid transparent",
                        borderRadius: 8,
                        color: active ? t.text : t.muted,
                        fontSize: 13, fontWeight: 500,
                        cursor: "pointer", fontFamily: "inherit",
                        whiteSpace: "nowrap",
                      }}>
                <Icon paths={tab.iconPaths} size={14} color={active ? t.text : t.muted} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Period chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PERIODS.map((p) => {
            const active = p.id === periodId;
            return (
              <button key={p.id} type="button"
                      onClick={() => setPeriod(p.id)}
                      style={{
                        padding: "6px 12px", borderRadius: 999,
                        background: active ? t.text : t.card,
                        color: active ? t.bg : t.text,
                        border: active ? "none" : "0.5px solid " + t.border,
                        fontSize: 12, fontWeight: 500,
                        cursor: "pointer", fontFamily: "inherit",
                      }}>
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Tab content (lazy : seul l'onglet actif est monte) */}
        {tabId === "performance"     && <TabPerformance     period={apiPeriod} />}
        {tabId === "rdv"             && <TabRDV             period={apiPeriod} />}
        {tabId === "online-payments" && <TabPaiementsLigne  period={apiPeriod} />}
        {tabId === "payouts"         && <TabReversements    period={apiPeriod} />}
      </div>
    </div>
  );
}
