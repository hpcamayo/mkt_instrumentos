-- Sprint 8: moderation-first Admin Hub, unified content reports, and manual
-- legacy listing ownership. This migration is intentionally local-only until
-- the dedicated Sprint 8 release gate.

-- Reuse the Sprint 6 review-report records as the canonical report table.
-- Existing IDs, timestamps, reporters, statuses, and review relationships are
-- preserved. The old name remains as a compatibility view for cleanup/tests.
alter table public.review_reports rename to reports;

alter table public.reports
  alter column review_id drop not null,
  add column target_type text not null default 'review',
  add column listing_id uuid references public.listings(id) on delete restrict,
  add column store_id uuid references public.stores(id) on delete restrict;

alter table public.reports
  drop constraint if exists review_reports_review_id_reporter_user_id_key,
  drop constraint if exists review_reports_reason_check;

alter table public.reports
  add constraint reports_target_type_check
    check (target_type in ('listing', 'store', 'review')),
  add constraint reports_target_check check (
    (target_type = 'listing' and listing_id is not null and store_id is null and review_id is null)
    or (target_type = 'store' and store_id is not null and listing_id is null and review_id is null)
    or (target_type = 'review' and review_id is not null and listing_id is null and store_id is null)
  ),
  add constraint reports_reason_check check (
    reason in (
      'acoso',
      'contenido_inapropiado',
      'informacion_falsa',
      'posible_estafa',
      'articulo_prohibido',
      'spam',
      'otro'
    )
  );

drop index if exists public.review_reports_open_idx;
drop index if exists public.review_reports_review_idx;

create unique index reports_one_open_listing_per_reporter_idx
  on public.reports(reporter_user_id, listing_id)
  where status = 'open' and target_type = 'listing';
create unique index reports_one_open_store_per_reporter_idx
  on public.reports(reporter_user_id, store_id)
  where status = 'open' and target_type = 'store';
create unique index reports_one_open_review_per_reporter_idx
  on public.reports(reporter_user_id, review_id)
  where status = 'open' and target_type = 'review';
create index reports_status_created_idx
  on public.reports(status, created_at desc, id desc);
create index reports_target_status_idx
  on public.reports(target_type, listing_id, store_id, review_id, status, created_at desc);
create index reports_reporter_created_idx
  on public.reports(reporter_user_id, created_at desc, id desc);
create index reports_admin_filters_created_idx
  on public.reports(status, target_type, reason, created_at desc, id desc);

create view public.review_reports
with (security_invoker = true)
as
select
  id,
  review_id,
  reporter_user_id,
  reason,
  detail,
  status,
  created_at,
  resolved_at,
  resolved_by,
  resolution_reason
from public.reports
where target_type = 'review';

revoke all on public.review_reports from public, anon, authenticated;

