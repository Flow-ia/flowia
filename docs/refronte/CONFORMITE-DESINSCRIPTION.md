# Conformité désinscription marketing — FlowIA

> Audit RGPD désinscription marketing. Posé au commit 26.

## Cadre légal

- **RGPD art. 7-3** — droit de retirer son consentement à tout moment, aussi facilement qu'il a été donné
- **LCEN art. L34-5** — opposition gratuite et simple à la prospection électronique
- **CNIL délibération 2020-091** — opt-in préalable pour la prospection commerciale + lien de désabonnement obligatoire dans chaque message
- **Loi Informatique et Libertés art. 38** — droit d'opposition

## Architecture en 2 chemins distincts (commit 27)

Pour réconcilier deux exigences contradictoires — **éviter les désinscriptions accidentelles** (prefetch Gmail, bots, clic involontaire) et **préserver le 1-clic Gmail/Apple Mail RFC 8058** (délivrabilité) — on émet **deux URLs distinctes** par message marketing :

| Chemin | Audience | URL émise | Comportement |
|---|---|---|---|
| **1. Lien email cliquable** (footer HTML) | Client humain qui clique le lien dans l'email | `${FRONTEND_PUBLIC_URL}/unsubscribe?token=...` (page React) ou fallback `${BACKEND_PUBLIC_URL}/api/pub/unsubscribe/:token` | **2 étapes** : page de confirmation avec aperçu des avantages perdus + bouton « Confirmer ». Source `public_form` dans le log. |
| **2. Header `List-Unsubscribe`** (RFC 2369 + 8058) | Bouton « Se désabonner » intégré dans Gmail/Apple Mail à côté de l'expéditeur | TOUJOURS `${BACKEND_PUBLIC_URL}/api/pub/unsubscribe/:token` (jamais frontend) | **1-clic immédiat** : flip + log `email_link`. Compatible POST One-Click Gmail. Préserve la délivrabilité. |

**Ce sont deux URLs volontairement différentes selon le contexte d'usage.** Côté backend, `unsubscribeHeaders()` force l'URL backend ; `unsubscribeUrl()` (utilisé dans les footers HTML) privilégie la frontend.

## Endpoints backend

| Méthode | Route | Effet | Source log | Usage |
|---|---|---|---|---|
| GET | `/api/pub/unsubscribe-preview/:token` | Lecture seule (aucun UPDATE, aucun log) | – | Page React au mount |
| POST | `/api/pub/unsubscribe-confirm/:token` | UPDATE + log (si pas déjà désinscrit) | `public_form` | Bouton « Confirmer » de la page React |
| GET | `/api/pub/unsubscribe/:token` | UPDATE + log immédiat (1-clic) | `email_link` (default) ou `?source=sms_link` | Header List-Unsubscribe + anciens emails (rétrocompat) |
| GET | `/api/pub/opt-in/:token` | UPDATE marketing_opt_in=TRUE | – | Réabonnement 1-clic |

**Token UUID** stocké sur `client_accounts.unsubscribe_token` et `global_clients.unsubscribe_token` (généré à la création, backfillé si NULL — cf. `backend/src/db/index.js:1218`).

## Page React `/unsubscribe?token=...` (5 états)

`frontend/src/pages/unsubscribe/Unsubscribe.jsx` — design FDS-2026 (card 480px, border 0.5px, fw 500, icônes Lucide).

1. **LOADING** — spinner pendant `GET /unsubscribe-preview/:token`
2. **CONFIRM** — `already_unsubscribed=false` : icône ambre + bloc « Vous perdrez vos avantages exclusifs » (anniversaire / parrainage / fidélité) + 2 boutons « Annuler » et « Confirmer le désabonnement »
3. **ALREADY** — `already_unsubscribed=true` : icône bleue + message « Vous êtes déjà désinscrit » + bouton « Me réinscrire »
4. **SUCCESS** — après POST réussi : icône verte + email confirmé + boutons « Me réinscrire maintenant » et « Retour à l'accueil »
5. **INVALID** — token KO ou erreur réseau : icône ambre + bouton mailto vers le commerçant si `business_email` connu

Le bouton « Me réinscrire » appelle `GET /api/pub/opt-in/:token` (route 1-clic existante, inchangée).

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

