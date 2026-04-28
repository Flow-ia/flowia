# ENV_SETUP — Variables d'environnement FlowIA

Ce document liste les variables d'environnement à configurer pour chaque
service en production. La plupart sont déjà en place. Cette section ne
détaille que les ajouts récents.

## Sentry — observabilité prod (commit 29)

Sentry est intégré côté backend (Node) et frontend (React/Vite). Si les
DSN ne sont pas définies, l'application démarre normalement — l'observabilité
est juste désactivée (graceful fallback). Les deux DSN sont **optionnelles**.

### 1. Créer le compte Sentry et les projets

1. Inscription sur https://sentry.io (plan **Developer / Free** : 5 000 events/mois — suffisant pour Hair Coif Lille)
2. Créer une organisation (ex : `flowia`)
3. Créer **2 projets** :
   - Plateforme **Node.js** → nommer `flowia-backend`
   - Plateforme **React** → nommer `flowia-frontend`
4. Pour chaque projet : Settings → Client Keys (DSN) → copier le DSN public
   (format `https://<hash>@oXXX.ingest.sentry.io/XXXX`)

### 2. Render — backend (`flowia-backend.onrender.com`)

Render Dashboard → service `flowia-backend` → Environment → ajouter :

| Variable | Valeur | Effet si vide |
|---|---|---|
| `SENTRY_DSN_BACKEND` | DSN du projet Sentry `flowia-backend` | Aucune capture, log warning au démarrage |

Render redéploie automatiquement après ajout de la variable. Au démarrage,
les logs doivent afficher :
```
[Sentry] backend init OK (env=production, release=flow-finances-backend@1.0.0)
```

### 3. Vercel — frontend (`commercant.haircoifflille.fr`, etc.)

Vercel Dashboard → projet `flowia` (frontend merchant) → Settings →
Environment Variables → ajouter pour **Production** (et Preview si voulu) :

| Variable | Valeur | Effet si vide |
|---|---|---|
| `VITE_SENTRY_DSN_FRONTEND` | DSN du projet Sentry `flowia-frontend` | Aucune capture côté navigateur |

Important : Vercel ne rebuild **pas** automatiquement sur changement d'env
var → faire un **Redeploy** manuel (Deployments → ⋯ → Redeploy) pour que
la variable soit injectée dans le bundle Vite.

> Note : si tu as aussi un projet Vercel séparé pour `admin.haircoifflille.fr`,
> tu peux y ajouter la même variable (mais le panel admin a peu de surface
> d'erreur côté navigateur — non prioritaire).

### 4. Tester la capture

#### Backend
Une fois `SENTRY_DSN_BACKEND` configuré et le backend redéployé, faire un
appel authentifié (token merchant valide) sur :

```
GET https://flowia-backend.onrender.com/api/_sentry-test
```

La requête retourne 500. L'erreur apparaît dans Sentry → projet
`flowia-backend` → Issues, sous le titre :
> Error: Sentry backend test — déclenchement volontaire (commit 29)

#### Frontend
Ouvrir la console navigateur sur `commercant.haircoifflille.fr` et exécuter :

```js
throw new Error('Sentry frontend test — manuel');
```

L'erreur apparaît dans Sentry → projet `flowia-frontend` → Issues.

### 5. RGPD — ce qui n'est PAS envoyé à Sentry

Configuration stricte côté backend ET frontend. Sentry ne reçoit **pas** :

- Le **body** des requêtes HTTP (peut contenir noms, emails, données client)
- Les headers `Authorization`, `Cookie`, `x-pin-session`, `x-employee-pin`
- Les **cookies**
- Les **variables d'environnement** (`process.env` complet n'est pas attaché)
- L'**adresse IP** du visiteur (`sendDefaultPii: false`)
- Les **session replays** vidéo (côté frontend : `replaysSessionSampleRate: 0`)
- Les **DOM snapshots**

Un `beforeSend` scrub en plus les emails et numéros de téléphone qui auraient
fuité dans une `error.message` (défense en profondeur).

### 6. Quota et coût

- **Free tier** : 5 000 errors + 10 000 performance events / mois
- `tracesSampleRate: 0.1` (10 %) côté backend ET frontend → on plafonne à
  ~1k requêtes tracées/jour, largement sous le quota
- Si on dépasse : Sentry coupe la capture jusqu'au mois suivant. Pas de
  facturation surprise.
- Suivre l'usage : Sentry → Stats → Usage
