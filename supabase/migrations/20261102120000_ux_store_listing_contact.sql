-- Effortless Laria, batch "listing", fix-03 (docs/ux-effortless/listing.md): a store's new WhatsApp number reaches
-- its listings. Store listings copy the store's number when they are created (store_publish_inventory_listing and the
-- store publish form), and nothing updated that copy when the store changed its number, so every listing kept sending
-- buyers to the old one. The app now reads a store listing's contact from the store (lib/seller-contact.ts); this
-- keeps the stored copy in step too, so every other reader (admin, the seller's own lists, exports) agrees.
--
-- Sold listings keep their number: a sold record is immutable history (SOLD_LISTING_IMMUTABLE).

create or replace function laria_private.sync_store_listing_contact_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_bypass text := coalesce(current_setting('app.allow_listing_admin_fields', true), '');
begin
  if new.whatsapp_phone is null or regexp_replace(new.whatsapp_phone, '[^0-9]', '', 'g') = '' then
    return new;
  end if;
  -- The listing guard refuses direct edits of approved listings outside the controlled edit flow. This trigger only
  -- copies the store's own, already validated number, so it opens that guard for this one statement and restores it.
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings
     set whatsapp_phone = new.whatsapp_phone
   where store_id = new.id
     and seller_type = 'store'
     and status <> 'sold'
     and whatsapp_phone is distinct from new.whatsapp_phone;
  perform set_config('app.allow_listing_admin_fields', previous_bypass, true);
  return new;
end;
$$;

revoke all on function laria_private.sync_store_listing_contact_phone() from public, anon, authenticated;

drop trigger if exists stores_sync_listing_contact_phone on public.stores;
create trigger stores_sync_listing_contact_phone
after update of whatsapp_phone on public.stores
for each row
when (old.whatsapp_phone is distinct from new.whatsapp_phone)
execute function laria_private.sync_store_listing_contact_phone();

-- Listings that already drifted: bring every unsold store listing to its store's current number once.
do $$
begin
  perform set_config('app.allow_listing_admin_fields', 'true', true);
  update public.listings l
     set whatsapp_phone = s.whatsapp_phone
    from public.stores s
   where l.store_id = s.id
     and l.seller_type = 'store'
     and l.status <> 'sold'
     and regexp_replace(coalesce(s.whatsapp_phone, ''), '[^0-9]', '', 'g') <> ''
     and l.whatsapp_phone is distinct from s.whatsapp_phone;
  perform set_config('app.allow_listing_admin_fields', '', true);
end;
$$;
