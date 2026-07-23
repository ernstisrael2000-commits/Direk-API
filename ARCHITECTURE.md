# Direct API — Architecture

## Vision

Direct API est une plateforme SaaS B2B indépendante de toute infrastructure.
Replit est l'environnement de développement actuel — pas une dépendance du produit.
Le code doit pouvoir tourner sur Vercel, AWS, GCP, un VPS, ou tout autre hébergeur
sans modification.

---

## Stack technique

| Couche | Technologie | Rôle |
|--------|-------------|------|
| Serveur | Node.js + Express | API REST, sessions, rate limiting |
| Base de données | Supabase (PostgreSQL) | Données persistantes, RLS |
| Authentification | Sessions Express + Supabase Auth (OAuth) | Login email/password + Google |
| Frontend | HTML/CSS + Tailwind CDN + petite-vue | Interface utilisateur (sans build step) |
| Paiement wallet | Pay'm (`plopplop.solutionip.app`) | Recharge HTG via MonCash/NatCash |
| Fournisseur recharges | FazerCards (`api.fzr.cards`) — et futurs | Exécution des recharges jeux |

---

## Structure des fichiers

```
direct-api/
├── server.js                  # Point d'entrée — Express, middleware, routes
├── routes/
│   ├── auth.js                # Login, signup, Google OAuth, logout
│   ├── dashboard.js           # Données du tableau de bord reseller
│   ├── services.js            # Liste des services et produits (public resellers)
│   ├── orders.js              # Passage de commande (multi-service, multi-provider)
│   ├── recharge.js            # Legacy — endpoint /recharge (FazerCards direct)
│   ├── wallet.js              # Recharge de solde via Pay'm
│   ├── transactions.js        # Historique des transactions
│   ├── products.js            # Catalogue produits (lecture resellers)
│   └── admin.js               # Gestion admin (services, fournisseurs, produits, resellers)
├── lib/
│   ├── supabase.js            # Client Supabase service_role (opérations DB)
│   ├── supabase-auth.js       # Client Supabase anon + PKCE (OAuth Google)
│   └── providers/
│       ├── index.js           # Registre des adaptateurs fournisseurs
│       ├── base.js            # Interface BaseProvider
│       └── fazercards.js      # Adaptateur FazerCards
├── middleware/
│   ├── requireAuth.js         # Session reseller requise
│   ├── requireApiKey.js       # Authentification par clé API (X-API-Key)
│   └── requireAdmin.js        # Secret admin (Authorization: Bearer)
├── public/                    # Pages HTML statiques (frontend)
│   ├── index.html             # Dashboard reseller
│   ├── login.html             # Connexion / Inscription
│   ├── historique.html        # Historique transactions
│   ├── recharge.html          # Recharge wallet
│   ├── api-doc.html           # Documentation API pour les resellers
│   ├── profil.html            # Profil & Réglages
│   └── admin.html             # Interface admin
├── docs/
│   ├── schema.sql             # Schéma DB initial (v1)
│   ├── schema-migration-v2.sql # Migration v2 (multi-service)
│   ├── INSTALLATION.md        # Guide d'installation
│   ├── ADDING_SERVICE.md      # Ajouter un nouveau service/fournisseur
│   ├── SECURITY_RULES.md      # Règles de sécurité
│   ├── DATABASE_RULES.md      # Règles base de données
│   ├── WALLET_SECURITY.md     # Sécurité des wallets
│   ├── API_DESIGN_RULES.md    # Conventions API
│   ├── PROVIDER_INTEGRATION.md # Intégration fournisseurs
│   └── DEVELOPMENT_WORKFLOW.md # Workflow de développement
├── ARCHITECTURE.md            # Ce fichier
├── CHANGELOG.md               # Historique des modifications
├── replit.md                  # Configuration Replit (dev uniquement)
└── PROJECT.md                 # Journal et décisions du projet
```

---

## Architecture base de données

### Tables principales

