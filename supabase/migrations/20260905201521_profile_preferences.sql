create type public.measurement_unit as enum ('metric', 'imperial');
create type public.app_language as enum ('pt-BR', 'en');

alter table public.profiles
add column location_name text,
add column latitude numeric(8, 5),
add column longitude numeric(8, 5),
add column notifications_enabled boolean not null default true,
add column measurement_unit public.measurement_unit not null default 'metric',
add column language public.app_language not null default 'pt-BR',
add constraint profiles_location_name_length_check
  check (location_name is null or char_length(location_name) between 1 and 120),
add constraint profiles_latitude_check
  check (latitude is null or latitude between -90 and 90),
add constraint profiles_longitude_check
  check (longitude is null or longitude between -180 and 180),
add constraint profiles_location_coordinates_pair_check
  check ((latitude is null) = (longitude is null));

grant usage on type public.measurement_unit to authenticated;
grant usage on type public.app_language to authenticated;

comment on column public.profiles.location_name is
  'User-provided label for the observing location; coordinates remain optional.';
