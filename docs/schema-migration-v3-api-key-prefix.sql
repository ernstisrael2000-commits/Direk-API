-- ============================================================
-- Direct API — Migration v3 : colonne api_key_prefix
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ADDITIVE : ne supprime rien, compatible avec les données v1/v2
-- ============================================================
--
-- Pourquoi cette migration ?
-- --------------------------
-- L'ancien middleware requireApiKey itérait TOUS les comptes actifs pour
-- trouver la bonne clé (O(n) appels bcrypt). Avec api_key_prefix, le
-- lookup devient O(1) : on filtre en DB par les 12 premiers chars hex
-- de la clé (après "dk_live_"), puis on ne fait qu'un seul bcrypt.compare.
--
-- Sécurité du préfixe en clair :
--   12 chars hex = 6 octets aléatoires sur 32 octets totaux.
--   La valeur cryptographique reste dans les 26 octets restants,
--   protégés par bcrypt. Exposer le préfixe n'affaiblit pas la clé.

-- ─── 1. Ajouter la colonne (idempotent) ──────────────────────
alter table resellers
  add column if not exists api_key_prefix text;

-- ─── 2. Index pour le lookup O(1) ────────────────────────────
-- Pas de UNIQUE : deux resellers pourraient théoriquement partager le
-- même préfixe (probabilité 1/2^48 par paire). Le middleware gère ce
-- cas en comparant tous les résultats correspondants (≤ 1 en pratique).
create index if not exists idx_resellers_api_key_prefix
  on resellers (api_key_prefix)
  where api_key_prefix is not null;

-- ─── 3. Backfill : comptes existants ─────────────────────────
-- Les comptes créés avant cette migration ont api_key_hash mais pas
-- api_key_prefix. On ne peut pas recalculer le préfixe depuis le hash
-- (bcrypt est irréversible). Ces comptes devront régénérer leur clé
-- via POST /api/v1/auth/regenerate-key pour bénéficier du lookup O(1).
--
-- En attendant, requireApiKey retombe sur un scan des lignes sans préfixe
-- (voir commentaire dans le middleware).
--
-- Pour identifier les comptes sans préfixe (optionnel — run manuellement) :
--   select id, nom, email from resellers where api_key_prefix is null;

-- ─── 4. Note opérationnelle ───────────────────────────────────
-- Après cette migration, chaque nouvel INSERT dans resellers DOIT inclure
-- api_key_prefix (géré par routes/auth.js et middleware/requireApiKey.js).
-- Les UPDATE de api_key_hash (régénération de clé) doivent aussi mettre
-- à jour api_key_prefix en même temps.
