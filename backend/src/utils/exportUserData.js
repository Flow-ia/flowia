// Export RGPD article 20 (portabilite) : assemble en JSON l'integralite des
// donnees liees a un commerçant. Format structure + machine-readable + lisible
// humain. Le commercant peut le telecharger avant suppression de son compte,
// ou a tout moment depuis Reglages > Mon compte.
//
// EXCLU pour des raisons de securite ou inutilite :
//   - users.password_hash               (hash bcrypt, useless out of FlowIA)
//   - user_pins.pin_hash                (idem)
//   - employee_pins.pin_hash            (idem)
//   - merchant_calendar_integrations.access_token_enc / refresh_token_enc
//                                       (tokens chiffres, useless sans la cle)
//   - push_subscriptions.p256dh / auth_key
//                                       (cles cryptographiques device)
//   - all stripe_* webhook signatures, idempotency keys, etc.
//
// Format de sortie :
//   {
//     export_version: "1.0",
//     exported_at: "ISO8601",
//     merchant_id: "uuid",
//     profile: { ... },
//     settings: { ... },
//     team: { ... },
//     catalog: { ... },
//     clients: { ... },
//     appointments: { ... },
//     transactions: { ... },
//     marketing: { ... },
//     finance: { ... },
//     audit: { ... },
//     misc: { ... },
//   }

async function safeAll(pool, queries) {
  // Lance les SELECT en parallele, capture errors per-table (table absente,
  // permissions, etc.) pour ne pas faire echouer tout l'export pour une
  // colonne nouvelle non encore deployee.
  const out = {};
  await Promise.all(queries.map(async ([key, sql, params]) => {
    try {
      const { rows } = await pool.query(sql, params || []);
      out[key] = rows;
    } catch (e) {
      out[key] = { _error: e.message };
    }
  }));
  return out;
}

