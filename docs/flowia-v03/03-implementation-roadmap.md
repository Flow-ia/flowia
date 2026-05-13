# 🛣️ Roadmap d'implémentation — 5 commits

> **Ordre obligatoire**. Ne pas mélanger les scopes.

---

## 📋 Vue d'ensemble

```
Commit 1 ──→ Backend : schéma BDD + migration rétro-remplissage
Commit 2 ──→ Backend : routes API + webhooks Stripe
Commit 3 ──→ Frontend : refonte page Historique
Commit 4 ──→ Frontend : refonte page Statistiques (4 onglets)
Commit 5 ──→ Backend + Frontend : bouton "Reverser maintenant"
```

---

## 🔵 Commit 1 — Schéma BDD + migration

**Risque** : ⚠️ HAUT (preview branch obligatoire)  
**Files** : ~5 fichiers backend

**Scope** : tables `appointments` / `transactions` / `payouts`, migration rétro-remplissage, contrainte UNIQUE anti-double-paiement.

**Hors scope** : aucune route API, aucun frontend, aucun webhook.

→ Voir `prompts/commit-1-schema-bdd.md`

---

## 🟢 Commit 2 — Routes API + Webhooks

**Risque** : 🟡 MOYEN (additif)  
**Files** : ~10 fichiers backend

**Scope** : routes `/api/historique`, `/api/stats/{performance,rdv,online-payments}`, `/api/stripe/balance`, `/api/payouts`. Webhooks Stripe.

**Hors scope** : aucun frontend, pas de bouton payout (Commit 5).

→ Voir `prompts/commit-2-routes-api.md`

---

## 🟣 Commit 3 — Frontend Historique

**Risque** : 🟢 FAIBLE (visuel)  
**Files** : ~8 fichiers frontend

**Scope** : refonte complète selon mockup `02-historique.html`. 5 KPI cards, 5 filtres, lignes de transaction avec icônes par type, walk-in distinct visuellement.

**Hors scope** : aucune modif Statistiques.

→ Voir `prompts/commit-3-frontend-historique.md`

---

## 🟠 Commit 4 — Frontend Statistiques (4 onglets)

**Risque** : 🟢 FAIBLE (visuel)  
**Files** : ~12 fichiers frontend

**Scope** : 4 onglets selon mockups `03` à `06`. Performance (4 KPI sources + bandeau Stripe + graphique 30j), RDV (sources + statuts segmentés + employés), Paiements en ligne (gradient hero + KPI), Reversements (hero CTA vert + estimation + historique).

**Hors scope** : bouton payout fonctionnel (Commit 5).

→ Voir `prompts/commit-4-frontend-statistiques.md`

---

## 🔴 Commit 5 — Bouton "Reverser maintenant"

**Risque** : 🟡 MOYEN (Stripe API)  
**Files** : ~6 fichiers (backend + frontend)

**Scope** : route `POST /api/stripe/payout/create`, modal de confirmation, intégration dans Dashboard + Stats Performance + Stats Reversements, gestion idle/loading/success/error.

**Hors scope** : payouts automatiques.

→ Voir `prompts/commit-5-bouton-payout.md`

---

## 📦 Stratégie de merge

```
1. Branche refonte-archi-v3
2. Implémenter selon prompt précis
3. Tester localement
4. Push sur GitHub → Vercel preview
5. Tester en preview avec "Salon de Test"
6. Si OK → merge sur main (commits 2,3,4 = direct main possible)
7. Commit 1 → preview branch obligatoire
8. Commit 5 → mode test Stripe avant prod
```

---

## ⏱️ Estimation Claude Code

| Commit | Estimation | Complexité |
|---|---|---|
| Commit 1 | 30-45 min | ⭐⭐⭐ |
| Commit 2 | 45-60 min | ⭐⭐⭐⭐ |
| Commit 3 | 30-45 min | ⭐⭐ |
| Commit 4 | 60-75 min | ⭐⭐⭐ |
| Commit 5 | 30-45 min | ⭐⭐⭐⭐ |
| **Total** | **~3-4h** | |

---

## 🚦 Critères Go/No-Go

### Après Commit 1
- [ ] Aucune transaction Hair Coiff Lille cassée
- [ ] Migration < 30 secondes
- [ ] Anti-double-paiement OK

### Après Commit 2
- [ ] Routes < 500ms
- [ ] Webhooks Stripe synchronisés
- [ ] Pas de doublons sur webhook reçu 2 fois

### Après Commit 3
- [ ] 5 types de transactions affichés
- [ ] Walk-in distinct visuellement (ti-walk + fond doré)
- [ ] Filtres fonctionnels

### Après Commit 4
- [ ] 4 onglets navigables
- [ ] KPI cohérents avec BDD
- [ ] Hero gradient bleu sur Paiements en ligne
- [ ] Hero CTA vert sur Reversements

### Après Commit 5
- [ ] Payout fonctionne en TEST puis PROD
- [ ] Modal de confirmation OK
- [ ] Pas de double-clic possible
