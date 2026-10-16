create schema if not exists private;
revoke all on schema private from public;

create type public.app_role as enum ('user', 'admin');
create type public.learning_progress_status as enum ('not_started', 'in_progress', 'completed');
create type public.observation_media_type as enum ('image', 'video');
create type public.device_platform as enum ('android', 'ios');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 100),
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default timezone('utc', now())
);

create table public.learning_tracks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  published boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.learning_tracks (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 160),
  content text not null default '',
  published boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (track_id, slug),
  unique (track_id, sort_order)
);

create table public.user_learning_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  status public.learning_progress_status not null default 'not_started',
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, lesson_id),
  check (
    (status = 'completed' and progress_percent = 100 and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create table public.astronomical_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  event_type text not null check (char_length(event_type) between 1 and 80),
  celestial_object_name text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at is null or ends_at >= starts_at)
);

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  astronomical_event_id uuid references public.astronomical_events (id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  notes text not null default '',
  celestial_object_name text,
  observed_at timestamptz not null,
  latitude numeric(8, 5) check (latitude is null or latitude between -90 and 90),
  longitude numeric(8, 5) check (longitude is null or longitude between -180 and 180),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, user_id)
);

create table public.observation_media (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 1 and 1024),
  media_type public.observation_media_type not null,
  captured_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (observation_id, user_id)
    references public.observations (id, user_id)
    on delete cascade
);

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique check (char_length(token) between 1 and 512),
  platform public.device_platform not null,
  active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.event_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 80),
  enabled boolean not null default true,
  lead_minutes integer not null default 60 check (lead_minutes between 0 and 43200),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, event_type)
);

create index lessons_track_id_idx on public.lessons (track_id);
create index user_learning_progress_user_id_idx on public.user_learning_progress (user_id);
create index user_learning_progress_lesson_id_idx on public.user_learning_progress (lesson_id);
create index astronomical_events_starts_at_idx on public.astronomical_events (starts_at);
create index astronomical_events_published_starts_at_idx
  on public.astronomical_events (published, starts_at);
create index observations_user_id_observed_at_idx
  on public.observations (user_id, observed_at desc);
create index observations_astronomical_event_id_idx
  on public.observations (astronomical_event_id);
create index observation_media_observation_id_user_id_idx
  on public.observation_media (observation_id, user_id);
create index observation_media_user_id_idx on public.observation_media (user_id);
create index device_push_tokens_user_id_active_idx
  on public.device_push_tokens (user_id, active);
create index event_preferences_user_id_idx on public.event_preferences (user_id);

create function private.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.uid() <> new.id then
    raise exception 'Cannot provision a different user';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''));

  insert into public.user_roles (user_id, role)
  values (new.id, 'user');

  return new;
end;
$$;

revoke all on function private.is_admin() from public;
revoke all on function private.set_updated_at() from public;
revoke all on function private.handle_new_user() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();
create trigger learning_tracks_set_updated_at
before update on public.learning_tracks
for each row execute function private.set_updated_at();
create trigger lessons_set_updated_at
before update on public.lessons
for each row execute function private.set_updated_at();
create trigger user_learning_progress_set_updated_at
before update on public.user_learning_progress
for each row execute function private.set_updated_at();
create trigger astronomical_events_set_updated_at
before update on public.astronomical_events
for each row execute function private.set_updated_at();
create trigger observations_set_updated_at
before update on public.observations
for each row execute function private.set_updated_at();
create trigger device_push_tokens_set_updated_at
before update on public.device_push_tokens
for each row execute function private.set_updated_at();
create trigger event_preferences_set_updated_at
before update on public.event_preferences
for each row execute function private.set_updated_at();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.learning_tracks enable row level security;
alter table public.lessons enable row level security;
alter table public.user_learning_progress enable row level security;
alter table public.astronomical_events enable row level security;
alter table public.observations enable row level security;
alter table public.observation_media enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.event_preferences enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.user_roles from anon, authenticated;
revoke all on table public.learning_tracks from anon, authenticated;
revoke all on table public.lessons from anon, authenticated;
revoke all on table public.user_learning_progress from anon, authenticated;
revoke all on table public.astronomical_events from anon, authenticated;
revoke all on table public.observations from anon, authenticated;
revoke all on table public.observation_media from anon, authenticated;
revoke all on table public.device_push_tokens from anon, authenticated;
revoke all on table public.event_preferences from anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.user_roles to authenticated;
grant select, insert, update, delete on table public.learning_tracks to authenticated;
grant select, insert, update, delete on table public.lessons to authenticated;
grant select, insert, update, delete on table public.user_learning_progress to authenticated;
grant select, insert, update, delete on table public.astronomical_events to authenticated;
grant select, insert, update, delete on table public.observations to authenticated;
grant select, insert, update, delete on table public.observation_media to authenticated;
grant select, insert, update, delete on table public.device_push_tokens to authenticated;
grant select, insert, update, delete on table public.event_preferences to authenticated;

