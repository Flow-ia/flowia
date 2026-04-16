# STATUS — FlowIA

## Derniere session : 2026-04-17 (session 10 — diagnostic log production)

### Diagnostic des logs fournis
Les logs Render montrent :
- `redirect_url":"FRONTEND_URL = https://haircoifflille.fr/..."` → **la variable Render FRONTEND_URL contient "FRONTEND_URL = " prefixe** (l'utilisateur a colle la ligne complete au lieu de la valeur). L'URL de retour est donc invalide mais **ce n'est pas ce qui bloque le paiement** puisque le widget n'attend pas cette URL pour le flow principal.
- `Status: FAILED | Transactions: [ 'FAILED' ]` **repete en boucle** → le paiement est bien **refuse par SumUp** puis le frontend continue a poller indefiniment car rien ne lui dit que c'est definitif.

### Bugs corriges dans cette passe

1. **Frontend poll indefini sur FAILED/EXPIRED**
   - Backend `/sms/verify` renvoie desormais `{ failed: true, message: <raison>, status: 'FAILED' }` des que `checkout.status === 'FAILED'` / `EXPIRED` ou qu'une transaction est `FAILED`/`CANCELLED`.
   - La transaction DB est automatiquement passee en `status='failed'` (plus de pending zombie).
   - Frontend `verify()` / `runVerify()` : sur `failed: true` → `clearInterval`, `finishedRef=true`, `setStatus('error')`, `setErrorMsg(message)`.
   - Bouton "Verifier mon paiement" : affiche desormais la vraie raison SumUp au lieu de "pas encore confirme".

2. **FRONTEND_URL pollue par `KEY = ` prefixe**
   - `payments.js` extrait la premiere URL `https?://...` avec une regex avant d'utiliser la valeur. Supprime aussi les `/` traînants.
   - Ne corrige pas la config Render mais rend l'app tolerante.

3. **Aucun log email promo**
   - `sendPromoEmail` : ajout `console.log('[MAIL PROMO OK] ${code} -> ${to}')` et `console.error('[MAIL PROMO ERR] ...')` en echec.
   - Route `/api/promo/:id/send-emails` : logs `[PROMO EMAILS] Debut / Fin` avec `user`, `promo code`, `clients count`, `brevo_key=OK|MISSING`, `sent`, `failed`.

### Cause reelle du paiement refuse en sandbox
Les transactions sont marquees `FAILED` cote SumUp → causes probables a verifier cote config :
- La cle utilisee (`SUMUP_SECRET_KEY`) n'a pas le scope `payments` pour ce compte.
- Le compte SumUp (merchant `M4A9JCQC` / `hungrybox.fr@gmail.com`) est un compte **production** mais utilise comme sandbox → echec systematique.
- Le numero de carte saisi n'est pas une carte de test SumUp valide.
- Le mode sandbox/prod n'est pas aligne entre la cle et les cartes utilisees.

Carte de test SumUp valide :
- PAN : `4000 0000 0000 0002`
- Expiration : toute date future
- CVV : `123`

### Fichiers modifies
- `backend/src/routes/payments.js`
  - Parse defensif `FRONTEND_URL`
  - `/sms/verify` renvoie `failed:true` + raison, marque DB en `status='failed'`
- `backend/src/utils/email.js` — logs `[MAIL PROMO OK/ERR]`
- `backend/src/routes/promo.js` — logs `[PROMO EMAILS] Debut/Fin`
- `frontend/src/pages/Settings.jsx` — modal SumUp stoppe polling sur `failed:true`

### Etat
- Build frontend : OK (20.23s)
- Syntaxe backend : OK

### Action utilisateur a faire
1. Dans Render → Environment : verifier que `FRONTEND_URL` contient **uniquement** `https://haircoifflille.fr` (pas `FRONTEND_URL = https://...`).
2. Sur le dashboard SumUp developer → verifier que la cle a bien le scope **payments** et est alignee avec le mode (prod vs sandbox).
3. Tester avec la carte sandbox `4000 0000 0000 0002`.
4. Redeployer le backend Render pour recuperer les nouveaux logs `[PROMO EMAILS]`.
