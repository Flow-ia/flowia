// components/stats/LineChart.jsx — Graphique multi-courbes SVG inline.
// Pas de dep externe (pas de Recharts/Chart.js). Pour Performance evolution 30j.
//
// Props :
//   data    : array de { date, ...keys } (1 entry par jour)
//   lines   : array de { key, color, label } (3 lignes typiquement)
//   height  : 200 par defaut

import { memo } from "react";
import { useTheme } from "../../hooks/useTheme";
import { formatCents } from "../../utils/format";

const VIEW_W = 640;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 24;

function LineChartImpl({ data = [], lines = [], height = 200 }) {
  const { theme: t } = useTheme();

  if (!data.length) {
    return (
      <div style={{
        height, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, color: t.muted,
      }}>
        Aucune donnée pour cette période
      </div>
    );
  }

  // Max sur toutes les lignes (en cents). Garde un floor a 100 cents pour
  // eviter une echelle absurde sur dataset 100% zero.
  let maxCents = 100;
  for (const d of data) {
    for (const ln of lines) {
      const v = Number(d[ln.key] || 0);
      if (v > maxCents) maxCents = v;
    }
  }
  // Round up to nice number
  const niceMax = Math.ceil(maxCents / 1000) * 1000 || maxCents;

  const chartW = VIEW_W - PAD_L - PAD_R;
  const chartH = height - PAD_T - PAD_B;
  const xStep = data.length > 1 ? chartW / (data.length - 1) : 0;

  const yFor = (cents) => PAD_T + chartH - (cents / niceMax) * chartH;
  const xFor = (i) => PAD_L + i * xStep;

  // Polyline points string par ligne
  const polylines = lines.map((ln) => {
    const points = data.map((d, i) => xFor(i) + "," + yFor(Number(d[ln.key] || 0))).join(" ");
    return { ...ln, points };
  });

  // Y axis labels : 0, 1/3, 2/3, max
  const ySteps = [0, niceMax / 3, (2 * niceMax) / 3, niceMax];
  // X axis labels : 4 dates regulierement reparties (debut, 1/3, 2/3, fin)
  const xLabelIndexes = data.length >= 4
    ? [0, Math.floor(data.length / 3), Math.floor((2 * data.length) / 3), data.length - 1]
    : data.map((_, i) => i);
  const fmtXLabel = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso || "";
    return d.getDate() + "/" + (d.getMonth() + 1);
  };

  const fmtYLabel = (cents) => {
    if (niceMax >= 100000) return Math.round(cents / 100).toLocaleString("fr-FR") + " DA";
    return Number((cents || 0) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " DA";
  };

  return (
    <div>
      <svg viewBox={"0 0 " + VIEW_W + " " + height} width="100%" height={height} style={{ display: "block" }}>
        {/* Grille horizontale (4 lignes) */}
        {ySteps.map((v, i) => (
          <line key={i}
                x1={PAD_L} y1={yFor(v)} x2={VIEW_W - PAD_R} y2={yFor(v)}
                stroke={t.separator} strokeWidth={0.5} />
        ))}
        {/* Y axis labels */}
        {ySteps.map((v, i) => (
          <text key={i}
                x={PAD_L - 6} y={yFor(v) + 3}
                fontSize="10" fill={t.muted} textAnchor="end"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
            {fmtYLabel(v)}
          </text>
        ))}
        {/* Polylines */}
        {polylines.map((ln) => (
          <polyline key={ln.key}
                    points={ln.points}
                    fill="none"
                    stroke={ln.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round" />
        ))}
        {/* X axis labels */}
        {xLabelIndexes.map((i) => (
          <text key={i}
                x={xFor(i)} y={height - 8}
                fontSize="10" fill={t.muted} textAnchor="middle">
            {fmtXLabel(data[i].date)}
          </text>
        ))}
      </svg>
      {/* Legende */}
      <div style={{
        marginTop: 12, paddingTop: 12,
        borderTop: "0.5px solid " + t.separator,
        display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center",
      }}>
        {lines.map((ln) => (
          <div key={ln.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 16, height: 2, background: ln.color, display: "inline-block" }} />
            <span style={{ fontSize: 12, color: t.text }}>{ln.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(LineChartImpl);
