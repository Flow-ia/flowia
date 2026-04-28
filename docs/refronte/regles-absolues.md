# Règles absolues — FlowIA Refonte FDS-2026

> **Ces règles sont NON-NÉGOCIABLES. Aucune exception, aucune dérogation.**
> Claude Code doit les relire en début de chaque session.

---

## Les 7 règles d'or

### 1. Zéro fonctionnalité perdue
Chaque case de `INVENTAIRE-FONCTIONNEL.md` doit être préservée. Avant tout refactor, Claude Code lit le code actuel, identifie toutes les fonctions, endpoints, composants, modales, flags, puis les mappe dans la nouvelle architecture. **Si tu hésites, tu le signales, tu ne supprimes rien**.

### 2. Un commit à la fois sur `refonte-archi-v3`
Pas de commit qui mélange "sidebar + settings + caisse". Chaque commit fait **une seule chose**. Jamais sur `main`. Jamais de `git push --force`. Jamais de `git reset --hard`.

### 3. Migrations SQL idempotentes, jamais destructives
**Interdits absolus** :
- `DROP COLUMN`, `DROP TABLE`, `RENAME COLUMN`, `RENAME TABLE`, `TRUNCATE`
- `DELETE FROM` sans filtre `user_id`

**Autorisés** :
- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `UPDATE ... WHERE user_id = X AND ...`

**Backup BDD dev obligatoire avant chaque migration.**

### 4. Filtre `user_id` dans TOUTES les requêtes SQL
FlowIA est strictement multi-tenant. Chaque requête SQL métier a un `WHERE user_id = ?`. Sans exception. Si tu trouves une requête sans filtre, tu le signales (bug sécurité), tu ne fais rien sans validation.

### 5. Ne JAMAIS toucher aux flux sensibles
- **Google OAuth** commerçant (`/api/auth/google/merchant/callback`) et client global (`/api/auth/google/callback`)
- **Stripe** (abonnement + recharge SMS + PaymentIntent + webhooks + idempotency)
- **PIN** (admin + employé : hash, vérif, rate limit, lockout DB, sessions JWT)
- **JWT multi-scope** (merchant, pin_session, employee_pin_session, client, global_client)
- **Idempotency** transactions et SMS

Tu peux **ajouter** de nouvelles routes. Tu ne modifies pas l'existant sans validation explicite.

### 6. Design FDS-2026 strict
- **Pas d'emoji** dans l'UI (conservés uniquement dans push lock-screen OS et SMS clients si déjà présents dans templates)
- **Pas de Tailwind** — inline styles React (le code existant utilise inline styles, on respecte)
- **`fontWeight` max 500** — jamais 600, 700, 800
- **Bordures `0.5px solid #e5e7eb`** — jamais `1px`
- **Pas de gradients** — pas d'ombres colorées
- **Icônes SVG Lucide inline** (`I.*`)
- **`borderLeft 2px`** pour accents
- **`borderRadius 12`** pour cards principales
- **Apostrophes françaises** dans JSX : toujours double-quote l'attribut (`{"l'offre"}`, pas `'l'offre'`). Sinon Vercel build fail.

### 7. Si tu doutes, tu demandes
La règle la plus importante. Aucune supposition silencieuse. Claque-toi l'idée d'improviser.

---

## Règles techniques détaillées

### Multi-tenant
- Toutes les tables métier ont `user_id` FK. Scope tous SELECT/INSERT/UPDATE/DELETE.
- `UNIQUE(user_id, email)` sur `client_accounts`.
- Routes publiques `/api/pub/:slug/*` résolvent le merchant via slug.

### Token scopes (5 types)
Ne jamais mélanger :
- merchant (scope vide)
- pin_session (admin PIN)
- employee_pin_session (employé PIN)
- client (client interne scoped user_id)
- global_client (client multi-commerces)

### Rate limiters
Respecter les 10 limiters existants. Ne pas en retirer. Si tu en ajoutes pour une nouvelle route, documente.

### Idempotency
- Transactions : `UNIQUE(user_id, idempotency_key)` → double-clic = même UUID
- SMS Stripe : `UNIQUE(sumup_checkout_id) WHERE NOT NULL` → un crédit par PaymentIntent

### Audit trail
Toute écriture sur `transactions` insère dans `transaction_audit_log` avec `snapshot_before/after` JSONB.

### Caches
5-10 min sur stats et transactions. **Invalidation obligatoire** après chaque écriture.

### Cron worker 1 only
Toutes les tâches planifiées : test `isWorker1` avant d'exécuter. Sinon doublons.

### RGPD
- `consent_at`, `consent_ip` à l'inscription
- `marketing_opt_in_at` horodaté
- `unsubscribe_token` UUID 1-clic
- Soft delete 30j global_clients
- Anonymisation email/name → NULL (pas DROP COLUMN)
- Export JSON `/me/export`

### Caps métier (interdit de dépasser)
- Fidélité : 100 tampons / 100% / 500€ / 100 pts/€ / 3650j / 10000€
- Parrainage : percent ≤ 100 / fixed ≤ 500€ / limit ≤ 10000

### Anti-fraude
- Anniversaire rolling 330j (pas année calendaire)
- PIN employé lockout DB 30 min après 5 échecs

### Commit messages
Français, format : `[commit N] <action courte>`

### Routing front
- Redirects obligatoires pour ne pas casser les URLs existantes
- `safeInternalPath` pour deep-links (reject `javascript:`, `data:`, `//evil`)

### Upload images
- Whitelist `image/jpeg|png|webp|gif` uniquement (pas `image/*`)
- 5 Mo max
- Erreurs inline rouge fw500 11px

### Apostrophes JSX
**CRITIQUE** : toute chaîne JSX contenant `'` française doit être en double-quote ou échappée, sinon Vercel build fail.

Bon : `<p>{"L'offre"}</p>` ou `<p>L&apos;offre</p>`
Mauvais : `<p>'L'offre'</p>`

---

## Ce que Claude Code ne fait JAMAIS sans validation

- Réécrire un gros fichier (App.jsx, Settings.jsx) en une seule fois
- Toucher à `authMiddleware`, `pinAdminMiddleware`, `employeePinOptional`
- Modifier le flow OAuth Google (commit c73c4cf)
- Toucher au webhook Stripe, aux PaymentIntents
- Casser les URLs existantes sans redirect
- Supprimer du code mort sans confirmation
- Ajouter une lib npm sans demander
- `git push` sur `main`
- `git revert` ou `git reset` sans validation
- Envoyer un vrai SMS ou un vrai email en test (utiliser mode test Brevo/Stripe)

---

## Ce que Claude Code fait TOUJOURS

1. Lit `regles-absolues.md` et `INVENTAIRE-FONCTIONNEL.md` en début de session
2. `git status` → vérifie qu'il est sur `refonte-archi-v3`
3. Un commit par étape du plan `onboarding-etape-par-etape.md`
4. Smoke test sur preview Vercel après chaque push
5. Valide avec l'utilisateur avant de continuer
6. Demande quand il doute (règle 7)
7. Preserve toutes les règles métier et caps
8. Respecte le design FDS-2026
9. Teste en dev avant de merger sur main (jamais pendant la refonte)

---

## 5 règles à retenir si tu n'en lis qu'une

1. **Zéro fonctionnalité perdue** (inventaire exhaustif obligatoire)
2. **Un commit à la fois sur `refonte-archi-v3`** (jamais `main`)
3. **Migrations SQL idempotentes, jamais `DROP`**
4. **Filtre `user_id` partout**
5. **Si tu doutes, tu demandes**

Ces 5 règles garantissent zéro régression.
