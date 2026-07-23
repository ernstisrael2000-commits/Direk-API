-- ============================================================
-- Direct API — Setup complet de la base de données
-- Combiner schema v1 + migration v2 (multi-service)
--
-- ▶ À exécuter dans : Supabase Dashboard → SQL Editor → New query
-- ▶ Copiez-collez tout le contenu, puis cliquez sur "Run"
-- ▶ Ce script est idempotent : peut être ré-exécuté sans risque
-- ============================================================

-- Extension UUID
create extension if not exists "uuid-ossp";

-- ─── Table resellers ─────────────────────────────────────────
create table if not exists resellers (
  id            uuid        primary key default uuid_generate_v4(),
  nom           text        not null,
  email         text        not null unique,
  telephone     text,
  password_hash text,                          -- null si compte Google uniquement
  google_id     text        unique,            -- ID Supabase Auth (OAuth Google)
  api_key_hash  text        not null default '',
  balance       integer     not null default 0, -- en centimes HTG
  status        text        not null default 'actif'
                            check (status in ('actif', 'suspendu')),
  created_at    timestamptz not null default now()
);

-- ─── Table services ──────────────────────────────────────────
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
create table if not exists fournisseurs (
  id           uuid        primary key default uuid_generate_v4(),
  nom          text        not null,
  slug         text        not null unique,
  base_url     text        not null,
  api_key_env  text        not null,
  status       text        not null default 'actif'
                           check (status in ('actif', 'inactif')),
  config       jsonb       not null default '{}',
  created_at   timestamptz not null default now()
);

-- ─── Table produits ──────────────────────────────────────────
create table if not exists produits (
  id               uuid        primary key default uuid_generate_v4(),
  nom              text        not null,
  fournisseur      text        not null default 'fazercards',
  code_fournisseur text        not null unique,
  prix_achat       integer     not null,
  prix_vente       integer     not null,
  actif            boolean     not null default true,
  service_id       uuid        references services(id),
  fournisseur_id   uuid        references fournisseurs(id),
  params_schema    jsonb       not null default '[]',
  meta             jsonb       not null default '{}',
  created_at       timestamptz not null default now()
);

-- ─── Table wallet_transactions ───────────────────────────────
create table if not exists wallet_transactions (
  id                   uuid        primary key default uuid_generate_v4(),
  reseller_id          uuid        not null references resellers(id),
  montant              integer     not null,
  methode              text        not null default 'paym',
  reference            text        not null unique,
  paym_transaction_id  text,
  status               text        not null default 'pending'
                                   check (status in ('pending', 'confirmed', 'expired')),
  created_at           timestamptz not null default now()
);

-- ─── Table api_transactions (legacy) ─────────────────────────
create table if not exists api_transactions (
  id                uuid        primary key default uuid_generate_v4(),
  reseller_id       uuid        not null references resellers(id),
  produit_id        uuid        references produits(id),
  joueur_id         text        not null,
  prix_reseller     integer     not null,
  prix_fournisseur  integer     not null,
  status            text        not null default 'reserved'
                                check (status in ('reserved', 'success', 'failed', 'refunded')),
  ref_fournisseur   text,
  created_at        timestamptz not null default now()
);

-- ─── Table commandes (v2 multi-service) ──────────────────────
create table if not exists commandes (
  id                  uuid        primary key default uuid_generate_v4(),
  reseller_id         uuid        not null references resellers(id),
  service_id          uuid        references services(id),
  fournisseur_id      uuid        references fournisseurs(id),
  produit_id          uuid        references produits(id),
  params              jsonb       not null default '{}',
  prix_reseller       integer     not null,
  prix_fournisseur    integer     not null,
  status              text        not null default 'reserved'
                                  check (status in ('reserved', 'success', 'failed', 'refunded')),
  ref_fournisseur     text,
  reponse_fournisseur jsonb,
  created_at          timestamptz not null default now()
);

-- ─── Row Level Security ───────────────────────────────────────
alter table resellers           enable row level security;
alter table produits            enable row level security;
alter table wallet_transactions enable row level security;
alter table api_transactions    enable row level security;
alter table services            enable row level security;
alter table fournisseurs        enable row level security;
alter table commandes           enable row level security;

