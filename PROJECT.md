# Direct API — Journal du projet

## Règles du projet (lire avant de coder)
| Fichier | Contenu |
|---------|---------|
| `docs/SECURITY_RULES.md` | Frontend non fiable, secrets côté serveur uniquement, validation obligatoire |
| `docs/DATABASE_RULES.md` | RLS sur toutes les tables, montants en INTEGER (centimes), opérations atomiques |
| `docs/WALLET_SECURITY.md` | Crédit/débit contrôlés, protection double paiement, processus recharge |
| `docs/API_DESIGN_RULES.md` | Versioning `/api/v1/`, format réponse standard, codes HTTP, rate limiting |
| `docs/PROVIDER_INTEGRATION.md` | Fournisseur invisible du reseller, gestion erreur + remboursement, timeout |
| `docs/DEVELOPMENT_WORKFLOW.md` | Une phase à la fois, validation obligatoire avant de continuer |

## Vue d'ensemble
**Direct API** est une plateforme B2B de recharge de jeux (Free Fire, et d'autres à venir).
Des "resellers" rechargent un solde chez le propriétaire, puis appellent une API pour déclencher des recharges de jeux pour leurs clients. Le propriétaire passe commande auprès d'un fournisseur officiel en coulisse — le reseller ne le voit jamais.

Stack prévu :
- **Frontend** : pages HTML/CSS issues d'un fichier ZIP de design (5 pages)
- **Base de données** : Supabase (PostgreSQL) avec Row Level Security activée
- **Serveur** : Supabase Edge Functions (Deno) pour toutes les opérations sensibles
- **Paiement** : Pay'm (paymplopplop.com) — passerelle haïtienne
- **Hébergement** : Replit

---

## État actuel
- [ ] Aucune étape réalisée — phase de planification uniquement

---

## Structure technique

### Tables Supabase prévues
| Table | Description |
|-------|-------------|
| `resellers` | Comptes resellers (id, nom, email, api_key_hash, solde_centimes, statut, created_at) |
| `produits` | Catalogue produits (id, fournisseur, nom, code_fournisseur, prix_achat, prix_vente, actif) |
| `wallet_transactions` | Historique recharges de solde via Pay'm (id, reseller_id, montant, reference, statut, date) |
| `api_transactions` | Historique recharges jeux (id, reseller_id, produit_id, joueur_id, prix_reseller, prix_fournisseur, statut, ref_fournisseur, date) |

### Edge Functions prévues
| Fonction | Rôle |
|----------|------|
| `creer-reseller` | Inscription + génération clé API (affichée une seule fois) |
| `gerer-produits` | Interface admin CRUD du catalogue |
| `recharger-solde` | Initie un paiement Pay'm, crée une wallet_transaction en attente |
| `webhook-paym` | Reçoit confirmation Pay'm, vérifie, crédite le solde (idempotent) |
| `demander-recharge` | Fonction principale API : vérifie clé, solde, débite, appelle fournisseur, rembourse si échec |
| `regenerer-cle-api` | Régénère la clé API d'un reseller (invalide l'ancienne) |

### Pages frontend prévues (depuis le ZIP de design)
| Page | Rôle |
|------|------|
| Page 1 | (à confirmer après décompression du ZIP) |
| Page 2 | (à confirmer) |
| Page 3 | (à confirmer) |
| Page 4 | (à confirmer) |
| Page 5 | (à confirmer) |

### Variables d'environnement nécessaires
| Variable | Usage |
|----------|-------|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service Supabase (côté serveur uniquement) |
| `PAYM_API_KEY` | Clé API Pay'm |
| `PAYM_WEBHOOK_SECRET` | Secret pour vérifier les webhooks Pay'm |
| `FOURNISSEUR_API_KEY` | Clé API du fournisseur de recharges (Free Fire, etc.) |
| `ADMIN_SECRET` | Secret pour protéger les routes admin |

---

## Ordre d'implémentation prévu

1. **ÉTAPE 0** — Intégration du design ZIP (5 pages frontend, rien ne change visuellement)
2. **ÉTAPE 1** — Edge Function `creer-reseller` + page d'inscription connectée
3. **ÉTAPE 2** — Edge Function `gerer-produits` + interface admin
4. **ÉTAPE 3** — Edge Function `recharger-solde` + intégration Pay'm
5. **ÉTAPE 4** — Edge Function `webhook-paym` (idempotent, double vérification Pay'm)
6. **ÉTAPE 5** — Edge Function `demander-recharge` (cœur de l'API, rate limiting, remboursement auto)
7. **ÉTAPE 6** — Edge Function `regenerer-cle-api`
8. **ÉTAPE 7** — Branchement tableau de bord (solde, historique, clé API, bouton recharger)

---

## Historique des sessions

### Session 2026-07-22 — Planification initiale
- Lecture du brief complet (fichier texte uploadé)
- Création de PROJECT.md
- Aucune implémentation — en attente du ZIP de design et du feu vert de l'utilisateur

---

## À faire ensuite
- Recevoir le fichier ZIP de design (5 pages)
- Créer le projet Supabase et configurer les variables d'environnement
- Démarrer l'ÉTAPE 0

---

## Problèmes / limitations connus
- L'API Pay'm (paymplopplop.com) est peu documentée publiquement — il faudra que l'utilisateur fournisse la doc ou les endpoints exacts.
- Le fournisseur de recharges Free Fire n'est pas encore identifié — idem, doc à fournir.
- Les soldes sont stockés en **centimes** (entiers) pour éviter tout problème d'arrondi flottant.
- La clé API des resellers doit être hashée (bcrypt ou SHA-256) en base — elle n'est affichée en clair qu'une seule fois à la création.
