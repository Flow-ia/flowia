sorrige les bugs liés à la gestion des images des services dans le site de réservation.

Actuellement, les images sont bien sauvegardées sur Cloudinary, mais elles ne s’affichent pas dans la page de gestion des services ni sur le site de réservation. Il faut corriger l’affichage pour que chaque service affiche correctement son image, aussi bien côté admin que côté site de réservation.

Lorsqu’un commerçant remplace ou supprime une image :

* l’ancienne image doit être supprimée de Cloudinary
* la nouvelle image doit écraser proprement l’ancienne référence
* aucune image inutile ne doit rester stockée (éviter la saturation)

Mettre en place une architecture propre, scalable et évolutive pour la gestion des images :

* organisation claire des dossiers (par commerçant / service)
* schéma de nommage cohérent
* stockage des références (URL, public_id) pour faciliter suppression, remplacement et récupération

Assurer que :

* les images sont facilement récupérables pour affichage sur le site de réservation
* les images s’affichent correctement dans l’interface admin
* chaque service a une image visible pour que le commerçant comprenne clairement l’association

L’interface doit être visuelle et explicite, afin que le commerçant identifie facilement chaque service grâce à son image, sans confusion ni oubli.
