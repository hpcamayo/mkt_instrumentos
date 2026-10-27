-- Deal-trust batch, patch (FD-deal-trust-4), for launch audit A17 (20261114150000_launch_audit_review_trust.sql). When
-- Admin publishes a held review and both reviews of the sale are then in, public.publish_held_review sends "Ambas
-- reseñas" only for a sale with a publication. A counter purchase (reach-11) has none, so its buyer and its store
-- would never be told: they get "store_counter_review_revealed" instead, as public.submit_transaction_review sends
-- (20261203110000). verified_transactions_origin_check guarantees every other sale has a publication. Nothing else in
-- publish_held_review changes. Patched in place with laria_private.patch_function_text, which stops this migration if
-- the function changed since.

select laria_private.patch_function_text(
  'public.publish_held_review(uuid)'::regprocedure,
  array[
    $old$if sale.listing_id is not null
    and (select count(*) from public.transaction_reviews where transaction_id = sale.id) = 2$old$,
    $old$select recipient, 'review_revealed', 'Ambas reseñas fueron enviadas y ya están visibles.', sale.listing_id, sale.store_id, sale.id$old$
  ],
  array[
    $new$if (select count(*) from public.transaction_reviews where transaction_id = sale.id) = 2$new$,
    $new$select recipient, case when sale.counter_sale_id is not null then 'store_counter_review_revealed' else 'review_revealed' end, 'Ambas reseñas fueron enviadas y ya están visibles.', sale.listing_id, sale.store_id, sale.id$new$
  ]
);
