// middleware/subscription.js — Gating fonctionnalités selon le plan d'abonnement
//
// Usage typique (à appliquer à terme sur les routes payantes) :
//
//   const { requirePlan } = require('../middleware/subscription');
//   router.post('/api/campaigns', authMiddleware, requirePlan('essentiel', 'equipe'), handler);
//
// Pour l'instant ce middleware est CRÉÉ mais NON APPLIQUÉ aux routes existantes
// (refactor chirurgical à faire plan par plan, validation utilisateur requise).
const { pool } = require('../db');

// Plans autorisés (validation simple).
const PLANS = ['decouverte', 'essentiel', 'equipe'];

// Hiérarchie : equipe > essentiel > decouverte. Si une feature requiert
// 'essentiel', un user 'equipe' y a aussi droit.
const PLAN_RANK = { decouverte: 0, essentiel: 1, equipe: 2 };

// Helper : récupère le plan effectif d'un user.
// - subscription_status active|trialing → renvoie le plan payé (essentiel|equipe)
// - sinon → 'decouverte' (gratuit, par défaut)
async function getEffectivePlan(userId) {
  const { rows } = await pool.query(
    `SELECT subscription_status, subscription_plan
     FROM users WHERE id=$1`,
    [userId]
  );
  if (!rows.length) return null;
  const { subscription_status, subscription_plan } = rows[0];
  if (['active', 'trialing'].includes(subscription_status) && subscription_plan) {
    return subscription_plan;
  }
  return 'decouverte';
}

// Middleware factory : exige que le plan effectif soit dans la liste fournie.
// Renvoie 402 Payment Required si le plan n'est pas suffisant (avec hint sur
// le plan minimum requis pour que le frontend redirige vers /abonnement).
function requirePlan(...allowedPlans) {
  if (!allowedPlans.length) throw new Error('requirePlan: au moins 1 plan requis');
  for (const p of allowedPlans) {
    if (!PLANS.includes(p)) throw new Error('requirePlan: plan invalide ' + p);
  }
  return async (req, res, next) => {
    try {
      if (!req.user?.userId) return res.status(401).json({ error: 'Non authentifié' });
      const plan = await getEffectivePlan(req.user.userId);
      if (!plan) return res.status(404).json({ error: 'Compte introuvable' });
      if (allowedPlans.includes(plan)) return next();
      // Plan insuffisant → 402, frontend redirige vers /abonnement
      const minRequired = allowedPlans.reduce(
        (acc, p) => (PLAN_RANK[p] < PLAN_RANK[acc] ? p : acc),
        allowedPlans[0]
      );
      return res.status(402).json({
        error:           'Abonnement insuffisant pour cette fonctionnalité',
        currentPlan:     plan,
        requiredPlan:    minRequired,
        upgradeUrl:      '/abonnement',
      });
    } catch (e) {
      console.error('[SUB MIDDLEWARE]', e.message);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  };
}

// Middleware : exige juste qu'un abonnement payé soit actif (peu importe le plan).
// Equivalent à requirePlan('essentiel', 'equipe').
function requirePaidPlan() {
  return requirePlan('essentiel', 'equipe');
}

// Middleware : exige le plan Équipe (multi-sites, anniversaire, IA avancée, API).
function requireEquipePlan() {
  return requirePlan('equipe');
}

module.exports = {
  getEffectivePlan,
  requirePlan,
  requirePaidPlan,
  requireEquipePlan,
  PLANS,
  PLAN_RANK,
};
