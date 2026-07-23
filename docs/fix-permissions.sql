-- ============================================================
-- Direct API — Fix permissions pour le rôle service_role
-- ▶ À exécuter dans : Supabase Dashboard → SQL Editor → New query
-- ▶ Copiez-collez tout, puis cliquez sur "Run"
-- ============================================================

-- Accorder les permissions sur toutes les tables
GRANT ALL ON TABLE resellers           TO service_role;
GRANT ALL ON TABLE produits            TO service_role;
GRANT ALL ON TABLE wallet_transactions TO service_role;
GRANT ALL ON TABLE api_transactions    TO service_role;
GRANT ALL ON TABLE services            TO service_role;
GRANT ALL ON TABLE fournisseurs        TO service_role;
GRANT ALL ON TABLE commandes           TO service_role;

-- Accorder les permissions sur les séquences (pour les UUID auto-générés)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- S'assurer que les futures tables auront aussi les droits
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
