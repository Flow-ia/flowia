// pages/historique/index.jsx — Refonte v3 (Commit 3)
//
// Refonte complete : 5 KPI cards (CA total / En ligne / Caisse RDV / Walk-in /
// Rembourses), bandeau de 5 filtres (Periode, Type, Mode, Source, Employe),
// liste enrichie avec icones semantiques par payment_status / payment_source
// (walk-in distinct visuellement avec fond dore), legende des 5 types en bas.
//
// Source de donnees : GET /api/historique (Commit 2 backend), via le hook
// useHistorique. Pagination cote serveur (per_page=50 max), bouton "Voir tout"
// pour augmenter per_page.
//
// Les props transactions/employees/categories/onUpdTx/onDelTx sont conservees
// dans la signature pour compat avec App.jsx (RequireAdminMode + sidebar),
// mais seul `employees` est utilise pour le filtre. Les actions edit/delete
// sont retirees du nouveau design (gestion via /caisse pour edition, ou
// futur menu contextuel a redessiner si besoin).

import { useMemo, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { useHistorique } from "../../hooks/useHistorique";
import { Toast, useToast } from "../../components/UI";
import { PageHeader } from "../reglages/shared";

import HistoriqueKPI     from "../../components/historique/HistoriqueKPI";
import HistoriqueFilters from "../../components/historique/HistoriqueFilters";
import HistoriqueLegend  from "../../components/historique/HistoriqueLegend";
import TransactionRow    from "../../components/historique/TransactionRow";

import { formatDateLong } from "../../utils/format";

const DEFAULT_PER_PAGE  = 20;
const VOIR_TOUT_PER_PAGE = 200;

// eslint-disable-next-line no-unused-vars
export default function HistoriqueAdmin({ employees = [], transactions, categories, onUpdTx, onDelTx }) {
  const { theme: t } = useTheme();
  const [toast, showToast] = useToast();

  // ── Filtres locaux ─────────────────────────────────────────────────────
  const [filters, setFilters] = useState({
    period: "month",
    type:   "",
    mode:   "",
    source: "",
    employee_id: "",
    page:    1,
    per_page: DEFAULT_PER_PAGE,
  });

  // Serialize filters pour l'API : on retire les valeurs vides pour ne pas
  // polluer l'URL (et matcher la cache key cote backend).
  const apiFilters = useMemo(() => {
    const out = {};
    Object.keys(filters).forEach(k => {
      const v = filters[k];
      if (v != null && v !== "" && v !== "all") out[k] = v;
    });
    return out;
  }, [filters]);

  const { data, loading, error } = useHistorique(apiFilters);
  const transactionsList = data?.transactions || [];
  const totals           = data?.totals || {};
  const pagination       = data?.pagination || { page: 1, per_page: DEFAULT_PER_PAGE, total: 0 };
  const period           = data?.period;

  const showVoirTout = pagination.total > pagination.per_page
                    && filters.per_page < VOIR_TOUT_PER_PAGE;

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
        {/* ── En-tete ───────────────────────────────────────────────────── */}
        <div>
          <PageHeader title="Historique des transactions" />
          <p style={{ margin: "4px 0 0", fontSize: 13, color: t.muted, lineHeight: 1.5 }}>
            {"Tous les flux d'argent : paiements en ligne, encaissements caisse, walk-in et remboursements."}
          </p>
        </div>

        {/* ── 5 KPI cards ───────────────────────────────────────────────── */}
        <HistoriqueKPI totals={totals} />

        {/* ── Filtres ───────────────────────────────────────────────────── */}
        <HistoriqueFilters
          filters={filters}
          onChange={setFilters}
          employees={employees}
        />

        {/* ── Header de liste ───────────────────────────────────────────── */}
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

        {/* ── Liste des transactions ────────────────────────────────────── */}
        <div style={{
          borderRadius: 12, background: t.card,
          border: "0.5px solid " + t.border, overflow: "hidden",
        }}>
          {loading && transactionsList.length === 0 ? (
            <EmptyState theme={t} message="Chargement…" />
          ) : error ? (
            <EmptyState theme={t} message={"Erreur : " + error} isError />
          ) : transactionsList.length === 0 ? (
            <EmptyState theme={t} message="Aucune transaction sur cette période" />
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

        {/* ── Bouton "Voir tout" / pagination ───────────────────────────── */}
        {showVoirTout && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
            <button
              type="button"
              onClick={() => setFilters(f => ({ ...f, per_page: VOIR_TOUT_PER_PAGE, page: 1 }))}
              style={{
                padding: "10px 20px", borderRadius: 8,
                background: t.cardAlt, border: "0.5px solid " + t.border,
                color: t.text, fontSize: 13, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {"Voir tout (" + (pagination.total - pagination.per_page) + " transactions supplémentaires)"}
            </button>
          </div>
        )}

        {/* ── Legende fixe en bas ───────────────────────────────────────── */}
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
