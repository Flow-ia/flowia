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
const MODE_OPTIONS = [
  { value: "",            label: "Tous modes" },
  { value: "stripe",      label: "Stripe" },
  { value: "card_online", label: "Stripe (en ligne)" },
  { value: "cash",        label: "Espèces" },
  { value: "card_local",  label: "Carte locale" },
  { value: "transfer",    label: "Virement" },
];
const SOURCE_OPTIONS = [
  { value: "",                  label: "Toutes sources" },
  { value: "online_booking",    label: "Booking en ligne" },
  { value: "phone_internal",    label: "RDV téléphone" },
  { value: "cash_register_rdv", label: "Caisse RDV" },
  { value: "walkin",            label: "Walk-in" },
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

  const employeeOptions = [
    { value: "all", label: "Tous employés" },
    ...((employees || []).filter(e => e.is_active !== false).map(e => ({
      value: e.id, label: e.name,
    }))),
  ];

  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: t.card, border: "0.5px solid " + t.border,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      gap: 10,
    }}>
      <FilterSelect label="Période"    theme={t} value={filters.period} options={PERIOD_OPTIONS}
                    onChange={(v) => update("period", v)} />
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
  );
}

export default memo(HistoriqueFiltersImpl);
