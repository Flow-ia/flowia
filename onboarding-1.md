# 🎨 FlowIA — Direction visuelle 2026 (règles globales)

## Contexte

Onboarding destiné à définir la **direction visuelle cible** pour tout
nouveau code écrit dans FlowIA. S'applique à tout nouveau fichier JSX et
à toute modification substantielle d'un fichier existant.

Inspiration : Linear, Vercel, Cal.com, Stripe Dashboard, Planity.
Style sobre, dense, plat, très lisible.

Référence implémentée déjà conforme : `src/pages/booking/ReferralPage.jsx`.
Utiliser ce fichier comme modèle de ce qui est attendu.

---

## 🔧 Stack réelle du projet

À savoir avant de coder :

- **Tailwind CSS est chargé via CDN** dans `frontend/index.html`
  (`<script src="https://cdn.tailwindcss.com"></script>`)
- Mais la **règle du projet est inline styles React** pour tout nouveau
  code — suivre ce qui est fait dans `Dashboard.jsx`, `ReferralPage.jsx`,
  `TabCompte.jsx`, `Forms.jsx`, `SMSRechargeModal.jsx` (tous 100% inline)
- Les anciens fichiers (`Agenda.jsx`, `App.jsx`, `TabEquipe.jsx`,
  `AuthFlow.jsx`, `TabStats.jsx`, `BookingPage.jsx`) ont encore du
  Tailwind résiduel — **ne pas en ajouter**, retirer progressivement
  quand on y passe

---

## 🎯 Tokens de thème réels (`useTheme.jsx`)

Toujours utiliser ces noms exacts, pas d'invention :

```js
// Import
import { useTheme } from './hooks/useTheme';
const { theme: t, isDark, isLight, toggle } = useTheme();

// Fonds
t.bg         // fond général (body)
t.canvas     // grandes zones de contenu
t.card       // cartes, conteneurs
t.cardAlt    // fonds secondaires (cartes internes)
t.elevated   // modales, dropdowns

// Textes
t.text       // texte principal
t.textSub    // texte secondaire
t.muted      // labels, descriptifs
t.dim        // placeholder, hint

// Bordures
t.border         // bordure par défaut (0.08 alpha)
t.borderStrong   // bordure visible (0.14 alpha)
t.borderInput    // bordure inputs (0.12 alpha)
t.separator      // séparateurs fins (0.06 alpha)

// Ombres pré-calculées (à utiliser tel quel quand il en faut)
t.shadowSm, t.shadowMd, t.shadowLg, t.shadowModal

// Mode
t.mode === 'light' | 'dark'
```

Constantes `BRAND` importables depuis `useTheme.jsx` pour les couleurs
sémantiques (success, danger, warning, info, cash/card/transfer/other).

---

## 📐 Les 10 principes de style

### 1. Graisses légères

`fontWeight` maximum = **500** dans tout nouveau code.

```js
// ❌ Jamais
fontWeight: 600, 700, 800, 900
// Tailwind: font-semibold, font-bold, font-black, font-extrabold

// ✅ Toujours
fontWeight: 400  // normal
fontWeight: 500  // titres, labels actifs, valeurs importantes
```

### 2. Sentence case partout

Pas de `textTransform: 'uppercase'` ni de classe `uppercase`.

Exceptions tolérées :
- abréviations naturelles en dur : LUN, MAR, CB, TVA, RDV, SMS
- codes techniques : `ROMAIN-8K4P`, `#A3B8C9`
- un unique label discret type "VOTRE CODE" au-dessus d'un gros
  affichage (voir `ReferralPage.jsx`)

### 3. Bordures fines 0.5px

```js
// ❌ Jamais
border: '1px solid ...'
border: '1.5px solid ...'
border: '2px solid ...'  (sauf accent gauche, cf. principe 5)

// ✅ Toujours
border: `0.5px solid ${t.border}`
border: `0.5px solid ${t.borderStrong}`
```

### 4. Zéro ombre colorée, zéro gradient

```js
// ❌ Interdit
background: 'linear-gradient(135deg, #10b981, #059669)'
boxShadow: '0 4px 12px rgba(16,185,129,0.4)'
boxShadow: '0 10px 32px rgba(99,102,241,0.3)'

// ✅ Autorisé
background: t.text  // CTA principal = couleur texte pleine
boxShadow: t.shadowSm  // ombre neutre prédéfinie si vraiment nécessaire
```

