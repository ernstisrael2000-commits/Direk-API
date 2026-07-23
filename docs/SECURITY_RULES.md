# Direct API - Security Rules

## Objectif

Direct API est une plateforme intermédiaire entre des resellers et des fournisseurs externes.

La sécurité financière est prioritaire.

Aucun utilisateur, même avec accès au navigateur, ne doit pouvoir :

- modifier son solde
- créer une transaction artificielle
- utiliser une clé API inexistante
- accéder aux clés fournisseurs
- voir les données privées d'autres resellers


# Règle principale

Le frontend est considéré comme non fiable.

Toute action importante doit être exécutée uniquement côté serveur.

Interdit :

Frontend → Supabase directement

Autorisé :

Frontend → API Server → Supabase


# Protection des secrets

Les éléments suivants doivent rester uniquement côté serveur :

- clés fournisseurs
- clés Supabase privées
- clés Pay'm
- secrets webhook
- clés API resellers en clair


Les secrets ne doivent jamais :

- apparaître dans le code frontend
- être envoyés dans les réponses API
- être stockés dans Git


# Gestion des clés API

Les clés API des resellers doivent être :

- longues
- aléatoires
- impossibles à deviner
- stockées sous forme hashée


La clé originale est affichée uniquement :

- lors de la création
- lors d'une régénération


Après cela elle devient invisible.


# Validation obligatoire

Chaque requête API doit vérifier :

1. identité du reseller
2. statut du compte
3. validité de la clé API
4. permissions
5. limite d'utilisation
6. solde disponible


# Journalisation

Toutes les actions sensibles doivent être enregistrées :

- connexion
- création compte
- génération clé
- recharge wallet
- achat API
- remboursement
- erreur fournisseur
