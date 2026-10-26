-- Feature ideas, services batch (bet-02; docs/feature-ideas/services.md): "Servicios para músicos".
--
-- Teachers, luthiers and repair shops, rehearsal rooms, recording studios and sound for events publish a service
-- profile with a starting price, the places they serve and a WhatsApp button. Henri's note (2026-10-26): "we shouldnt
-- mix service listings with items". So services live in their own tables and pages and never touch `listings`,
-- the catalog search, listing counts, saved-search alerts or favorites.
--
--   services            one profile per account and category; moderated by Admin before it is public
--   service_events      views and WhatsApp contacts, recorded by the server (service role) only
--   service_bookings    "Contraté este servicio": one side asks, the other confirms; only a contact made through
--                       Laria's button by a signed-in client can be confirmed
--   service_reviews     1-5 stars and an optional comment from a confirmed client, one per client and service
--   service_reports     reports on a service or a service review, closed by Admin
--
-- Every table has row-level security on and no grants to the browser roles: reads and writes go through the
-- security-definer functions below, like listing_questions. Errors read 'SERVICE_CODE: mensaje en español'.
-- Notices use the shared notifications table (new `service_id` target) and the e-mail outbox (context keys
-- `service_title` and `service_path`); the push trigger picks them up as it does every notice.

-- ------------------------------------------------------------------ vocabulary
-- lib/services.ts holds the same lists with their Spanish labels; keep both in step.

create or replace function laria_private.service_categories()
returns text[]
language sql
immutable
as $$ select array['clases', 'reparaciones', 'ensayo', 'grabacion', 'sonido']::text[] $$;

-- The URL segment of each category (/servicios/<segment>).
create or replace function laria_private.service_category_slug(p_category text)
returns text
language sql
immutable
as $$
  select case p_category
    when 'clases' then 'clases'
    when 'reparaciones' then 'reparaciones'
    when 'ensayo' then 'salas-de-ensayo'
    when 'grabacion' then 'estudios-de-grabacion'
    when 'sonido' then 'sonido-para-eventos'
  end
$$;

create or replace function laria_private.service_units(p_category text)
returns text[]
language sql
immutable
as $$
  select case p_category
    when 'clases' then array['clase', 'hora', 'mes']
    when 'reparaciones' then array['trabajo', 'hora']
    when 'ensayo' then array['hora', 'sesion']
    when 'grabacion' then array['hora', 'sesion', 'cancion']
    when 'sonido' then array['evento', 'hora', 'dia']
    else array[]::text[]
  end::text[]
$$;

-- en_local: at the provider's place; a_domicilio: at the client's home or event; en_linea: online.
create or replace function laria_private.service_modalities(p_category text)
returns text[]
language sql
immutable
as $$
  select case p_category
    when 'clases' then array['en_local', 'a_domicilio', 'en_linea']
    when 'reparaciones' then array['en_local', 'a_domicilio']
    when 'ensayo' then array['en_local']
    when 'grabacion' then array['en_local', 'en_linea']
    when 'sonido' then array['a_domicilio']
    else array[]::text[]
  end::text[]
$$;

-- What a teacher teaches or a repair shop repairs. Lessons and repairs need at least one; the other categories none.
create or replace function laria_private.service_skills(p_category text)
returns text[]
language sql
immutable
as $$
  select case p_category
    when 'clases' then array['guitarra', 'bajo', 'bateria', 'piano', 'canto', 'cuerdas', 'vientos', 'andinos', 'ukelele', 'produccion', 'teoria']
    when 'reparaciones' then array['guitarra', 'bajo', 'bateria', 'piano', 'cuerdas', 'vientos', 'andinos', 'ukelele', 'amplificadores', 'pedales', 'audio']
    else array[]::text[]
  end::text[]
$$;

create or replace function laria_private.service_skills_required(p_category text)
returns boolean
language sql
immutable
as $$ select p_category in ('clases', 'reparaciones') $$;

-- Every element trimmed, within the length range and unique (case and accents aside, the app folds them too).
create or replace function laria_private.service_text_items_ok(p_items text[], p_min integer, p_max integer)
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(char_length(item) between p_min and p_max and item = btrim(item)), true)
    and cardinality(p_items) = (select count(distinct lower(item)) from unnest(p_items) item)
  from unnest(p_items) item
$$;

create or replace function laria_private.service_array_distinct(p_items text[])
returns boolean
language sql
immutable
as $$ select cardinality(p_items) = (select count(distinct item) from unnest(p_items) item) $$;

-- ------------------------------------------------------------------ tables

create table public.services (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  -- Set when a store owner offers it: the store is then the provider (name, logo, verified mark) and the service is
  -- public only while the store is active.
  store_id uuid references public.stores(id) on delete cascade,
  category text not null,
  -- Fixed at creation, so a shared link keeps working when the title changes.
  slug text not null unique,
  title text not null,
  -- The name buyers see for a Particular ("Estudio La Bóveda", "Prof. Ana Torres"); a store's service shows the store.
  provider_name text not null,
  description text not null,
  price_from_pen integer not null,
  price_unit text not null,
  modalities text[] not null,
  skills text[] not null default '{}',
  city text not null,
  region text,
  district text,
  -- Other districts or cities served ("Zonas que atiende").
  areas text[] not null default '{}',
  whatsapp_phone text not null,
  -- Paths in the service-photos bucket (<owner>/<uuid>.<ext>); the app builds the public address.
  photo_paths text[] not null default '{}',
  status text not null default 'pending',
  moderation_reason text,
  -- An approved service whose title, description, name or photos changed: it stays public and Admin looks again.
  needs_recheck boolean not null default false,
  version integer not null default 1,
  approved_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint services_category_check check (category = any (laria_private.service_categories())),
  constraint services_title_check check (char_length(title) between 8 and 90 and title = btrim(title)),
  constraint services_provider_name_check check (char_length(provider_name) between 2 and 80 and provider_name = btrim(provider_name)),
  constraint services_description_check check (char_length(description) between 40 and 2000 and description = btrim(description)),
  constraint services_price_check check (price_from_pen between 1 and 100000),
  constraint services_unit_check check (price_unit = any (laria_private.service_units(category))),
  constraint services_modalities_check check (
    cardinality(modalities) between 1 and 3
    and modalities <@ laria_private.service_modalities(category)
    and laria_private.service_array_distinct(modalities)
  ),
  constraint services_skills_check check (
    cardinality(skills) <= 8
    and skills <@ laria_private.service_skills(category)
    and laria_private.service_array_distinct(skills)
    and (not laria_private.service_skills_required(category) or cardinality(skills) >= 1)
  ),
  constraint services_city_check check (char_length(city) between 2 and 60 and city = btrim(city)),
  constraint services_region_check check (region is null or (char_length(region) between 2 and 40 and region = btrim(region))),
  constraint services_district_check check (district is null or (char_length(district) between 2 and 60 and district = btrim(district))),
  constraint services_areas_check check (cardinality(areas) <= 12 and laria_private.service_text_items_ok(areas, 2, 60)),
  constraint services_whatsapp_check check (whatsapp_phone ~ '^[0-9]{10,15}$'),
  constraint services_photos_check check (cardinality(photo_paths) <= 6 and laria_private.service_array_distinct(photo_paths)),
  constraint services_status_check check (status in ('pending', 'approved', 'rejected', 'paused', 'hidden')),
  -- Rejected and hidden carry the reason the owner sees; every other state carries none.
  constraint services_reason_check check (
    (status in ('rejected', 'hidden') and char_length(btrim(coalesce(moderation_reason, ''))) between 3 and 500)
    or (status not in ('rejected', 'hidden') and moderation_reason is null)
  ),
  constraint services_approved_check check (status not in ('approved', 'paused') or approved_at is not null),
  constraint services_version_check check (version >= 1)
);

comment on table public.services is
  'bet-02: a service for musicians (lessons, repairs, rehearsal rooms, recording, event sound). Never a listing. Written only through save_service and the other *_service RPCs.';

-- One profile per account and category: a studio that rents rooms and records makes two.
create unique index services_owner_category_idx on public.services(owner_user_id, category);
create index services_public_idx on public.services(category, approved_at desc, id) where status = 'approved';
create index services_status_idx on public.services(status, updated_at);
create index services_recheck_idx on public.services(updated_at) where needs_recheck;
create index services_store_idx on public.services(store_id) where store_id is not null;

alter table public.services enable row level security;
revoke all on public.services from anon, authenticated;

create table public.service_events (
  -- The id the browser generated for this press or view: a retried request never counts twice.
  id uuid primary key,
  service_id uuid not null references public.services(id) on delete cascade,
  kind text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  session_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint service_events_kind_check check (kind in ('view', 'contact'))
);

comment on table public.service_events is
  'bet-02: service page views and WhatsApp contacts. Recorded by record_service_event (service role) only; never the message.';

create index service_events_service_idx on public.service_events(service_id, kind, created_at desc);
create index service_events_contacts_idx on public.service_events(service_id, actor_user_id, created_at desc)
  where kind = 'contact' and actor_user_id is not null;
create index service_events_identity_idx on public.service_events(service_id, kind, coalesce(actor_user_id, session_id), created_at desc);

alter table public.service_events enable row level security;
revoke all on public.service_events from anon, authenticated;

create table public.service_bookings (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  provider_user_id uuid not null references public.profiles(id) on delete cascade,
  client_user_id uuid not null references public.profiles(id) on delete cascade,
  requested_by text not null,
  status text not null default 'pending',
  created_at timestamptz not null default clock_timestamp(),
  responded_at timestamptz,
  confirmed_at timestamptz,
  review_deadline timestamptz,
  constraint service_bookings_requested_by_check check (requested_by in ('provider', 'client')),
  constraint service_bookings_status_check check (status in ('pending', 'confirmed', 'declined', 'cancelled', 'expired')),
  constraint service_bookings_parties_check check (provider_user_id <> client_user_id),
  constraint service_bookings_confirmed_check check (
    (status = 'confirmed' and confirmed_at is not null and review_deadline is not null)
    or (status <> 'confirmed' and confirmed_at is null and review_deadline is null)
  ),
  constraint service_bookings_responded_check check ((status = 'pending') = (responded_at is null))
);

comment on table public.service_bookings is
  'bet-02: a client and a provider both say the service was hired through Laria. It confirms that, not the payment or the work. It opens the review.';

-- One open or confirmed booking per client and service.
create unique index service_bookings_open_idx on public.service_bookings(service_id, client_user_id)
  where status in ('pending', 'confirmed');
create index service_bookings_provider_idx on public.service_bookings(provider_user_id, created_at desc);
create index service_bookings_client_idx on public.service_bookings(client_user_id, created_at desc);

alter table public.service_bookings enable row level security;
revoke all on public.service_bookings from anon, authenticated;

