# Product image indexing

The Product JSON-LD on listing pages uses absolute URLs on Laria's canonical origin:
`/_next/image?url=<encoded-photo-source>&w=1200&q=75`.

Raw Supabase public photo responses carry `X-Robots-Tag: none`, which tells Google not to
index those image URLs. Laria's existing Next.js optimizer serves the same photos without
that restriction. Using its public URLs in `Product.image` fixes the metadata mismatch
without changing buckets, permissions, object headers or the seller's original photo.
The optimizer's existing remote-source allowlist still applies. Relative local photo
paths stay relative inside the encoded source parameter.

The metadata still includes at most the first four nonempty photos, in their supplied
order. Listings without photos omit `image`. Product prices, availability, canonical
links, reviews, social preview cards and listing access/moderation rules are unchanged.
The endpoint uses Next's existing default 1200-pixel size and quality 75; an image remains
at its original aspect ratio.

## Merchant Center

This is an ordinary Google Search/product-snippet fix. It does not enable Merchant Center
or Shopping. Keep `LARIA_GOOGLE_SHOPPING_ACTIVE` unset/false under the owner's current
decision; no environment-variable change is needed for this fix. Valid Product or
Merchant-listing schema does not establish eligibility for a Merchant Center program.

## Validation and release check

- `tests/sprint-9.test.cjs` covers absolute optimizer URLs, exact source/query-string
  preservation, local paths, photo order, the four-photo limit and missing photos. The
  regression test failed against the old raw-URL behavior and passed after the fix.
- Local validation on 2026-10-29: all 879 unit tests, TypeScript, lint and the production
  build passed. The build used no hosted Supabase credentials; it is a compilation check.
- A bounded public request to the exact 1200-pixel representation of the sampled Yamaha
  photo returned HTTP 206, `image/jpeg`, and no `X-Robots-Tag`.

After deploying, fetch an approved listing's HTML, decode its Product JSON-LD and check
that every image is an absolute canonical-host optimizer URL. Fetch one of those images
and confirm an image content type and no `noindex`/`none` response header. Run Google's
Rich Results Test for that listing; optional missing-review warnings do not require fake
reviews or ratings. Confirm the Merchant Center activation flag remains off. Existing
Google results only change after Google recrawls and processes the new metadata; a
successful validation or indexing request does not guarantee display.
