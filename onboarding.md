## 2026-04-24 — Agenda : nouvelle vue Liste par employé + persistance localStorage

### Vue Liste
Ajout d'un 4e bouton `Liste` dans le toggle Jour / Semaine / Mois /
**Liste** de l'agenda multi-colonnes (`MultiColumnAgenda.jsx`). La vue
Liste affiche les RDV du jour sélectionné sous forme d'une colonne par
employé, chaque RDV en ligne verticale triée par heure (au lieu de la
grille heures de la vue Jour).

Chaque carte RDV en mode liste :
- Heure début + fin en monospace à gauche
- Nom client, prestation, durée
- Pill statut pastel (confirmé / en attente / annulé / terminé / absent)
- Pill `Encaisse` si `appt.paid` vrai
- Barre accent 2px à gauche dans la couleur du statut (FDS-2026)
- Clic → ouvre `ApptActionModal` (même comportement que les autres vues)

### Responsive mobile
Layout via CSS Grid natif : `repeat(auto-fit, minmax(240px, 1fr))`.
- Desktop large : toutes les colonnes employés côte à côte
- Tablette : 2-3 colonnes qui wrappent
- Mobile (< 520 px) : 1 colonne unique empilée
Pas de media query nécessaire, purement CSS.

### Persistance de la préférence
Nouveau helper `VIEW_MODE_KEY = 'ff_agenda_view_mode'` + `readSavedView()`
dans `MultiColumnAgenda.jsx` :
- `useState(readSavedView)` lit au mount (défaut `'day'` si rien de
  sauvegardé ou valeur invalide)
- `useEffect([viewMode])` écrit dans `localStorage` à chaque changement
- Validation whitelist `['day', 'week', 'month', 'list']` au read —
  pas de corruption si quelqu'un modifie le localStorage à la main.
Le choix reste même après F5, navigation vers une autre route et retour,
ou redémarrage du navigateur. Pour changer, il suffit que l'utilisateur
sélectionne une autre vue → écrasement immédiat.

### Fichiers
- `frontend/src/pages/employee-agenda/components/ListView.jsx` (nouveau)
- `frontend/src/pages/employee-agenda/components/MultiColumnAgenda.jsx` :
  import ListView, persistance localStorage, branchement du mode `list`
  sur le même scope de chargement que `day` (`fromDate==toDate`), mini
  semaine + stats visibles en mode Liste aussi.

Build OK (252 modules, +1 ListView).