create table public.service_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.service_bookings(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  client_user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null,
  comment text,
  status text not null default 'visible',
  hidden_reason text,
  hidden_at timestamptz,
  hidden_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint service_reviews_rating_check check (rating between 1 and 5),
  constraint service_reviews_comment_check check (comment is null or (char_length(comment) between 2 and 1000 and comment = btrim(comment))),
  constraint service_reviews_status_check check (status in ('visible', 'hidden')),
  constraint service_reviews_hidden_check check (
    (status = 'visible' and hidden_reason is null and hidden_at is null and hidden_by is null)
    or (status = 'hidden' and hidden_at is not null and char_length(btrim(coalesce(hidden_reason, ''))) between 3 and 500)
  ),
  -- One review per client and service, ever: a repeat client cannot stack reviews.
  constraint service_reviews_one_per_client unique (service_id, client_user_id)
);

comment on table public.service_reviews is
  'bet-02: a confirmed client''s review of a service. Published at once, never edited by its author; Admin may hide it with a reason.';

create index service_reviews_service_idx on public.service_reviews(service_id, created_at desc) where status = 'visible';

alter table public.service_reviews enable row level security;
revoke all on public.service_reviews from anon, authenticated;

create table public.service_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null,
  service_id uuid not null references public.services(id) on delete cascade,
  review_id uuid references public.service_reviews(id) on delete cascade,
  reason text not null,
  detail text,
  status text not null default 'open',
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint service_reports_target_check check (
    (target_type = 'service' and review_id is null) or (target_type = 'service_review' and review_id is not null)
  ),
  -- The reasons of submit_content_report, so both report forms offer the same list.
  constraint service_reports_reason_check check (reason in (
    'acoso', 'contenido_inapropiado', 'informacion_falsa', 'posible_estafa', 'articulo_prohibido', 'spam', 'otro'
  )),
  constraint service_reports_detail_check check (detail is null or char_length(detail) <= 1000),
  constraint service_reports_status_check check (status in ('open', 'resolved', 'dismissed')),
  constraint service_reports_resolution_check check (
    (status = 'open' and resolved_at is null and resolution_note is null)
    or (status <> 'open' and resolved_at is not null and char_length(btrim(coalesce(resolution_note, ''))) between 3 and 500)
  )
);

create unique index service_reports_open_service_idx on public.service_reports(reporter_user_id, service_id)
  where status = 'open' and target_type = 'service';
create unique index service_reports_open_review_idx on public.service_reports(reporter_user_id, review_id)
  where status = 'open' and target_type = 'service_review';
create index service_reports_status_idx on public.service_reports(status, created_at);

alter table public.service_reports enable row level security;
revoke all on public.service_reports from anon, authenticated;

-- ------------------------------------------------------------------ photos bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-photos', 'service-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The browser uploads each photo (already redrawn as a JPEG, like listing photos) straight into the owner's folder;
-- save_service accepts only paths there that exist. No update or delete from the browser, and reads of the folder
-- listing stay with its owner (the files are public by address, like listing photos).
create policy "Owners upload service photos into their folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'service-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
);

create policy "Owners read their service photo folder"
on storage.objects for select to authenticated
using (bucket_id = 'service-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- An owner removes their photos that no service uses any more (left over after an edit or a deletion). A photo still
-- on a service, including one Moderation hid, stays.
create or replace function public.service_photo_is_unused(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.services where p_name = any(photo_paths));
$$;

revoke all on function public.service_photo_is_unused(text) from public, anon;
grant execute on function public.service_photo_is_unused(text) to authenticated;

create policy "Owners delete their unused service photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'service-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.service_photo_is_unused(name)
);

-- ------------------------------------------------------------------ registries
-- Notices and e-mails extend the shared lists in place (laria_private.ux_extend_text_check, UXD-integration-3).

alter table public.notifications
  add column if not exists service_id uuid references public.services(id) on delete cascade;

select laria_private.ux_extend_text_check(
  'public.notifications', 'notifications_event_type_check', 'event_type',
  array['service_approved', 'service_rejected', 'service_hidden', 'service_booking_requested',
    'service_booking_confirmed', 'service_booking_declined', 'service_review_received']
);

-- notifications_target_check is a list of "type family → target" branches; other batches may have added theirs. The
-- service branch is appended to whatever the check holds now, once, so no other branch is lost.
do $$
declare
  current_def text;
begin
  select pg_get_constraintdef(oid) into current_def
  from pg_constraint
  where conrelid = 'public.notifications'::regclass and conname = 'notifications_target_check';
  if current_def is null then raise exception 'notifications_target_check not found'; end if;
  if position('service_id' in current_def) > 0 then return; end if;
  current_def := substring(current_def from '^CHECK \((.*)\)$');
  if current_def is null then raise exception 'notifications_target_check not readable'; end if;
  alter table public.notifications drop constraint notifications_target_check;
  execute format('alter table public.notifications add constraint notifications_target_check check ((%s) or (event_type like %L and service_id is not null))',
    current_def, 'service\_%');
end $$;

create index if not exists notifications_service_idx on public.notifications(service_id) where service_id is not null;

select laria_private.ux_extend_text_check(
  'laria_private.marketplace_email_deliveries', 'marketplace_email_deliveries_event_type_check', 'event_type',
  array['service_approved', 'service_rejected', 'service_hidden', 'service_booking_requested', 'service_booking_confirmed']
);

-- The e-mail reads the service's title and page from its context (the outbox has no service reference).
do $$
declare
  values_now text[];
begin
  values_now := laria_private.check_constraint_values('laria_private.marketplace_email_deliveries', 'marketplace_email_context_check', '(context - ');
  if values_now is null or not ('reason' = any(values_now)) then raise exception 'marketplace_email_context_check not readable'; end if;
  if 'service_title' = any(values_now) and 'service_path' = any(values_now) then return; end if;
  alter table laria_private.marketplace_email_deliveries drop constraint marketplace_email_context_check;
  execute format('alter table laria_private.marketplace_email_deliveries add constraint marketplace_email_context_check check (jsonb_typeof(context) = %L and octet_length(context::text) <= 8192 and (context - %L::text[]) = %L::jsonb)',
    'object', array(select distinct unnest(values_now || array['service_title', 'service_path']) order by 1), '{}');
end $$;

select laria_private.ux_extend_text_check(
  'public.admin_audit_actions', 'admin_audit_actions_target_type_check', 'target_type',
  array['service', 'service_review', 'service_report']
);

-- ------------------------------------------------------------------ internal helpers

create or replace function laria_private.raise_service_error(p_code text, p_message text)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code || ': ' || p_message;
end;
$$;

-- One line: every run of whitespace becomes one space.
create or replace function laria_private.service_line(p_value text)
returns text
language sql
immutable
as $$ select btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')) $$;

-- Running text: line breaks kept (at most one empty line in a row), spaces folded inside each line.
create or replace function laria_private.service_paragraphs(p_value text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(replace(coalesce(p_value, ''), E'\r', ''),
    '[ \t]+', ' ', 'g'), ' ?\n ?', E'\n', 'g'), E'\n{3,}', E'\n\n', 'g'))
$$;

-- "Miraflores" and "miraflores " are the same place.
create or replace function laria_private.service_place_key(p_value text)
returns text
language sql
stable
set search_path = public, extensions
as $$ select lower(extensions.unaccent(laria_private.service_line(p_value))) $$;

create or replace function laria_private.service_slug(p_title text, p_id uuid)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(nullif(btrim(left(btrim(regexp_replace(lower(extensions.unaccent(coalesce(p_title, ''))), '[^a-z0-9]+', '-', 'g'), '-'), 60), '-'), ''), 'servicio')
    || '-' || left(replace(p_id::text, '-', ''), 6)
$$;

create or replace function laria_private.service_path(p_service public.services)
returns text
language sql
immutable
as $$ select '/servicios/' || laria_private.service_category_slug(p_service.category) || '/' || p_service.slug $$;

-- Public: approved, and for a store's service the store is active.
create or replace function laria_private.service_is_public(p_service public.services)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_service.status = 'approved'
    and (p_service.store_id is null or exists (select 1 from public.stores st where st.id = p_service.store_id and st.status = 'active'))
$$;

-- Who offers it, as buyers see it.
create or replace function laria_private.service_provider(p_service public.services)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_service.store_id is not null then (
      select jsonb_build_object(
        'name', st.name,
        'kind', case when st.is_verified and st.status = 'active' then 'verified' else 'store' end,
        'store_slug', case when st.status = 'active' then st.slug end,
        'logo_url', st.logo_url,
        'since', st.created_at)
      from public.stores st where st.id = p_service.store_id)
    else jsonb_build_object(
      'name', p_service.provider_name,
      'kind', 'particular',
      'store_slug', null,
      'logo_url', null,
      'since', (select p.created_at from public.profiles p where p.id = p_service.owner_user_id))
  end
$$;

-- Visible reviews: count and average (null without reviews).
create or replace function laria_private.service_rating(p_service_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('count', count(*), 'average', round(avg(rating)::numeric, 1))
  from public.service_reviews
  where service_id = p_service_id and status = 'visible'
$$;

-- The directory card.
create or replace function laria_private.service_card(p_service public.services)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_service.id,
    'slug', p_service.slug,
    'category', p_service.category,
    'title', p_service.title,
    'provider', laria_private.service_provider(p_service),
    'price_from_pen', p_service.price_from_pen,
    'price_unit', p_service.price_unit,
    'city', p_service.city,
    'district', p_service.district,
    'region', p_service.region,
    'areas', to_jsonb(p_service.areas),
    'modalities', to_jsonb(p_service.modalities),
    'skills', to_jsonb(p_service.skills),
    'cover_path', p_service.photo_paths[1],
    'rating', laria_private.service_rating(p_service.id),
    'approved_at', p_service.approved_at
  )
$$;

