# Store Operations: review fixes

Fixes from the owner review of the combined prototype (draft PR #12 at `2524829`): the independent Codex review of the
six design §17 items and the owner's walkthrough notes. Two branches cut from `store-ops/prototype`, each with a draft
PR back into it: A (this section) fixes what Codex found, B fixes the store screens. Nothing here is applied to a
hosted database or deployed.

## A. Codex findings: security, concurrency, data (`store-ops/review-fixes-core`)

Every finding was reproduced on a local database or in a unit test before it was fixed, and each fix has a regression
test that fails without it (`tests/store-ops-review-fixes.sql` fails 11 checks on the code before its migrations).

### Migrations

New migrations in slot `20261029…`; the sub-sprint migrations are unchanged, so the fix diff reads on its own.

| Migration | Fixes |
| --- | --- |
| `20261029120000_review_fixes_payment_methods.sql` | A2, A14 (PAY-1 text filter, provider list, revision, pilot switch in the database) |
| `20261029120100_review_fixes_lock_order.sql` | A3, A4, A6 (store lock strength, publication SKU lock, link lock, one listing per import photo) |
| `20261029120200_review_fixes_alerts_and_import.sql` | A7, A8, A11, A15 n-dup |
| `20261029120300_review_fixes_photo_cleanup.sql` | A13 cleanup of detached import photos |

Several fixes are a few words inside long functions written by earlier migrations, some of them V1 functions already in
production (`complete_public_submission`, `review_store_application`, `set_store_verification`,
`submit_listing_for_publication`, `resubmit_store_application`). Instead of copying them whole, the migrations rewrite
each one from its current definition with `pg_temp.review_fix(function, old, new, …)`: every `old` text must occur
exactly once or the migration fails, so a function that changed since is never patched blindly. Ownership and grants
are kept. Functions changed throughout are replaced whole, as before.

### What was fixed

| Item | Codex finding | Fix | Commit | Regression |
| --- | --- | --- | --- | --- |
| A1 | 3.1 XML tokenizer quadratic on an unterminated `<!--` (1 MiB took 53 s) | Single forward pass; unterminated comments, instructions, CDATA and tags refuse the file | `3a02955` | `store-ops-2.test.cjs` scaling and unterminated cases |
| A2 | 6.1 Separated digit runs, hosts, IDN and query strings passed the text filter | NFKC folding, separated digits joined, nine digits anywhere refused, hosts, schemes and e-mails refused, character whitelist; provider is a fixed list per method | `9a27bd8` | `pay-1.sql`, `pay-1.test.cjs` |
| A3 | 1.1 = 5.1 Store `FOR UPDATE` against the `KEY SHARE` of ledger, audit and receipt inserts (deadlock) | Store rows taken `FOR NO KEY UPDATE`; publication locks an unlinked SKU before reading its price | `d216841` | harness: stock versus publication, price versus publication; `store-ops-review-fixes.sql` static check |
| A4 | 1.2 Stale `link_inventory_listing` locked a second listing out of order | SKU locked directly, a linked SKU refused without touching its listing | `d216841` | harness: stale link request versus bulk |
| A5 | 1.3 Races only exercised linked inventory | Unlinked last-unit, stale count and bulk races; threshold and hide races; `--mutation` | `d216841` | harness (15 checks) and `--mutation` |
| A6 | 5.2 Photo exclusivity checked without an atomic claim | The import photo guard takes the asset row `FOR NO KEY UPDATE`, then refuses a photo another listing or another listing's revision uses | `d216841` | harness: photo publication versus edit; `store-ops-review-fixes.sql` |
| A7 | 2.1 Queued price-drop and search e-mails went out after stock ran out | The e-mail claim cancels them, drops such listings from pending digests and cancels a digest left empty | `7ae601d` | `store-ops-review-fixes.sql` |
| A8 | 2.2 Import first-public matching used the old price | Matching waits until the row's stock and price are both applied | `7ae601d` | `store-ops-review-fixes.sql` |
| A9 | 3.2 ZIP descriptor entries skipped the ratio check; allocation overshot | Parts sized from the central directory (ZIP64 too), inflated in 1 KiB slices under a hard 40 MB ceiling | `86832d6` | `store-ops-2.test.cjs` hand-built ZIPs |
| A9 | 3.4 A quote open at the end of a CSV was accepted | Refused with `IMPORT_CSV_UNCLOSED_QUOTE`, naming the row | `3d37978` | `store-ops-2.test.cjs` |
| A9 | 3.5 A formula with no cached value became a blank | File warning, and `IMPORT_FORMULA_NO_VALUE` on a mapped cell; the server stages the flag | `e669494`, `eb271a5` | `store-ops-2.test.cjs` |
| A10 | 3.3 A leading line feed escaped the formula guard | LF added to `FORMULA_START` (export, template and report share it) | `0ca90d1` | `store-ops-1b.test.cjs`, `store-ops-2.test.cjs` |
| A11 | 3.6 Remapping after a partial commit broke `import_row_applied_shape` | Refused once any row is applied (`IMPORT_MAPPING_LOCKED`) | `7ae601d` | `store-ops-review-fixes.sql` |
| A12 | 3.7 The export ignored lookup errors and returned 200 with blank columns | Every lookup checked; 500 "No se pudo preparar la exportación." | `a02e7e2` | `store-ops-1b.test.cjs` |
| A13 | 4.1 Truncated images and appended payloads passed | JPEG, PNG and WebP walked to their real end; trailing bytes refused | `57a6599` | `store-ops-review-photos.test.cjs` |
| A13 | 4.2 The browser ZIP limit ran after an oversized inflate | Inflated in slices sized to the remaining budget; skipped entries are not buffered | `0b6195d` | `store-ops-review-photos.test.cjs` |
| A13 | 4.3 Photos detached after the import closed were never cleaned up | The cleanup sweep re-checks validated photos of closed or purged imports | `7ae601d` | `store-ops-review-fixes.sql` |
| A13 | 4, answer 2: completion read the whole object before its size check | Read as a stream, stopped past 5 MB (`PHOTO_TOO_LARGE`) | `78774c8` | `store-ops-review-photos.test.cjs` |
| A14 | 6.2, 6.3, 6.4, 6.5 Stale review versions, `updated_at` tokens, pilot only in the app, privacy wording | `revision` column; an RUC or razón social change moves pending revisions; pilot switch in the database; wording fixed | `9a27bd8` | `pay-1.sql`, `pay-1.test.cjs` |
| A15 | Walkthrough n-barcode | "Cód. barras" and other barcode headings map to Referencia externa | `2945d95` | `store-ops-2.test.cjs` |
| A15 | Walkthrough n-dup | Every row sharing a SKU or listing is flagged, even one that already had another error | `f89324a`, `7ae601d` | `store-ops-2.test.cjs`, `store-ops-review-fixes.sql` |

### Defaults taken

| Point | Default | Why |
| --- | --- | --- |
| Migrations | New migrations, originals untouched | The fix diff is reviewable on its own; the plan allowed either. |
| A3 store lock | `FOR NO KEY UPDATE` on `stores` in every function that locked it `FOR UPDATE` (V1 ones included), rather than adding stores to the advisory → listing → item protocol | It still serializes these functions with each other and with every update of a store row (none changes `id` or `slug`, the only columns a foreign key can reference; the RUC and owner unique indexes are partial) but lets foreign-key checks through. One small change instead of reordering every inventory path. |
| A3 publication price | Publication locks an unlinked SKU before reading its price | Without it a price change committed meanwhile was overwritten by the old price when linking (the harness shows 450 instead of 1234). |
| A6 | One listing per import photo, checked under the asset lock; the same listing and its revisions may reuse it | An edit proposal and its promotion reuse the listing's own photos. |
| A7 | Cancel at claim time (`cancelled`, `failure_code = 'listing_out_of_stock'`); dropped digest matches are suppressed with reason `listing_out_of_stock` | One place covers every way stock reaches zero (sale, count, import, bulk). A restock does not resend them, as with first-public alerts. |
| A8 | Deferred only inside the import row (`laria.defer_alert_capture`, transaction-local) | Other paths already change stock and price in separate steps the owner sees; a row that fails rolls the setting back with it. |
| A11 | Refuse remapping after any applied row | Codex's first option; keeping applied rows while replanning the rest would need a second plan model. The message tells the owner to start a new import. |
| A13 cleanup | Same sweep as before (no new job), each photo re-checked at most once a day, up to 500 per run | A photo still in use costs one check a day; one a listing dropped is deleted within a day. |
| A2 provider | Fixed list (`PAYMENT_PROVIDER_OPTIONS`), matched ignoring case and punctuation, stored in its canonical spelling | Free text could carry anything; the owner form offers the list as a select (thread B). |
| A2 text | The filter is a guard; Admin review remains the check for what it cannot recognise (numbers in words) | Codex: the filter cannot back a blanket promise. |
| A14 pilot | `laria_private.assisted_commerce_settings.pilot_enabled`, off by default, changed only by a database owner through `laria_private.set_assisted_commerce_pilot(enabled, reason)`. With it off, owners cannot propose and public reads are empty; withdrawal and Admin review work | Codex 6.4. The app switch `LARIA_ASSISTED_COMMERCE` still decides what the screens show. |
| A9 ZIP | Encrypted entries and methods other than stored and deflate refused | XLSX never needs them. |

### Known, not changed

- **Two lock orders in V1.** `submit_listing_for_publication` locks the listing, then the store;
  `set_store_verification` locks the store, then that store's pending listings. An owner submitting while an Admin
  changes the store's verification can still get a deadlock error (PostgreSQL aborts one; the other completes). This
  predates Store Operations and is outside the review.
- **Opposite photo orders.** Two attachments of overlapping import photo sets in opposite orders can end in a deadlock
  error instead of `LISTING_PHOTO_INVALID`. Nothing is attached twice; publication retries once.
- **E-mail claim cost.** The claim now runs two extra updates per call; `search_alert_matches_delivery_idx` keeps the
  digest lookups indexed (the e-mail payload already looked matches up by delivery without one).

### Production step added

Turning the payments pilot on now takes both the app switch and, in the SQL editor as the database owner,
`select laria_private.set_assisted_commerce_pilot(true, '<reason>');` (and `false` to stop it).

### Checks run (local database only)

`setup-local-db.sh reset` and `test` (all migrations, every `tests/*.sql`, the concurrency harness), the harness with
`--mutation`, `node tests/store-ops-3a-race.integration.cjs`, `pnpm test`, `tsc --noEmit`, `eslint .`, `next build`.

`tests/store-ops-1b.sql` failed about one run in four, before any of these fixes: its "movement rows carry their SKU"
check looked for a `ds-1` sale, return or `initial_stock` row among the five newest movements, but the nine movements
share one timestamp, so which five come first is random, and the opening movement is called `opening_balance`. It now
checks each of the five rows against its own SKU.

## B. Store screens (`store-ops/review-fixes-ux`)

The owner's walkthrough notes on the store screens (`henri-walkthrough-notes.md`), items B1 to B7 of the fix plan. The
branch merges `store-ops/review-fixes-core` (at `7740f84`), so its Admin review and payment form use A2 and A14.

### Migration

`20261030120000_store_review_fixes_ux.sql`, after A's slots. Additive: no function that takes a lock or writes stock is
replaced. The one replaced function, `get_inventory_page`, is read-only and only its category filter changes. Thread A
checked it against its lock-order changes.

| Object | For |
| --- | --- |
| Trigger `store_import_rows_drop_linked_publication_hint` (before update, sets `NEW.issues` only) | B7 |
| Column `store_inventory_items.category` (nullable, taxonomy check, no index or key) and trigger `store_import_rows_record_item_category` (after a row is applied, updates that SKU only) | B4 |
| `get_inventory_category_counts()` and `get_inventory_page` with the new category filter | B4 |
| Column `store_import_rows.publish_fields` (object, at most 16 KB) and owner RPC `set_store_import_row_publish_fields` (session `FOR SHARE`, then the row `FOR UPDATE`, the order publication uses) | B5 |

### What changed

| Item | Walkthrough note | Change | Where |
| --- | --- | --- | --- |
| B1 | The import start page did not say what the file needs | The page leads with "Descarga la plantilla" (Excel or CSV, optional attribute columns), then the upload, then "Qué debe tener tu archivo": formats, size and row limits, header row, own headings, no `.xls`/`.xlsm`, photos later, and the columns in three groups: to create a SKU, to publish, optional. The template's Instrucciones sheet reads the same text | `lib/store-import/columns-guide.ts`, `components/store-import/import-guide.tsx`, importar page |
| B2 | The result of "Publicar seleccionados" was easy to miss | A larger notice with a heading and one line per outcome; it takes focus and scrolls to the middle of the screen (instantly under reduced motion) | `components/store-import/import-publish.tsx` |
| B3 | Large imports: no way to move through categories; Confirmar only at the end | Category chips over the rows ("Todas las categorías", each category with its count, "Sin categoría" last) and the step's buttons at the top as well, in Revisar and in Fotos, from 11 rows | `import-wizard.tsx`, `import-photos.tsx`, rows route `?category=`, `?categories=1` |
| B4 | Inventario needs category tags | Chips above the table: "Todas (n)", each category with SKUs, "Sin categoría". They are links (`?categoria=`) that keep the other filters, scroll sideways on phones and wrap from 640 px. The Filtrar sheet uses the same category | `components/inventory/inventory-category-chips.tsx`, Inventario page, toolbar |
| B5 | A "Faltan datos" row should be completable on the result page | "Completar datos" next to the tag opens a sheet with only the missing fields (marca, modelo, categoría, tipo, condición, descripción, precio) and a photo picker. Saving re-checks the row; a complete row becomes "Lista para publicar" and is selected | `components/store-import/complete-row-sheet.tsx`, `publication/fields` route, `publication-server.ts` |
| B6 | Payments should have their own menu entry and an "add a method" flow | "Pagos" in the store menu (rail, phone switcher, header menu) with the added methods (status, provider, holder, review reason, Editar, Dejar de aceptarlo) and "Agregar medio de pago" for the rest, plus how "Solicitar compra" works. The old address forwards to it | `app/mi-cuenta/tienda/pagos`, `components/payment/store-payment-methods-form.tsx`, `lib/account-navigation.ts` |
| B7 | n-hints | "Para publicar falta…" no longer shows on rows that update (or leave unchanged) a SKU that already has a publication, or that link one; the "N SKU necesitan más datos" count follows | migration trigger |

Also, after A11: when a partly applied import is reopened, Revisar hides "Cambiar columnas" and says how many rows were
already applied. The Admin decision sends the method's `revision` (A14).

### Defaults taken

| Point | Default | Why |
| --- | --- | --- |
| B1 order | Template first, upload second, guide after | The template is the easy path; the guide is reference for owners bringing their own file. |
| B1 groups | Create: Nombre and Stock. Publish: marca, modelo, categoría, tipo, condición, descripción, precio, plus 2 to 10 photos. Optional: the rest, and category attributes | The same rules the import and the publish step apply; one source for the page and the template. |
| B3 chip counts | Counts are for the whole file (recognized categories; anything else is "Sin categoría"), not for the row filter in use | One count per category, read once per import version. |
| B3 top buttons | Shown from 11 rows, in Revisar and Fotos | Below that the bottom buttons are already in view. |
| B4 SKU category | A SKU's category is its publication's; without one, the category its latest applied import row gave it. A category Laria does not recognize changes nothing. Archived SKUs are not counted | SKUs without a publication had no category, and a large import is exactly when the owner needs the chips. Imports are the only source this round. |
| B4 chips | Links, hidden when the store has fewer than two groups | Filtered views stay shareable and work before the page hydrates. |
| B5 storage | Text fields saved on the import row (`publish_fields`) and laid over the file's values when the row is published; the publish step validates the result with the publish form's rules, as before. The price is saved on the SKU through `update_inventory_item` (version check, price history). Photos go through the same upload and server check as Fotos, then are placed on that row | Nothing new is trusted: publication still re-reads the staged cells, and price and photos keep their own paths. |
| B5 limits | Marca and modelo 80 characters, descripción 40 to 2,000, condition and category from Laria's lists | The sell form's limits are wider (500 and 10,000); 2,000 keeps the stored object small. |
| B5 scope | Only the missing fields are asked for; a name that is too short links to the SKU in Inventario; category attributes are not asked (they are optional) | Henri's note asks for the missing fields. |
| B5 after saving | A row that became complete is selected and the notice says so; otherwise it lists what is still missing. An earlier "Faltan datos" attempt outcome is cleared; an allowance outcome stays | The owner can publish right after. |
| B6 menu | "Pagos" between Publicar and Estadísticas, only for a store owner with a store while `LARIA_ASSISTED_COMMERCE` is on; off, the entry, the page and the old address are 404 | PAY-1 rule: nothing visible with the switch off. |
| B6 flow | The list holds added methods (anything not withdrawn). "Agregar medio de pago" offers only the methods not added (a withdrawn one can be added again); with one left it is preselected. Editing opens the same sheet. Withdrawing asks for confirmation | Henri asked for an add flow instead of fixed cards. |
| B6 provider | A select of A2's list with "Sin proveedor" first; no provider field for cash | Free text would be refused by the database. |
| B6 unverified store | The page shows a notice and the list; no "Agregar" or "Editar"; withdrawing still works | As PAY-1. |
| B6 unchanged save | Saving the same values keeps the approval and says "no hubo cambios; sigue aprobado" | The database does not re-review an unchanged method. |
| B7 | A database trigger on the planned row instead of a change in `rows.ts` (thread A's) or in `plan_import_row` | It fixes the hint and the count in one place and touches no function thread A changes. |

### Known, not changed

- In Revisar, a category chip's count can be larger than the rows shown when a row filter such as "Con errores" is on.
- Rows with errors still show "Para publicar falta…" next to the error. They are not imported and are not counted.
- A SKU's own category comes only from imports; the SKU page has no field to change it. Linked SKUs follow their
  publication.
- "Completar datos" does not ask for category attributes (Tipo de cuerpo and the like); they come from the file.
- `docs/store-operations/pay-1.md` still describes the owner page as `/mi-cuenta/tienda/medios-de-pago` linked from Mi
  tienda, and `store-1b.md` the category filter as the publication's only; left for the sub-sprint doc pass to avoid
  editing the same lines as thread A.

### Production steps

Apply `20261030120000_store_review_fixes_ux.sql` after A's migrations. Its backfill only reads applied import rows,
which production does not have. No new switch.

### Checks run (local database only)

`setup-local-db.sh reset` and `test` (all migrations, every `tests/*.sql` including the new
`tests/store-ops-review-ux.sql`, the concurrency harness), `node tests/store-ops-3a-race.integration.cjs`, `pnpm test`
(with the new `tests/store-ops-review-ux.test.cjs`), `tsc --noEmit`, `eslint .`, `next build`.

In a browser (`start-docker-free.sh seed`, the demo store, the samples, desktop 1280 px and phone 390 px): the import
start page and the template download; the messy export through Revisar (chips, top buttons), Fotos and Confirmar;
"Completar datos" on three rows (one with category and two photos), each becoming ready and then published, with the
result notice in view and focused; the stock update file (no hint on the eight linked SKUs, three hints on the others);
the 2,000-row file (eight chips of 250, top buttons); Inventario chips and the filtered view; Pagos (withdraw, add with
PayPal, edit Yape o Plin) and an Admin approval by revision; with the switch off, no Pagos entry and 404 on both
addresses.
