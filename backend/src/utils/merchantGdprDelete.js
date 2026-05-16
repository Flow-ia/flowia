const fs = require('fs');
const path = require('path');

const { refundAppointment } = require('./refundAppointment');

const DELETE_PHRASE = 'SUPPRIMER DEFINITIVEMENT';
const RETENTION_DAYS = 30;

const USER_SCOPED_TABLES = [
  'user_settings',
  'booking_settings',
  'notification_settings',
  'employees',
  'employee_hours',
  'employee_absences',
  'employee_availability',
  'employee_time_slots',
  'employee_pins',
  'employee_commissions',
  'categories',
  'booking_services',
  'booking_service_categories',
  'booking_slug_aliases',
  'business_hours',
  'business_breaks',
  'service_commissions',
  'client_accounts',
  'client_notes',
  'client_credits',
  'credit_transactions',
  'client_loyalty',
  'client_rewards',
  'appointments',
  'appointment_payouts',
  'transactions',
  'transaction_audit_log',
  'promo_codes',
  'promo_usage_logs',
  'loyalty_programs',
  'referral_programs',
  'referral_codes',
  'referral_uses',
  'birthday_campaigns',
  'ai_campaigns',
  'campaigns',
  'campaign_queue',
  'message_log',
  'payouts',
  'financial_ledger',
  'sms_transactions',
  'failed_refunds',
  'notification_log',
  'app_notifications',
  'client_audit_log',
  'marketing_optout_log',
  'merchant_announcement',
  'merchant_debt_records',
  'merchant_calendar_integrations',
  'media',
  'push_subscriptions',
  'user_pins',
];

