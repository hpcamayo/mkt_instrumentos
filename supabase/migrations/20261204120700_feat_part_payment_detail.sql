-- Selling tools, run-04 part payment as a listing detail (docs/feature-ideas/selling-tools.md, FD-selling-tools-9).
-- Registers the key "part_payment" in the listing-details writer registry (20261202120100), so the sell and edit forms
-- can send it with the other details and a duplicated or relisted store listing keeps it. The value is true, false or
-- null (follow the store's default in "Qué recibimos"). Alone in its own migration because it only adds a registry row
-- and its two functions; it redefines nothing shared.

create or replace function laria_private.write_listing_part_payment(p_listing_id uuid, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  v_value boolean;
  v_seller_type public.seller_type;
  previous text := current_setting('app.allow_listing_admin_fields', true);
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    v_value := null;
  elsif jsonb_typeof(p_value) = 'boolean' then
    v_value := p_value::text::boolean;
  else
    raise exception 'LISTING_DETAILS_INVALID: Elige si aceptas equipos como parte de pago.';
  end if;
  select seller_type into v_seller_type from public.listings where id = p_listing_id;
  if not found then
    raise exception 'LISTING_NOT_FOUND';
  end if;
  if v_seller_type <> 'store' then
    if v_value then
      raise exception 'LISTING_DETAILS_INVALID: Parte de pago es para publicaciones de tiendas.';
    end if;
    return;
  end if;
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings set accepts_part_payment = v_value
  where id = p_listing_id and accepts_part_payment is distinct from v_value;
  perform set_config('app.allow_listing_admin_fields', coalesce(previous, ''), true);
end;
$$;

create or replace function laria_private.copy_listing_part_payment(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, laria_private
as $$
declare
  previous text := current_setting('app.allow_listing_admin_fields', true);
begin
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings target
  set accepts_part_payment = source.accepts_part_payment
  from public.listings source
  where source.id = p_source_id and target.id = p_target_id and target.seller_type = 'store'
    and target.accepts_part_payment is distinct from source.accepts_part_payment;
  perform set_config('app.allow_listing_admin_fields', coalesce(previous, ''), true);
end;
$$;

revoke all on function laria_private.write_listing_part_payment(uuid, jsonb) from public, anon, authenticated;
revoke all on function laria_private.copy_listing_part_payment(uuid, uuid) from public, anon, authenticated;

insert into laria_private.listing_detail_writers(key, writer, copier, owner_batch, note) values (
  'part_payment',
  'laria_private.write_listing_part_payment(uuid,jsonb)',
  'laria_private.copy_listing_part_payment(uuid,uuid)',
  'selling-tools',
  'run-04: the store takes gear as part payment on this listing (null follows the store default)'
) on conflict (key) do update set writer = excluded.writer, copier = excluded.copier, owner_batch = excluded.owner_batch,
  note = excluded.note;