| Table | Description |
|-------|-------------|
| `resellers` | Comptes resellers (auth email/password + Google OAuth) |
| `services` | Catalogue de types de services (Free Fire, cartes cadeaux…) |
| `fournisseurs` | APIs partenaires avec config et référence à la variable d'env de la clé |
| `produits` | Offres liées à un service + fournisseur, avec `params_schema` dynamique |
| `commandes` | Commandes passées (multi-service), avec params jsonb et réponse fournisseur |
| `wallet_transactions` | Recharges de solde via Pay'm |

### Principe de sécurité DB
- **Row Level Security (RLS) activé** sur toutes les tables
- **Accès uniquement via service_role** (clé serveur) — le frontend ne touche jamais la DB directement
- **Montants en centimes HTG (INTEGER)** — jamais de flottants pour les soldes
- **Opérations financières atomiques** via RPC PostgreSQL (fonctions `create_commande`, `confirm_wallet_topup`, `refund_commande`)

---

## Architecture provider (fournisseurs API)

```
lib/providers/
├── index.js          ← Registre : { slug → Classe }
├── base.js           ← Interface BaseProvider
│                        - validatePlayer(productMeta, params) → { ok, playerName, error }
│                        - createOrder(productMeta, params) → { ok, refFournisseur, rawResponse, error }
└── fazercards.js     ← Implémentation FazerCards
    smilecoin.js      ← (futur)
    giftcards.js      ← (futur)
```

**Pour ajouter un fournisseur** → voir `docs/ADDING_SERVICE.md`

---

## Flux d'une commande

```
Reseller (X-API-Key)
    → POST /api/v1/orders { product_id, params }
    → Vérification clé API (requireApiKey)
    → Récupération produit + fournisseur (Supabase)
    → Validation params_schema
    → Vérification solde
    → validatePlayer() via provider adapter
    → create_commande() RPC (atomique : débite + crée commande)
    → createOrder() via provider adapter
    → Si succès : update commande status=success
    → Si échec  : refund_commande() RPC (atomique : rembourse + marque refunded)
    → Réponse JSON
```

---

## Variables d'environnement

| Variable | Requis | Description |
|----------|--------|-------------|
| `SESSION_SECRET` | ✅ | Secret de chiffrement des sessions Express |
| `SUPABASE_URL` | ✅ | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Clé service Supabase (serveur uniquement) |
| `SUPABASE_ANON_KEY` | ✅ | Clé publique Supabase (OAuth PKCE) |
| `APP_URL` | Production | URL publique de l'app (ex: `https://directapi.com`) |
| `PAYM_CLIENT_ID` | Wallet | Identifiant Pay'm |
| `PAYM_CLIENT_SECRET` | Wallet | Secret Pay'm |
| `FAZERCARDS_API_KEY` | FazerCards | Clé API FazerCards (`fc_…`) |
| `ADMIN_SECRET` | ✅ | Secret pour protéger les routes admin |
| `PORT` | Dev | Port du serveur (défaut : 3000) |
| `NODE_ENV` | Production | `production` pour activer HTTPS cookies |

---

## Portabilité

Le projet est conçu pour tourner sur n'importe quelle infrastructure :

- **Replit** (actuel) : `node server.js` sur port 3000 → externe port 80
- **VPS / Docker** : `PORT=8080 node server.js`
- **Heroku / Railway / Render** : détecte `PORT` automatiquement
- **AWS EC2 / GCP VM** : idem, configurer `APP_URL` en prod

> ⚠️ **Sessions** : `express-session` stocke les sessions en mémoire par défaut.
> Sur un déploiement multi-instance (autoscale), utiliser un store externe :
> `connect-redis` (Redis) ou `connect-pg-simple` (PostgreSQL).
> Sur un déploiement single-instance (Reserved VM, VPS), le défaut fonctionne.

---

## Conventions de code

- **Langue** : français pour les noms de domaine métier (reseller, solde, commande), anglais pour le code technique
- **Réponses API** : toujours `{ ok: true/false, ... }` avec codes HTTP appropriés
- **Erreurs** : jamais de stack trace exposée au client
- **Argent** : toujours en centimes HTG (INTEGER), jamais de float
- **Versioning API** : `/api/v1/` — incrémenter pour les breaking changes
