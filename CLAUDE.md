# FlowIA — Instructions Claude Code

> Ce fichier est lu par Claude Code à chaque session.

## Mission actuelle : refonte FDS-2026

FlowIA est un SaaS complet de gestion salon/barbershop (RDV, caisse, CRM, marketing, fidélité, parrainage, SMS, IA, tablette partagée, OAuth, RGPD). Tu participes à la **refonte visuelle et architecturale**, PAS à une réécriture.

## Avant toute action

1. Lire `docs/refonte/regles-absolues.md`
2. Lire `docs/refonte/INVENTAIRE-FONCTIONNEL.md` (exhaustif, source de vérité)
3. Lire `docs/refonte/onboarding-etape-par-etape.md` (plan 14 commits)
4. Ouvrir `docs/refonte/maquettes/index.html` dans un navigateur

## Stack

- Backend Node.js/Express + PostgreSQL (Supabase) + JWT + Brevo + Stripe + Cloudinary + Web Push VAPID + PDFKit + clustering
- Frontend React 18 + Vite + React Router 6 + inline styles (pas Tailwind)
- Vercel + Render

## Branche

Push direct sur `main` (validé utilisateur 2026-05-04). La refonte `refonte-archi-v3` reste pour les chantiers visuels en cours.

## Règles critiques

1. **Zéro fonctionnalité perdue** (cocher `INVENTAIRE-FONCTIONNEL.md` au fil des commits)
2. **Un commit par étape** du plan
3. **Migrations SQL idempotentes** (IF NOT EXISTS, jamais DROP)
4. **Filtre user_id partout** (multi-tenant)
5. **Ne jamais toucher** : OAuth Google, PIN, JWT scopes, idempotency, code Stripe SMS existant (`payments.js` + webhook `/api/payments/sms/webhook`). Nouveaux webhooks séparés (Connect, abonnement) AUTORISÉS.
6. **FDS-2026** : pas d'emoji UI, pas de Tailwind, fw≤500, bordures 0.5px, pas de gradients
7. **Apostrophes JSX** : double-quote obligatoire (`{"l'offre"}`)
8. **Pas de `console.*` côté frontend** — `console.log/info/debug/warn/error` interdits dans `frontend/src/**`. Catch silencieux (`catch {}`) si l'erreur n'est pas actionnable, sinon `showToast(msg, 'error')`. Pour le diagnostic, utiliser un breakpoint, pas un log laissé en place.
9. **Pas de `alert()` / `window.confirm()` / `window.prompt()` natifs** — toujours passer par les composants `components/UI.jsx` :
   - Erreurs/info ponctuelles → `showToast(msg, 'error'\|'ok'\|'info')` via `useToast()`
   - Confirmations destructives → `<Confirm open onClose onConfirm title message danger />`
   - Erreurs inline (formulaires) → état local + bloc rouge sous le champ concerné
10. **Robustesse non-négociable** — chaque modification doit tenir sous charge ET dans les états dégradés (réseau lent, API tierce instable, données stale, retry, race conditions). Pas de quick fix qui marche en happy path et casse en prod. Avant de fermer une issue :
    - **Idempotence** sur tout endpoint qui mute (POST/PUT/DELETE) : retry safe, double-clic safe, webhook replay safe (`UNIQUE` index, `ON CONFLICT DO NOTHING/UPDATE`, anti-replay table `processed_stripe_events`).
    - **Atomicité DB** : transactions `BEGIN/COMMIT/ROLLBACK` pour les opérations multi-tables ; INSERT conditionnels `WHERE NOT EXISTS` pour éviter les doublons en course.
    - **Auto-réparation** des états incohérents : si une row DB pointe vers une ressource externe disparue (Stripe customer, Brevo contact, etc.), on cleanup + recrée transparent (cf. `client_connected_customers` retry).
    - **Try/catch granulaire** par étape critique avec messages distincts (`[ETAPE_X]` log + erreur claire au client). Pas de catch global qui masque l'origine.
    - **Validation aux limites** : tout input externe (body, query, params, JWT) revalidé côté serveur, jamais confiance au front. Filtre `user_id` et scope JWT obligatoire sur tout SELECT/UPDATE multi-tenant.
    - **Consistance éventuelle** des APIs tierces (Stripe Search, Brevo, Cloudinary) : ne jamais lire après un write immédiat ; passer par DB locale comme source de vérité, ré-essayer 1× sur erreur transitoire (`No such X`, `rate_limited`, timeout).
    - **Anti-race-condition** sur les ressources partagées : créneaux RDV (INSERT conditionnel), customers Stripe (UNIQUE + ON CONFLICT), tokens unsubscribe (UNIQUE).
    - **Fail-safe gracieux** : si un side-effect non-critique échoue (notification push, email confirmation), log + continue, ne casse pas le flow principal. Les opérations financières (Stripe payments, fidélité) ne sont JAMAIS fail-safe — elles doivent réussir ou rollback.
    - **Rate-limit** sur les endpoints publics et auth (déjà 10 limiters express) — toute nouvelle route exposée doit en avoir un.
    - **Pas de `Promise.all` sans `allSettled`** quand une partie peut échouer sans casser le tout.
    - **Sleep absolument interdit** comme workaround de timing. Utiliser des locks DB, des INSERT atomiques, ou des polling avec timeout explicite.
11. **Si tu doutes, tu demandes**

## Complexité à connaître

- `App.jsx`, `Settings.jsx` très gros (3000+ lignes)
- 13+ onglets Settings monolithiques à éclater en 4 pages
- 5 scopes JWT différents (merchant, pin_session, employee_pin_session, client, global_client)
- 10 rate limiters express dédiés
- 8 crons worker 1 uniquement
- Idempotency transactions + SMS Stripe
- RGPD : anonymisation NULL (pas DROP), soft delete 30j, export JSON
- Caps métier stricts (fidélité, parrainage)
- Anti-fraude anniversaire rolling 330j
- Quota Brevo 300/j global cluster-safe

## Workflow par commit

1. Lire section du plan
2. Backup git si risqué (`git branch backup-avant-commit-X`)
3. Modifier chirurgicalement (pas de réécriture massive)
4. Push sur `refonte-archi-v3`
5. Attendre Vercel preview
6. Smoke test sur preview
7. Arrêter, signaler à l'utilisateur
8. Attendre validation avant commit suivant

## Ce que tu ne fais JAMAIS

- `git push --force`, `git reset --hard`, `git revert` sans validation
- Supprimer du code mort
- Ajouter une lib npm sans demander
- Toucher OAuth Google commit `c73c4cf`
- Modifier le webhook Stripe SMS existant (`/api/payments/sms/webhook`)
- Envoyer de vrai SMS/email en test (utiliser mode test)

## Commerçant actuel

Hair Coiff Lille, barbershop homme à Lille. Adapter les textes : "votre barbier", jamais "votre coiffeuse".

## Préférences utilisateur

- Windows + VS Code + Claude Code terminal
- Valide rarement en local, teste via déploiement Vercel/Render
- Réponses courtes et directes, briefs concis
- Refuse auth email individuelle employé (choix : tablette partagée + PIN)

---

**Début de session** : lis les 3 docs ci-dessus, confirme ta compréhension, attends le feu vert avant de coder.
