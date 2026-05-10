// components/stats/SegmentedBar.jsx — Barre horizontale segmentee. Affiche
// N segments colores proportionnels avec libelle blanc dans chaque segment
// (masque si segment trop petit).
//
// Props : segments [{ key, label, count, color }] — count est utilise pour
// la repartition. Un segment a 0 count est masque.

import { memo } from "react";

function SegmentedBarImpl({ segments = [], height = 36 }) {
  const totalCount = segments.reduce((s, x) => s + (x.count || 0), 0);
  if (totalCount === 0) {
    return (
      <div style={{
        height, borderRadius: 8, background: "rgba(0,0,0,0.04)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, color: "rgba(0,0,0,0.4)",
      }}>
        Aucune donnée
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", height, borderRadius: 8, overflow: "hidden",
      width: "100%",
    }}>
      {segments.map((seg) => {
        const count = seg.count || 0;
        if (count === 0) return null;
        const pct = (count / totalCount) * 100;
        const showLabel = pct >= 5;
        return (
          <div key={seg.key}
               title={(seg.label || "") + " : " + count}
               style={{
                 width: pct + "%",
                 background: seg.color,
                 display: "flex", alignItems: "center", justifyContent: "center",
                 color: "#fff", fontSize: 12, fontWeight: 500,
                 minWidth: 0, overflow: "hidden",
               }}>
            {showLabel ? count : ""}
          </div>
        );
      })}
    </div>
  );
}

export default memo(SegmentedBarImpl);
