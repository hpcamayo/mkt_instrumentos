-- Deal-trust batch, patch (FD-deal-trust-4). A counter purchase (reach-11) has no publication, and the existing
-- "review_revealed" notification requires one (notifications_target_check). When both reviews of a counter purchase
-- are in, the notification is "store_counter_review_revealed" instead (in-app and push, no e-mail). Nothing else in
-- submit_transaction_review changes. Patched in place with laria_private.patch_function_text, which stops this
-- migration if the function changed since.

select laria_private.patch_function_text(
  'public.submit_transaction_review(uuid, integer, text)'::regprocedure,
  array[
    $old$select recipient,'review_revealed','Ambas reseñas fueron enviadas y ya están visibles.',transaction_record.listing_id,transaction_record.store_id,transaction_record.id$old$
  ],
  array[
    $new$select recipient,case when transaction_record.counter_sale_id is not null then 'store_counter_review_revealed' else 'review_revealed' end,'Ambas reseñas fueron enviadas y ya están visibles.',transaction_record.listing_id,transaction_record.store_id,transaction_record.id$new$
  ]
);
