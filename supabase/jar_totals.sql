-- ═════════════════════════════════════════════════════════════════════════════
-- Totaux des jarres calculés par la base : my_jar_totals()
--
-- Avant : pour afficher le solde des jarres, l'application téléchargeait TOUTES les dépenses et TOUS les revenus depuis
-- le début (des milliers de lignes, de plus en plus chaque année) et les additionnait elle-même.
-- Après : la base additionne et renvoie quelques chiffres :
--     { "spending": { "NEC": 49488.75, "PLAY": 34680.84, … }, "revenue_total": 169767.19 }
--
-- Règles identiques à l'application (src/jarTotals.ts) : dépenses additionnées par jarre ; revenus = montant, ou
-- quantité de crypto × cours quand il n'y a pas de montant. Le calcul se fait pour la personne connectée seulement
-- (auth.uid(), et les règles d'accès RLS de la base s'appliquent aussi).
-- Ne modifie AUCUNE donnée : elle ajoute seulement une fonction. Si elle n'existe pas, l'application retombe sur
-- l'ancienne lecture (rien ne casse, mais le gain n'est pas là).
--
-- À exécuter dans Supabase → SQL Editor, ÉTAPE PAR ÉTAPE (sélectionner un bloc, puis Run).
-- Étape 3 : remplace d'abord <MON_USER_ID> par ton identifiant (select id, email from auth.users).
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. APERÇU (lecture seule) : les sommes calculées directement, à comparer avec l'étape 3
select jar, sum(amount) as total
from transactions_spending
where user_id = '<MON_USER_ID>'::uuid
group by jar
order by jar;

select sum(coalesce(amount, coalesce(crypto_quantity, 0) * coalesce(rate, 0))) as revenue_total
from transactions_revenue
where user_id = '<MON_USER_ID>'::uuid;

-- 2. CRÉATION de la fonction
create or replace function public.my_jar_totals()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'spending', coalesce(
      (select jsonb_object_agg(s.jar, s.total)
         from (select jar, sum(amount) as total
                 from public.transactions_spending
                where user_id = auth.uid()
                group by jar) s),
      '{}'::jsonb),
    'revenue_total', coalesce(
      (select sum(coalesce(amount, coalesce(crypto_quantity, 0) * coalesce(rate, 0)))
         from public.transactions_revenue
        where user_id = auth.uid()),
      0)
  );
$$;

revoke all on function public.my_jar_totals() from public, anon;
grant execute on function public.my_jar_totals() to authenticated;

-- 3. VÉRIFICATION : la fonction appelée comme la personne connectée doit renvoyer les mêmes chiffres qu'à l'étape 1
select public.my_jar_totals() as totaux
from (
  select set_config('request.jwt.claim.sub', '<MON_USER_ID>', true),
         set_config('request.jwt.claims', '{"sub":"<MON_USER_ID>","role":"authenticated"}', true)
) as c;

-- RETOUR ARRIÈRE (retire les « -- » puis Run) : supprime la fonction ; l'application retombe sur l'ancienne lecture
-- drop function if exists public.my_jar_totals();
