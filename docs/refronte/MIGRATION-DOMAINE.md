# Migration de domaine — Procédure complète

> Exemple : `haircoifflille.fr` → `flow-ia.fr`. La logique vaut pour tout autre domaine cible.

Le code frontend résout l'origine publique via `VITE_PUBLIC_BOOKING_ORIGIN` (cf. `frontend/src/utils/publicUrl.js`). Tant que cette variable pointe sur le bon domaine, **aucune modification de code n'est nécessaire** pour migrer.

---

## 1. DNS et hébergement

- Acheter `flow-ia.fr` (registrar OVH/Gandi/Namecheap…).
- Pointer les enregistrements vers les hébergeurs :
  - `flow-ia.fr` (apex) → `A` Vercel + `CNAME www` Vercel.
  - `commercant.flow-ia.fr` → `CNAME` Vercel (sous-domaine admin).
  - `api.flow-ia.fr` (si utilisé) → `CNAME` Render.
- SSL : Vercel et Render gèrent automatiquement Let's Encrypt — vérifier l'émission après propagation DNS (24-48h max).
- Vercel → Settings → Domains : ajouter `flow-ia.fr`, `www.flow-ia.fr`, `commercant.flow-ia.fr` (ou wildcard `*.flow-ia.fr` si plusieurs sous-domaines admin envisagés).

## 2. Variable Vercel (côté frontend)

Sur le projet Vercel FlowIA → Settings → Environment Variables :

```
VITE_PUBLIC_BOOKING_ORIGIN = https://flow-ia.fr
```

À mettre sur les trois environnements : **Production**, **Preview**, **Development**.

(Optionnel) `VITE_BOOKING_DOMAIN = flow-ia.fr` et `VITE_COMMERCANT_DOMAIN = commercant.flow-ia.fr` si la détection de host dans `index.jsx` est utilisée.

## 3. Backend Render

Mettre à jour les variables Render :

- `ALLOWED_ORIGINS` → ajouter `https://flow-ia.fr`, `https://www.flow-ia.fr`, `https://commercant.flow-ia.fr` (garder l'ancien le temps de la transition).
- `GOOGLE_REDIRECT_URI` → `https://flow-ia.fr/api/auth/google/callback` (ou `commercant.flow-ia.fr` selon le flow).
- Tout autre endroit où `haircoifflille.fr` est hardcodé (templates email, SMS, PDF). Grep côté `backend/`.

## 4. Google Cloud Console — OAuth

Console → APIs & Services → Credentials → OAuth 2.0 Client :

- **Authorized JavaScript origins** : ajouter `https://flow-ia.fr`, `https://commercant.flow-ia.fr`.
- **Authorized redirect URIs** : ajouter `https://flow-ia.fr/api/auth/google/callback` (et `commercant.flow-ia.fr/...` selon le flow).
- Garder les anciens `haircoifflille.fr` actifs pendant la période de transition.

## 5. Force redeploy

- Vercel → trigger deploy (variables d'env nécessitent un rebuild Vite pour être inlinées).
- Render → restart service après mise à jour des variables.

## 6. Période de transition (30 jours minimum)

- Garder `haircoifflille.fr` actif avec **redirect 301** vers `flow-ia.fr` (côté DNS/Vercel ou middleware Express).
- Communiquer aux clients par SMS/email : nouveau lien.
- Mettre à jour les supports physiques : QR vitrine, cartes, flyers (regénérer via Réglages → QR code).
- Surveiller les logs 404 et les erreurs OAuth pendant 2 semaines.

## 7. Coût en code

**Zéro modification source.** Le seul changement est la valeur de `VITE_PUBLIC_BOOKING_ORIGIN` sur Vercel + l'ajout des nouveaux domaines aux variables d'env Render et Google OAuth.
