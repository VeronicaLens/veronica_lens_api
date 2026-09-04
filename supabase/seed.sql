-- Development and test data only.
-- Schema changes belong in timestamped files under supabase/migrations.
-- Never copy production data, personal data, credentials, or secrets into this file.

insert into public.learning_tracks (id, slug, title, description, published, sort_order)
values (
  '10000000-0000-4000-8000-000000000001',
  'fundamentos-de-astronomia',
  'Fundamentos de astronomia',
  'Trilha introdutória usada no ambiente local.',
  true,
  10
)
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  published = excluded.published,
  sort_order = excluded.sort_order;

insert into public.lessons (
  id,
  track_id,
  slug,
  title,
  content,
  published,
  sort_order
)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'orientacao-no-ceu',
  'Orientação no céu',
  'Conteúdo demonstrativo para validar trilhas e progresso localmente.',
  true,
  10
)
on conflict (id) do update
set
  title = excluded.title,
  content = excluded.content,
  published = excluded.published,
  sort_order = excluded.sort_order;

insert into public.astronomical_events (
  id,
  slug,
  title,
  description,
  event_type,
  starts_at,
  ends_at,
  published
)
values (
  '30000000-0000-4000-8000-000000000001',
  'evento-local-de-demonstracao',
  'Evento local de demonstração',
  'Registro fictício para desenvolvimento e testes; não representa uma previsão astronômica.',
  'demo',
  '2030-01-01 21:00:00+00',
  '2030-01-01 23:00:00+00',
  true
)
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  event_type = excluded.event_type,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  published = excluded.published;
