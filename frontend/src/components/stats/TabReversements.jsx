// components/stats/TabReversements.jsx — Onglet "Reversements".
// HERO CARD VERT (border 2px #1D9E75) avec bouton "Reverser maintenant"
// (placeholder Commit 5), estimation prochain payout, total reverse 30j,
// historique des payouts.

import { useState } from "react";
import { useStatsPayouts } from "../../hooks/useStats";
import { useTheme } from "../../hooks/useTheme";
import { Toast, useToast } from "../../components/UI";
import { formatCents, formatDateWeekday } from "../../utils/format";
import PayoutHistoryRow from "./PayoutHistoryRow";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const STRIPE_DASHBOARD_URL = "https://dashboard.stripe.com/payouts";

const SVG_BASE = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
};
const Icon = ({ paths, size = 18, color }) => (
  <svg {...SVG_BASE} width={size} height={size} style={{ color, flexShrink: 0 }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);
const PATH_CASH        = '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>';
const PATH_SEND        = '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>';
const PATH_EXTERNAL    = '<path d="M11 7h-5a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-5"/><line x1="10" y1="14" x2="20" y2="4"/><polyline points="15 4 20 4 20 9"/>';
const PATH_INFO        = '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12.01" y2="8"/><polyline points="11 12 12 12 12 16 13 16"/>';
const PATH_CLOCK       = '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 12"/>';
const PATH_WALLET      = '<path d="M17 8V7a2 2 0 0 0 -2 -2H5a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-1"/><path d="M19 12h2a1 1 0 0 0 1 -1v-2a1 1 0 0 0 -1 -1h-2a2 2 0 0 0 0 4z"/>';

const DEFAULT_PER_PAGE = 10;
const VOIR_TOUT_PER_PAGE = 50;

export default function TabReversements({ period }) {
  const { theme: t } = useTheme();
  const [toast, showToast] = useToast();
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const { data, loading, error } = useStatsPayouts(period, { perPage });

  if (loading && !data) return <Loading theme={t} />;
  if (error) return <ErrorBox msg={error} />;

  const balance = data?.balance || {};
  const payoutsBlock = data?.payouts || {};
  const payouts = payoutsBlock.payouts || [];
  const stats   = payoutsBlock.stats   || {};

  const next = balance.next_payout_estimate;
  const bankInfo = balance.bank_account
    ? "Sur compte bancaire ****" + (balance.bank_account.last4 || "")
        + (balance.bank_account.bank_name ? " (" + balance.bank_account.bank_name + ")" : "")
        + " · arrivée sous 1-3 jours ouvrés"
    : "Compte bancaire Stripe · arrivée sous 1-3 jours ouvrés";

  const totalReverse = stats.total_period_cents || 0;
  const avgPayout    = stats.avg_amount_cents   || 0;
  const minPayout    = stats.min_cents          || 0;
  const maxPayout    = stats.max_cents          || 0;
  // Barre de progression : on prend un max esthetique (le plus gros payout)
  const progPct = maxPayout > 0 ? Math.min(100, (avgPayout / maxPayout) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* HERO CARD VERT BORDER 2px */}
      <div style={{
        background: t.card, border: "2px solid #1D9E75",
        borderRadius: 12, padding: "1.5rem",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr auto", gap: 24,
          alignItems: "center", marginBottom: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: "#E1F5EE",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Icon paths={PATH_CASH} size={18} color="#1D9E75" />
              </div>
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 500, color: "#0F6E56",
                  textTransform: "uppercase", letterSpacing: "0.04em",
                }}>
                  À reverser maintenant
                </div>
                <div style={{ fontSize: 11, color: t.muted }}>Solde Stripe disponible</div>
              </div>
            </div>
            <div style={{
              fontSize: 32, fontWeight: 500, color: t.text,
              fontFamily: MONO, lineHeight: 1.1,
            }}>
              {formatCents(balance.available_cents || 0)}
            </div>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 8 }}>
              {bankInfo}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            <button type="button"
                    onClick={() => showToast("Bouton fonctionnel au Commit 5", "info")}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                      background: "#1D9E75", color: "#fff",
                      border: "none", padding: "12px 20px",
                      borderRadius: 8, fontSize: 14, fontWeight: 500,
                      cursor: "pointer", fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}>
              <Icon paths={PATH_SEND} size={14} color="#fff" />
              Reverser maintenant
            </button>
            <button type="button"
                    onClick={() => window.open(STRIPE_DASHBOARD_URL, "_blank", "noopener,noreferrer")}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                      background: t.cardAlt, color: t.text,
                      border: "0.5px solid " + t.border, padding: "8px 12px",
                      borderRadius: 8, fontSize: 12, fontWeight: 500,
                      cursor: "pointer", fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}>
              <Icon paths={PATH_EXTERNAL} size={12} color={t.text} />
              Voir sur Stripe
            </button>
          </div>
        </div>
        {/* Bandeau info en bas */}
        <div style={{
          background: t.cardAlt, borderRadius: 8,
          padding: "10px 12px", display: "flex", gap: 8,
          fontSize: 12, color: t.muted,
        }}>
          <Icon paths={PATH_INFO} size={14} color="#185FA5" />
          <div style={{ lineHeight: 1.5 }}>
            <strong style={{ color: t.text }}>Mode manuel activé.</strong>
            {" Vous reversez vous-même quand vous voulez. Pour un reversement automatique quotidien, configurez-le sur votre dashboard Stripe."}
          </div>
        </div>
      </div>

      {/* Section 2 — Prochain estime + Total reversé */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 16,
      }}>
        {/* Prochain reversement */}
        <div style={{
          padding: "1.25rem", borderRadius: 12,
          background: t.card, border: "0.5px solid " + t.border,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <Icon paths={PATH_CLOCK} size={18} color="#BA7517" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: t.text }}>
              Prochain reversement estimé
            </h3>
          </div>
          {next ? (
            <>
              <div style={{
                fontSize: 22, fontWeight: 500, color: t.text,
                fontFamily: MONO, lineHeight: 1.1,
              }}>
                {formatDateWeekday(next.estimated_date)}
              </div>
              <div style={{ fontSize: 13, color: t.muted, fontFamily: MONO, marginTop: 4 }}>
                {"~ " + formatCents(next.estimated_amount_cents || 0)}
              </div>
              <div style={{
                marginTop: 12, paddingTop: 12,
                borderTop: "0.5px solid " + t.separator,
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                {next.based_on_avg_interval_days != null && (
                  <div style={{ fontSize: 11, color: t.muted }}>
                    {"Vous reversez généralement tous les " + next.based_on_avg_interval_days + " jours selon votre historique."}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: t.muted }}>Solde actuel</span>
                  <span style={{ color: t.text, fontFamily: MONO }}>{formatCents(balance.available_cents || 0)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: t.muted }}>+ paiements futurs (estim.)</span>
                  <span style={{ color: t.text, fontFamily: MONO }}>{formatCents(balance.in_transit_cents || 0)}</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: t.muted, padding: "12px 0" }}>
              Pas encore assez d'historique pour estimer.
            </div>
          )}
        </div>

        {/* Total reverse 30j */}
        <div style={{
          padding: "1.25rem", borderRadius: 12,
          background: t.card, border: "0.5px solid " + t.border,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <Icon paths={PATH_WALLET} size={18} color="#0F6E56" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: t.text }}>
              Total reversé · 30 jours
            </h3>
          </div>
          <div style={{
            fontSize: 22, fontWeight: 500, color: t.text,
            fontFamily: MONO, lineHeight: 1.1,
          }}>
            {formatCents(totalReverse)}
          </div>
          <div style={{ fontSize: 13, color: t.muted, marginTop: 4, marginBottom: 12 }}>
            {"Sur " + (stats.count || 0) + (stats.count > 1 ? " reversements" : " reversement")}
          </div>
          {/* Barre de progression */}
          <div style={{
            height: 6, background: t.cardAlt, borderRadius: 3,
            overflow: "hidden", marginBottom: 12,
          }}>
            <div style={{
              width: progPct + "%", height: "100%",
              background: "linear-gradient(90deg, #1D9E75, #0F6E56)",
            }} />
          </div>
          <div style={{
            paddingTop: 12, borderTop: "0.5px solid " + t.separator,
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ fontSize: 11, color: t.muted }}>
              {"Moyenne · "}
              <strong style={{ color: t.text, fontFamily: MONO }}>{formatCents(avgPayout)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: t.muted }}>
              <span>{"Min " + formatCents(minPayout)}</span>
              <span>{"Max " + formatCents(maxPayout)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3 — Historique */}
      <div>
        <SectionTitle theme={t} title="HISTORIQUE DES REVERSEMENTS" />
        <div style={{
          borderRadius: 12, background: t.card, border: "0.5px solid " + t.border,
          overflow: "hidden",
        }}>
          {payouts.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", fontSize: 12, color: t.muted, lineHeight: 1.5 }}>
              {"Aucun reversement encore. Lancez votre premier dès que vous aurez du solde Stripe disponible !"}
            </div>
          ) : (
            payouts.map((p, i, arr) => (
              <PayoutHistoryRow key={p.id} payout={p} isLast={i === arr.length - 1} />
            ))
          )}
        </div>
        {payouts.length >= DEFAULT_PER_PAGE && perPage === DEFAULT_PER_PAGE && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
            <button type="button"
                    onClick={() => setPerPage(VOIR_TOUT_PER_PAGE)}
                    style={{
                      padding: "10px 20px", borderRadius: 8,
                      background: t.cardAlt, border: "0.5px solid " + t.border,
                      color: t.text, fontSize: 13, fontWeight: 500,
                      cursor: "pointer", fontFamily: "inherit",
                    }}>
              Voir tous les reversements
            </button>
          </div>
        )}
      </div>
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