const DELETE_STEPS = [
  ['appointment_items', `DELETE FROM appointment_items WHERE appointment_id IN (SELECT id FROM appointments WHERE user_id=$1)`],
  ['transaction_payments', `DELETE FROM transaction_payments WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id=$1)`],
  ['transaction_items', `DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id=$1)`],
  ['ai_campaign_codes', `DELETE FROM ai_campaign_codes WHERE ai_campaign_id IN (SELECT id FROM ai_campaigns WHERE user_id=$1)`],
  ['client_connected_customers', `DELETE FROM client_connected_customers WHERE connected_account_id=$2`],
  ['financial_ledger', `DELETE FROM financial_ledger WHERE user_id=$1`],
  ['appointment_payouts', `DELETE FROM appointment_payouts WHERE user_id=$1`],
  ['failed_refunds', `DELETE FROM failed_refunds WHERE user_id=$1`],
  ['payouts', `DELETE FROM payouts WHERE user_id=$1`],
  ['sms_transactions', `DELETE FROM sms_transactions WHERE user_id=$1`],
  ['promo_usage_logs', `DELETE FROM promo_usage_logs WHERE user_id=$1`],
  ['client_rewards', `DELETE FROM client_rewards WHERE user_id=$1`],
  ['referral_uses', `DELETE FROM referral_uses WHERE user_id=$1`],
  ['referral_codes', `DELETE FROM referral_codes WHERE user_id=$1`],
  ['referral_programs', `DELETE FROM referral_programs WHERE user_id=$1`],
  ['loyalty_programs', `DELETE FROM loyalty_programs WHERE user_id=$1`],
  ['client_loyalty', `DELETE FROM client_loyalty WHERE user_id=$1`],
  ['credit_transactions', `DELETE FROM credit_transactions WHERE user_id=$1`],
  ['client_credits', `DELETE FROM client_credits WHERE user_id=$1`],
  ['merchant_debt_records', `DELETE FROM merchant_debt_records WHERE user_id=$1`],
  ['client_notes', `DELETE FROM client_notes WHERE user_id=$1`],
  ['client_audit_log', `DELETE FROM client_audit_log WHERE user_id=$1`],
  ['marketing_optout_log', `DELETE FROM marketing_optout_log WHERE user_id=$1`],
  ['client_accounts', `DELETE FROM client_accounts WHERE user_id=$1`],
  ['transaction_audit_log', `DELETE FROM transaction_audit_log WHERE user_id=$1`],
  ['transactions', `DELETE FROM transactions WHERE user_id=$1`],
  ['appointments', `DELETE FROM appointments WHERE user_id=$1`],
  ['campaign_queue', `DELETE FROM campaign_queue WHERE user_id=$1`],
  ['message_log', `DELETE FROM message_log WHERE user_id=$1`],
  ['campaigns', `DELETE FROM campaigns WHERE user_id=$1`],
  ['ai_campaigns', `DELETE FROM ai_campaigns WHERE user_id=$1`],
  ['birthday_campaigns', `DELETE FROM birthday_campaigns WHERE user_id=$1`],
  ['promo_codes', `DELETE FROM promo_codes WHERE user_id=$1`],
  ['media', `DELETE FROM media WHERE user_id=$1`],
  ['merchant_calendar_integrations', `DELETE FROM merchant_calendar_integrations WHERE user_id=$1`],
  ['merchant_announcement', `DELETE FROM merchant_announcement WHERE user_id=$1`],
  ['push_subscriptions', `DELETE FROM push_subscriptions WHERE user_id=$1`],
  ['app_notifications', `DELETE FROM app_notifications WHERE user_id=$1`],
  ['notification_log', `DELETE FROM notification_log WHERE user_id=$1`],
  ['notification_settings', `DELETE FROM notification_settings WHERE user_id=$1`],
  ['user_pins', `DELETE FROM user_pins WHERE user_id=$1`],
  ['verification_codes', `
    DELETE FROM verification_codes
     WHERE key IN (
       'chg_email_' || $1,
       'pin_chg_' || $1,
       'pin_forgot_' || $1,
       'rst_' || LOWER($3),
       'reg_' || LOWER($3)
     )
        OR data->>'userId' = $1
        OR LOWER(COALESCE(data->>'email', '')) = LOWER($3)
  `],
  ['employee_pins', `DELETE FROM employee_pins WHERE user_id=$1`],
  ['employee_commissions', `DELETE FROM employee_commissions WHERE user_id=$1`],
  ['service_commissions', `DELETE FROM service_commissions WHERE user_id=$1`],
  ['employee_time_slots', `DELETE FROM employee_time_slots WHERE user_id=$1`],
  ['employee_hours', `DELETE FROM employee_hours WHERE user_id=$1`],
  ['employee_availability', `DELETE FROM employee_availability WHERE user_id=$1`],
  ['employee_absences', `DELETE FROM employee_absences WHERE user_id=$1`],
  ['employees', `DELETE FROM employees WHERE user_id=$1`],
  ['booking_service_categories', `DELETE FROM booking_service_categories WHERE user_id=$1`],
  ['booking_services', `DELETE FROM booking_services WHERE user_id=$1`],
  ['categories', `DELETE FROM categories WHERE user_id=$1`],
  ['booking_slug_aliases', `DELETE FROM booking_slug_aliases WHERE user_id=$1`],
  ['business_breaks', `DELETE FROM business_breaks WHERE user_id=$1`],
  ['business_hours', `DELETE FROM business_hours WHERE user_id=$1`],
  ['booking_settings', `DELETE FROM booking_settings WHERE user_id=$1`],
  ['user_settings', `DELETE FROM user_settings WHERE user_id=$1`],
];

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  return require('stripe')(key);
}

async function safeOne(db, sql, params = [], fallback = {}) {
  try {
    const { rows } = await db.query(sql, params);
    return rows[0] || fallback;
  } catch (e) {
    return { ...fallback, _error: e.message };
  }
}

async function safeCount(db, table, userId) {
  const row = await safeOne(db, `SELECT COUNT(*)::int AS n FROM ${table} WHERE user_id=$1`, [userId], { n: 0 });
  return Number(row.n || 0);
}

function sumStripeBalance(list, currency = 'eur') {
  return (list || [])
    .filter((b) => String(b.currency || '').toLowerCase() === currency)
    .reduce((sum, b) => sum + Number(b.amount || 0), 0);
}

