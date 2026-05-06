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
10. **Si tu doutes, tu demandes**

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
