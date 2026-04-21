# 🔧 FlowIA — Refonte visuelle progressive (fichier par fichier)

## Contexte

Appliquer la direction visuelle 2026 (définie dans
`onboarding-1-regles-globales.md`) sur les fichiers existants de façon
**progressive et chirurgicale**, sans refonte de masse.

Objectif : harmoniser le style de tout le produit avec la référence
`src/pages/booking/ReferralPage.jsx`.

---

## ⚠️ Règles absolues

- **Modifications chirurgicales uniquement**, ne pas réécrire ce qui
  fonctionne
- **Ne rien casser** : caisse, agenda, marketing IA, segments RFM,
  parrainage, Stripe, paiements mixtes, cron, auth, PIN employé
- **Multi-tenant respecté** partout
- **Dark mode préservé** via les tokens `t.*`
- **Apostrophes françaises en JSX** → double-quotes obligatoires
- **Tester après chaque fichier** avant de passer au suivant
- **Un commit par fichier refondu** pour tracer proprement
- **Faire tourner `npm run build` localement** avant chaque push
  (détecte les apostrophes cassées)

---

## 🔍 Relevé des violations par fichier (données réelles)

Mesures effectuées sur le zip du projet. Indicateurs de complexité pour
prioriser l'effort.

| Fichier | Lignes | classNames | inline styles | fontWeight≥600 | uppercase | gradients |
|---|---:|---:|---:|---:|---:|---:|
| `pages/EmployeeAgenda.jsx` | 2164 | 24 | 535 | **155** | **23** | 6 |
| `pages/Agenda.jsx` | 2363 | **459** | 383 | 5 | 0 | 8 |
| `pages/BookingPage.jsx` | 1950 | 15 | 268 | 84 | 9 | 1 |
| `pages/settings/TabMarketing.jsx` | 2361 | 39 | 504 | ? | ? | ? |
| `App.jsx` | 1459 | 115 | 210 | 31 | 1 | 2 |
| `pages/Dashboard.jsx` | 754 | 0 | 120 | 31 | 4 | 7 |
| `pages/ClientsPage.jsx` | 1138 | 1 | 243 | 77 | 11 | 3 |
| `pages/settings/TabEquipe.jsx` | 1290 | **195** | 223 | ? | ? | ? |
| `pages/settings/TabStats.jsx` | 576 | 94 | 106 | ? | ? | ? |
| `pages/Transactions.jsx` | 522 | 7 | 86 | 26 | 3 | 0 |
| `pages/booking/Account.jsx` | 1130 | 7 | 214 | ? | ? | ? |
| `pages/booking/MyAppointments.jsx` | 1366 | 4 | 213 | ? | ? | ? |
| `components/Forms.jsx` | 769 | 0 | 100 | 30 | 2 | 3 |
| `components/AuthFlow.jsx` | 718 | 95 | 62 | 14 | 4 | 1 |
| `components/SMSRechargeModal.jsx` | 520 | 0 | 69 | ? | ? | ? |
| `components/UI.jsx` | 260 | 30 | 25 | ? | ? | ? |
| `pages/settings/TabCompte.jsx` | 537 | 0 | 88 | ? | ? | ? |

Fichiers déjà propres (référence) :
- ✅ `pages/booking/ReferralPage.jsx` — conforme, ne pas toucher

---

## 🎯 Phases de refonte

### Phase 1 — Haut impact utilisateur, risque faible

Pages vues tous les jours par le commerçant. Refonte visuelle pure,
pas de changement de logique.

#### 1.1 — `pages/Dashboard.jsx` (754 lignes)

**Pourquoi en premier** : 100% inline déjà, pas de Tailwind à
démêler. 31 `fontWeight≥600`, 7 gradients, 4 uppercase à traiter.

Travail à faire :
- Ramener tous les `fontWeight: 600/700/800` à `500` (31 occurrences)
- Supprimer les 7 `linear-gradient(...)` sur boutons et cartes,
  remplacer par aplats `t.text` / `t.card`
- Supprimer les 4 `textTransform: 'uppercase'` sauf si c'est une
  abréviation (contexte à vérifier ligne par ligne)
- Remplacer les 4 ombres > `0.1` d'opacité par `t.shadowSm` ou rien
- Unifier les `borderRadius` sur {6, 8, 12, 99}
- Remplacer les badges de statut par puces 6px + texte

#### 1.2 — `components/Forms.jsx` (769 lignes)

**Pourquoi ensuite** : utilisé partout (inputs, modales, sélecteurs).
Un changement ici propage dans toute l'app.

