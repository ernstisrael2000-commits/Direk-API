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
- **Paiement wallet** : Pay'm (paymplopplop.com) — passerelle haïtienne (resellers rechargent leur solde)
- **Fournisseur recharges** : À identifier — API externe pour exécuter les vraies recharges Free Fire (invisible au reseller)
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

### Pages frontend (depuis le ZIP de design)
| Fichier | Page | Contenu clé |
|---------|------|-------------|
| `01-...dashboard.html` | **Dashboard (Home)** | Solde HTG, boutons MonCash/NatCash, clé API tronquée + copier + régénérer, 3 dernières transactions |
| `02-...historique.html` | **Historique transactions** | Liste complète wallet + API transactions |
| `03-...recharge-confirmation.html` | **Recharge wallet** | Saisie montant, sélection méthode (MonCash/NatCash), résumé frais 1.5%, CTA Pay'm |
| `04-...documentation-api.html` | **Documentation API** | Auth header, endpoint `POST /api/v1/recharge`, exemples JSON |
| `05-...profile-settings.html` | **Profil & Réglages** | Infos compte, 2FA toggle, clé API + régénérer, déconnexion |

**Stack du design :** Tailwind CSS CDN + Iconify + Satoshi/Clash Grotesk (Fontshare) + petite-vue

**Points importants du design :**
- Application **mobile-first** avec bottom navigation (Home / Historique / API Doc / Profil)
- Préfixe clé API affiché : `dk_live_`
- Endpoint API montré dans le design : `POST /api/v1/recharge` (pas `/topup`)
- Frais de transaction Pay'm : **1.5%** affichés dans le design
- ⚠️ **Pas de page login/signup dans le design** — à créer (formulaire d'inscription + connexion)
- ⚠️ **Pas de page admin** dans le design — à créer séparément (gestion catalogue produits)

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

## Intégrations externes — détails techniques

### Pay'm (plopplop.solutionip.app) — Paiement wallet
- Base URL : `https://plopplop.solutionip.app/`
- Créer paiement : `POST /api/paiement-marchand` → champs : `client_id`, `refference_id` (typo dans leur API), `montant` (HTG, >= 20), `payment_method` (moncash/kashpaw/natcash/all)
- Réponse : `{ status, message, url, transaction_id }` — rediriger le reseller vers `url`
- Vérifier statut : `POST /api/paiement-verify` → champs : `client_id`, `refference_id` → `trans_status: "no"` (en attente) ou `"ok"` (confirmé)
- ⚠️ **PAS DE WEBHOOK** — Pay'm n'envoie pas de notification push. Il faut vérifier le statut par polling ou à la redirection de retour.
- Variables nécessaires : `PAYM_CLIENT_ID`, `PAYM_CLIENT_SECRET`

### FazerCards (api.fzr.cards) — Fournisseur recharges jeux
- Base URL : `https://api.fzr.cards`
- Version API : `/api/v2`
- Auth : header `X-API-Key: fc_…`
- Endpoints clés pour nous :
  - `GET /api/v2/topups` — catalogue catégories (Free Fire, etc.)
  - `GET /api/v2/topups/offers` — liste des offres/produits avec prix
  - `POST /api/v2/topups/order` — créer une commande de recharge
  - `GET /api/v2/topups/validate-id` — valider l'ID joueur avant commande
- Suivi commandes : section `/api/v2/orders/{id}`
- Réponses : `{ ok, … }`
- Variable nécessaire : `FAZERCARDS_API_KEY`

## Problèmes / limitations connus
- ⚠️ **Pay'm sans webhook** : l'étape 4 prévue comme "webhook-paym" devient une route de vérification `POST /api/v1/verify-payment` appelée soit au retour de redirection Pay'm, soit par polling. Logique idempotente requise (même référence = une seule fois).
- Les soldes sont stockés en **centimes HTG** (entiers) pour éviter tout problème d'arrondi flottant.
- La clé API des resellers est hashée (bcrypt) en base — affichée en clair uniquement à la création ou régénération.
- Le champ `refference_id` dans l'API Pay'm contient une faute de frappe (double f) — à respecter exactement.
