-- ═══════════════════════════════════════════════════════════════════════════
-- Séminaire : suivre l'origine des inscriptions (?ref=seminaire) et offrir 30 jours d'essai
-- À exécuter dans l'éditeur SQL de Supabase. Sans danger : relançable, ne touche pas aux abonnés payants.
-- Lien à diffuser : https://money-jars-saas.netlify.app/?ref=seminaire
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. À l'inscription par e-mail, l'origine est dans les métadonnées : essai de 30 jours si elle vaut « seminaire ».
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, trial_ends_at)
  values (
    new.id,
    case when new.raw_user_meta_data->>'ref' = 'seminaire'
         then now() + interval '30 days'
         else now() + interval '14 days' end
  );
  return new;
end;
$$;

-- 2. Rattrapage : inscrits via Google (l'origine est attachée juste après la création du compte)
--    et comptes créés avant cette mise à jour. À relancer quand tu veux, par exemple le lendemain du séminaire.
update public.subscriptions s
set trial_ends_at = u.created_at + interval '30 days', updated_at = now()
from auth.users u
where s.user_id = u.id
  and s.plan = 'trial'
  and u.raw_user_meta_data->>'ref' = 'seminaire'
  and s.trial_ends_at < u.created_at + interval '30 days';

-- 3. Suivi : inscrits par origine, et essais en cours.
select coalesce(u.raw_user_meta_data->>'ref', '(aucune)') as origine,
       count(*)                                           as inscrits,
       count(*) filter (where s.plan = 'trial' and s.trial_ends_at > now()) as essais_en_cours,
       count(*) filter (where s.plan = 'active')          as abonnes
from auth.users u
left join public.subscriptions s on s.user_id = u.id
group by 1
order by inscrits desc;