Travail à faire :
- 30 `fontWeight≥600` à ramener à `500`
- 3 gradients à supprimer
- 2 `uppercase` à évaluer
- Harmoniser les bordures d'input à `0.5px`
- Vérifier que tous les composants exportés utilisent `t.*`
  (pas de hex hardcodé)

#### 1.3 — `pages/Transactions.jsx` (522 lignes)

**Pourquoi** : page cruciale (historique financier) mais taille
raisonnable, 0 gradient, seulement 26 `fontWeight≥600` et 3
`uppercase`. Bon rapport effort/impact.

Travail à faire :
- Les 26 `fontWeight` à ramener à 500
- Les 3 `uppercase` à retirer
- Vérifier qu'aucune ombre colorée n'est présente

---

### Phase 2 — Navigation & structure

#### 2.1 — `App.jsx` (1459 lignes)

**Attention** : fichier racine avec routing, sidebar, nav, layout
global. Risque élevé de casser la nav si mal touché.

Travail à faire :
- 31 `fontWeight≥600` → 500
- 2 gradients à supprimer
- 115 classes Tailwind — les convertir en inline **uniquement si
  elles violent un des 10 principes**. Sinon laisser tel quel pour
  cette phase (elles seront traitées en phase 3).
- Tester toutes les routes après modification

#### 2.2 — `components/AuthFlow.jsx` (718 lignes)

Travail à faire :
- 14 `fontWeight≥600` → 500
- 4 `uppercase` à retirer
- 1 gradient à supprimer
- Tester les 4 flows : register, login, reset password, email
  verification

#### 2.3 — `components/UI.jsx` (260 lignes)

Fichier de composants partagés (Modal, Toast). Impact large.

Travail à faire :
- Vérifier `Modal`, `Toast`, `useToast` — ombres, bordures, radius
- Harmoniser avec les patterns de l'onboarding 1

---

### Phase 3 — Gros chantiers (Tailwind lourd, risque élevé)

Ces fichiers nécessitent un travail de conversion plus substantiel.
À ne faire qu'après validation des phases 1 et 2.

#### 3.1 — `pages/Agenda.jsx` (2363 lignes, 459 classes Tailwind)

**Le plus gros morceau**. Ne pas tenter de tout convertir d'un coup.

Stratégie recommandée :
- Travailler **section par section** (modal détail RDV, vue jour, vue
  semaine, vue mois, formulaire création, etc.)
- Un commit par section
- La palette `STATUS_GRID` déjà présente (ligne 22) est déjà dans le
  bon esprit — la conserver
- La palette `STATUS_CFG` (ligne 14) avec alpha `0.12` sur fond peut
  rester
- Supprimer les 8 `linear-gradient`, notamment sur le bouton toggle
- Purger les classes `font-bold`, `uppercase`, `tracking-wider` des
  `text-[10px]` qui servent de label — les remplacer par des labels
  inline en `t.muted` `fontSize: 11`

#### 3.2 — `pages/EmployeeAgenda.jsx` (2164 lignes, 155 `fontWeight≥600`)

**Le pire en termes de violations**. Très proche d'Agenda.jsx en
structure.

Stratégie :
- Appliquer les mêmes patterns qu'Agenda après refonte de ce dernier
- Peut-être l'occasion de factoriser les composants RDV communs avec
  Agenda.jsx dans un module partagé

#### 3.3 — `pages/BookingPage.jsx` (1950 lignes, 84 `fontWeight≥600`)

Page publique critique (tunnel de réservation client). **Risque
élevé** : si ça casse, les clients ne peuvent plus réserver.

Stratégie :
- Refonte uniquement après validation des phases 1 et 2
- Tester chaque étape du tunnel après modification
- Préserver la logique de multi-steps
- La référence stylistique reste `ReferralPage.jsx` (même dossier)

#### 3.4 — `pages/settings/TabMarketing.jsx` (2361 lignes)

Le plus gros fichier Settings. Contient le marketing IA, segments RFM,
campagnes SMS.

Stratégie :
- Découper visuellement par section (RFM, campagnes, templates,
  statistiques)
- Un commit par section
- Ne pas toucher à la logique de segmentation ni aux cron d'envoi

#### 3.5 — `pages/settings/TabEquipe.jsx` (1290 lignes, 195 classes)

Travail similaire à Agenda : beaucoup de Tailwind mélangé aux inline.
Refonte section par section (liste employés, formulaire PIN, horaires,
commissions).

---

### Phase 4 — Finition

