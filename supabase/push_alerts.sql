-- Notifications push d'alerte des jarres.
-- À exécuter une fois dans Supabase → SQL Editor (sans risque : « if not exists », aucune donnée existante touchée).

-- Appareils abonnés (un par navigateur / iPhone). L'utilisateur gère ses propres lignes depuis l'app.
create table if not exists push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;
drop policy if exists "users_own_push_subscriptions" on push_subscriptions;
create policy "users_own_push_subscriptions" on push_subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on push_subscriptions to authenticated;

-- Dernier niveau d'alerte notifié par jarre (1 = presque épuisée, 2 = dépassée) : évite d'envoyer deux fois la même alerte.
-- Réservée au serveur (clé service-role) : RLS activé sans aucune politique, donc invisible depuis l'app.
create table if not exists jar_alert_notified (
  user_id     uuid references auth.users(id) on delete cascade not null,
  jar_key     text not null,
  level       int not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, jar_key)
);
alter table jar_alert_notified enable row level security;
