// components/PlanGateBanner.jsx — Bannière contextuelle 'Plan X requis'
// pour les pages gated. Lit l'effectivePlan via useAuth, compare au plan
// minimum requis, ne s'affiche que si insuffisant.
//
// Usage :
//   <PlanGateBanner requiredPlan="essentiel" feature="Les SMS clients"/>
//   <PlanGateBanner requiredPlan="equipe"    feature="Le cadeau anniversaire"/>
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// Hierarchie de plan : equipe > essentiel > decouverte.
const PLAN_RANK = { decouverte: 0, essentiel: 1, equipe: 2 };

const PLAN_INFO = {
  essentiel: { name: 'Essentiel', priceMonthly: 24 },
  equipe:    { name: 'Équipe',    priceMonthly: 49 },
};

export default function PlanGateBanner({ requiredPlan, feature, extraBenefits, theme }) {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const t          = theme;
  const effective  = user?.subscription?.effectivePlan || 'decouverte';
  const userRank   = PLAN_RANK[effective] ?? 0;
  const requiredRank = PLAN_RANK[requiredPlan] ?? 1;

  // Plan suffisant -> pas de banniere.
  if (userRank >= requiredRank) return null;

  const info = PLAN_INFO[requiredPlan] || PLAN_INFO.essentiel;
  // Couleurs : Essentiel = bleu (info), Equipe = violet plus premium.
  const palette = requiredPlan === 'equipe'
    ? { bg: '#f5f3ff', border: '#ddd6fe', accent: '#6d28d9', textHi: '#4c1d95', textLo: '#5b21b6' }
    : { bg: '#eff6ff', border: '#bfdbfe', accent: '#1e40af', textHi: '#1e3a8a', textLo: '#1e40af' };

  const benefitsLine = extraBenefits ? ` Vous bénéficierez aussi de ${extraBenefits}.` : '';

  return (
    <div style={{
      background: palette.bg, border: `1px solid ${palette.border}`,
      borderRadius: 12, padding: '14px 18px', marginBottom: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <p style={{ fontSize: 11, color: palette.accent, fontWeight: 600, margin: 0,
                    textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {`Plan ${info.name} requis`}
        </p>
        <p style={{ fontSize: 13, color: palette.textHi, margin: '4px 0 0', lineHeight: 1.5,
                    fontWeight: 500 }}>
          {`${feature || 'Cette fonctionnalité'} est inclus(e) à partir du plan ${info.name} (${info.priceMonthly} €/mois).${benefitsLine}`}
        </p>
      </div>
      <button onClick={() => navigate(`/abonnement?plan=${requiredPlan}&period=monthly`)}
              style={{ padding: '9px 16px', fontSize: 13, fontWeight: 500,
                       background: palette.accent, color: '#fff',
                       border: 'none', borderRadius: 8, cursor: 'pointer',
                       fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        {`Passer à ${info.name}`}
      </button>
    </div>
  );
}
