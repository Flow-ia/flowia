// /marketing/sms/historique — ancienne route conservée pour compat. L'historique
// (campagnes + transactions SMS) vit déjà dans TabSMS sur /marketing/sms ; on
// redirige avec un anchor pour scroller automatiquement à la bonne section.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Historique() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/marketing/sms#sms-historique', { replace: true });
    // Scroll après render — TabSMS pose l'id dès le mount.
    setTimeout(() => {
      const el = document.getElementById('sms-historique');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [navigate]);
  return null;
}
