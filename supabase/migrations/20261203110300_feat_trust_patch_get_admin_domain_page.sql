-- Deal-trust batch, patch (reach-11, FD-deal-trust-4). Admin > Reseñas joined each review to its publication, which
-- hid the reviews of counter purchases (they have none). The join becomes a left join and such a review is titled
-- "Compra en tienda · <Tienda>". Nothing else changes.

select laria_private.patch_function_text(
  'public.get_admin_domain_page(text, text, text, integer, integer)'::regprocedure,
  array[
    $old$vt.id = r.transaction_id
    join public.listings l on l.id = vt.listing_id$old$,
    $old$vt.id = r.transaction_id join public.listings l on l.id = vt.listing_id$old$,
    $old$r.admin_hidden_at, r.admin_hidden_reason, l.id listing_id, l.title listing_title,$old$
  ],
  array[
    $new$vt.id = r.transaction_id
    left join public.listings l on l.id = vt.listing_id$new$,
    $new$vt.id = r.transaction_id left join public.listings l on l.id = vt.listing_id left join public.stores counter_store on counter_store.id = vt.store_id and vt.counter_sale_id is not null$new$,
    $new$r.admin_hidden_at, r.admin_hidden_reason, l.id listing_id, coalesce(l.title, 'Compra en tienda · ' || counter_store.name) listing_title,$new$
  ]
);
