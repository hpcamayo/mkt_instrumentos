# STORE-3a: import photos

Status: implemented on branch `store-ops/store-3a-import-photos` (from `store-ops/store-2-import`), local tests and a
browser run on the local prototype green, **not applied to production and not accepted yet**. Acceptance, the
proposed `IPH-` cases and the independent review (design §17 item 4) wait for the final review of the combined
prototype. The design is [`design.md`](design.md) §8; owner decisions D-1…D-15 are at their accepted defaults
(D-3: 600 photos per import, 5 MB each).

## What it adds

A **Fotos** step in the import wizard, between Revisar and Confirmar, and again on the result page. It is optional:
the inventory imports the same with or without photos. Publishing the photographed rows is STORE-3b.

- **Migration** `supabase/migrations/20261026120000_store_import_photos.sql`
  - Private bucket `store-import-photos` (5 MB, `image/jpeg`, `image/png`, `image/webp`). Storage policies: the owner
    may insert only at a path the server issued, only while that asset waits for its upload and the import is
    `ready` … `partially_committed` and not purged; owner and Admin may read; nobody updates or deletes from a
    browser.
  - `store_import_photo_assets` (one row per file: sanitized display name, claim from the name or list, check
    result, sha256, match outcome, cleanup timestamps) and `store_import_photo_assignments` (asset → row, order 1–10,
    deferrable unique order). `store_import_rows.photo_state` / `photo_count` and
    `store_import_sessions.photo_counts` for the screens. RLS: owner and Admin read; all writes through RPCs.
  - RPCs bound to `auth.uid()`: `request_store_import_photo_uploads` (≤ 25 slots per call, 600 per import),
    `place_store_import_photo`, `order_store_import_photos`, `reset_store_import_photo_matching`. Service role only:
    `record_store_import_photo_checks` (the owner can never mark their own bytes valid),
    `claim_store_import_photo_deletions`, `complete_store_import_photo_deletions`.
  - Matching (`laria_private.match_import_photos`), re-run after every upload and reset; manual placements are kept.
  - `listing_photo_set_is_valid` gains an import-photo branch (§8.4); the Sprint 4 branch is unchanged. A trigger on
    `listing_photos` and `listing_revision_photos` refuses any import-photo URL that is not valid for that listing's
    owner and store, whatever path wrote it (`LISTING_PHOTO_INVALID`).
  - Lifecycle trigger: cancel, expiry, failure or STORE-2's 30-day row purge discards every asset not referenced by a
    listing or revision; the cleanup route deletes their objects.
  - For STORE-3b: `laria_private.import_row_photos_json(session, row)` (the URLs in order),
    `laria_private.import_photo_url_is_valid(url, owner, store, session)`, and `photo_state = 'ready'` per row.
- **Server** `lib/store-import/photo-check.ts` (magic bytes, header-only dimensions, end-of-file and markup checks,
  sha256), `photos-server.ts`, `photo-routes.ts`; routes under `app/api/store/imports/[id]/`: `photo-uploads`,
  `photo-uploads/complete`, `photos` (view, place, order, reset), `photos/[assetId]` (owner thumbnail).
- **Image proxy** `app/api/listing-images/[...path]`: new `/{uid}/import-photos/{session}/{asset}.{ext}` branch,
  served from `store-import-photos` only, with the existing reference rule (public when a public listing uses it,
  owner/Admin otherwise), the stored MIME type, `nosniff` and `sandbox` CSP.
- **Cleanup** `app/api/internal/store-imports/cleanup`: also claims, removes and completes photo deletions (batches
  of 100, same `CRON_SECRET`).
- **Browser** `lib/store-import/photo-files.ts` (base names only, skips folders, `__MACOSX`, dotfiles and
  `Thumbs.db`; streams a ZIP entry by entry with a 5 MB per-entry stop, 600 photos, 5,000 entries; manifest parser),
  `components/store-import/import-photos.tsx` (re-encode, upload three at a time, per-SKU thumbnails, arrows to
  reorder, Quitar, Cambiar de SKU, Fotos sin asignar with Asignar a un SKU and No usar, rejected list with reasons,
  Asignar de nuevo automáticamente).

