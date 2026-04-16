# STATUS — FlowIA

## Derniere session : 2026-04-16

### Fichiers modifies
- `backend/src/db/index.js` — Migrations SMS: campaign_queue, campaigns, sms_transactions, message_log, reminder_24h/2h_sent
- `backend/src/utils/messenger.js` — **NOUVEAU** — Utilitaire SMS Brevo (sendSMS, formatPhone, batch)
- `backend/src/routes/campaigns.js` — **NOUVEAU** — Routes campagnes: preview, send, quota, history
- `backend/src/routes/payments.js` — **NOUVEAU** — Paiement recharge SMS SumUp: checkout, webhook, verify, balance, transactions
- `backend/src/index.js` — Ajout routes campaigns + payments, cron queue email, cron rappels RDV 24h/2h, compteur global emails
- `frontend/src/components/AuthFlow.jsx` — Redesign formulaire inscription (sections, 2 colonnes, debounce 600ms, cache adresse, validation temps reel)
- `frontend/src/pages/Settings.jsx` — Nouvel onglet SMS (TabSMS: solde, recharge SumUp, quota email, historique), section campagne dans popup promo
- `frontend/src/utils/api.js` — Ajout campaignsApi + paymentsApi

### Features implementees
1. **Feature 1 — Google OAuth commercant** : Deja implemente (bouton Google, onboarding obligatoire, /me, /onboarding)
2. **Feature 2 — Redesign inscription** : Formulaire en sections (Commerce, Identite, Securite), debounce 600ms, cache adresse, validation temps reel
3. **Feature 3 — Telephone obligatoire booking** : Deja implemente (validation frontend + backend)
4. **Feature 4 — Campagnes SMS + Email** : Complet (messenger.js, campaigns.js, payments.js, TabSMS, popup promo avec envoi campagne)
5. **Feature 5 — Rappels email RDV** : Cron toutes les heures, rappel 24h + 2h avant RDV, templates email
6. **Feature 6 — Optimisations performance** : Compteur global emails, cache memCache sur solde SMS, batch SMS/email, limites horaires cron

### Etat actuel
- Build frontend : OK
- Push : OK (commit 8e8c71d)
- Variables env a configurer sur Render : SMS_COST_UNIT, SMS_MARGIN_PERCENT, SUMUP_SECRET_KEY
- Variables env a configurer sur Vercel : VITE_SMS_COST_UNIT, VITE_SMS_MARGIN_PERCENT, VITE_SUMUP_PUBLIC_KEY

### Bugs restants
- Aucun bug identifie
