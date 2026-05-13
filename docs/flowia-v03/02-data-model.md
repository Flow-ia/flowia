# 🗄️ Data Model — Sources, Statuts & Schéma BDD

> Référence du modèle de données. À implémenter exactement comme spécifié.

---

## 🎯 2 entités séparées

```
┌──────────────────────┐         ┌──────────────────────┐
│   APPOINTMENTS       │         │   TRANSACTIONS       │
│   (RDV)              │         │   (paiements)        │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                │
           │     0..N transactions par RDV  │
           └────────────────────────────────┘
                      
                  ⚠️ Une transaction PEUT exister sans RDV
                  → c'est un walk-in (vente caisse seule)
```

### Règle d'or
- **Un RDV peut avoir 0, 1 ou plusieurs transactions** :
  - 0 transaction → RDV `NOT_PAID` (à venir)
  - 1 transaction → paiement complet
  - 2 transactions → acompte Stripe + reste caisse
- **Une transaction sans `appointment_id` (NULL) = walk-in**

---

## 📊 Les 4 sources de revenus

| # | Code | Source | Avec RDV ? | Mode paiement |
|---|---|---|---|---|
| 1 | `online_booking` | 🌐 Booking en ligne | ✅ Oui | Stripe (100% / acompte) ou pas payé |
| 2 | `phone_internal` | 📞 RDV téléphone (par employé) | ✅ Oui | Pas payé (à encaisser caisse) |
| 3 | `cash_register_rdv` | 💵 Caisse RDV | ✅ Oui (RDV existant) | Espèces / carte locale |
| 4 | `walkin` | ⚡ Walk-in (sans RDV) | ❌ **Non** | Espèces / carte locale |

⚠️ **Important** : `online_booking` ET `phone_internal` peuvent tous les deux avoir un statut `NOT_PAID` (à encaisser plus tard). Ils sont **traités identiquement** côté workflow paiement, seule la source d'origine du RDV diffère.

→ Côté `appointments.source` : seules `online_booking` et `phone_internal` sont possibles.
→ Côté `transactions.source` : les 4 valeurs sont possibles.

---

## 🎨 Les 6 statuts de paiement

| Code | Libellé | Description | Walk-in possible ? |
|---|---|---|---|
| `STRIPE_100` | Stripe 100% | Paiement en ligne intégral | ❌ |
| `STRIPE_ACOMPTE` | Acompte Stripe | Acompte en ligne + reste caisse | ❌ |
| `NOT_PAID` | Pas encore payé | RDV créé sans paiement | ❌ (walk-in toujours payé) |
| `CASH_PAID` | Encaissé caisse | Espèces / carte locale | ✅ |
| `REFUNDED` | Remboursé | Annulation dans délais | ❌ |
| `NO_SHOW_RETAINED` | No-show retenu | Acompte conservé | ❌ |

---

## 🗄️ Schéma BDD complet

### Table `appointments`

```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  -- Valeurs : 'scheduled' | 'honored' | 'cancelled_client' | 'cancelled_salon' | 'no_show'
  
  source VARCHAR(50) NOT NULL,
  -- Valeurs : 'online_booking' | 'phone_internal'
  -- (PAS de 'walkin' ici car walk-in = pas de RDV)
  
  created_by_employee_id UUID NULL REFERENCES employees(id),
  
  total_price_cents INTEGER NOT NULL,
  notes TEXT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ NULL,
  cancellation_reason VARCHAR(255) NULL
);

CREATE INDEX idx_appointments_business_date ON appointments(business_id, scheduled_at);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_employee ON appointments(employee_id);
CREATE INDEX idx_appointments_client ON appointments(client_id);
CREATE INDEX idx_appointments_source ON appointments(source);
```

### Table `transactions`

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- ⚠️ NULLABLE pour walk-in
  appointment_id UUID NULL REFERENCES appointments(id) ON DELETE SET NULL,
  
  client_id UUID NULL REFERENCES clients(id) ON DELETE SET NULL,
  employee_id UUID NULL REFERENCES employees(id) ON DELETE SET NULL,
  
  -- Montants en centimes
  gross_amount_cents INTEGER NOT NULL,
  stripe_fee_cents INTEGER NOT NULL DEFAULT 0,
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  net_amount_cents INTEGER NOT NULL,
  
  payment_method VARCHAR(50) NOT NULL,
  -- Valeurs : 'stripe' | 'cash' | 'card_local' | 'transfer' | 'other'
  
  payment_status VARCHAR(50) NOT NULL,
  -- Valeurs : 'STRIPE_100' | 'STRIPE_ACOMPTE' | 'NOT_PAID' | 'CASH_PAID' | 'REFUNDED' | 'NO_SHOW_RETAINED'
  
  source VARCHAR(50) NOT NULL,
  -- Valeurs : 'online_booking' | 'phone_internal' | 'cash_register_rdv' | 'walkin'
  
  payment_type VARCHAR(50) NOT NULL DEFAULT 'full',
  -- Valeurs : 'full' | 'deposit' | 'remaining' | 'refund'
  
  stripe_payment_intent_id VARCHAR(255) NULL,
  stripe_charge_id VARCHAR(255) NULL,
  stripe_refund_id VARCHAR(255) NULL,
  stripe_payout_id VARCHAR(255) NULL,
  
  description TEXT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ NULL,
  refunded_at TIMESTAMPTZ NULL,
  payout_received_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_transactions_business_date ON transactions(business_id, created_at);
