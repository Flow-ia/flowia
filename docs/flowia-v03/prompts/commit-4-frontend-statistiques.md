# 🟠 Commit 4 — Frontend Refonte page Statistiques (4 onglets)

> **Prompt prêt à coller dans Claude Code**.

---

```
Refonte complète de la page Statistiques avec 4 onglets : Performance / RDV / Paiements en ligne / Reversements.

CONTEXTE
Maquettes finales dans /docs/flowia-v03/mockups/ :
- 03-stats-performance.html — onglet Performance (4 KPI sources + bandeau Stripe + graphique 30j)
- 04-stats-rdv.html — onglet RDV (sources + statuts segmentés + employés + insight)
- 05-stats-online-payments.html — onglet Paiements en ligne (HERO GRADIENT BLEU + 4 KPI statuts + politique + impact)
- 06-stats-payouts.html — onglet Reversements (HERO CTA VERT + estimation + historique)

Le backend est prêt :
- GET /api/stats/performance
- GET /api/stats/rdv
- GET /api/stats/online-payments
- GET /api/stripe/balance
- GET /api/payouts

À FAIRE

1. Refondre frontend/src/pages/Statistiques.jsx :
   - H1 "Statistiques" + sous-titre
   - TabBar 4 onglets avec icônes : Performance (ti-trending-up), RDV (ti-calendar-event), Paiements en ligne (ti-credit-card), Reversements (ti-wallet)
   - Chips de période : Aujourd'hui / 7 jours / 30 jours (défaut) / 90 jours / Personnalisé
   - Tab actif fond blanc + border subtle, autres transparents

2. Onglet Performance — components/stats/TabPerformance.jsx
   
   Section "CHIFFRE D'AFFAIRES PAR SOURCE" : 4 cards en grille
   - "EN LIGNE" (#E6F1FB) : montant 22px + nb paiements + détail (Frais Stripe / Commission FlowIA / Net)
   - "CAISSE RDV" (#E1F5EE) : montant + détail (Espèces / Carte locale / Net)
   - "WALK-IN" (#FAEEDA) : montant + détail (Espèces / Carte locale / Net) avec icône ti-walk
   - "TOTAL" (fond blanc) : total + total frais + comparaison N-1 + net total
   
   Section "ARGENT À RECEVOIR (STRIPE)" : 1 card avec 4 colonnes
   - Solde disponible (vert) / En transit J+3 (doré) / Prochain payout (gris) / Bouton "Reverser maintenant" (placeholder)
   
   Section "ÉVOLUTION SUR 30 JOURS" : graphique linéaire SVG avec 3 polylines
   - Bleu #185FA5 : En ligne
   - Vert #0F6E56 : Caisse RDV
   - Doré #BA7517 : Walk-in
   Légende en bas avec les 3 traits colorés.

3. Onglet RDV — components/stats/TabRDV.jsx
   
   Bandeau info en haut : "Cette page liste vos rendez-vous (avec ou sans paiement). Les walk-in sans RDV ne sont pas inclus ici — ils sont visibles dans l'historique des transactions."
   
   Section "RDV PAR SOURCE" : 2 cards
   - Card "Booking en ligne" (icône ti-world #185FA5) : nb RDV + breakdown Stripe 100% / Acompte / Pas payé
   - Card "RDV téléphone / agenda" (icône ti-phone #534AB7) : nb RDV + breakdown par employé
   
   Section "ÉTAT DE PAIEMENT (X RDV)" : barre horizontale segmentée 6 couleurs
   - Bleu STRIPE_100 / Doré STRIPE_ACOMPTE / Gris NOT_PAID / Violet CASH_PAID / Rouge REFUNDED / Brun NO_SHOW_RETAINED
   - Légende grille 2 colonnes avec descriptions courtes
   
   Section "PERFORMANCE PAR EMPLOYÉ" : liste avec avatar initiales coloré + nom + (X RDV honorés, en ligne, caisse) + CA généré
   
   Box conseil en bas (ti-bulb fond doré) : "Les RDV avec acompte sont honorés à 91% vs 73% sans paiement..."

4. Onglet Paiements en ligne — components/stats/TabPaiementsLigne.jsx
   
   HERO GRADIENT BLEU (#042C53 → #185FA5), padding 1.5rem, text white :
   - À gauche : "Encaissé en ligne · 30 derniers jours" 11px uppercase + montant 32px monospace + comparaison "+18% vs 30j prev"
   - À droite : "Net pour vous" + montant 28px + "95% du brut"
   - Sous-card transparente rgba(255,255,255,0.12) avec 4 colonnes : Brut / Frais Stripe / Commission FlowIA / Net (couleurs : déductions en #FFD9A6, net en #A6F4D5)
   
   Section "STATUT DES PAIEMENTS EN LIGNE" : 4 KPI cards avec point coloré :
   - "Payouts reçus" (point vert #1D9E75) : nb + sous-texte "paiements arrivés en banque" + montant
   - "En attente" (point doré #BA7517) : nb + "à reverser" + montant
   - "Remboursés" (point rouge #A32D2D) : nb + "annulations dans délais" + montant négatif
   - "No-show retenus" (point brun #4A1B0C) : nb + "acompte conservé" + montant
   
   Section 2 colonnes :
   - "Politique de paiement" (ti-percentage) : table 4 lignes (Mode / Acompte exigé / Délai annulation / Délai reversement) + bouton "Modifier ma politique"
   - "Impact business" (ti-trending-up) : 2 sub-cards
     * Box verte #E1F5EE : "No-show réduits −87%"
     * Box bleue #E6F1FB : "Revenu additionnel +340 €"
   
   Section "ÉVOLUTION DES PAIEMENTS EN LIGNE · 30 jours" : histogramme SVG bars #185FA5 opacity 0.7

5. Onglet Reversements — components/stats/TabReversements.jsx
   
   CARD HERO VERTE (border 2px solid #1D9E75), padding 1.5rem :
   - Icône ti-cash 32x32 dans box #E1F5EE
   - "À reverser maintenant" (uppercase 11px #0F6E56) + sous-titre "Solde Stripe disponible"
   - Montant 32px monospace #04342C "127,50 €"
   - "Sur compte bancaire ****1234 (Crédit Agricole) · arrivée sous 1-3 jours ouvrés"
   - À droite : bouton vert "Reverser maintenant" (background #1D9E75 white) + bouton "Voir sur Stripe"
   - Bandeau info en bas : "Mode manuel activé. Vous reversez vous-même quand vous voulez. Pour un reversement automatique quotidien, configurez-le sur votre dashboard Stripe."
   
   Section 2 cards :
   - "Prochain reversement estimé" (ti-clock-hour-3 #BA7517) :
     * Date 22px monospace "Vendredi 16 mai"
     * Montant "~ 162,75 €"
     * "Vous reversez généralement tous les 7 jours selon votre historique."
     * Lignes : Solde actuel 127,50 € / + paiements futurs (estim.) + 35,25 €
   
   - "Total reversé · 30 jours" (ti-wallet #0F6E56) :
     * Montant 22px "270,00 €"
     * "Sur 4 reversements"
     * Barre de progression gradient #1D9E75 → #0F6E56
     * Moyenne · 67,50 € / Min 60 € · Max 125 €
   
   Section "HISTORIQUE DES REVERSEMENTS" : liste payouts
   Chaque ligne : icône ti-arrow-down (40x40 fond #E1F5EE) + "Reversement du DATE" + tag vert "✓ Reçu" + meta "Compte ****1234 · arrivé le DATE · X paiements groupés" + montant à droite + "par EMPLOYE"
   
   Footer : "X reversement plus ancien…" + bouton "Voir tout"

6. Hook useStats(period) — frontend/src/hooks/useStats.js
   - Lazy loading : seul l'onglet actif déclenche son appel API
   - Cache 5 min via SWR ou React Query

7. Composants utilitaires dans /components/stats/ :
   - KPICard.jsx
   - SegmentedBar.jsx
   - LineChart.jsx (SVG polylines pour Performance)
   - BarChart.jsx (SVG bars pour Paiements en ligne)
   - PayoutHistoryRow.jsx

CONTRAINTES STRICTES
- 4 onglets uniquement
- Le bouton "Reverser maintenant" est placeholder (Commit 5 le rendra fonctionnel — pour l'instant onClick affiche alert ou disabled)
- Pas de modif Historique
- Couleurs strictement /docs/flowia-v03/01-design-system.md
- Icônes Tabler outline
- Police monospace pour montants
- Dark mode obligatoire
- Responsive ≥ 768px
- Apostrophes JSX en double quotes
- Format "1 234,56 €" et "X,X%"

VALIDATION
- 4 onglets navigables sans rechargement
- Données API correctes par onglet
- HERO gradient bleu rendu sur Paiements en ligne
- HERO border vert 2px rendu sur Reversements
- Graphique 30j affiche les 3 courbes en Performance
- Histogramme bars en Paiements en ligne
- Dark mode OK
- Performance : changement onglet < 200ms

MESSAGE DE COMMIT
feat(stats): redesign with 4 tabs covering all FlowIA revenue sources

- Add 4 tabs: Performance, RDV, Paiements en ligne, Reversements
- TabPerformance: 4 source KPIs + Stripe balance + 30j evolution chart
- TabRDV: 2 source cards + segmented status bar + employee perf + insight
- TabPaiementsLigne: gradient hero + 4 status KPIs + policy + business impact + 30j bar chart
- TabReversements: green border hero CTA + estimation + history list
- Add useStats hook with lazy-loading per tab
- Add reusable KPICard, SegmentedBar, LineChart, BarChart components
```
