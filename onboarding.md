<!--
Aucune tâche en cours.

Historique livré :
- Fix 500 /api/global-clients/me/visits (middleware clientOrGlobalClientAuth, tri DESC) → commit 591a082
- Déplacement explication suppression de compte vers BookingPolitique (section RGPD détaillée) → commit a8b60f1

Si 500 persiste en prod :
1. Vérifier le déploiement Render (dashboard → flowia-backend → Events)
2. Côté client : se déconnecter/reconnecter pour régénérer ff_client_token avec globalClientId
-->
