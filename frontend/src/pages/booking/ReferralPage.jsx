// src/pages/booking/ReferralPage.jsx
// Page "Parrainer un ami" — vue dédiée /book/:slug/parrain.
// 2 états visuels (cf. onboarding.md) :
//  • Non connecté : hero + "Comment ça marche" + Conditions + bloc auth
//                   (Se connecter / Créer un compte / Continuer avec Google)
//  • Connecté    : code perso + 3 stats + (quota si limite) + suivi filleuls
//                  (Validé / Utilisée / En attente / Refusé)
import { useState } from 'react';
import { pubApi } from '../../utils/api';

export function ReferralPage({
  th, slug, business, refProgram, gcConnected, gcUser,
  refMyCode, refMyHistory, refMyRewards,
  onLogin, onRegister, onBack, onAuthSuccess,
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
  // Stat "Filleuls validés" = validated dont la récompense a été utilisée OU
  // est encore disponible (= toute validation effective). On ne compte donc
  // pas séparément les "Utilisée".
  const validatedCount = (refMyHistory || []).filter(h => h.status === "validated").length;
  const pendingCount   = (refMyHistory || []).filter(h => h.status === "pending").length;
  // Filtre rewards parrain (compatibilité legacy : 'referral' OU 'referral_parrain')
  const availableRewards = (refMyRewards || []).filter(
    r => (r.reward_type === "referral" || r.reward_type === "referral_parrain")
      && r.status === "available"
  );
  // Historique des récompenses déjà consommées — pour donner une visibilité
  // complète de l'usage du programme au client. Triées plus récente d'abord.
  const usedRewards = (refMyRewards || [])
    .filter(r => (r.reward_type === "referral" || r.reward_type === "referral_parrain")
              && r.status === "used")
    .sort((a, b) => new Date(b.used_at || 0) - new Date(a.used_at || 0));
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
    const limitLabel = limitPeriodLabel(refProgram);
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

          {/* Bloc auth — même UX que /info : suggestion + 3 boutons (FDS-2026). */}
          <div style={{
            background: th.card, border: `0.5px solid ${th.border || dashedBorder}`,
            borderRadius: 12, padding: 16,
          }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: th.text, margin: "0 0 3px" }}>
              {"Déjà un compte ? Connectez-vous"}
            </p>
            <p style={{ fontSize: 11, color: th.muted, margin: "0 0 12px", lineHeight: 1.5 }}>
              {"Récupérez votre code de parrainage et suivez vos filleuls. Seuls les clients déjà venus peuvent parrainer."}
            </p>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10,
            }}>
              <button onClick={onLogin}
                style={{
                  padding: "11px", borderRadius: 10, background: th.accent,
                  border: "none", fontWeight: 500, fontSize: 13,
                  color: th.accentText, cursor: "pointer",
                }}>
                Se connecter
              </button>
              <button onClick={onRegister || onLogin}
                style={{
                  padding: "11px", borderRadius: 10, background: th.card,
                  border: `0.5px solid ${th.border || dashedBorder}`,
                  fontWeight: 500, fontSize: 13, color: th.text, cursor: "pointer",
                }}>
                {"Créer un compte"}
              </button>
            </div>
            {/* Google OAuth — popup + BroadcastChannel (Google COOP détache
                window.opener, donc postMessage inutilisable). */}
            <button onClick={() => {
              const url = pubApi.googleAuthUrl(slug);
              window.open(url, "google_auth",
                "width=500,height=600,scrollbars=yes,top=100,left=" +
                Math.round((window.screen.width - 500) / 2));
              try {
                const bc = new BroadcastChannel('flowia-oauth');
                bc.onmessage = (ev) => {
                  if (ev.data?.type !== 'client_login') return;
                  const { client } = ev.data;
                  if (client && onAuthSuccess) onAuthSuccess(client);
                  bc.close();
                };
                setTimeout(() => { try { bc.close(); } catch {} }, 5 * 60 * 1000);
              } catch { /* BroadcastChannel non supporté */ }
            }}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                gap: 8, padding: "11px", borderRadius: 10, background: th.card,
                border: `0.5px solid ${th.border || dashedBorder}`,
                cursor: "pointer", fontWeight: 500, fontSize: 13, color: th.text,
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuer avec Google
            </button>
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

  // Quota anti-abus (affiché uniquement si une limite est configurée).
  // Compte les parrainages pending+validated du parrain sur la fenêtre
  // courante (lifetime / mois calendaire / 90 derniers jours / année calendaire).
  const lp = refProgram.limit_period || "unlimited";
  const limitMax = (lp !== "unlimited" && refProgram.limit_count)
    ? Number(refProgram.limit_count) : null;
  const usedInWindow = (() => {
    if (!limitMax) return 0;
    return (refMyHistory || []).filter(h => {
      if (h.status !== "pending" && h.status !== "validated") return false;
      if (!h.created_at) return false;
      const d = new Date(h.created_at);
      const now = new Date();
      if (lp === "lifetime") return true;
      if (lp === "month") {
        return d.getFullYear() === now.getFullYear()
            && d.getMonth()    === now.getMonth();
      }
      if (lp === "3months") {
        const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        return d >= cutoff;
      }
      if (lp === "year") {
        return d.getFullYear() === now.getFullYear();
      }
      return false;
    }).length;
  })();
  const remaining = limitMax ? Math.max(0, limitMax - usedInWindow) : null;
  const windowEndLabel = (() => {
    const d = new Date();
    if (lp === "month") {
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return last.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    }
    if (lp === "year") return `31 décembre ${d.getFullYear()}`;
    if (lp === "3months") {
      const next = new Date(d.getTime() + 90 * 24 * 60 * 60 * 1000);
      return next.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    }
    return null; // lifetime → pas de "jusqu'au"
  })();
  const quotaUnitLabel = (() => {
    if (lp === "lifetime") return "à vie";
    if (lp === "month")    return "ce mois-ci";
    if (lp === "3months")  return "sur 3 mois";
    if (lp === "year")     return "cette année";
    return "";
  })();

  const fmtDate = (s) => {
    if (!s) return "";
    return new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };

  // 4 états visuels filleul (cf. maquette) :
  //  • Validé      : status='validated' + reward_status='available'  → vert + amount
  //  • Utilisée    : status='validated' + reward_status='used'       → gris + amount barré
  //  • En attente  : status='pending'                                → orange
  //  • Refusé      : status='cancelled'                              → rouge anonymisé
  const filleulVisualState = (h) => {
    if (h.status === "validated" && h.reward_status === "used") return "used";
    if (h.status === "validated") return "validated";
    if (h.status === "cancelled") return "cancelled";
    return "pending";
  };

  // Surface "neutre" pour le badge "Utilisée"
  const neutralBg = isDark ? "rgba(255,255,255,0.06)" : "#f5f5f4";

  const renderFilleulStatus = (h) => {
    const v = filleulVisualState(h);
    if (v === "validated") {
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
    if (v === "used") {
      return (
        <>
          <span style={{
            background: neutralBg, color: th.muted, fontSize: 11,
            padding: "3px 8px", borderRadius: 8,
          }}>Utilisée</span>
          <span style={{ fontSize: 13, color: th.muted, textDecoration: "line-through" }}>
            {parrainRewardStr}
          </span>
        </>
      );
    }
    if (v === "cancelled") {
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
    const v = filleulVisualState(h);
    if (v === "validated") return { bg: COL.greenBg, color: COL.greenText };
    if (v === "used")      return { bg: COL.greenBg, color: COL.greenText };
    if (v === "cancelled") return { bg: COL.redBg,   color: COL.redText };
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
    if (h.status === "pending"   && h.created_at)   return "RDV prévu le " + fmtDate(h.created_at);
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
              <div className="bk-ref-code" style={{
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
            <div className="bk-share-btns" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

        {/* Conditions — affichées aussi pour le client connecté (feedback
            onboarding) mais sous forme de phrase, pas de tableau comme
            pour le client non-authentifié. */}
        {(() => {
          const limitLabel = limitPeriodLabel(refProgram);
          const validityLabel = refProgram.validity_days
            ? `${refProgram.validity_days} jours après validation`
            : '60 jours après validation';
          const limitSentence = limitLabel === 'Illimité'
            ? 'Aucune limite sur le nombre de parrainages.'
            : `Limite par parrain : ${limitLabel.toLowerCase()}.`;
          return (
            <div style={{
              background: surfaceAlt, borderRadius: 8,
              padding: '14px 16px', marginBottom: '1.5rem',
              lineHeight: 1.6,
            }}>
              <p style={{ fontSize: 12, color: th.muted, margin: '0 0 6px',
                textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>
                Les conditions chez {businessName}
              </p>
              <p style={{ fontSize: 13, color: th.text, margin: 0 }}>
                Vous gagnez <strong style={{ fontWeight: 500 }}>{parrainRewardStr}</strong>
                {' '}à chaque filleul validé, utilisable en caisse sur prestation.
                {' '}{limitSentence}
                {' '}Validité de la récompense : <strong style={{ fontWeight: 500 }}>{validityLabel}</strong>.
              </p>
            </div>
          );
        })()}

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
        {limitMax && (
          <div style={{
            background: COL.amberBg, border: `0.5px solid ${COL.amberBd}`,
            borderRadius: 8, padding: "12px 14px", marginBottom: "1.5rem",
          }}>
            <p style={{ fontSize: 13, color: COL.amberText, margin: 0, fontWeight: 500 }}>
              Quota {quotaUnitLabel} : {usedInWindow} sur {limitMax} utilisé{usedInWindow > 1 ? "s" : ""}
            </p>
            <p style={{ fontSize: 12, color: COL.amberText, margin: "2px 0 0",
              opacity: 0.85 }}>
              {remaining > 0
                ? (windowEndLabel
                    ? `Il vous reste ${remaining} parrainage${remaining > 1 ? "s" : ""} jusqu'au ${windowEndLabel}`
                    : `Il vous reste ${remaining} parrainage${remaining > 1 ? "s" : ""}`)
                : (windowEndLabel
                    ? `Quota atteint. Recharge le ${windowEndLabel} à minuit.`
                    : "Quota atteint.")}
            </p>
          </div>
        )}

        {/* Historique des récompenses utilisées — visibilité sur l'usage
            passé du programme (codes consommés, date d'utilisation). */}
        {usedRewards.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: th.text,
              margin: "0 0 12px" }}>
              Historique de vos récompenses utilisées
            </h2>
            <div style={{ border: hairBorder, borderRadius: 8, overflow: "hidden" }}>
              {usedRewards.map((r, i) => {
                const valStr = r.type === "percent"
                  ? `-${r.value}%`
                  : `-${Number(r.value).toFixed(2).replace(/\.00$/, "")} €`;
                const usedStr = r.used_at
                  ? new Date(r.used_at).toLocaleDateString("fr-FR",
                      { day:"numeric", month:"short", year:"numeric" })
                  : "—";
                return (
                  <div key={r.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 14px",
                    borderBottom: i === usedRewards.length - 1 ? "none" : hairBorder,
                    opacity: 0.75,
                  }}>
                    <span style={{ fontSize: 18, filter: "grayscale(0.3)" }}>🤝</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: th.text }}>
                        {valStr}{" "}
                        {r.code && (
                          <span style={{ fontFamily: "monospace", fontSize: 11,
                            color: th.muted, marginLeft: 4 }}>· {r.code}</span>
                        )}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: th.muted }}>
                        Utilisée le {usedStr}
                      </p>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 500, padding: "3px 9px", borderRadius: 99,
                      background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                      color: th.muted, flexShrink: 0,
                    }}>Utilisée</span>
                  </div>
                );
              })}
            </div>
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

// Libellé humain de la limite anti-abus pour la section Conditions
function limitPeriodLabel(refProgram) {
  const lp = refProgram?.limit_period || "unlimited";
  const lc = refProgram?.limit_count;
  if (lp === "unlimited") return "Illimité";
  if (lp === "lifetime")  return "Une seule fois à vie";
  if (!lc) return "Illimité";
  if (lp === "month")    return `${lc} fois par mois`;
  if (lp === "3months")  return `${lc} fois sur 3 mois`;
  if (lp === "year")     return `${lc} fois par an`;
  return "Illimité";
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
