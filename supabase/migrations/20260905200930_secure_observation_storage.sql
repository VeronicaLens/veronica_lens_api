-- Observation files are private and namespaced by the authenticated user's UUID:
-- <user_id>/<observation_id>/<file_name>.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'observations',
  'observations',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.observation_media
add constraint observation_media_storage_path_owner_check
check (storage_path like user_id::text || '/%') not valid;

alter table public.observation_media
validate constraint observation_media_storage_path_owner_check;

create policy "Users read their observation files and admins read all files"
on storage.objects for select to authenticated
using (
  bucket_id = 'observations'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.is_admin())
  )
);

create policy "Users upload their observation files and admins upload all files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'observations'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.is_admin())
  )
);

create policy "Users update their observation files and admins update all files"
on storage.objects for update to authenticated
using (
  bucket_id = 'observations'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.is_admin())
  )
)
with check (
  bucket_id = 'observations'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.is_admin())
  )
);

create policy "Users delete their observation files and admins delete all files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'observations'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.is_admin())
  )
);

comment on constraint observation_media_storage_path_owner_check
on public.observation_media is
  'Requires media paths to start with the owning user UUID used by Storage RLS.';
