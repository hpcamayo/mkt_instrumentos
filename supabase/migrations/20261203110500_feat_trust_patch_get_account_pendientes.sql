-- Deal-trust batch, patch (reach-11, FD-deal-trust-4). "Reseñas pendientes" on the account home joined each verified
-- transaction to its publication, which left counter purchases out. Left join, titled "Compra en <Tienda>". Nothing
-- else changes.

select laria_private.patch_function_text(
  'public.get_account_pendientes()'::regprocedure,
  array[
    $old$'listing_id', t.listing_id, 'title', l.title, 'deadline', t.review_deadline,$old$,
    $old$from public.verified_transactions t join public.listings l on l.id = t.listing_id$old$
  ],
  array[
    $new$'listing_id', t.listing_id, 'title', coalesce(l.title, (select 'Compra en ' || s.name from public.stores s where s.id = t.store_id)), 'deadline', t.review_deadline,$new$,
    $new$from public.verified_transactions t left join public.listings l on l.id = t.listing_id$new$
  ]
);
