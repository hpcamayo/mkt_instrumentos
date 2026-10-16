# STORE-1b: Inventario screens

Status: implemented on branch `store-ops/store-1b-inventory-ui` (built on `store-ops/store-1a-inventory-core`), local
tests and a local browser check green, **not applied to production and not accepted yet**. Acceptance, the proposed
INV-019…INV-039 and the independent review below wait for the owner's final review of the combined prototype. The
design is [`design.md`](design.md) (§5.5, §6.1, §7.8, §13.1–§13.3, D-13).

## What it adds

Screens (all owner-only, behind the per-store pilot gate; a store without inventory sees the V1 page unchanged):

| Where | What |
| --- | --- |
| `/mi-cuenta/tienda/inventario` | Tabs **Inventario** / **Publicaciones** (`?vista=publicaciones`). Summary tiles, recent movements, search, filters (stock, publication, category, catalog link) in a `Sheet`, sort, keyset pages of 50, table with row actions and a bulk bar, CSV and Excel export. |
| `/mi-cuenta/tienda/inventario/[itemId]` | Stock card and the five stock actions, linked publication (status, pending changes, unlink) or "Publicar este SKU" / link an existing publication, SKU data form, SKU change with reason, archive, movement history (newest first, keyset paged, who · channel · reference), SKU change log. |
| `/mi-cuenta/tienda/publicar?sku=…` | The existing store publish form, prefilled from an unlinked SKU and linked to it on submit. |
| Publicaciones tab | The V1 `ListingManagementTable`. A linked listing shows "Stock controlado en Inventario. Ver SKU" and never offers "Marcar vendida" (D-15); an unlinked editable listing offers **Controlar stock** (SKU + quantity → item, opening balance and link, §6.1). |

Components: `components/ui/data-table.tsx` (new primitive: semantic `<table>`, sr-only caption, sticky header,
row checkboxes with an indeterminate select-all, arrow/Home/End focus between rows, stacked cards with labels on
phones), `components/inventory/*` (table, toolbar, tiles, stock sheet, bulk sheets, SKU forms, item page parts).
`Sheet` gained `layout="responsive"`: bottom sheet on phones, centered dialog from 768 px (§13.3).

Server: `app/api/store/inventory/route.ts` (one POST endpoint over an allowlist of the STORE-1a owner functions plus
the two below, `lib/inventory-actions.ts`), `app/api/store/inventory/export/route.ts` (§7.8). Errors keep the
`CODE: mensaje` contract; the client retries once on `INVENTORY_CONCURRENT_CHANGE` with the same idempotency key.
Every write form creates its key when it opens, so a double tap or a retry never applies twice.

One migration, `supabase/migrations/20261024120000_store_inventory_ui.sql`, additive:

| Function | Purpose |
| --- | --- |
| `get_inventory_summary()` (replaced) | Adds `sales_30d_units` (sales minus returns, last 30 days), `sales_30d_count`, `hidden`, and `recent_movements` (latest five, with SKU and name). Same fields as before otherwise. |
| `set_inventory_threshold_bulk(ids, threshold, key)` | Bulk "Umbral de stock bajo": 1–200 distinct SKU, threshold `null` or 0–100000; receipt + replay, `lock_inventory_items`, all-or-nothing, unchanged SKU skipped, one `details` change per SKU actually changed. |
| `hide_inventory_listings_bulk(ids, key)` | Bulk "Ocultar": calls the V1 `set_owned_listing_lifecycle(…, 'hide')` for each linked approved listing; other SKU are returned in `skipped` (`not_linked`, `not_published`). Stock and links are untouched. |

Copy (D-13): glossary rows in `docs/design-system.md`, an `inventory` domain in `lib/ui/status.ts` (Disponible,
Stock bajo, Agotado, Archivado), and a ux-copy test that the inventory labels, the "Registrar venta" note and the
"Ventas registradas por la tienda" tile stay as agreed.

## Defaults taken (no owner input requested, per the build-phase rule)

- **Importar** and the **Errores de importación** tile are stubbed by omission: `IMPORT_HREF` is `null` in the page and
  the tile renders only when a number is passed. The combined prototype wires both to STORE-2.
- The table has no product photo, brand or model columns (the SKU has none of its own in STORE-1a); the export takes
  brand, model and category from the linked publication. Catalog match shows only linked / not linked; the
  catalog matcher arrives with the import.
- "Ventas registradas por la tienda" counts units, net of returns, over the last 30 days, with the note "Anotadas por
  tu tienda; Laria no las verifica" (§5.5, brief §8).
