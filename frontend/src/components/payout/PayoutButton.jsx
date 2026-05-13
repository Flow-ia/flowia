// components/payout/PayoutButton.jsx — Bouton "Reverser maintenant" avec
// modal de confirmation + toast succes/erreur.
//
// Le montant affiche est ELIGIBLE (somme appointment_payouts dont release_at
// est passe), PAS le solde Stripe brut. Eviter de payer un RDV futur encore
// annulable est non-negociable cote produit.

import { useEffect, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { usePayoutMutation } from "../../hooks/usePayoutMutation";
import { formatCents } from "../../utils/format";

const SKIP_CONFIRM_KEY = "flowia.payout.skipConfirm";
const PAYOUT_CTA_GREEN = "#1D9E75";

const SVG_BASE = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
};
const Icon = ({ paths, size = 14, color }) => (
  <svg {...SVG_BASE} width={size} height={size} style={{ color, flexShrink: 0 }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);
const PATH_SEND        = '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>';
const PATH_CIRCLE_CHECK= '<circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/>';
const PATH_ALERT       = '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
const PATH_LOADER      = '<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>';

export default function PayoutButton({
  // Montant ELIGIBLE au reversement immediat (escrows release_at <= NOW()).
  // `availableAmount` est conserve en alias pour back-compat des callers
  // qui n'ont pas encore migre (PayoutDashboardBanner / TabReversements /
  // pages/reglages/paiements).
  eligibleAmount = null,
  availableAmount = 0,
  bankAccountLast4 = null,
  bankName = null,
  hasPendingPayout = false,
  variant = "primary",
  onSuccess,
}) {
  const { theme: t } = useTheme();
  const { mutate, reset, status, data, error } = usePayoutMutation();
  const [showModal, setShowModal] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);

  const amount = eligibleAmount != null ? eligibleAmount : availableAmount;

  // Toast auto-dismiss
  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => { reset(); onSuccess?.(); }, 5000);
      return () => clearTimeout(timer);
    }
    if (status === "error") {
      const timer = setTimeout(reset, 8000);
      return () => clearTimeout(timer);
    }
  }, [status, reset, onSuccess]);

  const isDisabled = amount <= 0 || hasPendingPayout || status === "loading";
  const tooltip = amount <= 0
    ? "Aucun montant éligible (les RDV à venir sont libérés 3 jours après la prestation)"
    : hasPendingPayout
      ? "Reversement déjà en cours"
      : "";

  const onClick = () => {
    if (isDisabled) return;
    const userSkip = (() => {
      try { return localStorage.getItem(SKIP_CONFIRM_KEY) === "1"; } catch { return false; }
    })();
    if (userSkip) {
      mutate().catch(() => { /* error already in state */ });
    } else {
      setShowModal(true);
    }
  };

  const onConfirm = () => {
    if (skipConfirm) {
      try { localStorage.setItem(SKIP_CONFIRM_KEY, "1"); } catch {}
    }
    setShowModal(false);
    mutate().catch(() => {});
  };

  // Styling selon variant
  const buttonStyle = variant === "hero"
    ? {
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        background: PAYOUT_CTA_GREEN, color: "#fff",
        border: "none", padding: "12px 20px",
        borderRadius: 8, fontSize: 14, fontWeight: 500,
        cursor: isDisabled ? "not-allowed" : "pointer",
        fontFamily: "inherit", whiteSpace: "nowrap",
        opacity: isDisabled ? 0.5 : 1,
      }
    : {
        display: "inline-flex", alignItems: "center", gap: 6,
        background: t.text, color: t.bg,
        border: "none", padding: "10px 16px",
        borderRadius: 8, fontSize: 13, fontWeight: 500,
        cursor: isDisabled ? "not-allowed" : "pointer",
        fontFamily: "inherit", whiteSpace: "nowrap",
        opacity: isDisabled ? 0.5 : 1,
      };

  return (
    <>
      <button type="button" onClick={onClick} disabled={isDisabled}
              title={tooltip}
              style={buttonStyle}>
        {status === "loading"
          ? (<>
              <Icon paths={PATH_LOADER} size={variant === "hero" ? 14 : 14}
                    color={variant === "hero" ? "#fff" : t.bg} />
              {"Reversement en cours…"}
            </>)
          : (<>
              <Icon paths={PATH_SEND} size={variant === "hero" ? 14 : 14}
                    color={variant === "hero" ? "#fff" : t.bg} />
              {"Reverser les montants éligibles"}
            </>)}
      </button>

      {showModal && (
        <ConfirmModal
          theme={t}
          amount={amount}
          last4={bankAccountLast4}
          bankName={bankName}
          skipConfirm={skipConfirm}
          onSkipChange={setSkipConfirm}
          onCancel={() => setShowModal(false)}
          onConfirm={onConfirm}
        />
      )}

      {status === "success" && (
        <SuccessToast theme={t} payload={data} onDismiss={() => { reset(); onSuccess?.(); }} />
      )}
      {status === "error" && (
        <ErrorToast theme={t} message={error?.message || "Erreur inconnue."} onDismiss={reset} />
      )}
    </>
  );
}

