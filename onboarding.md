Dans la page **“Compte”**, il faut conserver les champs existants (email et mot de passe uniquement), mais réaliser une **refonte de l’affichage**.

Au lieu d’afficher directement les champs en mode édition, ils doivent être présentés en mode lecture simple, avec une icône **“éditer”** à côté de chaque élément.

👉 Lorsque l’utilisateur clique sur l’icône d’édition :

* il peut modifier ses informations de manière sécurisée

---

### 🔐 Gestion du mot de passe :

* modification uniquement après saisie de l’ancien mot de passe
* possibilité de récupération en cas d’oubli via un code envoyé par email
* validation obligatoire par code email pour sécuriser le changement

---

### 📧 Gestion de l’email :

* changement possible uniquement avec confirmation via l’ancienne adresse email
* vérification obligatoire par code de sécurité
* l’email reste unique et utilisé pour l’authentification et toutes les connexions

---

### ⚠️ Contraintes importantes :

* ne pas créer de doublons de données
* ne pas casser les fonctionnalités existantes
* sécuriser tous les flux (email / mot de passe)
* garantir une cohérence totale entre authentification et données utilisateur

---

👉 Objectif : simplifier l’interface tout en améliorant l’expérience utilisateur et en renforçant la sécurité, sans duplication ni incohérence de données.
