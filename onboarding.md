### ⚠️ Gestion des types de réduction (très important)

Sur la page **Parrainage**, il faut bien gérer la différence entre **montant fixe** et **pourcentage**.

👉 Le commerçant doit pouvoir configurer **indépendamment** :

* la récompense du **parrain**
* la récompense du **filleul**

Et chacune peut être :

* soit un **montant fixe** (ex : 5€)
* soit un **pourcentage** (ex : -10%)

👉 Exemple :

* Parrain : 5€
* Filleul : -20%

ou inversement :

* Parrain : -10%
* Filleul : 10€

⚠️ Il faut bien distinguer ces cas dans l’affichage, les calculs et les règles d’application.

---

### ⚙️ Configuration côté commerçant

Fusionner les pages suivantes :

* **/settings/marketing/parrainage**
* **/settings/marketing/anniversaire**

👉 Dans une seule page :
**/settings/marketing/fidelite**

---

### 🧩 Organisation de la page

* Utiliser des **blocs pliables (accordéons)**
* Par défaut : **fermés**

Sections :

1. 🎂 Offres anniversaire
2. 🤝 Programme de parrainage

---

### 🔁 Limitation des parrainages

Dans la section parrainage, ajouter des paramètres permettant de limiter le nombre de parrainages par client :

* une seule fois à vie
* X fois par mois
* X fois sur 3 mois
* X fois par an
* illimité

---

### 🎯 Objectifs

* centraliser la fidélisation dans une seule page claire
* éviter les abus du système
* offrir une configuration flexible au commerçant
* améliorer la compréhension et l’UX

---

### ⚠️ Contraintes importantes

* ne rien casser dans les fonctionnalités existantes
* ne rien oublier dans les impacts (caisse, marketing, stats, historique)
* éviter toute duplication de données
* garantir une logique claire entre parrain et filleul

---

👉 Résultat attendu : une section fidélité centralisée, claire, flexible et professionnelle, avec une UX simple (blocs fermés par défaut) et une logique business solide.
