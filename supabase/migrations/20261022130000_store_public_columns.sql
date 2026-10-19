-- Store data exposure: the public could read every column of an active store.
--
-- Before: anon and authenticated had table-level SELECT on public.stores, and the policy "Public can read active
-- stores" let them read any active store's row. Through the public API key anyone could read RUC, razón social,
-- e-mail, contact person, street address, owner id, rejection reason and plan of every active store, although no
-- public page shows them (components/store/store-sections.tsx: "No street address or contact person").
--
-- After: anon and authenticated read only the columns public pages use (store page, listing cards and detail,
-- home, sitemap, contact). Authenticated also reads owner_user_id, which owners filter on to find their own store
-- (a user id, which listings already carry). The owner's private fields come from get_own_store() and an Admin's
-- from admin_get_store(). Row policies are unchanged; writes are unchanged.
--
-- A column added to public.stores later is private by default: it needs its own column grant to be public.

revoke select on public.stores from anon, authenticated;

grant select (
  id,
  name,
  slug,
  description,
  status,
  city,
  district,
  region,
  whatsapp_phone,
  logo_url,
  banner_url,
  is_verified,
  created_at,
  updated_at,
  instagram_url,
  facebook_url,
  tiktok_url,
  website_url
) on public.stores to anon, authenticated;

grant select (owner_user_id) on public.stores to authenticated;

-- The signed-in store owner's own store, every column. Same rows the policy "Store owners can read own stores"
-- allows for the owner; used by Mi cuenta and Mi tienda.
create or replace function public.get_own_store()
returns setof public.stores
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.stores s
  where auth.uid() is not null
    and s.owner_user_id = auth.uid()
  limit 1
$$;

-- One store, every column, for Admin (the store editor in Admin).
create or replace function public.admin_get_store(p_store_id uuid)
returns setof public.stores
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return query select s.* from public.stores s where s.id = p_store_id;
end;
$$;

revoke all on function public.get_own_store() from public, anon;
revoke all on function public.admin_get_store(uuid) from public, anon;
grant execute on function public.get_own_store() to authenticated;
grant execute on function public.admin_get_store(uuid) to authenticated;