-- The one test for "may this person ask to confirm a booking": a WhatsApp contact through Laria's button, signed in,
-- in the last 180 days.
create or replace function laria_private.service_contacted(p_service_id uuid, p_user_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(created_at) from public.service_events
  where service_id = p_service_id and kind = 'contact' and actor_user_id = p_user_id
    and created_at > now() - interval '180 days'
$$;

-- Pending bookings older than 30 days lapse (lazily, whenever the pair is touched).
create or replace function laria_private.expire_service_bookings(p_service_id uuid, p_client_user_id uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.service_bookings
  set status = 'expired', responded_at = clock_timestamp()
  where service_id = p_service_id
    and (p_client_user_id is null or client_user_id = p_client_user_id)
    and status = 'pending' and created_at < now() - interval '30 days'
$$;

create or replace function laria_private.service_notify(
  p_user_id uuid, p_event_type text, p_service public.services, p_message text
) returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.notifications(user_id, event_type, service_id, message)
  values (p_user_id, p_event_type, p_service.id, p_message)
  returning id
$$;

create or replace function laria_private.service_email(
  p_event_type text, p_user_id uuid, p_dedupe_key text, p_notification_id uuid, p_service public.services,
  p_path text, p_reason text default null
) returns uuid
language sql
security definer
set search_path = public, laria_private
as $$
  select laria_private.enqueue_marketplace_email(
    p_event_type, p_user_id, p_dedupe_key, p_notification_id,
    p_context => jsonb_strip_nulls(jsonb_build_object('service_title', p_service.title, 'service_path', p_path, 'reason', p_reason))
  )
$$;

revoke all on function laria_private.service_categories() from public, anon, authenticated;
revoke all on function laria_private.service_category_slug(text) from public, anon, authenticated;
revoke all on function laria_private.service_units(text) from public, anon, authenticated;
revoke all on function laria_private.service_modalities(text) from public, anon, authenticated;
revoke all on function laria_private.service_skills(text) from public, anon, authenticated;
revoke all on function laria_private.service_skills_required(text) from public, anon, authenticated;
revoke all on function laria_private.service_text_items_ok(text[], integer, integer) from public, anon, authenticated;
revoke all on function laria_private.service_array_distinct(text[]) from public, anon, authenticated;
revoke all on function laria_private.raise_service_error(text, text) from public, anon, authenticated;
revoke all on function laria_private.service_line(text) from public, anon, authenticated;
revoke all on function laria_private.service_paragraphs(text) from public, anon, authenticated;
revoke all on function laria_private.service_place_key(text) from public, anon, authenticated;
revoke all on function laria_private.service_slug(text, uuid) from public, anon, authenticated;
revoke all on function laria_private.service_path(public.services) from public, anon, authenticated;
revoke all on function laria_private.service_is_public(public.services) from public, anon, authenticated;
revoke all on function laria_private.service_provider(public.services) from public, anon, authenticated;
revoke all on function laria_private.service_rating(uuid) from public, anon, authenticated;
revoke all on function laria_private.service_card(public.services) from public, anon, authenticated;
revoke all on function laria_private.service_contacted(uuid, uuid) from public, anon, authenticated;
revoke all on function laria_private.expire_service_bookings(uuid, uuid) from public, anon, authenticated;
revoke all on function laria_private.service_notify(uuid, text, public.services, text) from public, anon, authenticated;
revoke all on function laria_private.service_email(text, uuid, text, uuid, public.services, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ owner: save, pause, delete, read

-- Creates (p_service_id null) or edits one of the caller's services. p_fields: category (creation only), title,
-- provider_name (Particulars), description, price_from_pen, price_unit, modalities[], skills[], city, region,
-- district, areas[], whatsapp_phone, photo_paths[]. A new service waits for Admin. Editing an approved or paused one
-- applies at once; a change of title, description, name or photos marks it for Admin to look again while it stays
-- public. Saving a rejected or hidden service sends it back to review.
create or replace function public.save_service(p_service_id uuid, p_fields jsonb, p_expected_version integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  profile_row public.profiles;
  store_row public.stores;
  current_row public.services;
  result_row public.services;
  v_category text;
  v_title text;
  v_provider text;
  v_description text;
  v_price integer;
  v_unit text;
  v_modalities text[];
  v_skills text[];
  v_city text;
  v_region text;
  v_district text;
  v_areas text[];
  v_phone text;
  v_photos text[];
  v_status text;
  v_reason text;
  v_recheck boolean;
  new_id uuid;
  path text;
  moderated_change boolean := false;
begin
  if caller is null then
    perform laria_private.raise_service_error('SERVICE_AUTH_REQUIRED', 'Ingresa para ofrecer un servicio.');
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    perform laria_private.raise_service_error('SERVICE_INVALID', 'Revisa los datos del servicio.');
  end if;

  select * into profile_row from public.profiles where id = caller;
  if profile_row.id is null then
    perform laria_private.raise_service_error('SERVICE_PROFILE_REQUIRED', 'Completa tu perfil antes de ofrecer un servicio.');
  end if;
  if profile_row.account_type = 'store_owner' then
    select * into store_row from public.stores where owner_user_id = caller order by created_at limit 1;
    if store_row.id is null then
      perform laria_private.raise_service_error('SERVICE_STORE_REQUIRED', 'Primero envía la solicitud de tu tienda.');
    end if;
  end if;

  if p_service_id is not null then
    select * into current_row from public.services where id = p_service_id for update;
    if current_row.id is null or current_row.owner_user_id <> caller then
      perform laria_private.raise_service_error('SERVICE_NOT_FOUND', 'Este servicio ya no está disponible.');
    end if;
    if p_expected_version is not null and p_expected_version <> current_row.version then
      perform laria_private.raise_service_error('SERVICE_STALE', 'Este servicio cambió en otra pestaña. Recarga la página para ver la última versión.');
    end if;
    v_category := current_row.category;
    if p_fields ? 'category' and p_fields->>'category' is distinct from v_category then
      perform laria_private.raise_service_error('SERVICE_CATEGORY_FIXED', 'La categoría no se puede cambiar. Crea otro servicio para otra categoría.');
    end if;
  else
    v_category := p_fields->>'category';
    if v_category is null or not v_category = any (laria_private.service_categories()) then
      perform laria_private.raise_service_error('SERVICE_CATEGORY_INVALID', 'Elige qué tipo de servicio ofreces.');
    end if;
    if exists (select 1 from public.services where owner_user_id = caller and category = v_category) then
      perform laria_private.raise_service_error('SERVICE_CATEGORY_TAKEN', 'Ya ofreces un servicio de esta categoría. Edítalo desde Mi cuenta › Servicios.');
    end if;
  end if;

  v_title := laria_private.service_line(p_fields->>'title');
  if char_length(v_title) not between 8 and 90 then
    perform laria_private.raise_service_error('SERVICE_TITLE_LENGTH', 'El título debe tener entre 8 y 90 caracteres.');
  end if;

  if store_row.id is not null then
    v_provider := store_row.name;
  else
    v_provider := laria_private.service_line(coalesce(p_fields->>'provider_name', profile_row.full_name));
    if char_length(v_provider) not between 2 and 80 then
      perform laria_private.raise_service_error('SERVICE_PROVIDER_LENGTH', 'El nombre debe tener entre 2 y 80 caracteres.');
    end if;
  end if;

  v_description := laria_private.service_paragraphs(p_fields->>'description');
  if char_length(v_description) not between 40 and 2000 then
    perform laria_private.raise_service_error('SERVICE_DESCRIPTION_LENGTH', 'La descripción debe tener entre 40 y 2000 caracteres.');
  end if;

  -- The WhatsApp button is the only way to reach the provider: no numbers, links or e-mails in the text.
  if laria_private.text_has_contact_details(v_title) or laria_private.text_has_contact_details(v_description)
     or (store_row.id is null and laria_private.text_has_contact_details(v_provider)) then
    perform laria_private.raise_service_error('SERVICE_CONTACT_DETAILS',
      'No escribas números de teléfono, enlaces ni correos en el servicio. Los músicos te escriben con el botón de WhatsApp.');
  end if;

  begin
    v_price := (p_fields->>'price_from_pen')::integer;
  exception when others then
    v_price := null;
  end;
  if v_price is null or v_price not between 1 and 100000 then
    perform laria_private.raise_service_error('SERVICE_PRICE_INVALID', 'Indica un precio desde, en soles, entre S/ 1 y S/ 100,000.');
  end if;

  v_unit := p_fields->>'price_unit';
  if v_unit is null or not v_unit = any (laria_private.service_units(v_category)) then
    perform laria_private.raise_service_error('SERVICE_UNIT_INVALID', 'Elige por qué se cobra el precio.');
  end if;

  if jsonb_typeof(p_fields->'modalities') is distinct from 'array' then
    v_modalities := '{}';
  else
    select coalesce(array_agg(distinct value order by value), '{}') into v_modalities from jsonb_array_elements_text(p_fields->'modalities') value;
  end if;
  if cardinality(v_modalities) = 0 or not v_modalities <@ laria_private.service_modalities(v_category) then
    perform laria_private.raise_service_error('SERVICE_MODALITY_INVALID', 'Indica dónde das el servicio.');
  end if;

  if jsonb_typeof(p_fields->'skills') is distinct from 'array' then
    v_skills := '{}';
  else
    select coalesce(array_agg(distinct value order by value), '{}') into v_skills from jsonb_array_elements_text(p_fields->'skills') value;
  end if;
  if not v_skills <@ laria_private.service_skills(v_category) or cardinality(v_skills) > 8
     or (laria_private.service_skills_required(v_category) and cardinality(v_skills) = 0) then
    perform laria_private.raise_service_error('SERVICE_SKILLS_INVALID',
      case when v_category = 'clases' then 'Elige entre 1 y 8 instrumentos o temas que enseñas.' else 'Elige entre 1 y 8 instrumentos o equipos que reparas.' end);
  end if;

  v_city := laria_private.service_line(p_fields->>'city');
  if char_length(v_city) not between 2 and 60 then
    perform laria_private.raise_service_error('SERVICE_CITY_REQUIRED', 'Indica la ciudad donde das el servicio.');
  end if;
  v_region := nullif(laria_private.service_line(p_fields->>'region'), '');
  if v_region is not null and char_length(v_region) not between 2 and 40 then
    perform laria_private.raise_service_error('SERVICE_REGION_INVALID', 'Revisa la región.');
  end if;
  v_district := nullif(laria_private.service_line(p_fields->>'district'), '');
  if v_district is not null and char_length(v_district) not between 2 and 60 then
    perform laria_private.raise_service_error('SERVICE_DISTRICT_INVALID', 'Revisa el distrito.');
  end if;

  if jsonb_typeof(p_fields->'areas') is distinct from 'array' then
    v_areas := '{}';
  else
    -- Kept in the owner's order, the first spelling of each place.
    select coalesce(array_agg(area order by first_position), '{}') into v_areas
    from (
      select min(position) as first_position, (array_agg(area order by position))[1] as area
      from (
        select laria_private.service_line(value) as area, position
        from jsonb_array_elements_text(p_fields->'areas') with ordinality as item(value, position)
      ) cleaned
      where area <> ''
      group by laria_private.service_place_key(area)
    ) places;
  end if;
  if cardinality(v_areas) > 12 or not laria_private.service_text_items_ok(v_areas, 2, 60) then
    perform laria_private.raise_service_error('SERVICE_AREAS_INVALID', 'Indica hasta 12 zonas, de 2 a 60 caracteres cada una.');
  end if;

  v_phone := laria_private.normalize_pe_phone(coalesce(p_fields->>'whatsapp_phone', case when store_row.id is not null then store_row.whatsapp_phone else profile_row.phone end));
  if v_phone is null or v_phone !~ '^[0-9]{10,15}$' then
    perform laria_private.raise_service_error('SERVICE_PHONE_INVALID', 'Indica un número de WhatsApp válido.');
  end if;

  if jsonb_typeof(p_fields->'photo_paths') is distinct from 'array' then
    v_photos := coalesce(current_row.photo_paths, '{}');
  else
    select coalesce(array_agg(value order by position), '{}') into v_photos
    from jsonb_array_elements_text(p_fields->'photo_paths') with ordinality as item(value, position);
  end if;
  if cardinality(v_photos) > 6 or not laria_private.service_array_distinct(v_photos) then
    perform laria_private.raise_service_error('SERVICE_PHOTOS_INVALID', 'Puedes subir hasta 6 fotos.');
  end if;
  foreach path in array v_photos loop
    -- A photo already on the service stays valid; a new one must be the caller's own upload.
    if current_row.id is not null and path = any (current_row.photo_paths) then continue; end if;
    if path !~ ('^' || caller::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'service-photos' and o.name = path) then
      perform laria_private.raise_service_error('SERVICE_PHOTOS_INVALID', 'Una de las fotos no se subió bien. Quítala y vuelve a subirla.');
    end if;
  end loop;

  if current_row.id is null then
    new_id := gen_random_uuid();
    insert into public.services(
      id, owner_user_id, store_id, category, slug, title, provider_name, description, price_from_pen, price_unit,
      modalities, skills, city, region, district, areas, whatsapp_phone, photo_paths
    ) values (
      new_id, caller, store_row.id, v_category, laria_private.service_slug(v_title, new_id), v_title, v_provider,
      v_description, v_price, v_unit, v_modalities, v_skills, v_city, v_region, v_district, v_areas, v_phone, v_photos
    )
    returning * into result_row;
  else
    moderated_change := v_title is distinct from current_row.title
      or v_description is distinct from current_row.description
      or v_provider is distinct from current_row.provider_name
      or v_photos is distinct from current_row.photo_paths;
    v_status := current_row.status;
    v_reason := current_row.moderation_reason;
    v_recheck := current_row.needs_recheck;
    if current_row.status in ('rejected', 'hidden') then
      v_status := 'pending';
      v_reason := null;
      v_recheck := false;
    elsif current_row.status in ('approved', 'paused') and moderated_change then
      v_recheck := true;
    end if;
    update public.services set
      store_id = coalesce(store_row.id, store_id),
      title = v_title,
      provider_name = v_provider,
      description = v_description,
      price_from_pen = v_price,
      price_unit = v_unit,
      modalities = v_modalities,
      skills = v_skills,
      city = v_city,
      region = v_region,
      district = v_district,
      areas = v_areas,
      whatsapp_phone = v_phone,
      photo_paths = v_photos,
      status = v_status,
      moderation_reason = v_reason,
      needs_recheck = v_recheck,
      version = version + 1,
      updated_at = clock_timestamp()
    where id = current_row.id
    returning * into result_row;
  end if;

  return jsonb_build_object(
    'id', result_row.id, 'slug', result_row.slug, 'category', result_row.category, 'status', result_row.status,
    'needs_recheck', result_row.needs_recheck, 'version', result_row.version, 'path', laria_private.service_path(result_row)
  );
end;
$$;

revoke all on function public.save_service(uuid, jsonb, integer) from public, anon;
grant execute on function public.save_service(uuid, jsonb, integer) to authenticated;

-- "Pausar" takes an approved service off the directory; "Reanudar" puts it back as it was approved.
create or replace function public.set_service_paused(p_service_id uuid, p_paused boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  row_now public.services;
begin
  if caller is null then
    perform laria_private.raise_service_error('SERVICE_AUTH_REQUIRED', 'Ingresa para administrar tus servicios.');
  end if;
  select * into row_now from public.services where id = p_service_id for update;
  if row_now.id is null or row_now.owner_user_id <> caller then
    perform laria_private.raise_service_error('SERVICE_NOT_FOUND', 'Este servicio ya no está disponible.');
  end if;
  if (p_paused and row_now.status <> 'approved') or (not p_paused and row_now.status <> 'paused') then
    perform laria_private.raise_service_error('SERVICE_STATUS_INVALID',
      case when p_paused then 'Solo puedes pausar un servicio publicado.' else 'Este servicio no está pausado.' end);
  end if;
  update public.services
  set status = case when p_paused then 'paused' else 'approved' end, version = version + 1, updated_at = clock_timestamp()
  where id = p_service_id
  returning * into row_now;
  return jsonb_build_object('id', row_now.id, 'status', row_now.status, 'version', row_now.version);
end;
$$;

revoke all on function public.set_service_paused(uuid, boolean) from public, anon;
grant execute on function public.set_service_paused(uuid, boolean) to authenticated;

-- Leaving is as easy as joining, without erasing what clients said: a service with a confirmed client or a review can
-- only be paused, so deleting and starting again never wipes its reviews.
create or replace function public.delete_service(p_service_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  row_now public.services;
begin
  if caller is null then
    perform laria_private.raise_service_error('SERVICE_AUTH_REQUIRED', 'Ingresa para administrar tus servicios.');
  end if;
  select * into row_now from public.services where id = p_service_id for update;
  if row_now.id is null or row_now.owner_user_id <> caller then
    perform laria_private.raise_service_error('SERVICE_NOT_FOUND', 'Este servicio ya no está disponible.');
  end if;
  if exists (select 1 from public.service_bookings where service_id = p_service_id and status = 'confirmed')
     or exists (select 1 from public.service_reviews where service_id = p_service_id) then
    perform laria_private.raise_service_error('SERVICE_HAS_HISTORY',
      'Este servicio tiene clientes confirmados o reseñas, así que no se puede eliminar. Puedes pausarlo para que deje de mostrarse.');
  end if;
  delete from public.services where id = p_service_id;
  return true;
end;
$$;

revoke all on function public.delete_service(uuid) from public, anon;
grant execute on function public.delete_service(uuid) to authenticated;

-- The owner's row as the edit form needs it.
create or replace function laria_private.service_owner_json(p_service public.services)
returns jsonb
language sql
stable
security definer
set search_path = public, laria_private
as $$
  select jsonb_build_object(
    'id', p_service.id,
    'slug', p_service.slug,
    'category', p_service.category,
    'path', laria_private.service_path(p_service),
    'title', p_service.title,
    'provider_name', p_service.provider_name,
    'provider', laria_private.service_provider(p_service),
    'is_store', p_service.store_id is not null,
    'description', p_service.description,
    'price_from_pen', p_service.price_from_pen,
    'price_unit', p_service.price_unit,
    'modalities', to_jsonb(p_service.modalities),
    'skills', to_jsonb(p_service.skills),
    'city', p_service.city,
    'region', p_service.region,
    'district', p_service.district,
    'areas', to_jsonb(p_service.areas),
    'whatsapp_phone', p_service.whatsapp_phone,
    'photo_paths', to_jsonb(p_service.photo_paths),
    'status', p_service.status,
    'public', laria_private.service_is_public(p_service),
    'moderation_reason', p_service.moderation_reason,
    'needs_recheck', p_service.needs_recheck,
    'version', p_service.version,
    'approved_at', p_service.approved_at,
    'created_at', p_service.created_at,
    'updated_at', p_service.updated_at
  )
$$;

revoke all on function laria_private.service_owner_json(public.services) from public, anon, authenticated;

-- Mi cuenta › Servicios: the caller's services with their figures (views and contacts in the last 30 days and in
-- total, reviews) and how many confirmations wait for them.
create or replace function public.get_my_services()
returns jsonb
language sql
stable
security definer
set search_path = public, laria_private
as $$
  select coalesce(jsonb_agg(laria_private.service_owner_json(s) || jsonb_build_object(
      'stats', jsonb_build_object(
        'views_30d', (select count(*) from public.service_events e where e.service_id = s.id and e.kind = 'view' and e.created_at > now() - interval '30 days'),
        'contacts_30d', (select count(*) from public.service_events e where e.service_id = s.id and e.kind = 'contact' and e.created_at > now() - interval '30 days'),
        'contacts_total', (select count(*) from public.service_events e where e.service_id = s.id and e.kind = 'contact')),
      'rating', laria_private.service_rating(s.id),
      'confirmed_clients', (select count(*) from public.service_bookings b where b.service_id = s.id and b.status = 'confirmed'),
      'can_delete', not exists (select 1 from public.service_bookings b where b.service_id = s.id and b.status = 'confirmed')
        and not exists (select 1 from public.service_reviews r where r.service_id = s.id)
    ) order by s.created_at), '[]'::jsonb)
  from public.services s
  where s.owner_user_id = auth.uid()
$$;

revoke all on function public.get_my_services() from public, anon;
grant execute on function public.get_my_services() to authenticated;

create or replace function public.get_my_service(p_service_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, laria_private
as $$
  select laria_private.service_owner_json(s) from public.services s
  where s.id = p_service_id and s.owner_user_id = auth.uid()
$$;

revoke all on function public.get_my_service(uuid) from public, anon;
grant execute on function public.get_my_service(uuid) to authenticated;

-- ------------------------------------------------------------------ events (service role)

-- Called by /api/services/events with the server's signed session and the signed-in account (if any). A view counts
-- once per person or session per 30 minutes; every WhatsApp press is a contact (at most 20 per person and service a
-- day). The owner's own visits and presses, and Admin's, never count. Only public services record anything.
create or replace function public.record_service_event(
  p_event_id uuid, p_service_id uuid, p_kind text, p_actor_user_id uuid, p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  service_row public.services;
  identity uuid := coalesce(p_actor_user_id, p_session_id);
begin
  if auth.role() is distinct from 'service_role' then
    perform laria_private.raise_service_error('SERVICE_SERVICE_REQUIRED', 'Solo el servidor registra estas visitas.');
  end if;
  if p_event_id is null or p_service_id is null or p_session_id is null or p_kind not in ('view', 'contact') then
    return jsonb_build_object('recorded', false, 'reason', 'invalid');
  end if;
  if exists (select 1 from public.service_events where id = p_event_id) then
    return jsonb_build_object('recorded', true, 'reason', 'duplicate');
  end if;
  select * into service_row from public.services where id = p_service_id;
  if service_row.id is null or not laria_private.service_is_public(service_row) then
    return jsonb_build_object('recorded', false, 'reason', 'unavailable');
  end if;
  if p_actor_user_id is not null and (
    p_actor_user_id = service_row.owner_user_id
    or exists (select 1 from auth.users u where u.id = p_actor_user_id and u.raw_app_meta_data->>'role' = 'admin')
  ) then
    return jsonb_build_object('recorded', false, 'reason', 'owner');
  end if;
  if p_actor_user_id is not null and not exists (select 1 from public.profiles where id = p_actor_user_id) then
    p_actor_user_id := null;
    identity := p_session_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('service_event:' || p_service_id::text || ':' || identity::text, 0));
  if p_kind = 'view' and exists (
    select 1 from public.service_events
    where service_id = p_service_id and kind = 'view' and coalesce(actor_user_id, session_id) = identity
      and created_at > now() - interval '30 minutes'
  ) then
    return jsonb_build_object('recorded', false, 'reason', 'recent');
  end if;
  if p_kind = 'contact' and (
    select count(*) from public.service_events
    where service_id = p_service_id and kind = 'contact' and coalesce(actor_user_id, session_id) = identity
      and created_at > now() - interval '24 hours'
  ) >= 20 then
    return jsonb_build_object('recorded', false, 'reason', 'limit');
  end if;

  insert into public.service_events(id, service_id, kind, actor_user_id, session_id)
  values (p_event_id, p_service_id, p_kind, p_actor_user_id, p_session_id)
  on conflict (id) do nothing;
  return jsonb_build_object('recorded', true);
end;
$$;

revoke all on function public.record_service_event(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_service_event(uuid, uuid, text, uuid, uuid) to service_role;

-- ------------------------------------------------------------------ bookings

-- The provider picks a client among the signed-in people who wrote through Laria's button in the last 180 days (never
-- a user directory): first name and initial, the last contact, the last three digits of their WhatsApp.
create or replace function public.get_service_booking_candidates(p_service_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  items jsonb;
begin
  if caller is null or not exists (select 1 from public.services where id = p_service_id and owner_user_id = caller) then
    perform laria_private.raise_service_error('SERVICE_NOT_FOUND', 'Este servicio ya no está disponible.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', c.actor_user_id,
      'name', laria_private.question_display_name(p.full_name),
      'last_contact_at', c.last_contact_at,
      'phone_tail', nullif(right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 3), '')
    ) order by c.last_contact_at desc), '[]'::jsonb)
  into items
  from (
    select e.actor_user_id, max(e.created_at) as last_contact_at
    from public.service_events e
    where e.service_id = p_service_id and e.kind = 'contact' and e.actor_user_id is not null
      and e.actor_user_id <> caller and e.created_at > now() - interval '180 days'
    group by e.actor_user_id
    order by max(e.created_at) desc
    limit 50
  ) c
  join public.profiles p on p.id = c.actor_user_id
  where not exists (
    select 1 from public.service_bookings b
    where b.service_id = p_service_id and b.client_user_id = c.actor_user_id
      and (b.status in ('confirmed', 'declined') or (b.status = 'pending' and b.created_at > now() - interval '30 days'))
  );
  return items;
end;
$$;

revoke all on function public.get_service_booking_candidates(uuid) from public, anon;
grant execute on function public.get_service_booking_candidates(uuid) to authenticated;

-- Shared checks for a new booking between this service and this client.
create or replace function laria_private.assert_service_bookable(p_service public.services, p_client_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, laria_private
as $$
begin
  if p_service.approved_at is null or p_service.status not in ('approved', 'paused') then
    perform laria_private.raise_service_error('SERVICE_NOT_BOOKABLE', 'Este servicio todavía no está publicado.');
  end if;
  if p_client_user_id = p_service.owner_user_id then
    perform laria_private.raise_service_error('SERVICE_OWN_SERVICE', 'No puedes confirmar tu propio servicio.');
  end if;
  if laria_private.service_contacted(p_service.id, p_client_user_id) is null then
    perform laria_private.raise_service_error('SERVICE_CONTACT_REQUIRED',
      'Solo se confirman contrataciones de quienes escribieron por WhatsApp desde Laria con su cuenta, en los últimos 180 días.');
  end if;
  perform laria_private.expire_service_bookings(p_service.id, p_client_user_id);
  if exists (select 1 from public.service_bookings where service_id = p_service.id and client_user_id = p_client_user_id and status = 'declined') then
    perform laria_private.raise_service_error('SERVICE_BOOKING_DECLINED', 'Esta contratación ya se respondió con un no, así que no se puede volver a pedir.');
  end if;
  if exists (select 1 from public.service_bookings where service_id = p_service.id and client_user_id = p_client_user_id and status in ('pending', 'confirmed')) then
    perform laria_private.raise_service_error('SERVICE_BOOKING_EXISTS', 'Ya hay una confirmación en curso o hecha para este servicio.');
  end if;
end;
$$;

revoke all on function laria_private.assert_service_bookable(public.services, uuid) from public, anon, authenticated;

-- The provider asks a client to confirm. The client hears it in the app and by e-mail.
create or replace function public.request_service_booking(p_service_id uuid, p_client_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  service_row public.services;
  booking_row public.service_bookings;
  provider jsonb;
  notification_uuid uuid;
begin
  if caller is null then
    perform laria_private.raise_service_error('SERVICE_AUTH_REQUIRED', 'Ingresa para confirmar un cliente.');
  end if;
  select * into service_row from public.services where id = p_service_id;
  if service_row.id is null or service_row.owner_user_id <> caller then
    perform laria_private.raise_service_error('SERVICE_NOT_FOUND', 'Este servicio ya no está disponible.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('service_booking:' || p_service_id::text || ':' || coalesce(p_client_user_id::text, ''), 0));
  if p_client_user_id is null then
    perform laria_private.raise_service_error('SERVICE_CONTACT_REQUIRED', 'Elige a una persona de la lista.');
  end if;
  perform laria_private.assert_service_bookable(service_row, p_client_user_id);
  if (select count(*) from public.service_bookings where provider_user_id = caller and requested_by = 'provider'
      and created_at > now() - interval '24 hours') >= 30 then
    perform laria_private.raise_service_error('SERVICE_BOOKING_LIMIT', 'Llegaste al límite de 30 confirmaciones por día. Vuelve a intentarlo mañana.');
  end if;

  insert into public.service_bookings(service_id, provider_user_id, client_user_id, requested_by)
  values (service_row.id, caller, p_client_user_id, 'provider')
  returning * into booking_row;

  provider := laria_private.service_provider(service_row);
  notification_uuid := laria_private.service_notify(p_client_user_id, 'service_booking_requested', service_row,
    (provider->>'name') || ' te pide confirmar que contrataste “' || laria_private.question_snippet(service_row.title, 80) || '”.');
  perform laria_private.service_email('service_booking_requested', p_client_user_id, 'service_booking:' || booking_row.id::text,
    notification_uuid, service_row, '/mi-cuenta/servicios#contrataciones');
  return jsonb_build_object('id', booking_row.id, 'status', booking_row.status);
end;
$$;

revoke all on function public.request_service_booking(uuid, uuid) from public, anon;
grant execute on function public.request_service_booking(uuid, uuid) to authenticated;

-- "Contraté este servicio": the client asks the provider to confirm.
create or replace function public.claim_service_booking(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  service_row public.services;
  booking_row public.service_bookings;
  client_name text;
  notification_uuid uuid;
begin
  if caller is null then
    perform laria_private.raise_service_error('SERVICE_AUTH_REQUIRED', 'Ingresa para confirmar que contrataste este servicio.');
  end if;
  select * into service_row from public.services where id = p_service_id;
  if service_row.id is null then
    perform laria_private.raise_service_error('SERVICE_NOT_FOUND', 'Este servicio ya no está disponible.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('service_booking:' || p_service_id::text || ':' || caller::text, 0));
  perform laria_private.assert_service_bookable(service_row, caller);

  insert into public.service_bookings(service_id, provider_user_id, client_user_id, requested_by)
  values (service_row.id, service_row.owner_user_id, caller, 'client')
  returning * into booking_row;

  select laria_private.question_display_name(full_name) into client_name from public.profiles where id = caller;
  notification_uuid := laria_private.service_notify(service_row.owner_user_id, 'service_booking_requested', service_row,
    client_name || ' dice que contrató “' || laria_private.question_snippet(service_row.title, 80) || '”. Confírmalo para que pueda dejar su reseña.');
  perform laria_private.service_email('service_booking_requested', service_row.owner_user_id, 'service_booking:' || booking_row.id::text,
    notification_uuid, service_row, '/mi-cuenta/servicios#contrataciones');
  return jsonb_build_object('id', booking_row.id, 'status', booking_row.status);
end;
$$;

revoke all on function public.claim_service_booking(uuid) from public, anon;
grant execute on function public.claim_service_booking(uuid) to authenticated;

-- The other side answers. Yes opens a 30-day review window for the client; no is final for that pair.
create or replace function public.respond_service_booking(p_booking_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  booking_row public.service_bookings;
  service_row public.services;
  responder uuid;
  requester uuid;
  responder_name text;
  notification_uuid uuid;
begin
  if caller is null then
    perform laria_private.raise_service_error('SERVICE_AUTH_REQUIRED', 'Ingresa para responder.');
  end if;
  if p_accept is null then
    perform laria_private.raise_service_error('SERVICE_INVALID', 'Elige sí o no.');
  end if;
  select * into booking_row from public.service_bookings where id = p_booking_id for update;
  if booking_row.id is null or caller not in (booking_row.provider_user_id, booking_row.client_user_id) then
    perform laria_private.raise_service_error('SERVICE_BOOKING_NOT_FOUND', 'Esta confirmación ya no está disponible.');
  end if;
  responder := case when booking_row.requested_by = 'provider' then booking_row.client_user_id else booking_row.provider_user_id end;
  requester := case when booking_row.requested_by = 'provider' then booking_row.provider_user_id else booking_row.client_user_id end;
  if caller <> responder then
    perform laria_private.raise_service_error('SERVICE_BOOKING_FORBIDDEN', 'Esta confirmación la responde la otra persona.');
  end if;
  -- A request older than 30 days has lapsed (stored as such the next time the pair is touched).
  if booking_row.status = 'pending' and booking_row.created_at < now() - interval '30 days' then
    perform laria_private.raise_service_error('SERVICE_BOOKING_EXPIRED', 'Esta confirmación venció después de 30 días.');
  end if;
  if booking_row.status <> 'pending' then
    perform laria_private.raise_service_error('SERVICE_BOOKING_ANSWERED', 'Esta confirmación ya se respondió.');
  end if;

  update public.service_bookings
  set status = case when p_accept then 'confirmed' else 'declined' end,
      responded_at = clock_timestamp(),
      confirmed_at = case when p_accept then clock_timestamp() end,
      review_deadline = case when p_accept then clock_timestamp() + interval '30 days' end
  where id = p_booking_id
  returning * into booking_row;

  select * into service_row from public.services where id = booking_row.service_id;
  responder_name := case when responder = booking_row.provider_user_id
    then laria_private.service_provider(service_row)->>'name'
    else (select laria_private.question_display_name(full_name) from public.profiles where id = responder) end;

  if p_accept then
    notification_uuid := laria_private.service_notify(requester, 'service_booking_confirmed', service_row,
      case when requester = booking_row.client_user_id
        then responder_name || ' confirmó tu contratación de “' || laria_private.question_snippet(service_row.title, 80) || '”. Ya puedes dejar tu reseña.'
        else responder_name || ' confirmó que contrató “' || laria_private.question_snippet(service_row.title, 80) || '”.' end);
    -- The client is told by e-mail too, because the review window starts now.
    if requester = booking_row.client_user_id then
      perform laria_private.service_email('service_booking_confirmed', requester, 'service_booking_confirmed:' || booking_row.id::text,
        notification_uuid, service_row, '/mi-cuenta/servicios#contrataciones');
    end if;
  else
    perform laria_private.service_notify(requester, 'service_booking_declined', service_row,
      responder_name || ' indicó que no hubo contratación de “' || laria_private.question_snippet(service_row.title, 80) || '”.');
  end if;
  return jsonb_build_object('id', booking_row.id, 'status', booking_row.status, 'review_deadline', booking_row.review_deadline);
end;
$$;

revoke all on function public.respond_service_booking(uuid, boolean) from public, anon;
grant execute on function public.respond_service_booking(uuid, boolean) to authenticated;

-- Whoever asked can withdraw the request while it waits.
create or replace function public.cancel_service_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  booking_row public.service_bookings;
begin
  if caller is null then
    perform laria_private.raise_service_error('SERVICE_AUTH_REQUIRED', 'Ingresa para cancelar.');
  end if;
  select * into booking_row from public.service_bookings where id = p_booking_id for update;
  if booking_row.id is null or caller not in (booking_row.provider_user_id, booking_row.client_user_id) then
    perform laria_private.raise_service_error('SERVICE_BOOKING_NOT_FOUND', 'Esta confirmación ya no está disponible.');
  end if;
  if caller <> (case when booking_row.requested_by = 'provider' then booking_row.provider_user_id else booking_row.client_user_id end) then
    perform laria_private.raise_service_error('SERVICE_BOOKING_FORBIDDEN', 'Solo quien pidió la confirmación puede cancelarla.');
  end if;
  if booking_row.status <> 'pending' then
    perform laria_private.raise_service_error('SERVICE_BOOKING_ANSWERED', 'Esta confirmación ya se respondió.');
  end if;
  update public.service_bookings set status = 'cancelled', responded_at = clock_timestamp()
  where id = p_booking_id returning * into booking_row;
  return jsonb_build_object('id', booking_row.id, 'status', booking_row.status);
end;
$$;

revoke all on function public.cancel_service_booking(uuid) from public, anon;
grant execute on function public.cancel_service_booking(uuid) to authenticated;

-- Every booking the caller is part of, as provider or client: the open ones, the confirmed ones and those answered in
-- the last 90 days, newest first (up to 100). A pending booking past 30 days reads as expired.
create or replace function public.get_my_service_bookings()
returns jsonb
language sql
stable
security definer
set search_path = public, laria_private
as $$
  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
  from (
    select b.created_at, jsonb_build_object(
      'id', b.id,
      'role', case when b.provider_user_id = auth.uid() then 'provider' else 'client' end,
      'requested_by', b.requested_by,
      'status', case when b.status = 'pending' and b.created_at < now() - interval '30 days' then 'expired' else b.status end,
      'created_at', b.created_at,
      'confirmed_at', b.confirmed_at,
      'review_deadline', b.review_deadline,
      'service', jsonb_build_object('id', s.id, 'title', s.title, 'category', s.category, 'path', laria_private.service_path(s),
        'public', laria_private.service_is_public(s), 'provider_name', laria_private.service_provider(s)->>'name'),
      'other_name', case when b.provider_user_id = auth.uid()
        then laria_private.question_display_name(client.full_name)
        else laria_private.service_provider(s)->>'name' end,
      'review', (select jsonb_build_object('id', r.id, 'rating', r.rating, 'comment', r.comment, 'status', r.status, 'created_at', r.created_at)
        from public.service_reviews r where r.booking_id = b.id),
      'client_has_review', exists (select 1 from public.service_reviews r where r.service_id = b.service_id and r.client_user_id = b.client_user_id)
    ) as item
    from public.service_bookings b
    join public.services s on s.id = b.service_id
    join public.profiles client on client.id = b.client_user_id
    where auth.uid() in (b.provider_user_id, b.client_user_id)
      and (b.status in ('pending', 'confirmed') or b.responded_at > now() - interval '90 days')
    order by b.created_at desc
    limit 100
  ) rows
$$;

revoke all on function public.get_my_service_bookings() from public, anon;
grant execute on function public.get_my_service_bookings() to authenticated;

-- ------------------------------------------------------------------ reviews

create or replace function public.submit_service_review(p_booking_id uuid, p_rating integer, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  booking_row public.service_bookings;
  service_row public.services;
  clean_comment text := nullif(laria_private.service_paragraphs(p_comment), '');
  review_row public.service_reviews;
begin
  if caller is null then
    perform laria_private.raise_service_error('SERVICE_AUTH_REQUIRED', 'Ingresa para dejar tu reseña.');
  end if;
  select * into booking_row from public.service_bookings where id = p_booking_id for update;
  if booking_row.id is null or booking_row.client_user_id <> caller then
    perform laria_private.raise_service_error('SERVICE_BOOKING_NOT_FOUND', 'Esta contratación ya no está disponible.');
  end if;
  if booking_row.status <> 'confirmed' then
    perform laria_private.raise_service_error('SERVICE_REVIEW_LOCKED', 'Podrás reseñar cuando ambos confirmen la contratación.');
  end if;
  if clock_timestamp() > booking_row.review_deadline then
    perform laria_private.raise_service_error('SERVICE_REVIEW_CLOSED', 'El plazo de 30 días para reseñar terminó.');
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    perform laria_private.raise_service_error('SERVICE_RATING_INVALID', 'Elige de 1 a 5 estrellas.');
  end if;
  if clean_comment is not null and char_length(clean_comment) not between 2 and 1000 then
    perform laria_private.raise_service_error('SERVICE_COMMENT_LENGTH', 'El comentario puede tener hasta 1000 caracteres.');
  end if;
  if laria_private.text_has_contact_details(clean_comment) then
    perform laria_private.raise_service_error('SERVICE_CONTACT_DETAILS', 'No escribas números de teléfono, enlaces ni correos en la reseña.');
  end if;
  if exists (select 1 from public.service_reviews where service_id = booking_row.service_id and client_user_id = caller) then
    perform laria_private.raise_service_error('SERVICE_REVIEW_EXISTS', 'Ya dejaste una reseña para este servicio.');
  end if;

  insert into public.service_reviews(booking_id, service_id, client_user_id, rating, comment)
  values (booking_row.id, booking_row.service_id, caller, p_rating, clean_comment)
  returning * into review_row;

  select * into service_row from public.services where id = booking_row.service_id;
  perform laria_private.service_notify(service_row.owner_user_id, 'service_review_received', service_row,
    'Recibiste una reseña de ' || p_rating || ' de 5 en “' || laria_private.question_snippet(service_row.title, 80) || '”.');
  return jsonb_build_object('id', review_row.id, 'created_at', review_row.created_at);
end;
$$;

revoke all on function public.submit_service_review(uuid, integer, text) from public, anon;
grant execute on function public.submit_service_review(uuid, integer, text) to authenticated;

-- ------------------------------------------------------------------ public reads

-- The directory. p_filters: category, city (matches the service's city or one of its areas, accents and case
-- aside), modality, skill, sort ('recientes' newest approval first, 'valorados' best average with at least one
-- review first, 'precio' lowest starting price first). Pages of up to 48.
create or replace function public.get_public_services(p_filters jsonb default '{}'::jsonb, p_page integer default 1, p_page_size integer default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
declare
  f jsonb := case when jsonb_typeof(p_filters) = 'object' then p_filters else '{}'::jsonb end;
  v_category text := nullif(f->>'category', '');
  v_city text := nullif(laria_private.service_place_key(f->>'city'), '');
  v_modality text := nullif(f->>'modality', '');
  v_skill text := nullif(f->>'skill', '');
  v_sort text := coalesce(nullif(f->>'sort', ''), 'recientes');
  size integer := least(greatest(coalesce(p_page_size, 24), 1), 48);
  page integer := least(greatest(coalesce(p_page, 1), 1), 500);
  total bigint;
  items jsonb;
begin
  if v_sort not in ('recientes', 'valorados', 'precio') then v_sort := 'recientes'; end if;
  with matching as (
    select s as svc, s.id, s.price_from_pen, s.approved_at, r.count as review_count, r.average as review_average
    from public.services s
    cross join lateral (
      select count(*) as count, avg(rv.rating) as average from public.service_reviews rv
      where rv.service_id = s.id and rv.status = 'visible'
    ) r
    where s.status = 'approved'
      and (s.store_id is null or exists (select 1 from public.stores st where st.id = s.store_id and st.status = 'active'))
      and (v_category is null or s.category = v_category)
      and (v_modality is null or v_modality = any (s.modalities))
      and (v_skill is null or v_skill = any (s.skills))
      and (v_city is null or laria_private.service_place_key(s.city) = v_city
        or exists (select 1 from unnest(s.areas) area where laria_private.service_place_key(area) = v_city))
  )
  select (select count(*) from matching),
    coalesce((select jsonb_agg(laria_private.service_card(page_rows.svc) order by ordinal) from (
      select m.svc, row_number() over (order by
        case when v_sort = 'valorados' then (m.review_count > 0)::int end desc nulls last,
        case when v_sort = 'valorados' then m.review_average end desc nulls last,
        case when v_sort = 'valorados' then m.review_count end desc nulls last,
        case when v_sort = 'precio' then m.price_from_pen end asc nulls last,
        m.approved_at desc, m.id) as ordinal
      from matching m
      order by ordinal
      offset (page - 1) * size
      limit size
    ) page_rows), '[]'::jsonb)
  into total, items;
  return jsonb_build_object('total', total, 'page', page, 'page_size', size, 'items', items);
end;
$$;

revoke all on function public.get_public_services(jsonb, integer, integer) from public;
grant execute on function public.get_public_services(jsonb, integer, integer) to anon, authenticated;

-- Counts for the directory's chips: public services per category, and per city (the service's own city, up to 12,
-- most first) within the chosen category.
create or replace function public.get_service_directory_counts(p_category text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, laria_private
as $$
  with public_services as (
    select s.* from public.services s
    where s.status = 'approved'
      and (s.store_id is null or exists (select 1 from public.stores st where st.id = s.store_id and st.status = 'active'))
  )
  select jsonb_build_object(
    'total', (select count(*) from public_services),
    'categories', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from public_services group by category) c), '{}'::jsonb),
    'cities', coalesce((select jsonb_agg(jsonb_build_object('city', city, 'count', n) order by n desc, city) from (
      select min(city) as city, count(*) as n from public_services
      where p_category is null or category = p_category
      group by laria_private.service_place_key(city)
      order by count(*) desc, min(city)
      limit 12) cities), '[]'::jsonb)
  )
$$;

revoke all on function public.get_service_directory_counts(text) from public;
grant execute on function public.get_service_directory_counts(text) to anon, authenticated;

-- The service page. Public services for everyone; the owner and Admin also see one that is not public, marked
-- `preview`. Null otherwise.
create or replace function public.get_public_service(p_category text, p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
declare
  service_row public.services;
  caller uuid := auth.uid();
  is_public boolean;
  breakdown jsonb;
begin
  select * into service_row from public.services where slug = p_slug and category = p_category;
  if service_row.id is null then return null; end if;
  is_public := laria_private.service_is_public(service_row);
  if not is_public and (caller is null or (caller <> service_row.owner_user_id and not coalesce(public.is_admin(), false))) then
    return null;
  end if;
  select jsonb_build_object('1', count(*) filter (where rating = 1), '2', count(*) filter (where rating = 2),
      '3', count(*) filter (where rating = 3), '4', count(*) filter (where rating = 4), '5', count(*) filter (where rating = 5))
  into breakdown
  from public.service_reviews where service_id = service_row.id and status = 'visible';
  return laria_private.service_card(service_row) || jsonb_build_object(
    'description', service_row.description,
    'photo_paths', to_jsonb(service_row.photo_paths),
    'whatsapp_phone', service_row.whatsapp_phone,
    'status', service_row.status,
    'preview', not is_public,
    'is_owner', caller is not null and caller = service_row.owner_user_id,
    'updated_at', service_row.updated_at,
    'breakdown', breakdown,
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'comment', r.comment,
        'reviewer_name', laria_private.question_display_name(p.full_name), 'created_at', r.created_at) order by r.created_at desc, r.id desc), '[]'::jsonb)
      from (select * from public.service_reviews where service_id = service_row.id and status = 'visible' order by created_at desc, id desc limit 5) r
      left join public.profiles p on p.id = r.client_user_id),
    'other_services', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'category', o.category,
        'path', laria_private.service_path(o), 'price_from_pen', o.price_from_pen, 'price_unit', o.price_unit) order by o.category), '[]'::jsonb)
      from public.services o
      where o.owner_user_id = service_row.owner_user_id and o.id <> service_row.id and laria_private.service_is_public(o))
  );
end;
$$;

revoke all on function public.get_public_service(text, text) from public;
grant execute on function public.get_public_service(text, text) to anon, authenticated;

-- "Ver las N reseñas": the next page of a public service's visible reviews.
create or replace function public.get_service_reviews(p_service_id uuid, p_offset integer default 0, p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = public, laria_private
as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'comment', r.comment,
        'reviewer_name', laria_private.question_display_name(p.full_name), 'created_at', r.created_at) order by r.created_at desc, r.id desc)
      from (
        select rv.* from public.service_reviews rv
        join public.services s on s.id = rv.service_id
        where rv.service_id = p_service_id and rv.status = 'visible' and laria_private.service_is_public(s)
        order by rv.created_at desc, rv.id desc
        offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 20), 1), 50)
      ) r
      left join public.profiles p on p.id = r.client_user_id), '[]'::jsonb)
  )
