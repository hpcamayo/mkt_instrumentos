# Effortless Laria: selling batch

Build thread for the selling ideas of the Effortless Laria program (`/mnt/project-files/ux-ideas/build-plan.md`). Ideas:
fix-02, fix-05, big-06, post-01 to post-11, post-13 to post-16, shop-06 and stock-09. post-12 waits for the catalog
autofill to reach `main`. Proposed decisions are numbered UXD-selling-n; the integrator moves them to `docs/decisions.md`.
Proposed acceptance cases: `docs/ux-effortless/selling-acceptance.tsv` (EASE-300 to EASE-399, Not Run).

## Fixes (branch `ux/effortless-selling-fixes`)

### FIX 02: phone photos no longer publish where the seller lives; big photos just work

- **What changed.** Every photo on the sell form and the edit form goes through `prepareListingPhoto`
  (`components/selling/prepare-photo.ts`) before upload: the browser redraws it as a JPEG of at most 2,400 px on its
  longest side (quality 0.88, then 0.8 and 0.7 if needed to stay under 5 MB). Redrawing drops the EXIF block, so the GPS
  position phones write is never uploaded. Photos up to 40 MB are accepted; the old "Cada foto debe pesar 5 MB o menos"
  refusal is gone. A photo the browser cannot redraw is handled strictly: a JPEG has its APP1–APP15 and comment segments
  cut out byte by byte; a PNG or WebP under 5 MB is sent as is; anything else is refused by name while the other photos
  are kept.
- **Files.** `components/selling/prepare-photo.ts` (new), `components/sell-listing-form.tsx`,
  `components/listing-edit-form.tsx` (owned by my-listings: the upload step prepares the photo, and the two size checks
  now use the 40 MB source limit), `tests/photo-editor.test.cjs` (mocks the helper; the oversized case is now 40 MB),
  `docs/functional-spec.md` (listing photos paragraph).
- **How to test.** Publish as `particular@laria.test` with a 10 MB phone photo that has GPS data. The stored object
  under `listing-photos/<user>/<submission>/0.jpg` is 2,400 px wide with no EXIF. Checked on the Docker-free prototype:
  a 10.4 MB, 4,800 px JPEG with a GPS block became an 820 KB, 2,400 px JPEG with an empty EXIF.
- **Defaults picked.** UXD-selling-1: every listing photo is stored as JPEG; transparent PNG areas become white (same as
  the store import).
- **Known limitations.** Photos already in storage keep their metadata; cleaning them needs a server job and is not part
  of this fix. Store application images (`store-registration-form.tsx`, stores batch) are not prepared yet; the helper
  is ready for that batch to adopt.

### FIX 05: "Publicar otro" after publishing a SKU

- **What changed.** The form keeps the SKU in state and clears it when the seller starts another listing, so the next
  listing is never sent for a SKU that already has one. After publishing a SKU the confirmation offers "Volver al SKU"
  and "Publicar el siguiente SKU sin publicación" (`/mi-cuenta/tienda/publicar?sku=siguiente`, which opens the first
  active SKU without a listing in SKU order, or says that every active SKU already has one). "Publicar otro
  instrumento" reloads the plain publish page, so the header no longer names the old SKU.
- **Files.** `components/sell-listing-form.tsx`, `app/mi-cuenta/tienda/publicar/page.tsx`.
- **How to test.** As `demo-tienda@laria.test`, open `/mi-cuenta/tienda/publicar?sku=siguiente`, publish, then use
  "Publicar el siguiente SKU sin publicación": the next SKU opens (checked: DAD-EXL110 → ERN-2221 → LAR-000001).
- **Defaults picked.** UXD-selling-2: "the next SKU" is the first active, unlinked SKU by SKU code.

Screenshots: `/mnt/project-files/ux-ideas/screens/selling/fix-*.png`.
