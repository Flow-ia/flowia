# Kit de soumission — Vérification Google OAuth (Google Calendar API)

Document de référence pour la soumission à Google Trust & Safety afin de
faire vérifier l'app FlowIA pour le scope `calendar.events`.

---

## Pré-requis (à faire AVANT de soumettre)

### 1. Vérification du domaine `flowiapro.com` dans Search Console

→ https://search.google.com/search-console
- Add Property → Domain → entrer `flowiapro.com`
- Suivre les instructions pour ajouter un enregistrement TXT DNS chez le registrar (OVH/Gandi/Cloudflare/etc.)
- Attendre la propagation (qq minutes à 1h)
- Bouton "Vérifier" → ✅

⚠️ Doit être fait avec **le même compte Google que l'OAuth project**.

### 2. URLs publiques actives

Vérifier que ces URLs sont accessibles sans login :
- ✅ Homepage : https://flowiapro.com
- ✅ Politique de confidentialité : https://flowiapro.com/confidentialite
- ✅ Conditions générales : https://flowiapro.com/cgv (ou /terms)
- ✅ Mentions légales : https://flowiapro.com/mentions-legales

---

## Branding (à remplir dans Google Cloud Console)

URL : https://console.cloud.google.com/auth/branding

| Champ | Valeur |
|---|---|
| **App name** | `FlowIA` |
| **User support email** | `contact@flowiapro.com` |
| **App logo** | Logo carré 120×120 px PNG transparent — télécharger le logo FlowIA |
| **Application home page** | `https://flowiapro.com` |
| **Application privacy policy link** | `https://flowiapro.com/confidentialite` |
| **Application terms of service link** | `https://flowiapro.com/cgv` |
| **Authorized domains** | `flowiapro.com` |
| **Developer contact information** | `contact@flowiapro.com` |

---

## Scopes à soumettre

URL : https://console.cloud.google.com/auth/scopes

Ajouter / vérifier :

| Scope | Justification (à coller) |
|---|---|
| `openid` | Identification utilisateur |
| `https://www.googleapis.com/auth/userinfo.email` | Récupération de l'email pour créer/identifier le compte FlowIA |
| `https://www.googleapis.com/auth/userinfo.profile` | Récupération du nom et photo profil pour personnaliser l'expérience |
| `https://www.googleapis.com/auth/calendar.events` | **Voir justification détaillée ci-dessous** |

---

## Justification — `calendar.events` (à coller dans le formulaire)

**EN ANGLAIS (version recommandée pour Google review)**

```
FlowIA is a SaaS booking and management platform for hair salons,
barbershops and similar appointment-based small businesses based in France
and Europe.

Why we need calendar.events:
Our merchant users (salon owners) need to keep their personal/professional
Google Calendar in sync with the appointments scheduled in FlowIA, so they
can see all their bookings in one place — on their phone, in their email
notifications, or shared with employees via Google Workspace.

How we use it:
- When a merchant connects their Google account in FlowIA Settings >
  Reservations > Synchronization, we use OAuth to obtain calendar.events
  scope.
- For every appointment created in FlowIA (whether by the merchant, an
  employee, or a customer through the public booking page), we POST a new
  event to the merchant's primary Google Calendar via the Calendar API.
- When the appointment is modified (date, time, employee assignment, cancel,
  delete), we PATCH or DELETE the corresponding Google Calendar event so
  the two stay in sync.
- The synchronization is strictly outbound (FlowIA → Google). We do NOT
  read existing events from the merchant's calendar, we do NOT free/busy
  query, we do NOT modify or delete events that we did not create.
- Every Google Calendar event created by FlowIA contains a clear "Synced
  from FlowIA" footer in its description and a source link back to our app.

Why we need this scope (and not a narrower one):
calendar.events is the minimum scope that allows creating, updating and
deleting events in a user's calendar. We do not need calendar (full read
access) and explicitly chose calendar.events to honor the principle of
least privilege.

User control:
Merchants can connect/disconnect at any time from FlowIA Settings, and
revoke access from their Google Account permissions page. Disconnecting
revokes the OAuth tokens server-side and removes our encrypted token
copies from our database.

Data handling:
- OAuth tokens (access_token, refresh_token) are encrypted at rest using
  AES-256-GCM with a key stored separately from the database.
- We never share or sell calendar data to third parties.
- We do not use calendar data for advertising, profiling or to train AI
  models.
- We do not transfer calendar data outside the EEA without explicit user
  consent.

Compliance:
- We comply with the Google API Services User Data Policy, including the
  Limited Use requirements.
- Our Privacy Policy at https://flowiapro.com/confidentialite explicitly
  documents this integration in section 10.
- Our backend infrastructure is hosted in the EU.
```

**EN FRANÇAIS (au cas où Google demande)**

