# Flow Finances + Réservations

## 🚀 Installation

### Backend
```bash
cd backend
npm install
cp .env.example .env   # configurer DB + SMTP
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## 🗄️ Base de données
```bash
cd backend
node reset-db.js   # recrée toutes les tables
```

## 📅 Système de réservation

### Pour le commerçant (espace Admin → onglet Agenda)
1. **Agenda** : voir les RDV par jour, modifier le statut, assigner un employé
2. **Services** : créer des services avec durée, prix, couleur, catégorie
3. **Config** : activer les réservations, définir le slug, les horaires, les règles

### Pour les clients (site public)
- URL : `http://votre-domaine.com/book/MON-SLUG`
- Réservation en 6 étapes : Service → Employé → Date → Créneau → Infos → Confirmation
- Compte client optionnel pour gérer ses RDV

## 🔗 Routes API ajoutées

### Commerçant (auth requise)
- `GET/POST /api/booking/settings`
- `GET/POST /api/booking/hours`
- `GET/POST/PUT/DELETE /api/booking/services`
- `GET/POST/PUT/DELETE /api/booking/appointments`
- `GET /api/booking/clients`

### Public (clients)
- `GET /api/pub/:slug` — infos du commerce
- `GET /api/pub/:slug/services`
- `GET /api/pub/:slug/employees`
- `GET /api/pub/:slug/slots?date=&employee_id=&service_id=`
- `POST /api/pub/:slug/book`
- `POST /api/pub/:slug/client/register`
- `POST /api/pub/:slug/client/login`
- `GET /api/pub/:slug/client/appointments`
- `PUT /api/pub/:slug/client/appointments/:id/cancel`

## 🏗️ Nouvelles tables
- `booking_settings` — paramètres par commerçant (slug, horaires, règles)
- `business_hours` — horaires d'ouverture par jour
- `booking_services` — services avec durée et prix
- `employee_availability` — congés/indisponibilités
- `client_accounts` — comptes clients par commerçant
- `appointments` — rendez-vous
