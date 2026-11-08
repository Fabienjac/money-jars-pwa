-- Transferts entre jarres (ex. verser le non-dépensé des jarres de dépense vers l'épargne)
-- et « repartir de zéro » (effacer le déficit d'une jarre, avec trace et annulation possible).
-- À exécuter une fois dans Supabase → SQL Editor (sans risque : « if not exists », aucune donnée existante touchée).
-- Un transfert n'est ni un revenu ni une dépense : il ne modifie que le solde des deux jarres concernées.

create table if not exists jar_transfers (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  from_jar      text not null check (from_jar in ('NEC','FFA','LTSS','PLAY','EDUC','GIFT')),
  to_jar        text not null check (to_jar   in ('NEC','FFA','LTSS','PLAY','EDUC','GIFT')),
  amount        numeric(14,2) not null check (amount > 0),
  transfer_date date not null default current_date,
  note          text not null default '',
  created_at    timestamptz not null default now(),
  check (from_jar <> to_jar)
);
create index if not exists idx_jar_transfers_user on jar_transfers(user_id, created_at desc);

alter table jar_transfers enable row level security;
drop policy if exists "users_own_jar_transfers" on jar_transfers;
create policy "users_own_jar_transfers" on jar_transfers for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- L'utilisateur crée, lit et annule (supprime) ses transferts ; pas de modification : on annule et on refait.
grant select, insert, delete on jar_transfers to authenticated;

-- Déficits effacés (« repartir de zéro ») : montant ajouté au solde d'une jarre pour la ramener à zéro.
-- L'historique des dépenses n'est jamais modifié ; supprimer la ligne annule l'effacement.
create table if not exists jar_adjustments (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  jar         text not null check (jar in ('NEC','FFA','LTSS','PLAY','EDUC','GIFT')),
  amount      numeric(14,2) not null check (amount > 0),
  note        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists idx_jar_adjustments_user on jar_adjustments(user_id, created_at desc);

alter table jar_adjustments enable row level security;
drop policy if exists "users_own_jar_adjustments" on jar_adjustments;
create policy "users_own_jar_adjustments" on jar_adjustments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, delete on jar_adjustments to authenticated;

-- La fonction serveur des notifications lit transferts et ajustements pour calculer les mêmes soldes que l'app.
grant select on jar_transfers, jar_adjustments to service_role;
