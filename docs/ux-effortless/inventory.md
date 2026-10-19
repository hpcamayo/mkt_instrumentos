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

## Proposed decisions

- **UXD-inventory-1.** Inventario search matches SKU, name, variant, external reference and the linked publication's
  title, brand and model; every word must match, accent- and case-insensitive, and the table follows the box as you
  type (fix-06).
- **UXD-inventory-2.** "En revisión" in Inventario means new publications plus changes in review; rejected
  publications are a separate tile. The catalog filter is hidden until catalog matching exists (fix-09).

## Checks

Fixes branch: `pnpm typecheck`, `pnpm lint`, `pnpm test` (476 tests), `pnpm build`, and every SQL suite plus the
concurrency suite on the Docker-free database (57 migrations), all green. Screenshots `fix06-*` and `fix09-*` at 390 and
1366 px on the Docker-free prototype.
