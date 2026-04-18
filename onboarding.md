# FlowIA — Carte latérale sticky + navigation + parrainage
# Lire BookingPage.jsx en entier avant de modifier.
# Modifications visuelles uniquement — ne pas toucher à la logique de réservation.
# À la FIN : git add -A && git commit -m "feat: carte latérale sticky + nav parrainage" && git push

---

## Fichier à lire
- frontend/src/pages/BookingPage.jsx
- frontend/src/utils/api.js

---

# PARTIE 1 — CARTE LATÉRALE DROITE STICKY

Réorganiser la colonne droite pour qu'elle ressemble exactement à ceci :

┌─────────────────────────────┐
│      [LOGO Hair Coiff]      │
│         HAIR COIFF          │
│   Lien Google -  avis      │
│                             │
│      [ Réserver ]           │
│                             │
│  Fermé · Ouvre 9h30 Mar >   │
│                             │
│  Lun   Fermé                │
│  Mar   09:30 – 19:30        │
│  Mer   09:30 – 19:30        │
│  Jeu   09:30 – 19:30        │
│  Ven   09:30 – 19:30        │
│  Sam   09:30 – 19:30  ← aujourd'hui en gras│
│  Dim   09:30 – 18:00        │
│                             │
│  47 Rue des Postes          │
│  59000 Lille                │
│  Ouvrir dans Maps ↗         │
│                             │
│  Nous contacter ∨           │
│  (accordéon : tél + email)  │
└─────────────────────────────┘

Détails importants :
- La carte reste visible en permanence pendant le scroll (position sticky)
- Le statut ouvert/fermé est calculé dynamiquement depuis les horaires réels
- Le jour actuel est mis en gras dans le tableau horaires
- "Ouvrir dans Maps ↗" ouvre Google Maps avec l'adresse du commerce
- "Nous contacter" est un accordéon dépliable avec téléphone et email cliquables
- Si aucun avis ne pas afficher la ligne note

---

# PARTIE 2 — NAVIGATION DESKTOP

La barre de navigation en haut doit afficher exactement dans cet ordre :

Horaires · Adresse · Nos prestations · Équipe · Commentaires · Photos

Et si le commerçant a un programme de parrainage créé (actif ou non) :

Horaires · Adresse · Nos prestations · Équipe · Commentaires · Photos · Parrainer un ami

Si le programme n'a jamais été créé ne pas afficher "Parrainer un ami" du tout.

---

# PARTIE 3 — NAVIGATION MOBILE

Même entrées que desktop dans le menu mobile existant.
"Parrainer un ami" suit les mêmes règles d'affichage.

---

# PARTIE 4 — PAGE PARRAINAGE

Quand le client clique sur "Parrainer un ami" :

Programme actif — client NON connecté :
Afficher les conditions et la récompense.
Bouton "Voir mon code" qui ouvre la connexion existante.

Programme actif — client connecté :
┌──────────────────────────────────┐
│  Votre code : AHMED-K7X2         │
│  [ Copier ]  [ Partager le lien ]│
└──────────────────────────────────┘
Liste des filleuls : Karim — En attente / Omar — Validé ✅
Liste des réductions gagnées : AHMED15-K7X2 · -15% · expire 17/05

Programme désactivé par le commerçant :
Afficher "Le programme de parrainage est temporairement fermé."
Si le client a des réductions déjà gagnées les afficher quand même.

---

# CE QU'IL NE FAUT PAS TOUCHER
- La logique de réservation et ses étapes
- Les appels API existants
- Le flow de confirmation de RDV

---

# Ordre d'exécution

1. Lire BookingPage.jsx pour comprendre la structure complète
2. Réorganiser la carte latérale sticky (Partie 1)
3. Calculer statut ouvert/fermé dynamique depuis horaires réels
4. Mettre à jour la navigation desktop et mobile (Parties 2 et 3)
5. Charger config parrainage et créer la page (Partie 4)
6. cd frontend && npx vite build
7. Si OK : git add -A && git commit -m "feat: carte latérale sticky + nav parrainage" && git push