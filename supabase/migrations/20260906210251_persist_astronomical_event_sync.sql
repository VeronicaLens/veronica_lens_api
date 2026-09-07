alter table public.astronomical_events
add column provider text not null default 'manual',
add column provider_event_key text,
add column celestial_object_id text,
add column observer_latitude numeric(6, 3),
add column observer_longitude numeric(7, 3),
add column observer_elevation_meters integer,
add column peaks_at timestamptz,
add column synced_at timestamptz;

alter table public.astronomical_events
add constraint astronomical_events_provider_length_check
check (char_length(provider) between 1 and 80),
add constraint astronomical_events_provider_event_key_length_check
check (provider_event_key is null or char_length(provider_event_key) between 1 and 300),
add constraint astronomical_events_observer_coordinates_check
check (
  (
    observer_latitude is null
    and observer_longitude is null
    and observer_elevation_meters is null
  )
  or (
    observer_latitude between -90 and 90
    and observer_longitude between -180 and 180
    and observer_elevation_meters between -500 and 10000
  )
),
add constraint astronomical_events_synchronized_shape_check
check (
  provider = 'manual'
  or (
    provider_event_key is not null
    and celestial_object_id is not null
    and observer_latitude is not null
    and observer_longitude is not null
    and observer_elevation_meters is not null
    and synced_at is not null
  )
),
add constraint astronomical_events_provider_event_key_unique
unique (provider, provider_event_key);

create index astronomical_events_provider_observer_starts_at_idx
on public.astronomical_events (
  provider,
  observer_latitude,
  observer_longitude,
  observer_elevation_meters,
  starts_at
)
where provider_event_key is not null;

create table public.astronomical_event_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (char_length(provider) between 1 and 80),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  covered_from timestamptz not null,
  covered_to timestamptz not null,
  observer_latitude numeric(6, 3) not null check (observer_latitude between -90 and 90),
  observer_longitude numeric(7, 3) not null check (observer_longitude between -180 and 180),
  observer_elevation_meters integer not null
    check (observer_elevation_meters between -500 and 10000),
  event_count integer not null default 0 check (event_count >= 0),
  error_code text check (error_code is null or char_length(error_code) between 1 and 100),
  error_message text check (error_message is null or char_length(error_message) between 1 and 500),
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  check (covered_to > covered_from),
  check (
    (status = 'running' and completed_at is null)
    or (status <> 'running' and completed_at is not null)
  )
);

create index astronomical_event_sync_runs_cache_lookup_idx
on public.astronomical_event_sync_runs (
  provider,
  observer_latitude,
  observer_longitude,
  observer_elevation_meters,
  status,
  completed_at desc
);

alter table public.astronomical_event_sync_runs enable row level security;

revoke all on table public.astronomical_event_sync_runs from anon, authenticated;
grant select, insert, update on table public.astronomical_event_sync_runs to service_role;

comment on table public.astronomical_event_sync_runs is
'Server-only audit log for astronomical event synchronization attempts.';
