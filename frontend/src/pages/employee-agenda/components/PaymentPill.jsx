// PaymentPill.jsx — pill paiement partagée (ApptCard, ListView, et autres
// vues agenda). Lit le triplet (payment_status, paid_method, paid +
// stripe_payment_intent_id) et rend un libellé cohérent avec coloration
// adaptée au statut.
//
// Cas couverts :
//   - paid + stripe          → "Payée en ligne" (vert) + montant
//   - paid (manuel/caisse)   → "Encaissée · CB/Espèces" (vert) + méthode
//   - refunded               → "Remboursée" (ambre)
//   - failed                 → "Paiement échoué" (rouge)
//   - pending (Stripe en cours) → "Paiement en attente" (gris)
//   - sinon                  → null (pas de pill)
//
// FDS-2026 : pas d'emoji, fontWeight 500, bordures 0.5px implicites.
import { PAY_OPTIONS } from '../constants';

function methodLabel(id) {
  const opt = PAY_OPTIONS.find(p => p.id === id);
  return opt?.label || id;
}

// Calcule l'état d'affichage à partir d'un appt. Exporté pour tests / réuse.
export function resolvePaymentDisplay(appt) {
  if (!appt) return null;
  const ps = appt.payment_status; // 'none' | 'pending' | 'paid' | 'refunded' | 'failed'
  const isStripe = !!appt.stripe_payment_intent_id;
  const cents = Number(appt.paid_amount_cents || 0);
  const amountStr = cents > 0 ? ` · ${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DA` : '';

  if (ps === 'paid') {
    if (isStripe) {
      return {
        label: `Payée en ligne${amountStr}`,
        bg: '#f0fdf4', color: '#065f46', dot: '#10b981',
      };
    }
    // Paid manuel (encaisse caisse) — appt.paid=true classique
    const m = methodLabel(appt.paid_method) || 'Encaissée';
    return {
      label: `Encaissée · ${m}`,
      bg: '#f0fdf4', color: '#065f46', dot: '#10b981',
    };
  }
  if (ps === 'refunded') {
    return {
      label: `Remboursée${amountStr}`,
      bg: '#fef3c7', color: '#92400e', dot: '#d97706',
    };
  }
  if (ps === 'failed') {
    return {
      label: 'Paiement échoué',
      bg: '#fef2f2', color: '#991b1b', dot: '#dc2626',
    };
  }
  if (ps === 'pending') {
    return {
      label: 'Paiement en attente',
      bg: '#f3f4f6', color: '#374151', dot: '#9ca3af',
    };
  }
  // Legacy : appt.paid=true sans payment_status (avant la migration). On rend
  // un fallback pour ne pas perdre l'info des anciens RDV.
  if (appt.paid) {
    const m = methodLabel(appt.paid_method) || 'Encaissée';
    return {
      label: `Encaissée · ${m}`,
      bg: '#f0fdf4', color: '#065f46', dot: '#10b981',
    };
  }
  return null;
}

export default function PaymentPill({ appt, size = 'md' }) {
  const d = resolvePaymentDisplay(appt);
  if (!d) return null;
  const fontSize = size === 'sm' ? 10 : 11;
  const padding  = size === 'sm' ? '2px 8px' : '3px 9px';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize, fontWeight: 500,
      padding, borderRadius: 99,
      background: d.bg, color: d.color,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: d.dot, flexShrink: 0,
      }}/>
      {d.label}
    </span>
  );
}