-- One durable, append-only audit stream for privileged actions that do not
-- already have a dedicated immutable domain history table.
create table public.admin_audit_actions (
  id uuid primary key default gen_random_uuid(),
  -- Admin authority comes exclusively from the signed Auth JWT. Keep the
  -- immutable actor UUID even if an operational Admin does not have (or later
  -- removes) a marketplace profile row.
  admin_user_id uuid not null,
  action text not null check(length(action) between 3 and 80),
  target_type text not null check(target_type in ('listing', 'listing_revision', 'store', 'report', 'review', 'legacy_link')),
  target_id uuid not null,
  detail jsonb not null default '{}'::jsonb check(jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);

create index admin_audit_actions_target_idx
  on public.admin_audit_actions(target_type, target_id, created_at desc, id desc);
create index admin_audit_actions_actor_idx
  on public.admin_audit_actions(admin_user_id, created_at desc, id desc);

alter table public.admin_audit_actions enable row level security;
revoke all on public.reports, public.admin_audit_actions from anon, authenticated;

create or replace function laria_private.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
end;
$$;
revoke all on function laria_private.assert_admin() from public, anon, authenticated;

create or replace function laria_private.record_admin_audit(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform laria_private.assert_admin();
  insert into public.admin_audit_actions(admin_user_id, action, target_type, target_id, detail)
  values(auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke all on function laria_private.record_admin_audit(text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function laria_private.audit_admin_domain_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_name text;
  details jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    return new;
  end if;

  if tg_table_name = 'listings' then
    if new.status is distinct from old.status then
      action_name := 'listing_' || new.status::text;
      details := jsonb_strip_nulls(jsonb_build_object(
        'from', old.status,
        'to', new.status,
        'reason', case
          when new.status = 'rejected' then new.rejection_reason
          when new.status = 'hidden' and new.hidden_source = 'admin' then new.hidden_reason
          else null
        end,
        'prior_reason', case
          when old.status = 'rejected' then old.rejection_reason
          when old.status = 'hidden' and old.hidden_source = 'admin' then old.hidden_reason
          else null
        end,
        'hidden_source', coalesce(new.hidden_source, old.hidden_source)
      ));
    elsif row(
      new.title, new.description, new.category, new.instrument_type,
      new.attributes, new.brand, new.model, new.condition, new.price_pen,
      new.city, new.region, new.contact_name, new.whatsapp_phone
    ) is distinct from row(
      old.title, old.description, old.category, old.instrument_type,
      old.attributes, old.brand, old.model, old.condition, old.price_pen,
      old.city, old.region, old.contact_name, old.whatsapp_phone
    ) then
      action_name := 'listing_content_updated';
      details := jsonb_build_object('status', new.status);
    end if;
  elsif tg_table_name = 'listing_revisions' then
    if new.status is distinct from old.status then
      action_name := 'listing_revision_' || new.status;
      details := jsonb_strip_nulls(jsonb_build_object(
        'from', old.status,
        'to', new.status,
        'version', new.version,
        'reason', coalesce(new.rejection_reason, new.resolution_reason)
      ));
    end if;
  elsif tg_table_name = 'stores' then
    if new.status is distinct from old.status then
      action_name := 'store_' || new.status::text;
      details := jsonb_strip_nulls(jsonb_build_object(
        'from', old.status,
        'to', new.status,
        'reason', case when new.status in ('rejected', 'hidden') then new.rejection_reason else null end,
        'prior_reason', case when old.status in ('rejected', 'hidden') then old.rejection_reason else null end
      ));
    elsif new.is_verified is distinct from old.is_verified then
      action_name := case when new.is_verified then 'store_verified' else 'store_verification_revoked' end;
      details := jsonb_build_object('from', old.is_verified, 'to', new.is_verified);
    elsif row(
      new.name, new.razon_social, new.ruc, new.email, new.contact_person,
      new.city, new.region, new.district, new.address, new.whatsapp_phone,
      new.instagram_url, new.facebook_url, new.tiktok_url, new.website_url,
      new.description
    ) is distinct from row(
      old.name, old.razon_social, old.ruc, old.email, old.contact_person,
      old.city, old.region, old.district, old.address, old.whatsapp_phone,
      old.instagram_url, old.facebook_url, old.tiktok_url, old.website_url,
      old.description
    ) then
      action_name := 'store_profile_updated';
      details := jsonb_build_object('status', new.status, 'is_verified', new.is_verified);
    end if;
  elsif tg_table_name = 'transaction_reviews' then
    if new.admin_hidden_at is distinct from old.admin_hidden_at then
      action_name := case when new.admin_hidden_at is null then 'review_restored' else 'review_hidden' end;
      details := jsonb_build_object('reason', new.admin_hidden_reason);
    end if;
  end if;

  if action_name is not null then
    insert into public.admin_audit_actions(admin_user_id, action, target_type, target_id, detail)
    values(
      auth.uid(),
      action_name,
      case tg_table_name
        when 'listing_revisions' then 'listing_revision'
        when 'transaction_reviews' then 'review'
        else trim(trailing 's' from tg_table_name)
      end,
      new.id,
      details
    );
  end if;
  return new;
end;
$$;
revoke all on function laria_private.audit_admin_domain_transition() from public, anon, authenticated;

create trigger sprint_8_audit_listing_transition
after update on public.listings
for each row execute function laria_private.audit_admin_domain_transition();
create trigger sprint_8_audit_revision_transition
after update on public.listing_revisions
for each row execute function laria_private.audit_admin_domain_transition();
create trigger sprint_8_audit_store_transition
after update on public.stores
for each row execute function laria_private.audit_admin_domain_transition();
create trigger sprint_8_audit_review_transition
after update on public.transaction_reviews
for each row execute function laria_private.audit_admin_domain_transition();

-- Admin retains the established allowlisted content/profile edit capability,
-- but an edit may never leave an already-public listing or active store below
-- its publication/application invariant. These checks run in the database so
-- a stale or modified browser client cannot bypass them.
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
      or not (
        (new.instrument_type = 'other' and new.category in (
          'guitars', 'basses', 'drums', 'cymbals', 'microphones',
          'pedals', 'amplifiers', 'audio interfaces'
        ))
        or (new.category = 'guitars' and new.instrument_type in ('electric_guitar', 'acoustic_guitar'))
        or (new.category = 'basses' and new.instrument_type = 'bass')
        or (new.category = 'drums' and new.instrument_type = 'drums')
        or (new.category = 'cymbals' and new.instrument_type = 'cymbals')
        or (new.category = 'microphones' and new.instrument_type = 'microphones')
        or (new.category = 'pedals' and new.instrument_type = 'pedals')
        or (new.category = 'amplifiers' and new.instrument_type = 'amplifiers')
        or (new.category = 'audio interfaces' and new.instrument_type = 'audio_interface')
      )
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
revoke all on function laria_private.enforce_public_listing_edit_invariant() from public, anon, authenticated;

create trigger sprint_8_validate_public_listing_edit
before update of title, description, category, instrument_type, attributes,
  brand, model, condition, price_pen, city, region, contact_name, whatsapp_phone
on public.listings
for each row execute function laria_private.enforce_public_listing_edit_invariant();

create or replace function laria_private.enforce_active_store_edit_invariant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Preserve active legacy stores whose historical row predates the complete
  -- application contract, but never let a complete active Tienda be degraded.
  if old.status = 'active'
    and new.status = 'active'
    and public.store_application_is_complete(old.id)
    and (
      nullif(trim(coalesce(new.name, '')), '') is null
      or nullif(trim(coalesce(new.razon_social, '')), '') is null
      or coalesce(new.ruc, '') !~ '^[0-9]{11}$'
      or nullif(trim(coalesce(new.email, '')), '') is null
      or new.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or regexp_replace(coalesce(new.whatsapp_phone, ''), '[^0-9]', '', 'g') !~ '^[0-9]{9,15}$'
      or nullif(trim(coalesce(new.address, '')), '') is null
      or nullif(trim(coalesce(new.city, '')), '') is null
      or nullif(trim(coalesce(new.region, '')), '') is null
      or nullif(trim(coalesce(new.contact_person, '')), '') is null
    ) then
    raise exception 'STORE_APPLICATION_INCOMPLETE: Una tienda activa debe conservar todos los datos obligatorios.';
  end if;
  return new;
end;
$$;
revoke all on function laria_private.enforce_active_store_edit_invariant() from public, anon, authenticated;

create trigger sprint_8_validate_active_store_edit
before update of name, razon_social, ruc, email, contact_person, city, region,
  district, address, whatsapp_phone, instagram_url, facebook_url, tiktok_url,
  website_url, description
on public.stores
for each row execute function laria_private.enforce_active_store_edit_invariant();

-- Preserve the canonical Admin listing transition and add the frozen
-- Admin mark-sold action. It uses the same row lock, sold timestamp and
-- pending-revision cancellation semantics as the owner lifecycle flow; it
-- never fabricates a buyer or verified transaction.
create or replace function public.review_listing(
  p_listing_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into listing_record from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found.'; end if;
  perform set_config('app.allow_listing_admin_fields', 'true', true);

  if p_decision = 'approve' then
    if listing_record.status <> 'pending' or not public.listing_meets_publish_requirements(p_listing_id) then
      raise exception 'LISTING_APPROVAL_INVALID: La publicación pendiente no cumple los requisitos.';
    end if;
    update public.listings set status = 'approved', published_at = coalesce(published_at, now()), rejection_reason = null
    where id = p_listing_id returning * into listing_record;
    perform public.create_account_notification(listing_record.owner_user_id, 'listing_approved', listing_record.id, listing_record.store_id);
  elsif p_decision = 'reject' then
    if listing_record.status <> 'pending' or nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'LISTING_REJECTION_REASON_REQUIRED: La publicación pendiente requiere un motivo.';
    end if;
    update public.listings set status = 'rejected', rejection_reason = trim(p_reason)
    where id = p_listing_id returning * into listing_record;
    perform public.create_account_notification(listing_record.owner_user_id, 'listing_rejected', listing_record.id, listing_record.store_id);
  elsif p_decision = 'hide' then
    if listing_record.status <> 'approved' or nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'LISTING_HIDE_REASON_REQUIRED: La ocultación administrativa requiere un motivo.';
    end if;
    update public.listings
    set status = 'hidden', hidden_source = 'admin', hidden_reason = trim(p_reason), hidden_at = now()
    where id = p_listing_id returning * into listing_record;
    perform public.create_account_notification(listing_record.owner_user_id, 'listing_hidden', listing_record.id, listing_record.store_id);
  elsif p_decision = 'restore' then
    if listing_record.status <> 'hidden' then raise exception 'LISTING_RESTORE_INVALID: La publicación no está oculta.'; end if;
    if listing_record.store_id is not null and not exists (
      select 1 from public.stores store where store.id = listing_record.store_id and store.status = 'active'
    ) then raise exception 'STORE_NOT_PUBLIC: La tienda debe estar activa.'; end if;
    if not public.listing_meets_publish_requirements(p_listing_id) then raise exception 'LISTING_REQUIREMENTS_INVALID: La publicación ya no cumple los requisitos.'; end if;
    update public.listings set status = 'approved', hidden_source = null, hidden_reason = null, hidden_at = null
    where id = p_listing_id returning * into listing_record;
  elsif p_decision = 'sold' then
    if listing_record.status <> 'approved' then
      raise exception 'LISTING_SOLD_INVALID: Solo una publicación aprobada puede marcarse como vendida.';
    end if;
    update public.listing_revisions
    set status = 'cancelled', reviewed_at = now(),
        resolution_reason = 'La publicación fue marcada como vendida por administración.'
    where listing_id = p_listing_id and status = 'pending';
    update public.listings
    set status = 'sold', sold_at = coalesce(sold_at, now()),
        hidden_source = null, hidden_reason = null, hidden_at = null
    where id = p_listing_id returning * into listing_record;
  else
    raise exception 'LISTING_REVIEW_ACTION_INVALID: Acción de moderación no compatible.';
  end if;
  return listing_record;
end;
$$;

create or replace function public.submit_content_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_detail text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  report_uuid uuid;
  clean_detail text;
  target_owner uuid;
  target_reporter uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'REPORT_AUTH_REQUIRED';
  end if;
  if p_target_type is null or p_target_type not in ('listing', 'store', 'review') then
    raise exception 'REPORT_TARGET_UNAVAILABLE';
  end if;
  if p_target_id is null then
    raise exception 'REPORT_TARGET_UNAVAILABLE';
  end if;
  if p_reason is null or p_reason not in (
    'acoso', 'contenido_inapropiado', 'informacion_falsa',
    'posible_estafa', 'articulo_prohibido', 'spam', 'otro'
  ) then
    raise exception 'REPORT_REASON_INVALID';
  end if;

  clean_detail := nullif(trim(coalesce(p_detail, '')), '');
  if clean_detail is not null and length(clean_detail) > 1000 then
    raise exception 'REPORT_DETAIL_TOO_LONG';
  end if;

  if p_target_type = 'listing' then
    select coalesce(l.owner_user_id, s.owner_user_id) into target_owner
    from public.listings l
    left join public.stores s on s.id = l.store_id
    where l.id = p_target_id
      and (
        public.listing_is_public(l.id)
        or (
          l.status = 'sold'
          and (
            (l.seller_type = 'individual' and l.store_id is null)
            or (l.seller_type = 'store' and l.store_id is not null and s.status = 'active')
          )
        )
      );
    if not found or target_owner is not distinct from auth.uid() then
      raise exception 'REPORT_TARGET_UNAVAILABLE';
    end if;
  elsif p_target_type = 'store' then
    select owner_user_id into target_owner
    from public.stores
    where id = p_target_id and status = 'active';
    if not found or target_owner is not distinct from auth.uid() then
      raise exception 'REPORT_TARGET_UNAVAILABLE';
    end if;
  else
    select reviewer_user_id into target_reporter
    from public.transaction_reviews
    where id = p_target_id and laria_private.review_is_visible(id);
    if not found or target_reporter is not distinct from auth.uid() then
      raise exception 'REPORT_TARGET_UNAVAILABLE';
    end if;
  end if;

  insert into public.reports(
    reporter_user_id,
    target_type,
    listing_id,
    store_id,
    review_id,
    reason,
    detail
  )
  values(
    auth.uid(),
    p_target_type,
    case when p_target_type = 'listing' then p_target_id end,
    case when p_target_type = 'store' then p_target_id end,
    case when p_target_type = 'review' then p_target_id end,
    p_reason,
    clean_detail
  )
  returning id into report_uuid;

  return report_uuid;
exception
  when unique_violation then
    raise exception 'REPORT_ALREADY_SUBMITTED';
end;
$$;
revoke all on function public.submit_content_report(text, uuid, text, text) from public;
grant execute on function public.submit_content_report(text, uuid, text, text) to anon, authenticated;

create or replace function public.report_review(
  p_review_id uuid,
  p_reason text,
  p_detail text default null
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.submit_content_report('review', p_review_id, p_reason, p_detail);
$$;
revoke all on function public.report_review(uuid, text, text) from public;
grant execute on function public.report_review(uuid, text, text) to anon, authenticated;

create or replace function public.moderate_report(
  p_report_id uuid,
  p_status text,
  p_reason text
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  report_record public.reports;
  clean_reason text;
begin
  perform laria_private.assert_admin();
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'REPORT_STATUS_INVALID';
  end if;
  clean_reason := nullif(trim(coalesce(p_reason, '')), '');
  if clean_reason is null or length(clean_reason) not between 3 and 500 then
    raise exception 'REPORT_RESOLUTION_REASON_REQUIRED';
  end if;

  select * into report_record
  from public.reports
  where id = p_report_id
  for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if report_record.status <> 'open' then raise exception 'REPORT_ALREADY_CLOSED'; end if;

  update public.reports
  set status = p_status,
      resolved_at = clock_timestamp(),
      resolved_by = auth.uid(),
      resolution_reason = clean_reason
  where id = p_report_id
  returning * into report_record;

  perform laria_private.record_admin_audit(
    'report_' || p_status,
    'report',
    report_record.id,
    jsonb_build_object('target_type', report_record.target_type, 'reason', clean_reason)
  );
  return report_record;
end;
$$;
revoke all on function public.moderate_report(uuid, text, text) from public;
grant execute on function public.moderate_report(uuid, text, text) to anon, authenticated;

create or replace function public.get_admin_moderation_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform laria_private.assert_admin();
  return jsonb_build_object(
    'publicaciones', (select count(*) from public.listings where status = 'pending'),
    'revisiones', (select count(*) from public.listing_revisions where status = 'pending'),
    'tiendas', (select count(*) from public.stores where status = 'pending'),
    -- V1 has manual Admin verification but no owner verification-request
    -- state. A normal Tienda is a valid terminal trust tier, so active and
    -- unverified must not be misrepresented as pending work.
    'verificacion', 0,
    'reportes', (select count(*) from public.reports where status = 'open'),
    'resenas', (
      select count(distinct r.review_id)
      from public.reports r
      join public.transaction_reviews tr on tr.id = r.review_id
      join public.verified_transactions vt on vt.id = tr.transaction_id
      where r.status = 'open'
        and r.target_type = 'review'
        and tr.admin_hidden_at is null
        and (
          vt.review_deadline <= now()
          or (select count(*) from public.transaction_reviews pair where pair.transaction_id = vt.id) = 2
        )
    )
  );
end;
$$;
revoke all on function public.get_admin_moderation_counts() from public;
grant execute on function public.get_admin_moderation_counts() to anon, authenticated;

create or replace function public.get_admin_moderation_queue(
  p_queue text,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  item_count bigint;
  row_offset integer;
begin
  perform laria_private.assert_admin();
  if p_queue not in ('publicaciones', 'revisiones', 'tiendas', 'verificacion', 'reportes', 'resenas') then
    raise exception 'ADMIN_QUEUE_INVALID';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 25 then
    raise exception 'ADMIN_PAGINATION_INVALID';
  end if;
  row_offset := (p_page - 1) * p_page_size;

  if p_queue = 'publicaciones' then
    select count(*) into item_count from public.listings where status = 'pending';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb) into result
    from (
      select l.id, l.title, l.status::text status, l.seller_type::text seller_type,
        l.created_at, l.owner_user_id, l.store_id, l.price_pen, l.condition,
        l.description, l.city, l.region,
        coalesce(s.name, p.full_name, l.contact_name, 'Vendedor de Laria') owner_name,
        l.category, l.brand, l.model, photos.first_photo_url,
        coalesce(photos.photo_count, 0) photo_count
      from public.listings l
      left join public.stores s on s.id = l.store_id
      left join public.profiles p on p.id = l.owner_user_id
      left join lateral (
        select
          (array_agg(lp.image_url order by lp.sort_order, lp.id))[1] first_photo_url,
          count(*) photo_count
        from public.listing_photos lp
        where lp.listing_id = l.id
      ) photos on true
      where l.status = 'pending'
      order by l.created_at, l.id
      limit p_page_size offset row_offset
    ) q;
  elsif p_queue = 'revisiones' then
    select count(*) into item_count from public.listing_revisions where status = 'pending';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.submitted_at, q.id), '[]'::jsonb) into result
    from (
      select r.id, r.listing_id, r.version, r.changed_fields, r.submitted_at,
        l.title listing_title, p.full_name owner_name,
        jsonb_build_object(
          'title', l.title, 'category', l.category, 'instrument_type', l.instrument_type,
          'brand', l.brand, 'model', l.model, 'condition', l.condition,
          'attributes', l.attributes
        ) current_values,
        jsonb_build_object(
          'title', case when 'title' = any(r.changed_fields) then r.title else l.title end,
          'category', case when 'category' = any(r.changed_fields) then r.category else l.category end,
          'instrument_type', case when 'instrument_type' = any(r.changed_fields) then r.instrument_type else l.instrument_type end,
          'brand', case when 'brand' = any(r.changed_fields) then r.brand else l.brand end,
          'model', case when 'model' = any(r.changed_fields) then r.model else l.model end,
          'condition', case when 'condition' = any(r.changed_fields) then r.condition else l.condition end,
          'attributes', case when 'attributes' = any(r.changed_fields) then r.attributes else l.attributes end
        ) proposed_values,
        coalesce((
          select jsonb_agg(to_jsonb(photo) order by photo.sort_order, photo.id)
          from (
            select lp.id, lp.image_url, lp.alt_text, lp.sort_order
            from public.listing_photos lp where lp.listing_id = l.id
            order by lp.sort_order, lp.id limit 10
          ) photo
        ), '[]'::jsonb) current_photos,
        coalesce((
          select jsonb_agg(to_jsonb(photo) order by photo.sort_order, photo.id)
          from (
            select rp.id, rp.image_url, rp.alt_text, rp.sort_order
            from public.listing_revision_photos rp where rp.revision_id = r.id
            order by rp.sort_order, rp.id limit 10
          ) photo
        ), '[]'::jsonb) proposed_photos,
        (select count(*) from public.listing_revision_photos rp where rp.revision_id = r.id) proposed_photo_count
      from public.listing_revisions r
      join public.listings l on l.id = r.listing_id
      left join public.profiles p on p.id = r.owner_user_id
      where r.status = 'pending'
      order by r.submitted_at, r.id
      limit p_page_size offset row_offset
    ) q;
  elsif p_queue = 'tiendas' then
    select count(*) into item_count from public.stores where status = 'pending';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb) into result
    from (
      select s.id, s.name, s.razon_social, s.ruc, s.city, s.region, s.district,
        s.address, s.created_at, s.owner_user_id, p.full_name owner_name,
        s.email, s.contact_person, s.contact_name, s.whatsapp_phone,
        s.logo_url, s.banner_url, s.instagram_url, s.facebook_url,
        s.tiktok_url, s.website_url,
        coalesce(assets.store_photos, '[]'::jsonb) store_photos
      from public.stores s
      left join public.profiles p on p.id = s.owner_user_id
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'id', sp.id,
            'image_url', sp.image_url,
            'alt_text', sp.alt_text,
            'sort_order', sp.sort_order
          ) order by sp.sort_order, sp.id
        ) store_photos
        from public.store_photos sp
        where sp.store_id = s.id
      ) assets on true
      where s.status = 'pending'
      order by s.created_at, s.id
      limit p_page_size offset row_offset
    ) q;
  elsif p_queue = 'verificacion' then
    -- Keep the required stable tab visible, but truthful and empty until a
    -- future frozen workflow introduces a canonical verification-request
    -- state. Verification/revocation remains available under Tiendas.
    item_count := 0;
    result := '[]'::jsonb;
  elsif p_queue = 'reportes' then
    select count(*) into item_count from public.reports where status = 'open';
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb) into result
    from (
      select r.id, r.target_type, r.reason, r.detail, r.created_at,
        r.listing_id, r.store_id, r.review_id,
        reporter.full_name reporter_name,
        case r.target_type
          when 'listing' then l.title
          when 'store' then s.name
          else coalesce(rl.title, 'Reseña verificada')
        end target_title,
        case r.target_type
          when 'listing' then l.status::text
          when 'store' then s.status::text
          else case when tr.admin_hidden_at is null then 'visible' else 'hidden' end
        end target_status,
        case r.target_type
          when 'listing' then coalesce(s.name, listing_owner.full_name, l.contact_name, 'Vendedor de Laria')
          when 'store' then coalesce(store_owner.full_name, s.contact_person, s.name)
          else coalesce(review_subject.full_name, review_subject_store.name, 'Usuario de Laria')
        end target_owner_name,
        -- Equality on the active target and NULL on the other columns keeps
        -- reports_target_status_idx usable across deep OFFSET pages.
        case r.target_type
          when 'listing' then (select count(*) from public.reports same_target
            where same_target.target_type = 'listing' and same_target.status = 'open'
              and same_target.listing_id = r.listing_id
              and same_target.store_id is null
              and same_target.review_id is null)
          when 'store' then (select count(*) from public.reports same_target
            where same_target.target_type = 'store' and same_target.status = 'open'
              and same_target.listing_id is null
              and same_target.store_id = r.store_id
              and same_target.review_id is null)
          when 'review' then (select count(*) from public.reports same_target
            where same_target.target_type = 'review' and same_target.status = 'open'
              and same_target.listing_id is null
              and same_target.store_id is null
              and same_target.review_id = r.review_id)
        end open_target_report_count
      from public.reports r
      join public.profiles reporter on reporter.id = r.reporter_user_id
      left join public.listings l on l.id = r.listing_id
      left join public.profiles listing_owner on listing_owner.id = l.owner_user_id
      left join public.stores s on s.id = coalesce(r.store_id, l.store_id)
      left join public.profiles store_owner on store_owner.id = s.owner_user_id
      left join public.transaction_reviews tr on tr.id = r.review_id
      left join public.verified_transactions vt on vt.id = tr.transaction_id
      left join public.listings rl on rl.id = vt.listing_id
      left join public.profiles review_subject on review_subject.id = tr.subject_user_id
      left join public.stores review_subject_store on review_subject_store.id = tr.subject_store_id
      where r.status = 'open'
      order by r.created_at, r.id
      limit p_page_size offset row_offset
    ) q;
  else
    select count(distinct r.review_id) into item_count
    from public.reports r
    join public.transaction_reviews tr on tr.id = r.review_id
    join public.verified_transactions vt on vt.id = tr.transaction_id
    where r.status = 'open'
      and r.target_type = 'review'
      and tr.admin_hidden_at is null
      and (
        vt.review_deadline <= now()
        or (select count(*) from public.transaction_reviews pair where pair.transaction_id = vt.id) = 2
      );
    select coalesce(jsonb_agg(to_jsonb(q) order by q.submitted_at, q.id), '[]'::jsonb) into result
    from (
      select tr.id, tr.transaction_id, tr.direction, tr.rating, tr.comment,
        tr.submitted_at, tr.admin_hidden_at, tr.admin_hidden_reason,
        l.id listing_id, l.title listing_title,
        (select count(*) from public.reports r where r.review_id = tr.id and r.status = 'open') open_report_count
      from public.transaction_reviews tr
      join public.verified_transactions vt on vt.id = tr.transaction_id
      join public.listings l on l.id = vt.listing_id
      where tr.admin_hidden_at is null
        and exists(select 1 from public.reports r where r.review_id = tr.id and r.status = 'open')
        and (
          vt.review_deadline <= now()
          or (select count(*) from public.transaction_reviews pair where pair.transaction_id = vt.id) = 2
        )
      order by tr.submitted_at, tr.id
      limit p_page_size offset row_offset
    ) q;
  end if;

  return jsonb_build_object(
    'queue', p_queue,
    'page', p_page,
    'page_size', p_page_size,
    'total', item_count,
    'counts', public.get_admin_moderation_counts(),
    'items', coalesce(result, '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_admin_moderation_queue(text, integer, integer) from public;
grant execute on function public.get_admin_moderation_queue(text, integer, integer) to anon, authenticated;

create or replace function public.get_admin_domain_page(
  p_domain text,
  p_search text default null,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb := '[]'::jsonb;
  users_result jsonb := '[]'::jsonb;
  item_count bigint := 0;
  row_offset integer;
  search_pattern text := '%' || trim(coalesce(p_search, '')) || '%';
begin
  perform laria_private.assert_admin();
  if p_domain not in ('publicaciones', 'revisiones', 'tiendas', 'usuarios', 'reportes', 'resenas', 'transacciones', 'legacy') then
    raise exception 'ADMIN_DOMAIN_INVALID';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 50 then
    raise exception 'ADMIN_PAGINATION_INVALID';
  end if;
  row_offset := (p_page - 1) * p_page_size;

  if p_domain = 'publicaciones' then
    select count(*) into item_count from public.listings l
      where (p_status is null or p_status = '' or l.status::text = p_status)
        and (trim(coalesce(p_search, '')) = '' or l.title ilike search_pattern or l.slug ilike search_pattern or coalesce(l.contact_name, '') ilike search_pattern);
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb) into result from (
      select l.id, l.title, l.slug, l.status::text status, l.seller_type::text seller_type,
        l.created_at, l.published_at, l.owner_user_id, l.store_id,
        coalesce(s.name, p.full_name, l.contact_name, 'Vendedor de Laria') owner_name,
        l.category, l.brand, l.model, l.rejection_reason, l.hidden_reason, l.hidden_source
      from public.listings l left join public.stores s on s.id = l.store_id left join public.profiles p on p.id = l.owner_user_id
      where (p_status is null or p_status = '' or l.status::text = p_status)
        and (trim(coalesce(p_search, '')) = '' or l.title ilike search_pattern or l.slug ilike search_pattern or coalesce(l.contact_name, '') ilike search_pattern)
      order by l.created_at desc, l.id desc limit p_page_size offset row_offset
    ) q;
  elsif p_domain = 'revisiones' then
    select count(*) into item_count from public.listing_revisions r join public.listings l on l.id = r.listing_id
      where (p_status is null or p_status = '' or r.status = p_status)
        and (trim(coalesce(p_search, '')) = '' or l.title ilike search_pattern);
    select coalesce(jsonb_agg(to_jsonb(q) order by q.submitted_at desc, q.id desc), '[]'::jsonb) into result from (
      select r.id, r.listing_id, r.status, r.version, r.changed_fields, r.submitted_at, r.reviewed_at,
        r.rejection_reason, r.resolution_reason, l.title listing_title, p.full_name owner_name,
        jsonb_build_object(
          'title', l.title, 'category', l.category, 'instrument_type', l.instrument_type,
          'brand', l.brand, 'model', l.model, 'condition', l.condition,
          'attributes', l.attributes
        ) current_values,
        jsonb_build_object(
          'title', case when 'title' = any(r.changed_fields) then r.title else l.title end,
          'category', case when 'category' = any(r.changed_fields) then r.category else l.category end,
          'instrument_type', case when 'instrument_type' = any(r.changed_fields) then r.instrument_type else l.instrument_type end,
          'brand', case when 'brand' = any(r.changed_fields) then r.brand else l.brand end,
          'model', case when 'model' = any(r.changed_fields) then r.model else l.model end,
          'condition', case when 'condition' = any(r.changed_fields) then r.condition else l.condition end,
          'attributes', case when 'attributes' = any(r.changed_fields) then r.attributes else l.attributes end
        ) proposed_values,
        coalesce((
          select jsonb_agg(to_jsonb(photo) order by photo.sort_order, photo.id)
          from (
            select lp.id, lp.image_url, lp.alt_text, lp.sort_order
            from public.listing_photos lp where lp.listing_id = l.id
            order by lp.sort_order, lp.id limit 10
          ) photo
        ), '[]'::jsonb) current_photos,
        coalesce((
          select jsonb_agg(to_jsonb(photo) order by photo.sort_order, photo.id)
          from (
            select rp.id, rp.image_url, rp.alt_text, rp.sort_order
            from public.listing_revision_photos rp where rp.revision_id = r.id
            order by rp.sort_order, rp.id limit 10
          ) photo
        ), '[]'::jsonb) proposed_photos,
        (select count(*) from public.listing_revision_photos rp where rp.revision_id = r.id) proposed_photo_count
      from public.listing_revisions r join public.listings l on l.id = r.listing_id left join public.profiles p on p.id = r.owner_user_id
      where (p_status is null or p_status = '' or r.status = p_status)
        and (trim(coalesce(p_search, '')) = '' or l.title ilike search_pattern)
      order by r.submitted_at desc, r.id desc limit p_page_size offset row_offset
    ) q;
  elsif p_domain = 'tiendas' then
    select count(*) into item_count from public.stores s
      where (p_status is null or p_status = '' or s.status::text = p_status or (p_status = 'verified' and s.status = 'active' and s.is_verified))
        and (trim(coalesce(p_search, '')) = '' or s.id::text ilike search_pattern or s.name ilike search_pattern or coalesce(s.razon_social, '') ilike search_pattern or coalesce(s.ruc, '') ilike search_pattern);
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb) into result from (
      select s.id, s.name, s.slug, s.status::text status, s.is_verified, s.razon_social, s.ruc,
        s.city, s.region, s.district, s.address, s.created_at, s.owner_user_id,
        p.full_name owner_name, s.email, s.contact_person, s.contact_name,
        s.whatsapp_phone, s.description, s.website_url, s.instagram_url,
        s.facebook_url, s.tiktok_url, s.logo_url, s.banner_url,
        s.rejection_reason,
        (select count(*) from public.store_photos sp where sp.store_id = s.id) store_photo_count,
        (select count(*) from public.listings l where l.store_id = s.id) listing_count,
        (select count(*) from public.reports r where r.store_id = s.id) report_count,
        (select count(*) from public.reports r where r.store_id = s.id and r.status = 'open') open_report_count
      from public.stores s left join public.profiles p on p.id = s.owner_user_id
      where (p_status is null or p_status = '' or s.status::text = p_status or (p_status = 'verified' and s.status = 'active' and s.is_verified))
        and (trim(coalesce(p_search, '')) = '' or s.id::text ilike search_pattern or s.name ilike search_pattern or coalesce(s.razon_social, '') ilike search_pattern or coalesce(s.ruc, '') ilike search_pattern)
      order by s.created_at desc, s.id desc limit p_page_size offset row_offset
    ) q;
  elsif p_domain = 'usuarios' then
    select count(*) into item_count from public.profiles p
      where (p_status is null or p_status = '' or p.account_type = p_status)
        and (trim(coalesce(p_search, '')) = '' or coalesce(p.full_name, '') ilike search_pattern or coalesce(p.phone, '') ilike search_pattern or p.id::text ilike search_pattern);
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb) into result from (
      select p.id, p.full_name, p.phone, p.city, p.region, p.account_type, p.created_at,
        s.id store_id, s.name store_name,
        (select count(*) from public.listings l where l.owner_user_id = p.id) listing_count,
        (select count(*) from public.verified_transactions vt where vt.buyer_user_id = p.id or vt.seller_user_id = p.id) transaction_count
      from public.profiles p left join public.stores s on s.owner_user_id = p.id
      where (p_status is null or p_status = '' or p.account_type = p_status)
        and (trim(coalesce(p_search, '')) = '' or coalesce(p.full_name, '') ilike search_pattern or coalesce(p.phone, '') ilike search_pattern or p.id::text ilike search_pattern)
      order by p.created_at desc, p.id desc limit p_page_size offset row_offset
    ) q;
  elsif p_domain = 'reportes' then
    select count(*) into item_count from public.reports r
      where (p_status is null or p_status = '' or r.status = p_status)
        and (trim(coalesce(p_search, '')) = '' or r.reason ilike search_pattern or r.target_type ilike search_pattern or coalesce(r.detail, '') ilike search_pattern);
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb) into result from (
      select r.id, r.target_type, r.reason, r.detail, r.status, r.created_at, r.resolved_at,
        r.resolution_reason, r.listing_id, r.store_id, r.review_id,
        reporter.id reporter_user_id, reporter.full_name reporter_name,
        case r.target_type when 'listing' then l.title when 'store' then s.name else coalesce(rl.title, 'Reseña verificada') end target_title,
        resolver.full_name resolved_by_name
      from public.reports r
      join public.profiles reporter on reporter.id = r.reporter_user_id
      left join public.profiles resolver on resolver.id = r.resolved_by
      left join public.listings l on l.id = r.listing_id
      left join public.stores s on s.id = r.store_id
      left join public.transaction_reviews tr on tr.id = r.review_id
      left join public.verified_transactions vt on vt.id = tr.transaction_id
      left join public.listings rl on rl.id = vt.listing_id
      where (p_status is null or p_status = '' or r.status = p_status)
        and (trim(coalesce(p_search, '')) = '' or r.reason ilike search_pattern or r.target_type ilike search_pattern or coalesce(r.detail, '') ilike search_pattern)
      order by r.created_at desc, r.id desc limit p_page_size offset row_offset
    ) q;
  elsif p_domain = 'resenas' then
    select count(*) into item_count
    from public.transaction_reviews r
    join public.verified_transactions vt on vt.id = r.transaction_id
    join public.listings l on l.id = vt.listing_id
      where (p_status is null or p_status = '' or (p_status = 'visible' and r.admin_hidden_at is null) or (p_status = 'hidden' and r.admin_hidden_at is not null))
        and (
          vt.review_deadline <= now()
          or (select count(*) from public.transaction_reviews pair where pair.transaction_id = vt.id) = 2
        )
        and (
          trim(coalesce(p_search, '')) = ''
          or r.id::text ilike search_pattern
          or r.transaction_id::text ilike search_pattern
          or l.title ilike search_pattern
          or coalesce(r.comment, '') ilike search_pattern
        );
    select coalesce(jsonb_agg(to_jsonb(q) order by q.submitted_at desc, q.id desc), '[]'::jsonb) into result from (
      select r.id, r.transaction_id, r.direction, r.rating, r.comment, r.submitted_at,
        r.admin_hidden_at, r.admin_hidden_reason, l.id listing_id, l.title listing_title,
        (select count(*) from public.reports rp where rp.review_id = r.id and rp.status = 'open') open_report_count
      from public.transaction_reviews r join public.verified_transactions vt on vt.id = r.transaction_id join public.listings l on l.id = vt.listing_id
      where (p_status is null or p_status = '' or (p_status = 'visible' and r.admin_hidden_at is null) or (p_status = 'hidden' and r.admin_hidden_at is not null))
        and (
          vt.review_deadline <= now()
          or (select count(*) from public.transaction_reviews pair where pair.transaction_id = vt.id) = 2
        )
        and (
          trim(coalesce(p_search, '')) = ''
          or r.id::text ilike search_pattern
          or r.transaction_id::text ilike search_pattern
          or l.title ilike search_pattern
          or coalesce(r.comment, '') ilike search_pattern
        )
      order by r.submitted_at desc, r.id desc limit p_page_size offset row_offset
    ) q;
  elsif p_domain = 'transacciones' then
    select count(*) into item_count from public.transaction_claims c
      left join public.verified_transactions vt on vt.claim_id = c.id
      join public.listings l on l.id = c.listing_id
      where (
        p_status is null or p_status = ''
        or (p_status = 'verified' and vt.id is not null)
        or (p_status <> 'verified' and vt.id is null and c.status = p_status)
      )
        and (trim(coalesce(p_search, '')) = '' or l.title ilike search_pattern or c.id::text ilike search_pattern or coalesce(vt.id::text, '') ilike search_pattern);
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.claim_id desc), '[]'::jsonb) into result from (
      select c.id claim_id, vt.id transaction_id, c.listing_id, l.title listing_title,
        c.attribution_type, case when vt.id is not null then 'verified' else c.status end status,
        c.created_at, c.responded_at, vt.verified_at,
        coalesce(s.name, seller.full_name, 'Vendedor de Laria') seller_name,
        buyer.full_name buyer_name,
        (select count(*) from public.transaction_reviews r where r.transaction_id = vt.id) review_count
      from public.transaction_claims c join public.listings l on l.id = c.listing_id
      left join public.verified_transactions vt on vt.claim_id = c.id
      left join public.stores s on s.id = c.store_id
      left join public.profiles seller on seller.id = c.seller_user_id
      left join public.profiles buyer on buyer.id = c.buyer_user_id
      where (
        p_status is null or p_status = ''
        or (p_status = 'verified' and vt.id is not null)
        or (p_status <> 'verified' and vt.id is null and c.status = p_status)
      )
        and (trim(coalesce(p_search, '')) = '' or l.title ilike search_pattern or c.id::text ilike search_pattern or coalesce(vt.id::text, '') ilike search_pattern)
      order by c.created_at desc, c.id desc limit p_page_size offset row_offset
    ) q;
  else
    select count(*) into item_count from public.listings l
      where l.owner_user_id is null and l.created_by_source = 'legacy' and l.seller_type = 'individual'
        and (trim(coalesce(p_search, '')) = '' or l.title ilike search_pattern or coalesce(l.contact_name, '') ilike search_pattern or l.whatsapp_phone ilike search_pattern);
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb) into result from (
      select l.id, l.title, l.slug, l.status::text status, l.created_at,
        l.contact_name historical_contact_name, l.whatsapp_phone historical_whatsapp
      from public.listings l
      where l.owner_user_id is null and l.created_by_source = 'legacy' and l.seller_type = 'individual'
        and (trim(coalesce(p_search, '')) = '' or l.title ilike search_pattern or coalesce(l.contact_name, '') ilike search_pattern or l.whatsapp_phone ilike search_pattern)
      order by l.created_at desc, l.id desc limit p_page_size offset row_offset
    ) q;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb) into users_result from (
      select p.id, p.full_name, p.phone, p.city, p.region, p.created_at
      from public.profiles p
      where p.account_type = 'seller'
        and (trim(coalesce(p_search, '')) = '' or coalesce(p.full_name, '') ilike search_pattern or coalesce(p.phone, '') ilike search_pattern or p.id::text ilike search_pattern)
      order by p.created_at desc, p.id desc limit 20
    ) q;
  end if;

  return jsonb_build_object(
    'domain', p_domain,
    'page', p_page,
    'page_size', p_page_size,
    'total', item_count,
    'items', coalesce(result, '[]'::jsonb),
    'users', coalesce(users_result, '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_admin_domain_page(text, text, text, integer, integer) from public;
grant execute on function public.get_admin_domain_page(text, text, text, integer, integer) to anon, authenticated;

-- Dedicated domain readers keep growing Admin collections filterable without
-- changing the original generic RPC contract used by the first workbench UI.
create or replace function public.get_admin_listings_page(
  p_status text default null,
  p_owner_type text default null,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb := '[]'::jsonb;
  item_count bigint := 0;
  row_offset integer;
  search_pattern text := '%' || trim(coalesce(p_search, '')) || '%';
begin
  perform laria_private.assert_admin();
  if p_status is not null
    and p_status <> ''
    and p_status not in ('draft', 'pending', 'approved', 'rejected', 'sold', 'hidden', 'archived') then
    raise exception 'ADMIN_LISTING_STATUS_INVALID';
  end if;
  if p_owner_type is not null
    and p_owner_type <> ''
    and p_owner_type not in ('individual', 'store') then
    raise exception 'ADMIN_LISTING_OWNER_TYPE_INVALID';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 50 then
    raise exception 'ADMIN_PAGINATION_INVALID';
  end if;
  row_offset := (p_page - 1) * p_page_size;

  select count(*) into item_count
  from public.listings l
  left join public.stores s on s.id = l.store_id
  left join public.profiles p on p.id = l.owner_user_id
  where (p_status is null or p_status = '' or l.status::text = p_status)
    and (p_owner_type is null or p_owner_type = '' or l.seller_type::text = p_owner_type)
    and (
      trim(coalesce(p_search, '')) = ''
      or l.id::text ilike search_pattern
      or coalesce(l.store_id::text, '') ilike search_pattern
      or l.title ilike search_pattern
      or l.slug ilike search_pattern
      or coalesce(s.name, '') ilike search_pattern
      or coalesce(p.full_name, '') ilike search_pattern
      or coalesce(l.contact_name, '') ilike search_pattern
    );

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
  into result
  from (
    select l.id, l.title, l.slug, l.status::text status, l.seller_type::text seller_type,
      l.created_at, l.published_at, l.owner_user_id, l.store_id,
      coalesce(s.name, p.full_name, l.contact_name, 'Vendedor de Laria') owner_name,
      l.category, l.instrument_type, l.brand, l.model, l.condition, l.price_pen,
      l.description, l.city, l.region,
      (select count(*) from public.listing_photos lp where lp.listing_id = l.id) photo_count,
      l.rejection_reason, l.hidden_reason, l.hidden_source
    from public.listings l
    left join public.stores s on s.id = l.store_id
    left join public.profiles p on p.id = l.owner_user_id
    where (p_status is null or p_status = '' or l.status::text = p_status)
      and (p_owner_type is null or p_owner_type = '' or l.seller_type::text = p_owner_type)
      and (
        trim(coalesce(p_search, '')) = ''
        or l.id::text ilike search_pattern
        or coalesce(l.store_id::text, '') ilike search_pattern
        or l.title ilike search_pattern
        or l.slug ilike search_pattern
        or coalesce(s.name, '') ilike search_pattern
        or coalesce(p.full_name, '') ilike search_pattern
        or coalesce(l.contact_name, '') ilike search_pattern
      )
    order by l.created_at desc, l.id desc
    limit p_page_size offset row_offset
  ) q;

  return jsonb_build_object(
    'domain', 'publicaciones',
    'page', p_page,
    'page_size', p_page_size,
    'total', item_count,
    'filters', jsonb_build_object('status', p_status, 'owner_type', p_owner_type, 'search', p_search),
    'items', coalesce(result, '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_admin_listings_page(text, text, text, integer, integer) from public;
grant execute on function public.get_admin_listings_page(text, text, text, integer, integer) to anon, authenticated;

create or replace function public.get_admin_reports_page(
  p_status text default null,
  p_target_type text default null,
  p_reason text default null,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb := '[]'::jsonb;
  item_count bigint := 0;
  row_offset integer;
  search_pattern text := '%' || trim(coalesce(p_search, '')) || '%';
begin
  perform laria_private.assert_admin();
  if p_status is not null and p_status <> '' and p_status not in ('open', 'resolved', 'dismissed') then
    raise exception 'ADMIN_REPORT_STATUS_INVALID';
  end if;
  if p_target_type is not null and p_target_type <> '' and p_target_type not in ('listing', 'store', 'review') then
    raise exception 'ADMIN_REPORT_TARGET_TYPE_INVALID';
  end if;
  if p_reason is not null
    and p_reason <> ''
    and p_reason not in ('acoso', 'contenido_inapropiado', 'informacion_falsa', 'posible_estafa', 'articulo_prohibido', 'spam', 'otro') then
    raise exception 'ADMIN_REPORT_REASON_INVALID';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 50 then
    raise exception 'ADMIN_PAGINATION_INVALID';
  end if;
  row_offset := (p_page - 1) * p_page_size;

  select count(*) into item_count
  from public.reports r
  join public.profiles reporter on reporter.id = r.reporter_user_id
  left join public.listings l on l.id = r.listing_id
  left join public.stores target_store on target_store.id = coalesce(r.store_id, l.store_id)
  left join public.transaction_reviews tr on tr.id = r.review_id
  left join public.verified_transactions vt on vt.id = tr.transaction_id
  left join public.listings review_listing on review_listing.id = vt.listing_id
  where (p_status is null or p_status = '' or r.status = p_status)
    and (p_target_type is null or p_target_type = '' or r.target_type = p_target_type)
    and (p_reason is null or p_reason = '' or r.reason = p_reason)
    and (
      trim(coalesce(p_search, '')) = ''
      or r.id::text ilike search_pattern
      or coalesce(r.listing_id::text, r.store_id::text, r.review_id::text, '') ilike search_pattern
      or coalesce(reporter.full_name, '') ilike search_pattern
      or reporter.id::text ilike search_pattern
      or coalesce(l.title, target_store.name, review_listing.title, '') ilike search_pattern
      or r.reason ilike search_pattern
      or coalesce(r.detail, '') ilike search_pattern
    );

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
  into result
  from (
    select r.id, r.target_type, r.reason, r.detail, r.status, r.created_at, r.resolved_at,
      r.resolution_reason, r.listing_id, r.store_id, r.review_id,
      reporter.id reporter_user_id, reporter.full_name reporter_name,
      case r.target_type
        when 'listing' then l.title
        when 'store' then target_store.name
        else coalesce(review_listing.title, 'Reseña verificada')
      end target_title,
      case r.target_type
        when 'listing' then l.status::text
        when 'store' then target_store.status::text
        else case when tr.admin_hidden_at is null then 'visible' else 'hidden' end
      end target_status,
      case r.target_type
        when 'listing' then coalesce(l.owner_user_id, target_store.owner_user_id)
        when 'store' then target_store.owner_user_id
        else coalesce(tr.subject_user_id, review_subject_store.owner_user_id)
      end target_owner_user_id,
      case r.target_type
        when 'listing' then coalesce(target_store.name, listing_owner.full_name, l.contact_name, 'Vendedor de Laria')
        when 'store' then coalesce(store_owner.full_name, target_store.contact_person, target_store.name)
        else coalesce(review_subject.full_name, review_subject_store.name, 'Usuario de Laria')
      end target_owner_name,
      case r.target_type
          when 'listing' then (select count(*) from public.reports same_target
            where same_target.target_type = 'listing'
              and same_target.listing_id = r.listing_id
              and same_target.store_id is null
              and same_target.review_id is null)
          when 'store' then (select count(*) from public.reports same_target
            where same_target.target_type = 'store'
              and same_target.listing_id is null
              and same_target.store_id = r.store_id
              and same_target.review_id is null)
          when 'review' then (select count(*) from public.reports same_target
            where same_target.target_type = 'review'
              and same_target.listing_id is null
              and same_target.store_id is null
              and same_target.review_id = r.review_id)
        end target_report_count,
      case r.target_type
          when 'listing' then (select count(*) from public.reports same_target
            where same_target.target_type = 'listing' and same_target.status = 'open'
              and same_target.listing_id = r.listing_id
              and same_target.store_id is null
              and same_target.review_id is null)
          when 'store' then (select count(*) from public.reports same_target
            where same_target.target_type = 'store' and same_target.status = 'open'
              and same_target.listing_id is null
              and same_target.store_id = r.store_id
              and same_target.review_id is null)
          when 'review' then (select count(*) from public.reports same_target
            where same_target.target_type = 'review' and same_target.status = 'open'
              and same_target.listing_id is null
              and same_target.store_id is null
              and same_target.review_id = r.review_id)
        end open_target_report_count,
      resolver.full_name resolved_by_name
    from public.reports r
    join public.profiles reporter on reporter.id = r.reporter_user_id
    left join public.profiles resolver on resolver.id = r.resolved_by
    left join public.listings l on l.id = r.listing_id
    left join public.profiles listing_owner on listing_owner.id = l.owner_user_id
    left join public.stores target_store on target_store.id = coalesce(r.store_id, l.store_id)
    left join public.profiles store_owner on store_owner.id = target_store.owner_user_id
    left join public.transaction_reviews tr on tr.id = r.review_id
    left join public.verified_transactions vt on vt.id = tr.transaction_id
    left join public.listings review_listing on review_listing.id = vt.listing_id
    left join public.profiles review_subject on review_subject.id = tr.subject_user_id
    left join public.stores review_subject_store on review_subject_store.id = tr.subject_store_id
    where (p_status is null or p_status = '' or r.status = p_status)
      and (p_target_type is null or p_target_type = '' or r.target_type = p_target_type)
      and (p_reason is null or p_reason = '' or r.reason = p_reason)
      and (
        trim(coalesce(p_search, '')) = ''
        or r.id::text ilike search_pattern
        or coalesce(r.listing_id::text, r.store_id::text, r.review_id::text, '') ilike search_pattern
        or coalesce(reporter.full_name, '') ilike search_pattern
        or reporter.id::text ilike search_pattern
        or coalesce(l.title, target_store.name, review_listing.title, '') ilike search_pattern
        or r.reason ilike search_pattern
        or coalesce(r.detail, '') ilike search_pattern
      )
    order by r.created_at desc, r.id desc
    limit p_page_size offset row_offset
  ) q;

  return jsonb_build_object(
    'domain', 'reportes',
    'page', p_page,
    'page_size', p_page_size,
    'total', item_count,
    'filters', jsonb_build_object(
      'status', p_status,
      'target_type', p_target_type,
      'reason', p_reason,
      'search', p_search
    ),
    'items', coalesce(result, '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_admin_reports_page(text, text, text, text, integer, integer) from public;
grant execute on function public.get_admin_reports_page(text, text, text, text, integer, integer) to anon, authenticated;

create or replace function public.get_admin_legacy_page(
  p_listing_search text default null,
  p_user_search text default null,
  p_listing_page integer default 1,
  p_user_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  listings_result jsonb := '[]'::jsonb;
  users_result jsonb := '[]'::jsonb;
  listing_count bigint := 0;
  user_count bigint := 0;
  listing_offset integer;
  user_offset integer;
  listing_pattern text := '%' || trim(coalesce(p_listing_search, '')) || '%';
  user_pattern text := '%' || trim(coalesce(p_user_search, '')) || '%';
begin
  perform laria_private.assert_admin();
  if p_listing_page is null or p_listing_page < 1
    or p_user_page is null or p_user_page < 1
    or p_page_size is null or p_page_size not between 1 and 50 then
    raise exception 'ADMIN_PAGINATION_INVALID';
  end if;
  listing_offset := (p_listing_page - 1) * p_page_size;
  user_offset := (p_user_page - 1) * p_page_size;

  select count(*) into listing_count
  from public.listings l
  where l.owner_user_id is null
    and l.created_by_source = 'legacy'
    and l.seller_type = 'individual'
    and (
      trim(coalesce(p_listing_search, '')) = ''
      or l.id::text ilike listing_pattern
      or l.title ilike listing_pattern
      or l.slug ilike listing_pattern
      or coalesce(l.contact_name, '') ilike listing_pattern
      or l.whatsapp_phone ilike listing_pattern
    );

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
  into listings_result
  from (
    select l.id, l.title, l.slug, l.status::text status, l.created_at,
      l.contact_name historical_contact_name, l.whatsapp_phone historical_whatsapp
    from public.listings l
    where l.owner_user_id is null
      and l.created_by_source = 'legacy'
      and l.seller_type = 'individual'
      and (
        trim(coalesce(p_listing_search, '')) = ''
        or l.id::text ilike listing_pattern
        or l.title ilike listing_pattern
        or l.slug ilike listing_pattern
        or coalesce(l.contact_name, '') ilike listing_pattern
        or l.whatsapp_phone ilike listing_pattern
      )
    order by l.created_at desc, l.id desc
    limit p_page_size offset listing_offset
  ) q;

  select count(*) into user_count
  from public.profiles p
  where p.account_type = 'seller'
    and (
      trim(coalesce(p_user_search, '')) = ''
      or p.id::text ilike user_pattern
      or coalesce(p.full_name, '') ilike user_pattern
      or coalesce(p.phone, '') ilike user_pattern
    );

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
  into users_result
  from (
    select p.id, p.full_name, p.phone, p.city, p.region, p.created_at,
      (select count(*) from public.listings l where l.owner_user_id = p.id) listing_count
    from public.profiles p
    where p.account_type = 'seller'
      and (
        trim(coalesce(p_user_search, '')) = ''
        or p.id::text ilike user_pattern
        or coalesce(p.full_name, '') ilike user_pattern
        or coalesce(p.phone, '') ilike user_pattern
      )
    order by p.created_at desc, p.id desc
    limit p_page_size offset user_offset
  ) q;

  return jsonb_build_object(
    'domain', 'legacy',
    'page', p_listing_page,
    'listing_page', p_listing_page,
    'user_page', p_user_page,
    'page_size', p_page_size,
    'total', listing_count,
    'listing_total', listing_count,
    'user_total', user_count,
    'items', coalesce(listings_result, '[]'::jsonb),
    'users', coalesce(users_result, '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_admin_legacy_page(text, text, integer, integer, integer) from public;
grant execute on function public.get_admin_legacy_page(text, text, integer, integer, integer) to anon, authenticated;

create or replace function public.link_legacy_listing_owner(
  p_listing_id uuid,
  p_owner_user_id uuid,
  p_note text
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_record public.listings;
  target_profile public.profiles;
  clean_note text;
begin
  perform laria_private.assert_admin();
  clean_note := nullif(trim(coalesce(p_note, '')), '');
  if clean_note is null or length(clean_note) not between 3 and 500 then
    raise exception 'LEGACY_LINK_NOTE_REQUIRED';
  end if;

  select * into listing_record from public.listings where id = p_listing_id for update;
  if not found
    or listing_record.owner_user_id is not null
    or listing_record.created_by_source <> 'legacy'
    or listing_record.seller_type <> 'individual'
    or listing_record.store_id is not null then
    raise exception 'LEGACY_LISTING_NOT_ELIGIBLE';
  end if;

  select * into target_profile from public.profiles where id = p_owner_user_id;
  if not found or target_profile.account_type <> 'seller' then
    raise exception 'LEGACY_OWNER_NOT_ELIGIBLE';
  end if;

  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings
  set owner_user_id = target_profile.id
  where id = listing_record.id and owner_user_id is null
  returning * into listing_record;
  if not found then raise exception 'LEGACY_LISTING_ALREADY_LINKED'; end if;

  perform laria_private.record_admin_audit(
    'legacy_owner_linked',
    'legacy_link',
    listing_record.id,
    jsonb_build_object(
      'previous_owner_user_id', null,
      'owner_user_id', target_profile.id,
      'note', clean_note,
      'historical_contact_name', listing_record.contact_name,
      'historical_whatsapp', listing_record.whatsapp_phone
    )
  );
  return listing_record;
end;
$$;
revoke all on function public.link_legacy_listing_owner(uuid, uuid, text) from public;
grant execute on function public.link_legacy_listing_owner(uuid, uuid, text) to anon, authenticated;

create or replace function public.get_admin_audit_history(
  p_target_type text,
  p_target_id uuid,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform laria_private.assert_admin();
  if p_target_type not in ('listing', 'listing_revision', 'store', 'report', 'review', 'legacy_link')
    or p_target_id is null or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'ADMIN_AUDIT_QUERY_INVALID';
  end if;
  select coalesce(jsonb_agg(to_jsonb(history) order by history.created_at desc, history.id desc), '[]'::jsonb)
  into result
  from (
    select a.id, a.action, a.target_type, a.target_id, a.detail, a.created_at,
      a.admin_user_id, p.full_name admin_name
    from public.admin_audit_actions a
    left join public.profiles p on p.id = a.admin_user_id
    where a.target_type = p_target_type and a.target_id = p_target_id
    order by a.created_at desc, a.id desc
    limit p_limit
  ) history;
  return result;
end;
$$;
revoke all on function public.get_admin_audit_history(text, uuid, integer) from public;
grant execute on function public.get_admin_audit_history(text, uuid, integer) to anon, authenticated;

create index listings_admin_status_created_idx
  on public.listings(status, created_at desc, id desc);
create index listing_revisions_admin_status_submitted_idx
  on public.listing_revisions(status, submitted_at desc, id desc);
create index stores_admin_status_verification_created_idx
  on public.stores(status, is_verified, created_at desc, id desc);
create index profiles_admin_created_idx
  on public.profiles(created_at desc, id desc);
create index profiles_admin_account_created_idx
  on public.profiles(account_type, created_at desc, id desc);
create index listings_admin_owner_type_status_created_idx
  on public.listings(seller_type, status, created_at desc, id desc);
create index listings_legacy_unowned_idx
  on public.listings(created_at desc, id desc)
  where owner_user_id is null and created_by_source = 'legacy' and seller_type = 'individual';
create index transaction_claims_admin_created_idx
  on public.transaction_claims(created_at desc, id desc);