- Bulk hide skips SKU without an approved publication instead of failing the batch, and says which.
- The stock sheet offers sale, restock, return, damage or loss, and count; `manual_adjustment` stays API-only.
- Export: comma-separated CSV with a UTF-8 BOM and CRLF; all active SKU by default, archived SKU only when selected;
  cap 10,000 rows. Excel uses STORE-2's writer (`lib/spreadsheet/xlsx-write.ts`, copied verbatim, `fflate` 0.8.2) so
  both branches merge without conflict; SKU, external reference and publication id are text cells.
- Pages hold 50 SKU; selection and bulk actions apply to the current page.
- "Último movimiento" is a line in the Stock cell, not its own column, so the desktop table fits the account panel at
  1280 px without horizontal scroll.

## Where it differs from the design, and why

- §13.1 lists "en revisión / rechazadas" as one tile; it is "En revisión" with "N rechazadas" as its note (highlighted
  when above zero), and rejected publications are one filter away.
- The Publicaciones tab shows every store publication (linked ones too, marked), not only unlinked ones, so the V1
  analytics columns stay in one place.

## How to test

Local only.

```sh
bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh reset   # all migrations, including this one
bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh test    # every SQL suite + concurrency
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

`tests/store-ops-1b.sql` (rolled back): access boundaries, summary figures and the 30-day window, recent movements
scoped to the store, bulk threshold (changes, audit, replay, key reuse across operations, range, ownership, archived
SKU rolls the batch back), bulk hide (hidden vs skipped, owner hide, stock and link unchanged, flag restored, replay,
ownership, out-of-stock listing), read-only and disabled stores, grants. `tests/store-ops-1b.test.cjs`: export
columns and formula guard, export route (owner store filter, headers, limits), action allowlist and key format,
error mapping, filters and cursors, DataTable markup, D-15 listing table, idempotency keys created on open.

Evidence (2026-10-15, local Postgres 16, no Docker): every SQL suite including `store-ops-1.sql` and
`store-ops-1b.sql` passes, the concurrency suite passes, `pnpm test` 370/370, typecheck, lint (one warning inside
the copied STORE-2 writer) and build pass. Browser check with the prototype stand-in API (`scripts/prototype` from
`store-ops/prototype`, not committed here) and the demo store, at 1280 px and 390 px: list, filters, a recorded sale
through the dialog, bulk selection, the SKU page, the Publicaciones tab, CSV and XLSX downloads; no console errors
and no page-level horizontal scroll.

## Rollback

The screens are only reachable for stores with `inventory_enabled`; turning the gate off returns those stores to the
V1 page. To roll back the migration (no data is stored by it):

```sql
begin;
drop function if exists public.set_inventory_threshold_bulk(uuid[], integer, text);
drop function if exists public.hide_inventory_listings_bulk(uuid[], text);
-- Re-run the get_inventory_summary() definition from 20261023120000_store_inventory_foundation.sql (create or replace).
commit;
```

Threshold changes and hides already made stay (the change log and the V1 hide are normal records); a hidden listing is
restored by its owner as in V1. Receipts with operation `threshold` or `hide` in
`laria_private.store_inventory_batch_receipts` can stay.

## Independent review (design §17)

1. **Export sanitization (§17 item 3).** `lib/inventory-export.ts`: `formulaSafe` prefixes `'` to any text cell
   starting with `=`, `+`, `-`, `@`, tab or CR; numbers are written unprefixed; RFC 4180 quoting runs after the
   prefix. XLSX cells are inline strings or numbers (the writer never emits `<f>`), so text keeps its exact value
   there; confirm that holds for every cell type. `app/api/store/inventory/export/route.ts`: the store is resolved by
   `owner_user_id` and every query is filtered by it (an Admin session, which RLS lets read every store, still exports
   only its own); `ids` capped at 200 UUIDs; `Content-Disposition: attachment`, `no-store`, `nosniff`; filename built
   from a sanitized slug. Questions: can a merchant-controlled value (name, variant, reference, brand) reach a cell
   unguarded; does the filename allow header injection?