async function exportAllUserData(pool, userId) {
  // ── 1) Profile (users sans password) ──────────────────────────────────────
  const { rows: userRows } = await pool.query(
    `SELECT id, email, business_name, business_type, phone, address, city,
            postal_code, country, lat, lng, google_business_url, first_name,
            last_name, avatar_url, created_at, onboarding_completed,
            setup_completed, tour_completed,
            subscription_status, subscription_plan, subscription_period,
            subscription_current_period_end, subscription_trial_ends_at,
            subscription_cancel_at_period_end, sms_balance,
            stripe_charges_enabled, stripe_payouts_enabled,
            stripe_account_connected_at, online_payments_enabled,
            commission_rate, payout_hold_days,
            deletion_requested_at
       FROM users WHERE id=$1`,
    [userId]
  );
  if (!userRows.length) throw new Error('Compte introuvable');
  const profile = userRows[0];

  // ── 2) Tous les selects en parallele (1 par table user-scoped) ────────────
  const data = await safeAll(pool, [
    // Settings
    ['user_settings',          `SELECT * FROM user_settings WHERE user_id=$1`, [userId]],
    ['booking_settings',       `SELECT * FROM booking_settings WHERE user_id=$1`, [userId]],
    ['notification_settings',  `SELECT * FROM notification_settings WHERE user_id=$1`, [userId]],

    // Team
    ['employees',              `SELECT id, name, role, phone, email, avatar_color,
                                       can_cancel, can_modify, can_encash,
                                       can_grant_credit, can_repay_credit,
                                       show_on_booking, show_in_caisse,
                                       created_at
                                  FROM employees WHERE user_id=$1 ORDER BY created_at`, [userId]],
    ['employee_hours',         `SELECT * FROM employee_hours WHERE user_id=$1`, [userId]],
    ['employee_absences',      `SELECT * FROM employee_absences WHERE user_id=$1`, [userId]],
    ['employee_availability',  `SELECT * FROM employee_availability WHERE user_id=$1`, [userId]],
    ['employee_time_slots',    `SELECT * FROM employee_time_slots WHERE user_id=$1`, [userId]],

    // Catalog
    ['categories',                 `SELECT * FROM categories WHERE user_id=$1 ORDER BY sort_order, created_at`, [userId]],
    ['booking_services',           `SELECT * FROM booking_services WHERE user_id=$1 ORDER BY sort_order, created_at`, [userId]],
    ['booking_service_categories', `SELECT * FROM booking_service_categories WHERE user_id=$1`, [userId]],
    ['booking_slug_aliases',       `SELECT * FROM booking_slug_aliases WHERE user_id=$1`, [userId]],
    ['business_hours',             `SELECT * FROM business_hours WHERE user_id=$1 ORDER BY day_of_week`, [userId]],
    ['business_breaks',            `SELECT * FROM business_breaks WHERE user_id=$1`, [userId]],
    ['service_commissions',        `SELECT * FROM service_commissions WHERE user_id=$1`, [userId]],

    // Clients (PII)
    ['client_accounts',  `SELECT id, email, first_name, last_name, phone, birth_date,
                                  postal_code, city, notes, total_visits, total_spent,
                                  is_booking_blocked, marketing_opt_in, created_at
                             FROM client_accounts WHERE user_id=$1`, [userId]],
    ['client_notes',     `SELECT * FROM client_notes WHERE user_id=$1`, [userId]],
    ['client_credits',   `SELECT * FROM client_credits WHERE user_id=$1`, [userId]],
    ['credit_transactions', `SELECT * FROM credit_transactions WHERE user_id=$1`, [userId]],
    ['client_loyalty',   `SELECT * FROM client_loyalty WHERE user_id=$1`, [userId]],
    ['client_rewards',   `SELECT * FROM client_rewards WHERE user_id=$1`, [userId]],

    // Appointments + items
    ['appointments',      `SELECT * FROM appointments WHERE user_id=$1 ORDER BY date, start_time`, [userId]],
    ['appointment_items', `SELECT ai.* FROM appointment_items ai
                            JOIN appointments a ON a.id = ai.appointment_id
                            WHERE a.user_id=$1`, [userId]],
    ['appointment_payouts', `SELECT * FROM appointment_payouts WHERE user_id=$1`, [userId]],

    // Transactions + items + payments + audit
    ['transactions',          `SELECT * FROM transactions WHERE user_id=$1 ORDER BY date DESC, time DESC`, [userId]],
    ['transaction_items',     `SELECT ti.* FROM transaction_items ti
                                JOIN transactions t ON t.id = ti.transaction_id
                                WHERE t.user_id=$1`, [userId]],
    ['transaction_payments',  `SELECT tp.* FROM transaction_payments tp
                                JOIN transactions t ON t.id = tp.transaction_id
                                WHERE t.user_id=$1`, [userId]],
    ['transaction_audit_log', `SELECT * FROM transaction_audit_log WHERE user_id=$1`, [userId]],

    // Marketing / Programmes
    ['promo_codes',         `SELECT * FROM promo_codes WHERE user_id=$1`, [userId]],
    ['promo_usage_logs',    `SELECT * FROM promo_usage_logs WHERE user_id=$1`, [userId]],
    ['loyalty_programs',    `SELECT * FROM loyalty_programs WHERE user_id=$1`, [userId]],
    ['referral_programs',   `SELECT * FROM referral_programs WHERE user_id=$1`, [userId]],
    ['referral_codes',      `SELECT * FROM referral_codes WHERE user_id=$1`, [userId]],
    ['referral_uses',       `SELECT * FROM referral_uses WHERE user_id=$1`, [userId]],
    ['birthday_campaigns',  `SELECT * FROM birthday_campaigns WHERE user_id=$1`, [userId]],
    ['ai_campaigns',        `SELECT * FROM ai_campaigns WHERE user_id=$1`, [userId]],
    ['ai_campaign_codes',   `SELECT acc.* FROM ai_campaign_codes acc
                              JOIN ai_campaigns ac ON ac.id = acc.ai_campaign_id
                              WHERE ac.user_id=$1`, [userId]],
    ['campaigns',           `SELECT * FROM campaigns WHERE user_id=$1`, [userId]],
    ['campaign_queue',      `SELECT id, campaign_id, client_email, client_phone,
                                    client_name, message, status, scheduled_date,
                                    sent_at, created_at
                               FROM campaign_queue WHERE user_id=$1`, [userId]],
    ['message_log',         `SELECT id, campaign_id, phone, email, channel, cost,
                                    status, sent_at FROM message_log WHERE user_id=$1`, [userId]],

    // Finance
    ['payouts',          `SELECT * FROM payouts WHERE user_id=$1 ORDER BY arrival_date DESC`, [userId]],
    ['financial_ledger', `SELECT * FROM financial_ledger WHERE user_id=$1 ORDER BY occurred_at DESC`, [userId]],
    ['sms_transactions', `SELECT * FROM sms_transactions WHERE user_id=$1`, [userId]],
    ['failed_refunds',   `SELECT * FROM failed_refunds WHERE user_id=$1`, [userId]],

    // Notifications / Audit
    ['notification_log',     `SELECT * FROM notification_log WHERE user_id=$1 ORDER BY sent_at DESC LIMIT 5000`, [userId]],
    ['app_notifications',    `SELECT * FROM app_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5000`, [userId]],
    ['client_audit_log',     `SELECT * FROM client_audit_log WHERE user_id=$1`, [userId]],
    ['marketing_optout_log', `SELECT * FROM marketing_optout_log WHERE user_id=$1`, [userId]],

    // Divers
    ['merchant_announcement', `SELECT * FROM merchant_announcement WHERE user_id=$1`, [userId]],
    ['merchant_debt_records', `SELECT * FROM merchant_debt_records WHERE user_id=$1`, [userId]],
    ['merchant_calendar_integrations',
       `SELECT user_id, provider, google_account_email, sync_enabled, last_sync_at, created_at
          FROM merchant_calendar_integrations WHERE user_id=$1`, [userId]],
    ['media',                 `SELECT id, type, ref_id, path, provider, created_at
                                 FROM media WHERE user_id=$1`, [userId]],
  ]);

  return {
    export_version: '1.0',
    exported_at: new Date().toISOString(),
    merchant_id: userId,
    legal_notice: "Cet export contient l'integralite de vos donnees personnelles "
      + "et professionnelles stockees sur Salon DZ. Loi 18-07 (portabilite). "
      + "Hashes (passwords, PINs), tokens OAuth et cles cryptographiques sont "
      + "exclus car techniques et non reutilisables hors Salon DZ.",
    profile,
    settings: {
      user_settings:         data.user_settings,
      booking_settings:      data.booking_settings,
      notification_settings: data.notification_settings,
    },
    team: {
      employees:             data.employees,
      employee_hours:        data.employee_hours,
      employee_absences:     data.employee_absences,
      employee_availability: data.employee_availability,
      employee_time_slots:   data.employee_time_slots,
    },
    catalog: {
      categories:                  data.categories,
      booking_services:            data.booking_services,
      booking_service_categories:  data.booking_service_categories,
      booking_slug_aliases:        data.booking_slug_aliases,
      business_hours:              data.business_hours,
      business_breaks:             data.business_breaks,
      service_commissions:         data.service_commissions,
    },
    clients: {
      client_accounts:     data.client_accounts,
      client_notes:        data.client_notes,
      client_credits:      data.client_credits,
      credit_transactions: data.credit_transactions,
      client_loyalty:      data.client_loyalty,
      client_rewards:      data.client_rewards,
    },
    appointments: {
      appointments:        data.appointments,
      appointment_items:   data.appointment_items,
      appointment_payouts: data.appointment_payouts,
    },
    transactions: {
      transactions:          data.transactions,
      transaction_items:     data.transaction_items,
      transaction_payments:  data.transaction_payments,
      transaction_audit_log: data.transaction_audit_log,
    },
    marketing: {
      promo_codes:        data.promo_codes,
      promo_usage_logs:   data.promo_usage_logs,
      loyalty_programs:   data.loyalty_programs,
      referral_programs:  data.referral_programs,
      referral_codes:     data.referral_codes,
      referral_uses:      data.referral_uses,
      birthday_campaigns: data.birthday_campaigns,
      ai_campaigns:       data.ai_campaigns,
      ai_campaign_codes:  data.ai_campaign_codes,
      campaigns:          data.campaigns,
      campaign_queue:     data.campaign_queue,
      message_log:        data.message_log,
    },
    finance: {
      payouts:          data.payouts,
      financial_ledger: data.financial_ledger,
      sms_transactions: data.sms_transactions,
      failed_refunds:   data.failed_refunds,
    },
    audit: {
      notification_log:     data.notification_log,
      app_notifications:    data.app_notifications,
      client_audit_log:     data.client_audit_log,
      marketing_optout_log: data.marketing_optout_log,
    },
    misc: {
      merchant_announcement:           data.merchant_announcement,
      merchant_debt_records:           data.merchant_debt_records,
      merchant_calendar_integrations:  data.merchant_calendar_integrations,
      media:                           data.media,
    },
  };
}

module.exports = { exportAllUserData };
