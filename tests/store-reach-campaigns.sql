-- Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md): reach-05 "Campañas Laria".
-- Covers the price history, the checked reference (lowest of 30 days, no raise inside them, minimum discount), the
-- store's entries, the job that starts and ends them (restoring prices on request, leaving on a price change), Admin's
-- controls and what the public reads. Local/test database only; rolled back.
begin;

create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_code in sqlerrm) = 1 then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"e1000000-0000-4000-8000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}', true);
$$;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e7430000-0000-4000-8000-0000000000a1','authenticated','authenticated','reach-camp-owner@example.invalid',now(),'{}','{"account_type":"store_owner"}'),
 ('e7430000-0000-4000-8000-0000000000a2','authenticated','authenticated','reach-camp-other@example.invalid',now(),'{}','{"account_type":"store_owner"}'),
 ('e1000000-0000-4000-8000-000000000099','authenticated','authenticated','reach-camp-admin@example.invalid',now(),'{"role":"admin"}','{}')
on conflict (id) do nothing;
insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e7430000-0000-4000-8000-000000000001','reach-camp-tienda','Tienda Campañas','Campañas SAC','20999993001','cam@example.invalid','Contacto','Contacto','51999993001','Lima','Lima','Av. 1','e7430000-0000-4000-8000-0000000000a1','active','free',true),
 ('e7430000-0000-4000-8000-000000000002','reach-camp-otra','Otra Tienda','Otra SAC','20999993002','otr@example.invalid','Contacto','Contacto','51999993002','Lima','Lima','Av. 2','e7430000-0000-4000-8000-0000000000a2','active','free',true);

-- 01 steady at 1000 for 60 days; 02 raised from 900 to 1000 ten days ago; 03 published 5 days ago; 04 out of stock;
-- 05 dropped from 1000 to 950 twelve days ago; 06 steady at 2000 (its store will change the price before the start).
insert into public.listings (id, slug, title, seller_type, status, category, brand, model, condition, city, region, whatsapp_phone, owner_user_id, store_id, price_pen)
select ('e7430000-0000-4000-8000-0000000001' || n)::uuid, 'reach-camp-' || n, 'Instrumento ' || n, 'store', 'approved', 'keyboards',
  'Yamaha', 'M' || n, 'Nuevo', 'Lima', 'Lima', '51999993001', 'e7430000-0000-4000-8000-0000000000a1', 'e7430000-0000-4000-8000-000000000001',
  case n when '05' then 950 when '06' then 2000 else 1000 end
from unnest(array['01', '02', '03', '04', '05', '06']) n;

select pg_temp.check((select count(*) from public.listing_price_history h join public.listings l on l.id = h.listing_id
  where l.slug like 'reach-camp-%' and h.valid_to is null and h.source = 'created') = 6, 'a new publication starts its history');

select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set published_at = now() - interval '60 days' where slug like 'reach-camp-%' and slug <> 'reach-camp-03';
update public.listings set published_at = now() - interval '5 days' where slug = 'reach-camp-03';
update public.listings set stock_state = 'out_of_stock' where slug = 'reach-camp-04';
select set_config('app.allow_listing_admin_fields', '', true);
update public.listing_price_history h set valid_from = now() - interval '60 days'
from public.listings l where l.id = h.listing_id and l.slug in ('reach-camp-01', 'reach-camp-04', 'reach-camp-06');
update public.listing_price_history h set valid_from = now() - interval '5 days'
from public.listings l where l.id = h.listing_id and l.slug = 'reach-camp-03';
delete from public.listing_price_history h using public.listings l where l.id = h.listing_id and l.slug in ('reach-camp-02', 'reach-camp-05');
insert into public.listing_price_history (listing_id, price_pen, valid_from, valid_to, source) values
 ('e7430000-0000-4000-8000-000000000102', 900, now() - interval '60 days', now() - interval '10 days', 'change'),
 ('e7430000-0000-4000-8000-000000000102', 1000, now() - interval '10 days', null, 'change'),
 ('e7430000-0000-4000-8000-000000000105', 1000, now() - interval '60 days', now() - interval '12 days', 'change'),
 ('e7430000-0000-4000-8000-000000000105', 950, now() - interval '12 days', null, 'change');

