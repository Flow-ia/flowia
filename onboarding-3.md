# 🧩 FlowIA — 6 composants universels (spec visuelle stricte)

## Contexte

Ce fichier définit les **6 composants universels** à reproduire
exactement dans FlowIA. Ces composants sont à créer comme primitives
réutilisables dans `src/components/ui/` et à utiliser partout dans
l'app.

**Règle absolue** : les maquettes HTML ci-dessous sont la référence
visuelle stricte. Reproduire exactement les dimensions, paddings,
couleurs, comportements.

Stack imposée :
- **React inline styles uniquement** (pas de Tailwind, pas de CSS
  externe)
- **Tokens de thème `t.*`** depuis `hooks/useTheme.jsx`
- Dark mode supporté partout via `t.mode === 'dark'`

---

## 1. Bouton primaire (`Button` variant `primary`)

CTA principal d'une page ou d'une modale. Un seul par vue en général.

### Spec

```jsx
<button
  onClick={onClick}
  disabled={disabled}
  style={{
    background: t.text,
    color: t.bg,
    border: 'none',
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontFamily: 'inherit',
    transition: 'transform 0.1s ease, opacity 0.15s ease',
  }}
  onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = 'scale(0.98)')}
  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
>
  {children}
</button>
```

### Variantes tailles

- **default** : `padding: '10px 18px', fontSize: 14` (standard)
- **small** : `padding: '7px 14px', fontSize: 13`
- **large** : `padding: '13px 22px', fontSize: 15`
- **full width** : ajouter `width: '100%'`

### À ne jamais faire

- `background: linear-gradient(...)`
- `boxShadow: '0 4px 12px rgba(...)'`
- `textTransform: 'uppercase'`
- `fontWeight: 600 ou plus`
- Emoji dans le label

---

## 2. Bouton secondaire (`Button` variant `secondary`)

Action alternative ou annulation, placé à côté d'un primaire.

### Spec

```jsx
<button
  onClick={onClick}
  disabled={disabled}
  style={{
    background: 'transparent',
    color: t.text,
    border: `0.5px solid ${t.borderStrong}`,
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontFamily: 'inherit',
    transition: 'background 0.15s ease',
  }}
  onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = t.cardAlt)}
  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
>
  {children}
</button>
```

### Variantes

- **danger** : `color: '#991b1b'`, `border: '0.5px solid rgba(239,68,68,0.3)'`,
  hover `background: 'rgba(239,68,68,0.05)'`
- **ghost** : pas de bordure, juste `color: t.muted`, hover `color: t.text`

---

## 3. Carte conteneur (`Card`)

Bloc conteneur standard pour grouper un contenu.

### Spec

```jsx
<div style={{
  background: t.card,
  border: `0.5px solid ${t.border}`,
  borderRadius: 12,
  padding: 20,
  boxSizing: 'border-box',
}}>
  {children}
</div>
```

### Variantes

- **compact** : `padding: 14, borderRadius: 8`
- **large** : `padding: 28, borderRadius: 16`
- **flat** (sans bordure) : `border: 'none', background: t.cardAlt`

### À ne jamais faire

- `boxShadow: '0 24px 64px ...'` — pas d'ombre forte
- Bordure 1px ou 2px
- Gradient en background

---

## 4. Input text + input avec unité

### 4.1 — Input simple

```jsx
<input
  type="text"
  value={value}
  onChange={onChange}
  placeholder={placeholder}
  style={{
    width: '100%',
    padding: '10px 12px',
    background: t.inputBg,
    border: `0.5px solid ${t.borderInput}`,
    borderRadius: 8,
    fontSize: 14,
    color: t.text,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  }}
  onFocus={(e) => {
    e.currentTarget.style.borderColor = t.borderStrong;
    e.currentTarget.style.boxShadow = `0 0 0 3px ${t.border}`;
  }}
  onBlur={(e) => {
    e.currentTarget.style.borderColor = t.borderInput;
    e.currentTarget.style.boxShadow = 'none';
  }}
/>
```

### 4.2 — Input avec unité inline (€, %, min, etc.)

```jsx
<div style={{
  display: 'flex',
  alignItems: 'center',
  background: t.inputBg,
  border: `0.5px solid ${t.borderInput}`,
  borderRadius: 8,
  padding: '0 12px',
  transition: 'border-color 0.15s ease',
}}>
  <input
    type="number"
    value={value}
    onChange={onChange}
    style={{
      flex: 1,
      border: 'none',
      padding: '10px 0',
      background: 'transparent',
      outline: 'none',
      color: t.text,
      fontSize: 14,
      fontFamily: 'inherit',
      minWidth: 0,
    }}
  />
  <span style={{
    fontSize: 13,
    color: t.muted,
    marginLeft: 8,
    userSelect: 'none',
  }}>
    {unit}
  </span>
</div>
```

### 4.3 — Label au-dessus d'un input

```jsx
<div style={{ marginBottom: 14 }}>
  <label style={{
    display: 'block',
    fontSize: 12,
    color: t.muted,
    marginBottom: 6,
  }}>
    {label}
  </label>
  {/* Input ici */}
</div>
```

**Attention** : pas de `fontWeight: 600`, pas d'`uppercase`, pas de
`letter-spacing`. Juste `fontSize: 12, color: t.muted`.

