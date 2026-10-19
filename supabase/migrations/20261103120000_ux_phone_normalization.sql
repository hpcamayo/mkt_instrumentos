-- Effortless Laria, accounts batch, fix-01 (docs/ux-effortless/accounts.md): WhatsApp numbers typed the way Peruvians
-- write them ("987 654 321") were saved as 987654321, and wa.me/987654321 does not open. From now on every write to
-- profiles.phone, listings.whatsapp_phone and stores.whatsapp_phone stores digits with the country code, and the
-- numbers already stored are corrected once. The rule matches lib/phone.ts (normalizePeruPhone):
--   * keep digits only; a leading 00 (international prefix) is dropped;
--   * nine digits starting with 9 (a Peruvian mobile) get 51 in front;
--   * anything else is kept as digits, so foreign numbers and already-correct numbers do not change.

create or replace function laria_private.normalize_pe_phone(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    when digits ~ '^9[0-9]{8}$' then '51' || digits
    else digits
  end
  from (select regexp_replace(regexp_replace(p_value, '[^0-9]', '', 'g'), '^00', '') as digits) as cleaned;
$$;

comment on function laria_private.normalize_pe_phone(text) is
  'WhatsApp numbers as digits with the country code: 9-digit Peruvian mobiles get 51 in front (fix-01).';

-- The trigger functions are security definer because signed-in users have no access to laria_private.
-- BEFORE triggers run in name order. These names sort before listings_protect_admin_fields,
-- profiles_protect_admin_fields and stores_protect_admin_fields, so an owner who retypes the same number as
-- "987 654 321" on an approved listing is not mistaken for a contact change.
create or replace function laria_private.normalize_profile_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.phone := laria_private.normalize_pe_phone(new.phone);
  return new;
end;
$$;

create or replace function laria_private.normalize_whatsapp_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.whatsapp_phone := laria_private.normalize_pe_phone(new.whatsapp_phone);
  return new;
end;
$$;

create trigger profiles_normalize_phone
before insert or update of phone on public.profiles
for each row execute function laria_private.normalize_profile_phone();

create trigger listings_normalize_whatsapp_phone
before insert or update of whatsapp_phone on public.listings
for each row execute function laria_private.normalize_whatsapp_phone();

create trigger stores_normalize_whatsapp_phone
before insert or update of whatsapp_phone on public.stores
for each row execute function laria_private.normalize_whatsapp_phone();

-- One-time correction of stored numbers. Listings are protected (sold listings are immutable and approved ones need
-- the controlled edit flow), so this transaction-local switch lets the migration fix the contact number only.
-- The admin audit trigger skips rows changed without a signed-in Admin, and updated_at moves to now on the rows
-- that change.
select set_config('app.allow_listing_admin_fields', 'true', true);

update public.profiles
set phone = laria_private.normalize_pe_phone(phone)
where phone is distinct from laria_private.normalize_pe_phone(phone);

update public.listings
set whatsapp_phone = laria_private.normalize_pe_phone(whatsapp_phone)
where whatsapp_phone is distinct from laria_private.normalize_pe_phone(whatsapp_phone);

update public.stores
set whatsapp_phone = laria_private.normalize_pe_phone(whatsapp_phone)
where whatsapp_phone is distinct from laria_private.normalize_pe_phone(whatsapp_phone);

select set_config('app.allow_listing_admin_fields', 'false', true);
