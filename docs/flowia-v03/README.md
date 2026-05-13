# 📚 FlowIA — Refonte Historique & Statistiques (version finale enrichie)

> **Pour Claude Code** : ce dossier contient les spécifications complètes pour refondre les pages **Historique** et **Statistiques** avec les 4 onglets, en intégrant le **walk-in (caisse physique sans RDV)** partout.

---

## 🎯 Mission

Refondre exactement comme dans les mockups HTML les écrans suivants :

1. **Dashboard d'accueil** — `commercant.flowiapro.com/dashboard`
2. **Historique** — `commercant.flowiapro.com/historique`
3. **Statistiques › Performance** — `commercant.flowiapro.com/statistiques`
4. **Statistiques › RDV** — `?tab=rdv`
5. **Statistiques › Paiements en ligne** — `?tab=online`
6. **Statistiques › Reversements** — `?tab=payouts`

→ **Les mockups dans `/docs/flowia-v03/mockups/` sont la référence visuelle exacte à respecter au pixel près.**

---

## 🎨 Concept central — 4 sources de revenus

| Source | Code | Avec RDV ? | Mode paiement |
|---|---|---|---|
| 🌐 Booking en ligne (RDV payé Stripe 100%) | `online_booking` + `STRIPE_100` | ✅ Oui | Stripe intégral |
| 🌐 Booking en ligne (RDV avec acompte) | `online_booking` + `STRIPE_ACOMPTE` | ✅ Oui | Stripe acompte + reste caisse |
| 🌐 Booking en ligne (RDV non payé) | `online_booking` + `NOT_PAID` | ✅ Oui | À encaisser caisse au RDV |
| 📞 RDV pris par employé | `phone_internal` + `NOT_PAID` | ✅ Oui (créé en interne) | À encaisser caisse au RDV |
| 💵 Caisse RDV (encaissement) | `cash_register_rdv` | ✅ Oui | Espèces / carte locale |
| ⚡ **Walk-in (sans RDV)** | `walkin` | ❌ **Non** | Espèces / carte locale |

**Règle clé** : un RDV pris en ligne **non payé** ET un RDV pris par un employé sont **traités identiquement** côté statut paiement (`NOT_PAID`). Seul le champ `source` les distingue.

→ **Walk-in = transaction avec `appointment_id = NULL`**.

---

## 🎨 6 statuts de paiement

| Code | Libellé | Couleur | Description |
|---|---|---|---|
| `STRIPE_100` | Stripe 100% | 🔵 Bleu | Paiement en ligne intégral |
| `STRIPE_ACOMPTE` | Acompte Stripe | 🟡 Doré | Acompte en ligne + reste caisse |
| `NOT_PAID` | Pas encore payé | ⚫ Gris | RDV créé sans paiement (en ligne ou par employé) |
| `CASH_PAID` | Encaissé caisse | 🟢 Vert | Espèces ou carte locale (RDV ou walk-in) |
| `REFUNDED` | Remboursé | 🔴 Rouge | Annulation client dans délais |
| `NO_SHOW_RETAINED` | No-show retenu | 🟤 Brun | Acompte conservé |

---

## 📁 Structure du dossier

```
docs/flowia-v03/
├── README.md                              ← ce fichier
├── 01-design-system.md                    ← couleurs/icônes/typo
├── 02-data-model.md                       ← BDD complète
├── 03-implementation-roadmap.md           ← plan en 5 commits
├── 04-stripe-config.md                    ← Stripe Connect + commission
├── mockups/
│   ├── index.html                         ← page d'accueil avec liens
│   ├── 01-dashboard.html                  ← maquette dashboard
│   ├── 02-historique.html                 ← historique enrichi avec walk-in
│   ├── 03-stats-performance.html          ← onglet Performance enrichi
│   ├── 04-stats-rdv.html                  ← onglet RDV enrichi
│   ├── 05-stats-online-payments.html      ← onglet Paiements en ligne (gradient hero)
│   └── 06-stats-payouts.html              ← onglet Reversements (hero CTA + historique)
└── prompts/
    ├── commit-1-schema-bdd.md
    ├── commit-2-routes-api.md
    ├── commit-3-frontend-historique.md
    ├── commit-4-frontend-statistiques.md
    └── commit-5-bouton-payout.md
```

---

## 🚀 Comment utiliser ce dossier

1. **Dézippe** dans `/docs/` à la racine de ton projet → tu obtiens `/docs/flowia-v03/`
2. **Ouvre** `docs/flowia-v03/mockups/index.html` dans un navigateur
3. **Lis** dans l'ordre : README → 01-design-system → 02-data-model → 03-roadmap
4. **Implémente** commit par commit en collant les prompts dans Claude Code

---

## ⚠️ Règles strictes

- Branche `refonte-archi-v3`
- Apostrophes JSX en double quotes (anti-bug Vercel)
- Aucun ajout hors-scope (pas de Sentry, pas de Husky)
- Schema migrations sur preview branch avant prod
- ~15 fichiers max par commit
- Walk-in = transaction sans `appointment_id` (NULL)
- RDV pris en ligne non payé = RDV pris par employé : même statut `NOT_PAID`, seule la source diffère
