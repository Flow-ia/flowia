# 🔵 Commit 1 — Schéma BDD + Migration

> **Prompt prêt à coller dans Claude Code**.

---

```
Refonte du modèle de données paiements pour cohérence Stripe Connect + Caisse + Walk-in + Statistiques.

CONTEXTE
FlowIA permet maintenant 4 sources de revenus distinctes :
1. Booking en ligne (page publique) — RDV qui peut être payé Stripe (100% ou acompte) OU pas du tout
2. RDV téléphone / agenda interne — créé par un employé, traité IDENTIQUEMENT à un RDV non payé en ligne (statut NOT_PAID)
3. Caisse RDV — encaissement après prestation d'un RDV existant (via #1 ou #2)
4. Walk-in (sans RDV) — client passe directement, vente caisse seule SANS rendez-vous

Et 6 statuts de paiement possibles :
- STRIPE_100 : paiement Stripe intégral
- STRIPE_ACOMPTE : acompte Stripe + reste à encaisser caisse
- NOT_PAID : RDV créé sans paiement (booking en ligne non payé OU pris par employé)
- CASH_PAID : encaissé en caisse (espèces / carte locale)
- REFUNDED : remboursé Stripe (annulation client dans délais)
- NO_SHOW_RETAINED : acompte conservé pour no-show

CONCEPT CENTRAL
Une transaction PEUT exister sans appointment_id (c'est un walk-in).
Un RDV peut avoir 0, 1 ou 2 transactions (acompte Stripe + reste caisse).
Un RDV pris en ligne non payé ET un RDV pris par un employé sont identiques côté workflow paiement, seul le champ source diffère.

À FAIRE

1. Sur la table `appointments`, ajouter ou s'assurer que ces colonnes existent :
   - source VARCHAR(50) NOT NULL — valeurs : 'online_booking' | 'phone_internal'
   - created_by_employee_id UUID NULL REFERENCES employees(id)
   - status VARCHAR(50) NOT NULL DEFAULT 'scheduled' — valeurs : 'scheduled' | 'honored' | 'cancelled_client' | 'cancelled_salon' | 'no_show'
   - cancelled_at TIMESTAMPTZ NULL
   - cancellation_reason VARCHAR(255) NULL
   - total_price_cents INTEGER NOT NULL
   
   Index : (business_id, scheduled_at), status, employee_id, client_id, source.

2. Sur la table `transactions`, ajouter ou modifier :
   - appointment_id UUID NULL REFERENCES appointments(id) ON DELETE SET NULL — IMPORTANT : NULLABLE pour walk-in
   - gross_amount_cents INTEGER NOT NULL
   - stripe_fee_cents INTEGER NOT NULL DEFAULT 0
   - platform_fee_cents INTEGER NOT NULL DEFAULT 0
   - net_amount_cents INTEGER NOT NULL
   - payment_method VARCHAR(50) NOT NULL — 'stripe' | 'cash' | 'card_local' | 'transfer' | 'other'
   - payment_status VARCHAR(50) NOT NULL — 'STRIPE_100' | 'STRIPE_ACOMPTE' | 'NOT_PAID' | 'CASH_PAID' | 'REFUNDED' | 'NO_SHOW_RETAINED'
   - source VARCHAR(50) NOT NULL — 'online_booking' | 'phone_internal' | 'cash_register_rdv' | 'walkin'
   - payment_type VARCHAR(50) NOT NULL DEFAULT 'full' — 'full' | 'deposit' | 'remaining' | 'refund'
   - stripe_payment_intent_id VARCHAR(255) NULL
   - stripe_charge_id VARCHAR(255) NULL
   - stripe_refund_id VARCHAR(255) NULL
   - stripe_payout_id VARCHAR(255) NULL
   - description TEXT NULL — utilisé pour walk-in (ex : "Vente cire coiffante")
   - paid_at TIMESTAMPTZ NULL
   - refunded_at TIMESTAMPTZ NULL
   - payout_received_at TIMESTAMPTZ NULL
   
   Index : (business_id, created_at), appointment_id, payment_status, source, stripe_payout_id, payment_method.
   
   Contrainte UNIQUE anti-double-paiement :
   CREATE UNIQUE INDEX idx_transactions_appointment_active 
     ON transactions(appointment_id) 
     WHERE appointment_id IS NOT NULL 
       AND payment_status IN ('STRIPE_100', 'CASH_PAID');

3. Créer table `payouts` :
   CREATE TABLE payouts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
     stripe_payout_id VARCHAR(255) UNIQUE NOT NULL,
     amount_cents INTEGER NOT NULL,
     currency VARCHAR(3) NOT NULL DEFAULT 'eur',
     status VARCHAR(50) NOT NULL,
     bank_account_last4 VARCHAR(4) NULL,
     bank_name VARCHAR(255) NULL,
     triggered_by VARCHAR(50) NOT NULL DEFAULT 'manual',
     triggered_by_employee_id UUID NULL REFERENCES employees(id),
     requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     arrival_date DATE NULL,
     completed_at TIMESTAMPTZ NULL,
     failed_at TIMESTAMPTZ NULL,
     failure_reason TEXT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   Index : business_id, status, requested_at.

4. Sur `businesses`, ajouter si absent :
   - platform_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0.0
   - CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100)

5. Migration de rétro-remplissage :
   
   -- Règle 1 : Méthodes caisse traditionnelles
   UPDATE transactions
   SET payment_status = 'CASH_PAID', source = 'cash_register_rdv',
       gross_amount_cents = COALESCE(amount * 100, 0),
       net_amount_cents = COALESCE(amount * 100, 0),
       payment_type = 'full'
   WHERE payment_method IN ('cash', 'card_local', 'transfer')
     AND appointment_id IS NOT NULL AND payment_status IS NULL;
   
   -- Règle 2 : Stripe avec payout
   UPDATE transactions
   SET payment_status = 'STRIPE_100', source = 'online_booking', payment_type = 'full',
       gross_amount_cents = COALESCE(amount * 100, gross_amount_cents)
   WHERE stripe_payment_intent_id IS NOT NULL AND stripe_payout_id IS NOT NULL
     AND payment_status IS NULL;
   
   -- Règle 3 : Walk-in
   UPDATE transactions
   SET source = 'walkin', payment_status = 'CASH_PAID', payment_type = 'full',
       gross_amount_cents = COALESCE(amount * 100, gross_amount_cents),
       net_amount_cents = COALESCE(amount * 100, net_amount_cents)
   WHERE appointment_id IS NULL AND payment_status IS NULL;

   Pour les RDV existants sans transaction, NE PAS créer de transaction NOT_PAID en BDD. Le statut "pas payé" se déduit de l'absence de transaction.

6. Service `transactionValidator.js` :
   - canCreateCashTransaction(appointmentId) : empêcher caisse si déjà STRIPE_100 ou CASH_PAID. Si STRIPE_ACOMPTE existe, n'autoriser que payment_type='remaining'.

CONTRAINTES STRICTES
- AUCUNE route API dans ce commit
- AUCUN frontend
- AUCUN webhook
- AUCUNE nouvelle dépendance npm
- Tester migration sur preview branch avant prod
- Migrations dans /backend/migrations/ avec timestamp préfixé

VALIDATION
- Aucune transaction Hair Coiff Lille n'a net_amount_cents = NULL
- Anti-double-paiement bloque correctement
- Walk-in (appointment_id NULL) fonctionne
- EXPLAIN sur SELECT historique utilise les index

MESSAGE DE COMMIT
feat(payments): add 4-source payment model + payouts table + retroactive fill

- Add appointments.source ('online_booking' | 'phone_internal')
- Add transactions.payment_status enum (6 values)
- Add transactions.source enum (4 values incl. walkin)
- Add transactions.{gross,stripe_fee,platform_fee,net}_amount_cents
- Add transactions.appointment_id NULLABLE for walk-in support
- Add payouts table for Stripe payout tracking
- Add UNIQUE constraint anti-double-payment
- Migrate existing transactions to new model
- Add transactionValidator service
```
