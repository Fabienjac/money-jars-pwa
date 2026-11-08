-- ═════════════════════════════════════════════════════════════════════════════
-- Dépenses : normaliser le champ « compte » et empêcher les doublons à l'avenir
--
-- Même principe que normalize_revenue_labels.sql. Seul le compte (colonne `account`) est de la saisie libre :
-- la jarre et l'abonnement ont des valeurs fixes, les étiquettes sont des identifiants, et le libellé d'une dépense
-- doit rester tel quel (ce n'est pas une catégorie).
--
-- À exécuter dans Supabase → SQL Editor, ÉTAPE PAR ÉTAPE (sélectionner un bloc, puis Run) :
--   1. Aperçu (lecture seule)         : voir les variantes
--   2. Sauvegarde                     : copie de la table avant modification
--   3. Normalisation des données      : l'écriture la plus fréquente gagne
--   3 bis (facultatif) : imposer une orthographe précise
--   4. Garde-fou pour les futures saisies (déclencheur)
--
-- Comparaison : sans tenir compte de la casse, des espaces en début/fin et des espaces multiples.
-- (Les accents comptent.) Un compte vide reste vide ('' : la colonne n'accepte pas NULL).
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. APERÇU (lecture seule) : seuls les comptes qui existent sous plusieurs écritures sont listés.
--    Les guillemets « » rendent visibles les espaces en trop.
-- ─────────────────────────────────────────────────────────────────────────────
with g as (
  select user_id,
         lower(regexp_replace(btrim(account), '\s+', ' ', 'g')) as cle,
         account as brut, count(*) as nb
  from transactions_spending
  where btrim(coalesce(account, '')) <> ''
  group by user_id, 2, account
)
select '«' || brut || '»' as ecriture, nb as nombre_de_lignes
from (
  select *, count(*) over (partition by user_id, cle) as variantes from g
) x
where variantes > 1
order by cle, nb desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SAUVEGARDE : copie complète des dépenses avant toute modification.
--    (RLS activé et sans règle : la copie n'est lisible ni par l'API ni par l'application.)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists transactions_spending_backup_20261108 as
  select * from transactions_spending;
alter table transactions_spending_backup_20261108 enable row level security;

-- Vérification : les deux nombres doivent être identiques
select (select count(*) from transactions_spending)                  as depenses,
       (select count(*) from transactions_spending_backup_20261108)  as sauvegarde;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. NORMALISATION DES DONNÉES EXISTANTES
--    Pour chaque groupe de variantes, l'écriture la plus fréquente est conservée ; à égalité, celle qui n'est pas
--    entièrement en majuscules, puis l'ordre alphabétique. Les espaces en trop sont supprimés.
-- ─────────────────────────────────────────────────────────────────────────────
with cleaned as (
  select id, user_id, regexp_replace(btrim(account), '\s+', ' ', 'g') as v
  from transactions_spending
  where btrim(coalesce(account, '')) <> ''
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
update transactions_spending t
set account = c.canon
from cleaned cl
join canon c on c.user_id = cl.user_id and c.k = lower(cl.v)
where t.id = cl.id
  and t.account is distinct from c.canon;

-- Comptes faits uniquement d'espaces → vide
update transactions_spending set account = '' where account <> '' and btrim(account) = '';

-- Contrôle : relancer l'aperçu (étape 1) ; il ne doit plus rien lister.


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 bis (FACULTATIF) : imposer une orthographe précise quand la plus fréquente n'est pas celle que tu veux.
--    Exemple : tout mettre sous « Revolut ». Le drapeau désactive le déclencheur de l'étape 4 le temps de la
--    transaction (sinon il remettrait l'ancienne écriture). Adapter puis exécuter les 3 lignes d'un coup.
-- ─────────────────────────────────────────────────────────────────────────────
-- begin;
--   set local app.skip_label_normalization = 'on';
--   update transactions_spending set account = 'Revolut' where lower(btrim(account)) = 'revolut';
-- commit;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. GARDE-FOU POUR LES FUTURES SAISIES
--    À chaque ajout ou modification d'une dépense (application, import de relevé, règle automatique) :
--      - les espaces en trop sont retirés ;
--      - si le compte existe déjà chez toi sous une autre casse (« REVOLUT »), l'écriture déjà utilisée est reprise.
--    Un compte vraiment nouveau est accepté tel quel.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.normalize_spending_account()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  canon text;
begin
  -- Échappatoire pour renommer un compte sur toutes les lignes (voir 3 bis)
  if coalesce(current_setting('app.skip_label_normalization', true), '') = 'on' then
    return new;
  end if;

  new.account := regexp_replace(btrim(coalesce(new.account, '')), '\s+', ' ', 'g');

  if new.account <> '' then
    select t.account into canon
    from transactions_spending t
    where t.user_id = new.user_id
      and t.id is distinct from new.id
      and lower(t.account) = lower(new.account)
    group by t.account
    order by count(*) desc, (t.account = upper(t.account)), t.account
    limit 1;
    if canon is not null then new.account := canon; end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_spending_account on transactions_spending;
create trigger trg_normalize_spending_account
  before insert or update of account on transactions_spending
  for each row execute function public.normalize_spending_account();

-- Index pour que la recherche d'une variante reste instantanée (import de milliers de lignes)
create index if not exists idx_spending_user_account_lower on transactions_spending (user_id, lower(account));

-- Test (facultatif, dans une transaction annulée : rien n'est enregistré) :
--   begin;
--   insert into transactions_spending (user_id, date, jar, account, amount, description)
--     select user_id, current_date, 'NEC', '  REVOLUT ', 1, 'test' from transactions_spending where account ilike 'revolut' limit 1
--     returning account;     -- doit rendre l'écriture déjà utilisée chez toi
--   rollback;