Les `t.shadow*` neutres sont tolérés sur cartes élevées et modales.
Aucune ombre teintée de couleur sémantique.

### 5. Puces et barres à la place des blocs saturés

Statuts → puce 5-6px colorée ou barre verticale 2px à gauche.

```jsx
// ❌ Badge plein
<span style={{ background: '#10b981', color: '#fff',
  padding: '3px 8px', borderRadius: 12, fontWeight: 700,
  textTransform: 'uppercase', fontSize: 11 }}>
  ACTIF
</span>

// ✅ Puce + texte
<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
  <span style={{ width: 6, height: 6, borderRadius: '50%',
    background: '#10b981' }} />
  <span style={{ fontSize: 12, color: t.muted }}>Actif</span>
</span>

// ✅ Barre verticale pour événements (agenda)
<div style={{ background: '#f0fdf4', borderLeft: '2px solid #10b981',
  padding: '6px 8px', borderRadius: 8 }}>
  ...
</div>
```

Rappel : un `borderLeft` accent ne doit **jamais** avoir de
`borderRadius` côté gauche, sinon ça bave.

### 6. Emojis UI vs emojis data

- **Jamais d'emoji dans** : titres de section, boutons d'action,
  onglets, labels de formulaire, headers, badges de statut purement
  décoratifs
