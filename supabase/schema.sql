-- ═══════════════════════════════════════════════════════════════════════════
-- Money Jars PWA — Schéma Supabase
-- À exécuter dans l'éditeur SQL de ton projet Supabase
-- ═══════════════════════════════════════════════════════════════════════════

-- Extensions
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS
-- Stocke le statut d'abonnement LemonSqueezy de chaque utilisateur
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists subscriptions (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid references auth.users(id) on delete cascade not null unique,
  plan                  text not null default 'trial', -- 'trial' | 'active' | 'expired' | 'cancelled'
  trial_ends_at         timestamptz not null default (now() + interval '14 days'),
  lemonsqueezy_id       text,
  current_period_end    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- JAR SETTINGS
-- Allocation % et solde initial pour chacun des 6 bocaux
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists jar_settings (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  jar_key         text not null, -- 'NEC' | 'FFA' | 'LTSS' | 'PLAY' | 'EDUC' | 'GIFT'
  percent         numeric(5,2) not null default 0,
  initial_balance numeric(12,2) not null default 0,
  updated_at      timestamptz not null default now(),
  unique(user_id, jar_key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TAGS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists tags (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  tag_id     text not null,  -- identifiant court : 'alimentaire', 'transport'...
  name       text not null,
  emoji      text not null default '🏷️',
  color      text not null default '#8E8E93',
  categorie  text,
  favori     boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, tag_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCOUNTS (comptes de dépenses)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists accounts (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  account_id text not null,  -- identifiant court : 'cash', 'cb', 'revolut'
  name       text not null,
  icon       text,
  color      text,
  created_at timestamptz not null default now(),
  unique(user_id, account_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- REVENUE ACCOUNTS (comptes de revenus)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists revenue_accounts (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  account_id text not null,
  name       text not null,
  type       text,
  icon       text,
  color      text,
  created_at timestamptz not null default now(),
  unique(user_id, account_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRANSACTIONS — DÉPENSES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists transactions_spending (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  date         date not null,
  jar          text not null, -- 'NEC' | 'FFA' | 'LTSS' | 'PLAY' | 'EDUC' | 'GIFT'
  account      text not null default '',
  amount       numeric(12,2) not null,
  description  text not null default '',
  tags         text not null default '', -- ids séparés par virgule : 'alimentaire,restaurant'
  subscription text not null default '', -- '' | 'mensuel' | 'trimestriel' | 'semestriel' | 'annuel'
  created_at   timestamptz not null default now()
);

create index if not exists idx_spending_user_date on transactions_spending(user_id, date desc);
create index if not exists idx_spending_user_jar  on transactions_spending(user_id, jar);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRANSACTIONS — REVENUS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists transactions_revenue (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid references auth.users(id) on delete cascade not null,
  date             date not null,
  source           text not null default '',
  amount           numeric(12,2),
  value            text,   -- devise ou description
  crypto_quantity  numeric(24,8),
  method           text,   -- 'USDC_ETH', 'BTC', etc.
  rate             numeric(18,6),
  crypto_address   text,
  destination      text,
  income_type      text,
  tags             text not null default '',
  created_at       timestamptz not null default now()
);

create index if not exists idx_revenue_user_date on transactions_revenue(user_id, date desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUTO-TAG RULES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists auto_tag_rules (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  pattern    text not null,  -- regex ou texte à matcher sur la description
  jar        text,
  tags       text,
  account    text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- COLUMN MAPPINGS (pour l'import CSV/Excel)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists column_mappings (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  mapping_key text not null,   -- clé du mapping (ex: nom du fichier banque)
  mapping     jsonb not null,  -- objet JSON avec la configuration
  updated_at  timestamptz not null default now(),
  unique(user_id, mapping_key)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Chaque utilisateur ne voit QUE ses propres données
-- ═══════════════════════════════════════════════════════════════════════════

alter table subscriptions         enable row level security;
alter table jar_settings          enable row level security;
alter table tags                  enable row level security;
alter table accounts              enable row level security;
alter table revenue_accounts      enable row level security;
alter table transactions_spending enable row level security;
alter table transactions_revenue  enable row level security;
alter table auto_tag_rules        enable row level security;
alter table column_mappings       enable row level security;

-- Macro pour créer les 4 policies CRUD en une fois
-- (on les crée manuellement pour chaque table ci-dessous)

-- subscriptions
create policy "users_own_subscription"  on subscriptions  for all using (auth.uid() = user_id);

-- jar_settings
create policy "users_own_jar_settings"  on jar_settings   for all using (auth.uid() = user_id);

-- tags
create policy "users_own_tags"          on tags           for all using (auth.uid() = user_id);

-- accounts
create policy "users_own_accounts"      on accounts       for all using (auth.uid() = user_id);

-- revenue_accounts
create policy "users_own_rev_accounts"  on revenue_accounts for all using (auth.uid() = user_id);

-- transactions_spending
create policy "users_own_spending"      on transactions_spending for all using (auth.uid() = user_id);

-- transactions_revenue
create policy "users_own_revenue"       on transactions_revenue  for all using (auth.uid() = user_id);

-- auto_tag_rules
create policy "users_own_rules"         on auto_tag_rules for all using (auth.uid() = user_id);

-- column_mappings
create policy "users_own_mappings"      on column_mappings for all using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS — permissions PostgreSQL pour le rôle authenticated
-- (nécessaire EN PLUS des RLS policies)
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON jar_settings          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tags                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounts              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON revenue_accounts      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON transactions_spending TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON transactions_revenue  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON auto_tag_rules        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON column_mappings       TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER : créer automatiquement l'entrée subscription à l'inscription
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.subscriptions (user_id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
