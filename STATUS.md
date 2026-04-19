# FlowIA — STATUS (2026-04-19)

Dernier commit : voir `git log -1`. Historique complet des sessions précédentes
dans `git log` (le fichier a été réinitialisé).

---

## 🆕 Session 2026-04-19 (suite 8) : Page Fidélité unifiée + limite anti-abus parrainage

### Demande (onboarding.md)
1. Fusionner `/settings/marketing/parrainage` et `/anniversaire` dans une
   seule page `/fidelite` avec des **accordéons fermés par défaut**.
2. Ajouter une limite de parrainages par client : 1 fois à vie, X fois par
   mois, X fois sur 3 mois, X fois par an, illimité.
3. Bien distinguer **montant fixe** vs **pourcentage** indépendamment pour
   parrain et filleul (déjà géré, validé).
4. Ne rien casser, éviter la duplication, logique claire parrain/filleul.

### Backend
- `db/index.js` : 2 nouvelles colonnes sur `referral_programs` :
  - `limit_count` INT (NULL = illimité ; 1 forcé pour 'lifetime')
  - `limit_period` VARCHAR(16) DEFAULT 'unlimited'
    (valeurs : `unlimited` | `lifetime` | `month` | `3months` | `year`)
  - Migration idempotente via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `routes/referrals.js` GET+PUT `/program` : expose et persiste les 2 nouveaux
  champs. Validation : `limit_period` whitelisté, `limit_count` ≥ 1, et
  forcé à 1 si période = 'lifetime'.
- `routes/global-clients.js` GET `/pub/:slug/referral-program` : ajoute
  `limit_count` + `limit_period` dans la réponse publique.
- `routes/public-booking.js` POST `/:slug/book` : **garde anti-abus**.
  Avant de créer une ligne `referral_uses`, on compte les parrainages
  pending+validated du parrain sur la fenêtre concernée :
  - `lifetime`  → COUNT total
  - `month`     → `created_at >= date_trunc('month', NOW())`
  - `3months`   → `created_at >= NOW() - INTERVAL '90 days'`
  - `year`      → `created_at >= date_trunc('year', NOW())`
  Si compteur ≥ `limit_count` → on n'insère pas `referral_uses` (silencieux,
  le RDV passe quand même).

### Frontend — `pages/settings/TabMarketing.jsx`
- **Onglets nettoyés** : suppression de `🎂 Anniv.` et `🤝 Parrain.` séparés.
  La nav top a maintenant `💎 Fidelite | % Promos | Solde | ✨ IA`.
- **Nouveau composant `TabFidelite`** : 3 accordéons fermés par défaut :
  1. 💎 Programme de fidélité (tampons / points) — wraps `<TabLoyalty>`
  2. 🎂 Offres anniversaire — wraps `<TabBirthday>`
  3. 🤝 Programme de parrainage — wraps `<TabReferral>`
  Chaque accordéon est un sous-composant `<FideliteAccordion>` réutilisable.
- **Redirection legacy** : un `useEffect` détecte les URLs
  `/settings/marketing/anniversaire` et `/parrainage` et redirige
  silencieusement vers `/fidelite` (pas de 404 sur les anciens liens).
- **`TabReferral`** : nouvelle section "Limite par parrain" avec sélecteur
  période (illimité / 1× à vie / X par mois / X sur 3 mois / X par an) +
  champ nombre conditionnel (caché si Illimité ou À vie).

### Frontend — `pages/booking/ReferralPage.jsx`
- **Maquette 1 (non connecté)** : section Conditions affiche désormais le
  vrai libellé de la limite via `limitPeriodLabel(refProgram)` au lieu de
  l'ancien fallback `monthly_limit`.
- **Maquette 2 (connecté)** : bandeau quota orange recalculé en fonction de
  `limit_period` :
  - `lifetime` → "à vie", pas de date de recharge
  - `month`    → "ce mois-ci", recharge fin de mois
  - `3months`  → "sur 3 mois", recharge dans 90j
  - `year`     → "cette année", recharge 31 décembre
  Calcul local : compte les `pending`+`validated` de `refMyHistory` sur la
  fenêtre courante côté client (cohérent avec la garde backend).

### Build
- `node --check` backend × 4 : OK
- `npx vite build` : OK (13.30s, 87 modules, page-settings +2.5 kB pour
  TabFidelite + UI limite, page-booking +0.8 kB pour le calcul quota
  multi-période)

### Compatibilité préservée
- Anciens parrainages déjà créés : `limit_period` = 'unlimited' par défaut,
  donc aucun blocage rétroactif.
- URLs `/settings/marketing/anniversaire` et `/parrainage` redirigent vers
  `/fidelite` (pas de bookmark cassé).
- Logique paiement caisse / stats / commissions : inchangée (la limite
  n'affecte que l'INSERT dans `referral_uses`, le RDV est toujours créé).

---

## 🆕 Session 2026-04-19 (suite 7) : Fix route /parrain manquante + rename bouton

### Bug
Quand l'utilisateur cliquait sur « Parrainer un ami » (nav ou bouton mobile),
la page semblait clignoter puis redirigeait vers `/book/<commerçant>`.

### Cause
La route `/book/:slug/parrain` **n'était pas déclarée** dans `index.jsx`.
- React Router tombait dans le catch-all `<Route path="/*" element={<RootSwitch/>}>`.
- Sur le domaine commerçant : `<App />` se montait à la place (puis redirigeait).
- Sur le domaine booking public : `<Navigate to="/book/<slug>" replace />` →
  retour à l'accueil.

`navigate('/book/${slug}/parrain')` changeait bien l'URL et `setView('parrain')`
le state local, mais le routeur démontait `BookingPage` au profit du catch-all
→ effet « page qui clignote puis redirige ».

### Fix — `frontend/src/index.jsx`
Ajout de la route manquante :
```jsx
<Route path="/book/:slug/parrain" element={<BookingPageWrapper />} />
```

### Renommage du bouton (demande utilisateur)
- NavBar desktop (`pages/booking/NavBar.jsx`) :
  « Parrainer un ami » → **« Programme parrainage »**
- Bouton mobile bk-mo (`pages/BookingPage.jsx`) :
  « 🤝 Parrainer un ami » → **« 🤝 Programme parrainage »**
- `whiteSpace:'nowrap'` ajouté sur les boutons de nav pour garantir l'affichage
  sur une seule ligne (évite les retours à la ligne sur écrans étroits).

### Build
- `npx vite build` : OK (22.17s, 87 modules)
