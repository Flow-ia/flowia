// /marketing/sms/recharger — ancienne route conservée pour compat (deep-link
// PromoForm avant fix). Redirige vers /marketing/sms?recharge=open qui ouvre
// directement la modale dans TabSMS. Plus aucun écran distinct ici.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Recharger() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/marketing/sms?recharge=open', { replace: true });
  }, [navigate]);
  return null;
}
