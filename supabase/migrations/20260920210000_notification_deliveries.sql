create type public.notification_delivery_status as enum ('pending', 'sent', 'failed');

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  astronomical_event_id uuid not null references public.astronomical_events (id) on delete cascade,
  device_push_token_id uuid not null references public.device_push_tokens (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.notification_delivery_status not null default 'pending',
  provider_ticket_id text,
  error_code text,
  error_message text,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (astronomical_event_id, device_push_token_id),
  check (provider_ticket_id is null or char_length(provider_ticket_id) between 1 and 200),
  check (error_code is null or char_length(error_code) between 1 and 100),
  check (error_message is null or char_length(error_message) between 1 and 500),
  check (
    (status = 'pending' and delivered_at is null and failed_at is null)
    or (status = 'sent' and delivered_at is not null and failed_at is null)
    or (status = 'failed' and delivered_at is null and failed_at is not null)
  )
);

create index notification_deliveries_user_id_created_at_idx
on public.notification_deliveries (user_id, created_at desc);

create trigger notification_deliveries_set_updated_at
before update on public.notification_deliveries
for each row execute function private.set_updated_at();

alter table public.notification_deliveries enable row level security;

revoke all on table public.notification_deliveries from anon, authenticated;
grant select, insert, update on table public.notification_deliveries to service_role;

comment on table public.notification_deliveries is
  'Server-only push delivery ledger. The event/device uniqueness constraint prevents duplicate sends.';