CREATE INDEX idx_transactions_appointment ON transactions(appointment_id);
CREATE INDEX idx_transactions_status ON transactions(payment_status);
CREATE INDEX idx_transactions_source ON transactions(source);
CREATE INDEX idx_transactions_payout ON transactions(stripe_payout_id);
CREATE INDEX idx_transactions_method ON transactions(payment_method);

-- Anti-double-paiement
CREATE UNIQUE INDEX idx_transactions_appointment_active 
  ON transactions(appointment_id) 
  WHERE appointment_id IS NOT NULL 
    AND payment_status IN ('STRIPE_100', 'CASH_PAID');
```

### Table `payouts`

```sql
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  stripe_payout_id VARCHAR(255) UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'eur',
  
  status VARCHAR(50) NOT NULL,
  -- Valeurs : 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled'
  
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

CREATE INDEX idx_payouts_business ON payouts(business_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_requested ON payouts(requested_at);
```

### Table `businesses` (modification)

```sql
ALTER TABLE businesses ADD COLUMN platform_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0.0;
ALTER TABLE businesses ADD CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100);
```

---

## 🔄 Migration de rétro-remplissage

```sql
-- Règle 1 : Méthodes caisse traditionnelles
UPDATE transactions
SET payment_status = 'CASH_PAID',
    source = 'cash_register_rdv',
    gross_amount_cents = COALESCE(amount * 100, 0),
    net_amount_cents = COALESCE(amount * 100, 0),
    payment_type = 'full'
WHERE payment_method IN ('cash', 'card_local', 'transfer')
  AND appointment_id IS NOT NULL
  AND payment_status IS NULL;

-- Règle 2 : Stripe avec payout
UPDATE transactions
SET payment_status = 'STRIPE_100',
    source = 'online_booking',
    payment_type = 'full',
    gross_amount_cents = COALESCE(amount * 100, gross_amount_cents)
WHERE stripe_payment_intent_id IS NOT NULL
  AND stripe_payout_id IS NOT NULL
  AND payment_status IS NULL;

-- Règle 3 : Walk-in (sans appointment_id)
UPDATE transactions
SET source = 'walkin',
    payment_status = 'CASH_PAID',
    payment_type = 'full'
WHERE appointment_id IS NULL
  AND payment_status IS NULL;
```

⚠️ **Pour les RDV existants sans transaction** : ne PAS créer de transaction `NOT_PAID` en BDD. Le statut "pas payé" se déduit de l'**absence** de transaction sur ce RDV. C'est plus propre.

---

## 🚨 Anti-double-encaissement

```javascript
async function canCreateTransaction(appointmentId, amount) {
  if (!appointmentId) return true; // walk-in OK
  
  const existingPaid = await db.query(`
    SELECT * FROM transactions 
    WHERE appointment_id = $1 
      AND payment_status IN ('STRIPE_100', 'CASH_PAID')
  `, [appointmentId]);
  
  if (existingPaid.length > 0) {
    throw new Error('Ce RDV est déjà payé intégralement');
  }
  
  // Acompte ? autoriser uniquement payment_type='remaining'
  const deposit = await db.query(`
    SELECT * FROM transactions 
    WHERE appointment_id = $1 
      AND payment_status = 'STRIPE_ACOMPTE'
  `, [appointmentId]);
  
  if (deposit.length > 0) {
    return { type: 'remaining', deposit_amount: deposit[0].gross_amount_cents };
  }
  
  return true;
}
```

---

## ✅ Checklist de validation

- [ ] Les 3 tables sont créées (`appointments`, `transactions`, `payouts`)
- [ ] Les contraintes CHECK sont en place
- [ ] Les indexes sont créés
- [ ] La contrainte UNIQUE anti-double-paiement fonctionne
- [ ] Les transactions existantes sont rétro-remplies sans perte
- [ ] Les walk-in (sans appointment_id) sont identifiables
- [ ] Aucune transaction n'a `net_amount_cents = NULL`
- [ ] Migration testée sur preview branch avant prod
