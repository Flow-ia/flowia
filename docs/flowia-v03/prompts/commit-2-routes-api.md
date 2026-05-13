# 🟢 Commit 2 — Routes API + Webhooks Stripe

> **Prompt prêt à coller dans Claude Code**.

---

```
Création des routes API pour alimenter Historique + Statistiques (4 onglets), plus webhooks Stripe.

CONTEXTE
Commit 1 a enrichi le modèle de données. Maintenant on expose ces données au frontend et on synchronise les paiements via webhooks Stripe.

À FAIRE

1. Route GET /api/historique
   Query params : period, date_from, date_to, type, mode, source, employee_id, page, per_page
   Retourne :
   {
     transactions: [{ id, appointment_id, client_name, employee_name, gross_amount_cents, net_amount_cents, stripe_fee_cents, platform_fee_cents, payment_method, payment_status, source, payment_type, description, created_at }],
     totals: { 
       ca_total_cents, 
       en_ligne_cents, en_ligne_count,
       caisse_rdv_cents, caisse_rdv_count, 
       walkin_cents, walkin_count,
       refunded_cents, refunded_count
     },
     pagination: { page, per_page, total }
   }

2. Route GET /api/stats/performance
   Retourne KPI brut/net par source :
   {
     en_ligne: { gross_cents, stripe_fee_cents, platform_fee_cents, net_cents, count },
     caisse_rdv: { gross_cents, especes_cents, carte_cents, net_cents, count },
     walkin: { gross_cents, especes_cents, carte_cents, net_cents, count },
     total: { gross_cents, total_fees_cents, net_cents, count, vs_previous_period_pct },
     evolution_30j: [{ date, en_ligne_cents, caisse_rdv_cents, walkin_cents }]
   }

3. Route GET /api/stats/rdv
   Retourne stats RDV (n'inclut PAS les walk-in) :
   {
     by_source: {
       online_booking: { count, ca_cents, by_payment_status: { stripe_100, stripe_acompte, not_paid } },
       phone_internal: { count, ca_cents, by_employee: {...} }
     },
     by_status: {
       stripe_100: { count, total_cents },
       stripe_acompte: { count, total_cents, remaining_cents },
       not_paid: { count, total_cents },
       cash_paid: { count, total_cents },
       refunded: { count, total_cents },
       no_show_retained: { count, total_cents }
     },
     by_employee: [{ employee_id, name, rdv_count, ca_cents, en_ligne_count, caisse_count }],
     insight: {
       deposit_honor_rate_pct,
       no_deposit_honor_rate_pct,
       message_fr
     }
   }

4. Route GET /api/stats/online-payments
   Retourne :
   {
     summary: { gross_cents, count, stripe_fee_cents, platform_fee_cents, net_cents, vs_previous_pct },
     by_status: {
       payouts_received: { count, amount_cents },
       pending_payout: { count, amount_cents },
       refunded: { count, amount_cents },
       no_show_retained: { count, amount_cents }
     },
     policy: { mode, deposit_pct, cancellation_window_hours, payout_delay_days },
     business_impact: { no_show_reduction_pct, additional_revenue_cents },
     evolution_30j: [{ date, amount_cents, count }]
   }

5. Route GET /api/stripe/balance
   Récupère via stripe.balance.retrieve({ stripeAccount: business.stripe_account_id }) :
   {
     available_cents,
     in_transit_cents,
     pending_cents,
     total_to_receive_cents,
     bank_account: { last4, bank_name },
     payout_mode: 'manual',
     next_payout_estimate: {
       estimated_date,
       estimated_amount_cents,
       based_on_avg_interval_days
     }
   }
   Estimation calculée à partir des 5 derniers payouts complétés.

6. Route GET /api/payouts
   Retourne :
   {
     payouts: [{ id, stripe_payout_id, amount_cents, status, bank_account_last4, requested_at, completed_at, arrival_date, triggered_by_employee_name }],
     stats: { total_period_cents, count, avg_amount_cents, min_cents, max_cents }
   }

7. Webhooks Stripe — endpoint POST /api/webhooks/stripe
   Vérifier signature avec STRIPE_WEBHOOK_SECRET. Idempotents (vérifier event.id).
   
   a) payment_intent.succeeded :
      - Récupérer balance_transaction pour frais Stripe réels
      - Créer transaction payment_status='STRIPE_100' (ou STRIPE_ACOMPTE si metadata.payment_type='deposit')
      - source='online_booking', payment_method='stripe'
   
   b) charge.refunded :
      - Marquer transaction REFUNDED, stripe_refund_id, refunded_at
      - UPDATE appointment.status = 'cancelled_client'
   
   c) payout.paid :
      - UPDATE payouts SET status='paid', completed_at, arrival_date
      - UPDATE transactions SET payout_received_at, stripe_payout_id pour les transactions du business antérieures au payout
   
   d) payout.failed :
      - UPDATE payouts SET status='failed', failure_reason
      - Email d'alerte au commerçant via emailService existant
   
   e) account.updated : mettre à jour business.stripe_account_status

CONTRAINTES STRICTES
- Toutes routes derrière middleware auth (vérifier business_id du JWT)
- Pas de frontend
- Pas de bouton payout (Commit 5)
- Pagination 50 max par requête
- Cache 5 min sur /api/stats/* avec invalidation sur webhook
- Logs structurés webhooks (req_id, event_type, business_id)

VALIDATION
- Routes < 500ms
- Stripe CLI : `stripe trigger payment_intent.succeeded` met à jour BDD
- Cohérence montants : sum(gross) = sum(fees) + sum(platform_fee) + sum(net)
- Webhook reçu 2 fois ne crée pas de doublon

MESSAGE DE COMMIT
feat(api): add historique + stats + payouts endpoints + Stripe webhooks

- Add GET /api/historique with filters
- Add GET /api/stats/{performance,rdv,online-payments}
- Add GET /api/stripe/balance with payout estimation
- Add GET /api/payouts history
- Handle webhooks: payment_intent.succeeded, charge.refunded, payout.{paid,failed}, account.updated
- Add 5-min cache on /api/stats with webhook invalidation
```