-- Accès uniquement via service_role (serveur Node.js)
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'resellers' and policyname = 'service_role_only'
  ) then
    create policy "service_role_only" on resellers           for all using (auth.role() = 'service_role');
    create policy "service_role_only" on produits            for all using (auth.role() = 'service_role');
    create policy "service_role_only" on wallet_transactions for all using (auth.role() = 'service_role');
    create policy "service_role_only" on api_transactions    for all using (auth.role() = 'service_role');
    create policy "service_role_only" on services            for all using (auth.role() = 'service_role');
    create policy "service_role_only" on fournisseurs        for all using (auth.role() = 'service_role');
    create policy "service_role_only" on commandes           for all using (auth.role() = 'service_role');
  end if;
end $$;

-- ─── Fonction RPC : confirm_wallet_topup ─────────────────────
create or replace function confirm_wallet_topup(
  p_transaction_id uuid,
  p_reseller_id    uuid,
  p_montant        integer
)
returns void language plpgsql security definer as $$
begin
  update wallet_transactions
     set status = 'confirmed'
   where id = p_transaction_id and status = 'pending';
  if not found then return; end if;
  update resellers set balance = balance + p_montant where id = p_reseller_id;
end;
$$;

-- ─── Fonction RPC : create_recharge_transaction ──────────────
create or replace function create_recharge_transaction(
  p_reseller_id      uuid,
  p_produit_id       uuid,
  p_joueur_id        text,
  p_prix_reseller    integer,
  p_prix_fournisseur integer
)
returns uuid language plpgsql security definer as $$
declare
  v_tx_id uuid;
  v_balance integer;
begin
  select balance into v_balance from resellers where id = p_reseller_id for update;
  if v_balance < p_prix_reseller then raise exception 'SOLDE_INSUFFISANT'; end if;
  update resellers set balance = balance - p_prix_reseller where id = p_reseller_id;
  insert into api_transactions
    (reseller_id, produit_id, joueur_id, prix_reseller, prix_fournisseur, status)
  values
    (p_reseller_id, p_produit_id, p_joueur_id, p_prix_reseller, p_prix_fournisseur, 'reserved')
  returning id into v_tx_id;
  return v_tx_id;
end;
$$;

-- ─── Fonction RPC : refund_recharge_transaction ──────────────
create or replace function refund_recharge_transaction(
  p_transaction_id uuid,
  p_reseller_id    uuid,
  p_montant        integer
)
returns void language plpgsql security definer as $$
begin
  update api_transactions set status = 'refunded'
   where id = p_transaction_id and status = 'reserved';
  if not found then return; end if;
  update resellers set balance = balance + p_montant where id = p_reseller_id;
end;
$$;

-- ─── Fonction RPC : create_commande ──────────────────────────
create or replace function create_commande(
  p_reseller_id      uuid,
  p_service_id       uuid,
  p_fournisseur_id   uuid,
  p_produit_id       uuid,
  p_params           jsonb,
  p_prix_reseller    integer,
  p_prix_fournisseur integer
)
returns uuid language plpgsql security definer as $$
declare
  v_cmd_id  uuid;
  v_balance integer;
begin
  select balance into v_balance from resellers where id = p_reseller_id for update;
  if v_balance < p_prix_reseller then raise exception 'SOLDE_INSUFFISANT'; end if;
  update resellers set balance = balance - p_prix_reseller where id = p_reseller_id;
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
returns void language plpgsql security definer as $$
begin
  update commandes set status = 'refunded'
   where id = p_commande_id and status = 'reserved';
  if not found then return; end if;
  update resellers set balance = balance + p_montant where id = p_reseller_id;
end;
$$;

-- ─── Données initiales ────────────────────────────────────────
insert into fournisseurs (nom, slug, base_url, api_key_env, config)
values (
  'FazerCards',
  'fazercards',
  'https://api.fzr.cards/api/v2',
  'FAZERCARDS_API_KEY',
  '{"supports_validate": true, "timeout_ms": 30000}'
)
on conflict (slug) do nothing;

insert into services (nom, description, slug, image_url, ordre)
values (
  'Free Fire',
  'Recharge de diamants et Pass Elite pour Free Fire',
  'free-fire',
  '/images/free-fire.png',
  1
)
on conflict (slug) do nothing;

-- ============================================================
-- ✅ Setup terminé !
-- Tables créées : resellers, services, fournisseurs, produits,
--                 wallet_transactions, api_transactions, commandes
-- Fonctions RPC : confirm_wallet_topup, create_recharge_transaction,
--                 refund_recharge_transaction, create_commande, refund_commande
-- Données initiales : FazerCards (fournisseur), Free Fire (service)
-- ============================================================
