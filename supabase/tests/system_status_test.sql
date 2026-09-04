begin;
select plan(9);

select has_table('public', 'system_status', 'system_status table exists');
select col_is_pk('public', 'system_status', 'id', 'id is the primary key');
select is(
  (select status from public.system_status where id = 'supabase'),
  'available',
  'the technical availability row is seeded by the migration'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.system_status'::regclass),
  'row level security is enabled'
);
select ok(
  has_table_privilege('anon', 'public.system_status', 'select'),
  'anonymous clients can read technical availability'
);
select ok(
  not has_table_privilege('anon', 'public.system_status', 'insert')
    and not has_table_privilege('anon', 'public.system_status', 'update')
    and not has_table_privilege('anon', 'public.system_status', 'delete'),
  'anonymous clients cannot write technical availability'
);
select ok(
  has_table_privilege('authenticated', 'public.system_status', 'select'),
  'authenticated clients can read technical availability'
);
select ok(
  not has_table_privilege('authenticated', 'public.system_status', 'insert')
    and not has_table_privilege('authenticated', 'public.system_status', 'update')
    and not has_table_privilege('authenticated', 'public.system_status', 'delete'),
  'authenticated clients cannot write technical availability'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'system_status'
      and cmd = 'SELECT'
      and roles @> array['anon'::name, 'authenticated'::name]
  ),
  1,
  'one read policy covers anon and authenticated roles'
);

select * from finish();
rollback;
