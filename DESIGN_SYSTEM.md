# Flowia Design System 2026 (FDS-2026)

Système visuel officiel du projet FlowIA. Ce document sert de référence
unique pour toute personne (humain ou IA) qui touche au code UI du
projet.

---

## Identifiant

- **Nom complet** : Flowia Design System 2026
- **Nom court** : FDS-2026
- **Usage dans les briefs** : "Applique le FDS-2026" suffit comme
  instruction à Claude Code pour qu'il comprenne les règles à suivre

---

## Documentation associée

- **Principes visuels détaillés** : `onboarding-1.md`
- **Primitives réutilisables** : `frontend/src/components/primitives/`
  (Button, Card, Input, Label, Field, SegmentedControl, StatusBadge)
- **Référence vivante conforme** :
  `frontend/src/pages/booking/ReferralPage.jsx`
- **Historique de la refonte progressive** : `onboarding-2.md`
- **Brief initial des primitives** : `onboarding-3.md`

---

## Les 10 principes

1. **Graisses légères** — `fontWeight` maximum = 500 (jamais 600+)
2. **Sentence case** — pas de `textTransform: uppercase` sauf
   abréviations naturelles (LUN, CB, RDV, SMS)
3. **Bordures fines** — toutes les `border` en `0.5px` (seule exception
   autorisée : `borderLeft: 2px` pour les accents colorés)
4. **Zéro ombre colorée, zéro gradient** — aplats uniquement, ombres
   neutres via `t.shadow*` si nécessaire
5. **Puces et barres** au lieu de badges saturés — point 5-6px ou
   barre verticale 2px à gauche d'un bloc pastel
6. **Emojis interdits dans l'UI** (titres, boutons, labels, badges)
   mais autorisés dans le contenu métier (PAY_OPTS, messages SMS client)
7. **Radius harmonisés** — uniquement {6, 8, 12, 99, 50%}, parfois 16-24
   pour les modales
8. **Palette pastel désaturée** — fond pastel clair + accent saturé
   pour la barre + texte foncé de la même famille
9. **Sous-lignes contextuelles** — 11-12px en `t.muted` pour enrichir
   une ligne principale
10. **Micro-indicateurs** au lieu de badges pleins — encart pastel
    compact ou puce + texte

---

## Tokens de thème

Toutes les couleurs passent par les tokens via `useTheme()`.
Aucun hex hardcodé en dark mode.

```js
const { theme: t, isDark, isLight, toggle } = useTheme();

// Fonds
t.bg         // fond général
t.canvas     // grandes zones
t.card       // cartes, conteneurs
t.cardAlt    // fonds secondaires
t.elevated   // modales, dropdowns

// Textes
t.text       // texte principal
t.textSub    // texte secondaire
t.muted      // labels, descriptifs
t.dim        // placeholder, hint

// Bordures
t.border         // bordure par défaut
t.borderStrong   // bordure visible
t.borderInput    // bordure inputs
t.separator      // séparateurs fins

// Ombres pré-calculées
t.shadowSm, t.shadowMd, t.shadowLg, t.shadowModal
```

---

## Palette pastel officielle

```js
const STATUS_PALETTE = {
  success:   { bg: '#f0fdf4', accent: '#10b981', text: '#065f46' },
  warning:   { bg: '#fffbeb', accent: '#f59e0b', text: '#92400e' },
  info:      { bg: '#eef2ff', accent: '#6366f1', text: '#4338ca' },
  danger:    { bg: '#fef2f2', accent: '#ef4444', text: '#991b1b' },
  no_show:   { bg: '#fff7ed', accent: '#fb923c', text: '#9a3412' },
  purple:    { bg: '#eeedfe', accent: '#8b5cf6', text: '#3c3489' },
  cyan:      { bg: '#ecfeff', accent: '#06b6d4', text: '#0e7490' },
};
```

Disponible via `getStatusPalette(t)` dans `useTheme.jsx`.

---

## Patterns propagés dans tout le projet

1. **Événement dans grille horaire** : fond pastel + `borderLeft: 2px
   solid accent_saturé` + `borderRadius: 8` (pas de radius côté
   gauche)
2. **Toolbar** : SegmentedControl pour switches de vue, Button primary
   pour CTA principal, icon buttons 32×32 avec 0.5px border pour
   navigation
3. **Bannière/alerte** : fond pastel + barre verticale 2px accent +
   texte sombre de la même famille
4. **Statut** : puce 5-6px + texte `t.muted` OU encart pastel compact
   `{ bg, text }`
5. **Selected state** : `background: t.text` plutôt que gradients ou
   couleurs saturées
6. **Form section** : `sectionCard` inline `{ t.card, 0.5px t.border,
   borderRadius: 12, padding: 16 }` + header 13px/500/t.text +
   sous-ligne 11px/t.muted
7. **Input** : `0.5px solid t.borderInput` + `t.inputBg` + Label
   primitive pour titres
8. **Icons UI** : `I.*` Lucide à la place des SVG inline et emojis
   décoratifs
9. **Toggle** : composant Toggle neutre, prop `colorOn` gradient
   retiré de tous les callers
10. **Spinner** : CSS natif `@keyframes spin` + couleurs via
    `t.border` / `t.text`

---

## Stack technique imposée

- **React inline styles uniquement** pour tout nouveau code
- **Pas de Tailwind** (même si le CDN est chargé, on n'ajoute jamais
  de classes)
- **Pas de CSS externe** (sauf `index.css` pour les animations globales)
- **Tokens `t.*` systématiques**, aucun hex hardcodé en dark mode
- **Apostrophes françaises** → double-quotes JSX : `{"l'offre..."}`,
  `{"d'accord"}`

---

## Check-list avant chaque push

- [ ] Aucun `fontWeight: 600/700/800/900` ajouté
- [ ] Aucune classe `font-bold`, `font-semibold`, `font-black` ajoutée
- [ ] Aucun `textTransform: 'uppercase'` ajouté (sauf abréviations
      tolérées)
- [ ] Aucun `border: 1px`/`1.5px`/`2px` ajouté (sauf accent gauche)
- [ ] Aucun `boxShadow` coloré ajouté
- [ ] Aucun `linear-gradient` ajouté sur bouton ou carte
- [ ] Aucun emoji ajouté dans titres, boutons, labels, badges
- [ ] `borderRadius` uniquement dans {6, 8, 12, 99, 50%, 16-24 modales}
- [ ] Toutes les couleurs passent par `t.*` ou `STATUS_PALETTE`
- [ ] Apostrophes françaises → double-quotes en JSX
- [ ] Build Vercel OK
- [ ] Dark mode testé (toggle thème)
- [ ] Mobile responsive testé
- [ ] Logique métier préservée à 100%

---

## Comment utiliser le FDS-2026 dans un brief Claude Code

### Brief court (recommandé)

```
Applique le FDS-2026 sur [fichier X].
Préserve à 100% : [liste des flux critiques].
Commit + push avec message clair.
```

### Brief détaillé

Reprendre les règles depuis `onboarding-1.md` et les adapter au
contexte du fichier. Voir exemples de briefs dans `onboarding-2.md`.

---

## Historique des versions

- **FDS-2026** (version actuelle) — refonte initiale sur ~95 fichiers
  entre Phases 1 à 5. Inspiration : Linear, Vercel, Cal.com, Stripe
  Dashboard, Planity.

---

## Contact

Toute modification du système doit être documentée ici et validée
avant d'être appliquée au code. La règle : **un design system stable
vaut mieux qu'un design system parfait**.