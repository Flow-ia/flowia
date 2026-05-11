// components/historique/ServiceDropdown.jsx — Sélecteur de service dans
// l'édition d'une transaction. Bouton compact (~140px) qui s'ouvre en
// dropdown avec recherche live + groupage par catégorie + sélection.
//
// Charge la liste via /api/services-for-edit (catalogue intelligent dual :
// walkin = categories niveau 2 / appointment = booking_services). Le context
// est passé en prop par le drawer parent en fonction de tx.appointment_id.
// Cache module-scope par context pour ne pas re-fetcher entre drawers.
// Filtrage insensible casse + accents via String.normalize.

import { useEffect, useMemo, useRef, useState } from "react";
import { bookingApi } from "../../utils/api";

// Cache module-scope, séparé par context. Les 2 catalogues sont distincts
// en BDD (categories vs booking_services), donc on ne mélange pas. Le 1er
// ouverture déclenche le fetch, les suivants sont instantanés.
const SERVICES_CACHE   = { walkin: null, appointment: null };
const SERVICES_PROMISE = { walkin: null, appointment: null };
function loadServices(context) {
  const ctx = context === "appointment" ? "appointment" : "walkin";
  if (SERVICES_CACHE[ctx]) return Promise.resolve(SERVICES_CACHE[ctx]);
  if (SERVICES_PROMISE[ctx]) return SERVICES_PROMISE[ctx];
  SERVICES_PROMISE[ctx] = bookingApi.getServicesForEdit(ctx)
    .then(payload => {
      // Le backend renvoie { success, context, services, categories }.
      // On normalise vers la shape attendue par le dropdown :
      // { id, name, price, category_name, is_active }.
      const services = Array.isArray(payload?.services) ? payload.services : [];
      const normalized = services.map(s => ({
        id:             s.id,
        name:           s.service_name || s.name || "Prestation",
        price:          s.price,
        is_free_price:  !!s.is_free_price,
        category_id:    s.category_id || null,
        category_name:  s.category_name || "Sans catégorie",
        category_color: s.category_color || null,
        is_active:      true,
      }));
      SERVICES_CACHE[ctx] = normalized;
      SERVICES_PROMISE[ctx] = null;
      return normalized;
    })
    .catch(() => {
      SERVICES_PROMISE[ctx] = null;
      return [];
    });
  return SERVICES_PROMISE[ctx];
}
// Invalidation manuelle (ex: après création d'un service côté Réglages).
export function invalidateServicesCache() {
  SERVICES_CACHE.walkin      = null;
  SERVICES_CACHE.appointment = null;
  SERVICES_PROMISE.walkin      = null;
  SERVICES_PROMISE.appointment = null;
}

// Normalise pour comparaison insensible aux accents et à la casse.
// "Coupe Homme" → "coupe homme", "à" → "a", etc. Utilise NFD + suppression
// des marks (catégorie M dans Unicode) pour pouvoir taper "barbe" et matcher
// "Barbé" sans dépendance externe.
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const PATH_CHEVRON_DOWN = '<polyline points="6 9 12 15 18 9"/>';
const PATH_SEARCH       = '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>';

