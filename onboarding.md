Voici la version corrigée et clarifiée :

---

Il y a un problème dans les statistiques du jour, dans la section **“Par service / produit”**.

Actuellement, l’affichage est incorrect. Par exemple, le système affiche uniquement une ligne du type :

* Coupe simple — 30,00 € — 1×

alors que plusieurs produits différents avec des quantités différentes ont été encaissés.

---

### 💡 Comportement attendu

Lorsqu’un encaissement contient plusieurs produits/services avec des quantités différentes, les statistiques doivent les afficher correctement et séparément, par exemple :

* Coupe simple — 15,00 € — 3×
* Coupe + barbe — 10,00 € — 2×

---

### ❌ Problème actuel

Le système regroupe incorrectement toutes les ventes sous une seule ligne :

* “Sans catégorie — 65,00 € — 1×”

---

### ⚠️ Contraintes importantes

* Ne pas regrouper les produits/services différents dans une seule ligne
* Ne pas perdre les informations de quantité
* Ne pas casser les calculs existants de statistiques
* Garantir une cohérence entre caisse, historique et statistiques

---

👉 Objectif : afficher correctement chaque service/produit avec sa quantité réelle vendue, pour avoir des statistiques fiables et exploitables.
