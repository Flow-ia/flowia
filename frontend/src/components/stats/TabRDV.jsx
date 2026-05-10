// components/stats/TabRDV.jsx — Onglet "RDV" (sources + statuts segmentes
// + employes + insight). N'inclut PAS les walk-in.

import { Link } from "react-router-dom";
import { useStatsRDV } from "../../hooks/useStats";
import { useTheme } from "../../hooks/useTheme";
import { formatCents, formatPct } from "../../utils/format";
import SegmentedBar from "./SegmentedBar";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const SVG_BASE = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
};
const Icon = ({ paths, size = 16, color }) => (
  <svg {...SVG_BASE} width={size} height={size} style={{ color, flexShrink: 0 }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);
const PATH_INFO        = '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12.01" y2="8"/><polyline points="11 12 12 12 12 16 13 16"/>';
const PATH_WORLD       = '<circle cx="12" cy="12" r="9"/><line x1="3.6" y1="9" x2="20.4" y2="9"/><line x1="3.6" y1="15" x2="20.4" y2="15"/><path d="M11.5 3a17 17 0 0 0 0 18"/><path d="M12.5 3a17 17 0 0 1 0 18"/>';
const PATH_PHONE       = '<path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2"/>';
const PATH_CREDIT_CARD = '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>';
const PATH_CC_PAY      = '<path d="M12 19H5a2 2 0 0 1 -2 -2V7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v6"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16l3 3l-3 3"/>';
const PATH_CASH_OFF    = '<line x1="3" y1="3" x2="21" y2="21"/><path d="M21 6v8a2 2 0 0 1 -2 2h-8m-4 0H5a2 2 0 0 1 -2 -2V8a2 2 0 0 1 2 -2h2"/>';
const PATH_USER        = '<circle cx="12" cy="7" r="4"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>';
const PATH_BULB        = '<path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7"/><path d="M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3"/><line x1="9.7" y1="17" x2="14.3" y2="17"/>';

export default function TabRDV({ period }) {
  const { theme: t } = useTheme();
  const { data, loading, error } = useStatsRDV(period);

  if (loading && !data) return <Loading theme={t} />;
  if (error) return <ErrorBox msg={error} />;

  const d = data || {};
  const bySource   = d.by_source   || {};
  const byStatus   = d.by_status   || {};
  const byEmployee = d.by_employee || [];
  const insight    = d.insight     || {};

  const onlineSrc  = bySource.online_booking || { count: 0, ca_cents: 0, by_payment_status: {} };
  const phoneSrc   = bySource.phone_internal || { count: 0, ca_cents: 0, by_employee: {} };
  const totalCount = (onlineSrc.count || 0) + (phoneSrc.count || 0);
  const onlinePct  = totalCount > 0 ? Math.round((onlineSrc.count / totalCount) * 100) : 0;
  const phonePct   = totalCount > 0 ? 100 - onlinePct : 0;

  // Segments status (6 colors)
  const statusSegments = [
    { key: "stripe_100",       label: "Stripe 100%",    count: byStatus.stripe_100?.count       || 0, color: "#185FA5" },
    { key: "stripe_acompte",   label: "Acompte Stripe", count: byStatus.stripe_acompte?.count   || 0, color: "#BA7517" },
    { key: "not_paid",         label: "Pas payé",       count: byStatus.not_paid?.count         || 0, color: "#888780" },
    { key: "cash_paid",        label: "Encaissé caisse",count: byStatus.cash_paid?.count        || 0, color: "#0F6E56" },
    { key: "refunded",         label: "Remboursé",      count: byStatus.refunded?.count         || 0, color: "#A32D2D" },
    { key: "no_show_retained", label: "No-show retenu", count: byStatus.no_show_retained?.count || 0, color: "#4A1B0C" },
  ];
  const totalRdvForBar = statusSegments.reduce((s, x) => s + (x.count || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Bandeau info en haut */}
      <div style={{
        display: "flex", gap: 10, alignItems: "flex-start",
        background: t.cardAlt, borderRadius: 8,
        padding: "12px 14px", border: "0.5px solid " + t.border,
      }}>
        <Icon paths={PATH_INFO} size={16} color="#185FA5" />
        <div style={{ fontSize: 12, color: t.muted, lineHeight: 1.5 }}>
          {"Cette page liste vos rendez-vous (avec ou sans paiement). Les walk-in sans RDV ne sont pas inclus ici — ils sont visibles dans "}
          <Link to="/historique" style={{ color: "#185FA5", textDecoration: "underline" }}>
            l'historique des transactions
          </Link>.
        </div>
      </div>

      {/* Section 1 — RDV PAR SOURCE (2 cards) */}
      <div>
        <SectionTitle theme={t} title="RDV PAR SOURCE" />
        <div style={{
          display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}>
          {/* Card Booking en ligne */}
          <SourceCard
            theme={t}
            iconPaths={PATH_WORLD}
            iconBg="#E6F1FB"
            iconColor="#185FA5"
            title="Booking en ligne"
            subtitle="Page publique flowiapro.com/book"
            count={onlineSrc.count || 0}
            pct={onlinePct}
            ca={"€ de CA potentiel : " + formatCents(onlineSrc.ca_cents || 0)}
            rows={[
              { iconPaths: PATH_CREDIT_CARD, color: "#185FA5", label: "Stripe 100%",        value: onlineSrc.by_payment_status?.stripe_100 || 0 },
              { iconPaths: PATH_CC_PAY,      color: "#BA7517", label: "Acompte Stripe",     value: onlineSrc.by_payment_status?.stripe_acompte || 0 },
              { iconPaths: PATH_CASH_OFF,    color: t.muted,   label: "Pas payé (à encaisser)", value: onlineSrc.by_payment_status?.not_paid || 0 },
            ]}
          />
          {/* Card RDV téléphone */}
          <SourceCard
            theme={t}
            iconPaths={PATH_PHONE}
            iconBg="#EEEDFE"
            iconColor="#534AB7"
            title="RDV téléphone / agenda"
            subtitle="Pris par un employé en interne"
            count={phoneSrc.count || 0}
            pct={phonePct}
            ca={formatCents(phoneSrc.ca_cents || 0) + " à encaisser sur place"}
            rows={byEmployee.slice(0, 3).map(e => ({
              iconPaths: PATH_USER, color: "#534AB7",
              label: "Pris par " + (e.name || "Sans employé"),
              value: e.caisse_count || 0,
            }))}
          />
        </div>
      </div>

      {/* Section 2 — État de paiement (barre segmentée) */}
      <div>
        <SectionTitle theme={t} title={"ÉTAT DE PAIEMENT (" + totalRdvForBar + " RDV)"} />
        <div style={{
          padding: "1.25rem", borderRadius: 12,
          background: t.card, border: "0.5px solid " + t.border,
        }}>
          <SegmentedBar segments={statusSegments} height={36} />
          <div style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}>
            {statusSegments.map((seg) => {
              const sd = byStatus[seg.key] || { count: 0, total_cents: 0 };
              return (
                <div key={seg.key} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: t.text }}>{seg.label}</span>
                      <span style={{ fontSize: 12, color: t.muted, fontFamily: MONO }}>
                        {sd.count + " RDV · " + formatCents(sd.total_cents || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Section 3 — PERFORMANCE PAR EMPLOYÉ */}
      <div>
        <SectionTitle theme={t} title="PERFORMANCE PAR EMPLOYÉ" />
        <div style={{
          borderRadius: 12, background: t.card, border: "0.5px solid " + t.border,
          overflow: "hidden",
        }}>
          {byEmployee.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", fontSize: 12, color: t.muted }}>
              Aucun employé sur cette période
            </div>
          ) : (
            byEmployee.slice(0, 5).map((e, i, arr) => (
              <EmployeeRow key={e.employee_id || i} emp={e} isLast={i === arr.length - 1} theme={t} />
            ))
          )}
        </div>
      </div>

      {/* Section 4 — Conseil insight */}
      {insight.message_fr && (
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-start",
          background: t.cardAlt, borderRadius: 8,
          padding: "12px 14px", border: "0.5px solid " + t.border,
        }}>
          <Icon paths={PATH_BULB} size={20} color="#BA7517" />
          <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5 }}>
            <strong style={{ color: "#BA7517" }}>{"Conseil : "}</strong>
            {insight.message_fr}
            {(insight.deposit_honor_rate_pct != null && insight.no_deposit_honor_rate_pct != null) && (
              <span style={{ marginLeft: 4, color: t.muted, fontFamily: MONO }}>
                {"(" + formatPct(insight.deposit_honor_rate_pct, false) + " vs " + formatPct(insight.no_deposit_honor_rate_pct, false) + ")"}
              </span>
            )}
          </div>
        </div>
      )}
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

function SourceCard({ theme: t, iconPaths, iconBg, iconColor, title, subtitle, count, pct, ca, rows }) {
  return (
    <div style={{
      padding: "1.25rem", borderRadius: 12,
      background: t.card, border: "0.5px solid " + t.border,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: iconBg,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon paths={iconPaths} size={18} color={iconColor} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{title}</div>
          <div style={{ fontSize: 11, color: t.muted, lineHeight: 1.3 }}>{subtitle}</div>
        </div>
      </div>
      <div>
        <div style={{
          fontSize: 26, fontWeight: 500, color: t.text,
          fontFamily: MONO, lineHeight: 1,
        }}>{count}</div>
        <div style={{ fontSize: 13, color: t.muted, marginTop: 2 }}>
          {"RDV · " + pct + "%"}
        </div>
        <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>{ca}</div>
      </div>
      {rows.length > 0 && (
        <div style={{
          marginTop: 4, paddingTop: 10,
          borderTop: "0.5px solid " + t.border,
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: 8, fontSize: 12,
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: t.text }}>
                <Icon paths={r.iconPaths} size={14} color={r.color} />
                {r.label}
              </span>
              <span style={{ fontFamily: MONO, color: t.text }}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeRow({ emp, isLast, theme: t }) {
  const initials = (emp.name || "?").split(" ").map(s => s.charAt(0).toUpperCase()).slice(0, 2).join("");
  const colors = ["#185FA5", "#0F6E56", "#BA7517", "#534AB7", "#A32D2D"];
  const color  = colors[Math.abs((emp.employee_id || "x").charCodeAt(0)) % colors.length];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "14px 16px",
      borderBottom: isLast ? "none" : "0.5px solid " + t.separator,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%", background: color,
        color: "#fff", fontWeight: 500, fontSize: 13,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{emp.name || "Sans employé"}</div>
        <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>
          {(emp.rdv_count || 0) + " RDV · " + (emp.en_ligne_count || 0) + " en ligne · " + (emp.caisse_count || 0) + " caisse"}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 500, fontFamily: MONO, color: t.text }}>
          {formatCents(emp.ca_cents || 0)}
        </div>
        <div style={{ fontSize: 10, color: t.muted, marginTop: 2 }}>CA généré</div>
      </div>
    </div>
  );
}

function Loading({ theme: t }) {
  return <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>Chargement…</div>;
}
function ErrorBox({ msg }) {
  return <div style={{ padding: 16, color: "#A32D2D", fontSize: 13 }}>{"Erreur : " + msg}</div>;
}
