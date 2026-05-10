// components/stats/BarChart.jsx — Histogramme SVG inline. Pour OnlinePayments
// evolution 30j (1 bar par jour, hauteur proportionnelle au montant).

import { memo } from "react";
import { useTheme } from "../../hooks/useTheme";

const VIEW_W = 640;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 24;

function BarChartImpl({ data = [], valueKey = "amount_cents", color = "#185FA5", height = 160 }) {
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

  let maxCents = 100;
  for (const d of data) {
    const v = Number(d[valueKey] || 0);
    if (v > maxCents) maxCents = v;
  }
  const niceMax = Math.ceil(maxCents / 1000) * 1000 || maxCents;

  const chartW = VIEW_W - PAD_L - PAD_R;
  const chartH = height - PAD_T - PAD_B;
  const totalSlots = data.length;
  const slotW = chartW / totalSlots;
  const barW = Math.max(2, slotW * 0.7); // 70% du slot pour la bar, 30% espacement

  const yFor = (cents) => PAD_T + chartH - (cents / niceMax) * chartH;

  // Y labels : 0, 1/2, max
  const ySteps = [0, niceMax / 2, niceMax];
  const xLabelIndexes = data.length >= 4
    ? [0, Math.floor(data.length / 3), Math.floor((2 * data.length) / 3), data.length - 1]
    : data.map((_, i) => i);
  const fmtXLabel = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso || "";
    return d.getDate() + "/" + (d.getMonth() + 1);
  };
  const fmtYLabel = (cents) => (cents / 100).toFixed(0) + " €";

  return (
    <svg viewBox={"0 0 " + VIEW_W + " " + height} width="100%" height={height} style={{ display: "block" }}>
      {/* Grille horizontale */}
      {ySteps.map((v, i) => (
        <line key={i}
              x1={PAD_L} y1={yFor(v)} x2={VIEW_W - PAD_R} y2={yFor(v)}
              stroke={t.separator} strokeWidth={0.5} />
      ))}
      {/* Y labels */}
      {ySteps.map((v, i) => (
        <text key={i}
              x={PAD_L - 6} y={yFor(v) + 3}
              fontSize="10" fill={t.muted} textAnchor="end"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
          {fmtYLabel(v)}
        </text>
      ))}
      {/* Bars */}
      {data.map((d, i) => {
        const v = Number(d[valueKey] || 0);
        if (v <= 0) return null;
        const x = PAD_L + i * slotW + (slotW - barW) / 2;
        const y = yFor(v);
        const h = (PAD_T + chartH) - y;
        return (
          <rect key={i}
                x={x} y={y} width={barW} height={h}
                fill={color} opacity={0.7} rx={2}>
            <title>{(d.date || "") + " : " + (v / 100).toFixed(2) + " €"}</title>
          </rect>
        );
      })}
      {/* X labels */}
      {xLabelIndexes.map((i) => (
        <text key={i}
              x={PAD_L + i * slotW + slotW / 2} y={height - 8}
              fontSize="10" fill={t.muted} textAnchor="middle">
          {fmtXLabel(data[i].date)}
        </text>
      ))}
    </svg>
  );
}

export default memo(BarChartImpl);