function ConfirmModal({ theme: t, amount, last4, bankName, skipConfirm, onSkipChange, onCancel, onConfirm }) {
  const bankLabel = last4
    ? `compte ****${last4}${bankName ? ` (${bankName})` : ""}`
    : "votre compte bancaire";

  return (
    <div onClick={onCancel}
         style={{
           position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
           display: "flex", alignItems: "center", justifyContent: "center",
           zIndex: 10000, padding: 16,
         }}>
      <div onClick={(e) => e.stopPropagation()}
           style={{
             background: t.card, color: t.text,
             padding: 24, borderRadius: 12,
             border: "0.5px solid " + t.border,
             maxWidth: 460, width: "100%",
             display: "flex", flexDirection: "column", gap: 14,
           }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: t.text }}>
          {"Confirmer le reversement"}
        </h3>
        <p style={{ margin: 0, fontSize: 14, color: t.muted, lineHeight: 1.5 }}>
          {"Vous allez reverser "}
          <strong style={{ color: t.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            {formatCents(amount)}
          </strong>
          {" sur "}{bankLabel}{". Seuls les RDV passés depuis +3 jours sont inclus, les fonds des rendez-vous à venir restent bloqués pour permettre un éventuel remboursement client. Arrivée sous 1-3 jours ouvrés."}
        </p>
        <label style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, color: t.muted, cursor: "pointer", userSelect: "none",
        }}>
          <input type="checkbox" checked={skipConfirm}
                 onChange={(e) => onSkipChange(e.target.checked)}
                 style={{ cursor: "pointer" }} />
          {"Ne plus me demander confirmation"}
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          <button type="button" onClick={onCancel}
                  style={{
                    padding: "10px 16px", borderRadius: 8,
                    background: t.cardAlt, color: t.text,
                    border: "0.5px solid " + t.border,
                    fontSize: 13, fontWeight: 500,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
            {"Annuler"}
          </button>
          <button type="button" onClick={onConfirm}
                  style={{
                    padding: "10px 16px", borderRadius: 8,
                    background: PAYOUT_CTA_GREEN, color: "#fff",
                    border: "none", fontSize: 13, fontWeight: 500,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
            {"Confirmer le reversement"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastBase({ children, bg, color, onDismiss }) {
  return (
    <div onClick={onDismiss}
         className="anim-slideUp"
         style={{
           position: "fixed", top: 16, left: "50%",
           transform: "translateX(-50%)", zIndex: 10001,
           display: "inline-flex", alignItems: "center", gap: 10,
           maxWidth: "calc(100vw - 32px)",
           padding: "12px 18px", borderRadius: 10,
           background: bg, color,
           fontSize: 13, fontWeight: 500, fontFamily: "inherit",
           cursor: "pointer",
           boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
         }}>
      {children}
    </div>
  );
}

function SuccessToast({ payload, onDismiss }) {
  if (!payload) return null;
  const released = payload.released_cents || 0;
  const count    = payload.succeeded || 0;
  return (
    <ToastBase bg="#E1F5EE" color="#04342C" onDismiss={onDismiss}>
      <Icon paths={PATH_CIRCLE_CHECK} size={18} color="#0F6E56" />
      <span>
        {count} {count > 1 ? "reversements initiés" : "reversement initié"}
        {" pour "}
        <strong style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
          {formatCents(released)}
        </strong>
        {". Arrivée sous 1-3 jours ouvrés."}
      </span>
    </ToastBase>
  );
}

function ErrorToast({ message, onDismiss }) {
  return (
    <ToastBase bg="#FCEBEB" color="#501313" onDismiss={onDismiss}>
      <Icon paths={PATH_ALERT} size={18} color="#A32D2D" />
      <span>{message}</span>
    </ToastBase>
  );
}