| Fonction / chemin | Fichier | Footer unsub | Headers `List-Unsubscribe` | Status |
|---|---|---|---|---|
| `sendBirthdayPromo` | `backend/src/utils/email.js` | ✓ `marketingFooterHtml` | ✓ `unsubscribeHeaders` (commit 26b) | OK |
| `sendPromoEmail` | `backend/src/utils/email.js` | ✓ `marketingFooterHtml` (commit 26b — STOP en objet retiré) | ✓ `unsubscribeHeaders` | OK |
| `sendReferralReward` | `backend/src/utils/email.js` | ✓ `marketingFooterHtml` (commit 26b) | ✓ `unsubscribeHeaders` (commit 26b) | OK |
| `sendMarketingEmail` | `backend/src/utils/emailSender.js` | ✓ `marketingFooterHtml` (commit 26b) | ✓ `unsubscribeHeaders` (commit 26b) | OK |
| `processCampaignQueue` (cron worker email différé) | `backend/src/index.js` | ✓ injection footer post-fetch + JOIN `client_accounts.unsubscribe_token` (commit 26b) | ✓ `unsubscribeHeaders` (commit 26b) | OK |
| `processSmsQueue` (cron worker SMS différé) | `backend/src/index.js` | ✓ `appendUnsubscribeSms` + JOIN (commit 26b) | n/a (SMS) | OK |

Templates **transactionnels** (pas de footer requis car non marketing) : `sendVerificationEmail`, `sendAppointmentConfirmation`, `sendDailyRecap`, `sendRdvReminder`, `sendLoyaltyReward`, `sendClientInvite`, `sendAppointmentCancellation`, `sendEmployeeReminder`, `sendPasswordReset`, `sendReferralWelcome`, `sendOptInInvite`, `sendNewAppointmentMerchant`, rappels RDV 24h/2h cron (`backend/src/index.js`).

## Helpers unifiés (`backend/src/utils/unsubscribe.js`)

| Helper | Usage |
|---|---|
| `unsubscribeUrl(token)` | URL canonique (frontend si `FRONTEND_PUBLIC_URL`, sinon backend) |
| `appendUnsubscribeSms(msg, token)` | Append `Stop: <url>?source=sms_link` (RGPD SMS) |
| `marketingFooterHtml({ token, businessName, businessEmail, context })` | Footer HTML complet — 1-clic prioritaire, mailto STOP fallback, log warning si rien |
| `marketingFooterText({ token, businessEmail })` | Version text/plain (Gmail Primary Inbox) |
| `unsubscribeHeaders({ token, businessEmail, refId })` | Headers `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 2369 + RFC 8058) + `X-Entity-Ref-ID` |

**Règle d'or** : tout nouveau template marketing doit utiliser `marketingFooterHtml` + `unsubscribeHeaders`. Ne jamais coller un footer manuel à base de "STOP en objet" — c'est juridiquement faible et ne loggue rien dans `marketing_optout_log`.

Templates **transactionnels** (pas de footer requis car non marketing) : `sendVerificationEmail`, `sendAppointmentConfirmation`, `sendDailyRecap`, `sendRdvReminder`, `sendLoyaltyReward`, `sendClientInvite`, `sendAppointmentCancellation`, `sendEmployeeReminder`, `sendPasswordReset`, `sendReferralWelcome`, `sendOptInInvite`, `sendNewAppointmentMerchant`.

## Variables d'environnement

- `FRONTEND_PUBLIC_URL` (recommandée) : URL de l'app React, ex `https://hair-coiff-lille.vercel.app`. Si définie, les liens unsubscribe pointent vers `/unsubscribe?token=...` (page FDS-2026).
- `BACKEND_PUBLIC_URL` (obligatoire) : URL Render du backend, ex `https://flowia.onrender.com`. Sert au fallback HTML inline.

Sans `FRONTEND_PUBLIC_URL`, le système reste fonctionnel : les liens pointent vers le backend qui rend une page HTML autonome.

## Note de cleanup futur

Le dossier `docs/refronte/` contient un typo historique (« refronte » au lieu de « refonte »). Tous les liens internes des docs pointent vers ce chemin. Un commit dédié pourra renommer en bloc si besoin, sans urgence.
