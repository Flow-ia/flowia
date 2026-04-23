## 2026-04-24 — Fix upload photo employé + accès page Historique

### Bug 1 — Toast "Modifié" affiché malgré un 500 Cloudinary
Symptôme : `POST /api/media/employee/:id/image` renvoie 500, la photo
n'arrive jamais sur Cloudinary, mais l'UI affiche "Modifié" et masque
l'erreur. Cause : dans `TabEmployees.jsx` l'appel `mediaApi.uploadEmployeeImage`
était dans un try/catch qui n'arrêtait pas le flow — après `catch`, le code
continuait et appelait `showToast('Modifié')`.
Fix :
- `catch (e)` capture le message backend (au lieu de générique "Erreur upload")
  et ajoute un `return` pour ne pas afficher le toast de succès derrière.
- Même traitement pour la suppression d'image.
- Fichier : `frontend/src/pages/settings/equipe/tabs/TabEmployees.jsx`.

Effet côté commerçant : en cas d'échec Cloudinary (credentials invalides,
quota, etc.) il voit directement le vrai message d'erreur renvoyé par le
backend (format `Erreur upload image : <cause>`) au lieu d'un faux "Modifié"
qui masquait le problème. Idem pour l'upload image service (`BookingServices.jsx`).

### Bug 2 — Page Historique inaccessible après validation PIN employé
Symptôme : tuile "Historique" du dashboard → modal PIN → saisie OK → retour
immédiat sur `/dashboard` au lieu d'afficher `/historique`. Impossible
d'accéder à la page des ventes du jour après validation.
Cause : `PinAccessModal` appelle `onSuccess()` PUIS `onClose()` lors d'une
validation réussie (Dashboard.jsx:262). Dans `Historique.jsx`, la prop
`onClose` était `() => { setPinOpen(false); navigate('/dashboard'); }` —
donc après succès, le handler navigait malgré tout vers `/dashboard`.
Fix : ajout d'un `successRef` dans `Historique.jsx` passé à `true` dans
`onSuccess`. Le `onClose` ne redirige plus vers `/dashboard` si un succès
a déjà été enregistré (distinction annulation vs validation OK).
Fichier : `frontend/src/pages/Historique.jsx`.

URL dédiée déjà en place (`/historique`, routée dans `App.jsx:1862`) — le
commerçant peut désormais y accéder en direct + refresh → la page reste
sur `/historique` après validation du PIN (gate re-demandé à chaque
refresh, normal).
