

Non, il ne faut pas gérer cela comme une ligne “Coupe simple ×2” dans une note ou un libellé.

👉 Le comportement attendu est le suivant :

Lorsqu’un employé sélectionne une prestation avec une quantité (exemple : 2 coupes simples), le système doit enregistrer **une seule transaction**, mais comptabiliser **deux ventes réelles de la prestation “coupe simple”**.

---

### 💡 Logique attendue

* Une seule transaction est créée dans la caisse
* Mais le système doit incrémenter le nombre de prestations vendues individuellement

Exemple :

* 1 transaction = 2 coupes simples
* Statistiques = +2 ventes de “coupe simple”

---

### 📊 Impact sur les statistiques et l’historique

Dans les statistiques et les rapports, cela doit apparaître comme :

* nombre total de ventes de coupe simple augmenté de 2
* chiffre d’affaires correctement réparti
* historique cohérent avec la réalité des prestations effectuées

---

### ⚠️ Contraintes importantes

* Ne pas afficher “Coupe simple ×2” comme une ligne de produit
* Ne pas casser le système existant de caisse ou d’historique
* Garder une seule transaction par encaissement
* Assurer une cohérence totale entre caisse, statistiques et analytics

---

👉 Objectif : garder une caisse simple pour l’utilisateur, tout en assurant une comptabilisation précise et fiable des ventes dans les statistiques, sans modifier l’expérience utilisateur ni casser le code existant.
