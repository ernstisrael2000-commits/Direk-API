-- ============================================================
-- Direct API — Migration v2 : architecture multi-service
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ADDITIVE : ne supprime rien, peut s'exécuter sur v1 existante
-- ============================================================

-- ─── Table services ──────────────────────────────────────────
-- Catalogue des types de services (Free Fire, cartes cadeaux, etc.)
create table if not exists services (
  id          uuid        primary key default uuid_generate_v4(),
  nom         text        not null,
  description text,
  image_url   text,
  slug        text        not null unique,
  status      text        not null default 'actif'
                          check (status in ('actif', 'inactif')),
  ordre       integer     not null default 0,
  created_at  timestamptz not null default now()
);

-- ─── Table fournisseurs ───────────────────────────────────────
-- APIs partenaires (FazerCards, etc.)
create table if not exists fournisseurs (
  id           uuid        primary key default uuid_generate_v4(),
  nom          text        not null,
  slug         text        not null unique,
  base_url     text        not null,
  api_key_env  text        not null,  -- nom de la variable d'env (ex: FAZERCARDS_API_KEY)
  status       text        not null default 'actif'
                           check (status in ('actif', 'inactif')),
  config       jsonb       not null default '{}',
  created_at   timestamptz not null default now()
);

-- ─── Mise à jour table produits ───────────────────────────────
alter table produits
  add column if not exists service_id      uuid references services(id),
  add column if not exists fournisseur_id  uuid references fournisseurs(id),
  -- Schéma des paramètres requis pour commander ce produit
  -- Exemple : [{"name":"player_id","label":"ID Joueur","type":"text","required":true},
  --            {"name":"server","label":"Serveur","type":"select","options":["Asia","America"],"required":false}]
  add column if not exists params_schema   jsonb not null default '[]',
  -- Métadonnées spécifiques au fournisseur (code produit, catégorie, etc.)
  add column if not exists meta            jsonb not null default '{}';

-- ─── Table commandes ─────────────────────────────────────────
-- Remplace et étend api_transactions pour être multi-service/multi-provider
create table if not exists commandes (
  id                 uuid        primary key default uuid_generate_v4(),
  reseller_id        uuid        not null references resellers(id),
  service_id         uuid        references services(id),
  fournisseur_id     uuid        references fournisseurs(id),
  produit_id         uuid        references produits(id),
  -- Paramètres de la commande (player_id, server, etc.) — structure variable selon le service
  params             jsonb       not null default '{}',
  prix_reseller      integer     not null,   -- centimes HTG
  prix_fournisseur   integer     not null,   -- centimes HTG
  status             text        not null default 'reserved'
                                 check (status in ('reserved', 'success', 'failed', 'refunded')),
  ref_fournisseur    text,
  reponse_fournisseur jsonb,                 -- réponse brute du fournisseur
  created_at         timestamptz not null default now()
);

-- ─── RLS pour les nouvelles tables ───────────────────────────
alter table services     enable row level security;
alter table fournisseurs enable row level security;
alter table commandes    enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'services' and policyname = 'service_role_only'
  ) then
    create policy "service_role_only" on services     for all using (auth.role() = 'service_role');
    create policy "service_role_only" on fournisseurs for all using (auth.role() = 'service_role');
    create policy "service_role_only" on commandes    for all using (auth.role() = 'service_role');
  end if;
end $$;

-- ─── Fonction RPC : create_commande ──────────────────────────
-- Débite le solde + crée la commande de façon atomique.
create or replace function create_commande(
  p_reseller_id      uuid,
  p_service_id       uuid,
  p_fournisseur_id   uuid,
  p_produit_id       uuid,
  p_params           jsonb,
  p_prix_reseller    integer,
  p_prix_fournisseur integer
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_cmd_id  uuid;
  v_balance integer;
begin
  select balance into v_balance
    from resellers
   where id = p_reseller_id
   for update;

  if v_balance < p_prix_reseller then
    raise exception 'SOLDE_INSUFFISANT';
  end if;

  update resellers
     set balance = balance - p_prix_reseller
   where id = p_reseller_id;

  insert into commandes
    (reseller_id, service_id, fournisseur_id, produit_id, params, prix_reseller, prix_fournisseur, status)
  values
    (p_reseller_id, p_service_id, p_fournisseur_id, p_produit_id, p_params, p_prix_reseller, p_prix_fournisseur, 'reserved')
  returning id into v_cmd_id;

  return v_cmd_id;
end;
$$;

-- ─── Fonction RPC : refund_commande ──────────────────────────
create or replace function refund_commande(
  p_commande_id  uuid,
  p_reseller_id  uuid,
  p_montant      integer
)
returns void
language plpgsql
security definer
as $$
begin
  update commandes
     set status = 'refunded'
   where id = p_commande_id
     and status = 'reserved';

  if not found then return; end if;

  update resellers
     set balance = balance + p_montant
   where id = p_reseller_id;
end;
$$;

-- ─── Données initiales : fournisseur FazerCards ──────────────
insert into fournisseurs (nom, slug, base_url, api_key_env, config)
values (
  'FazerCards',
  'fazercards',
  'https://api.fzr.cards/api/v2',
  'FAZERCARDS_API_KEY',
  '{"supports_validate": true, "timeout_ms": 30000}'
)
on conflict (slug) do nothing;

-- ─── Données initiales : service Free Fire ────────────────────
insert into services (nom, description, slug, image_url, ordre)
values (
  'Free Fire',
  'Recharge de diamants et Pass Elite pour Free Fire',
  'free-fire',
  '/images/free-fire.png',
  1
)
on conflict (slug) do nothing;
