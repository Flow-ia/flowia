# FlowIA — Marketing IA avec envoi prédictif intelligent
# Lire tous les fichiers avant de commencer. Adapter au code existant.
# Être chirurgical — ne pas surcharger la DB ni le backend.
# À la FIN : git add -A && git commit -m "feat: Marketing IA envoi predictif par client" && git push

---

## Fichiers à lire
- backend/src/routes/campaigns.js
- backend/src/routes/promo.js
- backend/src/index.js (cron existant)
- frontend/src/pages/settings/TabMarketing.jsx
- frontend/src/utils/api.js
- backend/src/db/index.js

---

## Principe de base — Rester léger et robuste

Utiliser au maximum les tables existantes.
Ne créer que 2 nouvelles tables légères.
Toute la logique prédictive se fait en une seule requête SQL au moment
de la génération du plan — pas de calculs en temps réel ni de polling.
Le cron existant gère les envois — ne pas en créer un nouveau.

---

## 2 nouvelles tables uniquement

Une table ai_campaigns légère qui stocke uniquement :
l'id, le user_id, le budget, la durée, le statut, les phases en JSON
(segments ciblés + pourcentages validés par le commerçant),
les estimations ROI, created_at et completed_at.

Une table ai_campaign_codes légère qui stocke uniquement :
l'id, l'ai_campaign_id, le client_id, le promo_code_id, le personal_code,
le segment, le discount_percent, la scheduled_at (date ET heure d'envoi calculée),
sent_at, used_at, used_appointment_id et le statut.

Pas d'autres tables. Tout le reste utilise campaign_queue et promo_codes existants.

---

# LOGIQUE PRÉDICTIVE — Une seule requête SQL intelligente

Au moment de générer le plan, calculer pour chaque client sélectionné
sa date et heure d'envoi optimale en une seule requête SQL sur appointments.

La requête doit extraire pour chaque client :
- Son jour de semaine préféré (le plus fréquent dans ses RDV passés)
- Sa tranche horaire préférée (matin 9-12, après-midi 12-17, soir 17-20)
- Sa fréquence moyenne en jours entre deux visites

Avec ces 3 données calculer la scheduled_at :
- Prendre le prochain occurrence de son jour préféré dans la fenêtre de sa phase
- Ajouter l'heure médiane de sa tranche préférée
- Si pas assez de données pour un client utiliser mardi ou jeudi à 11h par défaut
- Jamais le dimanche, jamais avant 9h, jamais après 20h

Ce calcul se fait une seule fois à la génération du plan.
Le résultat est stocké dans ai_campaign_codes.scheduled_at.
Le cron existant lit campaign_queue où scheduled_at est déjà calculé.
Aucun calcul en temps réel pendant les envois.

---

# POURCENTAGES ADAPTATIFS

L'IA calcule les pourcentages suggérés depuis les données existantes.
Toujours des multiples de 5 entre 5 et 35.

Pour chaque segment calculer le pourcentage optimal ainsi :
- Récupérer le panier moyen réel du segment depuis les transactions
- Récupérer l'ancienneté d'inactivité moyenne du segment
- Si des campagnes IA précédentes existent regarder quel pourcentage
  a généré le meilleur taux de conversion pour ce segment et s'en inspirer
- Plus le client est inactif depuis longtemps plus le pourcentage est élevé
- Arrondir au multiple de 5 le plus proche

Le commerçant peut modifier chaque pourcentage via un sélecteur simple
avec les valeurs 5, 10, 15, 20, 25, 30, 35 uniquement.
Quand il modifie un pourcentage recalculer le CA estimé en temps réel.

---

# CODES PERSONNELS

Pour chaque client générer un code unique avec son prénom et sa réduction.
Créer dans promo_codes existant avec durée de validité de la phase.
Le code est applicable sur place et en ligne sur le site de réservation.
Quand un code est utilisé sur une réservation mettre à jour used_at
et used_appointment_id dans ai_campaign_codes pour mesurer le vrai ROI.

---

# MESSAGE SMS

Le SMS de chaque client doit contenir son prénom, son code personnel,
la réduction, la durée de validité, la mention applicable sur place
et sur le site, le nom du commerce, l'adresse courte, le téléphone
et le lien du site. Construire intelligemment pour tenir en 160 caractères
en tronquant l'adresse si nécessaire mais en gardant toujours le code,
la réduction, le téléphone et le lien du site.

---

# ROUTES API — 4 routes uniquement

GET /api/campaigns/auto-plan : génère le plan avec pourcentages adaptatifs,
clients sélectionnés, dates d'envoi prédictives et estimations ROI.
Tout calculé en une passe, rien mis en DB à ce stade.

POST /api/campaigns/auto-send : valide le plan, crée les enregistrements
en DB, génère les codes, insère dans campaign_queue avec scheduled_at
individuel par client, déduit le solde, retourne la confirmation.

POST /api/campaigns/auto-recalculate : recalcule uniquement le CA estimé
quand le commerçant change un pourcentage. Pas de DB, juste du calcul.

GET /api/campaigns/ai-history : retourne les campagnes IA passées avec
pour chacune le taux de conversion réel (codes utilisés / codes envoyés)
et le CA réel (somme appointments liés aux codes utilisés).

---

# FRONTEND

Sous-onglet Marketing IA dans TabMarketing avec 3 étapes simples.

Étape 1 : budget libre et durée. Affichage temps réel SMS estimés et solde.

Étape 2 : plan avec KPIs en fourchette, phases avec pourcentages modifiables
via sélecteur 5-35 par pas de 5, recalcul CA en temps réel à chaque changement,
aperçu du SMS complet avec les vraies infos du commerce, coût et solde restant.

Étape 3 : confirmation sobre sans promesses.

En bas du sous-onglet afficher l'historique des campagnes passées avec
taux de conversion réel et CA généré pour prouver la valeur au commerçant.

---

# Ordre d'exécution

1. Lire tous les fichiers — comprendre le cron existant et campaign_queue
2. Créer les 2 tables légères en DB
3. Construire la requête SQL prédictive pour les dates d'envoi
4. Construire analyzeAndSuggest pour les pourcentages adaptatifs
5. Construire generateCampaignPlan complet
6. Créer les 4 routes API
7. Connecter la traçabilité à la validation codes promo existante
8. Construire le frontend
9. Mettre à jour api.js
10. Build et push