```
FlowIA est une plateforme SaaS de prise de rendez-vous et de gestion
destinée aux salons de coiffure, barbershops et petits commerces de
service en France et en Europe.

Pourquoi nous avons besoin de calendar.events :
Nos commerçants utilisateurs ont besoin de synchroniser leur agenda Google
personnel ou professionnel avec les rendez-vous enregistrés dans FlowIA,
pour visualiser tous leurs RDV au même endroit (mobile, notifications
email, partage avec les employés via Google Workspace).

Comment nous l'utilisons :
- Quand un commerçant connecte son compte Google dans Réglages →
  Réservations → Synchronisation de FlowIA, nous demandons via OAuth
  l'autorisation calendar.events.
- Pour chaque RDV créé dans FlowIA (par le commerçant, un employé, ou un
  client via la page de réservation publique), nous créons un événement
  correspondant dans l'agenda Google principal du commerçant.
- Quand le RDV est modifié (date, heure, employé, annulation, suppression),
  nous mettons à jour ou supprimons l'événement Google correspondant.
- La synchronisation est strictement sortante (FlowIA → Google). Nous ne
  lisons jamais les événements existants, nous ne faisons pas de requêtes
  free/busy, nous ne modifions/supprimons que les événements que nous
  avons nous-mêmes créés.

Pourquoi ce scope précisément :
calendar.events est le scope minimal permettant la création/modification/
suppression d'événements. Nous n'avons pas besoin de calendar (lecture
complète) et choisissons explicitement calendar.events au nom du principe
du moindre privilège.

Contrôle utilisateur :
Les commerçants peuvent connecter/déconnecter à tout moment depuis FlowIA,
ou révoquer l'accès depuis myaccount.google.com/permissions. La
déconnexion révoque les jetons côté Google et supprime nos copies
chiffrées en base.

Traitement des données :
- Les jetons OAuth sont chiffrés au repos en AES-256-GCM, avec une clé
  stockée séparément de la base.
- Aucun partage ni revente de données calendrier à des tiers.
- Pas d'utilisation pour la publicité, le profilage ou l'entraînement
  d'IA.
- Pas de transfert hors EEE sans consentement explicite.

Conformité :
- Nous respectons la Google API Services User Data Policy, y compris les
  exigences Limited Use.
- Notre politique de confidentialité (section 10) documente précisément
  cette intégration : https://flowiapro.com/confidentialite
- Notre backend est hébergé dans l'UE.
```

---

## Vidéo démo (~2 minutes)

À héberger sur YouTube (peut être en "Unlisted") et fournir l'URL.

### Script (à lire en voix off ou sous-titres anglais)

**[0:00 – 0:15] Intro**
- Capture écran de la home page flowiapro.com
- Voix off : *"FlowIA is a booking platform for hair salons and barbershops. We integrate with Google Calendar so merchants can see their FlowIA appointments in their personal Google Calendar."*

**[0:15 – 0:35] Login as merchant**
- Capture écran : merchant login (email/password ou Google)
- Voix off : *"A merchant logs into FlowIA."*

**[0:35 – 1:00] Navigation to Settings**
- Capture : clic sur Réglages → Réservations → Synchronisation
- Voix off : *"In Settings, the merchant chooses to connect their Google Calendar."*

**[1:00 – 1:30] Connect flow**
- Clic sur "Connecter mon Google Agenda"
- Page Google de consent qui s'ouvre — montrer **clairement** :
  - Le scope demandé : *"View and edit events on all your calendars"* (= calendar.events)
- Accepter
- Retour sur FlowIA → "Connecté"
- Voix off : *"FlowIA requests only the calendar.events scope, which is the minimum needed to create and update events."*

**[1:30 – 1:50] Create appointment**
- Capture : créer un RDV de test dans FlowIA
- Voix off : *"When a new appointment is created in FlowIA…"*

**[1:50 – 2:00] Verify on Google Calendar**
- Ouvrir Google Calendar → l'event apparaît avec la mention "Synced from FlowIA"
- Voix off : *"…it instantly appears in the merchant's Google Calendar."*

**[2:00 – 2:10] Disconnect**
- Retour FlowIA Réglages → bouton "Déconnecter"
- Voix off : *"The merchant can disconnect at any time, which revokes our access immediately."*

### Conseils tournage
- Résolution **1080p** minimum
- Curseur visible
- Zoom sur les écrans Google de consent (le bouton "Avancé" si non vérifié encore)
- Utiliser un compte Google de test (pas un compte personnel sensible)
- Sous-titres en anglais recommandés (Google reviewers préfèrent EN)

---

## Soumission

URL : https://console.cloud.google.com/auth/scopes

1. Vérifier que toutes les sections Branding sont remplies
2. Cliquer sur **"Submit for verification"** / **"Soumettre pour vérification"**
3. Coller :
   - URL vidéo YouTube (Unlisted OK)
   - Texte de justification (anglais ci-dessus)
4. Submit

### Délai
- Première réponse Google : 1 à 7 jours
- Validation finale : 4 à 6 semaines (peut être plus court si demande simple et bien documentée)

### Pendant la review
Google peut envoyer un email à `contact@flowiapro.com` avec :
- Demande de complément (vidéo plus claire, justification précise)
- Demande d'accès test à FlowIA pour vérifier le comportement annoncé

→ Répondre **rapidement** (<48h) accélère la review.

---

## Statut actuel (au moment de la soumission)

- Mode publication : **In production** ✅
- Vérification : **Pending** (à soumettre)
- Plafond : **100 nouveaux utilisateurs** lifetime tant que pas vérifié
- Warning utilisateur : **"Google hasn't verified this app"** affiché lors du consent

→ Tu peux quand même onboarder jusqu'à 100 merchants pendant que la review est en cours.
