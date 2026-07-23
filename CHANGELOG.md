# Changelog — Direct API

Toutes les modifications importantes sont documentées ici.
Format : [Date] — Description — Fichiers concernés

---

## [2026-07-23] — Architecture multi-service + portabilité

### Ajouté
- **`lib/providers/`** — couche d'abstraction pour les fournisseurs API
  - `base.js` : interface `BaseProvider` (validatePlayer, createOrder)
  - `fazercards.js` : adaptateur FazerCards
  - `index.js` : registre des adaptateurs (slug → classe)
- **`routes/services.js`** — endpoints publics resellers pour les services et produits
  - `GET /api/v1/services` — liste des services actifs
  - `GET /api/v1/services/:slug/products` — produits d'un service
- **`routes/orders.js`** — endpoint de commande générique multi-service
  - `POST /api/v1/orders` — commande avec `product_id` + `params` dynamiques
  - `GET /api/v1/orders/:id` — statut d'une commande
- **`docs/schema-migration-v2.sql`** — migration DB additive
  - Tables : `services`, `fournisseurs`, `commandes`
  - Colonnes : `produits.service_id`, `produits.fournisseur_id`, `produits.params_schema`, `produits.meta`
  - RPC : `create_commande`, `refund_commande`
- **`ARCHITECTURE.md`** — documentation d'architecture complète
- **`CHANGELOG.md`** — ce fichier
- **`docs/INSTALLATION.md`** — guide d'installation local et production
- **`docs/ADDING_SERVICE.md`** — guide pour ajouter un nouveau service/fournisseur

### Modifié
- **`routes/admin.js`** — ajout CRUD services, fournisseurs ; produits liés à service+fournisseur
- **`server.js`** — enregistrement des nouvelles routes (`/services`, `/orders`)
- **`routes/auth.js`** — suppression dépendance `REPLIT_DEV_DOMAIN`, remplacé par `APP_URL`
  (portable : fonctionne sur tout hébergeur sans modification)
- **`.replit`** — ajout section `[deployment]` pour la publication Replit

### Règle d'architecture établie
- Free Fire = premier service, pas cas unique
- Tout nouveau fournisseur = 1 adaptateur dans `lib/providers/` + 1 ligne dans la DB
- Pas de logique spécifique FazerCards dans les routes génériques

---

## [2026-07-22] — Phase 1 : setup initial + authentification

### Ajouté
- **`server.js`** — serveur Express sur port 3000, sessions, rate limiting
- **`routes/auth.js`** — login email/password, inscription, logout, régénération clé API
- **`routes/auth.js`** — Google OAuth (PKCE côté serveur via Supabase Auth)
  - `GET /api/v1/auth/google` → redirection Google
  - `GET /api/v1/auth/callback` → échange code, création/récupération reseller
- **`routes/dashboard.js`** — données tableau de bord reseller
- **`routes/transactions.js`** — historique transactions (wallet + commandes)
- **`routes/wallet.js`** — recharge solde via Pay'm + vérification idempotente
- **`routes/recharge.js`** — recharge jeu via FazerCards (legacy, conservé pour compat)
- **`routes/products.js`** — liste des produits actifs
- **`routes/admin.js`** — gestion admin (produits, resellers)
- **`lib/supabase.js`** — client Supabase service_role
- **`lib/supabase-auth.js`** — client Supabase anon + PKCE (OAuth)
- **`middleware/requireAuth.js`** — authentification par session
- **`middleware/requireApiKey.js`** — authentification par clé API `dk_live_`
- **`middleware/requireAdmin.js`** — authentification admin par secret Bearer
- **`public/`** — 7 pages frontend (login, dashboard, historique, recharge, api-doc, profil, admin)
- **`docs/schema.sql`** — schéma initial Supabase (resellers, produits, wallet_transactions, api_transactions)

### Décisions techniques
- Sessions Express en mémoire (single-instance) — migrer vers Redis pour multi-instance
- Clé API resellers : préfixe `dk_live_` + 64 chars hex, stockée hashée (bcrypt)
- Montants en centimes HTG (INTEGER) — règle absolue, jamais de float
- Pay'm : pas de webhook, vérification par polling (`POST /api/v1/wallet/verify`)
- Supabase : accès uniquement via service_role côté serveur

---

## Comment contribuer à ce changelog

Avant chaque modification importante :
1. Ajouter une entrée en haut de ce fichier
2. Format : `## [YYYY-MM-DD] — Titre court`
3. Sections : **Ajouté**, **Modifié**, **Corrigé**, **Supprimé**
4. Mentionner les fichiers concernés et la raison du changement
5. Si une règle d'architecture change, la documenter explicitement
