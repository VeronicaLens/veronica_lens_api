begin;
select plan(24);

select is(
  (select public from storage.buckets where id = 'observations'),
  false,
  'observations bucket is private'
);

select is(
  (select file_size_limit from storage.buckets where id = 'observations'),
  52428800::bigint,
  'observations bucket limits files to 50 MiB'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'Users % their observation files%'
  ),
  4,
  'observation files have policies for every operation'
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
    '61000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'rls-user-one@example.test',
    '',
    '{"role":"user"}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '61000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'rls-user-two@example.test',
    '',
    '{"role":"user"}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.observations (id, user_id, title, observed_at)
values
  (
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    'Private observation one',
    now()
  ),
  (
    '62000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000002',
    'Private observation two',
    now()
  );

insert into public.event_preferences (user_id, event_type)
values
  ('61000000-0000-4000-8000-000000000001', 'eclipse'),
  ('61000000-0000-4000-8000-000000000002', 'meteor_shower');

insert into public.user_learning_progress (user_id, lesson_id, status, progress_percent)
values
  (
    '61000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'in_progress',
    25
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'in_progress',
    50
  );

insert into public.device_push_tokens (user_id, token, platform)
values
  ('61000000-0000-4000-8000-000000000001', 'rls-token-one', 'android'),
  ('61000000-0000-4000-8000-000000000002', 'rls-token-two', 'ios');

insert into public.observation_media (
  observation_id,
  user_id,
  storage_path,
  media_type
)
values
  (
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/62000000-0000-4000-8000-000000000001/photo.jpg',
    'image'
  ),
  (
    '62000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000002/62000000-0000-4000-8000-000000000002/photo.jpg',
    'image'
  );

insert into storage.objects (bucket_id, name)
values
  (
    'observations',
    '61000000-0000-4000-8000-000000000001/62000000-0000-4000-8000-000000000001/photo.jpg'
  ),
  (
    'observations',
    '61000000-0000-4000-8000-000000000002/62000000-0000-4000-8000-000000000002/photo.jpg'
  );

set local "request.jwt.claims" =
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"user"}}';
set local role authenticated;

select is((select count(*) from public.profiles), 1::bigint, 'user reads only their profile');
select is((select count(*) from public.observations), 1::bigint, 'user reads only their observations');
select is((select count(*) from public.observation_media), 1::bigint, 'user reads only their media');
select is((select count(*) from public.user_learning_progress), 1::bigint, 'user reads only their progress');
select is((select count(*) from public.event_preferences), 1::bigint, 'user reads only their preferences');
select is((select count(*) from public.device_push_tokens), 1::bigint, 'user reads only their device tokens');
select is(
  (select count(*) from storage.objects where bucket_id = 'observations'),
  1::bigint,
  'user reads only files in their storage namespace'
);

select is_empty(
  $$
    update public.observations
    set title = 'Forbidden update'
    where user_id = '61000000-0000-4000-8000-000000000002'
    returning 1
  $$,
  'user cannot update another user observation'
);

select is_empty(
  $$
    delete from public.event_preferences
    where user_id = '61000000-0000-4000-8000-000000000002'
    returning 1
  $$,
  'user cannot delete another user preference'
);

select throws_ok(
  $$
    insert into public.device_push_tokens (user_id, token, platform)
    values ('61000000-0000-4000-8000-000000000002', 'forbidden-token', 'android')
  $$,
  '42501',
  'new row violates row-level security policy for table "device_push_tokens"',
  'user cannot create a device token for another user'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values (
      'observations',
      '61000000-0000-4000-8000-000000000002/62000000-0000-4000-8000-000000000002/forbidden.jpg'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'user cannot upload into another user storage namespace'
);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values (
      'observations',
      '61000000-0000-4000-8000-000000000001/62000000-0000-4000-8000-000000000001/allowed.jpg'
    )
  $$,
  'user can upload into their storage namespace'
);

select throws_ok(
  $$
    update storage.objects
    set name = '61000000-0000-4000-8000-000000000002/forbidden-move.jpg'
    where name = '61000000-0000-4000-8000-000000000001/62000000-0000-4000-8000-000000000001/allowed.jpg'
  $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'user cannot move a file into another user namespace'
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
      '62000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000002/wrong-owner.jpg',
      'image'
    )
  $$,
  '23514',
  null,
  'media path must start with its owner UUID'
);

set local "request.jwt.claims" =
  '{"sub":"61000000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}';
set local role authenticated;

select is((select count(*) from public.profiles), 2::bigint, 'admin reads all profiles');
select is((select count(*) from public.observations), 2::bigint, 'admin reads all observations');
select is((select count(*) from public.observation_media), 2::bigint, 'admin reads all media');
select is((select count(*) from public.user_learning_progress), 2::bigint, 'admin reads all progress');
select is((select count(*) from public.event_preferences), 2::bigint, 'admin reads all preferences');
select is((select count(*) from public.device_push_tokens), 2::bigint, 'admin reads all device tokens');
select is(
  (select count(*) from storage.objects where bucket_id = 'observations'),
  3::bigint,
  'admin reads all observation files'
);

select * from finish();
rollback;
