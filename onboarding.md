Voici ton texte corrigé proprement :

---

Voici les logs côté Render.

Lors du paiement avec SumUp, le statut reste sur **« vérification de paiement par SumUp »**, puis rien ne se passe. Parfois, un message **« paiement non vérifié »** s’affiche.

👉 De plus :

* aucune transaction n’apparaît côté sandbox SumUp
* aucune vente n’est enregistrée

Voici les logs Render :

```
==> ///////////////////////////////////////////////////////////
[SUMUP VERIFY] 28e14c98-1506-4b23-a865-1c3c95cbe2f1 | Status: PENDING | Transactions: []
==> Detected service running on port 5000
==> Docs on specifying a port: https://render.com/docs/web-services#port-binding

[SUMUP] Creation checkout: {
  "checkout_reference":"sms_e0c677b0-5270-4cd0-8542-940fb0eabf83_1776375985805",
  "amount":10,
  "currency":"EUR",
  "merchant_code":"M4A9JCQC",
  "description":"Recharge SMS FlowIA",
  "return_url":"https://haircoifflille.fr/settings/marketing?recharge=pending&ref=sms_e0c677b0-5270-4cd0-8542-940fb0eabf83_1776375985805"
}

[SUMUP] Réponse complète: {
  "status":"PENDING",
  "transactions":[]
}

[SUMUP VERIFY] b11e2764-d92e-4b83-8b40-027beae4f1b9 | Status: PENDING | Transactions: []
(repeat...)

[SUMUP VERIFY] e34c4e72-7131-4453-abe0-e20605664728 | Status: FAILED | Transactions: ['FAILED']
```

---

### ❗ Problèmes constatés

* Le statut reste bloqué sur **PENDING**
* Aucune transaction n’est créée (`transactions: []`)
* Puis le paiement passe en **FAILED**
* Aucune vente visible côté SumUp sandbox

---

### 📧 Problème supplémentaire

Les emails ne fonctionnent pas du tout :

* aucun email reçu
* aucune campagne envoyée lors de la création d’un code promo

👉 Le système d’envoi d’emails semble complètement inactif ou mal configuré.
