# FlowIA · Refonte Architecturale FDS-2026

Ce dossier contient tout le matériel de la refonte : maquettes, règles, plan détaillé, briefs prêts-à-coller.

## Structure

```
docs/refonte/
├── README.md                        ← vue d'ensemble (ici)
├── regles-absolues.md               ← règles non-négociables (lis en PREMIER)
├── INVENTAIRE-FONCTIONNEL.md        ← checklist exhaustive (~500 items)
├── onboarding-etape-par-etape.md    ← plan 14 commits
├── BRIEFS-COMMIT-PAR-COMMIT.md      ← briefs prêts à copier
├── message-de-demarrage.md          ← message pour démarrer Claude Code
└── maquettes/
    ├── index.html                   ← ouvre dans navigateur
    ├── shared.css
    ├── icons.js
    ├── toggle.js
    ├── 01-dashboard.html
    ├── 02-agenda.html
    ├── 03-caisse.html
    ├── 04-clients.html
    ├── 05-marketing.html
    ├── 06-statistiques.html
    ├── 07-reglages.html
    ├── 08-sidebar-navigation.html
    ├── 09-tablette-partagee.html
    └── 10-login-onboarding.html
```

Le fichier `CLAUDE.md` doit être placé à la **racine du projet** (hors `docs/`).

## Comment utiliser ce dossier

### 1. Lire le matériel
- Ouvre `maquettes/index.html` dans un navigateur (toggle desktop/mobile + scènes)
- Lis `regles-absolues.md` (5 min)
- Lis `INVENTAIRE-FONCTIONNEL.md` (source de vérité, très exhaustif)
- Lis `onboarding-etape-par-etape.md` (15 min)

### 2. Lancer Claude Code
- Ouvre VS Code + Claude Code terminal
- `git status` → doit être sur `refonte-archi-v3`. Sinon `git checkout refonte-archi-v3`
- Place `CLAUDE.md` à la racine du projet
- Copie le contenu de `message-de-demarrage.md`
- Colle dans le chat Claude Code
- Laisse-le lire et confirmer

### 3. Exécuter les 14 commits étape par étape

Entre chaque commit :
- Smoke test sur preview Vercel
- Validation explicite avant le suivant

## Design FDS-2026

Palette noir/blanc/pastel · bordures 0.5px · radius 12 cards · fontWeight ≤ 500 · pas d'emoji UI · icônes Lucide SVG inline · pas de Tailwind · inline styles React.

## Architecture cible

### Sidebar admin — 7 items en 3 sections
- PRINCIPAL : Dashboard · Agenda · Caisse · Clients
- CROISSANCE : Marketing · Statistiques
- PARAMÉTRAGE : Réglages

### Sidebar employé perso — 3 items
Mon agenda · Encaisser · Clients

### Sidebar tablette partagée — 3 items neutres + Admin
Agenda global · Encaisser · Clients + bouton "Accès admin"

### Réglages — 4 cartes
- Mon commerce (Infos, Horaires, Photos, Compte)
- Réservations (Config, Catégories booking, Prestations, Notifications)
- Équipe (Membres, Horaires, Plages, Commissions, Absences, Sécurité)
- Caisse config (Catégories, QR)

### Marketing — 4 sous-onglets
- Fidélité (Loyalty, Birthday, Referral)
- Promotions (List, Create, SendEmail)
- Solde SMS (Balance, Recharger, Historique)
- IA (Suggestions, History)

### Statistiques — 5 sous-onglets
- Performance (KPIs + par paiement + par employé + top prestations)
- Prévisions IA 7j
- Heatmap jour × heure
- Ventes produits
- Export CSV/PDF

### Caisse — 3 sous-onglets
- Encaisser (4 étapes)
- Historique (grille 4 paiements)
- Crédit (grant/repay)

## Contact

- Commerçant : Hair Coiff Lille (barbershop homme Lille)
- Frontend prod : haircoifflille.fr + commercant.haircoifflille.fr
- Backend prod : flowia-backend.onrender.com
- Branche de travail : `refonte-archi-v3`
