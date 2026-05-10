// pages/historique/index.jsx — Refonte v3 (Commit 3 + bugfix Commit 4).
//
// 5 KPI cards + 5 filtres + liste enrichie + legende. Source de donnees :
// GET /api/historique via useHistorique.
//
// Filtres persistes dans l'URL via useSearchParams (?period=today&page=2&...)
// pour survie au reload + deep linking + back/forward navigation.
//
// Default period = "today" (charge moins de donnees au premier paint que
// "month"). Pagination par defaut per_page=20 avec selecteur 20/50/100 +
// boutons Prev/Next en bas.

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { useHistorique } from "../../hooks/useHistorique";
import { Toast, useToast } from "../../components/UI";
import { PageHeader } from "../reglages/shared";

import HistoriqueKPI     from "../../components/historique/HistoriqueKPI";
import HistoriqueFilters from "../../components/historique/HistoriqueFilters";
import HistoriqueLegend  from "../../components/historique/HistoriqueLegend";
import TransactionRow    from "../../components/historique/TransactionRow";

import { formatDateLong } from "../../utils/format";

const PER_PAGE_OPTIONS = [20, 50, 100];
const DEFAULT_PER_PAGE  = 20;
const VALID_PERIODS     = new Set(["today", "week", "month", "90days", "custom"]);

