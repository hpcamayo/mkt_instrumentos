# Effortless Laria: inventory batch ("Store inventory and counter")

Build plan: `/mnt/project-files/ux-ideas/build-plan.md`. Ideas: `/mnt/project-files/ux-ideas/ideas.json`. Henri marked
every idea in this batch Yes on 2026-10-19 with no notes. Migration slot 20261107, acceptance range EASE-600 to 699.
Screenshots: `/mnt/project-files/ux-ideas/screens/inventory/`.

Two branches, two draft PRs against `ux/effortless`:

- `ux/effortless-inventory-fixes`: fix-06 and the fix-09 parts in Inventario.
- `ux/effortless-inventory`: everything else, cut from the fixes branch.

## Fixes

### fix-06 Inventory search searches what its box promises

- **What changed.** `get_inventory_page` matches the SKU, name, variant, external reference (where stores keep
  barcodes) and the linked publication's title, brand and model. Each word of the search must appear somewhere, in any
  order, folded like the catalog search (`catalog_fold`: no accents, no case), so "boss ds-1", "DS-1 Boss" and
  "distorsion" all find the Boss DS-1. The table follows the search box as the owner types: after a 350 ms pause the
  URL is replaced (one history entry per search, not per letter); "Buscar" and Enter still apply at once. The
  placeholder now reads "SKU, marca, modelo, nombre o código".
- **Files.** `supabase/migrations/20261107120000_ux_inventory_search.sql`, `components/inventory/inventory-toolbar.tsx`.
- **How to test.** Inventario of the demo store: type "boss" (two SKUs), "distorsion", "10-46", or a code saved as
  Referencia externa. `tests/ux-inventory-fixes.sql`.
- **Defaults picked.** All words must match (AND), which narrows as you type; a SKU without a publication has no
  brand or model to match, so its name or SKU is what finds it.
- **Limitations.** The search is a scan of the store's own rows (no index on the folded text). The STORE-1 benchmark
  store of 5,000 SKUs stays well inside the target; revisit with an expression index if a store grows past that.

### fix-09 Copy and dead ends (Inventario parts)

- **What changed.** The "En revisión" tile counted new publications and changes in review but opened only new ones;
  it now opens the new filter `publicacion=in_review` ("En revisión o con cambios en revisión"), which selects
  exactly what it counts. Rejected publications moved out of that tile's note into their own "Rechazadas" tile (shown
  only when there are some), which opens the rejected filter. The "Catálogo" filter is hidden and an old
  `catalogo=` value is ignored (`CATALOG_MATCHING_AVAILABLE = false` in `lib/store-inventory.ts`), and the SKU page
  no longer promises "La coincidencia con el catálogo llega con la importación"; it mentions the catalog only for a
  SKU that really is linked.
- **Files.** `components/inventory/inventory-summary.tsx`, `components/inventory/inventory-toolbar.tsx`,
  `lib/store-inventory.ts`, `app/mi-cuenta/tienda/inventario/[itemId]/page.tsx`, the same migration.
- **How to test.** Press "En revisión" on Inventario: the table shows the same number of SKUs. `tests/ux-inventory.test.cjs`.
- **Limitations.** Turn `CATALOG_MATCHING_AVAILABLE` on when the catalog autofill reaches main (STORE-3c).

## Batch

