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

## The sell form (branch `ux/effortless-selling`)

Everything below is one rebuilt form, `components/sell-listing-form.tsx`, used by `/mi-cuenta/publicar` (Particular) and
`/mi-cuenta/tienda/publicar` (store, with or without a SKU). Screenshots at 390 and 1366 px:
`/mnt/project-files/ux-ideas/screens/selling/step*.png`, `success-*.png` and `store-*.png`.

How to test all of it on the Docker-free prototype: `bash scripts/prototype/start-docker-free.sh seed`, `pnpm build`,
`pnpm start`, sign in as `particular@laria.test` or `demo-tienda@laria.test` (password `laria-demo-2026`), open Publicar.
The scripted run (photos, steps, sound clip, Guardar borrador, preview, Publicar) passed at both widths with no browser
errors.

### BIG 06: sell from your camera, photos first, on phones and computers

- **What changed.** Four steps on every screen size: Fotos, Qué es, Estado y precio, Revisar y publicar. A step bar
  shows where the seller is and lets them go back to any step already reached; Continuar checks only the current
  step's fields. Photos are the first step (Henri's note: on PC as well), and each photo starts shrinking and uploading
  the moment it is added while the seller moves on. On phones "Tomar foto" opens the camera; on computers there is
  "Elegir fotos" and a drop zone. A sticky card preview sits beside the form on wide screens.
- **Files.** `components/sell-listing-form.tsx`, `components/selling/photo-step.tsx`, `components/selling/listing-uploads.ts`.
- **Shared from the gallery (big-12, speed batch).** When the form opens with `?compartido=1`, it takes the photos the
  service worker kept (`takeSharedPhotos`, `lib/share-target.ts`) and adds them exactly as if they were picked, then
  drops the marker from the address. A share starts a new listing, so an older unfinished one on the device is not
  offered over it. Checked on the prototype: two shared photos arrived in order and uploaded, and the device copy was
  removed.
- **Defaults.** UXD-selling-3: the seller's contact and store notice stay at the top of step 1, so who publishes is
  clear before the first photo.

### POST 01 and POST 02: drafts that are never lost and follow the seller

- **What changed.** The form (values, uploaded photo paths, sound clip, submission token) is saved in `localStorage`
  half a second after each change and offered back on return ("Retomar tu borrador" or "Descartar"). A token lasts a
  week (launch audit A35), so a draft taken back renews it for the same submission (`renew` in
  `app/api/submissions/route.ts`) and keeps its photos; publishing with an expired token renews it and sends again. "Guardar borrador"
  also saves it to the account in the new `listing_drafts` table; after that every change is saved there too. Drafts
  are listed with "Continuar" on the publish pages and in Mis publicaciones (`components/selling/draft-list.tsx`) and
  open at the first step that still needs something. Publishing deletes the draft in the same transaction
  (`complete_public_submission`). Leaving while photos are still uploading asks for confirmation.
- **Files.** `supabase/migrations/20261104120000_ux_selling_drafts.sql`, `lib/sell-draft.ts`, `lib/sell-page-data.ts`,
  `app/api/submissions/route.ts` (new `resume` action), `lib/submission-token.ts`, both publish pages,
  `app/mi-cuenta/publicaciones/page.tsx` (my-listings: one block that lists drafts).
- **Defaults.** UXD-selling-4: drafts get their own owner-only table, not `listings.status = 'draft'`, so no listing
  reader, allowance or moderation query has to learn to skip them. UXD-selling-5: a draft's id is its submission id;
  resuming re-signs a token for that id, so its photos stay where they are. UXD-selling-6: at most 20 drafts per seller.
- **Limitations.** A draft kept only on the device leaves its uploaded photos in the public bucket if the seller never
  comes back; a sweep job for folders with no listing and no draft is needed before launch. It should cover the
  `listing-sound-clips` bucket too, whose files stay when a clip's row is removed (integration).

### POST 03 and POST 04: photos upload while you type; iPhone photos and big files just work

- **What changed.** Uploads go straight to Storage with progress (`uploadObject`, three at a time), shown on each photo
  ("Subiendo 40%", "Subida", "Reintentar"). Publicar waits for any upload still running. HEIC photos are converted in
  the browser (`heic2any`, loaded only when needed). Big files: see FIX 02.
- **Defaults.** UXD-selling-7: a photo slot is never reused within a submission (replacing a photo writes a new file),
  so an upload can never overwrite a photo another device still shows; unused files are removed when the listing is
  completed.

### POST 05 and POST 06: rearranging photos; a shot list per instrument

- **What changed.** Each photo has a drag handle and buttons (Anterior, Siguiente, Usar como principal, Reemplazar,
  Quitar). Quitar is always available; the two-photo minimum is checked when continuing. Above the photos, a shot list
  per category (guitars: frente, reverso, clavijero y número de serie, trastes, electrónica…) opens the camera or the
  picker and marks a shot as done. On phones each photo is a row beside its buttons; wider screens show tiles.
- **Files.** `components/selling/photo-step.tsx`, `lib/sell-guidance.ts`.

### POST 07 to POST 09: title, brand suggestions, description prompts

