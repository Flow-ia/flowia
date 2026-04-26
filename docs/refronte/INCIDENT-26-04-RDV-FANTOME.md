# Incident 26/04/2026 — RDV non notifié

## Symptôme
RDV "Hugo Sterckeman" pour le 24/04 17:15 trouvé par hasard dans l'agenda.
Le commerçant n'avait reçu AUCUNE notification (email, push, cloche).
Réservation pourtant créée légitimement via `/book/hair-coiff-lille` à 9h30 le 24/04.

## Causes
1. Aucune notification email automatique au commerçant à chaque nouvelle réservation publique (helper `sendNewAppointmentMerchant` inexistant avant 25).
2. Pas de notification push VAPID configurée pour ce commerçant (subscription `push_subscriptions` vide → `sendPushToUser` no-op silencieux).
3. Cloche dashboard polling 30s en pause si l'onglet était caché → la `app_notifications` ligne créée par `notifyNewAppointment` n'était pas remontée à temps.
4. Pas de traçabilité (colonne `source`) sur la table `appointments` → impossible de distinguer créé via booking public vs agenda admin/employé après coup.
5. Routes admin (`POST /api/booking/appointments`) et employé (`POST /api/booking/employee-agenda/appointments`) **n'appelaient pas du tout** `notifyNewAppointment` → aucun audit en cloche pour les RDV créés en interne.

## Conséquences potentielles
- Risque de no-show côté salon (RDV oublié, prestation non préparée).
- Perte de confiance client si le commerçant ne semble pas réactif.
- Statistiques faussées (impossible de mesurer la conversion booking public).
- Audit fragilisé : pas moyen d'identifier qui a créé un RDV mystère.

## Correctifs apportés (commit 25)
- Migration `appointments` : colonnes `source` (TEXT) et `created_by_employee_id` (UUID, pas de FK), index dédiés, UPDATE final pour marquer les anciens RDV `source='migration'`.
- Helper `sendNewAppointmentMerchant` (transactionnel Brevo, hors quota 300/j marketing).
- Extension `notifyNewAppointment(userId, appt, { source, withEmail })` :
  - Public (`source: 'public', withEmail: true`) → in-app + push + email.
  - Employé tablette (`source: 'employee', withEmail: false`) → in-app + push uniquement.
  - Admin → pas de notification (le commerçant sait ce qu'il fait).
- UI agenda : mention discrète de la source en bas de la modale RDV (ApptModal) + badges "En ligne" / "Tablette" dans la vue liste (ApptListCard).
- Garde-fou anti-erreur : modale ambre de confirmation si la date < aujourd'hui dans `AddApptModal` (admin) et `QuickAddApptModal` (employé). Pas de blocage strict — friction supplémentaire.

## Vérifications préventives suggérées
- Surveiller les logs Brevo : taux d'échec des notifications nouveaux RDV.
- Surveiller le journal des subscriptions push : taux d'expiration.
- Mensuel : `SELECT COUNT(*) FROM appointments WHERE source IS NULL` → doit rester à 0 sur les RDV postérieurs à la migration. Si non-zéro, une route INSERT a été ajoutée sans peuplement de la colonne.
- Tester manuellement le flux push une fois par mois (push-subscribe + résa publique de test) pour vérifier la livraison.
- Vérifier que l'email merchant configuré dans `users.email` est bien consulté (pas une boîte morte).