---

## 5. Segmented control

Remplace les radios 50/50 ou les onglets internes. Style iOS/macOS.

### Spec

```jsx
<div style={{
  display: 'inline-flex',
  background: t.cardAlt,
  borderRadius: 8,
  padding: 3,
  gap: 0,
}}>
  {options.map((opt) => (
    <button
      key={opt.value}
      onClick={() => setValue(opt.value)}
      style={{
        background: value === opt.value ? t.card : 'transparent',
        color: value === opt.value ? t.text : t.muted,
        border: 'none',
        padding: '6px 14px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: value === opt.value ? 500 : 400,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {opt.label}
    </button>
  ))}
</div>
```

### Usage

```jsx
<SegmentedControl
  value={periodType}
  onChange={setPeriodType}
  options={[
    { value: 'day', label: 'Jour' },
    { value: 'week', label: 'Semaine' },
    { value: 'month', label: 'Mois' },
  ]}
/>
```

### Contraintes

- Maximum **4 options** dans un segmented control
- Si plus de 4 options → utiliser un select ou des tabs classiques
- Option active : fond `t.card`, weight 500
- Option inactive : transparent, weight 400, couleur `t.muted`

---

## 6. Badge de statut

Remplacement des badges pleins type "ACTIF". Deux variantes possibles.

### 6.1 — Puce + texte (préféré, sobre)

```jsx
<div style={{
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}}>
  <span style={{
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: STATUS_PALETTE[status].accent,
    flexShrink: 0,
  }} />
  <span style={{
    fontSize: 12,
    color: t.muted,
  }}>
    {label}
  </span>
</div>
```

### 6.2 — Encart pastel (si besoin de plus de visibilité)

```jsx
<span style={{
  display: 'inline-block',
  background: STATUS_PALETTE[status].bg,
  color: STATUS_PALETTE[status].text,
  fontSize: 11,
  padding: '3px 8px',
  borderRadius: 8,
  fontWeight: 500,
  whiteSpace: 'nowrap',
}}>
  {label}
</span>
```

### Palette de référence

```js
const STATUS_PALETTE = {
  // Vert / success / confirmé / validé
  success:   { bg: '#f0fdf4', accent: '#10b981', text: '#065f46' },
  // Ambre / warning / en attente
  warning:   { bg: '#fffbeb', accent: '#f59e0b', text: '#92400e' },
  // Indigo / info / confirmé
  info:      { bg: '#eef2ff', accent: '#6366f1', text: '#4338ca' },
  // Rouge / danger / annulé / refusé
  danger:    { bg: '#fef2f2', accent: '#ef4444', text: '#991b1b' },
  // Orange / no-show
  no_show:   { bg: '#fff7ed', accent: '#fb923c', text: '#9a3412' },
  // Violet / spécial
  purple:    { bg: '#eeedfe', accent: '#8b5cf6', text: '#3c3489' },
  // Gris neutre / désactivé / expiré
  neutral:   { bg: t.cardAlt, accent: t.muted, text: t.textSub },
};
```

Cette palette est à **stocker dans `hooks/useTheme.jsx`** à côté de
`BRAND` pour être réutilisée partout.

### À ne jamais faire pour les badges

- `background: '#10b981'` (couleur saturée pleine)
- `color: '#fff'` sur badge (jamais de texte blanc sur couleur)
- `textTransform: 'uppercase'`
- `fontWeight: 700`
- `borderRadius: 12` ou plus (pas de style pilule pour les badges)

---

## 📦 Structure de fichiers recommandée

Créer un dossier `src/components/ui/` avec :

```
src/components/ui/
├── index.js          // re-exports
├── Button.jsx        // primary + secondary + variantes
├── Card.jsx          // card + variantes compact/large/flat
├── Input.jsx         // text + number + avec unité + label
├── SegmentedControl.jsx
├── StatusBadge.jsx   // 6.1 puce, 6.2 encart, switch par prop
└── palette.js        // STATUS_PALETTE exporté
```

Chaque composant accepte :
- `theme` en prop OU `useTheme()` en interne (au choix, cohérent dans
  toute la série)
- `style` optionnel pour override ponctuel
- `className` interdit (on n'utilise pas Tailwind dans ces primitives)

---

## 🧪 Validation

Avant de considérer les composants comme terminés :

- [ ] Les 6 composants existent dans `src/components/ui/`
- [ ] Chacun est testé en light mode
- [ ] Chacun est testé en dark mode
- [ ] Aucun `fontWeight > 500` dans tous les composants
- [ ] Aucun `textTransform: uppercase`
- [ ] Aucun `linear-gradient`
- [ ] Aucun `boxShadow` coloré
- [ ] Toutes les bordures sont en `0.5px`
- [ ] Les radius sont dans {6, 8, 12, 50%}
- [ ] Build Vercel OK
- [ ] Responsive mobile OK

---

## 🎯 Étape suivante

Une fois ces 6 primitives créées, elles doivent être **progressivement
adoptées** dans le code existant. À chaque fois qu'une page est
refondue (phases de l'onboarding-2-refonte-progressive), remplacer
les boutons/cartes/inputs inline par les primitives correspondantes.

Ne pas faire de refactorisation massive des usages. Juste migrer
pendant les refontes fichier par fichier.