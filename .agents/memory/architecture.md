---
name: Architecture multi-service Direct API
description: Décisions d'architecture de la plateforme (provider pattern, schéma DB, routes)
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

## Tables clés (v2, après migration)
- `services` — catalogue de types de services (Free Fire, cartes cadeaux…)
- `fournisseurs` — APIs partenaires avec `slug` (correspond au provider adapter), `api_key_env` (nom var d'env)
- `produits` — lié à `service_id` + `fournisseur_id`, avec `params_schema` (JSON fields requis) et `meta`
- `commandes` — remplace `api_transactions`, avec `params` jsonb et `reponse_fournisseur` jsonb
- `wallet_transactions` — inchangée
- `resellers` — inchangée (+ `google_id` pour OAuth)

## Endpoints API resellers
- `POST /api/v1/orders` — endpoint principal (remplace /recharge), accepte `product_id` + `params`
- `POST /api/v1/recharge` — conservé pour compatibilité (legacy FazerCards)
- `GET  /api/v1/services` — liste services actifs
- `GET  /api/v1/services/:slug/products` — produits d'un service

## params_schema format
```json
[
  {"name":"player_id","label":"ID Joueur","type":"text","required":true},
  {"name":"server","label":"Serveur","type":"select","options":["Asia","America"],"required":false}
]
```

## RPC Postgres atomiques
- `confirm_wallet_topup` — confirme + crédite solde
- `create_recharge_transaction` — (legacy) débite + crée api_transaction
- `create_commande` — débite + crée commande (v2)
- `refund_commande` — rembourse + marque refunded

## Déploiement
- Fichier `.replit` a `[deployment]` avec `deploymentTarget = "cloudrun"`
- ⚠️ ATTENTION : les sessions Express (express-session) ne fonctionnent pas sur autoscale (cloudrun stateless). Si l'utilisateur veut déployer avec sessions, il doit choisir Reserved VM dans l'interface de publication.

## Migration DB
- `docs/schema.sql` — schéma initial v1
- `docs/schema-migration-v2.sql` — migration additive v2 (ajouter services, fournisseurs, commandes, colonnes produits)
