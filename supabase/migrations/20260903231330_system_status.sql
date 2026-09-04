create table public.system_status (
  id text primary key,
  status text not null check (status in ('available', 'maintenance')),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint system_status_singleton check (id = 'supabase')
);

alter table public.system_status enable row level security;

revoke all on table public.system_status from anon, authenticated;
grant select on table public.system_status to anon, authenticated;

create policy "Public clients can read Supabase availability"
on public.system_status
for select
to anon, authenticated
using (id = 'supabase');

insert into public.system_status (id, status)
values ('supabase', 'available');
