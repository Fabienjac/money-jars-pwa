-- ═══════════════════════════════════════════════════════════════════════════
-- Compte de démonstration : des données réalistes sur 6 mois pour montrer l'application sans exposer tes vraies données.
--
-- À FAIRE D'ABORD (dans l'application) : créer un compte avec une adresse dédiée, par exemple demo@effivital.com,
-- confirmer l'e-mail, puis ouvrir l'application une fois pour qu'il existe dans la base.
-- À EXÉCUTER ENSUITE dans Supabase → SQL Editor, en changeant l'adresse ci-dessous si besoin.
--
-- Le script est relançable : il remplace uniquement les données DE CE COMPTE (jamais celles d'un autre) et les dates
-- sont calculées à partir d'aujourd'hui, donc la démo reste « fraîche ». Le compte reçoit un abonnement actif
-- (sinon la fenêtre de paiement s'afficherait à la fin de l'essai).
-- Les données sont fictives : revenus 2 450 € de salaire + missions, loyer 780 €, un voyage et une réparation « Exceptionnel ».
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_email text := 'demo@effivital.com';   -- ← adresse du compte de démo
  v_uid   uuid;
  v_month date := date_trunc('month', current_date)::date;
begin
  -- Garde-fous : le compte doit exister, et ce ne doit jamais être ton compte personnel
  if lower(v_email) in ('fcjacquet@gmail.com') then
    raise exception 'Cette adresse est ton compte personnel : utilise une adresse dédiée à la démo.';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'Aucun compte pour %. Crée-le d''abord dans l''application, puis relance ce script.', v_email;
  end if;

  -- Remise à zéro des données de ce compte uniquement
  delete from transactions_spending where user_id = v_uid;
  delete from transactions_revenue  where user_id = v_uid;
  delete from tags                  where user_id = v_uid;
  delete from accounts              where user_id = v_uid;
  delete from revenue_accounts      where user_id = v_uid;
  delete from jar_settings          where user_id = v_uid;
  delete from column_mappings       where user_id = v_uid and mapping_key = 'lifestyle_prefs';

  -- Abonnement actif pour 5 ans (compte de démo)
  insert into subscriptions (user_id, plan, current_period_end)
  values (v_uid, 'active', now() + interval '5 years')
  on conflict (user_id) do update set plan = 'active', current_period_end = now() + interval '5 years', updated_at = now();

  -- Jarres : pourcentages recommandés ; réserves de départ pour montrer l'autonomie (liberté financière, épargne long terme)
  insert into jar_settings (user_id, jar_key, percent, initial_balance) values
    (v_uid, 'NEC',  55, 0),
    (v_uid, 'FFA',  10, 800),
    (v_uid, 'LTSS', 10, 1500),
    (v_uid, 'PLAY', 10, 0),
    (v_uid, 'EDUC', 10, 0),
    (v_uid, 'GIFT',  5, 0);

  -- Comptes
  insert into accounts (user_id, account_id, name, icon, color) values
    (v_uid, 'cb',   'Carte bancaire', '💳', '#007AFF'),
    (v_uid, 'cash', 'Espèces',        '💶', '#34C759');
  insert into revenue_accounts (user_id, account_id, name, type, icon, color) values
    (v_uid, 'courant', 'Compte courant', 'bank', '🏦', '#5856D6');

  -- Étiquettes
  insert into tags (user_id, tag_id, name, emoji, color, favori) values
    (v_uid, 'alimentaire',  'Alimentation',  '🛒', '#34C759', true),
    (v_uid, 'logement',     'Logement',      '🏠', '#5856D6', false),
    (v_uid, 'transport',    'Transport',     '🚇', '#007AFF', false),
    (v_uid, 'restaurant',   'Restaurant',    '🍽️', '#FF9500', true),
    (v_uid, 'abonnements',  'Abonnements',   '🔁', '#AF52DE', false),
    (v_uid, 'loisirs',      'Loisirs',       '🎬', '#FF2D55', false),
    (v_uid, 'sante',        'Santé',         '💊', '#FF3B30', false),
    (v_uid, 'education',    'Formation',     '📚', '#00C7BE', false),
    (v_uid, 'cadeaux',      'Cadeaux',       '🎁', '#FF6482', false),
    (v_uid, 'voyage',       'Voyage',        '✈️', '#30B0C7', false),
    (v_uid, 'exceptionnel', 'Exceptionnel',  '⭐', '#FFCC00', false);

  -- Étiquette « Exceptionnel » déjà choisie pour l'indicateur « train de vie »
  insert into column_mappings (user_id, mapping_key, mapping)
  values (v_uid, 'lifestyle_prefs', '{"extraordinaryTags":["exceptionnel"]}'::jsonb)
  on conflict (user_id, mapping_key) do update set mapping = excluded.mapping, updated_at = now();

  -- Revenus : salaire le 3 de chaque mois + une mission un mois sur deux (6 mois, jamais dans le futur)
  insert into transactions_revenue (user_id, date, source, amount, income_type, destination, tags)
  select v_uid, d, s, a, t, 'Compte courant', ''
  from (
    select (v_month - (m || ' months')::interval)::date + 2 as d, 'Employeur SAS' as s, 2450.00 as a, 'Salaire' as t
    from generate_series(0, 5) m
    union all
    select (v_month - (m || ' months')::interval)::date + 11, 'Mission freelance', 380.00 + (m * 15), 'Freelance'
    from generate_series(0, 5) m where m % 2 = 0
  ) r
  where d <= current_date;

  -- Dépenses : modèle mensuel (jour du mois, jarre, compte, montant, libellé, étiquettes, abonnement, montant fixe ?)
  insert into transactions_spending (user_id, date, jar, account, amount, description, tags, subscription)
  select v_uid,
         (v_month - (m || ' months')::interval)::date + (x.dom - 1),
         x.jar, x.acc,
         case when x.fixe then x.amt
              else round(x.amt * (1 + (((m * 3 + x.dom) % 7) - 3) * 0.025), 2) end,
         x.descr, x.tg, x.abo
  from generate_series(0, 5) m
  cross join (values
    ( 1, 'NEC',  'Carte bancaire', 780.00, 'Loyer',                    'logement',            'mensuel', true ),
    ( 3, 'NEC',  'Carte bancaire',  64.00, 'Courses Carrefour',        'alimentaire',         '',        false),
    ( 5, 'NEC',  'Carte bancaire',  15.99, 'Forfait mobile',           'abonnements',         'mensuel', true ),
    ( 6, 'NEC',  'Carte bancaire',  58.00, 'Électricité',              'logement',            'mensuel', true ),
    ( 8, 'NEC',  'Carte bancaire',  49.00, 'Pass transport',           'transport',           'mensuel', true ),
    (10, 'NEC',  'Carte bancaire',  78.00, 'Courses bio',              'alimentaire',         '',        false),
    (12, 'PLAY', 'Carte bancaire',  13.49, 'Netflix',                  'abonnements,loisirs', 'mensuel', true ),
    (14, 'PLAY', 'Carte bancaire',  29.90, 'Salle de sport',           'loisirs,abonnements', 'mensuel', true ),
    (17, 'NEC',  'Carte bancaire',  72.00, 'Courses Leclerc',          'alimentaire',         '',        false),
    (19, 'PLAY', 'Carte bancaire',  46.00, 'Restaurant',               'restaurant',          '',        false),
    (22, 'PLAY', 'Espèces',         28.00, 'Cinéma',                   'loisirs',             '',        false),
    (24, 'NEC',  'Carte bancaire',  84.00, 'Courses Carrefour',        'alimentaire',         '',        false),
    (26, 'GIFT', 'Carte bancaire',  35.00, 'Cadeau d''anniversaire',   'cadeaux',             '',        false)
  ) as x(dom, jar, acc, amt, descr, tg, abo, fixe)
  where (v_month - (m || ' months')::interval)::date + (x.dom - 1) <= current_date;

  -- Quelques dépenses ponctuelles
  insert into transactions_spending (user_id, date, jar, account, amount, description, tags, subscription)
  select v_uid, d, jar, acc, amt, descr, tg, ''
  from (values
    ((v_month - interval '4 months')::date + 14, 'EDUC', 'Carte bancaire',  24.90, 'Livre de développement personnel', 'education'),
    ((v_month - interval '2 months')::date + 14, 'EDUC', 'Carte bancaire', 129.00, 'Formation en ligne',                'education'),
    ((v_month - interval '1 month')::date  + 20, 'NEC',  'Carte bancaire',  38.00, 'Pharmacie',                        'sante'),
    ((v_month - interval '3 months')::date + 17, 'PLAY', 'Carte bancaire', 520.00, 'Week-end à Lisbonne',               'voyage,exceptionnel'),
    ((v_month - interval '2 months')::date + 8,  'NEC',  'Carte bancaire', 340.00, 'Réparation de la voiture',          'transport,exceptionnel')
  ) as p(d, jar, acc, amt, descr, tg)
  where d <= current_date;

  raise notice 'Compte de démo prêt pour % (%).', v_email, v_uid;
end;
$$;
