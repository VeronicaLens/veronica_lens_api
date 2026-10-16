begin;
select plan(2);

select has_column(
  'public',
  'observation_media',
  'capture_metadata',
  'observation media stores camera capture metadata'
);

select col_default_is(
  'public',
  'observation_media',
  'capture_metadata',
  '{}'::jsonb,
  'capture metadata has a safe empty object default'
);

select * from finish();
rollback;
