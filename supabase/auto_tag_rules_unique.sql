-- Contrainte d'unicité (user_id, pattern) sur auto_tag_rules.
-- Requise par l'enregistrement des règles (upsert onConflict "user_id,pattern" dans src/api.ts) :
-- sans elle, Postgres refuse l'upsert et les règles ne sont jamais sauvegardées dans le cloud.
-- Idempotent : peut être exécuté plusieurs fois. À exécuter dans Supabase → SQL Editor.

-- 1. Supprimer les doublons éventuels (on garde la règle la plus récente de chaque motif)
delete from auto_tag_rules a
using auto_tag_rules b
where a.user_id = b.user_id
  and a.pattern = b.pattern
  and (a.created_at, a.id) < (b.created_at, b.id);

-- 2. Ajouter la contrainte si elle n'existe pas déjà
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'auto_tag_rules_user_pattern_key'
      and conrelid = 'public.auto_tag_rules'::regclass
  ) then
    alter table auto_tag_rules
      add constraint auto_tag_rules_user_pattern_key unique (user_id, pattern);
  end if;
end $$;
