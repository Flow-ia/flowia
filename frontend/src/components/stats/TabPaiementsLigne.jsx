// components/stats/TabPaiementsLigne.jsx — Onglet "Paiements en ligne".
// HERO GRADIENT BLEU (#042C53 -> #185FA5) en haut, 4 KPI status, policy +
// business impact, histogramme 30j.

import { useNavigate } from "react-router-dom";
import { useStatsOnlinePayments } from "../../hooks/useStats";
import { useTheme } from "../../hooks/useTheme";
import { Toast, useToast } from "../../components/UI";
import { formatCents, formatCentsSign, formatPct } from "../../utils/format";
import BarChart from "./BarChart";
import { LedgerDebugBadge } from "../LedgerDebugBadge";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const SVG_BASE = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
};
const Icon = ({ paths, size = 16, color }) => (
  <svg {...SVG_BASE} width={size} height={size} style={{ color, flexShrink: 0 }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);
const PATH_PERCENT  = '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>';
const PATH_TREND_UP = '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>';
const PATH_SETTINGS = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>';

export default function TabPaiementsLigne({ period }) {
  const { theme: t } = useTheme();
  const [toast] = useToast();
  const navigate = useNavigate();
  const { data, loading, error } = useStatsOnlinePayments(period);

  if (loading && !data) return <Loading theme={t} />;
  if (error) return <ErrorBox msg={error} />;

  const d = data || {};
  const summary = d.summary || {};
  const byStatus = d.by_status || {};
  const policy = d.policy || {};
  const impact = d.business_impact || {};
  const evo = d.evolution_30j || [];

  const grossCents = summary.gross_cents || 0;
  const netCents   = summary.net_cents   || 0;
  const netPct     = grossCents > 0 ? Math.round((netCents / grossCents) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Toast msg={toast?.msg} type={toast?.type} />

      {d._ledger_debug && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: t.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {"Source stats"}
          </span>
          <LedgerDebugBadge debug={d._ledger_debug}/>
        </div>
      )}

      {/* HERO GRADIENT BLEU */}
      <div style={{
        background: "linear-gradient(135deg, #042C53, #185FA5)",
        borderRadius: 12, padding: "1.5rem", color: "#fff",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 24, alignItems: "end",
          marginBottom: 16,
        }}>
          <div>
            <div style={{
              fontSize: 11, opacity: 0.85, textTransform: "uppercase",
              letterSpacing: "0.04em", marginBottom: 6,
            }}>
              Encaissé en ligne · 30 derniers jours
            </div>
            <div style={{ fontSize: 32, fontWeight: 500, fontFamily: MONO, lineHeight: 1.1 }}>
              {formatCents(grossCents)}
            </div>
            {summary.vs_previous_pct != null && (
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                {formatPct(summary.vs_previous_pct) + " vs 30 jours précédents"}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: 11, opacity: 0.85, textTransform: "uppercase",
              letterSpacing: "0.04em", marginBottom: 6,
            }}>
              Net pour vous
            </div>
            <div style={{ fontSize: 28, fontWeight: 500, fontFamily: MONO, color: "#A6F4D5", lineHeight: 1.1 }}>
              {formatCents(netCents)}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
              {netPct + "% du brut"}
            </div>
          </div>
        </div>

        {/* Sub-card transparente : breakdown */}
        <div style={{
          background: "rgba(255,255,255,0.12)",
          padding: 14, borderRadius: 8,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 16,
        }}>
          <BreakdownCol label="Brut encaissé" value={formatCents(grossCents)} color="#fff" />
          <BreakdownCol label="Frais Stripe (1,4% + 25c)"
                        value={formatCentsSign(-Math.abs(summary.stripe_fee_cents || 0))}
                        color="#FFD9A6" />
          <BreakdownCol label={"Commission FlowIA" + (policy.commission_rate ? " (" + policy.commission_rate + "%)" : "")}
                        value={formatCentsSign(-Math.abs(summary.platform_fee_cents || 0))}
                        color="#FFD9A6" />
          <BreakdownCol label="Net" value={formatCents(netCents)} color="#A6F4D5" />
        </div>
      </div>

      {/* Section 2 — 4 KPI status */}
      <div>
        <SectionTitle theme={t} title="STATUT DES PAIEMENTS EN LIGNE" />
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}>
          <StatusKPI theme={t} dot="#1D9E75" label="PAYOUTS REÇUS"
                     count={byStatus.payouts_received?.count || 0}
                     sub="paiements arrivés en banque"
                     amount={byStatus.payouts_received?.amount_cents || 0}
                     valueColor="#0F6E56" />
          <StatusKPI theme={t} dot="#BA7517" label="EN ATTENTE"
                     count={byStatus.pending_payout?.count || 0}
                     sub="à reverser"
                     amount={byStatus.pending_payout?.amount_cents || 0}
                     valueColor="#BA7517" />
          <StatusKPI theme={t} dot="#A32D2D" label="REMBOURSÉS"
                     count={byStatus.refunded?.count || 0}
                     sub="annulations dans délais"
                     amount={byStatus.refunded?.amount_cents || 0}
                     valueColor="#A32D2D"
                     amountNeg />
          <StatusKPI theme={t} dot="#4A1B0C" label="NO-SHOW RETENUS"
                     count={byStatus.no_show_retained?.count || 0}
                     sub="acompte conservé"
                     amount={byStatus.no_show_retained?.amount_cents || 0}
                     valueColor="#4A1B0C" />
        </div>
      </div>

      {/* Section 3 — 2 cards (Politique / Impact) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 16,
      }}>
        {/* Politique */}
        <div style={{
          padding: "1.25rem", borderRadius: 12,
          background: t.card, border: "0.5px solid " + t.border,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <Icon paths={PATH_PERCENT} size={18} color="#185FA5" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: t.text }}>
              Politique de paiement
            </h3>
          </div>
          <PolicyRow theme={t} label="Mode" value={policy.mode || "—"} />
          <PolicyRow theme={t} label="Acompte exigé"
                     value={policy.deposit_pct != null ? policy.deposit_pct + "% du prix" : "Non configuré"} />
          <PolicyRow theme={t} label="Délai annulation gratuit"
                     value={policy.cancellation_window_hours != null
                       ? policy.cancellation_window_hours + "h avant le RDV"
                       : "—"} />
          <PolicyRow theme={t} label="Délai reversement banque"
                     value={policy.payout_delay_days != null
                       ? "Jusqu'à " + policy.payout_delay_days + " jours ouvrés"
                       : "—"}
                     isLast />
          <button type="button"
                  onClick={() => navigate("/reglages/paiements")}
                  style={{
                    width: "100%", marginTop: 12,
                    padding: "10px 12px", borderRadius: 8,
                    background: t.cardAlt, border: "0.5px solid " + t.border,
                    color: t.text, fontSize: 13, fontWeight: 500,
                    cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
            <Icon paths={PATH_SETTINGS} size={14} color={t.text} />
            Modifier ma politique
          </button>
        </div>

        {/* Impact */}
        <div style={{
          padding: "1.25rem", borderRadius: 12,
          background: t.card, border: "0.5px solid " + t.border,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <Icon paths={PATH_TREND_UP} size={18} color="#0F6E56" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: t.text }}>
              Impact business
            </h3>
          </div>
          <div style={{
            background: "#E1F5EE", borderRadius: 8, padding: "10px 12px", marginBottom: 8,
          }}>
            <div style={{ fontSize: 11, color: "#0F6E56", marginBottom: 2 }}>No-show réduits</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "#04342C", fontFamily: MONO }}>
              {impact.no_show_reduction_pct != null
                ? formatPct(-Math.abs(impact.no_show_reduction_pct))
                : "—"}
            </div>
            <div style={{ fontSize: 10, color: "#0F6E56", marginTop: 2 }}>
              depuis activation acompte
            </div>
          </div>
          <div style={{
            background: "#E6F1FB", borderRadius: 8, padding: "10px 12px",
          }}>
            <div style={{ fontSize: 11, color: "#185FA5", marginBottom: 2 }}>Revenu additionnel</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "#042C53", fontFamily: MONO }}>
              {impact.additional_revenue_cents != null
                ? "+" + formatCents(Math.abs(impact.additional_revenue_cents))
                : "—"}
            </div>
            <div style={{ fontSize: 10, color: "#185FA5", marginTop: 2 }}>
              acomptes conservés sur no-show 30j
            </div>
          </div>
        </div>
      </div>

      {/* Section 4 — Évolution 30j (histogramme) */}
      <div>
        <SectionTitle theme={t} title="ÉVOLUTION DES PAIEMENTS EN LIGNE · 30 jours" />
        <div style={{
          padding: "1.25rem", borderRadius: 12,
          background: t.card, border: "0.5px solid " + t.border,
        }}>
          <BarChart data={evo} valueKey="amount_cents" color="#185FA5" height={160} />
        </div>
      </div>
    </div>
  );
}

