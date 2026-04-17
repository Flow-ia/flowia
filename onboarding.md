# FlowIA — Marketing IA barbershop : affichage ROI sobre et pertinent
# Lire TabMarketing.jsx avant de modifier.
# À la FIN : git add -A && git commit -m "feat: Marketing IA affichage ROI barbershop" && git push

---

## Contexte
- Barbershop homme Lille centre-ville
- avg_price = moyenne réelle des transactions du commerçant en DB
- Taux retour : 8% pessimiste / 20% optimiste (réaliste barbershop)
- Affichage sobre, honnête, professionnel — pas de promesses exagérées

---

## Fichiers à lire
- frontend/src/pages/settings/TabMarketing.jsx
- backend/src/routes/campaigns.js

---

# Affichage du plan généré — Ton et style

## Ce qu'il faut afficher après "Générer mon plan"

### Bloc principal (visible, sobre)
```
💈 Votre plan de relance

📩  290 SMS  ·  15 jours  ·  3 phases d'envoi

👥  Entre 23 et 58 clients attendus
    (basé sur votre historique · taux estimé 8-20%)

💰  Entre 690€ et 1 740€ de CA estimé
    (basé sur votre panier moyen de 29€)
```

### Phrase d'accroche sous les chiffres
Une seule phrase simple, adaptée au segment majoritaire ciblé :
- Si majorité risque/perdu : "Vos clients qui s'éloignent sont les plus faciles à récupérer avec une bonne offre au bon moment."
- Si majorité fidele : "Fidéliser coûte 5x moins cher que d'acquérir un nouveau client."

### Note de transparence (petite, discrète)
"Estimation indicative basée sur votre activité réelle.
 Les résultats peuvent varier selon la période et les offres."

---

# Ce qu'il ne faut PAS afficher
- Aucun ratio "X€ investi = Y€ générés"
- Aucune promesse de résultat garanti
- Aucun pourcentage de ROI affiché
- Aucun jargon marketing ou technique

---

# Phases d'envoi — Affichage simple

Chaque phase affichée sobrement :
```
Phase 1 · Jours 1-5
⚠️ Clients qui s'éloignent · 116 SMS
"[prenom], ca fait un moment ! -15% sur ta prochaine coupe."

Phase 2 · Jours 6-10
😴 Clients perdus · 101 SMS
"[prenom], tu nous manques ! -25% sur ta prochaine coupe."

Phase 3 · Jours 11-15
⭐ Clients fidèles · 73 SMS
"[prenom], merci pour ta fidelite ! -10% pour toi ce mois-ci."
```

Chaque message SMS est modifiable par le commerçant avant lancement.

---

# Après lancement — Confirmation

Afficher :
```
✅ Campagne lancée avec succès

290 SMS seront envoyés sur 15 jours
19.98€ débités de votre solde marketing
Solde restant : X€

Votre barbershop sera plus visible
dès les prochains jours.
```

Pas de promesse chiffrée dans la confirmation — juste les faits.

---

# Ordre d'exécution

1. Lire TabMarketing.jsx — trouver la section affichage plan
2. Mettre à jour l'affichage du plan avec ce ton et ces blocs
3. Mettre à jour la confirmation post-lancement
4. cd frontend && npx vite build
5. Si OK : git add -A && git commit -m "feat: Marketing IA affichage ROI sobre barbershop" && git push
6. Si KO : corriger puis recommencer