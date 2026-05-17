// components/historique/HistoriqueFilters.jsx — 6 selects (Periode / Type /
// Mode / Source / Employe / Tri). Cliquer met a jour `filters` via onChange.
// Pas de debounce ici (pas d'input texte). Le hook useHistorique re-fetch
// automatiquement quand l'objet filters change.
//
// Mobile-first : sous 1024px (= shell mobile avec BottomNav), les filtres
// n'occupent plus 6 lignes empilees. On affiche une barre compacte
// "Filtres" (compteur de filtres actifs + chip periode + Reinitialiser) qui
// ouvre un bottom-sheet (meme idiome que le menu "Plus" de la BottomNav).
// Desktop : grille inline inchangee. La logique de filtrage est identique
// dans les deux cas (les selects ecrivent directement dans `filters`).

import { memo, useEffect, useState } from "react";
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
  { value: "multi",       label: "Paiement multiple" },
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
// Valeurs whitelistées côté backend (SORT_MAP dans routes/historique.js).
// L'envoi d'une valeur non listée fera fallback sur created_at_desc.
const SORT_OPTIONS = [
  { value: "created_at_desc", label: "Plus récent" },
  { value: "created_at_asc",  label: "Plus ancien" },
  { value: "amount_desc",     label: "Montant ↓ (élevé → faible)" },
  { value: "amount_asc",      label: "Montant ↑ (faible → élevé)" },
  { value: "employee",        label: "Par employé" },
];

const DEFAULT_SORT = "created_at_desc";

// Breakpoint = shell mobile (BottomNav visible). Meme idiome que
// useIsMobile() de TxDetailDrawer, seuil aligne sur Tailwind `lg`.
function useNarrow(bp = 1024) {
  const [m, setM] = useState(
    typeof window !== "undefined" ? window.innerWidth < bp : false
  );
  useEffect(() => {
    const onResize = () => setM(window.innerWidth < bp);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bp]);
  return m;
}

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
  const isNarrow = useNarrow(1024);
  const [open, setOpen] = useState(false);

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

  // Nombre de filtres actifs (hors periode "today" par defaut) — affiche
  // dans le badge du bouton mobile + conditionne le bouton Reinitialiser.
  const activeCount =
    (filters.period && filters.period !== "today" ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.mode ? 1 : 0) +
    (filters.source ? 1 : 0) +
    (filters.employee_id ? 1 : 0) +
    (filters.sort && filters.sort !== DEFAULT_SORT ? 1 : 0);

  const periodLabel =
    (PERIOD_OPTIONS.find(p => p.value === filters.period) || PERIOD_OPTIONS[0]).label;

  const resetAll = () => onChange({
    ...filters, period: "today", type: "", mode: "", source: "",
    employee_id: "", date_from: "", date_to: "", sort: DEFAULT_SORT, page: 1,
  });

  // Champs partages desktop / sheet mobile (memes selects, meme logique).
  const fields = (
    <>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 10,
      }}>
        <FilterSelect label="Période"    theme={t} value={filters.period} options={PERIOD_OPTIONS}
                      onChange={(v) => updateMany({
                        period: v,
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
        <FilterSelect label="Trier par"  theme={t} value={filters.sort || DEFAULT_SORT}
                      options={SORT_OPTIONS}
                      onChange={(v) => update("sort", v)} />
      </div>
      {isCustom && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
          alignItems: "end", paddingTop: 10,
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
    </>
  );

  // ── Desktop : grille inline (comportement historique inchange) ──────────
  if (!isNarrow) {
    return (
      <div style={{
        padding: 14, borderRadius: 12,
        background: t.card, border: "0.5px solid " + t.border,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {fields}
      </div>
    );
  }

  // ── Mobile : barre compacte + bottom-sheet ──────────────────────────────
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setOpen(true)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "9px 14px", borderRadius: 8,
                  background: t.card, border: "0.5px solid " + t.border,
                  color: t.text, fontSize: 13, fontWeight: 500,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
          <I.Sliders style={{ width: 15, height: 15, color: t.muted }} />
          {"Filtres"}
          {activeCount > 0 && (
            <span style={{
              minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99,
              background: t.text, color: t.bg, fontSize: 10, fontWeight: 500,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
              {activeCount}
            </span>
          )}
        </button>

        <span style={{
          fontSize: 12, color: t.muted, fontWeight: 500,
          padding: "5px 10px", borderRadius: 99, background: t.cardAlt,
          whiteSpace: "nowrap",
        }}>
          {periodLabel}
        </span>

        {activeCount > 0 && (
          <button type="button" onClick={resetAll}
                  style={{
                    marginLeft: "auto", border: "none", background: "transparent",
                    color: t.muted, fontSize: 12, fontWeight: 500,
                    cursor: "pointer", fontFamily: "inherit",
                    textDecoration: "underline",
                  }}>
            {"Réinitialiser"}
          </button>
        )}
      </div>

      {open && (
        <div onClick={() => setOpen(false)}
             style={{
               position: "fixed", inset: 0, zIndex: 80,
               background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
               display: "flex", alignItems: "flex-end",
             }}>
          <div onClick={(e) => e.stopPropagation()}
               style={{
                 width: "100%", maxHeight: "85vh", display: "flex",
                 flexDirection: "column", background: t.canvas || t.card,
                 borderTopLeftRadius: 16, borderTopRightRadius: 16,
                 borderTop: "0.5px solid " + t.border,
               }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", borderBottom: "0.5px solid " + t.separator,
            }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: t.text }}>
                {"Filtres"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {activeCount > 0 && (
                  <button type="button" onClick={resetAll}
                          style={{
                            border: "none", background: t.cardAlt, color: t.text,
                            fontSize: 12, fontWeight: 500, cursor: "pointer",
                            padding: "6px 10px", borderRadius: 8, fontFamily: "inherit",
                          }}>
                    {"Réinitialiser"}
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)}
                        aria-label="Fermer les filtres"
                        style={{
                          width: 30, height: 30, borderRadius: 8, border: "none",
                          background: t.cardAlt, color: t.muted, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "inherit",
                        }}>
                  <I.X style={{ width: 15, height: 15 }} />
                </button>
              </div>
            </div>

            <div style={{
              overflowY: "auto", padding: 16,
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              {fields}
            </div>

            <div style={{
              padding: "12px 16px",
              paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
              borderTop: "0.5px solid " + t.separator,
            }}>
              <button type="button" onClick={() => setOpen(false)}
                      style={{
                        width: "100%", padding: "12px", borderRadius: 10,
                        border: "none", background: t.text, color: t.bg,
                        fontSize: 14, fontWeight: 500, cursor: "pointer",
                        fontFamily: "inherit",
                      }}>
                {"Voir les résultats"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(HistoriqueFiltersImpl);
