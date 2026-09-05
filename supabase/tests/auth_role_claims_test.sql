begin;
select plan(5);

select has_function('private', 'sync_auth_role_claim', 'role claim sync function exists');
select ok(
  not has_function_privilege('anon', 'private.sync_auth_role_claim()', 'execute')
    and not has_function_privilege('authenticated', 'private.sync_auth_role_claim()', 'execute'),
  'role claim sync function is not directly executable by API roles'
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
values (
  '00000000-0000-0000-0000-000000000000',
  '70000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'role-claim@example.test',
  '',
  '{"role":"admin"}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

select is(
  (select role::text from public.user_roles where user_id = '70000000-0000-4000-8000-000000000001'),
  'user',
  'new accounts always receive the user database role'
);
select is(
  (select raw_app_meta_data ->> 'role' from auth.users where id = '70000000-0000-4000-8000-000000000001'),
  'user',
  'new account JWT claims use the trusted database role'
);

update public.user_roles
set role = 'admin'
where user_id = '70000000-0000-4000-8000-000000000001';

select is(
  (select raw_app_meta_data ->> 'role' from auth.users where id = '70000000-0000-4000-8000-000000000001'),
  'admin',
  'role changes are synchronized to Auth app metadata'
);

select * from finish();
rollback;
