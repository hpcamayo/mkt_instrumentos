create or replace function public.increment_listing_view_count(p_listing_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_view_count integer;
begin
  update public.listings
  set view_count = coalesce(view_count, 0) + 1
  where id = p_listing_id
    and status = 'approved'
  returning view_count into next_view_count;

  return next_view_count;
end;
$$;

grant execute on function public.increment_listing_view_count(uuid) to anon, authenticated;
