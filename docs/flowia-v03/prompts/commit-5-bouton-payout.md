# 🔴 Commit 5 — Bouton "Reverser maintenant"

> **Prompt prêt à coller dans Claude Code**.

---

```
Implémentation du bouton "Reverser maintenant" qui déclenche un payout Stripe via l'API.

CONTEXTE
Les Commits 1-4 ont préparé BDD, routes API et frontend. Maintenant on rend le bouton fonctionnel : il déclenche un payout Stripe sur le compte connecté.
Mode : MANUEL. Le commerçant déclenche lui-même quand il veut.

À FAIRE

1. Backend : Route POST /api/stripe/payout/create
   
   Logique :
   - Vérifier authentification employé lié au business
   - Vérifier qu'il n'y a PAS déjà un payout en cours (status='pending' ou 'in_transit')
   - Récupérer balance via stripe.balance.retrieve({ stripeAccount: business.stripe_account_id })
   - Si balance.available[0].amount === 0 → erreur 400 "Aucun solde disponible"
   - Créer le payout :
     stripe.payouts.create({
       amount: availableAmount,
       currency: 'eur',
       metadata: {
         flowia_business_id: businessId,
         triggered_by_employee_id: employeeId,
         triggered_at: new Date().toISOString()
       }
     }, {
       stripeAccount: business.stripe_account_id
     })
   - Insérer dans table payouts
   - Retourner :
     {
       success: true,
       payout: { id, amount_cents, status, arrival_date, bank_account_last4 },
       message: "Reversement de X,XX € initié. Arrivée prévue le DATE."
     }
   
   Erreurs :
   - Stripe error → 502 message clair
   - Pas de compte Stripe connecté → 400 "Compte Stripe non connecté"
   - Network timeout → 504

2. Frontend : Composant frontend/src/components/payout/PayoutButton.jsx
   
   Props : { availableAmount, bankAccountLast4, variant: 'primary' | 'hero', onSuccess }
   
   États :
   - idle : "Reverser maintenant" cliquable
   - confirming : modal ouvert
   - loading : spinner "Reversement en cours..."
   - success : toast vert
   - error : toast rouge
   
   Désactivé si :
   - availableAmount === 0
   - Payout en cours (vérifié au mount via API)
   
   Modal de confirmation :
   - Titre : "Confirmer le reversement"
   - Corps : "Vous allez reverser X,XX € sur votre compte ****1234. Le virement arrivera sous 1-3 jours ouvrés."
   - Boutons : "Annuler" / "Confirmer le reversement" (vert #1D9E75)
   - Coche "Ne plus me demander confirmation" (localStorage)
   
   Toast succès :
   - "Reversement de X,XX € initié. Arrivée prévue le VENDREDI 16 MAI."
   - Icône ti-circle-check vert
   
   Au succès, déclencher onSuccess() qui invalide cache SWR /api/stripe/balance + /api/payouts.

3. Frontend : Intégration dans 3 endroits
   
   a) Dashboard d'accueil :
      Le bandeau bleu "Argent à recevoir" → remplacer placeholder par <PayoutButton variant="primary" />
   
   b) Statistiques onglet Performance :
      Le bandeau "Argent à recevoir (Stripe)" → idem
   
   c) Statistiques onglet Reversements :
      Le hero card vert → <PayoutButton variant="hero" /> (background #1D9E75 white)

4. Webhook payout.paid (déjà en place Commit 2) :
   Met à jour BDD. Pas de WebSocket frontend pour l'instant — le commerçant verra "Reçu" au prochain refresh.
   Optionnel : email notification via emailService existant.

5. Tests mode test Stripe :
   a) Bouton désactivé si solde 0€
   b) Modal confirmation s'ouvre
   c) Spinner pendant payout
   d) Toast succès avec montant
   e) Refresh : nouveau payout apparaît avec status "pending"
   f) Webhook payout.paid → status "paid"
   g) Double-clic rapide → 2e clic échoue
   h) Erreur Stripe simulée → toast d'erreur

CONTRAINTES STRICTES
- Mode MANUEL uniquement
- Pas de scheduler récurrent
- Pas de notifications push
- Pas de modifs BDD
- Tester en mode TEST Stripe (sk_test_) avant prod
- Logger chaque payout : business_id, employee_id, amount, timestamp, stripe_payout_id

VALIDATION
- Bouton fonctionnel sur Dashboard, Stats Performance, Stats Reversements
- Modal confirmation OK
- Désactivation correcte
- Toast succès affiche montant + date arrivée
- BDD synchronisée via webhook
- Pas de double-clic possible
- Mode TEST OK avant merge prod

MESSAGE DE COMMIT
feat(payout): add manual Stripe payout button + confirmation modal

- Add POST /api/stripe/payout/create endpoint
- Add PayoutButton component (idle/confirming/loading/success/error)
- Add confirmation modal with bank account display
- Integrate in Dashboard hero + Stats Performance + Stats Reversements (variants)
- Disable when balance=0 or payout in progress
- Show success toast with amount + arrival date
- Invalidate caches on success
- Add structured logging for each payout
```
