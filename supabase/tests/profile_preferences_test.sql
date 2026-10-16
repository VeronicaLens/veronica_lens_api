begin;
select plan(8);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '71000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'profile-one@example.test', '',
    '{"role":"user"}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '71000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'profile-two@example.test', '',
    '{"role":"user"}'::jsonb, '{}'::jsonb, now(), now()
  );

set local "request.jwt.claims" =
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"user"}}';
set local role authenticated;

select is((select count(*) from public.profiles), 1::bigint, 'user sees only their profile');

select lives_ok(
  $$
    update public.profiles
    set display_name = 'Updated User',
        location_name = 'São Paulo',
        latitude = -23.55052,
        longitude = -46.63331,
        notifications_enabled = false,
        measurement_unit = 'metric',
        language = 'pt-BR'
    where id = '71000000-0000-4000-8000-000000000001'
  $$,
  'user updates their profile preferences'
);

select is(
  (select location_name from public.profiles),
  'São Paulo',
  'location is persisted'
);
select is(
  (select notifications_enabled from public.profiles),
  false,
  'notification preference is persisted'
);
select is(
  (select measurement_unit::text || ':' || language::text from public.profiles),
  'metric:pt-BR',
  'unit and language preferences are persisted'
);

select is_empty(
  $$
    update public.profiles
    set display_name = 'Forbidden'
    where id = '71000000-0000-4000-8000-000000000002'
    returning 1
  $$,
  'user cannot update another profile'
);

reset role;
set local "request.jwt.claims" =
  '{"sub":"71000000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}';
set local role authenticated;

select is((select count(*) from public.profiles), 2::bigint, 'admin sees all profiles');
select is(
  (select display_name from public.profiles where id = '71000000-0000-4000-8000-000000000002'),
  null,
  'blocked update did not change the other profile'
);

select * from finish();
rollback;
