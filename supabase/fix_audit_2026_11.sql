-- ═════════════════════════════════════════════════════════════════════════════
-- Correctifs issus de l'audit du 10 novembre 2026 (données de dépenses)
--
--   A. Une dépense a un TAG à la place d'une jarre : « ONENESS SHOP LLP », 2 février 2026, 2,03 €, jarre
--      « VIE_QUOTIDIENNE ». Son montant n'est dans aucune jarre (d'où un écart de 2,03 € entre l'Historique et les
--      soldes). On la passe à la jarre Nécessités (NEC).
--   B. 13 dépenses d'août 2026 portent le compte « Redotpay Virtuelle », qui n'existe pas dans la liste des comptes
--      (la liste a « Redotpay VIRT »). On les rattache à « Redotpay VIRT ».
--   C. (À toi de choisir) une dépense du 17 janvier 2026 porte le compte « Redotpay » : carte physique ou virtuelle ?
--   D. Garde-fou : la base refuse désormais une jarre qui n'est pas l'une des six.
--
-- À exécuter dans Supabase → SQL Editor, ÉTAPE PAR ÉTAPE (sélectionner un bloc, puis Run). Rien n'est supprimé.
-- Ton projet contient aussi tes comptes de test et de démo : les corrections (étape 3) ne touchent QUE ton compte.
-- Étape 0 : trouve ton identifiant, puis remplace partout <MON_USER_ID> par lui (Cmd+H dans l'éditeur). Si tu oublies,
-- les requêtes de l'étape 3 échouent (identifiant invalide) au lieu de modifier autre chose.
-- Chaque correction cible des lignes précises et affiche le nombre de lignes modifiées : s'il ne correspond pas au
-- nombre attendu, ne passe pas à l'étape suivante (la sauvegarde de l'étape 2 permet de tout rétablir).
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 0. TON IDENTIFIANT (lecture seule) : prends la ligne qui correspond à ton adresse, copie la colonne « id »
--    (un UUID du type 123e4567-e89b-12d3-a456-426614174000) et remplace <MON_USER_ID> dans tout ce fichier.
-- ─────────────────────────────────────────────────────────────────────────────
select id, email, created_at from auth.users order by created_at;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. APERÇU (lecture seule) : toutes les lignes concernées, de tous les comptes
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Dépenses dont la jarre n'est pas l'une des six (attendu : 1 ligne, « VIE_QUOTIDIENNE »)
select user_id, id, date, description, jar, account, amount
from transactions_spending
where jar not in ('NEC', 'FFA', 'LTSS', 'PLAY', 'EDUC', 'GIFT')
order by date;

-- 1b. Dépenses dont le compte n'existe pas dans la liste des comptes de la personne
--     (attendu : « Redotpay Virtuelle » 13 lignes, « Redotpay » 1 ligne)
select s.account, count(*) as nombre_de_lignes, min(s.date) as du, max(s.date) as au
from transactions_spending s
where btrim(coalesce(s.account, '')) <> ''
  and not exists (
    select 1 from accounts a
    where a.user_id = s.user_id and lower(btrim(a.name)) = lower(btrim(s.account))
  )
group by s.account
order by nombre_de_lignes desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SAUVEGARDE : copie complète des dépenses avant toute modification.
--    (RLS activé et sans règle : la copie n'est lisible ni par l'API ni par l'application.)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists transactions_spending_backup_20261110 as
  select * from transactions_spending;
alter table transactions_spending_backup_20261110 enable row level security;

-- Vérification : les deux nombres doivent être identiques
select (select count(*) from transactions_spending)                  as depenses,
       (select count(*) from transactions_spending_backup_20261110)  as sauvegarde;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CORRECTIONS (chacune affiche les lignes modifiées)
-- ─────────────────────────────────────────────────────────────────────────────

-- 3A. La dépense à jarre invalide → Nécessités. Attendu : 1 ligne.
update transactions_spending
set jar = 'NEC'
where jar = 'VIE_QUOTIDIENNE'
  and description = 'ONENESS SHOP LLP'
  and date = '2026-02-02'
  and amount = 2.03
  and user_id = '<MON_USER_ID>'::uuid
returning id, date, description, jar, account, amount;

-- 3B. « Redotpay Virtuelle » → « Redotpay VIRT » (août 2026). Attendu : 13 lignes.
update transactions_spending
set account = 'Redotpay VIRT'
where account = 'Redotpay Virtuelle'
  and date between '2026-08-01' and '2026-08-31'
  and user_id = '<MON_USER_ID>'::uuid
returning id, date, description, account, amount;

-- 3C. (OPTIONNEL, à toi de choisir) la dépense du 17 janvier 2026 au compte « Redotpay ».
--     Décommente UNE des deux lignes « set account » (carte physique OU virtuelle), puis lance le bloc. Attendu : 1 ligne.
-- update transactions_spending
-- set account = 'Redotpay PHYS'      -- ou : 'Redotpay VIRT'
-- where account = 'Redotpay'
--   and date = '2026-01-17'
--   and description = 'Twin Birds leggings india Odile'
--   and user_id = '<MON_USER_ID>'::uuid
-- returning id, date, description, account, amount;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VÉRIFICATION : tout doit être à 0 (ou à la valeur attendue)
-- ─────────────────────────────────────────────────────────────────────────────
select
  (select count(*) from transactions_spending
     where jar not in ('NEC', 'FFA', 'LTSS', 'PLAY', 'EDUC', 'GIFT')
       and user_id = '<MON_USER_ID>'::uuid)                                                       as jarres_invalides,
  (select count(*) from transactions_spending
     where account = 'Redotpay Virtuelle' and user_id = '<MON_USER_ID>'::uuid)                   as redotpay_virtuelle,
  (select count(*) from transactions_spending)                                                    as total_depenses,
  (select count(*) from transactions_spending_backup_20261110)                                    as total_sauvegarde;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GARDE-FOU : la base refuse toute nouvelle dépense dont la jarre n'est pas l'une des six.
--    « not valid » : la règle vaut pour les écritures à venir sans re-contrôler tout l'existant.
--    (Si l'étape 4 montre 0 jarre invalide, tu peux ensuite lancer : alter table transactions_spending
--     validate constraint transactions_spending_jar_check; — facultatif.)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_spending_jar_check'
      and conrelid = 'public.transactions_spending'::regclass
  ) then
    alter table public.transactions_spending
      add constraint transactions_spending_jar_check
      check (jar in ('NEC', 'FFA', 'LTSS', 'PLAY', 'EDUC', 'GIFT')) not valid;
  end if;
end;
$$;
