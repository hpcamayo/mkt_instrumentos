-- safe-11 «Historial en Laria» (docs/feature-ideas/deal-trust.md, FD-deal-trust-14 and 15).
--
-- Someone who bought an instrument through a verified transaction and later sells it on Laria can link the new
-- publication to that purchase. The publication then shows "Comprado en Laria en mayo de 2026 · 1 dueño anterior en
-- Laria" and the original publication's specs. Linking is the new owner's consent; nothing about the previous seller
-- (name, city, the old publication's address) is shown. Counter purchases (reach-11) have no publication and can't be
-- linked.

create table public.listing_provenance (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  transaction_id uuid not null unique references public.verified_transactions(id) on delete restrict,
  linked_by uuid not null references public.profiles(id) on delete restrict,
  linked_at timestamptz not null default now()
);
create index if not exists listing_provenance_linked_by_idx on public.listing_provenance (linked_by);

alter table public.listing_provenance enable row level security;
revoke all on public.listing_provenance from anon, authenticated;

-- Public history of one publication: when it was bought on Laria, how many owners it had here before (following
-- earlier links, at most ten), and how the original publication described it.
create or replace function laria_private.listing_provenance_json(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain(listing_id, transaction_id, depth) as (
    select p.listing_id, p.transaction_id, 1 from public.listing_provenance p where p.listing_id = p_listing_id
    union all
    select p.listing_id, p.transaction_id, chain.depth + 1
    from chain
    join public.verified_transactions t on t.id = chain.transaction_id
    join public.listing_provenance p on p.listing_id = t.listing_id
    where chain.depth < 10
  )
  select jsonb_build_object(
    'bought_at', t.verified_at,
    'previous_owners', (select max(depth) from chain),
    'original', jsonb_build_object(
      'category', original.category,
      'instrument_type', original.instrument_type,
      'brand', original.brand,
      'model', original.model,
      'condition', original.condition,
      'attributes', coalesce(original.attributes, '{}'::jsonb),
      'published_at', coalesce(original.published_at, original.created_at)
    )
  )
  from chain
  join public.verified_transactions t on t.id = chain.transaction_id
  join public.listings original on original.id = t.listing_id
  where chain.depth = 1
$$;

revoke all on function laria_private.listing_provenance_json(uuid) from public, anon, authenticated;

-- The card on the buyer's transaction page: which of their publications is linked, and which could be.
create or replace function public.get_my_provenance_options(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  transaction_record public.verified_transactions;
  linked public.listing_provenance;
begin
  if me is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  select * into transaction_record from public.verified_transactions where id = p_transaction_id and buyer_user_id = me;
  if not found or transaction_record.listing_id is null then return jsonb_build_object('eligible', false); end if;
  select * into linked from public.listing_provenance where transaction_id = transaction_record.id;
  return jsonb_build_object(
    'eligible', true,
    'linked', case when linked.listing_id is not null then (
      select jsonb_build_object('listing_id', l.id, 'title', l.title, 'slug', l.slug, 'status', l.status)
      from public.listings l where l.id = linked.listing_id) end,
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object('listing_id', l.id, 'title', l.title, 'status', l.status) order by l.created_at desc)
      from public.listings l
      where l.owner_user_id = me and l.seller_type = 'individual' and l.store_id is null
        and l.status in ('draft', 'pending', 'approved', 'hidden', 'rejected')
        and l.id <> transaction_record.listing_id
        and not exists (select 1 from public.listing_provenance p where p.listing_id = l.id)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_provenance_options(uuid) from public, anon;
grant execute on function public.get_my_provenance_options(uuid) to authenticated, service_role;

-- Links (or moves the link to) one of the buyer's own publications. A purchase that was already resold through a
-- linked publication keeps that link.
create or replace function public.link_listing_provenance(p_transaction_id uuid, p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  transaction_record public.verified_transactions;
  target public.listings;
  current_link public.listing_provenance;
begin
  if me is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  select * into transaction_record from public.verified_transactions where id = p_transaction_id for update;
  if not found or transaction_record.buyer_user_id <> me or transaction_record.listing_id is null then
    raise exception 'PROVENANCE_TRANSACTION_INVALID';
  end if;
  select * into target from public.listings where id = p_listing_id for update;
  if not found or target.owner_user_id is distinct from me or target.seller_type <> 'individual' or target.store_id is not null
     or target.status not in ('draft', 'pending', 'approved', 'hidden', 'rejected') or target.id = transaction_record.listing_id then
    raise exception 'PROVENANCE_LISTING_INVALID';
  end if;
  if exists (select 1 from public.listing_provenance p where p.listing_id = target.id and p.transaction_id <> transaction_record.id) then
    raise exception 'PROVENANCE_LISTING_TAKEN';
  end if;
  select * into current_link from public.listing_provenance where transaction_id = transaction_record.id;
  if found and current_link.listing_id <> target.id then
    if exists (select 1 from public.listings l where l.id = current_link.listing_id and l.status = 'sold') then
      raise exception 'PROVENANCE_ALREADY_RESOLD';
    end if;
    delete from public.listing_provenance where transaction_id = transaction_record.id;
  end if;
  insert into public.listing_provenance(listing_id, transaction_id, linked_by)
  values (target.id, transaction_record.id, me)
  on conflict (listing_id) do nothing;
  return public.get_my_provenance_options(transaction_record.id);
end;
$$;

revoke all on function public.link_listing_provenance(uuid, uuid) from public, anon;
grant execute on function public.link_listing_provenance(uuid, uuid) to authenticated, service_role;

create or replace function public.unlink_listing_provenance(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'TRANSACTION_AUTH_REQUIRED'; end if;
  delete from public.listing_provenance p
  using public.verified_transactions t
  where p.transaction_id = t.id and t.id = p_transaction_id and t.buyer_user_id = auth.uid();
  return public.get_my_provenance_options(p_transaction_id);
end;
$$;

revoke all on function public.unlink_listing_provenance(uuid) from public, anon;
grant execute on function public.unlink_listing_provenance(uuid) to authenticated, service_role;
