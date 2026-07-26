# Direct API

**Direct API** est une plateforme B2B de recharge de jeux (Free Fire, etc.) pour resellers haïtiens.

Les resellers rechargent un solde HTG via Pay'm, puis appellent une API pour déclencher des recharges jeux pour leurs clients. Le propriétaire passe commande auprès du fournisseur FazerCards en coulisse.

## Stack

- **Serveur** : Node.js + Express.js (`server.js`)
- **Frontend** : HTML/CSS + Tailwind CDN + petite-vue + Iconify (7 pages statiques dans `public/`)
- **Base de données** : Supabase PostgreSQL (connecté ✅)
- **Paiement wallet** : Pay'm (`plopplop.solutionip.app`) (connecté ✅)
- **Fournisseur recharges** : FazerCards (`api.fzr.cards`) (connecté ✅)

## Lancer le projet

```
node server.js
```

Le serveur écoute sur le port `3000` (ou `$PORT`).

## Pages

| Route | Fichier | Description |
|-------|---------|-------------|
| `/` | `public/index.html` | Dashboard reseller |
| `/historique` | `public/historique.html` | Historique transactions |
| `/recharge` | `public/recharge.html` | Recharge wallet |
| `/api-doc` | `public/api-doc.html` | Documentation API |
| `/profil` | `public/profil.html` | Profil & Réglages |
| `/login` | `public/login.html` | Connexion / Inscription |
| `/admin` | `public/admin.html` | Admin catalogue produits |

## Variables d'environnement requises (prochaines étapes)

| Variable | Usage |
|----------|-------|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service Supabase (serveur uniquement) |
| `PAYM_CLIENT_ID` | Identifiant Pay'm |
| `PAYM_CLIENT_SECRET` | Secret Pay'm |
| `FAZERCARDS_API_KEY` | Clé API FazerCards (`fc_…`) |
| `ADMIN_SECRET` | Secret pour protéger les routes admin |

## État actuel

- Phase 1 terminée : 7 pages frontend intégrées, serveur Express opérationnel
- Supabase, Pay'm et FazerCards connectés ✅
- Workflow "Direct API" configuré sur Replit (port 3000)

## User preferences

- Langue de travail : français
- Stack : HTML/CSS + petite-vue + Tailwind CDN (pas de React/Vue/Next)
- Backend : Node.js + Express (TypeScript non obligatoire)
- Montants en centimes HTG (entiers) — jamais de flottants pour les soldes
