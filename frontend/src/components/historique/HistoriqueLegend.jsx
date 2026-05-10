// components/historique/HistoriqueLegend.jsx — Legende fixe en bas de page,
// rappelle les 5 types de transaction (icone + nom + description courte).
// Aide pedagogique pour le commercant qui decouvre le modele 4-sources.

import { memo } from "react";
import { useTheme } from "../../hooks/useTheme";

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

const ITEMS = [
  {
    label: "Stripe 100%",
    desc: "Paiement intégral en ligne via le booking site",
    bg: "#E6F1FB", color: "#185FA5",
    paths: '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>',
  },
  {
    label: "Acompte Stripe",
    desc: "Acompte en ligne + reste à encaisser en caisse",
    bg: "#FAEEDA", color: "#BA7517",
    paths: '<path d="M12 19H5a2 2 0 0 1 -2 -2V7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v6"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16l3 3l-3 3"/>',
  },
  {
    label: "Caisse RDV",
    desc: "Encaissement comptoir d'un RDV (espèces / carte locale)",
    bg: "#E1F5EE", color: "#0F6E56",
    paths: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  },
  {
    label: "Walk-in (sans RDV)",
    desc: "Vente caisse seule, client passe sans rendez-vous",
    bg: "#FAEEDA", color: "#BA7517",
    paths: '<circle cx="13" cy="4" r="1"/><path d="M7 21l3 -4"/><path d="M16 21l-2 -4l-3 -3l1 -6"/><path d="M6 12l2 -3l4 -1l3 3l3 1"/>',
  },
  {
    label: "Remboursement",
    desc: "Annulation client dans délais — montant rendu Stripe",
    bg: "#FCEBEB", color: "#A32D2D",
    paths: '<path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/>',
  },
];

function HistoriqueLegendImpl() {
  const { theme: t } = useTheme();
  return (
    <div style={{
      marginTop: 8,
      padding: 16, borderRadius: 12,
      background: t.cardAlt, border: "0.5px solid " + t.border,
    }}>
      <p style={{
        margin: "0 0 10px", fontSize: 11, fontWeight: 500,
        color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em",
      }}>
        Légende des types de transaction
      </p>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 10,
      }}>
        {ITEMS.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: item.bg,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon paths={item.paths} size={14} color={item.color} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: t.text }}>
                {item.label}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: t.muted, lineHeight: 1.4 }}>
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(HistoriqueLegendImpl);
