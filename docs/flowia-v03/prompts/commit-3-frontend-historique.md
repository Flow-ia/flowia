# 🟣 Commit 3 — Frontend Refonte page Historique

> **Prompt prêt à coller dans Claude Code**.

---

```
Refonte complète de la page Historique pour afficher les 4 sources de revenus avec les 6 statuts de paiement.

CONTEXTE
La maquette finale est dans /docs/flowia-v03/mockups/02-historique.html (à ouvrir pour référence visuelle exacte).
Le backend est prêt (Commits 1 et 2). GET /api/historique retourne les transactions avec leurs montants détaillés.

À FAIRE

1. Refondre frontend/src/pages/Historique.jsx avec cette structure exacte :
   
   a) En-tête :
      - H1 "Historique des transactions"
      - Sous-titre "Tous les flux d'argent : paiements en ligne, encaissements caisse, walk-in et remboursements"
   
   b) 5 KPI cards en grille horizontale (gap 10px) :
      - "CA TOTAL" (gris neutre, fond blanc) : montant + nb transactions
      - "EN LIGNE" (bleu, fond #E6F1FB) : montant Stripe + nb paiements
      - "CAISSE RDV" (vert, fond #E1F5EE) : montant + nb encaissements
      - "WALK-IN" (doré, fond #FAEEDA) : montant + "X sans RDV"
      - "REMBOURSÉS" (rouge, fond #FCEBEB) : montant négatif + nb
   
   c) Bandeau de filtres (5 selects en grille) :
      - Période / Type / Mode / Source RDV / Employé
   
   d) Header de liste : "X transactions · DATE" + boutons Exporter CSV / PDF
   
   e) Liste des transactions, chaque ligne avec :
      - Icône à gauche (40x40 rounded-md, fond coloré selon type) :
        * STRIPE_100 : ti-credit-card sur #E6F1FB
        * STRIPE_ACOMPTE : ti-credit-card-pay sur #FAEEDA
        * CASH_PAID (cash_register_rdv) : ti-cash sur #E1F5EE
        * walkin : ti-walk sur #FAEEDA — IMPORTANT : icône distincte
        * REFUNDED : ti-arrow-back-up sur #FCEBEB
      
      - Centre :
        * Titre "Service — Nom Client" (ou "Vente produit — client anonyme" pour walkin)
        * Tags pills : statut + source + état payout
        * Meta : "DATE · HEURE · Employé · détails frais"
      
      - Droite :
        * Montant en gros (vert si +, rouge si -, doré si acompte)
        * Sous-texte : "Net : X,XX €" ou "/Y,XX € total"
   
   f) Pour walk-in, fond très léger doré rgba(250,238,218,0.3)
   
   g) Légende horizontale en bas avec les 5 types

2. Composants à créer dans /components/historique/ :
   - TransactionRow.jsx : props { transaction }, choisit icône/couleur/tags
   - HistoriqueFilters.jsx : props { filters, onChange }, debounce 300ms
   - HistoriqueKPI.jsx : props { totals }
   - HistoriqueLegend.jsx

3. Hook useHistorique.js :
   - Appelle GET /api/historique avec filtres
   - Pagination classique avec "Voir tout" en bas
   - Cache 5 min via SWR ou React Query (selon ce qui est en place)

CONTRAINTES STRICTES
- AUCUNE modif Statistiques (Commit 4)
- AUCUNE modif caisse / agenda
- AUCUNE nouvelle dépendance npm
- Couleurs strictement selon /docs/flowia-v03/01-design-system.md
- Icônes Tabler outline UNIQUEMENT (jamais filled, jamais emoji)
- Police monospace pour TOUS les montants
- Dark mode obligatoire
- Format dates FR : "9 mai · 14:30"
- Format montants : "1 234,56 €" (espace milliers, virgule décimale, espace insécable avant €)
- Apostrophes JSX en double quotes
- Responsive ≥ 768px

VALIDATION
- 5 types de transactions affichés avec bonnes icônes/couleurs
- Walk-in distinct visuellement (ti-walk + fond doré)
- Filtres fonctionnels et combinables
- Acompte : "+25,00 € /50,00 €" + "Reste 25 € caisse"
- Remboursement : montant négatif rouge, "Commission rendue"
- Performance : pas de re-render inutile

MESSAGE DE COMMIT
feat(historique): redesign with 4 sources + 6 payment statuses + walk-in

- Add 5 KPI cards (total, en ligne, caisse RDV, walk-in, remboursés)
- Add 5-filter bar
- Add TransactionRow with semantic icons + colors per type
- Distinguish walk-in transactions visually (gold tint background)
- Show detailed breakdown: gross, Stripe fees, FlowIA commission, net
- Add export buttons (CSV, PDF placeholders)
- Add bottom legend
```