Database: `supabase/migrations/20261107130000_ux_inventory_enum.sql` (the `correction` movement type, on its own
because a new enum value can't be used in the transaction that adds it), `20261107130100_ux_inventory_undo_and_bulk.sql`,
`20261107130200_ux_inventory_views.sql`, `20261107130300_ux_purchase_requests.sql`. SQL suite `tests/ux-inventory.sql`;
unit tests `tests/ux-inventory.test.cjs`. Every write keeps the Store Operations rules: one advisory lock on the
idempotency key, then listings, then items (`laria_private.lock_inventory_items`), and a receipt in
`store_inventory_batch_receipts` so a repeated key replays the first result and a reused key with another payload is
refused.

### stock-02 −1 / +1 on each row

- **What changed.** Each active row in Inventario has "−1" (a sale, channel Tienda física) and "+1" (a restock), each
  with Deshacer for 10 seconds. Both are buttons with a label naming the SKU; "−1" is disabled at zero.
- **Files.** `components/inventory/inventory-table.tsx`, `components/inventory/undo-notice.tsx`.
- **How to test.** Inventario of the demo store: press "−1" on YAM-C40, then Deshacer.
- **Defaults.** −1 is recorded as a sale in the store (the most common reason a unit leaves); other reasons stay in
  the stock sheet.

### stock-03 Undo a movement or bulk change

- **What changed.** Every stock result offers "Deshacer" for 10 seconds (the countdown pauses on hover or focus). Undo
  writes a linked correction (`corrects_movement_id`, type `correction`, shown as "Deshecho" in the history), never
  deletes or edits the ledger. `public.undo_stock_movements(ids, key)` is all or nothing; `public.undo_inventory_batch`
  undoes threshold, category, archive and reactivate batches. Sales totals (`laria_private.store_net_sales`, used by
  the summary, the reorder list and 30-day sales) ignore corrected sales. The SKU page keeps an undo button on each
  of the owner's movements for 15 minutes.
- **How to test.** Record a sale, press Deshacer: the stock returns, the history shows the sale and "Deshecho", and the
  "Ventas 7 días" tile doesn't count it. `tests/ux-inventory.sql` covers expiry, insufficient stock, all-or-nothing
  and another store's movements.
- **Defaults.** 10 s on screen, 15 min on the SKU page; only the owner's own sale, return, restock, damage, manual
  adjustment and stock count movements; imports and Admin changes are not undoable here.
- **Limitations.** A price campaign is undone with "Volver a precios anteriores" (stock-15), not with Deshacer.

### stock-04 Purchase requests

- **What changed.** `/mi-cuenta/tienda/solicitudes` (only while the payments pilot is on) lists "Solicitar compra"
  contacts from the last 60 days: time, publication, SKU and available units, and the buyer's name when signed in
  ("Visitante sin cuenta" otherwise). "Vendido" records the sale in Inventario (channel WhatsApp / Laria, quantity 1
  by default) and marks the request in one step, with Deshacer; "Atendida" and "No se vendió" mark it; "Volver a Por
  atender" reopens it. The account menu shows "Solicitudes" with the number waiting (unmarked, last 14 days).
- **Files.** `app/mi-cuenta/tienda/solicitudes/page.tsx`, `components/payment/purchase-requests.tsx`, the
  purchase-requests migration, `lib/account-navigation.ts`, `components/account-navigation.tsx`,
  `app/mi-cuenta/layout.tsx`.
- **Defaults.** Laria still never sees the chat, amounts or payment. A request already sold can't be re-marked until
  its sale is undone.

### stock-05 Ready replies for WhatsApp

- **What changed.** The Solicitudes page has copyable replies (/disponible, one per approved method, /recojo,
  /agotado) built from what the store already gave Laria: approved methods, holder name, address and the new
  "Horario de recojo". They carry no numbers, accounts or links; "[equipo]" is left for the owner, as WhatsApp
  Business quick replies expect.
- **Files.** `lib/payment-methods.ts` (`readyReplies`), `components/payment/purchase-requests.tsx`.

### stock-06 Default threshold and daily summary

- **What changed.** "Ajustes de stock" in the Inventario footer: a default low-stock threshold that new SKUs start with
  (optionally applied to SKUs without one), and an opt-in daily in-app summary "Stock bajo: 6 · Agotados hoy: 2" at
  20:00 Lima (cron `inventory-daily-summary`), sent only on days with something to report, once per store per day,
  never by e-mail. Notificaciones labels it "Resumen de stock" and opens the low-stock view.
- **Files.** `components/inventory/inventory-settings.tsx`, `components/notifications-list.tsx`, the undo migration.
- **Defaults.** Both off. "Agotados hoy" counts SKUs at zero that had a decrease that day.
- **Limitations.** The notifications `event_type` check is rebuilt to add `store_stock_summary`; another batch adding
  types must keep it. At integration this goes through the shared `laria_private.ux_extend_text_check`
  (`docs/ux-effortless/integration.md`, UXD-integration-3).

### stock-07 Reorder list

- **What changed.** `/mi-cuenta/tienda/inventario/reponer`: active SKUs out of stock or at their threshold, with
  available units, threshold, 30-day net sales and a suggested quantity (what covers 30 days of sales or clears the
  threshold, at least 1). Downloads as Excel or CSV with an empty "Cantidad recibida" column; uploading the filled file
  previews each line (unknown or archived SKUs, duplicates, formulas and non-numbers are listed, not added) and adds
  everything as one Reposición batch with Deshacer.
- **Files.** `lib/inventory-reorder.ts`, `app/api/store/inventory/reorder/route.ts`,
  `components/inventory/reorder-upload.tsx`, `app/mi-cuenta/tienda/inventario/reponer/page.tsx`.
- **Limitations.** Up to 2,000 lines per file; the suggestion is a guide, not a forecast.

### stock-08 Out of stock with interest

- **What changed.** Inventario (unfiltered, first page) shows "Agotados con interés": out-of-stock SKUs with a
  publication, ordered by favorites plus WhatsApp contacts in 90 days, each with a Reponer action.
- **Files.** `components/inventory/inventory-demand.tsx`, `get_out_of_stock_demand`.

### stock-11 Duplicate SKU, create another, variants

- **What changed.** "Duplicar SKU" on the SKU page opens the new-SKU sheet prefilled (without the SKU code or stock);
  the sheet has "Crear y agregar otro" and a variants helper: a list of variants (one per line, up to 30) creates one
  SKU each with the SKU code plus a suffix.
- **Files.** `components/inventory/sku-forms.tsx`, `components/inventory/item-detail.tsx`.

### stock-14 Select every matching SKU and more bulk actions

- **What changed.** After selecting the page, a banner offers "Seleccionar los N SKU que coinciden" (up to 2,000,
  `get_inventory_item_ids`). Bulk actions gain Archivar, Reactivar (archived view), Volver a publicar (hidden by the
  store) and Categoría, each one batch with Deshacer and a list of skipped SKUs and why. The bulk limit went from 200
  to 2,000 in every bulk function, and exports of a selection or view no longer stop at 200.

### stock-15 Price campaigns

- **What changed.** Bulk price changes are named campaigns ("−15% en Guitarras") with a preview of every price,
  optional rounding to prices ending in 9 (nearest, ties down, minimum S/ 9) and "Volver a precios anteriores" on
  `/mi-cuenta/tienda/inventario/precios`, which restores only SKUs whose price nobody changed since. The Precios page
  starts a campaign for a category or the whole inventory.
- **Files.** `components/inventory/bulk-actions.tsx`, `components/inventory/price-campaigns.tsx`,
  `app/mi-cuenta/tienda/inventario/precios/page.tsx`.

### stock-16 Export this view

- **What changed.** With filters on, the footer offers "Exportar esta vista" as Excel, CSV or Excel with the
  publication's fields (title, price, condition, city, description), in the view's order.
- **Files.** `app/api/store/inventory/export/route.ts`, `lib/inventory-export.ts`.

### stock-17 Saved views

- **What changed.** Chips above the table: four built in (Agotados publicados, Stock bajo, Sin publicación, Sin
  precio) and up to 12 of the store's own ("Guardar vista"), each deletable.
- **Files.** `components/inventory/inventory-views.tsx`, `store_inventory_views`.

### stock-18 Keyboard shortcuts

- **What changed.** `/` search, `n` new SKU, `v` / `r` / `a` sale, restock or adjust on the focused row, `?` help,
  Ctrl/Cmd+K jump anywhere in the store's account. Ignored while typing in a field; every shortcut has a button.
- **Files.** `components/inventory/inventory-shortcuts.tsx`, `components/ui/data-table.tsx` (`onRowShortcut`).

### stock-19 Where am I in the list

- **What changed.** "1–50 de 312" with Anterior and Siguiente; the SKU page shows "N de M" with Anterior / Siguiente
  in the list the owner came from, and the breadcrumb returns to that list and page.

### stock-20 Category

- **What changed.** The SKU page has a category field and bulk "Categoría"; a linked publication keeps its own
  category.

### stock-23 Purchase quantity

- **What changed.** "Solicitar compra" has a − / + stepper when more than one unit is available, up to the available
  units or 10, without showing the stock (D-14). The quantity goes into the WhatsApp message only.
- **Files.** `components/payment/purchase-request-link.tsx`; small edits listed below.

### big-10 Mostrador

- **What changed.** `/mi-cuenta/tienda/inventario/mostrador`: scan with the camera (BarcodeDetector), type, or use a
  USB scanner (each code adds a unit); several items per sale, channel, total when every price is known, one
  all-or-nothing sale with Deshacer for 10 seconds. The SKU list is kept on the device, and sales made offline wait in
  a queue that is sent when the connection returns (and every 30 s); a refused sale stays with its reason until
  removed.
- **Files.** `components/inventory/counter.tsx`, `lib/inventory-counter.ts`, the counter page.
- **Defaults.** Matches the SKU or external reference exactly, then words in name, SKU or code.
- **Limitations.** BarcodeDetector exists in Chrome and Android browsers, not Safari or Firefox; there the camera button
  is hidden and typing or a USB scanner works. A queued sale uses the stock known when it was sent, so it can be
  refused if the units were sold meanwhile.

### Small edits to files other batches own

- `components/whatsapp-contact-link.tsx`: optional `quantity` sent with the contact (stock-23).
- `app/api/contact/route.ts`: accepts `quantity` only with intent purchase and clamps it.
- `components/listing/contact-module.tsx` and `app/instrumentos/[slug]/page.tsx`: pass `maxQuantity`.
- `lib/account-navigation.ts`, `components/account-navigation.tsx`, `app/mi-cuenta/layout.tsx`: the Solicitudes entry
  and its count.
- `components/notifications-list.tsx`: the "Resumen de stock" label and link.
- Tests updated for intended changes: `tests/pay-1.test.cjs` (maxQuantity), `tests/store-ops-1b.test.cjs` (2,000
  limit, price filter), `tests/store-ops-review-ux.test.cjs` (Solicitudes in the menu).
- `get_inventory_page` and `get_inventory_summary` are redefined here; other batches should not redefine them.

## Proposed decisions

- **UXD-inventory-1.** Inventario search matches SKU, name, variant, external reference and the linked publication's
  title, brand and model; every word must match, accent- and case-insensitive, and the table follows the box as you
  type (fix-06).
- **UXD-inventory-2.** "En revisión" in Inventario means new publications plus changes in review; rejected
  publications are a separate tile. The catalog filter is hidden until catalog matching exists (fix-09).
- **UXD-inventory-3.** Undo is a linked correction in the append-only ledger, offered for 10 s after each change and
  15 min on the SKU page; sales totals ignore corrected sales (stock-02, stock-03).
- **UXD-inventory-4.** Purchase requests get their own page with marks and a one-step "Vendido", and the store gets
  ready replies without numbers or links (stock-04, stock-05).
- **UXD-inventory-5.** A default threshold and an opt-in daily summary in Notificaciones, never e-mail (stock-06).
- **UXD-inventory-6.** The bulk limit is 2,000 SKUs, a view can be selected whole, and price changes are revertible
  campaigns with optional rounding to …9 (stock-14, stock-15).
- **UXD-inventory-7.** Reorder list as a file round trip; "Agotados con interés" by favorites and contacts (stock-07,
  stock-08).
- **UXD-inventory-8.** Saved views, export of a view, shortcuts and list position (stock-16 to stock-19).
- **UXD-inventory-9.** "Solicitar compra" asks for a quantity up to what is available, capped at 10, without showing
  stock (stock-23).
- **UXD-inventory-10.** Mostrador: the browser as the counter, camera where BarcodeDetector exists, offline queue
  (big-10).

## Checks

Fixes branch: `pnpm typecheck`, `pnpm lint`, `pnpm test` (476 tests), `pnpm build`, and every SQL suite plus the
concurrency suite on the Docker-free database (57 migrations), all green. Screenshots `fix06-*` and `fix09-*` at 390 and
1366 px on the Docker-free prototype.

Batch branch: `pnpm typecheck`, `pnpm lint`, `pnpm test` (482 tests), `pnpm build`, and every SQL suite including
`tests/ux-inventory.sql` and the concurrency suite (61 migrations), all green. Screenshots at 390 and 1366 px:
`inventory-list`, `views-low-stock`, `select-all-matching`, `shortcuts-help`, `go-anywhere`, `stock-settings`,
`reorder`, `prices`, `price-campaign-sheet`, `counter`, `purchase-requests`, `purchase-quantity`.
