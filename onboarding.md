# Agenda — améliorations

## ✅ 3. Notifications → détails RDV

Clic sur une notif (push, cloche `NotificationCenter`, popup `NotifModal`
du Dashboard) → deep-link vers `/agenda?date=YYYY-MM-DD&appt=<id>` →
vue Jour au bon offset + modal détails ouvert automatiquement.

- Backend `backend/src/utils/push.js` construit `data.url` (deep-link).
- `frontend/src/pages/agenda/index.jsx` lit `?date=` et `?appt=` et
  ouvre `editAppt` dès chargement. Params strippés après usage.
- `frontend/src/App.jsx` (cloche) et
  `frontend/src/pages/Dashboard.jsx` (popup) : clic notif ferme le
  panneau et `navigate(n.data.url)` avec validation `safeInternalPath`.

---

## ⏳ 1. URLs dédiées pour `/employee-agenda`

Actuellement `EmployeeAgenda` bascule multi-colonnes ↔ vue employé via
state local (`selectedEmp` + `view`). Refresh = perte de contexte,
partage de lien impossible.

Cible :
- `/employee-agenda` → vue multi-colonnes (actuel `view='multi'`).
- `/employee-agenda/:employeeId` → vue d'un employé (actuel
  `view='single'` + `EmpAgendaMain`).

Changements :
- `frontend/src/App.jsx` : ajouter la route paramétrée.
- `frontend/src/pages/employee-agenda/index.jsx` : remplacer le state
  par `useParams()` + `useNavigate()` (clic employé → `navigate(…/:id)`,
  bouton retour → `navigate('/employee-agenda')`).

## ⏳ 2. Bouton « Ajouter un RDV » : employé pré-sélectionné

Réutiliser la popup existante (pas de duplication). Sur
`/employee-agenda/:employeeId`, passer l'employé courant en prop
`defaultEmployeeId` au modal → champ employé pré-rempli, modifiable.

- `frontend/src/pages/employee-agenda/modals/NewApptModal.jsx` et
  `QuickAddApptModal.jsx` : accepter `defaultEmployeeId`.

## ⏳ 4. Deep-link notif `?appointmentId=…` sur employee-agenda

Aujourd'hui le deep-link notif pointe vers `/agenda?...`. Pour rester
cohérent côté employé, accepter aussi `/employee-agenda/:employeeId?appt=<id>`.

- Backend `push.js` : calculer le deep-link en fonction du contexte
  (employé ou agenda général).
- `employee-agenda/index.jsx` : lire `?appt=` et ouvrir le modal
  `ApptActionModal` du RDV, puis stripper le param.

---

## 🎯 Résumé

1. Routes paramétrées → état persistant au refresh + partage de lien.
2. Réutilisation popup + pré-sélection employé.
3. (✅) Clic notif = ouverture directe du RDV.
4. Cohérence deep-link notif ↔ `/employee-agenda/:employeeId`.
