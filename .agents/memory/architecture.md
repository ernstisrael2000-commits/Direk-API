---
name: Architecture multi-service Direct API
description: Décisions d'architecture de la plateforme (provider pattern, schéma DB, routes, frontend)
---

# Architecture multi-service Direct API

## Règle générale
Free Fire est le PREMIER service, pas le seul. Chaque fonctionnalité doit être conçue pour être générique.

## Provider adapter pattern
- `lib/providers/base.js` — interface (validatePlayer, createOrder)
- `lib/providers/<slug>.js` — implémentation par fournisseur
- `lib/providers/index.js` — registre, `getProvider(fournisseurRow)`
- Pour ajouter un fournisseur : 1) créer le fichier adapter, 2) l'enregistrer dans index.js, 3) insérer dans table `fournisseurs`

**Why:** L'admin peut configurer le fournisseur en DB, mais le code reste nécessaire pour chaque intégration API spécifique.

## Tables clés (v2)
- `services` — catalogue de types de services (Free Fire, cartes cadeaux…)
- `fournisseurs` — APIs partenaires avec `slug` (correspond au provider adapter), `api_key_env` (nom var d'env)
- `produits` — lié à `service_id` + `fournisseur_id`, avec `params_schema` (JSON fields requis) et `meta`
- `commandes` — remplace `api_transactions`, avec `params` jsonb et `reponse_fournisseur` jsonb
- `wallet_transactions` — inchangée
- `resellers` — inchangée (+ `google_id` pour OAuth)

## Endpoints API resellers
- `POST /api/v1/orders`      — endpoint principal (API key), accepte `product_id` + `params`
- `POST /api/v1/orders/web`  — même logique, auth par SESSION (cookie) pour le catalogue frontend
- `GET  /api/v1/orders/:id`  — statut commande (session ou API key)
- `POST /api/v1/recharge`    — conservé pour compatibilité (legacy FazerCards)
- `GET  /api/v1/services`    — liste services actifs
- `GET  /api/v1/services/:slug/products` — produits d'un service

## Endpoints admin (Authorization: Bearer ADMIN_SECRET)
- GET/POST /api/v1/admin/products — CRUD produits
- PUT/PATCH /api/v1/admin/products/:id — modifier / toggle actif / supprimer
- GET/POST /api/v1/admin/services — CRUD services
- PUT /api/v1/admin/services/:id — modifier service
- GET/POST /api/v1/admin/fournisseurs — CRUD fournisseurs
- PUT /api/v1/admin/fournisseurs/:id — modifier fournisseur
- GET /api/v1/admin/resellers — liste resellers
- PATCH /api/v1/admin/resellers/:id/status — actif|suspendu

## Transactions (GET /api/v1/transactions)
- type=wallet : wallet_transactions
- type=commande : table commandes (v2, multi-service)
- type=recharge_legacy : table api_transactions (ancien schéma v1, rétro-compat)
- Sans type : wallet + commandes (les deux)

## params_schema format
```json
[
  {"name":"player_id","label":"ID Joueur","type":"text","required":true},
  {"name":"server","label":"Serveur","type":"select","options":["Asia","America"],"required":false}
]
```

## RPC Postgres atomiques
- `confirm_wallet_topup` — confirme + crédite solde
- `create_commande` — débite + crée commande (v2)
- `refund_commande` — rembourse + marque refunded

## Pages frontend
- `/catalogue` — catalogue multi-service (step: services → produits → form → result)
  - Auth par cookie session, appelle POST /api/v1/orders/web
  - Rendu dynamique depuis params_schema du produit
- `/admin` — panel admin avec 4 tabs (Produits, Services, Fournisseurs, Resellers)
  - Secret stocké en sessionStorage, envoyé comme Authorization: Bearer <secret>
  - CRUD complet pour chaque entité

## Admin panel auth
- requireAdmin lit Authorization: Bearer <ADMIN_SECRET>
- ADMIN_SECRET doit être configuré comme secret Replit

## Schéma SQL
- `docs/schema.sql` — schéma v1
- `docs/schema-migration-v2.sql` — migration additive v2 (services, fournisseurs, commandes, colonnes produits, RPCs)
- `docs/setup-complet.sql` — combinaison v1+v2, idempotent, à exécuter dans Supabase SQL Editor

## Déploiement
- Fichier `.replit` a `[deployment]` avec `deploymentTarget = "cloudrun"`
- ⚠️ ATTENTION : les sessions Express (express-session) ne fonctionnent pas sur autoscale (cloudrun stateless). Si l'utilisateur veut déployer avec sessions, il doit choisir Reserved VM dans l'interface de publication.