async function getStripeBalance(accountId) {
  if (!accountId) return { available_cents: 0, pending_cents: 0, currency: 'eur', checked: false };
  try {
    const stripe = getStripe();
    const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
    return {
      available_cents: sumStripeBalance(balance.available, 'eur'),
      pending_cents: sumStripeBalance(balance.pending, 'eur'),
      currency: 'eur',
      checked: true,
    };
  } catch (e) {
    return {
      available_cents: null,
      pending_cents: null,
      currency: 'eur',
      checked: false,
      error: e.message || String(e),
    };
  }
}

function cents(n) {
  return Number(n || 0);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function buildBlockers(preview, { ignoreFutureOnlinePaid = false } = {}) {
  const blockers = [];
  const finance = preview?.finance || {};
  const stripeBalance = finance.stripe_balance || {};

  if (!ignoreFutureOnlinePaid && finance.future_online_paid_count > 0) {
    blockers.push({
      code: 'future_online_paid',
      message: `${finance.future_online_paid_count} RDV futur(s) paye(s) en ligne doivent etre rembourses avant suppression.`,
    });
  }
  if (finance.failed_refunds_unresolved_count > 0) {
    blockers.push({
      code: 'failed_refunds',
      message: `${finance.failed_refunds_unresolved_count} remboursement(s) Stripe echoue(s) sont encore a traiter.`,
    });
  }
  if (finance.appointment_payouts_pending_count > 0) {
    blockers.push({
      code: 'pending_appointment_payouts',
      message: `${finance.appointment_payouts_pending_count} reversement(s) RDV sont encore en attente.`,
    });
  }
  if (finance.payouts_in_transit_count > 0) {
    blockers.push({
      code: 'payouts_in_transit',
      message: `${finance.payouts_in_transit_count} payout(s) Stripe sont encore en transit.`,
    });
  }
  if (preview?.merchant?.stripe_account_id && stripeBalance.checked === false) {
    blockers.push({
      code: 'stripe_balance_unknown',
      message: `Solde Stripe Connect impossible a verifier : ${stripeBalance.error || 'erreur inconnue'}.`,
    });
  } else if (cents(stripeBalance.available_cents) + cents(stripeBalance.pending_cents) > 0) {
    blockers.push({
      code: 'stripe_balance_nonzero',
      message: `Le compte Stripe Connect a encore un solde (${cents(stripeBalance.available_cents)}c disponible, ${cents(stripeBalance.pending_cents)}c en attente).`,
    });
  }
  if (
    !process.env.STRIPE_SECRET_KEY &&
    (preview?.merchant?.stripe_subscription_id || preview?.merchant?.stripe_customer_id)
  ) {
    blockers.push({
      code: 'stripe_platform_key_missing',
      message: 'Cle Stripe plateforme manquante : abonnement/customer Stripe impossible a verifier ou supprimer.',
    });
  }
  return blockers;
}

async function collectMerchantDeletePreview(db, userId) {
  const { rows } = await db.query(
    `SELECT id, email, business_name, stripe_account_id, stripe_customer_id,
            stripe_subscription_id, subscription_status, deletion_requested_at
       FROM users
      WHERE id=$1
      LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  const merchant = rows[0];

  const counts = {};
  await Promise.all(USER_SCOPED_TABLES.map(async (table) => {
    counts[table] = await safeCount(db, table, userId);
  }));

  counts.appointment_items = Number((await safeOne(db, `
    SELECT COUNT(*)::int AS n
      FROM appointment_items ai
      JOIN appointments a ON a.id = ai.appointment_id
     WHERE a.user_id=$1
  `, [userId], { n: 0 })).n || 0);
  counts.transaction_items = Number((await safeOne(db, `
    SELECT COUNT(*)::int AS n
      FROM transaction_items ti
      JOIN transactions t ON t.id = ti.transaction_id
     WHERE t.user_id=$1
  `, [userId], { n: 0 })).n || 0);
  counts.transaction_payments = Number((await safeOne(db, `
    SELECT COUNT(*)::int AS n
      FROM transaction_payments tp
      JOIN transactions t ON t.id = tp.transaction_id
     WHERE t.user_id=$1
  `, [userId], { n: 0 })).n || 0);
  counts.ai_campaign_codes = Number((await safeOne(db, `
    SELECT COUNT(*)::int AS n
      FROM ai_campaign_codes acc
      JOIN ai_campaigns ac ON ac.id = acc.ai_campaign_id
     WHERE ac.user_id=$1
  `, [userId], { n: 0 })).n || 0);
  counts.client_connected_customers = merchant.stripe_account_id
    ? Number((await safeOne(db, `
        SELECT COUNT(*)::int AS n
          FROM client_connected_customers
         WHERE connected_account_id=$1
      `, [merchant.stripe_account_id], { n: 0 })).n || 0)
    : 0;
  counts.verification_codes = Number((await safeOne(db, `
    SELECT COUNT(*)::int AS n
      FROM verification_codes
     WHERE key IN (
       'chg_email_' || $1,
       'pin_chg_' || $1,
       'pin_forgot_' || $1,
       'rst_' || LOWER($2),
       'reg_' || LOWER($2)
     )
        OR data->>'userId' = $1
        OR LOWER(COALESCE(data->>'email', '')) = LOWER($2)
  `, [userId, merchant.email || ''], { n: 0 })).n || 0);

  const futureOnline = await safeOne(db, `
    SELECT COUNT(*)::int AS n,
           COALESCE(SUM(paid_amount_cents), 0)::bigint AS amount_cents
      FROM appointments
     WHERE user_id=$1
       AND stripe_payment_intent_id IS NOT NULL
       AND payment_status = 'paid'
       AND COALESCE(status, '') NOT IN ('cancelled','completed')
       AND date >= CURRENT_DATE
  `, [userId], { n: 0, amount_cents: 0 });

  const apptPayouts = await safeOne(db, `
    SELECT
      COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
      COALESCE(SUM(amount_cents) FILTER (WHERE status='pending'), 0)::bigint AS pending_amount_cents
      FROM appointment_payouts
     WHERE user_id=$1
  `, [userId], { pending_count: 0, pending_amount_cents: 0 });

  const payouts = await safeOne(db, `
    SELECT
      COUNT(*) FILTER (WHERE status IN ('pending','in_transit'))::int AS in_transit_count,
      COALESCE(SUM(amount_cents) FILTER (WHERE status IN ('pending','in_transit')), 0)::bigint AS in_transit_amount_cents
      FROM payouts
     WHERE user_id=$1
  `, [userId], { in_transit_count: 0, in_transit_amount_cents: 0 });

  const failedRefunds = await safeOne(db, `
    SELECT COUNT(*)::int AS n
      FROM failed_refunds
     WHERE user_id=$1 AND resolved_at IS NULL
  `, [userId], { n: 0 });

  const stripeBalance = await getStripeBalance(merchant.stripe_account_id);

  const preview = {
    merchant,
    counts,
    finance: {
      future_online_paid_count: Number(futureOnline.n || 0),
      future_online_paid_amount_cents: Number(futureOnline.amount_cents || 0),
      appointment_payouts_pending_count: Number(apptPayouts.pending_count || 0),
      appointment_payouts_pending_amount_cents: Number(apptPayouts.pending_amount_cents || 0),
      payouts_in_transit_count: Number(payouts.in_transit_count || 0),
      payouts_in_transit_amount_cents: Number(payouts.in_transit_amount_cents || 0),
      failed_refunds_unresolved_count: Number(failedRefunds.n || 0),
      stripe_balance: stripeBalance,
    },
    retention: {
      mode: 'saas_closure_then_purge',
      days: RETENTION_DAYS,
      requested_at: merchant.deletion_requested_at || null,
      scheduled_purge_at: merchant.deletion_requested_at
        ? addDays(merchant.deletion_requested_at, RETENTION_DAYS).toISOString()
        : addDays(new Date(), RETENTION_DAYS).toISOString(),
      export_window: 'Export disponible avant purge definitive.',
    },
  };
  preview.blockers = buildBlockers(preview);
  return preview;
}

async function revokeGoogleCalendarToken(db, userId) {
  const warnings = [];
  try {
    const { rows } = await db.query(
      `SELECT access_token_enc FROM merchant_calendar_integrations
        WHERE user_id=$1 AND provider='google' LIMIT 1`,
      [userId]
    );
    if (rows.length) {
      try {
        const { decrypt } = require('./tokenCrypto');
        const accessToken = decrypt(rows[0].access_token_enc);
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: accessToken }),
        }).catch(() => {});
      } catch (e) {
        warnings.push({ code: 'google_revoke_failed', message: e.message || String(e) });
      }
    }
  } catch (e) {
    warnings.push({ code: 'google_lookup_failed', message: e.message || String(e) });
  }
  return warnings;
}

async function cleanupMediaResources(db, userId) {
  const warnings = [];
  let rows = [];
  try {
    ({ rows } = await db.query(`SELECT path, provider FROM media WHERE user_id=$1`, [userId]));
  } catch (e) {
    return [{ code: 'media_lookup_failed', message: e.message || String(e) }];
  }

  const uploadDir = path.join(process.cwd(), 'uploads');
  for (const row of rows) {
    if (!row.path) continue;
    try {
      if (row.provider === 'cloudinary') {
        const cloudinary = require('cloudinary').v2;
        await cloudinary.uploader.destroy(row.path, { resource_type: 'image', invalidate: true });
      } else {
        const root = path.resolve(uploadDir);
        const fullPath = path.resolve(uploadDir, row.path);
        if (fullPath.startsWith(root + path.sep) && fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      }
    } catch (e) {
      warnings.push({ code: 'media_delete_failed', path: row.path, message: e.message || String(e) });
    }
  }
  return warnings;
}

async function cleanupStripePlatform(merchant, options = {}) {
  const warnings = [];
  if (!process.env.STRIPE_SECRET_KEY) {
    if (merchant.stripe_subscription_id || merchant.stripe_customer_id) {
      throw Object.assign(new Error('Cle Stripe plateforme manquante.'), {
        code: 'stripe_platform_key_missing',
      });
    }
    return warnings;
  }
  const stripe = getStripe();

  if (merchant.stripe_subscription_id) {
    if (!options.cancel_subscription) {
      throw Object.assign(new Error('Abonnement Stripe actif : cochez l annulation Stripe.'), {
        code: 'subscription_active',
      });
    }
    try {
      await stripe.subscriptions.cancel(merchant.stripe_subscription_id, { prorate: true });
    } catch (e) {
      warnings.push({ code: 'stripe_subscription_cancel_failed', message: e.message || String(e) });
      throw Object.assign(new Error('Impossible d annuler l abonnement Stripe.'), {
        code: 'subscription_cancel_failed',
      });
    }
  }

  if (options.delete_stripe_customer && merchant.stripe_customer_id) {
    try {
      await stripe.customers.del(merchant.stripe_customer_id);
    } catch (e) {
      warnings.push({ code: 'stripe_customer_delete_failed', message: e.message || String(e) });
    }
  }

  if (options.delete_connect_account && merchant.stripe_account_id) {
    try {
      await stripe.accounts.del(merchant.stripe_account_id);
    } catch (delErr) {
      try {
        await stripe.accounts.reject(merchant.stripe_account_id, { reason: 'other' });
        warnings.push({ code: 'stripe_connect_rejected', message: 'Compte Connect rejete faute de suppression directe possible.' });
      } catch (rejectErr) {
        warnings.push({
          code: 'stripe_connect_delete_failed',
          message: rejectErr.message || delErr.message || String(rejectErr),
        });
      }
    }
  }
  return warnings;
}

async function refundFutureOnlineAppointments(db, userId) {
  const { rows } = await db.query(`
    SELECT id
      FROM appointments
     WHERE user_id=$1
       AND stripe_payment_intent_id IS NOT NULL
       AND payment_status = 'paid'
       AND COALESCE(status, '') NOT IN ('cancelled','completed')
       AND date >= CURRENT_DATE
     ORDER BY date ASC, start_time ASC
  `, [userId]);

  const results = [];
  for (const row of rows) {
    const result = await refundAppointment(db, row.id, 'admin_gdpr_delete');
    results.push({ appointment_id: row.id, ...result });
  }
  return results;
}

async function disableOperationalAccess(pool, userId, adminId, reason) {
  const scheduledAt = new Date();
  const scheduledFor = addDays(scheduledAt, RETENTION_DAYS);
  const frozenReason = `Suppression RGPD programmee: ${reason}`.slice(0, 500);

  await pool.query(`
    UPDATE users
       SET deletion_requested_at = COALESCE(deletion_requested_at, NOW()),
           is_frozen = TRUE,
           frozen_reason = $2,
           frozen_at = COALESCE(frozen_at, NOW()),
           frozen_by_admin_id = COALESCE(frozen_by_admin_id, $3),
           google_id = NULL,
           avatar_url = NULL
     WHERE id=$1
  `, [userId, frozenReason, adminId || null]);

  await pool.query(`UPDATE booking_settings SET is_enabled=FALSE WHERE user_id=$1`, [userId]).catch(() => {});
  await pool.query(`DELETE FROM push_subscriptions WHERE user_id=$1`, [userId]).catch(() => {});
  await pool.query(`
    DELETE FROM campaign_queue
     WHERE user_id=$1 AND COALESCE(status, 'pending') IN ('pending','scheduled')
  `, [userId]).catch(() => {});

  return {
    requested_at: scheduledAt.toISOString(),
    scheduled_purge_at: scheduledFor.toISOString(),
    retention_days: RETENTION_DAYS,
  };
}

async function scheduleMerchantDeletion(pool, userId, options = {}) {
  const preview = await collectMerchantDeletePreview(pool, userId);
  if (!preview) return { notFound: true };

  let refundResults = [];
  if (preview.finance.future_online_paid_count > 0) {
    if (!options.refund_future_online_payments) {
      return {
        blocked: true,
        preview,
        blockers: buildBlockers(preview),
      };
    }
    refundResults = await refundFutureOnlineAppointments(pool, userId);
    const failed = refundResults.filter((r) => !r.ok);
    if (failed.length) {
      const refreshed = await collectMerchantDeletePreview(pool, userId);
      return {
        blocked: true,
        preview: refreshed,
        blockers: [{ code: 'refund_failed', message: `${failed.length} remboursement(s) automatique(s) ont echoue.` }],
        refund_results: refundResults,
      };
    }
  }

  const refreshed = await collectMerchantDeletePreview(pool, userId);
  const blockers = buildBlockers(refreshed, { ignoreFutureOnlinePaid: true });
  if (refreshed.merchant.stripe_subscription_id && !options.cancel_subscription) {
    blockers.push({
      code: 'subscription_active',
      message: 'Abonnement Stripe plateforme actif : cochez l annulation Stripe avant suppression.',
    });
  }
  if (blockers.length) {
    return { blocked: true, preview: refreshed, blockers, refund_results: refundResults };
  }

  const warnings = [
    ...await revokeGoogleCalendarToken(pool, userId),
    ...await cleanupStripePlatform(refreshed.merchant, {
      ...options,
      delete_stripe_customer: false,
      delete_connect_account: false,
    }),
  ];
  if (options.cancel_subscription && refreshed.merchant.stripe_subscription_id) {
    await pool.query(`
      UPDATE users
         SET subscription_status='canceled',
             stripe_subscription_id=NULL,
             subscription_cancel_at_period_end=FALSE
       WHERE id=$1
    `, [userId]).catch(() => {});
  }
  await pool.query(`DELETE FROM merchant_calendar_integrations WHERE user_id=$1`, [userId]).catch(() => {});

  const retention = await disableOperationalAccess(
    pool,
    userId,
    options.admin_id,
    options.reason || 'suppression RGPD'
  );

  return {
    ok: true,
    scheduled: true,
    preview: refreshed,
    warnings,
    refund_results: refundResults,
    retention,
  };
}

async function deleteMerchantDatabaseRows(pool, userId, stripeAccountId, email) {
  const client = await pool.connect();
  const deleted = {};
  try {
    await client.query('BEGIN');
    const lock = await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    if (!lock.rows.length) {
      await client.query('ROLLBACK');
      return { deleted: {}, notFound: true };
    }

    await client.query(`
      UPDATE admin_audit_log
         SET payload_before = NULL,
             payload_after = jsonb_build_object('redacted_by', 'merchant.gdpr_delete'),
             error_message = NULL
       WHERE target_type='merchant'
         AND target_id=$1
         AND action NOT IN ('merchant.gdpr_delete', 'merchant.gdpr_delete_scheduled', 'merchant.gdpr_purge')
    `, [userId]).catch(() => {});

    for (const [name, sql] of DELETE_STEPS) {
      try {
        const args = sql.includes('$3')
          ? [userId, stripeAccountId || '', email || '']
          : (sql.includes('$2') ? [userId, stripeAccountId || ''] : [userId]);
        const r = await client.query(sql, args);
        deleted[name] = (deleted[name] || 0) + (r.rowCount || 0);
      } catch (e) {
        if (!/does not exist|n'existe pas|relation .* does not exist|column .* does not exist/i.test(e.message || '')) throw e;
        deleted[name] = deleted[name] || 0;
      }
    }

    const rUser = await client.query(`DELETE FROM users WHERE id=$1`, [userId]);
    deleted.users = rUser.rowCount || 0;
    await client.query('COMMIT');
    return { deleted, notFound: false };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function hardDeleteMerchant(pool, userId, options = {}) {
  const preview = await collectMerchantDeletePreview(pool, userId);
  if (!preview) return { notFound: true };

  let refundResults = [];
  if (preview.finance.future_online_paid_count > 0) {
    if (!options.refund_future_online_payments) {
      return {
        blocked: true,
        preview,
        blockers: buildBlockers(preview),
      };
    }
    refundResults = await refundFutureOnlineAppointments(pool, userId);
    const failed = refundResults.filter((r) => !r.ok);
    if (failed.length) {
      const refreshed = await collectMerchantDeletePreview(pool, userId);
      return {
        blocked: true,
        preview: refreshed,
        blockers: [{ code: 'refund_failed', message: `${failed.length} remboursement(s) automatique(s) ont echoue.` }],
        refund_results: refundResults,
      };
    }
  }

  const refreshed = await collectMerchantDeletePreview(pool, userId);
  const blockers = buildBlockers(refreshed, { ignoreFutureOnlinePaid: true });
  if (refreshed.merchant.stripe_subscription_id && !options.cancel_subscription) {
    blockers.push({
      code: 'subscription_active',
      message: 'Abonnement Stripe plateforme actif : cochez l annulation Stripe avant suppression.',
    });
  }
  if (blockers.length) {
    return { blocked: true, preview: refreshed, blockers, refund_results: refundResults };
  }

  const warnings = [
    ...await revokeGoogleCalendarToken(pool, userId),
    ...await cleanupMediaResources(pool, userId),
    ...await cleanupStripePlatform(refreshed.merchant, options),
  ];

  const dbResult = await deleteMerchantDatabaseRows(
    pool,
    userId,
    refreshed.merchant.stripe_account_id,
    refreshed.merchant.email
  );
  return {
    ok: true,
    notFound: dbResult.notFound,
    preview: refreshed,
    deleted: dbResult.deleted,
    warnings,
    refund_results: refundResults,
  };
}

module.exports = {
  DELETE_PHRASE,
  RETENTION_DAYS,
  buildBlockers,
  collectMerchantDeletePreview,
  hardDeleteMerchant,
  scheduleMerchantDeletion,
};