// eslint-disable-next-line no-unused-vars
export default function HistoriqueAdmin({ employees = [], transactions, categories, onUpdTx, onDelTx }) {
  const { theme: t } = useTheme();
  const [toast, showToast] = useToast();
  const [params, setParams] = useSearchParams();

  // ── Etat depuis l'URL (URL = source de verite, persistance reload-safe) ─
  const filters = useMemo(() => ({
    period:      VALID_PERIODS.has(params.get("period")) ? params.get("period") : "today",
    type:        params.get("type")        || "",
    mode:        params.get("mode")        || "",
    source:      params.get("source")      || "",
    employee_id: params.get("employee_id") || "",
    date_from:   params.get("date_from")   || "",
    date_to:     params.get("date_to")     || "",
    page:        Math.max(1, parseInt(params.get("page"), 10) || 1),
    per_page:    PER_PAGE_OPTIONS.includes(parseInt(params.get("per_page"), 10))
                  ? parseInt(params.get("per_page"), 10) : DEFAULT_PER_PAGE,
  }), [params]);

  // Setter qui ecrit dans l'URL (replace pour ne pas polluer l'historique).
  const setFilters = (next) => {
    const usp = new URLSearchParams();
    const defaults = { period: "today", page: 1, per_page: DEFAULT_PER_PAGE };
    Object.entries(next).forEach(([k, v]) => {
      if (v == null || v === "" || v === "all") return;
      if (defaults[k] != null && String(defaults[k]) === String(v)) return; // skip default
      usp.set(k, String(v));
    });
    setParams(usp, { replace: true });
  };

  // Filtres effectifs envoyes a l'API : on retire les vides + on ne fait pas
  // l'appel si custom incomplet (cf hook qui gere le case via apiFilters).
  const apiFilters = useMemo(() => {
    const out = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v == null || v === "" || v === "all") return;
      out[k] = v;
    });
    // period=custom sans les 2 dates : on envoie quand meme — le backend
    // renvoie un empty result tolerant (cf paymentV3.resolvePeriodRange).
    return out;
  }, [filters]);

  const { data, loading, error } = useHistorique(apiFilters);
  const transactionsList = data?.transactions || [];
  const totals           = data?.totals || {};
  const pagination       = data?.pagination || { page: 1, per_page: DEFAULT_PER_PAGE, total: 0 };
  const period           = data?.period;

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.per_page || DEFAULT_PER_PAGE)));
  const currentPage = Math.min(filters.page, totalPages);

  const onExport = (kind) => {
    showToast("Export " + kind + " à venir (Commit suivant)", "info");
  };

  const periodLabel = period
    ? (period.from === period.to
        ? formatDateLong(period.from)
        : formatDateLong(period.from) + " — " + formatDateLong(period.to))
    : "";

  return (
    <div style={{ minHeight: "100vh", background: t.bg, paddingBottom: 32 }}>
      <Toast msg={toast?.msg} type={toast?.type} />

      <div style={{
        maxWidth: 1100, margin: "0 auto", padding: "18px 16px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div>
          <PageHeader title="Historique des transactions" />
          <p style={{ margin: "4px 0 0", fontSize: 13, color: t.muted, lineHeight: 1.5 }}>
            {"Tous les flux d'argent : paiements en ligne, encaissements caisse, walk-in et remboursements."}
          </p>
        </div>

        <HistoriqueKPI totals={totals} />

        <HistoriqueFilters
          filters={filters}
          onChange={setFilters}
          employees={employees}
        />

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "0 4px", flexWrap: "wrap",
        }}>
          <div style={{ fontSize: 12, color: t.muted, fontWeight: 500 }}>
            {pagination.total} {pagination.total > 1 ? "transactions" : "transaction"}
            {periodLabel ? " · " + periodLabel : ""}
            {totals.unclassified_count > 0 && (
              <span style={{ marginLeft: 8, color: "#BA7517" }}>
                {"(" + totals.unclassified_count + " à classer)"}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <ExportButton label="Exporter CSV" onClick={() => onExport("CSV")} theme={t} />
            <ExportButton label="Exporter PDF" onClick={() => onExport("PDF")} theme={t} />
          </div>
        </div>

        <div style={{
          borderRadius: 12, background: t.card,
          border: "0.5px solid " + t.border, overflow: "hidden",
        }}>
          {loading && transactionsList.length === 0 ? (
            <EmptyState theme={t} message="Chargement…" />
          ) : error ? (
            <EmptyState theme={t} message={"Erreur : " + error} isError />
          ) : transactionsList.length === 0 ? (
            <EmptyState theme={t} message={
              filters.period === "custom" && (!filters.date_from || !filters.date_to)
                ? "Choisissez 2 dates dans le filtre pour afficher les transactions."
                : "Aucune transaction sur cette période"
            } />
          ) : (
            <div>
              {transactionsList.map((tx, i) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  isLast={i === transactionsList.length - 1}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination Prev/Next + select per_page */}
        {pagination.total > 0 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, padding: "0 4px", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: t.muted }}>Par page</span>
              <select value={filters.per_page}
                      onChange={(e) => setFilters({ ...filters, per_page: parseInt(e.target.value, 10), page: 1 })}
                      style={{
                        padding: "6px 10px", borderRadius: 6,
                        background: t.inputBg, border: "0.5px solid " + t.borderInput,
                        color: t.text, fontSize: 12, fontFamily: "inherit",
                        cursor: "pointer",
                      }}>
                {PER_PAGE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PageButton theme={t} disabled={currentPage <= 1}
                          onClick={() => setFilters({ ...filters, page: currentPage - 1 })}>
                {"‹ Précédent"}
              </PageButton>
              <span style={{ fontSize: 12, color: t.muted, minWidth: 90, textAlign: "center" }}>
                {"Page " + currentPage + " sur " + totalPages}
              </span>
              <PageButton theme={t} disabled={currentPage >= totalPages}
                          onClick={() => setFilters({ ...filters, page: currentPage + 1 })}>
                {"Suivant ›"}
              </PageButton>
            </div>
          </div>
        )}

        <HistoriqueLegend />
      </div>
    </div>
  );
}

function ExportButton({ label, onClick, theme: t }) {
  return (
    <button type="button" onClick={onClick}
            style={{
              padding: "8px 14px", borderRadius: 8,
              background: t.cardAlt, border: "0.5px solid " + t.border,
              color: t.text, fontSize: 12, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}>
      {label}
    </button>
  );
}

function PageButton({ theme: t, disabled, onClick, children }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
            style={{
              padding: "8px 14px", borderRadius: 8,
              background: t.cardAlt, border: "0.5px solid " + t.border,
              color: disabled ? t.dim : t.text,
              fontSize: 12, fontWeight: 500,
              cursor: disabled ? "default" : "pointer",
              opacity: disabled ? 0.5 : 1,
              fontFamily: "inherit",
            }}>
      {children}
    </button>
  );
}

function EmptyState({ theme: t, message, isError }) {
  return (
    <div style={{
      padding: "56px 16px", textAlign: "center",
      color: isError ? "#A32D2D" : t.muted, fontSize: 13,
    }}>
      {message}
    </div>
  );
}
