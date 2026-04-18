# FlowIA — Séparation domaines booking / commerçant
# Lire les fichiers avant de modifier. Chirurgical uniquement.
# À la FIN : git add -A && git commit -m "feat: routing par domaine booking vs commercant" && git push

---

## Fichiers à lire
- frontend/src/index.jsx
- frontend/src/App.jsx
- frontend/vercel.json

---

## Objectif

Actuellement :
- haircoifflille.fr/book/lille → page réservation clients
- haircoifflille.fr/* → app admin commerçant

Cible :
- haircoifflille.fr → affiche directement BookingPage avec slug=lille
- commercant.haircoifflille.fr → affiche l'app commerçant

Le domaine superadmin sera ajouté plus tard — ne pas l'implémenter maintenant.

---

## Variables d'environnement à ajouter sur Vercel

```
VITE_BOOKING_SLUG=lille
VITE_BOOKING_DOMAIN=haircoifflille.fr
VITE_COMMERCANT_DOMAIN=commercant.haircoifflille.fr
```

---

## Ce qu'il faut faire

### Dans frontend/src/index.jsx

Détecter le domaine via window.location.hostname au montage.

Si le hostname correspond à VITE_BOOKING_DOMAIN ou www + VITE_BOOKING_DOMAIN
afficher directement BookingPage avec slug VITE_BOOKING_SLUG.
Garder les routes /book/:slug pour compatibilité avec anciens liens.

Si le hostname correspond à VITE_COMMERCANT_DOMAIN ou localhost
afficher l'app commerçant comme actuellement.

### Dans frontend/vercel.json

S'assurer que le rewrite existant fonctionne pour les deux domaines.

---

## Ce qu'il ne faut PAS faire
- Ne pas implémenter le domaine superadmin (prévu plus tard)
- Ne pas casser les routes /book/:slug existantes
- Ne pas toucher au backend

---

## Ordre d'exécution

1. Lire index.jsx pour comprendre le routing actuel
2. Modifier index.jsx avec la détection de domaine
3. Mettre à jour vercel.json si nécessaire
4. cd frontend && npx vite build
5. Si OK : git add -A && git commit -m "feat: haircoifflille.fr booking + commercant.haircoifflille.fr admin" && git push
6. Si KO : corriger puis recommencer

## Actions manuelles après le push
1. Vercel → Settings → Domains → ajouter commercant.haircoifflille.fr
2. Registrar DNS → CNAME : commercant → cname.vercel-dns.com
3. Vercel → Environment Variables → ajouter les 3 variables ci-dessus

---

## Mise à jour STATUS.md obligatoire en fin de session

Après le push, mettre à jour STATUS.md avec :
- Les fichiers modifiés et ce qui a changé
- Ce que l'utilisateur doit faire manuellement et dans quel ordre :
  1. Aller sur Vercel → Settings → Domains → ajouter commercant.haircoifflille.fr
  2. Aller sur le registrar DNS → ajouter CNAME commercant → cname.vercel-dns.com
  3. Aller sur Vercel → Environment Variables → ajouter les 3 variables
  4. Attendre la propagation DNS (jusqu'à 24h)
  5. Tester haircoifflille.fr → doit afficher la page réservation
  6. Tester commercant.haircoifflille.fr → doit afficher le dashboard
- Les bugs éventuels identifiés
- Ce qui reste à faire dans la prochaine session