2. **Bulk functions (§17 item 1, extended).** `set_inventory_threshold_bulk` and `hide_inventory_listings_bulk`:
   advisory lock on store + key, payload fingerprint with ids sorted, replay or `IDEMPOTENCY_KEY_REUSED` (a key used by
   another operation is refused), ownership checked before any lock, `laria_private.lock_inventory_items` (listings
   then items) for the threshold; the hide path calls `set_owned_listing_lifecycle` per listing in id order and
   restores `app.allow_listing_admin_fields`. Questions: can the hide loop deadlock with `record_stock_movement` on
   the same listing; is the skipped list a safe disclosure (it only contains the caller's own SKU)?
3. **Action endpoint.** `lib/inventory-actions.ts` maps a fixed action list to function names and validates every
   argument shape; nothing from the request picks a function name. Unknown database errors are logged and returned
   as a generic message.

### Codex result (2026-10-16)

Codex reviewed this item on PR #12 at `2524829`. Every finding below was reproduced locally and fixed on
`store-ops/review-fixes-core` with a regression test; details and defaults are in [`review-fixes.md`](review-fixes.md).

- Export sanitization (item 3, finding 3): a leading line feed escaped the formula guard. Fixed in `0ca90d1` (LF added
  to `FORMULA_START` in `lib/spreadsheet/csv-write.ts`, shared by the export, the import template and the report).
- Export route (item 3, finding 7): a failed store or listing lookup returned 200 with blank columns. Fixed in
  `a02e7e2` (500 "No se pudo preparar la exportación.").
- Bulk functions (item 1): no direct inversion between hide and stock; the store lock deadlock of STORE-1a item 1,
  finding 1 applied here too and is fixed in `d216841`; threshold and hide races were added to the harness there.
- Unrelated to Codex: the `tests/store-ops-1b.sql` check "movement rows carry their SKU" failed about one run in four
  (random tie order, wrong movement type name). Fixed in `7b89a22`.

## Acceptance proposal (not in `acceptance/cases.tsv`)

| ID | Case | Expected | Evidence |
| --- | --- | --- | --- |
| INV-019 | Store without inventory enabled opens Inventario | V1 publications page, unchanged | `store-ops-1b.test.cjs` page checks; browser |
| INV-020 | Enabled store opens Inventario | Tabs Inventario / Publicaciones, tiles, table | browser |
| INV-021 | Summary tiles | SKU activos, Publicadas, Unidades, Stock bajo, Agotados, En revisión, Ventas registradas por la tienda; values link to filtered views | `store-ops-1b.sql` summary |
| INV-022 | Recorded sales tile | Units net of returns, last 30 days, labeled as recorded by the store and not verified by Laria | `store-ops-1b.sql`, ux-copy test |
| INV-023 | Search, filters and sort | Results and "Mostrando:" match the URL; clearing returns to all | browser; filters unit test |
| INV-024 | Paging | Keyset pages of 50, no duplicates or gaps across pages | cursor unit test; STORE-1a `get_inventory_page` tests |
| INV-025 | Table on phones | Stacked cards with labels, no horizontal scroll at 390 px | browser |
| INV-026 | Keyboard | Row focus with arrows/Home/End; checkboxes and select-all labeled | DataTable unit test |
| INV-027 | Registrar venta | Dialog/sheet with quantity, channel, reference and the "anotación de tu tienda" note; stock drops; disabled at 0 | browser; ux-copy test |
| INV-028 | Double submit or retry | One movement per opened sheet | idempotency unit test; STORE-1a suites |
| INV-029 | Conteo on a changed SKU | Clear stale-count message and "Volver a cargar el stock" | stock sheet; STORE-1a stale-count case |
| INV-030 | Bulk price | Preview with before → after and problems, then apply | browser; STORE-1a price suite |
| INV-031 | Bulk threshold | Applies to all or none; unchanged SKU not audited; replay safe | `store-ops-1b.sql` threshold |
| INV-032 | Bulk hide | Hides approved linked publications, lists the rest as skipped; stock and links unchanged | `store-ops-1b.sql` hide |
| INV-033 | Bulk stock | Per-SKU quantities, one batch, counts check versions | browser; STORE-1a bulk suite |
| INV-034 | Export CSV and Excel | All active SKU or the selection; headers as documented; formula-like text prefixed in CSV; ids as text in Excel | `store-ops-1b.test.cjs` export |
| INV-035 | Export isolation | Only the owner's store, even for an Admin account | export route test |
| INV-036 | SKU page | Stock, publication, data, SKU change with reason, archive, history newest first with paging | browser |
| INV-037 | Publish from a SKU | Prefilled form, publication linked on submit | browser; submissions route |
| INV-038 | Linked listing in Publicaciones | No "Marcar vendida"; "Stock controlado en Inventario. Ver SKU" | D-15 unit test; browser |
| INV-039 | Controlar stock | Unlinked editable listing adopts a SKU and quantity in one step | browser; STORE-1a link suite |

## Known limitations

- Import and import errors are stubs until the combined prototype wires STORE-2.
- Bulk actions cover the visible page (up to 50 SKU); "select all matching" is not offered.
- No product photo in the table; SKU photos come with STORE-3a.
- Export is capped at 10,000 SKU per file.
- The inventory tables are not in `lib/supabase/database.types.ts` yet; the code uses an untyped client in
  `lib/store-inventory.ts`. Regenerating the types in the combined branch would let it drop the cast.
