// components/stats/KPICard.jsx — Card KPI reutilisable pour la section
// "CHIFFRE D'AFFAIRES PAR SOURCE" de l'onglet Performance. Background
// colore selon source (bleu/vert/dore/blanc), header avec label + icone,
// montant principal monospace, footer breakdown des frais ou comparaison.

import { memo } from "react";
import { formatCents, formatCentsSign, formatPct } from "../../utils/format";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const SVG_BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const Icon = ({ paths, size = 16, color }) => (
  <svg {...SVG_BASE} width={size} height={size} style={{ color, flexShrink: 0 }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);

// `palette` : { bg, border, label, accent, value, footerBorder }
// `footer` : array de { label, value, isMain?, isNeg? }
function KPICardImpl({ label, iconPaths, palette, mainCents, sub, footer = [], vsPrev = null }) {
  return (
    <div style={{
      padding: "1.25rem", borderRadius: 12,
      background: palette.bg,
      border: palette.border ? "0.5px solid " + palette.border : "none",
      display: "flex", flexDirection: "column", gap: 8,
      minWidth: 0,
    }}>
      {/* Header : label + icone */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 500, color: palette.label,
          textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          {label}
        </span>
        {iconPaths && <Icon paths={iconPaths} size={16} color={palette.accent} />}
      </div>

      {/* Montant principal */}
      <div style={{
        fontSize: 22, fontWeight: 500, color: palette.value,
        fontFamily: MONO, lineHeight: 1.1,
      }}>
        {formatCents(mainCents || 0)}
      </div>

      {/* Sous-texte (compteur, etc.) */}
      {sub && (
        <span style={{ fontSize: 11, color: palette.accent }}>
          {sub}
        </span>
      )}

      {/* Pourcentage vs periode precedente (optionnel, badge dans le footer) */}
      {vsPrev != null && (
        <span style={{
          fontSize: 11, color: vsPrev >= 0 ? "#0F6E56" : "#A32D2D",
          fontWeight: 500,
        }}>
          {formatPct(vsPrev) + " vs période N-1"}
        </span>
      )}

      {/* Footer breakdown */}
      {footer.length > 0 && (
        <div style={{
          marginTop: 4, paddingTop: 8,
          borderTop: "0.5px solid " + (palette.footerBorder || palette.border || "rgba(0,0,0,0.08)"),
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          {footer.map((f, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{
                fontSize: f.isMain ? 12 : 10,
                fontWeight: f.isMain ? 500 : 400,
                color: f.isMain ? palette.value : palette.accent,
              }}>
                {f.label}
              </span>
              <span style={{
                fontSize: f.isMain ? 12 : 10,
                fontWeight: f.isMain ? 500 : 400,
                color: f.isNeg ? "#A32D2D" : (f.isMain ? palette.value : palette.accent),
                fontFamily: MONO,
              }}>
                {f.isNeg
                  ? formatCentsSign(-Math.abs(f.cents || 0))
                  : formatCents(f.cents || 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(KPICardImpl);
