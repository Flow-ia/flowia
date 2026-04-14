# Guide de déploiement FlowIA
## Stack : Vercel (frontend) + Render (backend + PostgreSQL) + Domaine amen.fr

---

## ÉTAPE 1 — Préparer ton dépôt GitHub

1. Crée un compte sur https://github.com (si pas encore fait)
2. Crée un nouveau dépôt **privé** : `flowia`
3. Dans ton terminal local :

```bash
cd flowFinances-patched
git init
git add .
git commit -m "Initial commit FlowIA"
git remote add origin https://github.com/TON_USERNAME/flowia.git
git push -u origin main
```

---

## ÉTAPE 2 — Base de données PostgreSQL sur Supabase

1. Aller sur https://supabase.com → **Start for free**
2. **New project** → nom : `flowia` → choisir un mot de passe fort → région : **West EU (Ireland)**
3. Attendre 2 minutes que le projet se crée
4. Aller dans **Settings → Database → Connection string → URI**
5. Copier l'URL : `postgresql://postgres:[MOT_DE_PASSE]@db.xxx.supabase.co:5432/postgres`
6. ⚠️ Garder cette URL — elle sera collée dans Render à l'étape suivante

---

## ÉTAPE 3 — Backend sur Render

1. Aller sur https://render.com → **Get Started for Free**
2. **New → Web Service**
3. Connecter ton compte GitHub et choisir le dépôt `flowia`
4. Configurer :
   - **Name** : `flowia-backend`
   - **Root Directory** : `backend`
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : `Free`
5. Dans **Environment Variables**, ajouter ces valeurs :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | L'URL Supabase copiée à l'étape 2 |
| `NODE_ENV` | `production` |
| `PORT` | `5000` |
| `JWT_SECRET` | Générer sur https://generate-secret.vercel.app/64 |
| `FRONTEND_URL` | `https://flowia.vercel.app` (à mettre à jour après étape 4) |
| `APP_NAME` | `FlowIA` |
| `WEB_CONCURRENCY` | `1` |
| `DB_POOL_MAX` | `25` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `ton@gmail.com` |
| `SMTP_PASS` | Mot de passe d'application Gmail |
| `CLOUDINARY_CLOUD_NAME` | Depuis ton compte Cloudinary |
| `CLOUDINARY_API_KEY` | Depuis ton compte Cloudinary |
| `CLOUDINARY_API_SECRET` | Depuis ton compte Cloudinary |
| `VAPID_PUBLIC_KEY` | Générer : `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Même commande |
| `VAPID_EMAIL` | `mailto:ton@email.com` |

6. Cliquer **Create Web Service** → attendre le déploiement (~3 min)
7. Copier l'URL : `https://flowia-backend.onrender.com`

---

## ÉTAPE 4 — Frontend sur Vercel

1. Aller sur https://vercel.com → **Sign Up with GitHub**
2. **New Project** → importer le dépôt `flowia`
3. Configurer :
   - **Root Directory** : `frontend`
   - **Framework Preset** : `Vite`
   - **Build Command** : `npm run build`
   - **Output Directory** : `dist`
4. Dans **Environment Variables** ajouter :
   - `VITE_API_URL` = `https://flowia-backend.onrender.com/api`
5. Cliquer **Deploy** → attendre ~2 min
6. Ton frontend est en ligne sur `https://flowia-xxx.vercel.app`

---

## ÉTAPE 5 — Nom de domaine amen.fr

1. Acheter `flowia.fr` (ou ton choix) sur https://www.amen.fr
2. Dans **amen.fr → Gestion DNS → Zone DNS**, ajouter :

```
Type    Nom       Valeur                          TTL
CNAME   app       cname.vercel-dns.com            3600
CNAME   api       flowia-backend.onrender.com     3600
```

3. Dans **Vercel → Settings → Domains** : ajouter `app.flowia.fr`
4. Dans **Render → Settings → Custom Domains** : ajouter `api.flowia.fr`
5. Dans Render, mettre à jour `FRONTEND_URL` → `https://app.flowia.fr`
6. Dans Vercel, mettre à jour `VITE_API_URL` → `https://api.flowia.fr/api`
7. Attendre 10-30 min que les DNS se propagent

---

## ÉTAPE 6 — Empêcher Render de s'endormir (UptimeRobot)

1. Aller sur https://uptimerobot.com → **Register for FREE**
2. **Add New Monitor** :
   - Type : `HTTP(s)`
   - URL : `https://api.flowia.fr/api/health`
   - Interval : `5 minutes`
3. Cliquer **Create Monitor**

L'API ne s'endormira plus. ✓

---

## ÉTAPE 7 — Redéploiement automatique

À chaque `git push main`, Render et Vercel se mettent à jour automatiquement :

```bash
# Modifier du code, puis :
git add .
git commit -m "fix: description"
git push main
# → Vercel rebuild en 45s
# → Render redémarre en 30s
```

---

## Résumé des URLs

| Usage | URL |
|---|---|
| Site de réservation client | `https://app.flowia.fr/book/TON_SLUG` |
| Interface admin commerçant | `https://app.flowia.fr` |
| API backend | `https://api.flowia.fr/api/health` |
| Dashboard Supabase (DB) | `https://app.supabase.com` |
| Dashboard Render (backend) | `https://dashboard.render.com` |
| Dashboard Vercel (frontend) | `https://vercel.com/dashboard` |
| Dashboard UptimeRobot | `https://uptimerobot.com/dashboard` |

---

## Coût total

| Service | Prix |
|---|---|
| Vercel | 0 € |
| Render | 0 € |
| Supabase | 0 € |
| UptimeRobot | 0 € |
| Domaine amen.fr | ~8–10 €/an |
| **Total** | **~8–10 €/an** |
