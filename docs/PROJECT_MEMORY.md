# Direct API - Project Memory

## Objectif du fichier

Ce document sert de mémoire centrale du projet.

Avant toute modification, toute IA ou développeur doit lire ce fichier pour comprendre :

- l'état actuel du projet
- les fonctionnalités déjà terminées
- les décisions techniques prises
- les problèmes connus
- les prochaines étapes


---

# Informations générales

Nom du projet :
Direct API

Description :

Plateforme API permettant aux resellers de recharger un solde (via Pay'm) puis d'utiliser une API intermédiaire pour vendre des services numériques (exemple : diamants Free Fire via FazerCards). Le fournisseur reste invisible au reseller.

Architecture :

Frontend :
HTML + Tailwind CSS CDN + petite-vue 0.4.1 (vanilla, pas de framework lourd)

Backend :
Node.js + Express.js — fichier `server.js` à la racine

Base de données :
Supabase PostgreSQL (non encore connecté — Phase 2)

Hébergement :
Replit (port 3000, workflow "Direct API" → `node server.js`)


---

# Règles importantes

NE JAMAIS :

- modifier une fonctionnalité existante sans vérifier son impact
- supprimer une table sans validation
- changer l'architecture sans documentation
- exposer une clé API côté frontend ou dans Git
- permettre au frontend de modifier des données sensibles directement dans Supabase


Toujours :

- lire `docs/SECURITY_RULES.md` avant toute modification backend
- lire `docs/DATABASE_RULES.md` avant toute modification base de données
- stocker les montants en INTEGER (centimes HTG, ex: 5000 = 50.00 HTG)
- rendre toutes les opérations financières atomiques
- documenter chaque changement dans ce fichier


---

# État actuel du projet


## Étape actuelle :

Phase 1 terminée — Intégration du design.
Prochaine étape : Phase 2 — Configuration Supabase (tables + RLS).


## Fonctionnalités terminées :

- [x] Import du design ZIP (5 pages adaptées + 2 nouvelles créées)
- [ ] Connexion Supabase
- [ ] Création table resellers
- [ ] Création table produits
- [ ] Création table wallet_transactions
- [ ] Création table api_transactions
- [ ] Fonction creer-reseller
- [ ] Gestion produits (admin)
- [ ] Recharge wallet (Pay'm)
- [ ] Vérification paiement Pay'm (polling)
- [ ] API recharge (FazerCards)
- [ ] Régénération clé API


---

# Architecture actuelle


## Fichiers & dossiers

```
/
├── server.js                  → Serveur Express (port 3000), sert les pages statiques
├── package.json               → Dépendances Node.js (express)
├── PROJECT.md                 → Journal de bord du projet (sessions, décisions)
├── public/
│   ├── index.html             → Dashboard reseller (page 1 du design)
│   ├── historique.html        → Historique des transactions (page 2)
│   ├── recharge.html          → Recharge wallet via Pay'm (page 3)
│   ├── api-doc.html           → Documentation API (page 4)
│   ├── profil.html            → Profil & Réglages (page 5)
│   ├── login.html             → Connexion / Inscription (nouvelle)
│   └── admin.html             → Admin catalogue produits (nouvelle)
└── docs/
    ├── PROJECT_MEMORY.md      → Ce fichier
    ├── SECURITY_RULES.md      → Règles de sécurité
    ├── DATABASE_RULES.md      → Règles base de données
    ├── WALLET_SECURITY.md     → Règles wallet
    ├── API_DESIGN_RULES.md    → Format API, versioning, rate limiting
    ├── PROVIDER_INTEGRATION.md → Intégration fournisseur FazerCards
    └── DEVELOPMENT_WORKFLOW.md → Ordre de développement obligatoire
```

## Routes frontend

| URL | Fichier | Description |
|-----|---------|-------------|
| `/` | `public/index.html` | Dashboard |
| `/historique` | `public/historique.html` | Historique |
| `/recharge` | `public/recharge.html` | Recharge wallet |
| `/api-doc` | `public/api-doc.html` | Documentation API |
| `/profil` | `public/profil.html` | Profil & Réglages |
| `/login` | `public/login.html` | Connexion / Inscription |
| `/admin` | `public/admin.html` | Admin catalogue |


## Base de données

### resellers

Statut : Non créée

Colonnes prévues :
- id (uuid, PK)
- nom (text)
- email (text, unique)
- api_key_hash (text) — clé hashée bcrypt, jamais en clair
- balance (integer) — centimes HTG
- status (text) — 'actif' | 'suspendu'
- created_at (timestamptz)


### produits

Statut : Non créée

Colonnes prévues :
- id (uuid, PK)
- fournisseur (text) — ex: 'freefire'
- nom (text) — ex: '100 Diamants'
- code_fournisseur (text) — code attendu par FazerCards
- prix_achat (integer) — centimes HTG
- prix_vente (integer) — centimes HTG
- actif (boolean)


### wallet_transactions

Statut : Non créée

Colonnes prévues :
- id (uuid, PK)
- reseller_id (uuid, FK → resellers)
- montant (integer) — centimes HTG
- reference (text, unique) — générée par nous
- paym_transaction_id (text)
- status (text) — 'pending' | 'confirmed' | 'expired'
- created_at (timestamptz)


### api_transactions

Statut : Non créée

Colonnes prévues :
- id (uuid, PK)
- reseller_id (uuid, FK → resellers)
- produit_id (uuid, FK → produits)
- joueur_id (text)
- prix_reseller (integer) — centimes HTG
- prix_fournisseur (integer) — centimes HTG
- status (text) — 'reserved' | 'success' | 'failed' | 'refunded'
- ref_fournisseur (text)
- created_at (timestamptz)


---

# Fonctions serveur existantes

## Aucune encore créée

Toutes les fonctions backend sont à créer en Phase 2 et Phase 3.

Fonctions prévues :
- `POST /api/v1/auth/register` — creer-reseller
- `POST /api/v1/auth/login` — connexion
- `GET  /api/v1/products` — liste produits actifs
- `POST /api/v1/wallet/topup` — initier recharge Pay'm
- `POST /api/v1/wallet/verify` — vérifier paiement Pay'm (polling)
- `POST /api/v1/recharge` — demander une recharge jeu
- `POST /api/v1/auth/regenerate-key` — régénérer clé API
- `GET  /api/v1/transactions` — historique transactions
- `GET  /api/v1/dashboard` — solde + stats


---

# Intégrations externes

## Pay'm (paiement wallet resellers)

- Base URL : `https://plopplop.solutionip.app/`
- Créer paiement : `POST /api/paiement-marchand`
- Vérifier : `POST /api/paiement-verify` (trans_status: "no" | "ok")
- ⚠️ PAS de webhook — système polling uniquement
- Variables : `PAYM_CLIENT_ID`, `PAYM_CLIENT_SECRET`

## FazerCards (fournisseur recharges jeux)

- Base URL : `https://api.fzr.cards`
- Auth : header `X-API-Key: fc_…`
- Version : `/api/v2`
- Endpoints utilisés : `GET /api/v2/topups/offers`, `POST /api/v2/topups/order`, `GET /api/v2/topups/validate-id`
- Variable : `FAZERCARDS_API_KEY`


---

# Dernières modifications

## Date : 22/07/2026

## Modification : Phase 1 — Intégration du design frontend

## Fichiers créés :
- `server.js` — serveur Express
- `package.json` — dépendances
- `public/index.html` — dashboard (depuis design ZIP)
- `public/historique.html` — historique (depuis design ZIP)
- `public/recharge.html` — recharge (depuis design ZIP)
- `public/api-doc.html` — documentation (depuis design ZIP)
- `public/profil.html` — profil (depuis design ZIP)
- `public/login.html` — nouvelle page (même style)
- `public/admin.html` — nouvelle page (même style)
- `docs/` — 6 fichiers de règles + ce fichier

## Pourquoi ces modifications :
Étape 0 du workflow : intégrer le design ZIP et vérifier que les 7 pages s'affichent correctement avant de connecter le backend.

## Tests réalisés :
- `/` dashboard : ✅ affiché correctement
- `/historique` : ✅ affiché correctement
- `/recharge` : ✅ affiché correctement
- `/api-doc` : ✅ affiché correctement
- `/profil` : ✅ affiché correctement (navigué via lien)
- `/login` : ✅ affiché correctement
- `/admin` : ✅ affiché correctement, toggle actif/inactif fonctionne avec petite-vue

## Problèmes restants :
- Tailwind CDN affiche un warning "ne pas utiliser en prod" — normal pour l'instant, à remplacer par Tailwind CLI en Phase 3
- Toutes les données sont statiques (hardcodées) — seront remplacées par les vraies données Supabase en Phase 3


---

# Bugs connus

| Problème | Priorité | Statut |
|---|---|---|
| Données statiques hardcodées | Normale | En attente Phase 3 |
| Tailwind CDN (warning prod) | Basse | En attente Phase 3 |


---

# Décisions techniques

## 1. Pas de webhook Pay'm — polling

Pay'm ne supporte pas les webhooks. La confirmation de paiement se fait par polling via `POST /api/paiement-verify`.

Raison : limitation de l'API Pay'm.

Date décision : 22/07/2026

## 2. Montants en INTEGER (centimes)

Tous les montants sont stockés en centimes HTG (ex: 5000 = 50.00 HTG). Jamais de float.

Raison : éviter les erreurs d'arrondi sur les opérations financières.

Date décision : 22/07/2026

## 3. Clés API resellers hashées (bcrypt)

La clé API est générée aléatoirement, hashée avec bcrypt, et stockée hashée. Elle n'est affichée en clair qu'à la création ou régénération.

Raison : sécurité — même un accès à la base de données ne révèle pas les clés.

Date décision : 22/07/2026

## 4. Préfixe clé API : dk_live_

Format visible côté reseller : `dk_live_XXXXXXXXXX...`

Raison : cohérence avec le design et identification rapide des clés.

Date décision : 22/07/2026

## 5. Frontend non fiable — tout passe par le serveur

Le frontend ne peut jamais appeler Supabase directement. Toute action sensible passe par `server.js`.

Raison : SECURITY_RULES.md — règle principale.

Date décision : 22/07/2026


---

# Instructions pour la prochaine IA

Avant de coder :

1. Lire `docs/SECURITY_RULES.md`
2. Lire `docs/DATABASE_RULES.md`
3. Lire `docs/WALLET_SECURITY.md`
4. Lire ce fichier (`docs/PROJECT_MEMORY.md`)
5. Vérifier la structure existante dans `server.js` et `public/`
6. Ne pas recréer une fonctionnalité déjà existante
7. Ne pas changer le design des pages HTML

Après modification :

Mettre à jour ce fichier avec :
- ce qui a été changé
- les fichiers modifiés
- les tests effectués
- les problèmes restants
- les nouvelles décisions techniques

Avant toute action, analyser ce fichier et la structure actuelle. Ne pas recommencer une fonctionnalité existante. Mettre à jour PROJECT_MEMORY.md après chaque modification importante.

FIN DU DOCUMENT
