-- ═══════════════════════════════════════════════════════════════════════════
-- Verrouillage de la table subscriptions : un utilisateur peut LIRE son abonnement, jamais l'ÉCRIRE.
--
-- Avant : la règle « users_own_subscription » (for all) laissait chaque utilisateur modifier sa propre ligne
-- (passer en « active », allonger son essai) par un simple appel à l'API. Maintenant seules les fonctions serveur
-- (webhook Stripe, suppression de compte : clé service_role, qui ignore ces règles) et le déclencheur d'inscription écrivent.
--
-- À exécuter dans Supabase → SQL Editor. Relançable. Sans effet sur les paiements, le portail ni la suppression de compte.
-- Ordre conseillé : exécuter ce script, PUIS déployer l'application (qui n'écrit plus dans cette table).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Fonction de secours : crée la ligne d'abonnement d'un compte qui n'en a pas (compte plus ancien que le déclencheur).
--    S'exécute avec les droits du serveur, uniquement pour l'utilisateur connecté, et ne modifie jamais une ligne existante.
create or replace function public.ensure_my_subscription()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ref text;
begin
  if auth.uid() is null then return; end if;
  select raw_user_meta_data->>'ref' into v_ref from auth.users where id = auth.uid();
  insert into public.subscriptions (user_id, trial_ends_at)
  values (
    auth.uid(),
    case when v_ref = 'seminaire' then now() + interval '30 days' else now() + interval '14 days' end
  )
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.ensure_my_subscription() from public, anon;
grant execute on function public.ensure_my_subscription() to authenticated;

-- 2. Règles d'accès : on retire toutes les règles existantes sur la table (quel que soit leur nom), puis on n'autorise que la lecture de sa propre ligne.
alter table public.subscriptions enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'subscriptions' loop
    execute format('drop policy %I on public.subscriptions', p.policyname);
  end loop;
end;
$$;

create policy "users_read_own_subscription" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);

-- 3. Droits : lecture seule pour les utilisateurs connectés, aucun droit pour les anonymes.
revoke insert, update, delete, truncate on public.subscriptions from authenticated, anon;
revoke select on public.subscriptions from anon;
grant select on public.subscriptions to authenticated;

-- 4. Contrôle : doit afficher une seule règle (SELECT) et, pour « authenticated », le seul droit SELECT.
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'subscriptions';
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'subscriptions' and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
