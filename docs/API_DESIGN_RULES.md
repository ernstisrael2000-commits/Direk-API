# Direct API Rules


# Version API

Toutes les routes doivent utiliser une version.


Exemple :

/api/v1/topup


# Format réponse


Succès :

{
  "success": true,
  "data": {}
}


Erreur :

{
  "success": false,
  "error": "message"
}


# Codes HTTP

200 : Succès
400 : Erreur utilisateur
401 : Clé API invalide
403 : Compte suspendu
429 : Trop de requêtes
500 : Erreur serveur


# Rate Limiting

Chaque reseller possède une limite.


Exemple :

60 requêtes/minute


Les abus doivent être bloqués automatiquement.
