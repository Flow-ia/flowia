# STATUS — FlowIA

## Derniere session : 2026-04-16

### Fichiers modifies (session 2)
- `backend/src/routes/payments.js` — Fix SumUp checkout 500 (merchant_code, hosted_checkout_url, logs)
- `backend/src/routes/campaigns.js` — Quota email sans reserve artificielle (300/jour total)
- `backend/src/index.js` — Cron email limit 300 au lieu de 220
- `frontend/src/pages/Settings.jsx` — TabSMS deplace dans Marketing (sous-onglet "Solde marketing"), redesign simplifie (pas de details techniques), popup promo preview simplifie

### Fixes appliques
1. **FIX 1** — SumUp checkout : ajout merchant_code via /me, hosted_checkout_url, meilleur logging
2. **FIX 2** — Onglet SMS supprime, integre dans Marketing comme sous-onglet "Solde marketing"
3. **FIX 3** — TabSMS redesigne : pas de prix unitaire, pas de frais SumUp, pas de details Brevo
4. **FIX 4** — Quota email : 300/jour total (plus de reserve artificielle de 80)
5. **FIX 5** — Popup promo : preview simplifie ("47 clients recevront un email", "Solde OK" / "Il vous manque X EUR")

### Etat actuel
- Build frontend : OK
- Push : OK (commit d06d39f)
- Variables env a configurer sur Render : SMS_COST_UNIT, SMS_MARGIN_PERCENT, SUMUP_SECRET_KEY
- Variables env a configurer sur Vercel : VITE_SMS_COST_UNIT, VITE_SMS_MARGIN_PERCENT, VITE_SUMUP_PUBLIC_KEY

### Bugs restants
- Aucun bug identifie
