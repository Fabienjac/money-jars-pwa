-- ═══════════════════════════════════════════════════════════════════════════
-- Règles automatiques unifiées : une seule table (auto_tag_rules) pour les règles écrites à la main dans les Réglages
-- et celles apprises à l'import. Ce script ne fait qu'AJOUTER des colonnes : rien n'est modifié ni supprimé, l'application
-- actuelle continue de fonctionner (les lignes existantes sont des règles « apprises à l'import »).
--
-- À exécuter dans Supabase → SQL Editor. Relançable sans danger.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.auto_tag_rules
  add column if not exists mode        text        not null default 'spending',  -- 'spending' | 'revenue'
  add column if not exists destination text,                                      -- revenus : compte de destination
  add column if not exists income_type text,                                      -- revenus : type de revenu
  add column if not exists origin      text        not null default 'learned',    -- 'manual' (Réglages) | 'learned' (import)
  add column if not exists updated_at  timestamptz not null default now();

-- Valeurs autorisées (ajoutées une seule fois)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'auto_tag_rules_mode_check'
                 and conrelid = 'public.auto_tag_rules'::regclass) then
    alter table public.auto_tag_rules add constraint auto_tag_rules_mode_check check (mode in ('spending', 'revenue'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'auto_tag_rules_origin_check'
                 and conrelid = 'public.auto_tag_rules'::regclass) then
    alter table public.auto_tag_rules add constraint auto_tag_rules_origin_check check (origin in ('manual', 'learned'));
  end if;
end;
$$;

-- Contrôle : une ligne par colonne attendue (7 colonnes d'origine + 5 nouvelles).
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'auto_tag_rules'
order by ordinal_position;
