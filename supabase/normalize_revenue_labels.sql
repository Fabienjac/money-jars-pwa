-- ═════════════════════════════════════════════════════════════════════════════
-- Revenus : normaliser « type de revenu » et « destination », et empêcher les doublons à l'avenir
--
-- Problème : ces deux champs sont de la saisie libre, donc « Passive Income » / « Passive income » /
-- « Passive income␣ » (espace en trop) ou « KEYSTONE » / « Keystone » deviennent des valeurs distinctes
-- (autant de pastilles dans l'Historique et de lignes dans les statistiques).
--
-- À exécuter dans Supabase → SQL Editor, ÉTAPE PAR ÉTAPE (sélectionner un bloc, puis Run) :
--   1. Aperçu (lecture seule)         : voir les variantes
--   2. Sauvegarde                     : copie de la table avant modification
--   3. Normalisation des données      : une seule écriture par valeur, la plus fréquente gagne
--   3 bis (facultatif) : imposer une orthographe précise
--   4. Garde-fou pour les futures saisies (déclencheur)
--
-- Règle de comparaison : sans tenir compte de la casse, des espaces en début/fin et des espaces multiples.
-- (Les accents comptent : « Crédit Mutuel » et « Credit Mutuel » restent distincts.)
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. APERÇU (lecture seule) : seules les valeurs qui existent sous plusieurs écritures sont listées.
--    Les guillemets « » rendent visibles les espaces en trop.
-- ─────────────────────────────────────────────────────────────────────────────
with v as (
  select user_id, 'type de revenu'::text as champ, income_type as brut
  from transactions_revenue where btrim(coalesce(income_type, '')) <> ''
  union all
  select user_id, 'destination', destination
  from transactions_revenue where btrim(coalesce(destination, '')) <> ''
),
g as (
  select champ, user_id,
         lower(regexp_replace(btrim(brut), '\s+', ' ', 'g')) as cle,
         brut, count(*) as nb
  from v group by champ, user_id, 3, brut
)
select champ,
       '«' || brut || '»' as ecriture,
       nb as nombre_de_lignes
from (
  select *, count(*) over (partition by champ, user_id, cle) as variantes from g
) x
where variantes > 1
order by champ, cle, nb desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SAUVEGARDE : copie complète des revenus avant toute modification.
--    (RLS activé et sans règle : la copie n'est lisible ni par l'API ni par l'application.)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists transactions_revenue_backup_20261108 as
  select * from transactions_revenue;
alter table transactions_revenue_backup_20261108 enable row level security;

-- Vérification : les deux nombres doivent être identiques
select (select count(*) from transactions_revenue)                  as revenus,
       (select count(*) from transactions_revenue_backup_20261108)  as sauvegarde;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. NORMALISATION DES DONNÉES EXISTANTES
--    Pour chaque groupe de variantes, l'écriture la plus fréquente est conservée ; à égalité, celle qui n'est pas
--    entièrement en majuscules, puis l'ordre alphabétique. Les espaces en trop sont supprimés.
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. Type de revenu
with cleaned as (
  select id, user_id, regexp_replace(btrim(income_type), '\s+', ' ', 'g') as v
  from transactions_revenue
  where btrim(coalesce(income_type, '')) <> ''
),
ranked as (
  select user_id, lower(v) as k, v,
         row_number() over (
           partition by user_id, lower(v)
           order by count(*) desc, (v = upper(v)), v
         ) as rk
  from cleaned
  group by user_id, lower(v), v
),
canon as (select user_id, k, v as canon from ranked where rk = 1)
update transactions_revenue t
set income_type = c.canon
from cleaned cl
join canon c on c.user_id = cl.user_id and c.k = lower(cl.v)
where t.id = cl.id
  and t.income_type is distinct from c.canon;

-- 3b. Destination
with cleaned as (
  select id, user_id, regexp_replace(btrim(destination), '\s+', ' ', 'g') as v
  from transactions_revenue
  where btrim(coalesce(destination, '')) <> ''
),
ranked as (
  select user_id, lower(v) as k, v,
         row_number() over (
           partition by user_id, lower(v)
           order by count(*) desc, (v = upper(v)), v
         ) as rk
  from cleaned
  group by user_id, lower(v), v
),
canon as (select user_id, k, v as canon from ranked where rk = 1)
update transactions_revenue t
set destination = c.canon
from cleaned cl
join canon c on c.user_id = cl.user_id and c.k = lower(cl.v)
where t.id = cl.id
  and t.destination is distinct from c.canon;

-- 3c. Valeurs vides (« » ou espaces seuls) → NULL
update transactions_revenue set income_type = null where income_type is not null and btrim(income_type) = '';
update transactions_revenue set destination = null where destination is not null and btrim(destination) = '';

-- Contrôle : relancer l'aperçu (étape 1) ; il ne doit plus rien lister.


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 bis (FACULTATIF) : imposer une orthographe précise quand la plus fréquente n'est pas celle que tu veux.
--    Exemple : tout mettre sous « Keystone ». Le drapeau désactive le déclencheur de l'étape 4 le temps de la
--    transaction (sinon il remettrait l'ancienne écriture). Adapter puis exécuter les 3 lignes d'un coup.
-- ─────────────────────────────────────────────────────────────────────────────
-- begin;
--   set local app.skip_label_normalization = 'on';
--   update transactions_revenue set destination = 'Keystone' where lower(btrim(destination)) = 'keystone';
-- commit;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. GARDE-FOU POUR LES FUTURES SAISIES
--    À chaque ajout ou modification d'un revenu (application, import de relevé, règle automatique) :
--      - les espaces en trop sont retirés, une valeur vide devient NULL ;
--      - si la valeur existe déjà chez toi sous une autre casse (« passive INCOME »), l'écriture déjà utilisée
--        est reprise : impossible de recréer un doublon par la casse ou les espaces.
--    Une valeur vraiment nouvelle est acceptée telle quelle.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.normalize_revenue_labels()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  canon text;
begin
  -- Échappatoire pour renommer une valeur sur toutes les lignes (voir 3 bis)
  if coalesce(current_setting('app.skip_label_normalization', true), '') = 'on' then
    return new;
  end if;

  new.income_type := nullif(regexp_replace(btrim(coalesce(new.income_type, '')), '\s+', ' ', 'g'), '');
  new.destination := nullif(regexp_replace(btrim(coalesce(new.destination, '')), '\s+', ' ', 'g'), '');

  if new.income_type is not null then
    select t.income_type into canon
    from transactions_revenue t
    where t.user_id = new.user_id
      and t.id is distinct from new.id
      and lower(t.income_type) = lower(new.income_type)
    group by t.income_type
    order by count(*) desc, (t.income_type = upper(t.income_type)), t.income_type
    limit 1;
    if canon is not null then new.income_type := canon; end if;
  end if;

  canon := null;
  if new.destination is not null then
    select t.destination into canon
    from transactions_revenue t
    where t.user_id = new.user_id
      and t.id is distinct from new.id
      and lower(t.destination) = lower(new.destination)
    group by t.destination
    order by count(*) desc, (t.destination = upper(t.destination)), t.destination
    limit 1;
    if canon is not null then new.destination := canon; end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_revenue_labels on transactions_revenue;
create trigger trg_normalize_revenue_labels
  before insert or update of income_type, destination on transactions_revenue
  for each row execute function public.normalize_revenue_labels();

-- Index pour que la recherche d'une variante reste instantanée
create index if not exists idx_revenue_user_type_lower on transactions_revenue (user_id, lower(income_type));
create index if not exists idx_revenue_user_dest_lower on transactions_revenue (user_id, lower(destination));

-- Test (facultatif, dans une transaction annulée : rien n'est enregistré) :
--   begin;
--   insert into transactions_revenue (user_id, date, source, amount, income_type, destination)
--     select user_id, current_date, 'test', 1, '  passive   INCOME ', 'KEYSTONE ' from transactions_revenue limit 1
--     returning income_type, destination;     -- doit rendre les écritures déjà utilisées chez toi
--   rollback;
