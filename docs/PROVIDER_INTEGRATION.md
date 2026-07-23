# Provider Integration Rules


Les fournisseurs externes ne doivent jamais être visibles.


Le reseller connaît uniquement :

Direct API


Jamais :

- nom fournisseur
- clé fournisseur
- prix fournisseur


# Architecture


Reseller

↓

Direct API

↓

Provider API


# Gestion erreur fournisseur


Si fournisseur échoue :


1. Enregistrer erreur
2. Restaurer solde
3. Modifier statut transaction
4. Informer reseller


# Timeout obligatoire

Chaque appel fournisseur doit avoir :

- timeout
- retry limité
- gestion erreur
