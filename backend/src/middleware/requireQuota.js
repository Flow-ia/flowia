// middleware/requireQuota.js — Quotas metiers par plan d'abonnement.
//
// Applique les limites annoncees sur le site marketing /pricing :
//   - Decouverte : 50 RDV/mois, 1 employe
//   - Essentiel  : RDV illimites, 5 employes
//   - Equipe     : tout illimite
//
// Les counts sont calcules a la volee. Pour les RDV, on ignore les statuts
// 'cancelled' et 'no_show' (sinon un commercant qui annule reste bloque).
//
// Usage middleware (routes authentifiees) :
//   router.post('/', requireQuota('employee'), handler);
//   router.post('/appointments', requireQuota('appointment'), handler);
//
// Usage helper (routes publiques ou userId resolu manuellement) :
//   const q = await checkQuota(userId, 'appointment');
//   if (!q.ok) return res.status(q.status).json(q.payload);
//
// Octroi superadmin (subscription_admin_grant) deja gere via getEffectivePlan
// → un compte offert herite des quotas du plan offert, pas de Decouverte.
//
// Race-condition : le check est non-transactionnel. Sur 2 POST concurrents a
// 49 RDV, les deux peuvent passer et creer 51. Acceptable : tolerance off-by-1
// negligeable vs la complexite d'un SELECT FOR UPDATE sur users + transaction
// englobant l'INSERT appointments. A renforcer si abus constate.
const { pool } = require('../db');
const { getEffectivePlan } = require('./subscription');

const QUOTAS = {
  decouverte: { appointmentsPerMonth: 50,   employees: 1 },
  essentiel:  { appointmentsPerMonth: null, employees: 5 },
  equipe:     { appointmentsPerMonth: null, employees: null },
};

async function countAppointmentsThisMonth(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt
       FROM appointments
      WHERE user_id = $1
        AND date >= date_trunc('month', CURRENT_DATE)::date
        AND date <  (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
        AND status NOT IN ('cancelled', 'no_show')`,
    [userId]
  );
  return rows[0]?.cnt || 0;
}

async function countEmployees(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM employees WHERE user_id = $1`,
    [userId]
  );
  return rows[0]?.cnt || 0;
}

// Helper reutilisable : verifie un quota et renvoie un descripteur uniforme.
// type ∈ { 'appointment', 'employee' }.
async function checkQuota(userId, type) {
  if (!userId) {
    return { ok: false, status: 401, payload: { error: 'Non authentifie' } };
  }
  const plan = await getEffectivePlan(userId);
  if (!plan) {
    return { ok: false, status: 404, payload: { error: 'Compte introuvable' } };
  }
  const quotas = QUOTAS[plan] || QUOTAS.decouverte;

  if (type === 'appointment') {
    const max = quotas.appointmentsPerMonth;
    if (max === null) return { ok: true };
    const current = await countAppointmentsThisMonth(userId);
    if (current >= max) {
      return {
        ok: false,
        status: 402,
        payload: {
          error: `Quota mensuel atteint : ${max} rendez-vous par mois sur le plan ${plan}. Passez sur un plan superieur pour des RDV illimites.`,
          code: 'QUOTA_EXCEEDED',
          quota: 'appointments',
          current,
          limit: max,
          currentPlan: plan,
          upgradeUrl: '/abonnement',
        },
      };
    }
    return { ok: true };
  }

  if (type === 'employee') {
    const max = quotas.employees;
    if (max === null) return { ok: true };
    const current = await countEmployees(userId);
    if (current >= max) {
      return {
        ok: false,
        status: 402,
        payload: {
          error: `Limite d'employes atteinte : ${max} employe${max > 1 ? 's' : ''} maximum sur le plan ${plan}. Passez sur un plan superieur pour en ajouter davantage.`,
          code: 'QUOTA_EXCEEDED',
          quota: 'employees',
          current,
          limit: max,
          currentPlan: plan,
          upgradeUrl: '/abonnement',
        },
      };
    }
    return { ok: true };
  }

  throw new Error(`requireQuota: type inconnu '${type}'`);
}

function requireQuota(type) {
  if (!['appointment', 'employee'].includes(type)) {
    throw new Error(`requireQuota: type inconnu '${type}'`);
  }
  return async function requireQuotaMw(req, res, next) {
    try {
      const userId = req.user?.userId;
      const r = await checkQuota(userId, type);
      if (r.ok) return next();
      return res.status(r.status).json(r.payload);
    } catch (e) {
      console.error('[requireQuota]', type, e.message);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  };
}

module.exports = { requireQuota, checkQuota, QUOTAS };
