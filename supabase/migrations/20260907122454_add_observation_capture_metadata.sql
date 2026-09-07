alter table public.observation_media
add column capture_metadata jsonb not null default '{}'::jsonb;

alter table public.observation_media
add constraint observation_media_capture_metadata_object_check
check (jsonb_typeof(capture_metadata) = 'object');

comment on column public.observation_media.capture_metadata is
  'Camera device and applied capture parameters recorded by the mobile client.';
