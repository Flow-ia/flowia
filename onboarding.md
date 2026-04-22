Sur la partie client, dans la page de ses rendez-vous (`/client/rdv`) :

* ✅ Supprimer l'icône (croix rouge ou indicateur de rendez-vous passé) affichée à gauche de chaque carte.
  👉 Le statut est déjà affiché en haut au niveau du commerçant, donc cette icône est inutile.

* ✅ À la place :
  👉 déplacer le statut actuellement affiché en haut (au niveau du commerçant) vers une position plus pertinente dans la carte.

* ✅ Recommandation appliquée :
  👉 afficher le **statut au-dessus du prix**, pour une meilleure lisibilité et une hiérarchie plus claire des informations.

---
sinon fait ta recommandation a toi et soit correct et respecte la refonte acteuele de fds 2026 design_system.md

## Livré (2026-04-22)

Refonte appliquée dans `AppointmentsTab.jsx` :

- **Retiré** : pastille 40×40 à droite (croix / horloge / check /
  calendrier) qui dupliquait le statut. Plus aucune icône décorative de
  statut — la couleur de la `borderLeft: 2px` de la carte porte la
  sémantique visuelle (rouge = annulé, gris = passé, accent = futur).
- **Retiré** : pill statut en haut de carte (près du commerçant), trop
  redondante avec la nouvelle position.
- **Déplacé** : une seule pill de statut (11px, bg pastel + bord
  `accent33`), placée **juste au-dessus du prix** comme recommandé.
- **FDS-2026 appliqué** :
  - `borderRadius` passé de 18 → 12 (tokens autorisés)
  - `fontWeight` ramené à 500 max (commerçant + prix étaient à 600)
  - SVG inline remplacés par icônes Lucide (`I.X`, `I.User`)
  - Bordure de carte en `0.5px` + accent gauche `2px` (seule exception
    tolérée par le FDS-2026 règle #3)
  - Ref `#ID` déplacée en bas de colonne info, très discrète (10px,
    `th.dim`)
- **Bouton Annuler** : n'apparaît que si le RDV est annulable (règle 2h),
  sinon espace simplement vide — plus de décoration inutile.