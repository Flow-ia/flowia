## Intégrer SumUp Payment Widget dans Settings.jsx

### Contexte
Remplacer la redirection Hosted Checkout par le Payment Widget
qui s'affiche directement dans la page (modal).

### Frontend — TabSMS dans Settings.jsx

1. Ajouter le script SumUp dans index.html :
<script src="https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js"></script>

2. Bouton "Recharger" → ouvre une modal dans la page
   (pas de redirection externe)

3. Dans la modal :
   - Titre : "Recharger votre solde SMS"
   - Montant sélectionné affiché
   - Container div avec id="sumup-card"
   - SumUp monte le widget dans ce div

4. Logique React :
const handleRecharge = async () => {
  // 1. Créer le checkout côté backend
  const { checkout_id, estimated_sms } = await api.createSMSCheckout(amount);
  
  // 2. Ouvrir la modal
  setShowPayModal(true);
  
  // 3. Monter le widget SumUp
  setTimeout(() => {
    window.SumUpCard.mount({
      checkoutId: checkout_id,
      onResponse: async (type, body) => {
        if (type === 'success') {
          setShowPayModal(false);
          // Vérifier et créditer
          await api.verifySMSCheckout(checkout_id);
          showToast(`+${estimated_sms} SMS credits !`, 'success');
          loadData();
        } else if (type === 'error') {
          setPayError(body.message || 'Paiement echoue');
        }
      }
    });
  }, 300); // Attendre que la modal soit rendue
};

5. Modal design :
- Position fixed, overlay sombre
- Card blanche centrée
- Titre + montant + div#sumup-card
- Bouton Annuler
- Respecte isDark pour l'overlay

### Backend — payments.js
- Route POST /sms/checkout : ne plus mettre redirect_url
- Juste créer le checkout et retourner checkout_id
- Le widget SumUp gère tout le flow de paiement

### Résultat
Le commerçant reste sur la page Settings
Le formulaire carte SumUp s'affiche dans une modal
SumUp encaisse directement
Le solde est crédité après confirmation