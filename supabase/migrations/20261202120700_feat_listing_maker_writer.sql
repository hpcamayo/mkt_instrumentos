-- listing-details × discovery: the maker marks (disc-04 "Hecho a mano", "Hecho a pedido"; disc-05 the artist note)
-- are set in the sell form and saved with the listing, through the listing detail writers registry
-- (20261202120100). Discovery's table, rules and RPC (20261207120400: listing_maker_details,
-- set_listing_maker_details) stay as they are; the edit page keeps using them.
--
-- The writer runs inside complete_listing_submission (service role, no auth.uid()) and update_owned_listing_details,
-- so it checks the listing's own seller (laria_private.listing_seller_user) where set_listing_maker_details checks the
-- caller, and raises discovery's own errors (laria_private.raise_discovery_error) for the same cases.
--
-- Discovery's objects are created by a later migration (20261207120400). PL/pgSQL resolves them when a function first
-- runs, not when it is created, so these functions declare no row types of them.

create or replace function laria_private.write_listing_maker_details(p_listing_id uuid, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_store uuid;
  listing_status text;
  seller uuid;
  is_handmade boolean;
  weeks integer;
  note text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_value) as given(key) where given.key not in ('handmade', 'made_to_order_weeks', 'artist_note'))
    or coalesce(jsonb_typeof(p_value->'handmade'), 'null') not in ('boolean', 'null')
    or coalesce(jsonb_typeof(p_value->'made_to_order_weeks'), 'null') not in ('number', 'null')
    or coalesce(jsonb_typeof(p_value->'artist_note'), 'null') not in ('string', 'null') then
    raise exception 'LISTING_DETAILS_INVALID: Revisa los detalles de la publicación.';
  end if;
  is_handmade := coalesce((p_value->>'handmade')::boolean, false);
  if jsonb_typeof(p_value->'made_to_order_weeks') = 'number' then
    if (p_value->>'made_to_order_weeks')::numeric <> trunc((p_value->>'made_to_order_weeks')::numeric) then
      perform laria_private.raise_discovery_error('MADE_TO_ORDER_INVALID', 'Indica entre 1 y 26 semanas.');
    end if;
    if (p_value->>'made_to_order_weeks')::numeric not between 1 and 26 then
      perform laria_private.raise_discovery_error('MADE_TO_ORDER_INVALID', 'Indica entre 1 y 26 semanas.');
    end if;
    weeks := (p_value->>'made_to_order_weeks')::integer;
  end if;
  note := nullif(btrim(regexp_replace(coalesce(p_value->>'artist_note', ''), '\s+', ' ', 'g')), '');

  select l.store_id, l.status::text into listing_store, listing_status from public.listings l where l.id = p_listing_id;
  if listing_status is null then
    perform laria_private.raise_discovery_error('LISTING_NOT_FOUND', 'Esta publicación ya no está disponible.');
  end if;
  if listing_status in ('sold', 'archived') then
    perform laria_private.raise_discovery_error('LISTING_CLOSED', 'Esta publicación ya está cerrada.');
  end if;
  seller := laria_private.listing_seller_user((select l from public.listings l where l.id = p_listing_id));

  if (is_handmade or weeks is not null) and not exists (
    select 1 from public.store_maker_profiles m where m.store_id = listing_store and m.hidden_at is null
  ) then
    perform laria_private.raise_discovery_error('MAKER_REQUIRED', 'Primero marca tu tienda como Fabricante o Taller en Mi tienda.');
  end if;
  if note is not null and char_length(note) not between 3 and 140 then
    perform laria_private.raise_discovery_error('ARTIST_NOTE_LENGTH', 'La nota admite entre 3 y 140 caracteres.');
  end if;
  if note is not null and not exists (
    select 1 from public.artist_profiles a where a.user_id = seller and a.revoked_at is null
  ) then
    perform laria_private.raise_discovery_error('ARTIST_REQUIRED', 'Solo un artista verificado por Laria puede agregar esta nota.');
  end if;

  if not is_handmade and weeks is null and note is null then
    delete from public.listing_maker_details where listing_id = p_listing_id;
    return;
  end if;
  insert into public.listing_maker_details(listing_id, handmade, made_to_order_weeks, artist_note)
  values (p_listing_id, is_handmade, weeks, note)
  on conflict (listing_id) do update
    set handmade = excluded.handmade, made_to_order_weeks = excluded.made_to_order_weeks,
        artist_note = excluded.artist_note, updated_at = now();
end;
$$;

revoke all on function laria_private.write_listing_maker_details(uuid, jsonb) from public, anon, authenticated;

-- A duplicate or relisted copy keeps "Hecho a mano" and "a pedido" (the same maker's work) while the store still shows
-- its maker profile. The artist note is about one physical instrument, so it is not carried over.
create or replace function laria_private.copy_listing_maker_details(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.listing_maker_details(listing_id, handmade, made_to_order_weeks)
  select p_target_id, d.handmade, d.made_to_order_weeks
  from public.listing_maker_details d
  join public.listings target on target.id = p_target_id
  where d.listing_id = p_source_id
    and (d.handmade or d.made_to_order_weeks is not null)
    and exists (select 1 from public.store_maker_profiles m where m.store_id = target.store_id and m.hidden_at is null)
  on conflict (listing_id) do nothing;
end;
$$;

revoke all on function laria_private.copy_listing_maker_details(uuid, uuid) from public, anon, authenticated;

insert into laria_private.listing_detail_writers(key, writer, copier, owner_batch, note) values (
  'maker',
  'laria_private.write_listing_maker_details(uuid,jsonb)',
  'laria_private.copy_listing_maker_details(uuid,uuid)',
  'discovery',
  'disc-04 handmade and made to order, disc-05 artist note (listing_maker_details), set from the sell form'
) on conflict (key) do update set writer = excluded.writer, copier = excluded.copier, owner_batch = excluded.owner_batch,
  note = excluded.note;
