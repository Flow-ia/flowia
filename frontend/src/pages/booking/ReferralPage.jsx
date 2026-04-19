// src/pages/booking/ReferralPage.jsx
// Page "Parrainer un ami" — vue dédiée /book/:slug/parrain.
// 2 états visuels (cf. onboarding.md) :
//  • Non connecté : hero + "Comment ça marche" + Conditions + CTA login/register
//  • Connecté    : code perso + 3 stats + (quota si limite) + suivi filleuls
//                  (Validé / Utilisée / En attente / Refusé)
import { useState } from 'react';

export function ReferralPage({
  th, slug, business, refProgram, gcConnected, gcUser,
  refMyCode, refMyHistory, refMyRewards,
  onLogin, onRegister, onBack,
}) {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const hasProgram = refProgram && refProgram !== "none";
  const isActive   = hasProgram && refProgram.is_enabled === true;

  const valueStr = (type, value) => type === "percent"
    ? `${value} %` : `${Number(value).toFixed(2)} €`;

  const businessName = business?.business_name || "ce commerce";
  const firstName    = gcUser?.first_name || "";
  const initials     = (firstName.charAt(0) + (gcUser?.last_name?.charAt(0) || ""))
    .toUpperCase() || "?";

  const shareUrl = refMyCode?.code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/book/${slug}?ref=${refMyCode.code}`
    : null;

  const copyCode = async () => {
    if (!refMyCode?.code) return;
    try {
      await navigator.clipboard.writeText(refMyCode.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {/* ignore */}
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {/* ignore */}
  };

  const shareSms = () => {
    if (!shareUrl || !refMyCode?.code) return;
    const txt = `Réserve chez ${businessName} avec mon code ${refMyCode.code} : ${shareUrl}`;
    window.location.href = `sms:?body=${encodeURIComponent(txt)}`;
  };

  const shareWhatsApp = () => {
    if (!shareUrl || !refMyCode?.code) return;
    const txt = `Réserve chez ${businessName} avec mon code ${refMyCode.code} : ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank");
  };

  // ── Stats calculées depuis l'historique + rewards ─────────────────────────
  const validatedCount = (refMyHistory || []).filter(h => h.status === "validated").length;
  const pendingCount   = (refMyHistory || []).filter(h => h.status === "pending").length;
  const availableRewards = (refMyRewards || []).filter(
    r => r.reward_type === "referral" && r.status === "available"
  );
  const availableSum = availableRewards.reduce((acc, r) => {
    if (r.type === "percent") return acc; // ignorer les % dans la somme €
    return acc + Number(r.value || 0);
  }, 0);
  const availableLabel = availableRewards.length === 0
    ? "0 €"
    : availableRewards.every(r => r.type === "percent")
      ? `${availableRewards.length} bon${availableRewards.length > 1 ? "s" : ""}`
      : `${availableSum.toFixed(2).replace(/\.00$/, "")} €`;

  // Récompense parrain (libellé unique pour les 4 cards)
  const parrainRewardStr = isActive
    ? valueStr(refProgram.parrain_type, refProgram.parrain_value)
    : "—";

  // ── Tokens visuels (theme-aware) ──────────────────────────────────────────
  const isDark = th.mode === "dark";
  const surfaceAlt   = isDark ? "rgba(255,255,255,0.04)" : "#f5f5f4";
  const dashedBorder = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)";
  const hairBorder   = `0.5px solid ${dashedBorder}`;

  // Couleurs sémantiques (mêmes valeurs entre light/dark, alpha gère le contraste)
  const COL = {
    blueText: isDark ? "#93c5fd" : "#1e40af",
    blueBg:   isDark ? "rgba(59,130,246,0.15)" : "rgba(59,130,246,0.08)",
    blueBd:   "rgba(59,130,246,0.3)",
    greenText: isDark ? "#86efac" : "#15803d",
    greenBg:   "rgba(34,197,94,0.15)",
    amberText: isDark ? "#fcd34d" : "#92400e",
    amberBg:   "rgba(251,191,36,0.15)",
    amberBd:   "rgba(251,191,36,0.4)",
    redText:   isDark ? "#fca5a5" : "#991b1b",
    redBg:     "rgba(239,68,68,0.15)",
    dim:       isDark ? "#9ca3af" : "#999",
  };

  // ── Page wrapper commun ───────────────────────────────────────────────────
  const wrapper = {
    maxWidth: 760, margin: "0 auto", padding: "24px 16px 80px",
    animation: "fadeIn .2s ease",
  };
  const card = {
    background: th.card, border: `0.5px solid ${dashedBorder}`,
    borderRadius: 8, padding: "1.75rem",
  };

  // Bouton retour discret en haut
  const BackLink = () => (
    <button onClick={onBack}
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
        background: "none", border: "none", cursor: "pointer",
        fontSize: 13, color: th.muted, marginBottom: 12,
      }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        style={{ width: 14, height: 14 }}>
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      Retour à l&apos;accueil
    </button>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ÉTAT 1 — Programme désactivé (placeholder simple)
  // ─────────────────────────────────────────────────────────────────────────
  if (hasProgram && !isActive) {
    return (
      <div style={wrapper}>
        <BackLink />
        <div style={card}>
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
            <h1 style={{ fontSize: 22, fontWeight: 500, color: th.text,
              margin: "0 0 8px" }}>
              Programme temporairement fermé
            </h1>
            <p style={{ fontSize: 14, color: th.muted, margin: 0, lineHeight: 1.6 }}>
              Le programme de parrainage de {businessName} est temporairement fermé.
              {availableRewards.length > 0
                ? " Vos récompenses déjà gagnées restent utilisables jusqu'à leur expiration."
                : ""}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasProgram) {
    // Programme inexistant : on affiche un message neutre (la nav ne devrait pas
    // amener ici mais sécurité au cas où).
    return (
      <div style={wrapper}>
        <BackLink />
        <div style={card}>
          <p style={{ fontSize: 14, color: th.muted, margin: 0, textAlign: "center" }}>
            Aucun programme de parrainage chez {businessName}.
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ÉTAT 2 — Programme actif + NON connecté (Maquette 1)
  // ─────────────────────────────────────────────────────────────────────────
  if (!gcConnected) {
    // Lecture sécurisée des conditions (avec fallbacks lisibles)
    const limitLabel = refProgram.monthly_limit
      ? `${refProgram.monthly_limit} parrainages par mois`
      : "Illimité";
    const validityLabel = refProgram.validity_days
      ? `${refProgram.validity_days} jours après validation`
      : "60 jours après validation";

    return (
      <div style={wrapper}>
        <BackLink />
        <div style={card}>
          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
            <div style={{
              display: "inline-block", background: COL.blueBg, color: COL.blueText,
              fontSize: 12, padding: "4px 12px", borderRadius: 8, marginBottom: 12,
              fontWeight: 500,
            }}>
              Programme de parrainage
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 500, color: th.text,
              margin: "0 0 8px", letterSpacing: "-0.01em" }}>
              Faites découvrir {businessName} à vos proches
            </h1>
            <p style={{ fontSize: 14, color: th.muted, margin: 0 }}>
              Recommandez-nous et profitez d&apos;une réduction à chaque filleul
            </p>
          </div>

          {/* Comment ça marche */}
          <div style={{ marginBottom: "1.75rem" }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: th.text,
              margin: "0 0 12px" }}>Comment ça marche</h2>
            <div className="rp-grid3" style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
            }}>
              {[
                "Connectez-vous et récupérez votre code personnel",
                "Partagez-le à un proche jamais venu chez nous",
                "Votre récompense est créditée après son premier passage",
              ].map((txt, i) => (
                <div key={i} style={{
                  background: surfaceAlt, borderRadius: 8, padding: 14,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 500, color: th.muted,
                    marginBottom: 6 }}>{i + 1}</div>
                  <p style={{ fontSize: 13, color: th.text, margin: 0, lineHeight: 1.5 }}>
                    {txt}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Conditions */}
          <div style={{ marginBottom: "1.75rem" }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: th.text,
              margin: "0 0 12px" }}>Les conditions chez {businessName}</h2>
            <div style={{ background: surfaceAlt, borderRadius: 8, padding: 16 }}>
              {[
                ["Récompense pour le parrain", parrainRewardStr],
                ["Utilisable", "En caisse, sur prestation"],
                ["Limite par parrain", limitLabel],
                ["Validité de la récompense", validityLabel],
              ].map(([label, val], i, arr) => (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: i === arr.length - 1 ? "none" : hairBorder,
                }}>
                  <span style={{ fontSize: 13, color: th.muted }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: th.text }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA connexion */}
          <div style={{
            background: COL.blueBg, border: `0.5px solid ${COL.blueBd}`,
            borderRadius: 12, padding: 20, textAlign: "center",
          }}>
            <p style={{ fontSize: 14, color: COL.blueText, margin: "0 0 12px",
              fontWeight: 500 }}>
              Connectez-vous pour récupérer votre code de parrainage
            </p>
            <p style={{ fontSize: 13, color: COL.blueText, margin: "0 0 16px",
              opacity: 0.85 }}>
              Seuls les clients déjà venus peuvent parrainer
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={onLogin}
                style={{
                  background: COL.blueText, color: "#fff", border: "none",
                  padding: "10px 20px", borderRadius: 8, fontSize: 13,
                  fontWeight: 500, cursor: "pointer",
                }}>
                Se connecter
              </button>
              <button onClick={onRegister || onLogin}
                style={{
                  background: "transparent", color: COL.blueText,
                  border: `0.5px solid ${COL.blueBd}`,
                  padding: "10px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                }}>
                Créer un compte
              </button>
            </div>
          </div>

          {/* Mention légale */}
          <p style={{ fontSize: 11, color: COL.dim, margin: "16px 0 0",
            textAlign: "center" }}>
            Offre réservée aux nouveaux clients. Non cumulable. Voir conditions complètes.
          </p>
        </div>
        <ResponsiveCSS />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ÉTAT 3 — Programme actif + CONNECTÉ (Maquette 2)
  // ─────────────────────────────────────────────────────────────────────────

  // Quota mensuel (affiché uniquement si une limite est configurée)
  const monthlyLimit = refProgram.monthly_limit; // null/undefined = illimité
  const usedThisMonth = (() => {
    if (!monthlyLimit) return 0;
    const now = new Date();
    return (refMyHistory || []).filter(h => {
      if (!h.created_at) return false;
      const d = new Date(h.created_at);
      return d.getFullYear() === now.getFullYear()
          && d.getMonth() === now.getMonth();
    }).length;
  })();
  const remaining = monthlyLimit ? Math.max(0, monthlyLimit - usedThisMonth) : null;
  const endOfMonth = (() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return last.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  })();

  const fmtDate = (s) => {
    if (!s) return "";
    return new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };

  // Statut visuel d'un filleul
  const renderFilleulStatus = (h) => {
    if (h.status === "validated") {
      return (
        <>
          <span style={{
            background: COL.greenBg, color: COL.greenText, fontSize: 11,
            padding: "3px 8px", borderRadius: 8, fontWeight: 500,
          }}>Validé</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: COL.greenText }}>
            +{parrainRewardStr}
          </span>
        </>
      );
    }
    if (h.status === "cancelled") {
      return (
        <>
          <span style={{
            background: COL.redBg, color: COL.redText, fontSize: 11,
            padding: "3px 8px", borderRadius: 8, fontWeight: 500,
          }}>Refusé</span>
          <span style={{ fontSize: 13, color: COL.dim }}>—</span>
        </>
      );
    }
    // pending
    return (
      <>
        <span style={{
          background: COL.amberBg, color: COL.amberText, fontSize: 11,
          padding: "3px 8px", borderRadius: 8, fontWeight: 500,
        }}>En attente</span>
        <span style={{ fontSize: 13, color: COL.dim }}>—</span>
      </>
    );
  };

  const filleulAvatarColor = (h) => {
    if (h.status === "validated") return { bg: COL.greenBg, color: COL.greenText };
    if (h.status === "cancelled") return { bg: COL.redBg,   color: COL.redText };
    return { bg: COL.amberBg, color: COL.amberText };
  };

  const filleulInitials = (h) => {
    if (h.status === "cancelled") return "?";
    const f = h.filleul_first_name || "";
    const l = h.filleul_last_name  || "";
    return ((f.charAt(0) + l.charAt(0)).toUpperCase()) || (h.filleul_email?.charAt(0).toUpperCase() || "?");
  };

  const filleulName = (h) => {
    if (h.status === "cancelled") return "Code utilisé, code invalide";
    const full = [h.filleul_first_name, h.filleul_last_name].filter(Boolean).join(" ");
    if (full) return `${h.filleul_first_name} ${h.filleul_last_name?.charAt(0) || ""}.`.trim();
    return h.filleul_email || "Filleul";
  };

  const filleulSubtitle = (h) => {
    if (h.status === "cancelled") return "Client déjà connu du commerçant";
    if (h.status === "validated" && h.validated_at) return `Passage du ${fmtDate(h.validated_at)}`;
    if (h.status === "pending"   && h.created_at)   return `Code utilisé le ${fmtDate(h.created_at)}`;
    return fmtDate(h.created_at);
  };

  return (
    <div style={wrapper}>
      <BackLink />
      <div style={card}>

        {/* Salutation */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: th.text,
            margin: "0 0 4px", letterSpacing: "-0.01em" }}>
            Votre espace parrainage
          </h1>
          <p style={{ fontSize: 13, color: th.muted, margin: 0 }}>
            Bonjour {firstName || "et bienvenue"}, partagez votre code et cumulez vos récompenses
          </p>
        </div>

        {/* Code personnel */}
        {refMyCode?.code && (
          <div style={{
            background: surfaceAlt, borderRadius: 12, padding: 20, marginBottom: "1.5rem",
          }}>
            <p style={{ fontSize: 12, color: th.muted, margin: "0 0 8px",
              textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 500 }}>
              Votre code personnel
            </p>
            <div className="rp-code-row" style={{
              display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
            }}>
              <div style={{
                flex: 1, background: th.card,
                border: `0.5px solid ${dashedBorder}`,
                borderRadius: 8, padding: "14px 18px",
                fontFamily: "monospace", fontSize: 20, fontWeight: 500,
                letterSpacing: 2, color: th.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {refMyCode.code}
              </div>
              <button onClick={copyCode}
                style={{
                  background: th.accent, color: th.accentText, border: "none",
                  padding: "14px 18px", borderRadius: 8, fontSize: 13,
                  fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
                }}>
                {copied ? "Copié ✓" : "Copier"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={shareSms}
                style={shareBtn(th, dashedBorder)}>
                Partager par SMS
              </button>
              <button onClick={shareWhatsApp}
                style={shareBtn(th, dashedBorder)}>
                WhatsApp
              </button>
              <button onClick={copyLink}
                style={shareBtn(th, dashedBorder)}>
                {linkCopied ? "Lien copié ✓" : "Copier le lien"}
              </button>
            </div>
          </div>
        )}

        {/* Stats — 3 cards */}
        <div className="rp-grid3" style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12, marginBottom: "1.5rem",
        }}>
          <StatCard th={th} surfaceAlt={surfaceAlt} label="Filleuls validés" value={validatedCount} />
          <StatCard th={th} surfaceAlt={surfaceAlt} label="En attente"       value={pendingCount} />
          <StatCard th={th} surfaceAlt={surfaceAlt}
            label="Récompense disponible" value={availableLabel}
            valueColor={availableRewards.length > 0 ? COL.greenText : th.text} />
        </div>

        {/* Bandeau quota — uniquement si une limite est configurée */}
        {monthlyLimit && (
          <div style={{
            background: COL.amberBg, border: `0.5px solid ${COL.amberBd}`,
            borderRadius: 8, padding: "12px 14px", marginBottom: "1.5rem",
          }}>
            <p style={{ fontSize: 13, color: COL.amberText, margin: 0, fontWeight: 500 }}>
              Quota du mois : {usedThisMonth} sur {monthlyLimit} utilisé{usedThisMonth > 1 ? "s" : ""}
            </p>
            <p style={{ fontSize: 12, color: COL.amberText, margin: "2px 0 0",
              opacity: 0.85 }}>
              {remaining > 0
                ? `Il vous reste ${remaining} parrainage${remaining > 1 ? "s" : ""} jusqu'au ${endOfMonth}`
                : `Quota atteint. Recharge le ${endOfMonth} à minuit.`}
            </p>
          </div>
        )}

        {/* Suivi filleuls */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 500, color: th.text,
            margin: "0 0 12px" }}>
            Suivi de vos filleuls
          </h2>
          {(refMyHistory || []).length === 0 ? (
            <div style={{
              border: hairBorder, borderRadius: 8, padding: "18px 14px",
              textAlign: "center",
            }}>
              <p style={{ fontSize: 13, color: th.muted, margin: 0 }}>
                Aucun filleul pour l&apos;instant. Partagez votre code !
              </p>
            </div>
          ) : (
            <div style={{
              border: hairBorder, borderRadius: 8, overflow: "hidden",
            }}>
              {(refMyHistory || []).map((h, i, arr) => {
                const ava = filleulAvatarColor(h);
                return (
                  <div key={h.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px",
                    borderBottom: i === arr.length - 1 ? "none" : hairBorder,
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10,
                      minWidth: 0, flex: 1,
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: ava.bg, color: ava.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 500, flexShrink: 0,
                      }}>
                        {filleulInitials(h)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: th.text,
                          margin: 0, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {filleulName(h)}
                        </p>
                        <p style={{ fontSize: 11, color: th.muted, margin: 0 }}>
                          {filleulSubtitle(h)}
                        </p>
                      </div>
                    </div>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
                    }}>
                      {renderFilleulStatus(h)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ResponsiveCSS />
    </div>
  );
}

// ── Petits sous-composants / helpers ──────────────────────────────────────

function StatCard({ th, surfaceAlt, label, value, valueColor }) {
  return (
    <div style={{ background: surfaceAlt, borderRadius: 8, padding: 14 }}>
      <p style={{ fontSize: 12, color: th.muted, margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 500, margin: 0,
        color: valueColor || th.text }}>{value}</p>
    </div>
  );
}

function shareBtn(th, dashedBorder) {
  return {
    background: "transparent", border: `0.5px solid ${dashedBorder}`,
    padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
    color: th.text,
  };
}

// CSS responsive : les grilles 3 colonnes passent en stack vertical sur mobile.
function ResponsiveCSS() {
  return (
    <style>{`
      @media (max-width: 600px) {
        .rp-grid3 { grid-template-columns: 1fr !important; }
        .rp-code-row { flex-direction: column !important; align-items: stretch !important; }
      }
    `}</style>
  );
}
