-- Suggestions des utilisateurs (formulaire « Plus » → « Une idée, un bug ? »)
-- À exécuter une fois dans Supabase (SQL Editor). Script rejouable sans risque.
--
-- Chaque utilisateur peut ENVOYER et RELIRE ses propres messages, jamais ceux des autres.
-- Pour lire tous les messages : tableau de bord Supabase → Table Editor → feedback.

create table if not exists feedback (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete set null,
  category    text not null check (category in ('bug', 'idea', 'ux')),
  message     text not null check (char_length(message) between 3 and 2000),
  email       text check (email is null or char_length(email) <= 254),
  lang        text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_feedback_created on feedback(created_at desc);

alter table feedback enable row level security;

drop policy if exists "feedback_insert_own" on feedback;
create policy "feedback_insert_own" on feedback
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "feedback_select_own" on feedback;
create policy "feedback_select_own" on feedback
  for select to authenticated
  using (auth.uid() = user_id);

grant select, insert on feedback to authenticated;