const SVG_BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const Icon = ({ paths, size = 12, color, style }) => (
  <svg {...SVG_BASE} width={size} height={size}
       style={{ color, flexShrink: 0, ...(style || {}) }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);

export default function ServiceDropdown({
  value,          // service_id UUID ou null
  displayName,    // nom à afficher (fallback si value=null = service custom)
  onChange,       // (service) => void — appelé avec l'objet service complet
  context,        // 'walkin' | 'appointment' — déterminé par le drawer parent
                  // (tx.appointment_id ? 'appointment' : 'walkin'). Par défaut
                  // 'walkin' si non renseigné.
  colors,         // palette héritée du drawer
  style,          // style supplémentaire pour le bouton
}) {
  const ctx = context === "appointment" ? "appointment" : "walkin";
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState(SERVICES_CACHE[ctx] || []);
  const [loading, setLoading] = useState(!SERVICES_CACHE[ctx]);
  const [query, setQuery] = useState("");
  const btnRef   = useRef(null);
  const panelRef = useRef(null);
  const searchInputRef = useRef(null);

  // Charge la liste au 1er ouverture (lazy, pas au mount). Refetch si
  // le context change (passage d'un drawer walkin à un drawer RDV).
  useEffect(() => {
    if (!open) return;
    if (SERVICES_CACHE[ctx]) {
      setServices(SERVICES_CACHE[ctx]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadServices(ctx).then(list => {
      if (cancelled) return;
      setServices(list);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, ctx]);

  // Focus input recherche à l'ouverture (UX clavier-first).
  useEffect(() => {
    if (open && searchInputRef.current) {
      const tm = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(tm);
    }
  }, [open]);

  // Click outside + Escape ferment le dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target))   return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Regroupement par catégorie + filtrage live.
  const grouped = useMemo(() => {
    const q = normalize(query.trim());
    const filter = (s) => {
      if (!q) return true;
      return normalize(s.name).includes(q)
          || normalize(s.category_name || "").includes(q);
    };
    const map = new Map();
    for (const s of (services || [])) {
      if (s.is_active === false) continue;
      if (!filter(s)) continue;
      const cat = s.category_name || "Sans catégorie";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(s);
    }
    return Array.from(map.entries());
  }, [services, query]);

  const totalMatches = useMemo(
    () => grouped.reduce((s, [, arr]) => s + arr.length, 0),
    [grouped]
  );

  const labelTrunc = (s, max) => {
    const str = String(s || "");
    return str.length > max ? str.slice(0, max - 1) + "…" : str;
  };

  const buttonStyle = {
    display: "inline-flex", alignItems: "center", gap: 6,
    width: "100%", boxSizing: "border-box",
    padding: "8px 10px",
    background: colors?.inputBg || "#f9f9fb",
    border: "0.5px solid " + (colors?.inputBorder || "rgba(0,0,0,0.12)"),
    borderRadius: 8,
    cursor: "pointer", fontFamily: "inherit",
    fontSize: 13, color: colors?.text || "#111827",
    outline: "none",
    ...(style || {}),
  };

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button type="button" ref={btnRef}
              onClick={() => setOpen(o => !o)}
              title={displayName || ""}
              style={buttonStyle}>
        <span style={{
          flex: 1, textAlign: "left",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {displayName ? labelTrunc(displayName, 28) : "Choisir une prestation…"}
        </span>
        <Icon paths={PATH_CHEVRON_DOWN} size={12}
              color={colors?.muted || "#6B7280"}
              style={{ transform: open ? "rotate(180deg)" : "none",
                       transition: "transform 150ms ease" }} />
      </button>

      {open && (
        <div ref={panelRef} style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          minWidth: 260, maxWidth: 380,
          maxHeight: 340, overflowY: "auto",
          background: colors?.drawerBg || "#ffffff",
          border: "0.5px solid " + (colors?.border || "rgba(0,0,0,0.12)"),
          borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
          zIndex: 90,
          padding: 4,
        }}>
          {/* Sticky search */}
          <div style={{
            position: "sticky", top: -4, padding: "4px 4px 8px 4px",
            background: colors?.drawerBg || "#ffffff",
            zIndex: 1,
          }}>
            <div style={{ position: "relative" }}>
              <Icon paths={PATH_SEARCH} size={12}
                    color={colors?.muted || "#6B7280"}
                    style={{ position: "absolute", left: 8,
                             top: "50%", transform: "translateY(-50%)" }} />
              <input ref={searchInputRef}
                     type="text" value={query}
                     onChange={e => setQuery(e.target.value)}
                     placeholder="Rechercher…"
                     style={{
                       width: "100%", boxSizing: "border-box",
                       padding: "7px 8px 7px 26px",
                       border: "0.5px solid " + (colors?.inputBorder || "rgba(0,0,0,0.12)"),
                       borderRadius: 6,
                       background: colors?.inputBg || "#f9f9fb",
                       color: colors?.text || "#111827",
                       fontSize: 12, fontFamily: "inherit", outline: "none",
                     }} />
            </div>
          </div>

          {loading ? (
            <div style={{ padding: "12px 10px", fontSize: 12,
                          color: colors?.muted || "#6B7280" }}>
              {"Chargement…"}
            </div>
          ) : totalMatches === 0 ? (
            <div style={{ padding: "12px 10px", fontSize: 12,
                          color: colors?.muted || "#6B7280",
                          fontStyle: "italic" }}>
              {"Aucune prestation trouvée."}
            </div>
          ) : (
            grouped.map(([catName, list]) => (
              <div key={catName}>
                <div style={{
                  padding: "6px 10px", fontSize: 10,
                  color: colors?.muted || "#6B7280",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  fontWeight: 500,
                  background: colors?.cardBg || "#f9f9fb",
                  borderRadius: 6, margin: "2px 0",
                }}>
                  {catName}
                </div>
                {list.map(svc => (
                  <button key={svc.id} type="button"
                          onClick={() => {
                            onChange?.(svc);
                            setOpen(false);
                            setQuery("");
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background =
                            colors?.cardBg || "#f9f9fb"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                          style={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between", gap: 8,
                            width: "100%", padding: "8px 10px",
                            background: value === svc.id ? (colors?.cardBg || "#f9f9fb") : "transparent",
                            border: "none", borderRadius: 6,
                            cursor: "pointer", fontFamily: "inherit",
                            fontSize: 13, color: colors?.text || "#111827",
                            textAlign: "left",
                          }}>
                    <span style={{
                      flex: 1, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                      maxWidth: "70%",
                    }}>
                      {svc.name}
                    </span>
                    <span style={{
                      color: colors?.muted || "#6B7280",
                      fontSize: 12, fontVariantNumeric: "tabular-nums",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      flexShrink: 0,
                    }}>
                      {svc.price != null
                        ? Number(svc.price).toFixed(2).replace(".", ",") + " €"
                        : ""}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