$$;

revoke all on function public.get_service_reviews(uuid, integer, integer) from public;
grant execute on function public.get_service_reviews(uuid, integer, integer) to anon, authenticated;

-- What the service page offers this visitor: "Contraté este servicio", an answer to give, a review to write.
create or replace function public.get_service_viewer_state(p_service_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  service_row public.services;
  booking_row public.service_bookings;
  contacted_at timestamptz;
  has_review boolean := false;
  declined boolean := false;
begin
  select * into service_row from public.services where id = p_service_id;
  if caller is null or service_row.id is null then
    return jsonb_build_object('signed_in', caller is not null, 'is_owner', false, 'contacted', false, 'can_claim', false, 'booking', null, 'can_review', false);
  end if;
  if caller = service_row.owner_user_id then
    return jsonb_build_object('signed_in', true, 'is_owner', true, 'contacted', false, 'can_claim', false, 'booking', null, 'can_review', false);
  end if;
  contacted_at := laria_private.service_contacted(p_service_id, caller);
  select * into booking_row from public.service_bookings
  where service_id = p_service_id and client_user_id = caller
    and (status = 'confirmed' or (status = 'pending' and created_at > now() - interval '30 days'))
  order by created_at desc limit 1;
  has_review := exists (select 1 from public.service_reviews where service_id = p_service_id and client_user_id = caller);
  declined := exists (select 1 from public.service_bookings where service_id = p_service_id and client_user_id = caller and status = 'declined');
  return jsonb_build_object(
    'signed_in', true,
    'is_owner', false,
    'contacted', contacted_at is not null,
    'can_claim', contacted_at is not null and booking_row.id is null and not declined and not has_review
      and service_row.approved_at is not null and service_row.status in ('approved', 'paused'),
    'booking', case when booking_row.id is null then null else jsonb_build_object(
      'id', booking_row.id, 'status', booking_row.status, 'requested_by', booking_row.requested_by,
      'review_deadline', booking_row.review_deadline) end,
    'has_review', has_review,
    'can_review', coalesce(booking_row.status = 'confirmed' and not has_review and clock_timestamp() <= booking_row.review_deadline, false)
  );
end;
$$;

revoke all on function public.get_service_viewer_state(uuid) from public;
grant execute on function public.get_service_viewer_state(uuid) to anon, authenticated;

-- The sitemap: every public service's page and last change, in batches.
create or replace function public.get_public_service_paths(p_offset integer default 0, p_limit integer default 1000)
returns table(path text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, laria_private
as $$
  select laria_private.service_path(s), s.updated_at
  from public.services s
  where laria_private.service_is_public(s)
  order by s.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
$$;

revoke all on function public.get_public_service_paths(integer, integer) from public;
grant execute on function public.get_public_service_paths(integer, integer) to anon, authenticated;

-- ------------------------------------------------------------------ reports

create or replace function public.submit_service_report(p_target_type text, p_target_id uuid, p_reason text, p_detail text default null)
returns uuid
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  caller uuid := auth.uid();
  service_row public.services;
  review_row public.service_reviews;
  clean_detail text := nullif(btrim(coalesce(p_detail, '')), '');
  report_uuid uuid;
begin
  if caller is null then
    perform laria_private.raise_service_error('SERVICE_REPORT_AUTH_REQUIRED', 'Ingresa para reportar.');
  end if;
  if p_reason is null or p_reason not in ('acoso', 'contenido_inapropiado', 'informacion_falsa', 'posible_estafa', 'articulo_prohibido', 'spam', 'otro') then
    perform laria_private.raise_service_error('SERVICE_REPORT_REASON_INVALID', 'Elige un motivo.');
  end if;
  if clean_detail is not null and char_length(clean_detail) > 1000 then
    perform laria_private.raise_service_error('SERVICE_REPORT_DETAIL_TOO_LONG', 'El detalle puede tener hasta 1000 caracteres.');
  end if;
  if p_target_type = 'service' then
    select * into service_row from public.services where id = p_target_id;
    if service_row.id is null or not laria_private.service_is_public(service_row) or service_row.owner_user_id = caller then
      perform laria_private.raise_service_error('SERVICE_REPORT_TARGET_UNAVAILABLE', 'Este contenido no se puede reportar.');
    end if;
  elsif p_target_type = 'service_review' then
    select * into review_row from public.service_reviews where id = p_target_id;
    select * into service_row from public.services where id = review_row.service_id;
    if review_row.id is null or review_row.status <> 'visible' or not laria_private.service_is_public(service_row)
       or review_row.client_user_id = caller then
      perform laria_private.raise_service_error('SERVICE_REPORT_TARGET_UNAVAILABLE', 'Este contenido no se puede reportar.');
    end if;
  else
    perform laria_private.raise_service_error('SERVICE_REPORT_TARGET_UNAVAILABLE', 'Este contenido no se puede reportar.');
  end if;
  begin
    insert into public.service_reports(reporter_user_id, target_type, service_id, review_id, reason, detail)
    values (caller, p_target_type, service_row.id, review_row.id, p_reason, clean_detail)
    returning id into report_uuid;
  exception when unique_violation then
    perform laria_private.raise_service_error('SERVICE_REPORT_ALREADY_SUBMITTED', 'Ya tienes un reporte abierto para este contenido.');
  end;
  return report_uuid;
end;
$$;

revoke all on function public.submit_service_report(text, uuid, text, text) from public, anon;
grant execute on function public.submit_service_report(text, uuid, text, text) to authenticated;

-- ------------------------------------------------------------------ Admin

create or replace function laria_private.assert_service_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    perform laria_private.raise_service_error('SERVICE_ADMIN_REQUIRED', 'Solo moderación puede hacer esto.');
  end if;
end;
$$;

revoke all on function laria_private.assert_service_admin() from public, anon, authenticated;

create or replace function public.get_admin_service_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private
as $$
begin
  perform laria_private.assert_service_admin();
  return jsonb_build_object(
    'pending', (select count(*) from public.services where status = 'pending'),
    'recheck', (select count(*) from public.services where needs_recheck and status in ('approved', 'paused')),
    'reports', (select count(*) from public.service_reports where status = 'open')
  );
end;
$$;

revoke all on function public.get_admin_service_counts() from public, anon;
grant execute on function public.get_admin_service_counts() to authenticated;

-- Admin › Servicios. p_view: 'pending' (oldest first), 'recheck' (changed since approval, oldest change first),
-- 'reports' (open reports, oldest first), 'reviews' (newest reviews, visible and hidden), 'all' (every service,
-- newest change first). p_search matches title, provider, owner e-mail and city.
create or replace function public.get_admin_service_queue(p_view text default 'pending', p_search text default null, p_page integer default 1, p_page_size integer default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, laria_private, auth
as $$
declare
  v_view text := coalesce(nullif(p_view, ''), 'pending');
  term text := nullif(laria_private.service_place_key(p_search), '');
  size integer := least(greatest(coalesce(p_page_size, 24), 1), 50);
  page integer := greatest(coalesce(p_page, 1), 1);
  total bigint;
  items jsonb;
begin
  perform laria_private.assert_service_admin();
  if v_view not in ('pending', 'recheck', 'reports', 'reviews', 'all') then v_view := 'pending'; end if;

  if v_view in ('pending', 'recheck', 'all') then
    with rows as (
      select s as svc, s.id, s.store_id, s.updated_at, u.email as owner_email, p.full_name as owner_name
      from public.services s
      join public.profiles p on p.id = s.owner_user_id
      left join auth.users u on u.id = s.owner_user_id
      where (v_view <> 'pending' or s.status = 'pending')
        and (v_view <> 'recheck' or (s.needs_recheck and s.status in ('approved', 'paused')))
        and (term is null or laria_private.service_place_key(s.title) like '%' || term || '%'
          or laria_private.service_place_key(s.provider_name) like '%' || term || '%'
          or laria_private.service_place_key(coalesce(u.email, '')) like '%' || term || '%'
          or laria_private.service_place_key(s.city) like '%' || term || '%')
    )
    select (select count(*) from rows),
      coalesce((select jsonb_agg(laria_private.service_owner_json(page_rows.svc) || jsonb_build_object(
          'owner_email', page_rows.owner_email,
          'owner_name', page_rows.owner_name,
          'store', (select jsonb_build_object('name', st.name, 'slug', st.slug, 'status', st.status, 'is_verified', st.is_verified)
            from public.stores st where st.id = page_rows.store_id),
          'rating', laria_private.service_rating(page_rows.id),
          'open_reports', (select count(*) from public.service_reports r where r.service_id = page_rows.id and r.status = 'open')
        ) order by ordinal)
        from (
          select r.*, row_number() over (order by
            case when v_view = 'all' then r.updated_at end desc,
            case when v_view <> 'all' then r.updated_at end asc, r.id) as ordinal
          from rows r order by ordinal offset (page - 1) * size limit size
        ) page_rows), '[]'::jsonb)
    into total, items;
  elsif v_view = 'reports' then
    select count(*) into total from public.service_reports where status = 'open';
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', rp.id, 'target_type', rp.target_type, 'reason', rp.reason, 'detail', rp.detail, 'created_at', rp.created_at,
        'reporter_name', laria_private.question_display_name(reporter.full_name),
        'service', jsonb_build_object('id', s.id, 'title', s.title, 'status', s.status, 'path', laria_private.service_path(s),
          'provider_name', laria_private.service_provider(s)->>'name', 'version', s.version),
        'review', case when rv.id is null then null else jsonb_build_object('id', rv.id, 'rating', rv.rating, 'comment', rv.comment,
          'status', rv.status, 'hidden_reason', rv.hidden_reason) end
      ) order by rp.created_at, rp.id), '[]'::jsonb)
    into items
    from (select * from public.service_reports where status = 'open' order by created_at, id offset (page - 1) * size limit size) rp
    join public.services s on s.id = rp.service_id
    left join public.service_reviews rv on rv.id = rp.review_id
    left join public.profiles reporter on reporter.id = rp.reporter_user_id;
  else
    select count(*) into total from public.service_reviews;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', rv.id, 'rating', rv.rating, 'comment', rv.comment, 'status', rv.status, 'hidden_reason', rv.hidden_reason,
        'created_at', rv.created_at, 'reviewer_name', laria_private.question_display_name(client.full_name),
        'service', jsonb_build_object('id', s.id, 'title', s.title, 'path', laria_private.service_path(s),
          'provider_name', laria_private.service_provider(s)->>'name')
      ) order by rv.created_at desc, rv.id desc), '[]'::jsonb)
    into items
    from (select * from public.service_reviews order by created_at desc, id desc offset (page - 1) * size limit size) rv
    join public.services s on s.id = rv.service_id
    left join public.profiles client on client.id = rv.client_user_id;
  end if;

  return jsonb_build_object('view', v_view, 'total', total, 'page', page, 'page_size', size, 'items', items,
    'counts', public.get_admin_service_counts());
