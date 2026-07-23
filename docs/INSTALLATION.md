# Direct API — Guide d'installation

## Prérequis

- Node.js 18+ (testé sur Node 20)
- Un projet Supabase (gratuit sur supabase.com)
- Compte Google Cloud (pour OAuth Google)

---

## Installation locale

```bash
# 1. Cloner le projet
git clone <repo-url>
cd direct-api

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos valeurs (voir section Variables ci-dessous)

# 4. Initialiser la base de données Supabase
# Aller dans Supabase Dashboard → SQL Editor
# Exécuter : docs/schema.sql (première installation)
# Puis      : docs/schema-migration-v2.sql (architecture multi-service)

# 5. Démarrer le serveur
node server.js
# → http://localhost:3000
```

---

## Variables d'environnement

Créer un fichier `.env` à la racine (ou configurer dans votre hébergeur) :

```env
# ── Serveur ─────────────────────────────────────────────────
SESSION_SECRET=une-chaine-aleatoire-longue-et-secrete
PORT=3000
NODE_ENV=development

# ── Supabase ─────────────────────────────────────────────────
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # clé service_role (JAMAIS exposée au frontend)
SUPABASE_ANON_KEY=eyJ...          # clé anon/public (utilisée pour OAuth PKCE)

# ── URL publique (production uniquement) ──────────────────────
APP_URL=https://votredomaine.com   # Requis en prod pour le callback Google OAuth

# ── Google OAuth ──────────────────────────────────────────────
# Configurer dans : Supabase → Auth → Providers → Google
# Les credentials sont dans Supabase, pas ici.

# ── Pay'm (paiement wallet) ───────────────────────────────────
PAYM_CLIENT_ID=votre-client-id
PAYM_CLIENT_SECRET=votre-client-secret

# ── FazerCards (fournisseur recharges jeux) ───────────────────
FAZERCARDS_API_KEY=fc_votre-cle-api

# ── Admin ─────────────────────────────────────────────────────
ADMIN_SECRET=secret-admin-long-et-aleatoire
```

---

## Configuration Supabase

### 1. Créer le projet Supabase
1. Aller sur [supabase.com](https://supabase.com)
2. Créer un nouveau projet
3. Récupérer dans **Settings → API** :
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
   - `anon` key → `SUPABASE_ANON_KEY`

### 2. Initialiser le schéma
Dans **SQL Editor → New query**, exécuter dans l'ordre :
1. `docs/schema.sql`
2. `docs/schema-migration-v2.sql`

### 3. Configurer Google OAuth (optionnel)
1. Supabase → **Authentication → Providers → Google** → activer
2. Google Cloud Console → créer credentials OAuth 2.0
3. URI de redirection autorisée : `https://[ref].supabase.co/auth/v1/callback`
4. Coller Client ID + Secret dans Supabase

---

## Déploiement production

### Sur n'importe quel serveur/hébergeur

```bash
# Variables d'env à configurer sur l'hébergeur :
NODE_ENV=production
SESSION_SECRET=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
APP_URL=https://votredomaine.com   # IMPORTANT pour OAuth Google
ADMIN_SECRET=...
# + Pay'm et FazerCards si utilisés

# Commande de démarrage
node server.js
```

### ⚠️ Sessions en production multi-instance

Par défaut, les sessions sont stockées en mémoire.
Cela fonctionne sur un seul serveur (VPS, Reserved VM).

Pour du multi-instance (autoscale, load balancer), ajouter un store externe :

```bash
npm install connect-redis ioredis
# ou
npm install connect-pg-simple
```

Puis modifier `server.js` :

```javascript
const RedisStore = require('connect-redis').default;
const { createClient } = require('ioredis');
const redisClient = createClient({ url: process.env.REDIS_URL });

app.use(session({
  store: new RedisStore({ client: redisClient }),
  // ... reste de la config
}));
```

---

## Hébergeurs compatibles

| Hébergeur | Type | Notes |
|-----------|------|-------|
| Replit Reserved VM | Single-instance | ✅ Fonctionne tel quel |
| Railway | Single-instance | ✅ Configurer `APP_URL` |
| Render | Single-instance | ✅ Configurer `APP_URL` |
| Heroku | Single-instance | ✅ Configurer `APP_URL` |
| VPS (Ubuntu/Debian) | Single-instance | ✅ Recommandé pour la production |
| AWS EC2 | Single-instance | ✅ Configurer `APP_URL` |
| Vercel | Serverless | ⚠️ Sessions incompatibles — nécessite Redis |
| Replit Autoscale | Multi-instance | ⚠️ Sessions incompatibles — nécessite Redis |
