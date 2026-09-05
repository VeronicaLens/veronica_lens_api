-- Keep authorization claims aligned with the database role source of truth.
-- This migration is intentionally separate from the immutable initial schema migration.

create function private.sync_auth_role_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', new.role::text)
  where id = new.user_id;

  return new;
end;
$$;

revoke all on function private.sync_auth_role_claim() from public;

create trigger user_roles_sync_auth_claim
after insert or update of role on public.user_roles
for each row execute function private.sync_auth_role_claim();

-- Backfill accounts created before role-claim synchronization existed.
update auth.users as users
set raw_app_meta_data = coalesce(users.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', roles.role::text)
from public.user_roles as roles
where users.id = roles.user_id;

comment on function private.sync_auth_role_claim() is
  'Synchronizes the trusted user_roles value into Auth app_metadata for JWT authorization.';
