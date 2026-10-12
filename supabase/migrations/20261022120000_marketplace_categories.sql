-- Marketplace categories, owner decision of 12 Oct 2026 (docs/ux-redesign/category-restructure.md).
--
-- Ten categories replace the eight of V1: guitars, basses, keyboards, percussion, winds, strings, pedals, amplifiers,
-- microphones, audio. Drums and cymbals become instrument types of percussion (their attributes are unchanged), the
-- audio interface becomes a type of audio, and keyboards, hand_percussion (hand and Latin), winds, string instruments and
-- audio gear are new types, each with one "what is it" attribute. lib/listing-submission.ts and
-- lib/instrument-filters.ts mirror this file.
--
-- Order matters: the validators change first, so the rows moved below already satisfy them when the listing triggers
-- (sprint 8's public-listing invariant) re-check them.

create or replace function public.listing_taxonomy_is_valid(
  p_category text,
  p_instrument_type text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    (p_instrument_type = 'other' and p_category in (
      'guitars', 'basses', 'keyboards', 'percussion', 'winds',
      'strings', 'pedals', 'amplifiers', 'microphones', 'audio'
    ))
    or (p_category = 'guitars' and p_instrument_type in ('electric_guitar', 'acoustic_guitar'))
    or (p_category = 'basses' and p_instrument_type = 'bass')
    or (p_category = 'keyboards' and p_instrument_type = 'keyboards')
    or (p_category = 'percussion' and p_instrument_type in ('drums', 'cymbals', 'hand_percussion'))
    or (p_category = 'winds' and p_instrument_type = 'winds')
    or (p_category = 'strings' and p_instrument_type = 'string_instrument')
    or (p_category = 'pedals' and p_instrument_type = 'pedals')
    or (p_category = 'amplifiers' and p_instrument_type = 'amplifiers')
    or (p_category = 'microphones' and p_instrument_type = 'microphones')
    or (p_category = 'audio' and p_instrument_type in ('audio_interface', 'audio_gear'));
$$;

create or replace function public.listing_attribute_keys_are_valid(
  p_instrument_type text,
  p_attributes jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(coalesce(p_attributes, '{}'::jsonb)) = 'object'
    and not exists (
      select 1
      from jsonb_object_keys(coalesce(p_attributes, '{}'::jsonb)) key
      where case p_instrument_type
        when 'electric_guitar' then key <> all(array['body_type','shape','strings','bridge','pickups','handedness','frets'])
        when 'bass' then key <> all(array['strings','bass_type','pickups','scale_length','handedness'])
        when 'acoustic_guitar' then key <> all(array['acoustic_type','body_shape','strings_material','handedness','has_preamp'])
        when 'drums' then key <> all(array['drum_type','configuration','pieces','material','includes_hardware','includes_cymbals','kick_size'])
        when 'cymbals' then key <> all(array['cymbal_type','size','alloy','finish'])
        when 'hand_percussion' then key <> all(array['percussion_type'])
        when 'keyboards' then key <> all(array['keyboard_type','keys','weighted_keys'])
        when 'winds' then key <> all(array['wind_type'])
        when 'string_instrument' then key <> all(array['string_type'])
        when 'microphones' then key <> all(array['microphone_type','use_case','polar_pattern','connection'])
        when 'audio_interface' then key <> all(array['inputs','connection','phantom_power','midi'])
        when 'audio_gear' then key <> all(array['audio_type'])
        when 'pedals' then key <> all(array['pedal_type','format','true_bypass'])
        when 'amplifiers' then key <> all(array['amplifier_type','technology','power','use_case'])
        when 'other' then true
        else true
      end
    );
$$;

-- The two publication checks below carried their own copy of the taxonomy; they now ask listing_taxonomy_is_valid,
-- so the next taxonomy change touches one function. Everything else is unchanged from
-- 20260910120000_sprint_1_owner_acceptance_fixes.sql and 20260923120000_sprint_8_admin_reports_legacy.sql.
create or replace function public.listing_meets_publish_requirements(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.listings l
    where l.id = p_listing_id
      and nullif(trim(coalesce(l.brand, '')), '') is not null
      and nullif(trim(coalesce(l.model, '')), '') is not null
      and nullif(trim(coalesce(l.category, '')), '') is not null
      and nullif(trim(coalesce(l.instrument_type, '')), '') is not null
      and public.listing_taxonomy_is_valid(l.category, l.instrument_type)
      and nullif(trim(coalesce(l.condition, '')), '') is not null
      and nullif(trim(coalesce(l.city, '')), '') is not null
      and nullif(trim(coalesce(l.region, '')), '') is not null
      and nullif(trim(coalesce(l.whatsapp_phone, '')), '') is not null
      and l.price_pen is not null
      and l.price_pen > 0
      and length(trim(coalesce(l.description, ''))) >= 40
      and l.marketplace_rules_accepted_at is not null
      and (
        select count(*)
        from public.listing_photos lp
        where lp.listing_id = l.id
      ) between 2 and 10
  );
$$;

create or replace function laria_private.enforce_public_listing_edit_invariant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only tighten records that already satisfied every publication invariant.
  -- Historical approved listings may predate rules/photos and must remain
  -- editable without a destructive backfill, while no valid public listing
  -- can be degraded by the Admin allowlisted editor.
  if old.status = 'approved'
    and new.status = 'approved'
    and public.listing_meets_publish_requirements(old.id)
    and (
      nullif(trim(coalesce(new.brand, '')), '') is null
      or nullif(trim(coalesce(new.model, '')), '') is null
      or nullif(trim(coalesce(new.category, '')), '') is null
      or nullif(trim(coalesce(new.instrument_type, '')), '') is null
      or not public.listing_taxonomy_is_valid(new.category, new.instrument_type)
      or nullif(trim(coalesce(new.condition, '')), '') is null
      or nullif(trim(coalesce(new.city, '')), '') is null
      or nullif(trim(coalesce(new.region, '')), '') is null
      or nullif(trim(coalesce(new.whatsapp_phone, '')), '') is null
      or new.price_pen is null
      or new.price_pen <= 0
      or length(trim(coalesce(new.description, ''))) < 40
      or new.marketplace_rules_accepted_at is null
    ) then
    raise exception 'LISTING_REQUIREMENTS_INVALID: La publicación aprobada debe conservar todos los requisitos de publicación.';
  end if;
  return new;
end;
$$;

-- Saved searches accept the new categories and the new types' attributes (unchanged otherwise from
-- 20260921120000_sprint_7_marketplace_email_alerts.sql).
create or replace function laria_private.normalize_saved_search(p_filters jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  result jsonb := '{}'::jsonb;
  advanced jsonb := coalesce(p_filters->'advanced', '{}'::jsonb);
  string_value text;
  number_value numeric;
  advanced_entry record;
  allowed_advanced constant text[] := array[
    'acoustic_type','alloy','amplifier_type','audio_type','bass_type','body_shape','body_type',
    'bridge','configuration','connection','cymbal_type','drum_type','finish',
    'format','frets','handedness','has_preamp','includes_cymbals','includes_hardware',
    'inputs','keyboard_type','keys','kick_size','material','microphone_type','midi','pedal_type',
    'percussion_type','phantom_power','pickups','pieces','polar_pattern','power','scale_length',
    'shape','size','string_type','strings','strings_material','technology','true_bypass','use_case',
    'weighted_keys','wind_type'
  ];
begin
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' or octet_length(p_filters::text) > 4096 then
    raise exception 'ALERT_FILTERS_INVALID';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_filters) key
    where key not in ('category','location','condition','brand','seller_type','instrument_type','min_price','max_price','advanced')
  ) then
    raise exception 'ALERT_FILTERS_INVALID';
  end if;
  if jsonb_typeof(advanced) <> 'object'
    or exists (select 1 from jsonb_object_keys(advanced) key where not (key = any(allowed_advanced))) then
    raise exception 'ALERT_FILTERS_INVALID';
  end if;

  if p_filters ? 'category' then
    if jsonb_typeof(p_filters->'category') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'category'), '');
    if string_value is not null and string_value not in ('guitars','basses','keyboards','percussion','winds','strings','pedals','amplifiers','microphones','audio') then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('category', string_value); end if;
  end if;
  if p_filters ? 'location' then
    if jsonb_typeof(p_filters->'location') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'location'), '');
    if string_value is not null and length(string_value) > 100 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('location', string_value); end if;
  end if;
  if p_filters ? 'condition' then
    if jsonb_typeof(p_filters->'condition') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'condition'), '');
    if string_value is not null and string_value not in ('Nuevo','Usado - buen estado','Usado - con detalles') then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('condition', string_value); end if;
  end if;
  if p_filters ? 'brand' then
    if jsonb_typeof(p_filters->'brand') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'brand'), '');
    if string_value is not null and length(string_value) > 200 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('brand', string_value); end if;
  end if;
  if p_filters ? 'seller_type' then
    if jsonb_typeof(p_filters->'seller_type') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'seller_type'), '');
    if string_value is not null and string_value not in ('individual','store','verified_store') then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('seller_type', string_value); end if;
  end if;
  if p_filters ? 'instrument_type' then
    if jsonb_typeof(p_filters->'instrument_type') <> 'string' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    string_value := nullif(trim(p_filters->>'instrument_type'), '');
    if string_value is not null and length(string_value) > 100 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    if string_value is not null then result := result || jsonb_build_object('instrument_type', string_value); end if;
  end if;
  if p_filters ? 'min_price' then
    if jsonb_typeof(p_filters->'min_price') <> 'number' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    number_value := (p_filters->>'min_price')::numeric;
    if number_value < 0 or number_value > 1000000000 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    result := result || jsonb_build_object('min_price', number_value);
  end if;
  if p_filters ? 'max_price' then
    if jsonb_typeof(p_filters->'max_price') <> 'number' then raise exception 'ALERT_FILTERS_INVALID'; end if;
    number_value := (p_filters->>'max_price')::numeric;
    if number_value < 0 or number_value > 1000000000 then raise exception 'ALERT_FILTERS_INVALID'; end if;
    result := result || jsonb_build_object('max_price', number_value);
  end if;
  if result ? 'min_price' and result ? 'max_price'
    and (result->>'min_price')::numeric > (result->>'max_price')::numeric then
    raise exception 'ALERT_FILTERS_INVALID';
  end if;

  for advanced_entry in select key, value from jsonb_each(advanced)
  loop
    if jsonb_typeof(advanced_entry.value) not in ('string','number','boolean','array')
      or octet_length(advanced_entry.value::text) > 1000
      or (jsonb_typeof(advanced_entry.value) = 'array' and jsonb_array_length(advanced_entry.value) > 20) then
      raise exception 'ALERT_FILTERS_INVALID';
    end if;
    if jsonb_typeof(advanced_entry.value) = 'array' and exists (
      select 1 from jsonb_array_elements(advanced_entry.value) item
      where jsonb_typeof(item) <> 'string' or length(item#>>'{}') > 100
    ) then
      raise exception 'ALERT_FILTERS_INVALID';
    end if;
  end loop;
  if advanced <> '{}'::jsonb then result := result || jsonb_build_object('advanced', advanced); end if;
  return result;
end;
$$;

-- Move the stored rows to the new categories. A drum listing becomes percussion / drums, a cymbal listing percussion /
-- cymbals, an audio interface audio / audio_interface; a listing typed "other" keeps that type in its new category.
-- The listing protection trigger lets this controlled migration edit approved and sold listings, as
-- 20260909120000_marketplace_performance.sql did; nothing else about the listings changes.
select set_config('app.allow_listing_admin_fields', 'true', true);

update public.listings
set category = case category when 'audio interfaces' then 'audio' else 'percussion' end
where category in ('drums', 'cymbals', 'audio interfaces');

update public.listing_revisions
set category = case category when 'audio interfaces' then 'audio' else 'percussion' end
where category in ('drums', 'cymbals', 'audio interfaces');

-- A saved search for a retired category keeps matching the same listings: the new category plus the old type (unless
-- it already named one). Its hash and match bucket derive from the filters, so both are recomputed. When a moved search
-- becomes identical to another live search of the same user, it is deleted the way delete_saved_search_alert deletes
-- (pending matches suppressed, queued e-mails cancelled), so the user keeps one copy.
create temporary table category_moved_alerts as
select
  alert.id,
  alert.user_id,
  alert.created_at,
  alert.deleted_at is null as live,
  laria_private.normalize_saved_search(
    alert.search_filters
    || jsonb_build_object('category', case alert.search_filters->>'category' when 'audio interfaces' then 'audio' else 'percussion' end)
    || case when alert.search_filters ? 'instrument_type' then '{}'::jsonb
       else jsonb_build_object('instrument_type', case alert.search_filters->>'category'
         when 'drums' then 'drums' when 'cymbals' then 'cymbals' else 'audio_interface' end)
       end
  ) as filters
from public.saved_search_alerts alert
where alert.search_filters->>'category' in ('drums', 'cymbals', 'audio interfaces');

create temporary table category_duplicate_alerts as
select ranked.id
from (
  select
    moved.id,
    row_number() over (partition by moved.user_id, laria_private.saved_search_hash(moved.filters) order by moved.created_at, moved.id) as copy_number,
    exists (
      select 1 from public.saved_search_alerts other
      where other.user_id = moved.user_id
        and other.deleted_at is null
        and other.search_hash = laria_private.saved_search_hash(moved.filters)
        and coalesce(other.search_filters->>'category', '') not in ('drums', 'cymbals', 'audio interfaces')
    ) as already_saved
  from category_moved_alerts moved
  where moved.live
) ranked
where ranked.copy_number > 1 or ranked.already_saved;

update public.saved_search_alerts
set status = 'deleted', deleted_at = clock_timestamp(), paused_at = coalesce(paused_at, clock_timestamp()), updated_at = clock_timestamp()
where id in (select id from category_duplicate_alerts);
update laria_private.search_alert_matches
set suppressed_at = coalesce(suppressed_at, clock_timestamp()), suppression_reason = coalesce(suppression_reason, 'alert_deleted')
where alert_id in (select id from category_duplicate_alerts) and delivery_id is null and suppressed_at is null;
update laria_private.marketplace_email_deliveries
set status = 'cancelled', locked_at = null, locked_by = null
where search_alert_id in (select id from category_duplicate_alerts) and status in ('pending','retry','processing');

update public.saved_search_alerts alert
set
  search_filters = moved.filters,
  search_hash = laria_private.saved_search_hash(moved.filters),
  match_bucket = 'type:' || (moved.filters->>'instrument_type')
from category_moved_alerts moved
where alert.id = moved.id;

drop table category_duplicate_alerts;
drop table category_moved_alerts;
