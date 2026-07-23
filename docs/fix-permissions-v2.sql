-- ============================================================
-- Direct API — Fix permissions complet (v2)
-- ▶ Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- 1. Accès au schéma public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Permissions sur toutes les tables existantes
GRANT ALL ON TABLE public.resellers           TO service_role;
GRANT ALL ON TABLE public.produits            TO service_role;
GRANT ALL ON TABLE public.wallet_transactions TO service_role;
GRANT ALL ON TABLE public.api_transactions    TO service_role;
GRANT ALL ON TABLE public.services            TO service_role;
GRANT ALL ON TABLE public.fournisseurs        TO service_role;
GRANT ALL ON TABLE public.commandes           TO service_role;

-- 3. Permissions sur les séquences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 4. Permissions par défaut pour les futures tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

-- 5. Rechargement du cache PostgREST (obligatoire pour que les grants soient pris en compte)
NOTIFY pgrst, 'reload schema';
