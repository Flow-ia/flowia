# Message de démarrage — À coller dans Claude Code

> Première session : copie le bloc ci-dessous et colle-le dans le terminal Claude Code.

---

## MESSAGE À COLLER

```

Bonjour Claude Code.

Tu commences la refonte architecturale FlowIA FDS-2026. Tout le matériel est dans `docs/refonte/` + `CLAUDE.md` à la racine du projet.

FlowIA est un SaaS complet de gestion salon/barbershop multi-tenant avec 30+ tables SQL, 5 scopes JWT, 10 rate limiters, 8 crons, OAuth Google, Stripe, webhooks, idempotency, RGPD. Tu ne réécris rien. Tu fais une refonte chirurgicale.

Étape 1 : Lis ces 4 fichiers, dans l'ordre, sans rien coder :
1. `CLAUDE.md` (racine)
2. `docs/refonte/regles-absolues.md`
3. `docs/refonte/INVENTAIRE-FONCTIONNEL.md` (TRÈS LONG, lis tout, c'est la source de vérité)
4. `docs/refonte/onboarding-etape-par-etape.md`

Étape 2 : Ouvre mentalement les 10 maquettes HTML dans `docs/refonte/maquettes/`.

Étape 3 : `git status` → vérifie branche `refonte-archi-v3`. Sinon `git checkout refonte-archi-v3`.

Étape 4 : Commit 0 (cartographie). UNIQUEMENT ce commit. Produit `docs/refonte/CARTOGRAPHIE.md` complet selon les instructions du plan.

Étape 5 : ARRÊTE-TOI. Résume en 5 lignes max ce que tu as trouvé. Attends mon feu vert.

Règles absolues (répétées) :
- Toujours sur `refonte-archi-v3`, jamais `main`
- Un commit à la fois
- Zéro fonctionnalité perdue
- Migrations idempotentes (IF NOT EXISTS), jamais DROP
- Filtre user_id partout
- Ne JAMAIS toucher OAuth Google, Stripe, PIN, webhooks, JWT
- FDS-2026 strict : pas d'emoji, pas de Tailwind, fw≤500, 0.5px bordures
- Apostrophes JSX en double-quote obligatoire
- Si tu doutes, tu demandes

Go.
```

---

## Pour chaque commit suivant

Après validation du commit N, colle :

```
OK validé. Fais UNIQUEMENT le commit N+1 selon le plan dans docs/refonte/onboarding-etape-par-etape.md.

Relis la section correspondante avant de coder. Push sur refonte-archi-v3 et arrête-toi. Ne touche à rien après.
```

---

## Si Claude Code propose quelque chose de risqué

```
Attends. Ne code rien encore. Explique :
1. Fichiers modifiés
2. Lignes changées (avant/après)
3. Risques
4. Rollback

J'attends ta réponse avant de valider.
```

---

## Si le preview Vercel casse

```
Le preview a un problème : [décris].

1. Identifie la cause (sans coder)
2. Propose 2 options de fix
3. Attends ma validation

Jamais de git reset, jamais de force push.
```

---

## Si Claude Code dérive

```
STOP. Relis :
- docs/refonte/regles-absolues.md
- docs/refonte/onboarding-etape-par-etape.md section commit en cours

Puis recommence en te limitant STRICTEMENT au brief du commit.
```

---

## Rappels entre chaque commit (côté propriétaire)

1. Ouvre le preview Vercel de la branche `refonte-archi-v3`
2. Smoke test : login → Dashboard → Agenda → Caisse (test encaissement) → Historique → Clients → fiche → Marketing → Statistiques → Réglages (4 cartes) → Déconnexion
3. Mode dark ON/OFF
4. Valide ou signale le bug
5. Passe au commit suivant

**Backup Supabase obligatoire avant commits 1 et 11** (touchent la BDD).

**Ne jamais merger sur main** avant que les 14 commits soient faits ET validés visuellement.

---

## Rappel des 14 commits

| # | Commit | BDD | Stripe/OAuth |
|---|--------|-----|--------------|
| 0 | Cartographie | Non | Non |
| 1 | Migrations SQL | **Oui** | Non |
| 2 | Routes API user_settings | Non | Non |
| 3 | Sidebar 7 items | Non | Non |
| 4 | Éclatement Settings → 4 pages | Non | Non |
| 5 | Page Marketing | Non | Non |
| 6 | Page Statistiques | Non | Non |
| 7 | Caisse refondue | Non | Non |
| 8 | Page Clients | Non | Non |
| 9 | Dashboard | Non | Non |
| 10 | Agenda polish | Non | Non |
| 11 | Mode tablette | **Oui** (signed_by) | Non |
| 12 | Booking public | Non | Non |
| 13 | Notifications | Non | Non |
| 14 | Polish global | Non | Non |

Aucun commit ne touche OAuth ni Stripe. La seule exception : le commit 11 insère `signed_by_employee_id` sur les transactions créées via PIN (champ déjà créé au commit 1).

---

**Bon courage. 14 commits propres. Zéro régression.**
