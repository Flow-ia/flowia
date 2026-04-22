# Agenda — améliorations

## ✅ 1. URLs dédiées pour la vue employé

- `/agenda` (ou `/agenda/views`) → vue multi-colonnes `MultiColumnAgenda`.
- `/agenda/views/:employeeId` → `EmpAgendaMain` de cet employé.

État préservé au refresh, lien partageable, `employeeId` introuvable →
redirect propre vers `/agenda`. Plus de state local pour la sélection
d'employé.

## ✅ 2. Popup « Nouveau RDV » mutualisée + employé pré-sélectionné

`EmpAgendaMain` utilise désormais le même `QuickAddApptModal` que la
vue multi. Nouvelle prop `defaultEmpId` qui pré-sélectionne l'employé
courant (modifiable). `NewApptModal` supprimé.

## ✅ 3. Notifications → détails RDV

Clic sur une notif (push, cloche `NotificationCenter`, popup `NotifModal`
du Dashboard) → deep-link construit côté backend
(`data.url = /agenda?date=YYYY-MM-DD&appt=<id>`) → bascule vue Jour +
ouverture du modal détails.

## ✅ 4. Cohérence deep-link notif

Lecture de `?date=` + `?appt=` portée sur la route active `/agenda`
(`MultiColumnAgenda`) ET sur `/agenda/views/:employeeId`
(`EmpAgendaMain`). Params strippés après usage pour éviter la
ré-ouverture au remount.

---

## 🎯 Résumé

Tous les points livrés :

1. ✅ Routes paramétrées → état persistant au refresh + partage de lien.
2. ✅ Réutilisation popup + pré-sélection employé.
3. ✅ Clic notif = ouverture directe du RDV.
4. ✅ Cohérence deep-link notif ↔ `/agenda/views/:employeeId`.