create temp table camp_ids (name text primary key, id uuid, revision integer);
grant all on camp_ids to authenticated;

set local role authenticated;

-- ------------------------------------------------------------------ Admin creates and publishes

select pg_temp.as_user('e7430000-0000-4000-8000-0000000000a1');
select pg_temp.expect_error($$select public.admin_get_campaigns()$$, 'ADMIN_REQUIRED');
select pg_temp.expect_error($$select public.admin_save_campaign(null, 'navidad', 'Navidad', '', now() + interval '1 day', now() + interval '5 days', 10)$$, 'ADMIN_REQUIRED');
select pg_temp.expect_error($$select * from public.laria_campaigns$$, 'permission denied');
select pg_temp.expect_error($$select * from public.listing_price_history$$, 'permission denied');

select pg_temp.as_admin();
select pg_temp.expect_error($$select public.admin_save_campaign(null, 'Navidad 2026', 'Navidad', '', now() + interval '1 day', now() + interval '5 days', 10)$$, 'CAMPAIGN_SLUG_INVALID');
select pg_temp.expect_error($$select public.admin_save_campaign(null, 'navidad-2026', 'Navidad', '', now() + interval '1 day', now() + interval '40 days', 10)$$, 'CAMPAIGN_DATES_INVALID');
select pg_temp.expect_error($$select public.admin_save_campaign(null, 'navidad-2026', 'Navidad', '', now() + interval '1 day', now() + interval '5 days', 2)$$, 'CAMPAIGN_DISCOUNT_INVALID');
do $$ declare created jsonb; published jsonb; begin
  created := public.admin_save_campaign(null, 'navidad-2026', 'Navidad 2026', 'Instrumentos para regalar.', now() + interval '1 day', now() + interval '8 days', 10);
  perform pg_temp.check(created->>'status' = 'draft' and created->>'phase' = 'draft', 'created as a draft');
  perform pg_temp.expect_error($q$select public.admin_save_campaign(null, 'navidad-2026', 'Otra', '', now() + interval '1 day', now() + interval '5 days', 10)$q$, 'CAMPAIGN_SLUG_TAKEN');
  perform pg_temp.expect_error(format('select public.admin_set_campaign_status(%L, %L, 99)', created->>'id', 'published'), 'CAMPAIGN_STALE');
  published := public.admin_set_campaign_status((created->>'id')::uuid, 'published', (created->>'revision')::integer);
  perform pg_temp.check(published->>'phase' = 'upcoming', 'published and upcoming');
  insert into camp_ids values ('navidad', (published->>'id')::uuid, (published->>'revision')::integer);
end $$;

-- ------------------------------------------------------------------ the store opts in

select pg_temp.as_user('e7430000-0000-4000-8000-0000000000a1');
do $$ declare options jsonb; opt jsonb; begin
  options := public.get_campaign_listing_options((select id from camp_ids where name = 'navidad'));
  select o into opt from jsonb_array_elements(options->'listings') o where o->>'slug' = 'reach-camp-01';
  perform pg_temp.check(opt->>'problem_code' is null and (opt->>'reference_price_pen')::integer = 1000 and (opt->>'max_campaign_price_pen')::integer = 900,
    format('01 can join with reference 1000 and at most 900: %s', opt));
  select o into opt from jsonb_array_elements(options->'listings') o where o->>'slug' = 'reach-camp-02';
  perform pg_temp.check(opt->>'problem_code' = 'CAMPAIGN_PRICE_RAISED' and (opt->>'reference_price_pen')::integer = 900, '02 raised its price');
  select o into opt from jsonb_array_elements(options->'listings') o where o->>'slug' = 'reach-camp-03';
  perform pg_temp.check(opt->>'problem_code' = 'CAMPAIGN_HISTORY_SHORT' and opt->>'eligible_from' is not null, '03 is too recent');
  select o into opt from jsonb_array_elements(options->'listings') o where o->>'slug' = 'reach-camp-04';
  perform pg_temp.check(opt->>'problem_code' = 'CAMPAIGN_LISTING_NOT_ELIGIBLE', '04 is out of stock');
  select o into opt from jsonb_array_elements(options->'listings') o where o->>'slug' = 'reach-camp-05';
  perform pg_temp.check(opt->>'problem_code' is null and (opt->>'reference_price_pen')::integer = 950 and (opt->>'max_campaign_price_pen')::integer = 855,
    '05 references its lowest price, 950');
