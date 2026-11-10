-- ═════════════════════════════════════════════════════════════════════════════
-- Doublons de dépenses (audit du 10 novembre 2026) : 10 dépenses saisies deux fois, une instance est conservée.
--
-- Deux dépenses sont des doublons quand elles ont le même compte, la même date, le même montant et le même libellé
-- (sans tenir compte des majuscules ni des espaces autour). Dans ton cas, chaque paire est la même dépense saisie à la
-- main (libellé en minuscules) puis importée du relevé (libellé en MAJUSCULES).
--
-- Quelle ligne est conservée ? Celle qui a le plus d'étiquettes (elle porte le plus d'information) ; à égalité, celle dont
-- le libellé a le moins de majuscules (« indigo parking Nîmes » plutôt que « INDIGO PARKING NÎMES ») ; à égalité encore,
-- la première par identifiant.
--
-- À exécuter dans Supabase → SQL Editor, ÉTAPE PAR ÉTAPE (sélectionner un bloc, puis Run).
-- Comme dans fix_audit_2026_11.sql : remplace d'abord <MON_USER_ID> par ton identifiant (Cmd+H). La suppression ne
-- touche QUE ton compte ; sans identifiant elle échoue au lieu de supprimer autre chose.
-- À LANCER APRÈS fix_audit_2026_11.sql : le rattachement des comptes (« Redotpay Virtuelle » → « Redotpay VIRT ») peut
-- faire apparaître d'autres paires, qui n'étaient pas des doublons tant que les comptes s'écrivaient différemment.
-- Attendu : 10 groupes, 10 lignes supprimées, 462,02 € de dépenses en moins (toutes en Nécessités). Si l'aperçu (étape 1)
-- montre PLUS de 10 groupes, regarde les lignes en trop et ne continue pas avant de m'avoir envoyé le résultat.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. APERÇU (lecture seule) : chaque doublon avec la ligne gardée (GARDER) et la ligne supprimée (SUPPRIMER)
-- ─────────────────────────────────────────────────────────────────────────────
with ranked as (
  select id, date, description, amount, account, jar, tags,
         count(*) over w as n,
         row_number() over (
           w order by coalesce(array_length(string_to_array(nullif(btrim(tags), ''), ','), 1), 0) desc,
                      length(description) - length(regexp_replace(description, '[[:upper:]]', '', 'g')) asc,
                      id
         ) as rang
  from transactions_spending
  where user_id = '<MON_USER_ID>'::uuid
  window w as (partition by date, lower(btrim(description)), amount, account)
)
select case when rang = 1 then 'GARDER' else 'SUPPRIMER' end as action,
       date, description, account, amount, jar, tags, id
from ranked
where n > 1
order by date desc, lower(btrim(description)), rang;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SAUVEGARDE : copie complète des dépenses avant la suppression.
--    (RLS activé et sans règle : la copie n'est lisible ni par l'API ni par l'application.)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists transactions_spending_backup_20261110_doublons as
  select * from transactions_spending;
alter table transactions_spending_backup_20261110_doublons enable row level security;

-- Vérification : les deux nombres doivent être identiques
select (select count(*) from transactions_spending)                            as depenses,
       (select count(*) from transactions_spending_backup_20261110_doublons)  as sauvegarde;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SUPPRESSION des doublons (une instance gardée par groupe). Attendu : 10 lignes affichées.
--    Si le nombre est différent, ne passe pas à l'étape suivante et envoie-moi le résultat.
-- ─────────────────────────────────────────────────────────────────────────────
with ranked as (
  select id,
         count(*) over w as n,
         row_number() over (
           w order by coalesce(array_length(string_to_array(nullif(btrim(tags), ''), ','), 1), 0) desc,
                      length(description) - length(regexp_replace(description, '[[:upper:]]', '', 'g')) asc,
                      id
         ) as rang
  from transactions_spending
  where user_id = '<MON_USER_ID>'::uuid
  window w as (partition by date, lower(btrim(description)), amount, account)
)
delete from transactions_spending t
using ranked r
where t.id = r.id and r.n > 1 and r.rang > 1
returning t.date, t.description, t.account, t.amount, t.jar, t.tags;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VÉRIFICATION : doublons restants = 0 ; le total a diminué de 10 lignes (sauvegarde − dépenses = 10)
-- ─────────────────────────────────────────────────────────────────────────────
select
  (select count(*) from (
     select 1 from transactions_spending
     where user_id = '<MON_USER_ID>'::uuid
     group by date, lower(btrim(description)), amount, account
     having count(*) > 1
   ) d)                                                                           as doublons_restants,
  (select count(*) from transactions_spending_backup_20261110_doublons)
    - (select count(*) from transactions_spending)                                as lignes_supprimees;


-- ─────────────────────────────────────────────────────────────────────────────
-- EN CAS DE BESOIN : remettre les lignes supprimées (copie conforme depuis la sauvegarde). À ne lancer que si tu veux
-- annuler ; décommente le bloc.
-- ─────────────────────────────────────────────────────────────────────────────
-- insert into transactions_spending
-- select b.* from transactions_spending_backup_20261110_doublons b
-- where not exists (select 1 from transactions_spending t where t.id = b.id);
