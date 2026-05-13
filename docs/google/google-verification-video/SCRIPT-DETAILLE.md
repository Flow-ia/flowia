# Script détaillé — Vidéo de vérification Google OAuth

Vidéo cible : **2 minutes max**, format **1080p MP4**, sous-titres anglais
recommandés (Google reviewers anglophones).

À héberger : **YouTube Unlisted** (URL secrète, pas indexée).

---

## Préparation (15 min avant tournage)

### 1. Compte Google de test
- Crée un compte Google jetable : `flowia.demo.gcal+verif@gmail.com`
- Évite ton compte perso (la vidéo sera vue par Google reviewers)

### 2. Salon de test
- Dans FlowIA, crée un compte merchant de test : "Demo Salon Verification"
- Ou utilise un environnement staging si tu en as

### 3. Onglets pré-ouverts dans Chrome (incognito recommandé)
- Onglet 1 : `https://flowiapro.com` (homepage)
- Onglet 2 : `https://app.flowiapro.com/login` (ou ton URL frontend merchant)
- Onglet 3 : `https://calendar.google.com` (logged in avec le compte de test)

### 4. Curseur visible + zoom
- Active "Highlight cursor" dans OBS / Loom
- Préfère **fenêtre maximisée 1080p** plutôt que plein écran (plus lisible)

---

## Script — 2:00 minutes

### [0:00 – 0:10] Intro homepage

**Action** : Ouvre `flowiapro.com`, montre la page d'accueil pendant 5s

**Voix off (EN)** :
> *"FlowIA is a SaaS appointment booking platform for hair salons, barbershops and small service businesses based in Europe."*

**Sous-titre** : `FlowIA — Booking SaaS for hair salons & service businesses`

---

### [0:10 – 0:20] Why we integrate Google Calendar

**Action** : Reste sur la homepage, scroll lentement vers une section feature OU coupe vers une slide texte

**Voix off** :
> *"Merchants asked for a way to see their FlowIA appointments inside their personal Google Calendar — for mobile notifications, sharing with employees, and keeping all their schedules in one place."*

**Sous-titre** : `Why: merchants want their bookings in Google Calendar too`

---

### [0:20 – 0:35] Login as merchant

**Action** :
1. Va sur `app.flowiapro.com/login`
2. Connecte-toi avec le compte merchant de test
3. Arrive sur le Dashboard

**Voix off** :
> *"A merchant logs into FlowIA. This is the merchant dashboard."*

**Sous-titre** : `Merchant logs into FlowIA`

---

### [0:35 – 0:50] Navigate to Settings → Reservations → Synchronization

**Action** :
1. Clique sur menu / sidebar → **Réglages** (Settings)
2. Clique sur **Réservations**
3. Clique sur la sous-tab **Synchronisation**
4. Page "Connecter mon Google Agenda" s'affiche

**Voix off** :
> *"In Settings, the merchant goes to Reservations, then Synchronization, where they can connect their Google Calendar."*

**Sous-titre** : `Settings → Reservations → Synchronization`

---

### [0:50 – 1:15] Click "Connect" → Google consent screen

**Action** :
1. Clique sur **"Connecter mon Google Agenda"**
2. Page Google s'ouvre (sélection compte → consent screen)
3. **IMPORTANT** : montre **clairement** la liste des permissions demandées
   - Doit mentionner *"View and edit events on all your calendars"* (= calendar.events)
   - Zoom dessus avec curseur ou pause 3 secondes minimum

**Voix off** :
> *"The merchant clicks Connect. Google shows the OAuth consent screen, requesting only the calendar.events scope — the minimum needed to create and manage events. We deliberately do not request the broader calendar scope."*

**Sous-titre** : `OAuth consent — calendar.events scope only (least privilege)`

⚠️ **Si l'app n'est pas encore vérifiée**, Google affichera "Google hasn't verified this app" — c'est OK pour la vidéo mais montre clairement que tu cliques "Advanced → Go to FlowIA" pour démontrer le flux.

---

### [1:15 – 1:25] Connection successful

**Action** :
1. Accepte sur la page Google
2. Redirection vers FlowIA
3. État affiche **"Connecté · Sync active"** + email Google + dernière synchro

