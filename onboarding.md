Pour les pages **clients** et **historique**, il faut éviter de charger toutes les données d’un coup afin de ne pas effectuer des requêtes trop lourdes.

Mettre en place une pagination en récupérant uniquement **10 éléments par requête**, avec une navigation par pages (10 par 10). Cela permet de charger uniquement les données réellement utiles pour le commerçant.

Par exemple, dans l’historique :

* afficher uniquement les **10 dernières transactions**
* ajouter en bas une navigation pour accéder aux transactions suivantes (pages suivantes)

Cette approche doit également être appliquée à la page clients.

---

Il est aussi important de :

* mettre en place une **indexation adaptée en base de données**
* optimiser les requêtes pour éviter toute surcharge

---

Objectif :

* améliorer les performances
* réduire la charge sur le backend et la base de données
* offrir une expérience utilisateur plus fluide et rapide

---
