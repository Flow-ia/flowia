Corrige un point important concernant la **caisse et la saisie rapide**, ainsi que tous les impacts associés (statistiques, historique, etc.).

Actuellement, lors d’un encaissement avec une quantité (exemple : 2 coupes), le système affiche incorrectement une seule prestation (ex : 1 coupe à 30€) au lieu de deux coupes distinctes (ex : 2 × 15€). Il faut corriger ce comportement pour que les quantités soient correctement prises en compte dans le calcul et l’affichage.

---

### 💳 Gestion des paiements multiples

Lors de l’encaissement, il faut permettre aux employés de répartir un paiement sur plusieurs moyens de paiement.

Exemple :

* Total : 30€
* 20€ en espèces
* 10€ par carte

👉 Le système doit accepter cette répartition et l’enregistrer correctement.

---

### 📊 Traçabilité et impact système

Cette logique doit être entièrement prise en compte dans :

* les statistiques
* l’historique des ventes
* les rapports administratifs
* les analyses de revenus

Il est essentiel d’assurer une traçabilité complète de chaque mode de paiement et de chaque encaissement.

---

### ⚠️ Contraintes importantes :

* ne pas fausser les statistiques et ne pas casser ni oubli
* garantir une cohérence entre caisse, historique et analytics
* assurer une gestion correcte des quantités et des prix unitaires
* conserver une traçabilité fiable côté admin

---

👉 Objectif : fiabiliser totalement la caisse, les paiements multiples et l’impact sur toutes les données statistiques et historiques du système.
