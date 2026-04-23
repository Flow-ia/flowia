## 2026-04-24 — Fix map adresse site booking + DELETE compte client 500

### Bug 1 — Google Maps iframe bloqué par CSP
Symptôme : section Adresse du site de réservation → iframe vide, console :
`Framing 'https://maps.google.com/' violates … frame-src 'self'
https://js.stripe.com https://accounts.google.com https://hooks.stripe.com`.
Cause : la CSP déclarée dans `frontend/vercel.json` n'incluait pas les hosts
Google Maps dans `frame-src`. Fix :
- Ajout de `https://www.google.com https://maps.google.com` à `frame-src`.
- Step1Home.jsx : l'URL d'embed passe de `maps.google.com` → `www.google.com`
  (évite la redirection 301 que certains navigateurs mobiles refusent dans
  un iframe).
Fichiers : `frontend/vercel.json`, `frontend/src/pages/booking-page/steps/Step1Home.jsx`.

### Bug 2 — DELETE /api/global-clients/me → 500 (suppression compte RGPD)
Symptôme : bouton "Supprimer mon compte" côté espace client → 500 Internal
Server Error, compte jamais supprimé.
Cause : le handler RGPD anonymise `client_credits.client_email = NULL` et
`client_notes.client_email = NULL`, mais ces deux colonnes ont été créées
avec la contrainte `NOT NULL`. PostgreSQL rejette l'UPDATE →
`null value in column "client_email" violates not-null constraint` →
le handler tombait dans le catch global → 500 générique.
Fix : 2 migrations non destructives dans `backend/src/db/index.js` :
- `ALTER TABLE client_credits ALTER COLUMN client_email DROP NOT NULL`
- `ALTER TABLE client_notes   ALTER COLUMN client_email DROP NOT NULL`
UNIQUE(user_id, client_email) reste valide (PostgreSQL autorise plusieurs
NULL dans un index unique). Au prochain boot Render, les contraintes sont
relâchées → la suppression RGPD passe (les 9 opérations + COMMIT).
Fichier : `backend/src/db/index.js`.

Les warnings console `SendActivationMesToFrame` et `A listener indicated
an asynchronous response by returning true, …` sont émis par une extension
navigateur (typiquement un translate/antivirus) — pas du code FlowIA, à
ignorer.
