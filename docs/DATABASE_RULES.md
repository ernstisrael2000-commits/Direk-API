# Direct API Database Rules

Base utilisée :

Supabase PostgreSQL


# Règles générales

Toutes les tables sensibles doivent utiliser Row Level Security.


Tables protégées :

- resellers
- wallet_transactions
- api_transactions
- produits


# Accès navigateur

Aucun accès direct depuis le frontend.


Le frontend ne peut jamais :

- UPDATE balance
- INSERT wallet_transactions
- UPDATE transactions


Toutes les modifications passent par des fonctions serveur.


# Argent

Toutes les valeurs monétaires doivent être stockées en entier.


Exemple :

Correct :

5000 = 50.00 HTG


Incorrect :

50.00


Utiliser uniquement :

INTEGER


# Transactions financières

Toute opération financière doit être atomique.

Exemple :

Débit wallet + création transaction

doit réussir ensemble.

Sinon :

aucune modification.