### How photos are matched

1. A `Foto(s)` column in the spreadsheet (file names separated by `;`) wins, then a list of photos (`.csv` with
   `archivo;SKU;orden`), then the file name `SKU__NN.ext` (split on the last `__`, NN 1–10, SKU normalized like
   `sku_normalized`).
2. Matching is against this import's rows (and, after confirming, the SKU Laria generated for rows without one).
3. Anything uncertain is set aside, never guessed: SKU not in the file, a SKU on two rows, a name listed on two rows,
   two photos with the same number, the same image twice (sha256; the first uploaded is kept), an 11th photo. Two
   photos claiming the same place block that row (`Revisa el orden`) until the owner moves one.
4. A row is ready with 2–10 photos and nothing blocking. Moving, ordering or removing a photo by hand freezes that
   row against automatic matching; "Asignar de nuevo automáticamente" clears all manual choices.

## Defaults taken (no owner question asked)

- Photos can be added and arranged from `ready` until STORE-2's 30-day purge, including after confirming, so the
  owner can photograph after importing stock. Unassigned photos are therefore not deleted at confirmation (§8.5 said
  they would be); they go when the import is cancelled, expires or is purged, and any photo a listing uses stays.
- The browser re-encodes every photo to JPEG at ≤ 2400 px (quality 0.88, transparent areas on white) before upload, which drops EXIF location.
  If the browser cannot decode a file it uploads the original and the server decides.
- The list of photos must be a separate `.csv` chosen with the photos; a list inside the ZIP is ignored (keeps the
  archive reader to images only).
- Duplicate images: first upload wins, the copy is set aside as "Es la misma foto que otra ya subida".
- Reordering uses ← / → buttons, not drag (works the same on phones and with a keyboard).
- "No usar" marks a set-aside photo as unwanted; it still counts toward the 600 and is cleaned up with the import.
- Thumbnails in the wizard come from an owner-only route reading with the owner's session, never a public URL.

## Where it differs from the design, and why

- **URL segment `import-photos`, not `store-imports`** (§8.4). The §8.4 URL names the spreadsheet bucket; that is a
  typo. The proxy maps `import-photos` to `store-import-photos` only, and no URL shape reaches `store-imports`
  (unit test "the image proxy maps import photos only to the photo bucket"; browser check: swapping the segment
  returns 404).
- **Direct upload under storage RLS instead of signed upload URLs** (§8.1 step 2), the same choice as STORE-2: the
  server issues the exact object path and the storage policy accepts only that path, once, while the asset waits.
  Names are server-generated (`{uid}/{session}/{asset}.{ext}`).
- **Matching scope** (§8.2 says "this session and this store's items"): matching uses this import's rows only. A
  photo for a SKU that is in the store but not in this file is set aside; adding photos to existing listings stays
  in the listing editor.
- **Unassigned photos kept until purge** (§8.5), see Defaults.
- **Extra check**: files containing HTML/script/SVG markup or data after the image end are refused as
  `PHOTO_SUSPICIOUS` (polyglots), in addition to §8.1's checks.

## How to test

```bash
pnpm test                                   # includes tests/store-ops-3a.test.cjs (15 cases)
npx tsc --noEmit && pnpm lint && pnpm build
bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh reset
bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh test   # includes tests/store-ops-3a.sql
node tests/store-ops-3a-race.integration.cjs   # needs the local DB; attach vs discard race, 100 rounds
```

