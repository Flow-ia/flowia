# FlowIA — Fix Marketing IA avec peu de clients
# Lire les fichiers avant de modifier. Adapter au code existant.
# À la FIN : git add -A && git commit -m "fix: Marketing IA fonctionne avec peu de clients" && git push

---

## Fichiers à lire
- backend/src/routes/campaigns.js
- frontend/src/pages/settings/TabMarketing.jsx

---

## Problème
La page Marketing IA affiche 0 SMS, 0 clients, 0 CA avec seulement 3 clients.

---

## Causes à identifier et corriger

La segmentation RFM est conçue pour de grandes bases clients.
Avec peu de clients personne n'atteint les seuils et tout retourne 0.
Le système doit s'adapter à la taille réelle de la base clients.

## Ce qu'il faut corriger

Rendre la sélection de clients inclusive : inclure tous les clients
disponibles du commerçant même ceux avec peu ou pas d'historique de visites.

Adapter la segmentation au nombre de clients disponibles : quand la base
est petite comparer les clients entre eux de façon relative plutôt que
les comparer à des seuils absolus conçus pour 1000 clients.

S'assurer que le nombre de SMS effectifs correspond au nombre de clients
disponibles quand il y a moins de clients que de SMS dans le budget.

S'assurer que le prix unitaire SMS et le panier moyen ont toujours
des valeurs par défaut valides même si les variables d'environnement
ou les données en base sont absentes.

Dans le frontend afficher un message explicatif clair si le plan ne peut
pas être généré plutôt que d'afficher des zéros partout.

## Comportement attendu après correction

Avec 3 clients et n'importe quel budget le système doit afficher
un plan valide avec 3 SMS, une estimation de clients attendus et
un CA estimé basé sur le panier moyen réel ou la valeur par défaut.
Le bouton lancer doit être actif dès qu'il y a au moins 1 client.

---

# Ordre d'exécution

1. Lire campaigns.js pour identifier exactement pourquoi 0 est retourné
2. Corriger la logique de sélection et segmentation des clients
3. Corriger les valeurs par défaut manquantes
4. Corriger le message frontend quand plan vide
5. Build et push