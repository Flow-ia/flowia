## 2026-04-24 — Fix 5 bugs onboarding équipe + agenda + parrainage

### Bug 1 — /settings/horaires : plages invisibles après save (besoin F5)
Après save, le bloc restait vide jusqu'à refresh. Cause dans
`TeamTab.jsx::save()` : `setEmpSlots({...p, [empId]: undefined})` puis
`await loadEmp(empId)`, mais `loadEmp` avait une garde
`if (empSlots[empId] !== undefined) return` qui lit `empSlots` via la
closure — donc la valeur était encore l'ancienne array (setEmpSlots
n'avait pas encore re-rendu). loadEmp retournait early → rien n'était
re-fetché → `getSlots() = []` → affichage vide.

Fix : `loadEmp(empId, force=false)` accepte un flag `force` qui bypass
le cache. Appelé avec `true` après save → fetch serveur forcé.

### Bug 2 — /settings/absences : window.confirm natif
"Annuler" ouvrait le dialogue natif du navigateur. Remplacé par le
composant `Confirm` (components/UI.jsx) — modale pastel cohérente.
State `cancelId` stocke l'id cible, `doCancel()` appelle l'API sur
validation.

### Bug 3 — Pop-up "Modifier l'employé" réinitialise les permissions
Édition des infos employé → toutes les permissions (can_cancel,
can_modify, can_encash, can_grant_credit, can_repay_credit,
can_use_promo, show_on_booking, show_in_caisse, is_active) repassaient
à `false`.

Cause : `EmployeeForm` soumettait uniquement le state local
`f = { name, role, phone, email, avatar_color }`. Le backend PUT coerçait
chaque permission avec `!!can_cancel` → `!!undefined === false`.

Fix : `onSubmit` merge `init` (toutes colonnes DB, permissions incluses)
avec `f` : `{ ...init, ...f }`. Permissions préservées au round-trip.

### Bug 4 — Bouton "Liste" déplacé en haut-centre + renommé
Remplacé le 4e item du SegmentedControl par un bouton pill dédié
au-dessus, centré, intitulé **"Agenda en liste"** avec icône lignes.
- Inactif : outline sobre.
- Actif : pill rempli (fond `t.text`, texte `t.bg`).
Clic = toggle entre `list` et `day`. SegmentedControl Jour/Semaine/Mois
affiche `day` sélectionné même en mode liste (feedback visuel).
Préférence persistée dans `localStorage` (`ff_agenda_view_mode`).

### Bug 5 — Conditions parrainage : afficher aussi pour client connecté (en phrase)
Avant, le bloc "Les conditions chez X" s'affichait uniquement pour le
visiteur non-authentifié, sous forme de tableau label/valeur.
Désormais, un bloc équivalent est affiché aussi pour le client connecté,
mais sous forme de **phrase** (plus digeste), avant les stats :

> Vous gagnez **10 %** à chaque filleul validé, utilisable en caisse
> sur prestation. Aucune limite sur le nombre de parrainages. Validité
> de la récompense : **60 jours après validation**.

La phrase s'adapte à la config (récompense percent/euro, limite
illimitée/mois/3 mois/an, durée validité). Fichier :
`frontend/src/pages/booking/ReferralPage.jsx`.

### Fichiers modifiés
- `frontend/src/pages/settings/equipe/components/TeamTab.jsx`
- `frontend/src/pages/settings/equipe/tabs/TabAbsences.jsx`
- `frontend/src/components/Forms.jsx`
- `frontend/src/pages/employee-agenda/components/MultiColumnAgenda.jsx`
- `frontend/src/pages/booking/ReferralPage.jsx`

Build OK.
