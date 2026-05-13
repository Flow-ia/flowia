// components/payout/PayoutDashboardBanner.jsx — Bandeau "Argent a recevoir"
// affiche en haut du Dashboard. Background gradient bleu (coherent avec hero
// stats Paiements en ligne). 4 colonnes : Solde dispo / En transit / Pending /
// Total + bouton PayoutButton a droite.
//
// Si payout_mode !== 'manual' (= reversement automatique configure), on
// remplace le bouton par une note explicative.

import { useStatsBalance } from "../../hooks/useStats";
import { formatCents } from "../../utils/format";
import PayoutButton from "./PayoutButton";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export default function PayoutDashboardBanner() {
  const { data: balance, loading, error } = useStatsBalance();

  // Pas connecte ou en chargement initial : on ne montre rien (evite un
  // bandeau vide qui flicker au premier render du Dashboard).
  if (loading || error || !balance?.connected) return null;

  const available    = balance.available_cents    || 0;
  const eligibleNow  = balance.eligible_now_cents || 0;
  const inTransit    = balance.in_transit_cents   || 0;
  const pending      = balance.pending_cents      || 0;
  const totalToRcv   = balance.total_to_receive_cents || (available + inTransit + pending);
  const payoutMode   = balance.payout_mode || "manual";
  const isManual     = payoutMode === "manual";

  return (
    <div style={{
      background: "linear-gradient(135deg, #042C53, #185FA5)",
      borderRadius: 12, padding: "1.25rem 1.5rem",
      color: "#fff",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr)) auto",
      gap: 20, alignItems: "center",
    }}>
      <Col label="Éligible maintenant" value={formatCents(eligibleNow)} accent="#A6F4D5" />
      <Col label="En transit J+3"      value={formatCents(inTransit)}   accent="#FFD9A6" />
      <Col label="En attente"          value={formatCents(pending)}     accent="rgba(255,255,255,0.85)" />
      <Col label="Total à recevoir"    value={formatCents(totalToRcv)}  accent="#fff" />
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        {isManual ? (
          <PayoutButton
            variant="hero"
            eligibleAmount={eligibleNow}
            bankAccountLast4={balance.bank_account?.last4 || null}
            bankName={balance.bank_account?.bank_name || null}
            onSuccess={() => { try { window.location.reload(); } catch {} }}
          />
        ) : (
          <span style={{
            fontSize: 11, color: "rgba(255,255,255,0.85)",
            textAlign: "right", lineHeight: 1.4, maxWidth: 180,
          }}>
            {"Mode automatique activé"}<br />
            {"Reversements quotidiens vers votre banque."}
          </span>
        )}
      </div>
    </div>
  );
}

function Col({ label, value, accent }) {
  return (
    <div>
      <div style={{
        fontSize: 10, opacity: 0.85,
        textTransform: "uppercase", letterSpacing: "0.04em",
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 500, fontFamily: MONO, color: accent, lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}
