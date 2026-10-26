-- Deal-trust batch, patch (safe-06, FD-deal-trust-7). Each review item of the public reputation gains "photos": the
-- review's photos Admin approved, [{id}] (the image is /api/review-photos/<id>), [] when there are none. Nothing else
-- changes.

select laria_private.patch_function_text(
  'laria_private.get_reputation(uuid, uuid, text, integer)'::regprocedure,
  array[
    $old$'reviewer_name',reviewer_name) order by submitted_at desc,id desc) from items)$old$
  ],
  array[
    $new$'reviewer_name',reviewer_name,'photos',laria_private.review_photo_items(id)) order by submitted_at desc,id desc) from items)$new$
  ]
);
