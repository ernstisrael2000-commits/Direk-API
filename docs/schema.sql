-- ============================================================
-- Direct API — Schéma Supabase complet
-- À exécuter dans : Supabase Dashboard → SQL Editor
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

-- ─── Table produits ──────────────────────────────────────────
create table if not exists produits (
  id               uuid        primary key default uuid_generate_v4(),
  nom              text        not null,
  fournisseur      text        not null default 'fazercards',
  code_fournisseur text        not null unique,
  prix_achat       integer     not null,   -- centimes HTG
  prix_vente       integer     not null,   -- centimes HTG
  actif            boolean     not null default true,
  created_at       timestamptz not null default now()
);

-- ─── Table wallet_transactions ───────────────────────────────
create table if not exists wallet_transactions (
  id                   uuid        primary key default uuid_generate_v4(),
  reseller_id          uuid        not null references resellers(id),
  montant              integer     not null,    -- centimes HTG
  methode              text        not null default 'paym',
  reference            text        not null unique,
  paym_transaction_id  text,
  status               text        not null default 'pending'
                                   check (status in ('pending', 'confirmed', 'expired')),
  created_at           timestamptz not null default now()
);

-- ─── Table api_transactions ──────────────────────────────────
create table if not exists api_transactions (
  id                uuid        primary key default uuid_generate_v4(),
  reseller_id       uuid        not null references resellers(id),
  produit_id        uuid        references produits(id),
  joueur_id         text        not null,
  prix_reseller     integer     not null,    -- centimes HTG (prix payé par le reseller)
  prix_fournisseur  integer     not null,    -- centimes HTG (coût réel)
  status            text        not null default 'reserved'
                                check (status in ('reserved', 'success', 'failed', 'refunded')),
  ref_fournisseur   text,
  created_at        timestamptz not null default now()
);

-- ─── Row Level Security ───────────────────────────────────────
alter table resellers         enable row level security;
alter table produits          enable row level security;
alter table wallet_transactions enable row level security;
alter table api_transactions  enable row level security;

-- Accès uniquement via service_role (notre serveur Node.js)
-- Le frontend n'accède jamais directement à Supabase
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'resellers' and policyname = 'service_role_only'
  ) then
    create policy "service_role_only" on resellers         for all using (auth.role() = 'service_role');
    create policy "service_role_only" on produits          for all using (auth.role() = 'service_role');
    create policy "service_role_only" on wallet_transactions for all using (auth.role() = 'service_role');
    create policy "service_role_only" on api_transactions  for all using (auth.role() = 'service_role');
  end if;
end $$;

-- ─── Fonction RPC : confirm_wallet_topup ─────────────────────
-- Crédite le solde ET confirme la transaction de façon atomique.
create or replace function confirm_wallet_topup(
  p_transaction_id uuid,
  p_reseller_id    uuid,
  p_montant        integer
)
returns void
language plpgsql
security definer
as $$
begin
  -- Marquer la transaction comme confirmée
  update wallet_transactions
     set status = 'confirmed'
   where id = p_transaction_id
     and status = 'pending';   -- idempotence : ne crédite qu'une fois

  if not found then
    return;  -- déjà confirmée ou introuvable
  end if;

  -- Créditer le solde
  update resellers
     set balance = balance + p_montant
   where id = p_reseller_id;
end;
$$;

-- ─── Fonction RPC : create_recharge_transaction ──────────────
-- Débite le solde ET crée la transaction en état 'reserved'.
-- Retourne l'UUID de la transaction créée.
create or replace function create_recharge_transaction(
  p_reseller_id      uuid,
  p_produit_id       uuid,
  p_joueur_id        text,
  p_prix_reseller    integer,
  p_prix_fournisseur integer
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_tx_id uuid;
  v_balance integer;
begin
  -- Vérifier le solde (double vérification atomique)
  select balance into v_balance
    from resellers
   where id = p_reseller_id
   for update;

  if v_balance < p_prix_reseller then
    raise exception 'SOLDE_INSUFFISANT';
  end if;

  -- Débiter le solde
  update resellers
     set balance = balance - p_prix_reseller
   where id = p_reseller_id;

  -- Créer la transaction
  insert into api_transactions
    (reseller_id, produit_id, joueur_id, prix_reseller, prix_fournisseur, status)
  values
    (p_reseller_id, p_produit_id, p_joueur_id, p_prix_reseller, p_prix_fournisseur, 'reserved')
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

-- ─── Fonction RPC : refund_recharge_transaction ──────────────
-- Rembourse le solde ET marque la transaction comme 'refunded'.
create or replace function refund_recharge_transaction(
  p_transaction_id uuid,
  p_reseller_id    uuid,
  p_montant        integer
)
returns void
language plpgsql
security definer
as $$
begin
  update api_transactions
     set status = 'refunded'
   where id = p_transaction_id
     and status = 'reserved';

  if not found then
    return;  -- déjà remboursée ou introuvable
  end if;

  update resellers
     set balance = balance + p_montant
   where id = p_reseller_id;
end;
$$;