end $$;

select pg_temp.expect_error(format($q$select public.join_campaign(%L, 'e7430000-0000-4000-8000-000000000101', 850, null)$q$, (select id from camp_ids where name = 'navidad')), 'CAMPAIGN_AFTER_REQUIRED');
select pg_temp.expect_error(format($q$select public.join_campaign(%L, 'e7430000-0000-4000-8000-000000000101', 901, 'restore')$q$, (select id from camp_ids where name = 'navidad')), 'CAMPAIGN_DISCOUNT_SHORT');
select pg_temp.expect_error(format($q$select public.join_campaign(%L, 'e7430000-0000-4000-8000-000000000102', 700, 'restore')$q$, (select id from camp_ids where name = 'navidad')), 'CAMPAIGN_PRICE_RAISED');
select pg_temp.expect_error(format($q$select public.join_campaign(%L, 'e7430000-0000-4000-8000-000000000103', 700, 'restore')$q$, (select id from camp_ids where name = 'navidad')), 'CAMPAIGN_HISTORY_SHORT');
do $$ declare one jsonb; five jsonb; six jsonb; begin
  one := public.join_campaign((select id from camp_ids where name = 'navidad'), 'e7430000-0000-4000-8000-000000000101', 850, 'restore');
  perform pg_temp.check(one->>'status' = 'scheduled' and (one->>'reference_price_pen')::integer = 1000 and (one->>'price_before_pen')::integer = 1000, 'scheduled');
  five := public.join_campaign((select id from camp_ids where name = 'navidad'), 'e7430000-0000-4000-8000-000000000105', 800, 'keep');
  six := public.join_campaign((select id from camp_ids where name = 'navidad'), 'e7430000-0000-4000-8000-000000000106', 1500, 'restore');
  insert into camp_ids values ('entry-01', (one->>'id')::uuid, null), ('entry-05', (five->>'id')::uuid, null), ('entry-06', (six->>'id')::uuid, null);
end $$;
select pg_temp.expect_error(format($q$select public.join_campaign(%L, 'e7430000-0000-4000-8000-000000000101', 800, 'keep')$q$, (select id from camp_ids where name = 'navidad')), 'CAMPAIGN_ALREADY_IN');
select pg_temp.check(public.get_live_campaign_marks() = '[]'::jsonb, 'nothing public before the start');

-- Another store cannot touch these entries or join with this store's publications.
select pg_temp.as_user('e7430000-0000-4000-8000-0000000000a2');
select pg_temp.expect_error(format('select public.withdraw_campaign_entry(%L)', (select id from camp_ids where name = 'entry-01')), 'CAMPAIGN_ENTRY_NOT_FOUND');
select pg_temp.expect_error(format($q$select public.join_campaign(%L, 'e7430000-0000-4000-8000-000000000103', 10, 'keep')$q$, (select id from camp_ids where name = 'navidad')), 'CAMPAIGN_LISTING_NOT_ELIGIBLE');

-- ------------------------------------------------------------------ the start

