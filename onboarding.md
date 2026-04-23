## 2026-04-24 — Catégories fermées + format/taille + erreurs inline

### Bug A — Catégories "Caisse" et "Site de réservation" ouvertes par défaut
Les deux composants (`CaisseCategories.jsx` et `BookingServices.jsx`)
auto-ouvraient toutes les catégories au 1er chargement via un flag
`didInitOpen`. Retiré → `openCats` initialisé à `new Set()` vide →
catégories repliées par défaut. L'utilisateur clique sur l'en-tête pour
déplier. Le comportement "nouvelle catégorie = ouverte" est conservé
dans `BookingServices` (après `createServiceCategory` on ajoute l'id au
Set). Fichiers : `CaisseCategories.jsx`, `BookingServices.jsx`.

### Bug B — Formats + taille max photo + erreurs inline
Avant : alert/toast global "Erreur upload", pas d'indication de format
attendu, et `EmployeeForm` rejetait silencieusement un fichier non
conforme (aucun retour visuel).

Harmonisation sur les 3 emplacements qui acceptent des photos :

1. **TabImages.jsx (logo, profil, galerie salon)** :
   - Hint `JPG, PNG, WEBP ou GIF · 5 Mo max` sous chaque libellé.
   - `accept="image/jpeg,image/png,image/webp,image/gif"` (au lieu de
     `image/*` qui laissait passer HEIC/SVG).
   - État `errors.{logo,profile,cover}` dédié par emplacement ; message
     en rouge sous l'élément concerné + bordure rouge sur le bloc.
   - Les erreurs serveur (413/401/403/etc.) remontent sur ce même
     emplacement inline (plus de toast bloquant).

2. **Forms.jsx EmployeeForm (photo employé)** :
   - Auparavant : fichier rejeté en silence (`return;` nu).
   - Ajout d'un state `imgErr` + message inline sous le bouton
     "Ajouter une photo" + bordure rouge quand erreur.
   - Hint `JPG, PNG, WEBP ou GIF · 5 Mo max` en bas du bloc.
   - Même whitelist MIME côté picker.

3. **SvcFormModal.jsx (photo service)** :
   - Séparation de `err` (nom requis) et `imgErr` (image). L'erreur
     image s'affiche désormais SOUS le bloc upload, pas en haut du
     modal (plus contextuel).
   - Hint `JPG, PNG, WEBP ou GIF · 5 Mo max` visible en permanence
     (dans le bouton camera si vide, sous les boutons
     Remplacer/Supprimer sinon).
   - Whitelist MIME côté picker.

Note : `image/*` sur un `<input type="file">` n'est qu'un filtre UX
(l'utilisateur peut toujours "forcer" tous fichiers). La vraie
validation reste côté backend (`fileFilter` multer + magic-bytes).
Les constantes frontend reflètent la whitelist backend identique
(jpeg/png/webp/gif).
