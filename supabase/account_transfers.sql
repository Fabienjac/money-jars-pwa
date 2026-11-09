-- Virements entre comptes (ex. de Keystone vers Redotpay).
-- À exécuter une fois dans Supabase → SQL Editor (sans risque : « if not exists », aucune donnée existante touchée).
-- Un virement n'est ni un revenu ni une dépense : il ne modifie que le solde des deux comptes concernés,
-- dans Analyses > Par compte. Les comptes sont désignés par leur nom (comme dans les dépenses et les revenus).

create table if not exists account_transfers (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  from_account  text not null check (length(btrim(from_account)) > 0),
  to_account    text not null check (length(btrim(to_account))   > 0),
  amount        numeric(14,2) not null check (amount > 0),
  transfer_date date not null default current_date,
  note          text not null default '',
  created_at    timestamptz not null default now(),
  check (lower(btrim(from_account)) <> lower(btrim(to_account)))
);
create index if not exists idx_account_transfers_user on account_transfers(user_id, transfer_date desc);

alter table account_transfers enable row level security;
drop policy if exists "users_own_account_transfers" on account_transfers;
create policy "users_own_account_transfers" on account_transfers for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- L'utilisateur crée, lit et annule (supprime) ses virements ; pas de modification : on annule et on refait.
grant select, insert, delete on account_transfers to authenticated;
