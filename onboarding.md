# Bug — boucle login commerçant

## Symptôme

Sur `commercant.haircoifflille.fr`, après login admin, redirection
systématique vers `/login`. Console :

```
GET https://flowia-backend.onrender.com/api/booking/appointments?from=…&to=… 401 (Unauthorized)
```

Le token semble supprimé / non reconnu juste après l'authentification.

## Cause

Faiblesse défensive dans `useAuth` : le `.catch()` autour de `api.me()`
(au mount + dans `applyMerchantLogin` OAuth) purgeait `ff_token` sur
**toute** erreur — y compris 500/timeout/réseau KO. Sur cold start
Render (10-15 s), un `/auth/me` lent juste après login déclenchait :

1. `api.me()` timeout → `.catch` → `removeItem('ff_token')`
2. Tokens des autres requêtes (`getAppointments`, etc.) deviennent 401
3. Boucle login

Grace period de 5 s aussi insuffisante pour cold start Render.

## Fix

`frontend/src/hooks/useAuth.jsx` + `frontend/src/utils/api.js` :

- Grace period post-login bumpée de **5 s → 15 s** (couvre cold start
  Render + propagation React).
- `.catch` sur `api.me()` ne purge plus aveuglément : ne nettoie le PIN
  que si `handleMerchant401` a déjà confirmé un vrai 401 (token déjà
  retiré). Sur erreur transitoire (500/timeout/réseau), on garde le
  token frais → la prochaine navigation re-tentera `api.me()` sans
  déconnecter à tort.

Build OK.
