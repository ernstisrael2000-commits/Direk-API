# Wallet Security Rules


Le wallet reseller fonctionne comme un portefeuille financier.


# Crédit

Un crédit de solde peut venir uniquement :

- confirmation Pay'm
- remboursement automatique fournisseur
- action admin autorisée


# Débit

Un débit peut venir uniquement :

- achat API réussi ou en cours


# Interdiction

Un utilisateur ne peut jamais :

- envoyer un montant personnalisé
- modifier son solde
- appeler une route de crédit


# Protection double paiement

Chaque paiement possède :

- référence unique
- statut
- historique


Un webhook déjà traité doit être ignoré.


# Processus recharge

1. Création demande paiement
2. Statut pending
3. Confirmation Pay'm
4. Vérification serveur
5. Crédit wallet
6. Statut confirmé
