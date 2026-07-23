# Ajouter un nouveau service ou fournisseur

Ce guide explique comment étendre Direct API avec un nouveau service (ex: cartes cadeaux)
ou un nouveau fournisseur API (ex: SmileCoin) sans toucher à l'architecture existante.

---

## Cas 1 — Ajouter un nouveau service (catégorie)

Un **service** est un type de produit : Free Fire, cartes cadeaux, abonnements, etc.

### Via l'API admin

```http
POST /api/v1/admin/services
Authorization: Bearer <ADMIN_SECRET>
Content-Type: application/json

{
  "nom": "Cartes Cadeaux",
  "slug": "gift-cards",
  "description": "Cartes cadeaux numériques pour diverses plateformes",
  "image_url": "/images/gift-cards.png",
  "ordre": 2,
  "status": "actif"
}
```

Aucune modification de code requise.

---

## Cas 2 — Ajouter un nouveau fournisseur API

Un **fournisseur** est une API externe qui exécute les commandes.
Cela nécessite **deux étapes** : un adaptateur code + une entrée en base.

### Étape 1 — Créer l'adaptateur code

Créer `lib/providers/<slug>.js` en étendant `BaseProvider` :

```javascript
// lib/providers/smilecoin.js
const BaseProvider = require('./base');

class SmilecoinProvider extends BaseProvider {
  async validatePlayer(productMeta, params) {
    if (!this.isReady) return { ok: false, error: 'Clé API manquante.' };

    try {
      const res = await fetch(`${this.config.base_url}/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: productMeta.code_fournisseur,
          uid: params.player_id,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json();
      return {
        ok: data.success === true,
        playerName: data.username || null,
        rawResponse: data,
        error: data.success ? undefined : (data.error || 'ID invalide.'),
      };
    } catch (err) {
      return { ok: false, error: 'Fournisseur injoignable.' };
    }
  }

  async createOrder(productMeta, params) {
    if (!this.isReady) return { ok: false, rawResponse: {}, error: 'Clé API manquante.' };

    try {
      const res = await fetch(`${this.config.base_url}/order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: productMeta.code_fournisseur,
          uid: params.player_id,
          server: params.server || null,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();
      return {
        ok: data.success === true,
        refFournisseur: data.order_id || null,
        rawResponse: data,
        error: data.success ? undefined : (data.message || 'Commande échouée.'),
      };
    } catch (err) {
      return { ok: false, rawResponse: { error: err.message }, error: 'Fournisseur injoignable.' };
    }
  }
}

module.exports = SmilecoinProvider;
```

### Étape 2 — Enregistrer dans le registre

Dans `lib/providers/index.js`, ajouter une ligne :

```javascript
const SmilecoinProvider = require('./smilecoin');  // ← ajouter

const REGISTRY = {
  fazercards: FazerCardsProvider,
  smilecoin:  SmilecoinProvider,  // ← ajouter
};
```

### Étape 3 — Ajouter la variable d'env de la clé API

Dans votre environnement / `.env` :

```env
SMILECOIN_API_KEY=votre-cle-api
```

### Étape 4 — Créer l'entrée fournisseur en DB

```http
POST /api/v1/admin/fournisseurs
Authorization: Bearer <ADMIN_SECRET>
Content-Type: application/json

{
  "nom": "SmileCoin",
  "slug": "smilecoin",
  "base_url": "https://api.smilecoin.example",
  "api_key_env": "SMILECOIN_API_KEY",
  "status": "actif",
  "config": {
    "supports_validate": true,
    "timeout_ms": 30000
  }
}
```

---

## Cas 3 — Ajouter un produit lié à un nouveau service/fournisseur

```http
POST /api/v1/admin/products
Authorization: Bearer <ADMIN_SECRET>
Content-Type: application/json

{
  "service_id": "uuid-du-service",
  "fournisseur_id": "uuid-du-fournisseur",
  "nom": "Free Fire — 100 Diamants",
  "code_fournisseur": "FF_100",
  "prix_achat_htg": "45.00",
  "prix_vente_htg": "55.00",
  "params_schema": [
    {
      "name": "player_id",
      "label": "ID Joueur Free Fire",
      "type": "text",
      "required": true,
      "placeholder": "Ex: 123456789"
    },
    {
      "name": "server",
      "label": "Serveur",
      "type": "select",
      "options": ["IND", "BR", "US", "VN", "TH"],
      "required": false
    }
  ],
  "meta": {
    "category": "diamonds"
  },
  "actif": true
}
```

Le champ `params_schema` est utilisé par le frontend pour afficher les bons champs
et par le backend pour valider les paramètres avant de passer la commande.

---

## Récapitulatif

| Action | Code ? | DB ? | Redémarrage ? |
|--------|--------|------|---------------|
| Nouveau service (catégorie) | ❌ | ✅ via API admin | ❌ |
| Nouveau fournisseur | ✅ (1 fichier) | ✅ via API admin | ✅ |
| Nouveau produit | ❌ | ✅ via API admin | ❌ |
| Nouveau champ params | ❌ | ✅ modifier `params_schema` du produit | ❌ |
