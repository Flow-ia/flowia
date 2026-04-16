Dans backend/src/routes/payments.js, route POST /sms/checkout,
trouve la ligne où on retourne checkout_url et remplace par :

const checkoutUrl = checkout.hosted_checkout_url 
  || `https://pay.sumup.com/b2c/checkout?checkout-id=${checkout.id}`
  || `https://checkout.sumup.com/pay/${checkout.id}`;

if (!checkoutUrl) {
  console.error('[SUMUP] Pas de checkout_url. Réponse complète:', JSON.stringify(checkout));
  return res.status(500).json({ error: 'URL de paiement non reçue de SumUp' });
}

res.json({
  checkout_url: checkoutUrl,
  checkout_id: checkout.id,
  estimated_sms: estimatedSms
});

Puis git add -A && git commit -m "fix: SumUp checkout URL sandbox" && git push