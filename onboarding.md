Il y a un problème avec la recharge du solde. La page s’affiche, mais en bas, au niveau de l’input du CVV, j’obtiens le message d’erreur suivant lorsque je clique :

"We could not retrieve data from the specified Element. Please make sure the Element you are attempting to use is mounted and the ready event has been emitted."

Ce problème doit être corrigé afin de garantir un processus de paiement fonctionnel et fiable.

---

Concernant les SMS, le template doit obligatoirement être affiché avec des retours à la ligne, exactement comme dans l’exemple ci-dessous, et directement prérempli dans l’input « Message SMS (160 car. max) » :

Nom du commerçant
Profitez de -10% avec le code BIENVENUE10
Valable dès le 17/04/2026 au 26/04/2026
de 11h à 14h
Offre limitée
[Adresse] - [Téléphone]

Les conditions doivent être automatiquement adaptées :

* Si un nombre maximum d’utilisations est défini → afficher « Offre limitée »
* Si aucune limite → ne rien indiquer ou mentionner implicitement une offre illimitée

---

Concernant le ciblage des clients, le système doit être intelligent et pertinent. Il doit sélectionner automatiquement les meilleurs clients en se basant sur plusieurs critères business, notamment :

* le nombre de passages
* le chiffre d’affaires généré par client
* le nombre de rendez-vous encaissés
* les habitudes (heures de visite, fréquence, etc.)

Si le commerçant choisit d’envoyer la campagne à un nombre précis de clients (par exemple 7), le système doit automatiquement sélectionner les **7 meilleurs clients** selon ces critères.

Cette logique doit être optimisée pour être :

* performante (ne pas surcharger la base de données, le backend ou le frontend)
* pertinente d’un point de vue business
* orientée résultats (augmentation du chiffre d’affaires et de la rentabilité du commerçant)

Le système doit rester simple, rapide et professionnel, tout en étant efficace dans la sélection des clients à fort potentiel.