reset role;
-- The store changes 06's price before the start: it leaves the campaign.
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set price_pen = 1900 where id = 'e7430000-0000-4000-8000-000000000106';
select set_config('app.allow_listing_admin_fields', '', true);
update public.laria_campaigns set starts_at = now() - interval '1 minute' where id = (select id from camp_ids where name = 'navidad');
do $$ declare result jsonb; begin
  result := laria_private.run_campaign_job();
  perform pg_temp.check((result->>'live')::integer = 2, format('two entries live: %s', result));
  perform pg_temp.check((select price_pen from public.listings where id = 'e7430000-0000-4000-8000-000000000101') = 850, '01 at the campaign price');
  perform pg_temp.check((select price_pen from public.listings where id = 'e7430000-0000-4000-8000-000000000105') = 800, '05 at the campaign price');
  perform pg_temp.check((select status from public.laria_campaign_entries where id = (select id from camp_ids where name = 'entry-06')) = 'withdrawn',
    '06 changed its price before the start');
  perform pg_temp.check((select source from public.listing_price_history where listing_id = 'e7430000-0000-4000-8000-000000000101' and valid_to is null) = 'campaign',
    'the history knows a campaign set the price');
  -- list-05 shows the same "Antes" the campaign checked.
  perform pg_temp.check((select previous_price_pen from public.listings where id = 'e7430000-0000-4000-8000-000000000101') = 1000, 'Antes 1000 on the listing');
  result := laria_private.run_campaign_job();
  perform pg_temp.check((result->>'live')::integer = 0 and (result->>'left')::integer = 0, 'a second run changes nothing');
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare page jsonb; mark jsonb; list jsonb; begin
  page := public.get_public_campaign('navidad-2026');
  perform pg_temp.check((page->>'total')::integer = 2 and page->>'phase' = 'live', 'two live publications');
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(page->'entries') e
    where e->>'listing_id' = 'e7430000-0000-4000-8000-000000000105' and (e->>'reference_price_pen')::integer = 950 and (e->>'campaign_price_pen')::integer = 800),
    'card prices');
  select m into mark from jsonb_array_elements(public.get_live_campaign_marks()) m where m->>'listing_id' = 'e7430000-0000-4000-8000-000000000101';
  perform pg_temp.check(mark->>'name' = 'Navidad 2026' and (mark->>'reference_price_pen')::integer = 1000 and mark->>'slug' = 'navidad-2026', 'listing line');
  perform pg_temp.check(jsonb_array_length(public.get_live_campaign_marks()) = 2, 'two lines');
  list := public.get_public_campaigns();
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(list) c where c->>'slug' = 'navidad-2026' and (c->>'live_entries')::integer = 2), 'campaign list');
  perform pg_temp.check(public.get_public_campaign('no-existe') is null, 'unknown slug');
end $$;
select pg_temp.expect_error($$select public.get_store_campaigns()$$, 'permission denied');
select pg_temp.expect_error($$select public.run_campaign_job()$$, 'permission denied');

-- ------------------------------------------------------------------ during the campaign

reset role;
-- The store edits 05's price: it leaves the campaign and keeps its own price.
select set_config('app.allow_listing_admin_fields', 'true', true);
update public.listings set price_pen = 780 where id = 'e7430000-0000-4000-8000-000000000105';
select set_config('app.allow_listing_admin_fields', '', true);
do $$ declare result jsonb; begin
  result := laria_private.run_campaign_job();
  perform pg_temp.check((result->>'left')::integer = 1, 'one left');
  perform pg_temp.check((select status from public.laria_campaign_entries where id = (select id from camp_ids where name = 'entry-05')) = 'withdrawn', '05 withdrawn');
  perform pg_temp.check((select price_pen from public.listings where id = 'e7430000-0000-4000-8000-000000000105') = 780, 'its price stays the store''s');
end $$;

-- Admin cannot move the dates of a started campaign.
set local role authenticated;
select pg_temp.as_admin();
select pg_temp.expect_error(format($q$select public.admin_save_campaign(%L, 'navidad-2026', 'Navidad 2026', '', now(), now() + interval '3 days', 10, %s)$q$,
  (select id from camp_ids where name = 'navidad'), (select (public.admin_get_campaign((select id from camp_ids where name = 'navidad'))->>'revision'))), 'CAMPAIGN_NOT_EDITABLE');

-- ------------------------------------------------------------------ the end

reset role;
update public.laria_campaigns set starts_at = now() - interval '2 days', ends_at = now() - interval '1 minute' where id = (select id from camp_ids where name = 'navidad');
do $$ declare result jsonb; begin
  result := laria_private.run_campaign_job();
  perform pg_temp.check((result->>'ended')::integer = 1, format('one ended: %s', result));
  perform pg_temp.check((select price_pen from public.listings where id = 'e7430000-0000-4000-8000-000000000101') = 1000, '01 restored as the store asked');
  perform pg_temp.check((select status from public.laria_campaign_entries where id = (select id from camp_ids where name = 'entry-01')) = 'ended', '01 ended');
