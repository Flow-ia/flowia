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
// Ordre de priorité :
//  1. Octroi superadmin (subscription_admin_grant non expiré) → renvoie son plan
//  2. Sub Stripe active|trialing avec un plan → renvoie ce plan
//  3. Fallback → 'decouverte' (gratuit)
async function getEffectivePlan(userId) {
  const { rows } = await pool.query(
    `SELECT subscription_status, subscription_plan, subscription_admin_grant
     FROM users WHERE id=$1`,
    [userId]
  );
  if (!rows.length) return null;
  const { subscription_status, subscription_plan, subscription_admin_grant } = rows[0];

  // Octroi superadmin prioritaire (gratuit pour le marchand).
  if (subscription_admin_grant) {
    const expiresAt = subscription_admin_grant.expires_at;
    const stillValid = !expiresAt || new Date(expiresAt) > new Date();
    if (stillValid && subscription_admin_grant.plan) {
      return subscription_admin_grant.plan;
    }
  }

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

// Variante : ne gate que les ECRITURES (POST/PUT/PATCH/DELETE). Les lectures
// (GET/HEAD) restent ouvertes pour que les pages de la feature puissent
// s'afficher en read-only meme pour les plans inferieurs (UX soft-gating :
// le user voit ce qu'il aurait avec, plutot qu'un 402 brutal a l'ouverture).
function requirePlanWrites(...allowedPlans) {
  const guard = requirePlan(...allowedPlans);
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }
    return guard(req, res, next);
  };
}

// ── Commission FlowIA selon plan d'abonnement ───────────────────────────────
// Regle metier : plan Decouverte (gratuit) = commission active sur chaque
// paiement RDV en ligne (application_fee_amount). Plans payants Essentiel
// et Equipe = 0% commission. Le taux Decouverte est configurable via ENV
// COMMISSION_RATE_DECOUVERTE (fallback 2%). Cap dur 30% pour eviter une
// config aberrante.
const COMMISSION_RATE_DECOUVERTE = (() => {
  const raw = parseFloat(process.env.COMMISSION_RATE_DECOUVERTE);
  if (!Number.isFinite(raw) || raw < 0) return 2;
  return Math.min(30, raw);
})();

// Retourne le taux de commission applicable (en %) au merchant donne, en
// fonction de son plan effectif. Source de verite vs lecture brute de
// users.commission_rate : permet de bouger la grille tarifaire sans
// migrations.
//  - Decouverte → COMMISSION_RATE_DECOUVERTE (defaut 2%)
//  - Essentiel  → 0
//  - Equipe     → 0
async function getApplicableCommissionRate(userId) {
  const plan = await getEffectivePlan(userId);
  if (plan === 'essentiel' || plan === 'equipe') return 0;
  return COMMISSION_RATE_DECOUVERTE;
}

module.exports = {
  getEffectivePlan,
  requirePlan,
  requirePlanWrites,
  requirePaidPlan,
  requireEquipePlan,
  getApplicableCommissionRate,
  COMMISSION_RATE_DECOUVERTE,
  PLANS,
  PLAN_RANK,
};
