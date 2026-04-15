# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlowIA is a full-stack SaaS platform for salon/service businesses. It provides appointment booking (public-facing multi-step flow), financial transaction management, employee management with PIN-based access, loyalty programs, promotions, and client CRM. The codebase is in French (UI, comments, variable names in routes).

## Tech Stack

- **Backend:** Node.js + Express.js, PostgreSQL (via `pg`), JWT auth, Nodemailer (SMTP), Cloudinary (media), web-push, PDFKit
- **Frontend:** React 18 + React Router 6, Vite, inline styles (no CSS framework)
- **Hosting:** Vercel (frontend), Render (backend), Supabase (PostgreSQL)

## Development Commands

### Backend (`cd backend`)
```bash
npm install
npm run dev              # Dev server with nodemon (port 5000)
npm start                # Production mode with clustering
node reset-db.js         # DROP + recreate all tables (destructive!)
node migrate.js          # Incremental schema migrations
node seed-data.js        # Seed test data
```

### Frontend (`cd frontend`)
```bash
npm install
npm start                # Vite dev server on port 3000, proxies /api to :5000
npm run build            # Production build → dist/
npm run preview          # Preview production build
```

Both servers must run simultaneously for local development. The Vite dev server proxies `/api` requests to `http://localhost:5000`.

## Architecture

### Monorepo Layout
- `backend/src/index.js` — Express entry point with cluster mode, middleware stack, cron jobs
- `backend/src/db/index.js` — PostgreSQL pool + full schema (inline SQL, 23+ tables)
- `backend/src/routes/` — 20 API route modules mounted at `/api/*`
- `backend/src/middleware/` — auth.js (JWT), employee.js, pinAdmin.js, requireMerchant.js
- `frontend/src/index.jsx` — React root with routing (public `/book/:slug/*` + private merchant routes)
- `frontend/src/pages/` — 8 page components (Settings.jsx is ~6200 lines)
- `frontend/src/hooks/` — Context providers: useAuth, useAdmin, useTheme, useNotifications, useEmployeePin
- `frontend/src/utils/api.js` — Centralized REST client with dual token support (ff_token + ff_pin_token)

### Multi-Tenancy
All business data is scoped by `user_id` foreign key. Public booking routes use a slug to resolve the merchant.

### Auth Model
- Merchant auth: JWT tokens (ff_token in localStorage)
- PIN sessions: Temporary PIN-based access for sensitive operations (ff_pin_token)
- Client accounts: Per-merchant client registration for booking
- Employee access: PIN-based with scope-limited tokens

### Key API Route Groups
- `/api/auth/*` — Registration, login, password reset, email verification
- `/api/pub/:slug/*` — Public booking endpoints (no auth required)
- `/api/booking/*` — Merchant booking management (auth required)
- `/api/transactions/*` — Financial records (auth + PIN for writes)
- `/api/employees/*`, `/api/clients/*`, `/api/loyalty/*`, `/api/promo/*`, `/api/stats/*`, `/api/export/*`

### Cron Jobs (in-process, worker 1 only)
- Appointment reminders (1 min interval)
- Employee shift reminders (1 min interval)
- Daily recaps (5 min interval)

### Frontend Routing
- Public: `/book/:slug` → 6-step booking flow (Service → Employee → Date → Slot → Info → Confirmation)
- Private: `/` (Dashboard), `/transactions`, `/agenda`, `/employee-agenda`, `/settings`, `/clients`

## Build & Deploy

- **Frontend builds** go to Vercel with SPA fallback (all routes → index.html)
- **Backend deploys** to Render with health check at `/api/health`
- Vite code splitting: vendor-react, page-booking, page-settings, page-agenda chunks
- Production build drops console.log/debugger via terser

## Environment Variables

Backend requires: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` (comma-separated for multi-origin CORS), `SMTP_*` (Gmail), `CLOUDINARY_*`, `VAPID_*`. See `backend/.env.example` for full list.

Frontend requires: `VITE_API_URL` (production API base URL).

## Rate Limiting

Endpoint-specific limits are configured in `backend/src/index.js`:
- Auth endpoints: 5-20 req per window
- General API: 300 req/min
- Public booking: 600 req/min
