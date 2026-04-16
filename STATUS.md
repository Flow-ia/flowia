# STATUS — FlowIA

## Derniere session : 2026-04-16

### Fichiers modifies (session 6)
- `backend/src/utils/emailSender.js` — **NOUVEAU** — Utilitaire centralise envoi email marketing Brevo (template HTML, quota, compteur)
- `backend/src/routes/campaigns.js` — Import sendMarketingEmail au lieu de sendEmail, envoi par batch avec Promise.allSettled, logs detailles, promo_code transmis
- `frontend/src/pages/Settings.jsx` — Popup promo : ajout promo_code dans le body sendCampaign, console.log avant envoi

### Corrections appliquees
1. emailSender.js cree avec sendMarketingEmail (template HTML propre), compteur journalier, quota 220/jour marketing
2. campaigns.js utilise sendMarketingEmail au lieu de sendEmail generique (sujet/template adaptes)
3. Envoi par batch avec Promise.allSettled (plus robuste)
4. Logs [CAMPAIGN SEND] Start + [CAMPAIGN] Emails envoyes pour debug Render
5. Frontend envoie promo_code dans le body pour le template email

### Etat actuel
- Build frontend : OK
- Push : OK (commit 7c9d1f2)

### Bugs restants
- Aucun bug identifie