end $$;
select pg_temp.check(public.get_live_campaign_marks() = '[]'::jsonb, 'no campaign line after the end');
-- The test runs in one transaction, so the clock stands still: give 01's history the two days the campaign lasted.
delete from public.listing_price_history where listing_id = 'e7430000-0000-4000-8000-000000000101';
insert into public.listing_price_history (listing_id, price_pen, valid_from, valid_to, source) values
 ('e7430000-0000-4000-8000-000000000101', 1000, now() - interval '60 days', now() - interval '2 days', 'created'),
 ('e7430000-0000-4000-8000-000000000101', 850, now() - interval '2 days', now() - interval '1 minute', 'campaign'),
 ('e7430000-0000-4000-8000-000000000101', 1000, now() - interval '1 minute', null, 'campaign');

-- ------------------------------------------------------------------ withdraw, remove, cancel

set local role authenticated;
select pg_temp.as_admin();
do $$ declare created jsonb; begin
  created := public.admin_save_campaign(null, 'dia-de-la-musica', 'Día de la Música', '', now() + interval '1 day', now() + interval '3 days', 10);
  created := public.admin_set_campaign_status((created->>'id')::uuid, 'published', (created->>'revision')::integer);
  insert into camp_ids values ('musica', (created->>'id')::uuid, (created->>'revision')::integer);
end $$;
select pg_temp.as_user('e7430000-0000-4000-8000-0000000000a1');
do $$ declare entry jsonb; again jsonb; begin
  -- 01 is back at 1000 since a minute ago, but its lowest of the 30 days was the campaign's 850.
  perform pg_temp.expect_error(format($q$select public.join_campaign(%L, 'e7430000-0000-4000-8000-000000000101', 700, 'keep')$q$,
    (select id from camp_ids where name = 'musica')), 'CAMPAIGN_PRICE_RAISED');
  entry := public.join_campaign((select id from camp_ids where name = 'musica'), 'e7430000-0000-4000-8000-000000000105', 700, 'keep');
  again := public.withdraw_campaign_entry((entry->>'id')::uuid);
  perform pg_temp.check(again->>'status' = 'withdrawn', 'the store withdraws');
  entry := public.join_campaign((select id from camp_ids where name = 'musica'), 'e7430000-0000-4000-8000-000000000105', 700, 'keep');
  insert into camp_ids values ('entry-05b', (entry->>'id')::uuid, null);
end $$;
select pg_temp.as_admin();
select pg_temp.expect_error(format('select public.admin_remove_campaign_entry(%L, %L)', (select id from camp_ids where name = 'entry-05b'), ''), 'CAMPAIGN_REASON_REQUIRED');
select pg_temp.check(public.admin_remove_campaign_entry((select id from camp_ids where name = 'entry-05b'), 'La foto no corresponde al instrumento.')->'entry'->>'status' = 'removed', 'Admin removes');
select pg_temp.expect_error(format('select public.admin_set_campaign_status(%L, %L, %s)', (select id from camp_ids where name = 'musica'), 'cancelled', (select revision from camp_ids where name = 'musica')), 'CAMPAIGN_REASON_REQUIRED');
select pg_temp.check(public.admin_set_campaign_status((select id from camp_ids where name = 'musica'), 'cancelled', (select revision from camp_ids where name = 'musica'), 'Cambio de fechas.')->>'status' = 'cancelled', 'cancelled');
reset role;
select pg_temp.check(exists (select 1 from public.notifications n where n.event_type = 'store_campaign_entry_removed' and n.store_id = 'e7430000-0000-4000-8000-000000000001'), 'the store is told');
select pg_temp.check((select count(*) from public.admin_audit_actions a where a.target_type in ('campaign', 'campaign_entry')) >= 5, 'Admin actions audited');
select pg_temp.check(exists (select 1 from cron.job where jobname = 'laria-campaigns'), 'job scheduled');

rollback;