`tests/store-ops-3a.sql` (rolled back) covers anonymous denial, bucket settings, photos before review, slot
validation (types, size, 26 files, traversal and control characters, look-alike hyphens), storage policies,
isolation between owners, service-role-only checks, rejection codes, every matching outcome, the list of photos and
the 10 cap, manual place / order / reset, confirming keeps photos, generated SKUs matching after confirming, the
listing photo validator, the attachment guard on direct writes, the Sprint 4 edit path with import photos, Admin
read, cancel, the 600 cap, retention purge and deletion claims. The race test runs attach-first, discard-first and
100 concurrent rounds: a photo is either attached or deleted, never both.

Browser run (local prototype from `store-ops/prototype`, not committed here), as `demo-tienda@laria.test`: a 4-row CSV
with a `Foto(s)` column, then a ZIP plus loose files and a list of photos. Result: 10 valid photos, 3 SKUs ready
(Yamaha by name, the strap via the `Foto(s)` column, Fender with 02/03), the drumsticks blocked by two `__01`
photos, `NOPE__01` set aside, a 300 px photo and an HTML file named `.jpg` refused with their reasons, `notas.txt`
skipped and `__MACOSX` ignored. Marking one drumstick photo "No usar", moving `NOPE__01` to the Fender and reordering
Yamaha worked on desktop and at 390 px with no horizontal scroll; confirming kept the photos on the result page.
An import photo attached to an approved listing was served by the proxy (`200 image/jpeg`, `nosniff`, `sandbox`);
the same URL with `store-imports`, an unreferenced asset and a detached photo all returned 404, and a URL with
another owner's id was refused by the guard. The prototype gateway does not enforce storage RLS, so upload policies
are proven by the SQL suite, not the browser run.

## Rollback

Photos change nothing outside the import until STORE-3b publishes them. To stop new photos, revoke `execute` on
`request_store_import_photo_uploads` from `authenticated`. To undo fully: restore the Sprint 4
`listing_photo_set_is_valid`, drop the `guard_import_photo_reference` triggers (only after no listing uses an
`/import-photos/` URL), drop the photo tables, columns and helper functions, and empty and drop the bucket. The
cleanup route keeps working without the photo RPCs only if its photo branch is removed too.

## Independent review (design §17, item 4: photo pipeline)

Codex (or another independent reviewer) should check these before the code merges.

1. **Storage policies on `store-import-photos`** — migration, policies `store import photos insert/select`:
   insert only at `{auth.uid()}/{session}/{asset}.{ext}` of an `awaiting_upload` asset owned by the uploader, session
   in an open state and not purged; no update/delete for browsers; bucket MIME and size limits. Questions: can an
   upsert, a second insert after rejection, or a path with different case/extension slip through; can an owner read
   another owner's object?
2. **Server-side validation** — `lib/store-import/photo-check.ts` and `completePhotoUploads` in
   `photos-server.ts`: size before read, magic bytes vs declared type, JPEG SOF walk, PNG IHDR and IEND at end, WebP
   RIFF size equal to file length, markup scan, 400–8000 px, sha256; rejected objects deleted; results recorded only
   through `record_store_import_photo_checks` with the service role, which re-checks owner, session and path.
   Questions: can a crafted header loop or read past the buffer; can a file pass as an image and be rendered as
   something else through the proxy?
3. **Photo-reference validator and proxy** — `laria_private.import_photo_url_is_valid`,
   `listing_photo_set_is_valid` (import branch), trigger `guard_import_photo_reference`, and the `IMPORT_PHOTO_PATH`
   branch of `app/api/listing-images/[...path]/route.ts`. Questions: can a listing reference another store's, a
   rejected or a discarded asset; can the proxy be made to read the `store-imports` spreadsheet bucket or any path not
   derived from a validated asset row; is anything public before its listing is?
4. **Cleanup claims** — `discard_import_photo_assets` (`FOR UPDATE` then a second reference check),
   the guard's `FOR SHARE` on the asset, `claim_store_import_photo_deletions` / `complete_…`, the cleanup route.
   Question: can an object a listing or revision uses ever be deleted (see the race test), and can a claim be lost
   so an object is never deleted?
