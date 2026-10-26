-- Deal-trust batch, patch (safe-06, FD-deal-trust-7). Each item of the "Ver más reseñas" pages gains "photos", as in
-- get_reputation. Nothing else changes.

select laria_private.patch_function_text(
  'public.get_public_review_page(uuid, uuid, integer, integer)'::regprocedure,
  array[
    $old$'submitted_at', submitted_at, 'reviewer_name', reviewer_name) order by submitted_at desc, id desc) from page)$old$
  ],
  array[
    $new$'submitted_at', submitted_at, 'reviewer_name', reviewer_name, 'photos', laria_private.review_photo_items(id)) order by submitted_at desc, id desc) from page)$new$
  ]
);
