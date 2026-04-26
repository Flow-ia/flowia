# Conformité désinscription marketing — FlowIA

> Audit RGPD désinscription marketing. Posé au commit 26.

## Cadre légal

- **RGPD art. 7-3** — droit de retirer son consentement à tout moment, aussi facilement qu'il a été donné
- **LCEN art. L34-5** — opposition gratuite et simple à la prospection électronique
- **CNIL délibération 2020-091** — opt-in préalable pour la prospection commerciale + lien de désabonnement obligatoire dans chaque message
- **Loi Informatique et Libertés art. 38** — droit d'opposition

## Architecture

1. **Token UUID** stocké sur `client_accounts.unsubscribe_token` et `global_clients.unsubscribe_token` (généré à la création).
2. **Lien dans chaque message marketing** :
   - Email : footer HTML via `backend/src/utils/unsubscribe.js → unsubscribeEmailHtml(token)`
   - SMS : ligne `Stop: <url>` via `backend/src/utils/unsubscribe.js → appendUnsubscribeSms(msg, token)`
   - URL : `${FRONTEND_PUBLIC_URL}/unsubscribe?token=<uuid>` (page React FDS-2026) avec fallback `${BACKEND_PUBLIC_URL}/api/pub/unsubscribe/:token` (HTML inline) si la variable n'est pas définie.
3. **Page React `/unsubscribe?token=...`** (`frontend/src/pages/unsubscribe/Unsubscribe.jsx`) — au mount, appelle `GET /api/pub/unsubscribe/:token` avec `Accept: application/json`. Affiche le résultat (succès, déjà désinscrit, lien invalide, erreur). Bouton « Me réinscrire aux offres » qui appelle `GET /api/pub/opt-in/:token`.
4. **Endpoint backend `GET /api/pub/unsubscribe/:token`** (`backend/src/routes/public-booking/marketing.js`) :
   - Valide le token (UUID v4)
   - `UPDATE client_accounts SET marketing_opt_in=FALSE, marketing_opt_in_at=NULL` puis idem `global_clients`
   - `INSERT marketing_optout_log` (audit, voir ci-dessous)
   - Retourne JSON ou HTML selon `Accept` header (rétrocompat anciens emails)
   - Effet immédiat, pas d'authentification requise (token = preuve d'identité)
5. **Endpoint backend `GET /api/pub/opt-in/:token`** — pendant pour le réabonnement 1-clic.

## Table d'audit `marketing_optout_log`

```sql
id                UUID PRIMARY KEY
user_id           UUID                         -- commerçant si déterminable
client_account_id UUID                         -- nullable
global_client_id  UUID                         -- nullable
email             VARCHAR(255)                 -- email à l'instant T
source            VARCHAR(20) DEFAULT 'email_link'
                  CHECK IN ('email_link','sms_link','admin_action','public_form','api')
ip                VARCHAR(64)
user_agent        TEXT
created_at        TIMESTAMPTZ DEFAULT NOW()
```

**Pas de FK** : préserve la trace même après suppression RGPD du client (anonymisation NULL).
**Pas de dédoublonnage** : 2 clics = 2 lignes (chaque tentative est une preuve indépendante).

## Statistiques utiles pour audit CNIL

```sql
-- Volume désinscription par canal sur 30 jours
SELECT source, COUNT(*) AS nb
  FROM marketing_optout_log
 WHERE created_at >= NOW() - INTERVAL '30 days'
 GROUP BY source
 ORDER BY nb DESC;

-- Vérifier qu'un email donné a bien été désinscrit
SELECT email, source, ip, created_at
  FROM marketing_optout_log
 WHERE LOWER(email) = LOWER('client@example.com')
 ORDER BY created_at DESC;

-- Cohérence : aucun client marketing_opt_in=TRUE ne doit avoir de log récent
SELECT ca.email, ca.marketing_opt_in, ca.marketing_opt_in_at,
       (SELECT MAX(created_at) FROM marketing_optout_log WHERE email=ca.email) AS last_optout
  FROM client_accounts ca
 WHERE ca.marketing_opt_in = TRUE
   AND EXISTS (SELECT 1 FROM marketing_optout_log WHERE email=ca.email);
-- Si non vide → un client s'est réinscrit après désinscription (légitime).
```

## Checklist conformité d'un nouveau template email marketing

Avant de merger un nouveau type d'email marketing, vérifier :

- [ ] Le template accepte un paramètre `unsubscribeToken`
- [ ] Le footer HTML inclut `${require('./unsubscribe').unsubscribeEmailHtml(unsubscribeToken)}`
- [ ] Le call-site SELECT `unsubscribe_token` dans la requête client
- [ ] Le call-site passe `unsubscribeToken: client.unsubscribe_token` au sender
- [ ] Le header `List-Unsubscribe` est présent (RFC 8058 + RFC 2369) avec l'URL backend (1-clic) en priorité, mailto STOP en fallback
- [ ] Le test smoke envoie un mail réel et vérifie que le clic sur le lien désinscrit bien le client
- [ ] La table `marketing_optout_log` reçoit bien la nouvelle ligne (qui/quand/comment)

Pour un nouveau template SMS :

- [ ] Le message passe par `appendUnsubscribeSms(msg, token)` avant `sendSMS`
- [ ] La mention `Stop: <url>` est visible dans le message envoyé
- [ ] Source loggée comme `'sms_link'` (passer `?source=sms_link` dans l'URL ou laisser le default `email_link` selon canal)

## Templates email marketing actuels (audit complet)

| Fonction | Fichier | Footer unsub | Status |
|---|---|---|---|
| `sendBirthdayPromo` | `backend/src/utils/email.js` | ✓ via param `unsubscribeToken` | OK |
| `sendPromoEmail` | `backend/src/utils/email.js` | ✓ ajouté commit 26 | OK |
| `sendReferralReward` | `backend/src/utils/email.js` | ✓ ajouté commit 26 | OK |
| `sendMarketingEmail` | `backend/src/utils/emailSender.js` | ✓ via param `unsubscribeToken` | OK |

Templates **transactionnels** (pas de footer requis car non marketing) : `sendVerificationEmail`, `sendAppointmentConfirmation`, `sendDailyRecap`, `sendRdvReminder`, `sendLoyaltyReward`, `sendClientInvite`, `sendAppointmentCancellation`, `sendEmployeeReminder`, `sendPasswordReset`, `sendReferralWelcome`, `sendOptInInvite`, `sendNewAppointmentMerchant`.

## Variables d'environnement

- `FRONTEND_PUBLIC_URL` (recommandée) : URL de l'app React, ex `https://hair-coiff-lille.vercel.app`. Si définie, les liens unsubscribe pointent vers `/unsubscribe?token=...` (page FDS-2026).
- `BACKEND_PUBLIC_URL` (obligatoire) : URL Render du backend, ex `https://flowia.onrender.com`. Sert au fallback HTML inline.

Sans `FRONTEND_PUBLIC_URL`, le système reste fonctionnel : les liens pointent vers le backend qui rend une page HTML autonome.

## Note de cleanup futur

Le dossier `docs/refronte/` contient un typo historique (« refronte » au lieu de « refonte »). Tous les liens internes des docs pointent vers ce chemin. Un commit dédié pourra renommer en bloc si besoin, sans urgence.
