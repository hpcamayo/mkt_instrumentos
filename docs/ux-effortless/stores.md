# Effortless Laria: batch "stores" (store profile, storefront and import)

Build of the ideas Henri approved on the "Effortless Laria" page (2026-10-19) that the build plan
(`/mnt/project-files/ux-ideas/build-plan.md`) gives this batch. Fixes ship first, in their own PR into `ux/effortless`;
the rest follows on `ux/effortless-stores`. Proposed decisions are numbered UXD-stores-n; the integrator moves them
into `docs/decisions.md`. Proposed acceptance cases are in `docs/ux-effortless/stores-acceptance.tsv` (EASE-500…599,
Not Run).

Migration slot: `20261106`. Nothing here was applied to a hosted database, deployed or sent anywhere.

## Fixes

### fix-04: re-importing an inventory export can no longer undo sales

**Before.** The export always filled "Stock" and the import required a stock column. The natural loop "export, change
prices in Excel, re-import" wrote back the stock counted at export time: a counter sale recorded in between was
reversed as an import reconciliation, visible only as one line among hundreds in the review.

**After.**

- The column step asks "¿Qué actualiza este archivo en los SKU que ya tienes?" with three answers: **Precios** (stock
  untouched), **Stock** (prices untouched) and **Ambos**. It asks only when the mapping has both a stock and a price
  column; a file with only one of them answers itself. Nothing is preselected (guardrail: no pre-ticked choices). New
  SKU always take the row's stock and price; name, variant and the other details update in all three cases.
- The export gains a last column, "Exportado el", with the export time in UTC (`2026-10-19T14:05:09Z`, a text cell, so
  Excel leaves it alone). The import maps it back automatically.
- When the file updates stock and a row's SKU had stock movements after that time (a counter sale, an adjustment,
  another import), **today's stock is kept by default**:
  - if the cell still holds the export-time count, the row says so in a note (`IMPORT_STOCK_KEPT`);
  - if the store edited the cell, the row carries a warning naming the export count, the file's count and today's
    stock (`IMPORT_STOCK_STALE`).
- The review shows one notice for those rows ("N SKU tuvieron ventas o ajustes después de que exportaste el
  archivo… Mantuvimos su stock de hoy") with "Ver esos SKU" (a filter) and "Usar el stock del archivo" for a store
  that counted again. That choice re-reads the file with the same columns and every such row then says it overrides
  the later movements (`IMPORT_STOCK_STALE_APPLIED`); "Mantener el stock de hoy" goes back.
- The confirmation states what the file changes for the chosen scope and how many SKU keep today's stock. The import
  guide adds: "¿Solo quieres cambiar precios? Exporta tu inventario, cámbialos en Excel y súbelo: Laria no deshace las
  ventas que registres mientras tanto."

**How it works.** The session's `options` hold `update_scope` and `stale_stock`, set by
`confirm_store_import_mapping` (two new optional arguments; an older client that sends neither keeps STORE-2's
behavior). `plan_import_row` takes the options as a fourth argument, so the preview and the commit (which re-plans
every row against locked current state) apply the same rule. The count at export time is the `on_hand_before` of the
first ledger movement after "Exportado el". An export time that is not a UTC ISO timestamp, or lies in the future, is
ignored (the row is planned as before) and the page says the date could not be read.

**Files.** `supabase/migrations/20261106120000_ux_import_update_scope.sql`, `lib/store-import/mapping.ts`,
`lib/store-import/rows.ts`, `lib/store-import/server.ts`, `lib/store-import/columns-guide.ts`,
`components/store-import/import-wizard.tsx`, `lib/inventory-export.ts` (owned by the inventory batch: one column
added at the end, nothing else), tests `tests/ux-stores-import.sql`, `tests/ux-stores.test.cjs`,
`tests/store-ops-1b.test.cjs` (the export header now ends with "Exportado el").

**How to test.** `tests/ux-stores-import.sql` plays the round trip (two counter sales after the export, a price edit
and a stock edit, then commit: both sales survive and no reconciliation is written), the "use the file's stock"
choice, prices-only and stock-only files, and export times that are not ones. In the prototype: Inventario →
Exportar, record a sale on one SKU, change a price in the file, import it, answer "Precios" or "Ambos".

**Defaults picked.**
- UXD-stores-1: the scope question is asked only when the file has both columns; no answer is preselected.
- UXD-stores-2: stale stock is detected only for files that carry "Exportado el" (a Laria export). A store's own POS
  file is a fresh count by definition, so it applies as before.
- UXD-stores-3: "Usar el stock del archivo" is one choice for the whole file, not per row. A store that recounted only
  some SKU can exclude the others in the review.
- UXD-stores-4: under "Precios", a stock cell for a new SKU is still its opening stock (a new SKU has no history to
  undo).

**Limitations.** A CSV export opened and re-saved by a spreadsheet that rewrites the "Exportado el" text into a date
loses the protection for that file; the page then says the date could not be read. The stock a store typed over a
later sale is not merged (for example "today 8, I added 3"): the store chooses between today's stock and the file's.

### fix-09 (the store invitation part)

**Before.** The store invitation said "La tienda necesitará aprobación antes de publicar" and that Laria reviews the
application "antes de activar la página pública o permitir publicaciones". The functional specification says the
opposite: before approval a store's listings follow normal moderation; only its public page waits.

**After.** "Después completas la solicitud de tienda y ya puedes publicar", "Puedes publicar desde el primer día: tus
publicaciones pasan por revisión antes de verse en Laria", and "Activar la cuenta no aprueba la tienda. El equipo de
Laria revisa la solicitud; hasta entonces, la página pública de tu tienda no se muestra."

**Files.** `app/registro/tienda/invitacion/page.tsx`. **How to test.** `tests/ux-stores.test.cjs` (fix-09); open the
invitation page with a store-owner account. The other fix-09 parts belong to the listing, my-listings, inventory and
speed batches.
