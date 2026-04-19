Dans la page **profil client**, afficher le bouton **“Supprimer mon compte”** en dessous du bouton **“Déconnexion”**.

### 🗑️ Suppression du compte

Lorsqu’un client clique sur **“Supprimer mon compte”**, afficher une confirmation sécurisée :

👉 Le client doit saisir exactement :
**SUPPRIMER**
pour valider la suppression de son compte.

---

### ⚠️ Logique métier à respecter

* Les **transactions déjà effectuées** chez les commerçants ne doivent **pas être supprimées**
* Elles doivent être **conservées pour la comptabilité** de chaque commerçant

👉 En revanche :

* toutes les **données personnelles du client** doivent être supprimées :

  * nom
  * prénom
  * numéro de téléphone
  * email

---

### 🔒 Anonymisation

Après suppression :

* les transactions restent présentes mais deviennent **anonymes**
* les moyens de paiement utilisés restent enregistrés, mais sans lien avec l’identité du client

---

### ⚠️ Contraintes importantes

* ne rien casser dans le système existant (caisse, historique, statistiques)
* garantir la conformité des données
* assurer une suppression sécurisée et irréversible des données personnelles

---

👉 Objectif : permettre au client de supprimer son compte tout en conservant l’intégrité comptable des commerçants, grâce à une anonymisation propre et sécurisée.