end;
$$;

revoke all on function public.get_admin_service_queue(text, text, integer, integer) from public, anon;
grant execute on function public.get_admin_service_queue(text, text, integer, integer) to authenticated;

-- p_decision: approve (a pending service goes public), reject (pending, with a reason), hide (approved or paused,
-- with a reason), restore (hidden back to public), recheck_ok (the changes since approval are fine). It applies only
-- to the version Admin saw. Every decision is audited; the owner is told in the app (and by e-mail for approve,
-- reject, hide and restore).
create or replace function public.admin_review_service(p_service_id uuid, p_decision text, p_reason text default null, p_expected_version integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  row_now public.services;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  next_status text;
  notification_uuid uuid;
  path text;
begin
  perform laria_private.assert_service_admin();
  if p_decision is null or p_decision not in ('approve', 'reject', 'hide', 'restore', 'recheck_ok') then
    perform laria_private.raise_service_error('SERVICE_DECISION_INVALID', 'Elige una decisión.');
  end if;
  if p_decision in ('reject', 'hide') and (clean_reason is null or char_length(clean_reason) not between 3 and 500) then
    perform laria_private.raise_service_error('SERVICE_REASON_REQUIRED', 'Escribe un motivo de entre 3 y 500 caracteres. Quien ofrece el servicio lo verá.');
  end if;
  if clean_reason is not null and char_length(clean_reason) > 500 then
    perform laria_private.raise_service_error('SERVICE_REASON_REQUIRED', 'El motivo puede tener hasta 500 caracteres.');
  end if;
  select * into row_now from public.services where id = p_service_id for update;
  if row_now.id is null then
    perform laria_private.raise_service_error('SERVICE_NOT_FOUND', 'Este servicio ya no existe.');
  end if;
  if p_expected_version is null or p_expected_version <> row_now.version then
    perform laria_private.raise_service_error('SERVICE_STALE', 'El servicio cambió mientras lo revisabas. Recarga la cola y revisa la última versión.');
  end if;
  if (p_decision in ('approve', 'reject') and row_now.status <> 'pending')
     or (p_decision = 'hide' and row_now.status not in ('approved', 'paused'))
     or (p_decision = 'restore' and row_now.status <> 'hidden')
     or (p_decision = 'recheck_ok' and not (row_now.needs_recheck and row_now.status in ('approved', 'paused'))) then
    perform laria_private.raise_service_error('SERVICE_STATUS_INVALID', 'Esta decisión no aplica al estado actual del servicio.');
  end if;

  next_status := case p_decision
    when 'approve' then 'approved' when 'reject' then 'rejected' when 'hide' then 'hidden' when 'restore' then 'approved'
    else row_now.status end;
  update public.services set
    status = next_status,
    moderation_reason = case when next_status in ('rejected', 'hidden') then clean_reason end,
    needs_recheck = case when p_decision in ('approve', 'recheck_ok', 'restore') then false else needs_recheck end,
    approved_at = case when next_status = 'approved' then coalesce(approved_at, clock_timestamp()) else approved_at end,
    reviewed_at = clock_timestamp(),
    reviewed_by = auth.uid(),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = p_service_id
  returning * into row_now;

  perform laria_private.record_admin_audit('service_' || p_decision, 'service', p_service_id,
    jsonb_strip_nulls(jsonb_build_object('reason', clean_reason, 'status', next_status)));

  path := laria_private.service_path(row_now);
  if p_decision in ('approve', 'restore') then
    notification_uuid := laria_private.service_notify(row_now.owner_user_id, 'service_approved', row_now,
      case when p_decision = 'approve' then 'Tu servicio “' || laria_private.question_snippet(row_now.title, 80) || '” está en línea.'
        else 'Tu servicio “' || laria_private.question_snippet(row_now.title, 80) || '” vuelve a estar en línea.' end);
    perform laria_private.service_email('service_approved', row_now.owner_user_id, 'service_approved:' || row_now.id::text || ':' || row_now.version,
      notification_uuid, row_now, path);
  elsif p_decision = 'reject' then
    notification_uuid := laria_private.service_notify(row_now.owner_user_id, 'service_rejected', row_now,
      'Revisa tu servicio “' || laria_private.question_snippet(row_now.title, 80) || '”: ' || clean_reason);
    perform laria_private.service_email('service_rejected', row_now.owner_user_id, 'service_rejected:' || row_now.id::text || ':' || row_now.version,
      notification_uuid, row_now, '/mi-cuenta/servicios/' || row_now.id::text || '/editar', clean_reason);
  elsif p_decision = 'hide' then
    notification_uuid := laria_private.service_notify(row_now.owner_user_id, 'service_hidden', row_now,
      'Moderación ocultó tu servicio “' || laria_private.question_snippet(row_now.title, 80) || '”: ' || clean_reason);
    perform laria_private.service_email('service_hidden', row_now.owner_user_id, 'service_hidden:' || row_now.id::text || ':' || row_now.version,
      notification_uuid, row_now, '/mi-cuenta/servicios/' || row_now.id::text || '/editar', clean_reason);
  end if;
  return jsonb_build_object('id', row_now.id, 'status', row_now.status, 'needs_recheck', row_now.needs_recheck, 'version', row_now.version);
end;
$$;

revoke all on function public.admin_review_service(uuid, text, text, integer) from public, anon;
grant execute on function public.admin_review_service(uuid, text, text, integer) to authenticated;

-- Hide or show a review again, with a reason; the stars and the text are never rewritten.
create or replace function public.admin_moderate_service_review(p_review_id uuid, p_action text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  clean_reason text := btrim(coalesce(p_reason, ''));
  review_row public.service_reviews;
begin
  perform laria_private.assert_service_admin();
  if p_action not in ('hide', 'restore') then
    perform laria_private.raise_service_error('SERVICE_DECISION_INVALID', 'Elige ocultar o mostrar.');
  end if;
  if char_length(clean_reason) not between 3 and 500 then
    perform laria_private.raise_service_error('SERVICE_REASON_REQUIRED', 'Escribe un motivo de entre 3 y 500 caracteres.');
  end if;
  select * into review_row from public.service_reviews where id = p_review_id for update;
  if review_row.id is null then
    perform laria_private.raise_service_error('SERVICE_REVIEW_NOT_FOUND', 'Esta reseña ya no existe.');
  end if;
  if (p_action = 'hide' and review_row.status = 'hidden') or (p_action = 'restore' and review_row.status = 'visible') then
    perform laria_private.raise_service_error('SERVICE_STATUS_INVALID', 'La reseña ya está en ese estado.');
  end if;
  update public.service_reviews set
    status = case when p_action = 'hide' then 'hidden' else 'visible' end,
    hidden_reason = case when p_action = 'hide' then clean_reason end,
    hidden_at = case when p_action = 'hide' then clock_timestamp() end,
    hidden_by = case when p_action = 'hide' then auth.uid() end
  where id = p_review_id
  returning * into review_row;
  perform laria_private.record_admin_audit('service_review_' || case when p_action = 'hide' then 'hidden' else 'restored' end,
    'service_review', p_review_id, jsonb_build_object('reason', clean_reason, 'service_id', review_row.service_id));
  return jsonb_build_object('id', review_row.id, 'status', review_row.status);
end;
$$;

revoke all on function public.admin_moderate_service_review(uuid, text, text) from public, anon;
grant execute on function public.admin_moderate_service_review(uuid, text, text) to authenticated;

-- Closing a report never moderates its target by itself; Admin hides the service or the review separately.
create or replace function public.admin_close_service_report(p_report_id uuid, p_status text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  clean_note text := btrim(coalesce(p_note, ''));
  report_row public.service_reports;
begin
  perform laria_private.assert_service_admin();
  if p_status not in ('resolved', 'dismissed') then
    perform laria_private.raise_service_error('SERVICE_DECISION_INVALID', 'Elige resolver o desestimar.');
  end if;
  if char_length(clean_note) not between 3 and 500 then
    perform laria_private.raise_service_error('SERVICE_REASON_REQUIRED', 'Escribe una nota de entre 3 y 500 caracteres.');
  end if;
  select * into report_row from public.service_reports where id = p_report_id for update;
  if report_row.id is null or report_row.status <> 'open' then
    perform laria_private.raise_service_error('SERVICE_REPORT_NOT_FOUND', 'Este reporte ya está cerrado.');
  end if;
  update public.service_reports
  set status = p_status, resolution_note = clean_note, resolved_by = auth.uid(), resolved_at = clock_timestamp()
  where id = p_report_id
  returning * into report_row;
  perform laria_private.record_admin_audit('service_report_' || p_status, 'service_report', p_report_id,
    jsonb_build_object('note', clean_note, 'service_id', report_row.service_id, 'review_id', report_row.review_id));
  return jsonb_build_object('id', report_row.id, 'status', report_row.status);
end;
$$;

revoke all on function public.admin_close_service_report(uuid, text, text) from public, anon;
grant execute on function public.admin_close_service_report(uuid, text, text) to authenticated;
