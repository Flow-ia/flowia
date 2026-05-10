// components/historique/HistoriqueFilters.jsx — 5 selects (Periode / Type /
// Mode / Source / Employe). Cliquer met a jour `filters` via onChange.
// Pas de debounce ici (pas d'input texte). Le hook useHistorique re-fetch
// automatiquement quand l'objet filters change.

import { memo } from "react";
import { useTheme } from "../../hooks/useTheme";
import { I } from "../../utils/icons";

const PERIOD_OPTIONS = [
  { value: "today",  label: "Aujourd'hui" },
  { value: "week",   label: "Cette semaine" },
  { value: "month",  label: "Ce mois" },
  { value: "custom", label: "Personnalisé" },
];
const TYPE_OPTIONS = [
  { value: "",                label: "Tous types" },
  { value: "stripe_full",     label: "Stripe en ligne" },
  { value: "stripe_deposit",  label: "Acompte Stripe" },
  { value: "cash_rdv",        label: "Caisse RDV" },
  { value: "walkin",          label: "Walk-in" },
  { value: "refunded",        label: "Remboursements" },
];
// MODE_OPTIONS : les `value` matchent EXACTEMENT les strings de
// transactions.payment_method en BDD (sensible a la casse). Avant,
// "card_local" etait dans la liste mais la colonne contient en realite
// "card" -> filtre toujours vide (8 rows manquees en prod).
const MODE_OPTIONS = [
  { value: "",            label: "Tous modes" },
  { value: "card_online", label: "Stripe en ligne" },
  { value: "cash",        label: "Espèces" },
  { value: "card",        label: "CB physique" },
  { value: "multi",       label: "Paiement mixte" },
  { value: "other",       label: "Autre" },
  { value: "transfer",    label: "Virement" },
];
// SOURCE_OPTIONS : 4 options simplifiees pour l'UX (au lieu de 5).
// "manual" regroupe RDV telephone (phone_internal) + caisse RDV
// (cash_register_rdv) — les badges detailles sur chaque row gardent la
// distinction (Telephone / Caisse RDV separes).
const SOURCE_OPTIONS = [
  { value: "",       label: "Toutes sources" },
  { value: "online", label: "RDV En ligne" },
  { value: "manual", label: "RDV Manuel" },
  { value: "walkin", label: "Walk-in" },
];

function FilterSelect({ label, value, options, onChange, theme: t }) {
  const optBg    = t.mode === "dark" ? "#1e1e30" : "#ffffff";
  const optColor = t.mode === "dark" ? "rgba(255,255,255,0.9)" : "#0c0c10";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <label style={{
        fontSize: 11, color: t.muted, fontWeight: 500,
        textTransform: "uppercase", letterSpacing: "0.04em",
      }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <select value={value || ""} onChange={(e) => onChange(e.target.value)}
                style={{
                  width: "100%", padding: "10px 30px 10px 12px",
                  borderRadius: 8, outline: "none",
                  background: t.inputBg, border: "0.5px solid " + t.borderInput,
                  color: t.text, fontSize: 13, fontFamily: "inherit",
                  boxSizing: "border-box", cursor: "pointer",
                  appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
                }}>
          {options.map(o => (
            <option key={o.value || "__all__"} value={o.value}
                    style={{ background: optBg, color: optColor }}>
              {o.label}
            </option>
          ))}
        </select>
        <I.ChevD style={{
          width: 14, height: 14, position: "absolute", right: 10,
          top: "50%", transform: "translateY(-50%)",
          pointerEvents: "none", color: t.muted,
        }} />
      </div>
    </div>
  );
}

function HistoriqueFiltersImpl({ filters, onChange, employees }) {
  const { theme: t } = useTheme();
  const update = (key, value) => onChange({ ...filters, [key]: value, page: 1 });
  const updateMany = (patch) => onChange({ ...filters, ...patch, page: 1 });

  const employeeOptions = [
    { value: "all", label: "Tous employés" },
    ...((employees || []).filter(e => e.is_active !== false).map(e => ({
      value: e.id, label: e.name,
    }))),
  ];

  const isCustom = filters.period === "custom";
  const dateFrom = filters.date_from || "";
  const dateTo   = filters.date_to   || "";
  const customIncomplete = isCustom && (!dateFrom || !dateTo);

  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: t.card, border: "0.5px solid " + t.border,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 10,
      }}>
        <FilterSelect label="Période"    theme={t} value={filters.period} options={PERIOD_OPTIONS}
                      onChange={(v) => updateMany({
                        period: v,
                        // Reset date_from/date_to si on quitte custom (evite filtre fantome)
                        date_from: v === "custom" ? dateFrom : "",
                        date_to:   v === "custom" ? dateTo   : "",
                      })} />
        <FilterSelect label="Type"       theme={t} value={filters.type}   options={TYPE_OPTIONS}
                      onChange={(v) => update("type", v)} />
        <FilterSelect label="Mode"       theme={t} value={filters.mode}   options={MODE_OPTIONS}
                      onChange={(v) => update("mode", v)} />
        <FilterSelect label="Source RDV" theme={t} value={filters.source} options={SOURCE_OPTIONS}
                      onChange={(v) => update("source", v)} />
        <FilterSelect label="Employé"    theme={t} value={filters.employee_id || "all"}
                      options={employeeOptions}
                      onChange={(v) => update("employee_id", v === "all" ? "" : v)} />
      </div>
      {/* Date picker conditionnel pour period=custom */}
      {isCustom && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          alignItems: "end",
          paddingTop: 10,
          borderTop: "0.5px solid " + t.separator,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{
              fontSize: 11, color: t.muted, fontWeight: 500,
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>Du</label>
            <input type="date" value={dateFrom}
                   onChange={(e) => update("date_from", e.target.value)}
                   style={{
                     padding: "10px 12px", borderRadius: 8, outline: "none",
                     background: t.inputBg, border: "0.5px solid " + t.borderInput,
                     color: t.text, fontSize: 13, fontFamily: "inherit",
                     boxSizing: "border-box",
                   }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{
              fontSize: 11, color: t.muted, fontWeight: 500,
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>Au</label>
            <input type="date" value={dateTo}
                   onChange={(e) => update("date_to", e.target.value)}
                   style={{
                     padding: "10px 12px", borderRadius: 8, outline: "none",
                     background: t.inputBg, border: "0.5px solid " + t.borderInput,
                     color: t.text, fontSize: 13, fontFamily: "inherit",
                     boxSizing: "border-box",
                   }} />
          </div>
          {customIncomplete && (
            <div style={{
              gridColumn: "1 / -1",
              fontSize: 11, color: t.muted, fontStyle: "italic",
            }}>
              {"Choisissez les 2 dates pour afficher les transactions."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(HistoriqueFiltersImpl);
