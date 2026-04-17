# FlowIA — Marketing IA campagne automatique par budget
# Barbershop homme Lille centre-ville
# Lire tous les fichiers concernés avant de modifier.
# À la FIN : git add -A && git commit -m "feat: Marketing IA campagne automatique par budget" && git push

---

## Fichiers à lire avant tout
- backend/src/routes/campaigns.js
- frontend/src/pages/settings/TabMarketing.jsx
- frontend/src/utils/api.js

---

## Contexte technique
- SMS_PRICE = process.env.SMS_PRICE_UNIT (prix facturé au commerçant avec marge)
- Le solde débité est sms_balance dans la table users
- Segments existants : champion / fidele / prometteur / risque / perdu
- Anti-spam : exclure clients ayant reçu un SMS dans les 7 derniers jours via message_log
- Le cron existant gère l'envoi depuis campaign_queue

---

# BACKEND — campaigns.js

Créer une fonction generateCampaignPlan(userId, budget, duration_days) qui calcule le nombre de SMS disponibles avec le budget en utilisant SMS_PRICE_UNIT, vérifie que le solde sms_balance du commerçant est suffisant, récupère les clients segmentés via getClientSegments existant, exclut les clients ayant reçu un SMS dans les 7 derniers jours, répartit les SMS entre les segments avec 40% pour risque, 35% pour perdu et 25% pour fidele, planifie les envois en 3 phases selon la durée avec la phase 1 sur le premier tiers de la durée pour les clients à risque, la phase 2 sur le deuxième tiers pour les clients perdus et la phase 3 sur le dernier tiers pour les clients fidèles, applique des réductions suggérées de 15% pour risque, 25% pour perdu et 10% pour fidele, calcule le panier moyen réel via AVG(amount) sur les transactions du commerçant en DB avec 29 comme valeur par défaut si aucune transaction, calcule les estimations ROI avec taux de retour 8% pessimiste et 20% optimiste, retourne total_sms, estimated_cost, sms_remaining, phases avec leurs détails, estimated_clients_min, estimated_clients_max, estimated_revenue_min, estimated_revenue_max et avg_price.

Les templates SMS par segment sont les suivants : pour risque "[prenom], ca fait un moment ! -[reduction]% sur ta prochaine coupe. Valable [duree] jours." pour perdu "[prenom], tu nous manques ! -[reduction]% exceptionnel sur ta prochaine coupe." et pour fidele "[prenom], merci pour ta fidelite ! -[reduction]% pour toi ce mois-ci."

Créer une route GET /api/campaigns/auto-plan avec paramètres query budget et duration_days qui valide que le budget est entre 1 et le solde disponible et que la durée est entre 3 et 30 jours puis retourne le plan généré.

Créer une route POST /api/campaigns/auto-send avec body budget et duration_days qui vérifie le solde suffisant, insère tous les envois dans campaign_queue avec scheduled_date calculée selon la phase de chaque client, déduit estimated_cost du sms_balance du commerçant, enregistre dans campaigns avec status scheduled et retourne la confirmation.

---

# FRONTEND — TabMarketing.jsx

Ajouter un quatrième sous-onglet appelé "Marketing IA" à côté des trois sous-onglets existants Fidélité, Promotions et Solde marketing.

Ce sous-onglet contient une interface en trois étapes.

La première étape est la saisie où le commerçant choisit son budget via un slider de 5 à 100 euros avec pas de 5 et sa durée via un slider de 3 à 30 jours avec pas de 1. Sous le slider budget afficher en temps réel le nombre de SMS estimés et le solde disponible. Sous le slider durée afficher la répartition en 3 phases. Afficher en temps réel un aperçu avec le nombre de SMS et le coût total. Si le budget dépasse le solde disponible bloquer le bouton et afficher un message d'erreur avec lien vers l'onglet Solde marketing. Le bouton principal s'appelle "Générer le plan".

La deuxième étape est l'affichage du plan avec trois KPIs affichés côte à côte : SMS envoyés, clients attendus en fourchette min-max et CA estimé en fourchette min-max. Afficher une note discrète sous les KPIs indiquant que c'est une estimation basée sur l'activité réelle avec taux de retour 8 à 20% et le panier moyen réel. Afficher les trois phases avec pour chacune son nom lisible, les jours d'envoi, le nombre de SMS, la réduction suggérée et le message SMS template. Afficher en bas le montant total débité et le solde restant après campagne. Le bouton principal s'appelle "Lancer la campagne".

La troisième étape est la confirmation sobre indiquant que la campagne est lancée avec le nombre de SMS planifiés, la durée et le montant débité. Ne pas afficher de promesse de résultat dans la confirmation.

Après lancement rafraîchir l'affichage du solde dans le sous-onglet Solde marketing.

---

# API.JS

Ajouter dans campaignsApi les fonctions getAutoPlan qui appelle GET /campaigns/auto-plan avec les paramètres budget et duration et sendAutoCampaign qui appelle POST /campaigns/auto-send avec le body budget et duration_days.

---

# Ordre d'exécution

1. Lire campaigns.js, TabMarketing.jsx et api.js
2. Implémenter generateCampaignPlan et les deux routes backend
3. Ajouter le sous-onglet Marketing IA dans TabMarketing
4. Mettre à jour api.js
5. cd frontend && npx vite build
6. Si OK : git add -A && git commit -m "feat: Marketing IA campagne automatique par budget" && git push
7. Si KO : corriger puis recommencer