- **What changed.** The title is brand plus model until the seller edits it. Brands come from the instrument catalog
  for the chosen category (datalist plus the six most common as chips). Description starters per instrument type are
  inserted with the caret after them; a counter shows how far from the 40-character minimum the seller is, with a check
  mark when it is enough (not color alone).
- **Files.** `lib/sell-guidance.ts`, `lib/sell-page-data.ts` (`loadSellBrands`).
- **Limitations.** Catalog autofill (post-12) is left out until it reaches `main`.

### POST 10 and POST 11: see it before you send it; hints that prevent a rejection

- **What changed.** Step 4 shows the catalog card and, on request, the listing page with the seller block and the
  usual trust text (`components/selling/listing-preview.tsx`). Hints point out a phone number, links or social handles,
  an all-caps title, a symbolic price under S/ 20, or two photos without front and back. They are advice only and never
  block Publicar.

### POST 13: publish a similar one, and Duplicar

- **What changed.** After sending, "Publicar uno parecido" starts a new form keeping category, type, brand, condition,
  location, description and attributes (never photos, price, model or title). "Duplicar" in Mis publicaciones and in
  the store's listing table opens the form from an existing listing (`?desde=`), filtered to the seller's own listings.
- **Files.** `components/listing-management-table.tsx` (my-listings: optional `publishPath` prop and the Duplicar link),
  `app/mi-cuenta/tienda/inventario/page.tsx` (inventory: passes `publishPath`).
- **At integration.** Duplicar is the my-listings batch's full copy, photos included, as shop-08 was approved; the
  `?desde=` start and the `publishPath` prop are gone. "Publicar uno parecido" stays as built here
  (`docs/ux-effortless/integration.md`, UXD-integration-2).

### POST 14: know what happens while you wait

- **What changed.** A listing in review shows Enviada, En revisión (ahora), Publicada, and the usual wait from
  `listing_review_wait_minutes()`.
- **Defaults.** UXD-selling-8: the wait is the median for Particular listings published in the last 60 days, and it is
  shown only when there are at least 20 of them; otherwise nothing is promised.

### POST 15: a moment to celebrate

- **What changed.** A live listing's confirmation reads "Tu publicación está en línea" with Ver publicación and
  Compartir (system share sheet, then copy link, then WhatsApp). The approval e-mail now uses the same heading and
  opens the listing itself (`lib/email/templates.ts`, owned by accounts: additive edit in one case).
- **Defaults.** UXD-selling-9: no exclamation marks, per the copy rules (`tests/ux-copy.test.cjs`); no confetti.

### POST 16: let buyers hear it

- **What changed.** An optional clip of up to 20 seconds, recorded (Opus at 64 kbps, stops at 20 s) or picked from a
  file (decoded and saved as 22 kHz mono WAV, under 1 MB). It uploads to the new public bucket `listing-sound-clips`
  and is recorded in `listing_sound_clips` when the listing is completed. The listing page shows "Cómo suena" with an
  audio player that loads nothing until tapped (`preload="none"`, no autoplay); the Admin queue plays it next to the
  photos, so it is reviewed with the listing.
- **Files.** `supabase/migrations/20261104120100_ux_selling_sound_clips.sql`, `components/selling/sound-clip-field.tsx`,
  `components/selling/listing-sound-clip.tsx`, `app/instrumentos/[slug]/page.tsx` (listing batch: one line),
  `components/admin-workbench.tsx` (one line), `scripts/prototype/local-gateway.cjs` (audio MIME types).
- **Defaults.** UXD-selling-10: the clip row is readable exactly when its listing is (its policy reads `listings` under
  the caller's RLS); only Admins delete it.
- **Limitations.** The edit form cannot add, replace or remove a clip yet.

### SHOP 06: store defaults for new listings

- **What changed.** New page `/mi-cuenta/tienda/valores-por-defecto`: a default condition and a standard text for the
  end of every description (`store_listing_defaults`). The store sell form starts with both; description starters are
  inserted above the standard text, and the 40-character minimum counts only the seller's own words. The publish page
  links to it; the stores batch adds the link from Mi tienda.
- **Defaults.** UXD-selling-11: a store listing's location is the store's and is shown read-only on the form.

### STOCK 09: a SKU remembers its listing details

- **What changed.** `store_inventory_items.listing_details` keeps brand, model, type, condition, description and
  attributes. Publishing a SKU and applying an import row write them; `update_inventory_listing_details` lets the store
  correct them (store write check, SKU lock, logged as a `details` change). "Publicar este SKU" starts with them.
  `components/inventory/sku-listing-details.tsx` is the "Datos para publicar" panel; the inventory batch renders it in
  `item-detail.tsx` as `<SkuListingDetailsPanel itemId category details canWrite />`.
- **Limitations.** Photos are not remembered: import photos live in a private bucket that is purged with the import.
  The import trigger is checked by source review only; the SQL suite covers publication and the RPC.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (508 passing after merging `ux/effortless`), `pnpm build`, every SQL suite including the new
`tests/ux-effortless-selling.sql` and the concurrency suite, on 63 migrations replayed from scratch.
