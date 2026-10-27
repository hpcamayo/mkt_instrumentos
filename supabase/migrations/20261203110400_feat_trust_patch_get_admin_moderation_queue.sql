-- Deal-trust batch, patch (reach-11, FD-deal-trust-4). The queue of reported reviews joined each review to its
-- publication, which hid reported reviews of counter purchases. Left join, titled "Compra en tienda · <Tienda>".
-- Nothing else changes.

select laria_private.patch_function_text(
  'public.get_admin_moderation_queue(text, integer, integer)'::regprocedure,
  array[
    $old$vt.id = tr.transaction_id
      join public.listings l on l.id = vt.listing_id$old$,
    $old$tr.submitted_at, tr.admin_hidden_at, tr.admin_hidden_reason,
        l.id listing_id, l.title listing_title,$old$
  ],
  array[
    $new$vt.id = tr.transaction_id
      left join public.listings l on l.id = vt.listing_id
      left join public.stores counter_store on counter_store.id = vt.store_id and vt.counter_sale_id is not null$new$,
    $new$tr.submitted_at, tr.admin_hidden_at, tr.admin_hidden_reason,
        l.id listing_id, coalesce(l.title, 'Compra en tienda · ' || counter_store.name) listing_title,$new$
  ]
);