5. **Browser archive reading** — `lib/store-import/photo-files.ts`: the server never unzips; confirm the browser
   bounds (5 MB per entry, 600 photos, 5,000 entries) and that archive paths never reach a server path.

## Acceptance proposal (not in `acceptance/cases.tsv`)

Proposed `IPH-` cases for Henri's review; added to `acceptance/cases.tsv` only after it. Publishing photographed rows
is STORE-3b.

| Proposed ID | Requirement | Expected | Automated evidence |
| --- | --- | --- | --- |
| IPH-001 | Only the import's owner adds photos, after review | Other owners, anonymous visitors and imports not yet reviewed are refused | `store-ops-3a.sql` boundaries, photos wait |
| IPH-002 | The server never opens a ZIP | The browser reads it entry by entry and uploads each photo alone | `store-ops-3a.test.cjs` "server never unzips"; browser run |
| IPH-003 | Photos go only to the path the server issued | Upload elsewhere, twice, or after the import closes is refused | `store-ops-3a.sql` storage policies |
| IPH-004 | JPG, PNG or WebP up to 5 MB, 400–8000 px | Other types, sizes and dimensions refused with a Spanish reason | `store-ops-3a.test.cjs` checks; browser run |
| IPH-005 | The type comes from the bytes | A renamed or mixed file is refused | `store-ops-3a.test.cjs` |
| IPH-006 | Files hiding something else are refused | Polyglots and data after the image end: "El archivo contiene algo más que una foto" | `store-ops-3a.test.cjs` polyglots; browser run |
| IPH-007 | Refused files are deleted | Object removed after the check | `photos-server.ts`; browser run |
| IPH-008 | Only the server can mark a photo valid | Owner calling the check is refused | `store-ops-3a.sql` service role |
| IPH-009 | Up to 600 photos per import | The 601st slot is refused | `store-ops-3a.sql` cap; `store-ops-3a.test.cjs` |
| IPH-010 | Photos match by `SKU__NN`, list of photos or `Foto(s)` column | Column > list > name; source shown | `store-ops-3a.sql` matching; browser run |
| IPH-011 | Uncertain photos are set aside, never guessed | Unknown SKU, SKU on two rows, name on two rows, duplicate image, 11th photo | `store-ops-3a.sql` matching |
| IPH-012 | Two photos for one place block that row | `Revisa el orden` until moved | `store-ops-3a.sql`; browser run |
| IPH-013 | A row needs 2–10 photos to be ready | 1 photo: "Falta 1 foto" | `store-ops-3a.sql`; browser run |
| IPH-014 | The owner can move, reorder, remove and set aside photos | Manual choices kept on re-matching; reset clears them | `store-ops-3a.sql` manual correction; browser run |
| IPH-015 | Photos survive confirming the import | Still arranged on the result page; generated SKUs match | `store-ops-3a.sql` commit |
| IPH-016 | A listing can use only its owner's validated import photos | Other owner's, rejected or discarded photos refused on every write path | `store-ops-3a.sql` validator, guard |
| IPH-017 | Import photos are public only through a public listing | Owner/Admin otherwise; 404 for anything else | browser run (curl); proxy unit test |
| IPH-018 | The proxy never serves the spreadsheet bucket | `store-imports` in the URL returns 404 | `store-ops-3a.test.cjs`; browser run |
| IPH-019 | Unused photos are deleted, used ones never | Cancel, expiry or purge removes unused; race test holds | `store-ops-3a.sql` retention, claims; race test |

## Known limitations

- Import photos are proxied, not copied. Serving a full store catalog through the proxy is a STORE-4 benchmark item
  (§8.4 fallback: copy into `listing-photos` at approval).
- Photos for SKUs that are in the store but not in this import's file are set aside, not matched (see above).
- The prototype gateway does not enforce storage RLS; the upload policies are covered by the SQL suite only.
- No drag-and-drop reordering; arrows only.
- Large uploads depend on the tab staying open, like the rest of the import.
