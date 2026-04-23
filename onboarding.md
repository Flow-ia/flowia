## 2026-04-24 — Question RGPD + fix 4 bugs

### Question client : transactions conservées côté commerçant ?
Oui. Quand un client supprime son compte via `DELETE /api/global-clients/me`,
les transactions côté commerçant sont **conservées** pour la comptabilité —
seules les données personnelles sont retirées. Détail dans
`backend/src/routes/global-clients/account.js` :
```sql
UPDATE transactions SET client_email=NULL, client_note=NULL
 WHERE LOWER(client_email)=LOWER($1)
```
Montants, moyens de paiement, dates, lignes de prestations et employé
restent intacts. Les RDV futurs sont annulés + anonymisés
(`client_name='Client anonyme'`), les fiches locales et cartes de fidélité
supprimées, mais l'historique financier du commerçant n'est jamais touché.

### Bug A — Upload photo employé : 500 + "Unexpected token '<'"
Symptôme : "Failed to load resource: 500" + `Unexpected token '<',
"<!DOCTYPE "... is not valid JSON`. Le backend renvoyait du HTML au lieu
de JSON, ce qui plantait `res.json()` côté frontend et masquait la vraie
cause.
Cause : aucun handler d'erreur Express global sur `/api/*`. Quand multer
(file-filter, limite 5 Mo) ou un middleware tombait en `next(err)`, le
handler par défaut d'Express servait une page HTML `<!DOCTYPE …>` →
frontend crashe sur `res.json()`.
Fix :
- `backend/src/index.js` : ajout d'un middleware d'erreur JSON qui capture
  toutes les erreurs des routes `/api/*`, log le status+message côté
  serveur, et renvoie `{ error: <message> }` au client. Les 413/400 sont
  préservés (ex: `LIMIT_FILE_SIZE` → 400 avec message lisible).
- `frontend/src/utils/api.js` : nouveau helper `_uploadImage` partagé par
  `uploadProfile/Logo/Cover/ServiceImage/EmployeeImage`. Il regarde le
  `Content-Type` de la réponse et ne tente `res.json()` que si c'est du
  JSON — sinon fallback sur un message basé sur le status HTTP (413 →
  "Image trop lourde", 401 → "Session expirée", etc.). Plus de
  "Unexpected token '<'".

### Bug B — Modification d'un service : champs vides
Symptôme : Settings > Categories > Booking > Edit service → le modal
s'ouvre avec les champs vides. Impossible d'éditer sans tout re-saisir.
Cause : `SvcFormModal.jsx` initialisait ses `useState` avec `init?.name`
etc. Or `useState(x)` n'utilise `x` qu'au 1er mount. La modale n'est
jamais démontée (le parent la rend toujours, même avec `open=false`) →
changer `init` ne rafraîchit pas le state.
Fix : ajout d'un `useEffect([open, init?.id, parentId])` qui resync tous
les champs avec `init` à chaque ouverture. Même pattern corrigé dans
`CatFormModal.jsx`. Fichiers : `SvcFormModal.jsx`, `CatFormModal.jsx`.

### Bug C — Stats CA par employé affichées dans /settings/equipe
Les chiffres d'affaires individuels + la répartition par moyen de
paiement sont déjà disponibles dans `/historique` (Dashboard). Retirés
de la fiche employé dans Settings > Equipe. La prop `transactions` est
retirée du composant (non utilisée après suppression des stats).
Fichier : `frontend/src/pages/settings/equipe/tabs/TabEmployees.jsx`.

### Bug D — Fiches employés : accordion fermé par défaut
Chaque fiche employé (visibilité, permissions agenda, permissions crédit)
est désormais repliée. Clic sur l'en-tête de la fiche (avatar + nom) →
ouvre/ferme la section, avec chevron qui pivote. Les boutons action (PIN,
edit, supprimer) conservent leur clic (stopPropagation) — pas de toggle
accidentel. Fichier : `TabEmployees.jsx`.
