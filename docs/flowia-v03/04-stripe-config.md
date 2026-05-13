# 💳 Configuration Stripe Connect

> Référence complète Stripe Connect pour FlowIA.

---

## 🎯 Vue d'ensemble

FlowIA utilise **Stripe Connect Standard** :
- Chaque commerçant connecte son **propre compte Stripe**
- L'argent va **directement** sur le compte du commerçant
- FlowIA prélève une **commission configurable** via `application_fee_amount`
- Reversements vers compte bancaire = **manuels** (déclenchés par le commerçant)

---

## 📋 Champs Stripe (Activation Connect)

### Description du produit

```
FlowIA est une plateforme SaaS de réservation en ligne destinée aux 
professionnels indépendants et commerces de proximité (salons, instituts, 
services). L'inscription est gratuite : les commerçants connectent leur 
propre compte Stripe via Stripe Connect pour recevoir directement les 
paiements de leurs clients. FlowIA prélève une commission configurable sur 
chaque transaction effectuée via la plateforme.
```

| Champ Stripe | Valeur |
|---|---|
| Nom de l'entreprise (DBA) | FlowIA |
| Libellé relevé | FLOWIA |
| MCC | 7372 (Software / SaaS) |
| Numéro TVA | Vide (micro-franchise CGI 293B) |
| Site web | https://flowiapro.com |

---

## 🔧 Implémentation technique

### Création paiement avec commission

```javascript
const paymentIntent = await stripe.paymentIntents.create({
  amount: 3000, // 30€
  currency: 'eur',
  
  transfer_data: {
    destination: business.stripe_account_id
  },
  
  application_fee_amount: Math.round(3000 * (business.platform_fee_percent / 100)),
  
  metadata: {
    appointment_id: appointment.id,
    business_id: business.id
  }
});
```

### Calcul des montants nets

```javascript
function calculateNetAmount({ grossCents, platformFeePercent }) {
  const stripeFeeRate = 0.014;
  const stripeFeeFixed = 25;
  const stripeFee = Math.round(grossCents * stripeFeeRate) + stripeFeeFixed;
  const platformFee = Math.round(grossCents * platformFeePercent / 100);
  const netAmount = grossCents - stripeFee - platformFee;
  
  return {
    gross_amount_cents: grossCents,
    stripe_fee_cents: stripeFee,
    platform_fee_cents: platformFee,
    net_amount_cents: netAmount
  };
}
```

⚠️ **Frais Stripe estimés en frontend**, vrais frais via webhook `charge.succeeded` (`balance_transaction`).

---

## 💰 Politique de remboursement

### Annulation dans les délais

```javascript
const refund = await stripe.refunds.create({
  payment_intent: transaction.stripe_payment_intent_id,
  refund_application_fee: true,  // commission FlowIA rendue
  reverse_transfer: true,
  metadata: { reason: 'client_cancellation_within_delay' }
});

await db.query(`
  UPDATE transactions 
  SET payment_status = 'REFUNDED',
      stripe_refund_id = $1,
      refunded_at = NOW()
  WHERE id = $2
`, [refund.id, transaction.id]);
```

### No-show

```javascript
await db.query(`
  UPDATE transactions 
  SET payment_status = 'NO_SHOW_RETAINED',
      retained_at = NOW()
  WHERE id = $1
`, [transaction.id]);
```

---

## 📤 Reversements (payouts)

### Mode actuel : manuel

```javascript
async function createManualPayout(businessId, employeeId) {
  const business = await getBusinessById(businessId);
  
  const pendingPayout = await db.query(`
    SELECT * FROM payouts 
    WHERE business_id = $1 AND status IN ('pending', 'in_transit')
    LIMIT 1
  `, [businessId]);
  
  if (pendingPayout.length > 0) throw new Error('Un payout est déjà en cours');
  
  const balance = await stripe.balance.retrieve({
    stripeAccount: business.stripe_account_id
  });
  
  const availableEur = balance.available.find(b => b.currency === 'eur');
  if (!availableEur || availableEur.amount === 0) {
    throw new Error('Aucun solde disponible');
  }
  
  const payout = await stripe.payouts.create({
    amount: availableEur.amount,
    currency: 'eur',
    metadata: {
      flowia_business_id: businessId,
      triggered_by_employee_id: employeeId
    }
  }, {
    stripeAccount: business.stripe_account_id
  });
  
  await db.query(`
    INSERT INTO payouts (
      business_id, stripe_payout_id, amount_cents, currency,
      status, triggered_by, triggered_by_employee_id, requested_at
    ) VALUES ($1, $2, $3, $4, $5, 'manual', $6, NOW())
  `, [businessId, payout.id, payout.amount, payout.currency, payout.status, employeeId]);
  
  return payout;
}
```

### Estimation prochain payout

```javascript
async function estimateNextPayout(businessId) {
  const lastPayouts = await db.query(`
    SELECT requested_at, amount_cents 
    FROM payouts 
    WHERE business_id = $1 AND status = 'paid'
    ORDER BY requested_at DESC LIMIT 5
  `, [businessId]);
  
  if (lastPayouts.length < 2) return null;
  
  const intervals = [];
  for (let i = 0; i < lastPayouts.length - 1; i++) {
    const diff = (new Date(lastPayouts[i].requested_at) - new Date(lastPayouts[i+1].requested_at)) / 86400000;
    intervals.push(diff);
  }
  
  const avgIntervalDays = Math.round(intervals.reduce((a,b) => a+b, 0) / intervals.length);
  const lastPayoutDate = new Date(lastPayouts[0].requested_at);
  const estimatedDate = new Date(lastPayoutDate);
  estimatedDate.setDate(estimatedDate.getDate() + avgIntervalDays);
  
  const avgAmount = Math.round(
    lastPayouts.reduce((sum, p) => sum + p.amount_cents, 0) / lastPayouts.length
  );
  
  return {
    estimated_date: estimatedDate.toISOString().split('T')[0],
    estimated_amount_cents: avgAmount,
    based_on_avg_interval_days: avgIntervalDays
  };
}
```

---

## 🪝 Webhooks Stripe

```javascript
const STRIPE_EVENTS_HANDLED = {
  'payment_intent.succeeded': handlePaymentSucceeded,
  'charge.refunded': handleChargeRefunded,
  'payout.paid': handlePayoutPaid,
  'payout.failed': handlePayoutFailed,
  'account.updated': handleAccountUpdated
};
```

⚠️ Webhooks Stripe Connect = **endpoints différents** selon plateforme/compte connecté. 2 endpoints distincts dans Stripe Dashboard.

---

## 🔐 Variables d'environnement

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_WEBHOOK_SECRET_CONNECT=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...
STRIPE_CONNECT_REDIRECT_URI=https://api.flowiapro.com/api/stripe/oauth/callback
```

---

## 📊 Commission par commerçant

| Stade | Commission |
|---|---|
| Pilote | 0% |
| Premiers payants | 2-3% |
| Confirmés | 3-5% |

Concurrence : Booksy 1.9%, Treatwell 2.5%, Planity 0% (mais 99€/mois).

---

## ⚠️ DAC7

Collecter SIRET à l'inscription. Activer **Tax forms** sur Stripe Dashboard. Export annuel par commerçant.
