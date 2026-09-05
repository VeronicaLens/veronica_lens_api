begin;
select plan(26);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'user_roles', 'user_roles exists');
select has_table('public', 'learning_tracks', 'learning_tracks exists');
select has_table('public', 'lessons', 'lessons exists');
select has_table('public', 'user_learning_progress', 'user_learning_progress exists');
select has_table('public', 'astronomical_events', 'astronomical_events exists');
select has_table('public', 'observations', 'observations exists');
select has_table('public', 'observation_media', 'observation_media exists');
select has_table('public', 'device_push_tokens', 'device_push_tokens exists');
select has_table('public', 'event_preferences', 'event_preferences exists');

select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.profiles'::regclass,
      'public.user_roles'::regclass,
      'public.learning_tracks'::regclass,
      'public.lessons'::regclass,
      'public.user_learning_progress'::regclass,
      'public.astronomical_events'::regclass,
      'public.observations'::regclass,
      'public.observation_media'::regclass,
      'public.device_push_tokens'::regclass,
      'public.event_preferences'::regclass
    )
      and relrowsecurity
  ),
  10,
  'RLS is enabled on every domain table'
);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'select')
    and not has_table_privilege('anon', 'public.learning_tracks', 'select')
    and not has_table_privilege('anon', 'public.observations', 'select'),
  'anonymous clients cannot access domain data'
);
select ok(
  has_table_privilege('authenticated', 'public.profiles', 'select')
    and has_table_privilege('authenticated', 'public.observations', 'insert'),
  'authenticated clients receive only policy-controlled table privileges'
);

select is(
  (select count(*)::integer from public.learning_tracks where published),
  1,
  'seed provides one published learning track'
);
select is(
  (select count(*)::integer from public.lessons where published),
  1,
  'seed provides one published lesson'
);
select is(
  (select count(*)::integer from public.astronomical_events where published),
  1,
  'seed provides one published astronomical event'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'user-one@example.test',
    '',
    '{"role":"user"}'::jsonb,
    '{"display_name":"User One"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'user-two@example.test',
    '',
    '{"role":"user"}'::jsonb,
    '{"display_name":"User Two"}'::jsonb,
    now(),
    now()
  );

select is(
  (select count(*)::integer from public.profiles where id::text like '40000000-%'),
  2,
  'new auth users receive profiles'
);
select is(
  (select count(*)::integer from public.user_roles where user_id::text like '40000000-%'),
  2,
  'new auth users receive roles'
);
select is(
  (
    select count(*)::integer
    from public.user_roles
    where user_id::text like '40000000-%' and role = 'user'
  ),
  2,
  'new auth users always start with the user role'
);

insert into public.observations (id, user_id, title, observed_at)
values
  (
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'Observation one',
    now()
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    'Observation two',
    now()
  );

set local "request.jwt.claims" =
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"user"}}';
set local role authenticated;

select is(
  (select count(*) from public.observations),
  1::bigint,
  'a user reads only their own observations'
);
select is(
  (select count(*) from public.user_roles),
  1::bigint,
  'a user reads only their own role'
);
select throws_ok(
  $$
    insert into public.observations (user_id, title, observed_at)
    values ('40000000-0000-4000-8000-000000000002', 'Forbidden', now())
  $$,
  '42501',
  'new row violates row-level security policy for table "observations"',
  'a user cannot create an observation for another user'
);

reset role;
set local "request.jwt.claims" =
  '{"sub":"40000000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}';
set local role authenticated;

select is(
  (select count(*) from public.observations),
  2::bigint,
  'an admin reads every observation'
);
select is(
  (select count(*) from public.profiles where id::text like '40000000-%'),
  2::bigint,
  'an admin reads every profile'
);
select is(
  (select count(*) from public.user_roles where user_id::text like '40000000-%'),
  2::bigint,
  'an admin reads every role'
);

reset role;
select throws_ok(
  $$
    insert into public.observation_media (
      observation_id,
      user_id,
      storage_path,
      media_type
    )
    values (
      '50000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000002/mismatched-owner.jpg',
      'image'
    )
  $$,
  '23503',
  'insert or update on table "observation_media" violates foreign key constraint "observation_media_observation_id_user_id_fkey"',
  'media ownership must match observation ownership'
);

select * from finish();
rollback;
