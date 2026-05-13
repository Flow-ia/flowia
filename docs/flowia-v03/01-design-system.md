# 🎨 Design System — Refonte FlowIA

> Référence visuelle stricte. Toutes les valeurs ici sont **obligatoires** dans l'implémentation.

---

## 🎨 Palette de couleurs (par fonction)

Chaque source de revenu et chaque statut de paiement a une couleur **fixe** dans toute l'application.

| Concept | Couleur primaire | Hex | Background light | Usage |
|---|---|---|---|---|
| **Stripe / En ligne** | Bleu | `#185FA5` | `#E6F1FB` | Paiement Stripe 100%, KPI "En ligne" |
| **Caisse / RDV honoré** | Vert | `#0F6E56` | `#E1F5EE` | Encaissement caisse, montant net positif |
| **Walk-in / Acompte / Alerte** | Doré | `#BA7517` | `#FAEEDA` | Walk-in (sans RDV), acompte Stripe, montants en attente |
| **RDV téléphone** | Violet | `#534AB7` | `#EEEDFE` | RDV pris par un employé en interne |
| **Remboursement** | Rouge | `#A32D2D` | `#FCEBEB` | Annulation client + remboursement Stripe |
| **No-show retenu** | Brun foncé | `#4A1B0C` | `#FAECE7` | Acompte conservé pour no-show |
| **Pas payé / Neutre** | Gris | `#888780` | `#F1EFE8` | RDV créé sans paiement |
| **CTA Payout** | Vert vif | `#1D9E75` | — | Bouton "Reverser maintenant" hero |

### Variables CSS

```css
:root {
  --flowia-stripe-bg: #E6F1FB;
  --flowia-stripe-text: #042C53;
  --flowia-stripe-accent: #185FA5;

  --flowia-caisse-bg: #E1F5EE;
  --flowia-caisse-text: #04342C;
  --flowia-caisse-accent: #0F6E56;

  --flowia-walkin-bg: #FAEEDA;
  --flowia-walkin-text: #412402;
  --flowia-walkin-accent: #BA7517;

  --flowia-phone-bg: #EEEDFE;
  --flowia-phone-text: #26215C;
  --flowia-phone-accent: #534AB7;

  --flowia-refund-bg: #FCEBEB;
  --flowia-refund-text: #501313;
  --flowia-refund-accent: #A32D2D;

  --flowia-noshow-bg: #FAECE7;
  --flowia-noshow-text: #4A1B0C;
  --flowia-noshow-accent: #712B13;

  --flowia-payout-cta: #1D9E75;
  --flowia-payout-cta-hover: #178C66;
}
```

---

## 🔤 Typographie

| Élément | Taille | Poids |
|---|---|---|
| H1 page title | 22px | 500 |
| H2 section title | 14px uppercase letter-spacing 0.5px | 500 |
| KPI value | 22-26px | 500 |
| Hero KPI value | 28-32px | 500 |
| Body | 14px | 400 |
| Caption | 12px | 400 |
| Small | 11px | 400 |

→ **Toujours utiliser la police monospace pour les montants** (`font-family: ui-monospace, SFMono-Regular, Menlo, monospace`).

---

## 🎯 Icônes Tabler (outline uniquement)

### Navigation
`ti-history` `ti-chart-bar` `ti-calendar-event` `ti-cash-register` `ti-trending-up` `ti-wallet`

### Sources & paiements
`ti-credit-card` (Stripe) `ti-credit-card-pay` (acompte) `ti-cash` (espèces) `ti-cash-banknote` (caisse) `ti-walk` (**walk-in**) `ti-phone` (RDV téléphone) `ti-world` (booking en ligne) `ti-arrow-back-up` (remboursement) `ti-cash-off` (pas payé)

### Actions
`ti-send` (reverser) `ti-download` (CSV) `ti-file-text` (PDF) `ti-external-link` (Stripe) `ti-receipt` (facture)

### Indicateurs
`ti-circle-check` `ti-x` `ti-alert-triangle` `ti-info-circle` `ti-bulb` `ti-coins` `ti-percentage` `ti-arrow-down` `ti-clock-hour-3`

### Utilitaires
`ti-chevron-right` `ti-chevron-down` `ti-dots` `ti-arrow-left`

---

## 📐 Layout

- Card padding : `1rem` / `1.25rem` / `1.5rem`
- Border radius : `8px` (md, KPI/buttons) / `12px` (lg, cards) / `999px` (pills)
- Bordures : `0.5px solid var(--color-border-tertiary)`
- CTA Payout vert : `2px solid #1D9E75`

### Grilles standard
- Dashboard KPI : `repeat(4, 1fr) gap 12px`
- Historique KPI 5 cards : `repeat(5, 1fr) gap 10px`
- Stats KPI 4 sources : `repeat(4, 1fr) gap 12px`
- Stats 2 colonnes : `1fr 1fr gap 16px`

---

## 🌗 Dark mode

Toutes les variables CSS doivent fonctionner en dark mode automatiquement via `@media (prefers-color-scheme: dark)`.

→ **Tester chaque écran en dark mode avant validation.**

---

## ✅ Règles strictes

- Icônes **toutes en outline** (jamais filled)
- **Aucun emoji** (utiliser uniquement Tabler Icons)
- Montants en **police monospace**
- Format monétaire : `1 234,56 €` (espace milliers, virgule décimale, espace insécable avant €)
- Format date français : `9 mai · 14:30` ou `DD MMM YYYY`
- Apostrophes JSX en double quotes uniquement