- **OK pour** : contenu utilisateur (messages SMS/email rédigés par
  le commerçant), données métier (`PAY_OPTS` avec 💵💳🏦 qui sert
  d'identifiant visuel des moyens de paiement)

Pour remplacer un emoji décoratif : icône Lucide via `utils/icons.jsx`
(composant `I.*`) en 16px, ou rien du tout.

### 7. Radius harmonisés

Trois valeurs dans toute nouvelle UI :

```js
borderRadius: 6   // inputs, petits boutons, icon cards internes
borderRadius: 8   // boutons, cartes de contrôle, moyens de paiement
borderRadius: 12  // conteneurs principaux, cartes contenantes
```

Exceptions :
- `borderRadius: 99` ou `'50%'` pour les pilules et ronds (avatars,
  puces, toggles)
- `borderRadius: 16-24` pour les modales qui doivent respirer

### 8. Palette désaturée pour les fonds

Pour les fonds colorés (status, accents), préférer les **teintes
pastel** avec texte foncé de la même famille.

Palette de référence (déjà en place dans `STATUS_GRID` de `Agenda.jsx`
et `COL` de `ReferralPage.jsx`) :

```js
// Vert / validé / success
bg: '#f0fdf4' ou '#eaf3de'  ·  accent: '#10b981'  ·  text: '#065f46' ou '#27500a'

// Ambre / en attente / warning
bg: '#fffbeb' ou '#faeeda'  ·  accent: '#f59e0b' ou '#ba7517'  ·  text: '#92400e' ou '#633806'

// Indigo / confirmé / info
bg: '#eef2ff' ou '#eeedfe'  ·  accent: '#6366f1' ou '#534ab7'  ·  text: '#4338ca' ou '#3c3489'

// Rouge / annulé / danger
bg: '#fef2f2' ou '#fcebeb'  ·  accent: '#ef4444' ou '#a32d2d'  ·  text: '#991b1b' ou '#791f1f'

// Orange / no-show
bg: '#fff7ed'  ·  accent: '#fb923c'  ·  text: '#9a3412'
```

Jamais de fond large rempli avec une couleur saturée pure
(`#10b981`, `#3b82f6`, etc.).

### 9. Sous-lignes contextuelles

Pour enrichir une ligne d'info, ajouter une sous-ligne 11-12px en
`t.muted` :

```jsx
<div>
  <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: t.text }}>
    Pierre M.
  </p>
  <p style={{ fontSize: 11, color: t.muted, margin: '2px 0 0' }}>
    Coupe · 30 min · Karim
  </p>
</div>
```

### 10. Micro-indicateurs partout

Remplacer tout badge plein par une puce 5-6px + texte en couleur
sémantique, ou par un petit encart pastel (background + text de la
même famille, font-size 11-12px).

```jsx
// Encart pastel compact
<span style={{ background: 'rgba(34,197,94,0.15)', color: '#15803d',
  fontSize: 11, padding: '3px 8px', borderRadius: 8, fontWeight: 500 }}>
  Validé
</span>
```

---

## 🧪 Check-list avant push (tout nouveau fichier ou gros changement)

- [ ] Aucun `fontWeight: 600/700/800/900` ajouté
- [ ] Aucune classe `font-bold`, `font-semibold`, `font-black` ajoutée
- [ ] Aucun `textTransform: 'uppercase'` ajouté (sauf abréviations)
- [ ] Aucun `border: 1px` ou `1.5px` ou `2px` ajouté (sauf accent gauche)
- [ ] Aucun `boxShadow` coloré ajouté (bleu, vert, violet, rouge…)
- [ ] Aucun `linear-gradient` ajouté sur bouton ou carte
- [ ] Aucun emoji ajouté dans titres, boutons, labels, badges
- [ ] `borderRadius` uniquement dans {6, 8, 12, 99, 50%}
- [ ] Toutes les couleurs passent par `t.*` ou `BRAND.*` (pas de hex
      hardcodé en dark mode)
- [ ] Apostrophes françaises → double-quotes en JSX (`{"l'offre..."}`)
- [ ] Build Vercel OK
- [ ] Dark mode testé (toggle via header)
- [ ] Responsive mobile testé

---

## 🧩 Patterns à réutiliser

### Bouton primaire (CTA principal)

```jsx
<button style={{
  background: t.text,
  color: t.bg,
  border: 'none',
  padding: '10px 18px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
}}>
  Enregistrer
</button>
```

### Bouton secondaire

```jsx
<button style={{
  background: 'transparent',
  color: t.text,
  border: `0.5px solid ${t.borderStrong}`,
  padding: '10px 18px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
}}>
  Annuler
</button>
```

### Carte conteneur

```jsx
<div style={{
  background: t.card,
  border: `0.5px solid ${t.border}`,
  borderRadius: 12,
  padding: 20,
}}>
  ...
</div>
```

### Input avec unité inline

```jsx
<div style={{
  display: 'flex', alignItems: 'center',
  border: `0.5px solid ${t.borderInput}`,
  borderRadius: 8,
  padding: '0 12px',
  background: t.inputBg,
}}>
  <input
    value={value}
    onChange={...}
    style={{
      flex: 1, border: 'none', padding: '10px 0',
      background: 'transparent', outline: 'none',
      color: t.text, fontSize: 14,
    }}
  />
  <span style={{ fontSize: 13, color: t.muted }}>%</span>
</div>
```

### Segmented control (au lieu de radios 50/50)

```jsx
<div style={{
  display: 'inline-flex',
  background: t.cardAlt,
  borderRadius: 8,
  padding: 3,
}}>
  <button style={{
    background: isActive ? t.card : 'transparent',
    color: isActive ? t.text : t.muted,
    border: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  }}>
    Option A
  </button>
  <button style={{
    background: !isActive ? t.card : 'transparent',
    color: !isActive ? t.text : t.muted,
    border: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  }}>
    Option B
  </button>
</div>
```

### Événement d'agenda (pastille + barre)

```jsx
const STATUS = {
  confirmed: { bg: '#eef2ff', bd: '#4338ca', tx: '#4338ca' },
  completed: { bg: '#f0fdf4', bd: '#065f46', tx: '#065f46' },
  pending:   { bg: '#fffbeb', bd: '#92400e', tx: '#92400e' },
  cancelled: { bg: '#fef2f2', bd: '#991b1b', tx: '#991b1b' },
};

<div style={{
  background: STATUS[status].bg,
  borderLeft: `2px solid ${STATUS[status].bd}`,
  padding: '6px 8px',
  borderRadius: 8,
}}>
  <p style={{ fontSize: 11, fontWeight: 500, margin: 0,
    color: STATUS[status].tx }}>Pierre M.</p>
  <p style={{ fontSize: 10, color: STATUS[status].tx, opacity: 0.75,
    margin: '1px 0 0' }}>
    Coupe · 30 min
  </p>
</div>
```

### Statut en ligne (avec puce)

```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
  <span style={{
    width: 6, height: 6, borderRadius: '50%',
    background: '#10b981',
  }} />
  <span style={{ fontSize: 12, color: t.muted }}>
    RDV terminé
  </span>
</div>
```

---

## 📝 Note finale

Ces principes sont la **direction cible**. Pour l'application
progressive sur les pages existantes, se référer à l'onboarding séparé
de refonte visuelle.

La référence vivante dans le repo : `src/pages/booking/ReferralPage.jsx`.
Toute nouvelle page doit ressembler à cette rigueur de style.