**Voix off** :
> *"Once the merchant accepts, FlowIA stores the OAuth tokens encrypted with AES-256-GCM and shows the sync status."*

**Sous-titre** : `Connected. Tokens stored encrypted (AES-256-GCM)`

---

### [1:25 – 1:40] Create an appointment in FlowIA

**Action** :
1. Va sur l'agenda FlowIA (Agenda menu)
2. Clique sur un créneau pour créer un nouveau RDV
3. Remplis : client name "John Doe", service "Haircut", date demain 14:00
4. Sauvegarde

**Voix off** :
> *"When the merchant creates a new appointment in FlowIA — for John Doe, tomorrow at 2 PM — FlowIA automatically pushes a corresponding event to their Google Calendar."*

**Sous-titre** : `New appointment created in FlowIA`

---

### [1:40 – 1:50] Verify on Google Calendar

**Action** :
1. Switch vers l'onglet Google Calendar
2. Refresh la page
3. L'event "John Doe — Haircut" apparaît demain à 14:00
4. Clique dessus → montre la description avec mention "Synced from FlowIA"

**Voix off** :
> *"The event appears immediately in Google Calendar with a clear 'Synced from FlowIA' note in the description."*

**Sous-titre** : `Appointment instantly mirrored to Google Calendar`

---

### [1:50 – 2:00] Disconnect

**Action** :
1. Retour FlowIA → Réglages → Réservations → Synchronisation
2. Clique sur **"Déconnecter"**
3. Confirm
4. État repasse à "Non connecté"

**Voix off** :
> *"The merchant can disconnect at any time. Disconnecting revokes the tokens server-side and removes our encrypted copies from the database. FlowIA strictly complies with the Google API Services User Data Policy and Limited Use requirements."*

**Sous-titre** : `Merchant can disconnect anytime — tokens revoked & deleted`

---

## Conseils tournage

- **Tourner en 1080p ou 1440p**, pas en dessous
- **Curseur visible et lent** : déplace-toi tranquillement, les reviewers regardent en accéléré
- **Pas de musique de fond** ou très discrète
- **Voix off claire en anglais** — si ton accent te gêne, utilise une voix IA :
  - https://elevenlabs.io (qualité top, ~10€/mois)
  - https://www.murf.ai (alternative)
  - Synthesia / TTSMaker (gratuit, qualité OK)
- **Sous-titres burned-in** : utilise CapCut (gratuit) pour ajouter les sous-titres anglais directement dans la vidéo
- **Format final** : MP4 H.264, max 100 MB pour upload YouTube rapide

## Outils d'enregistrement recommandés

| Outil | OS | Gratuit | Note |
|---|---|---|---|
| **Loom** | Mac/Win | Oui (limité) | Le plus simple, héberge auto |
| **OBS Studio** | All | Oui | Plus pro, courbe apprentissage |
| **Xbox Game Bar** | Win | Oui (intégré) | `Win+G`, basique mais marche |
| **QuickTime** | Mac | Oui | `Cmd+Shift+5`, simple |
| **CapCut Desktop** | Mac/Win | Oui | Pour montage + sous-titres |

## Upload YouTube

1. https://studio.youtube.com → CRÉER → Importer une vidéo
2. **Visibilité** : **Non répertoriée** (Unlisted) — accessible par lien uniquement, pas indexée
3. Titre : `FlowIA — Google Calendar Integration Demo (OAuth verification)`
4. Description : copie-colle la justification courte du kit
5. Récupère l'URL → c'est elle que tu colles dans le formulaire Google Trust & Safety

## Checklist finale avant soumission

- [ ] Vidéo 1080p, 1:30 à 2:00
- [ ] Voix off anglaise OU sous-titres anglais clairs
- [ ] Le scope `calendar.events` est **visible à l'écran** au moment du consent
- [ ] La mention "Synced from FlowIA" est visible dans Google Calendar
- [ ] Le flux disconnect est montré
- [ ] Vidéo uploadée sur YouTube Unlisted
- [ ] URL copiée dans le formulaire de soumission