Pages moins visitées ou déjà en bon état :

- `pages/ClientsPage.jsx` — 77 `fontWeight`, 11 `uppercase` à traiter
- `pages/settings/TabCategories.jsx` — 1095 lignes, à passer en revue
- `pages/settings/TabStats.jsx` — 94 classes, refonte moyenne
- `pages/settings/TabNotifs.jsx` — 283 lignes, rapide
- `pages/settings/TabClients.jsx` — 437 lignes, rapide
- `pages/settings/TabCompte.jsx` — 537 lignes, déjà inline pur, rapide
- `pages/settings/TabImages.jsx` — 215 lignes, rapide
- `pages/settings/TabHistorique.jsx` — 229 lignes, rapide
- `pages/settings/TabExport.jsx` — 184 lignes, rapide
- `pages/settings/MerchantInfoCard.jsx` — 225 lignes, rapide
- `pages/booking/Account.jsx` — 1130 lignes, à passer en revue
- `pages/booking/MyAppointments.jsx` — 1366 lignes, à passer en revue
- `components/PinGate.jsx` — 373 lignes
- `components/EmployeePinModal.jsx` — 293 lignes
- `components/SMSRechargeModal.jsx` — 520 lignes

---

## 🧪 Procédure par fichier

À répéter pour chaque fichier :

1. **Lire le fichier en entier** avant toute modification
2. **Chercher les violations** avec les requêtes suivantes :
   ```
   fontWeight:\s*[6-9]00
   textTransform:\s*['"]uppercase
   linear-gradient
   boxShadow:.*rgba\(.+,\s*0\.[2-9]
   border:\s*['"]?[12](\.5)?px
   ```
3. **Traiter une violation à la fois** avec `str_replace`
4. **Vérifier la syntaxe** : accolades équilibrées, pas de guillemet
   orphelin, apostrophes JSX en double-quotes
5. **Lancer `npm run build`** pour détecter les erreurs
6. **Tester la page** en local (light mode + dark mode + mobile)
7. **Commit clair** : `refactor(design): modernize Dashboard.jsx`
8. **Push** et vérifier le build Vercel
9. **Passer au fichier suivant**

---

## 🎨 Palette STATUS officielle (à utiliser partout)

Pour unifier les 3 palettes existantes (`STATUS_CFG` dans Agenda,
`STATUS_GRID` dans Agenda, `PM_CFG` dans App), adopter celle-ci
comme référence :

```js
const STATUS_PALETTE = {
  confirmed: { bg: '#eef2ff', accent: '#4338ca', text: '#4338ca' },
  pending:   { bg: '#fffbeb', accent: '#92400e', text: '#92400e' },
  completed: { bg: '#f0fdf4', accent: '#065f46', text: '#065f46' },
  cancelled: { bg: '#fef2f2', accent: '#991b1b', text: '#991b1b' },
  no_show:   { bg: '#fff7ed', accent: '#9a3412', text: '#9a3412' },
};
```

Les 3 constantes existantes peuvent progressivement converger vers
celle-ci. Ne pas les remplacer d'un coup — laisser chaque fichier
migrer à son rythme lors de sa refonte.

---

## 📋 Check-list de validation par fichier

Avant de passer au fichier suivant :

- [ ] Lecture intégrale du fichier effectuée
- [ ] Tous les `fontWeight: 600/700/800/900` traités (restés ≤ 500)
- [ ] Tous les `textTransform: 'uppercase'` traités (ou justifiés)
- [ ] Tous les `linear-gradient` supprimés sur boutons/cartes
- [ ] Tous les `boxShadow` colorés transformés en neutres ou retirés
- [ ] Bordures harmonisées (0.5px partout sauf accent 2px)
- [ ] `borderRadius` dans {6, 8, 12, 99, 50%}
- [ ] Emojis UI retirés (gardés uniquement en data métier)
- [ ] Apostrophes françaises en double-quotes
- [ ] Build Vercel réussi
- [ ] Dark mode testé
- [ ] Mobile responsive testé
- [ ] Fonctionnalité intacte (clic, formulaire, flow)
- [ ] Commit propre avec message explicite

---

## 📝 Note finale

Ce fichier liste **l'ordre d'exécution** de la refonte. L'onboarding 1
(règles globales) liste les **principes à appliquer**.

Les deux doivent être lus ensemble avant d'attaquer une page.

Ne pas sauter les phases. Valider chaque fichier en production avant
de passer au suivant. En cas de régression, revenir en arrière
immédiatement plutôt que de patcher.