function BreakdownCol({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, opacity: 0.85, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500, fontFamily: MONO, color }}>{value}</div>
    </div>
  );
}

function StatusKPI({ theme: t, dot, label, count, sub, amount, valueColor, amountNeg }) {
  return (
    <div style={{
      padding: "1.25rem", borderRadius: 12,
      background: t.card, border: "0.5px solid " + t.border,
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }} />
        <span style={{
          fontSize: 11, fontWeight: 500, color: t.muted,
          textTransform: "uppercase", letterSpacing: "0.04em",
        }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color: valueColor, fontFamily: MONO, lineHeight: 1.1 }}>
        {count}
      </div>
      <span style={{ fontSize: 11, color: t.muted }}>{sub}</span>
      <div style={{
        marginTop: 4, paddingTop: 8,
        borderTop: "0.5px solid " + t.border,
        fontSize: 13, fontFamily: MONO,
        color: amountNeg ? "#A32D2D" : t.text,
      }}>
        {amountNeg ? formatCentsSign(-Math.abs(amount)) : formatCents(amount)}
      </div>
    </div>
  );
}

function PolicyRow({ theme: t, label, value, isLast }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "6px 0",
      borderBottom: isLast ? "none" : "0.5px solid " + t.separator,
      fontSize: 12,
    }}>
      <span style={{ color: t.muted }}>{label}</span>
      <span style={{ color: t.text, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function SectionTitle({ theme: t, title }) {
  return (
    <h2 style={{
      margin: "0 0 10px", fontSize: 14, fontWeight: 500,
      textTransform: "uppercase", letterSpacing: "0.04em",
      color: t.muted,
    }}>{title}</h2>
  );
}

function Loading({ theme: t }) {
  return <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>Chargement…</div>;
}
function ErrorBox({ msg }) {
  return <div style={{ padding: 16, color: "#A32D2D", fontSize: 13 }}>{"Erreur : " + msg}</div>;
}