grant usage on type public.app_role to authenticated;
grant usage on type public.learning_progress_status to authenticated;
grant usage on type public.observation_media_type to authenticated;
grant usage on type public.device_platform to authenticated;

create policy "Users read their profile and admins read all profiles"
on public.profiles for select to authenticated
using ((select auth.uid()) = id or (select private.is_admin()));
create policy "Users insert their own profile"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id or (select private.is_admin()));
create policy "Users update their profile and admins update all profiles"
on public.profiles for update to authenticated
using ((select auth.uid()) = id or (select private.is_admin()))
with check ((select auth.uid()) = id or (select private.is_admin()));
create policy "Admins delete profiles"
on public.profiles for delete to authenticated
using ((select private.is_admin()));

create policy "Users read their role and admins read all roles"
on public.user_roles for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Admins insert roles"
on public.user_roles for insert to authenticated
with check ((select private.is_admin()));
create policy "Admins update roles"
on public.user_roles for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Admins delete roles"
on public.user_roles for delete to authenticated
using ((select private.is_admin()));

create policy "Users read published tracks and admins read all tracks"
on public.learning_tracks for select to authenticated
using (published or (select private.is_admin()));
create policy "Admins insert tracks"
on public.learning_tracks for insert to authenticated
with check ((select private.is_admin()));
create policy "Admins update tracks"
on public.learning_tracks for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Admins delete tracks"
on public.learning_tracks for delete to authenticated
using ((select private.is_admin()));

create policy "Users read published lessons and admins read all lessons"
on public.lessons for select to authenticated
using (published or (select private.is_admin()));
create policy "Admins insert lessons"
on public.lessons for insert to authenticated
with check ((select private.is_admin()));
create policy "Admins update lessons"
on public.lessons for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Admins delete lessons"
on public.lessons for delete to authenticated
using ((select private.is_admin()));

create policy "Users read their progress and admins read all progress"
on public.user_learning_progress for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users insert their progress and admins insert all progress"
on public.user_learning_progress for insert to authenticated
with check ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users update their progress and admins update all progress"
on public.user_learning_progress for update to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()))
with check ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users delete their progress and admins delete all progress"
on public.user_learning_progress for delete to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "Users read published events and admins read all events"
on public.astronomical_events for select to authenticated
using (published or (select private.is_admin()));
create policy "Admins insert events"
on public.astronomical_events for insert to authenticated
with check ((select private.is_admin()));
create policy "Admins update events"
on public.astronomical_events for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Admins delete events"
on public.astronomical_events for delete to authenticated
using ((select private.is_admin()));

create policy "Users read their observations and admins read all observations"
on public.observations for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users insert their observations and admins insert all observations"
on public.observations for insert to authenticated
with check ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users update their observations and admins update all observations"
on public.observations for update to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()))
with check ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users delete their observations and admins delete all observations"
on public.observations for delete to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "Users read their media and admins read all media"
on public.observation_media for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users insert their media and admins insert all media"
on public.observation_media for insert to authenticated
with check ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users update their media and admins update all media"
on public.observation_media for update to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()))
with check ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users delete their media and admins delete all media"
on public.observation_media for delete to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "Users read their device tokens and admins read all tokens"
on public.device_push_tokens for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users insert their device tokens and admins insert all tokens"
on public.device_push_tokens for insert to authenticated
with check ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users update their device tokens and admins update all tokens"
on public.device_push_tokens for update to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()))
with check ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users delete their device tokens and admins delete all tokens"
on public.device_push_tokens for delete to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "Users read their event preferences and admins read all preferences"
on public.event_preferences for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users insert their event preferences and admins insert all preferences"
on public.event_preferences for insert to authenticated
with check ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users update their event preferences and admins update all preferences"
on public.event_preferences for update to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()))
with check ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "Users delete their event preferences and admins delete all preferences"
on public.event_preferences for delete to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
