begin;
select plan(3);

select has_table('public', 'notification_deliveries', 'notification delivery ledger exists');
select has_column(
  'public',
  'notification_deliveries',
  'status',
  'notification delivery status is persisted'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notification_deliveries'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%(astronomical_event_id, device_push_token_id)%'
  ),
  'an event can be delivered only once per device'
);

select * from finish();
rollback;