begin;
select plan(12);

select has_table(
  'public',
  'astronomical_event_sync_runs',
  'astronomical event synchronization runs are persisted'
);
select has_column('public', 'astronomical_events', 'provider', 'events identify their provider');
select has_column(
  'public',
  'astronomical_events',
  'provider_event_key',
  'events have a stable provider key'
);
select has_column('public', 'astronomical_events', 'synced_at', 'events expose cache update time');
select has_index(
  'public',
  'astronomical_events',
  'astronomical_events_provider_observer_starts_at_idx',
  'event cache lookup has a composite index'
);
select has_index(
  'public',
  'astronomical_event_sync_runs',
  'astronomical_event_sync_runs_cache_lookup_idx',
  'successful synchronization lookup has a composite index'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.astronomical_event_sync_runs'::regclass),
  true,
  'synchronization audit table has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.astronomical_event_sync_runs', 'select')
    and not has_table_privilege('authenticated', 'public.astronomical_event_sync_runs', 'select'),
  'client roles cannot read synchronization audit data'
);
select ok(
  has_table_privilege('service_role', 'public.astronomical_event_sync_runs', 'select')
    and has_table_privilege('service_role', 'public.astronomical_event_sync_runs', 'insert')
    and has_table_privilege('service_role', 'public.astronomical_event_sync_runs', 'update')
    and not has_table_privilege('service_role', 'public.astronomical_event_sync_runs', 'delete'),
  'server job receives least-privilege synchronization grants'
);

insert into public.astronomical_events (
  slug,
  provider,
  provider_event_key,
  celestial_object_id,
  title,
  description,
  event_type,
  starts_at,
  observer_latitude,
  observer_longitude,
  observer_elevation_meters,
  published,
  synced_at
)
values (
  'jpl-test-stable-event',
  'jpl-horizons',
  'jpl-horizons:moon:rise:2030-01-01T08:00:00.000Z:-23.550:-46.633:760',
  'moon',
  'Nascer da Lua',
  'First version',
  'rise',
  '2030-01-01 08:00:00+00',
  -23.550,
  -46.633,
  760,
  true,
  '2026-10-04 01:00:00+00'
)
on conflict (provider, provider_event_key) do update
set description = excluded.description, synced_at = excluded.synced_at;

insert into public.astronomical_events (
  slug,
  provider,
  provider_event_key,
  celestial_object_id,
  title,
  description,
  event_type,
  starts_at,
  observer_latitude,
  observer_longitude,
  observer_elevation_meters,
  published,
  synced_at
)
values (
  'jpl-test-stable-event',
  'jpl-horizons',
  'jpl-horizons:moon:rise:2030-01-01T08:00:00.000Z:-23.550:-46.633:760',
  'moon',
  'Nascer da Lua',
  'Updated version',
  'rise',
  '2030-01-01 08:00:00+00',
  -23.550,
  -46.633,
  760,
  true,
  '2026-10-04 02:00:00+00'
)
on conflict (provider, provider_event_key) do update
set description = excluded.description, synced_at = excluded.synced_at;

select is(
  (
    select count(*)::integer
    from public.astronomical_events
    where provider_event_key =
      'jpl-horizons:moon:rise:2030-01-01T08:00:00.000Z:-23.550:-46.633:760'
  ),
  1,
  'stable provider key prevents duplicate events'
);
select is(
  (
    select description
    from public.astronomical_events
    where provider_event_key =
      'jpl-horizons:moon:rise:2030-01-01T08:00:00.000Z:-23.550:-46.633:760'
  ),
  'Updated version',
  'upsert refreshes the existing event'
);

insert into public.astronomical_event_sync_runs (
  provider,
  status,
  covered_from,
  covered_to,
  observer_latitude,
  observer_longitude,
  observer_elevation_meters,
  error_code,
  error_message,
  completed_at
)
values (
  'jpl-horizons',
  'failed',
  '2030-01-01 00:00:00+00',
  '2030-02-01 00:00:00+00',
  -23.550,
  -46.633,
  760,
  'UNAVAILABLE',
  'Provider unavailable',
  '2026-10-04 03:00:00+00'
);

select is(
  (
    select count(*)::integer
    from public.astronomical_events
    where provider_event_key =
      'jpl-horizons:moon:rise:2030-01-01T08:00:00.000Z:-23.550:-46.633:760'
  ),
  1,
  'failed synchronization does not delete the last valid event'
);

select * from finish();
rollback;
