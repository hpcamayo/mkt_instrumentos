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

## Store profile, allowance and import

### shop-01: invited stores don't retype anything

**Before.** An invitation already carried the store's name, contact, WhatsApp, city and region, and the store-owner
signup carried the person, WhatsApp and location, but the application form started empty.

**After.** A new application starts from what Laria already knows (`storeApplicationPrefill` in
`lib/store-profile.ts`): the invitation's metadata, with the profile winning where the person corrected it since. A
short note says the fields came from the invitation or the account and can be changed. An existing store's data is
never overwritten.

**Files.** `lib/store-profile.ts`, `app/mi-cuenta/tienda/page.tsx`, `components/store-registration-form.tsx`.

**Defaults picked.** UXD-stores-5: the prefill fills only empty fields of a new application; nothing is saved until the
owner sends the form.

### shop-03: Mi tienda in two parts

**Before.** One long form mixed RUC and razón social with the public profile, showed logo and banner as "Imagen actual
guardada" with no thumbnail, and said nothing when a RUC change would send payment methods back to review.

**After.**

- Two sections: **Perfil público** (name, WhatsApp for buyers, location, description, opening hours, logo, banner,
  social networks, photos) and **Datos de la empresa** (razón social, RUC, e-mail, contact, address, and whether the
  address is shown publicly, unchecked by default).
- Logo and banner show a preview of the current or chosen image, with size guidance (logo square, shown at 96 px on
  the page and 40 px on listings; banner 1600 × 400, shown as a 120 px strip).
- Social fields take "@tutienda" or a link; a handle becomes the network's profile link.
- Changing the RUC or razón social shows a warning under the fields and, when the store has an approved or pending
  payment method, a confirmation before saving: those methods go back to Admin review (the database already does
  this; now the owner knows first).
- "Ver mi página" opens the store page (shop-04's owner preview), and a line links to "Valores por defecto" (shop-06,
  built by the selling batch).

**Files.** `components/store-registration-form.tsx`, `lib/store-profile.ts`, `app/mi-cuenta/tienda/page.tsx`,
`lib/account-context.ts` (shared: two columns added to the store select).

**Defaults picked.** UXD-stores-6: the RUC confirmation appears only when a method would actually go back to review
(approved or pending); otherwise the inline warning is enough.

### shop-05: the listing allowance, explained and manageable

**Before.** The same limit had three names (inventario concurrente, publicaciones concurrentes, cupo). At the limit
the Publicar button disappeared, and out-of-stock listings kept using slots.

**After.**

- One name everywhere: **Cupo de publicaciones** (account home, Mi tienda, Inventario, the store publish page, the
  import's publication step and the database error message the screens show).
- Mi tienda shows a meter, "N de M en uso", with what counts (published and in review) and what doesn't (sold, hidden,
  archived). It turns stronger from 80 % and red at the limit; the number is always in text, never color alone.
- When published listings are out of stock, the meter says "N publicaciones agotadas ocupan cupo sin poder venderse"
  with **Ocultarlas**: an owner hide of exactly those listings (inventory stores only), restorable per listing.
- **Pedir más cupo** (a button near or at the limit, a link otherwise) sends an optional number and note to Admin. One
  open request at a time; the meter then says when it was sent.
- At the limit, Inventario's header shows "Cupo lleno: ver opciones" instead of nothing, and the publish page and
  account home point to Mi tienda.
- Admin sees the store's open requests above "Cupo de publicaciones" in Admin → Tiendas, and closes them as resolved
  or dismissed.

**How it works.** `20261106130000_ux_store_requests.sql`: table `store_admin_requests` (owner and Admin read through
RLS, writes only through functions), `request_store_admin_help`, `get_store_listing_allowance_detail`,
`hide_out_of_stock_store_listings` (wraps the inventory's `hide_inventory_listings_bulk`, idempotent per click),
`get_admin_store_requests`, `admin_close_store_request`.

**Files.** The migration, `lib/store-allowance.ts`, `components/store-allowance-meter.tsx`,
`components/admin-store-requests.tsx`, `components/admin-domain-view.tsx` (one line), `app/mi-cuenta/tienda/page.tsx`,
`app/mi-cuenta/tienda/publicar/page.tsx` (the limit notice, which the plan gives this batch). Smallest edits in files
other batches own: `app/mi-cuenta/page.tsx` (my-listings: the metric label and the limit notice),
`app/mi-cuenta/tienda/inventario/page.tsx` (inventory: the header line and the full-allowance button).

**Defaults picked.**
- UXD-stores-7: "Ocultarlas" acts only on listings linked to an inventory SKU marked out of stock; a store without
  inventory has no "Agotado" state to act on.
- UXD-stores-8: a request changes nothing by itself; Admin still sets the allowance with an audited reason.

**Limitations.** The store is not notified when Admin closes a request (no e-mail template; accounts owns
`lib/email/*`). The request simply disappears from the meter.

### stock-21: ask for inventory

**Before.** Only Admin could turn inventory on, and a store without it saw "El inventario de tu tienda aún no está
activo" with no way to ask.

**After.** Mi tienda and the import page show "Lleva tu stock en Laria", what Inventario does, and **Solicitar
acceso** with an optional note. Admin sees it in Admin → Tiendas with **Activar Inventario**, which turns it on with an
audited reason and closes the request in one step (there was no Admin control for this before; it was SQL only).

**Files.** `components/store-inventory-access.tsx`, `components/admin-store-requests.tsx`,
`app/mi-cuenta/tienda/inventario/importar/page.tsx`, `app/mi-cuenta/tienda/page.tsx`, the requests migration above.

### stock-22: see when an import will expire

**Before.** An unfinished import expired silently after 7 idle days and blocked a new one until then.

**After.** The import page's notice and the wizard say "Vence el 26 de octubre si no la continúas." and the notice has
**Descartar y empezar otra** (with a confirmation saying applied changes stay).

**Files.** `lib/store-import/labels.ts`, `components/store-import/import-discard.tsx`,
`app/mi-cuenta/tienda/inventario/importar/page.tsx`, `components/store-import/import-wizard.tsx`.

**Limitations.** The date is the last activity plus 7 days; the daily expiry job may close it a few hours after.

### stock-12: fix import errors on the page

**Before.** The review said to correct the file and upload it again.

**After.** A row whose error points at a mapped column has **Corregir &lt;campo&gt;**: the value as read is shown in a
field, and "Guardar y revisar" replaces that cell in this import (the file stays as it was), then the rows are checked
again with the same rules. Rows flagged as duplicates are re-checked too, so fixing one SKU clears its twin. A filter
of rows that would apply (Nuevos, Actualizar, Vincular, Con advertencias, Con ventas después de exportar) gets
**Excluir todas estas filas (N)**, which covers every row of the filter and category, not only the page.

**How it works.** `20261106160000_ux_import_cell_edit.sql`: `edit_store_import_cell` checks the version and that the
field is mapped, writes the cell, resets the row (and duplicate rows) to unplanned and moves the session back to
validating; the existing step loop re-plans them. `GET …/rows?numbers=1` returns every row number of a filter.

**Files.** The migration, `lib/store-import/server.ts`, `app/api/store/imports/[id]/rows/route.ts`,
`components/store-import/import-wizard.tsx`.

**Defaults picked.** UXD-stores-9: a correction re-plans only the edited row and duplicate rows, not the whole file.
Other rows keep the plan they had.

### stock-13: a photo session on the phone

**Before.** Photos matched only when renamed (SKU__01.jpg); phone photos (IMG_1234.jpg) had to be placed one by one.

**After.** The Fotos step offers **Empezar sesión de fotos** when SKU have fewer than two photos. It walks them one at
a time ("SKU 3 de 12"): **Tomar foto** opens the rear camera on a phone (`capture="environment"`; a computer opens the
file picker), each shot is re-encoded in the browser (no location data, as before), uploaded and attached to the SKU
on screen, and the thumbnails show at once. "Siguiente SKU" / "Saltar este SKU" / "Terminar".

**How it works.** No database change: the session uses the existing upload slots, checks and
`place_store_import_photo`.

**Files.** `components/store-import/import-photos.tsx`.

**Limitations.** The SKU page in Inventario still has no photos of its own (photos live with an import or a
listing); the session also runs on "Publicar seleccionados" (stock-10), which covers SKU outside an import.

### stock-10: publish many SKU at once

**Before.** Publishing in bulk was possible only from an import's result page, until it was purged; from Inventario,
one form per SKU.

**After.** Selecting SKU in Inventario shows **Publicar seleccionados (N)** in the bulk bar (only active SKU without a
publication count). It opens a page with the import's two publication steps: photos (with the photo session) and the
publication list, where "Completar datos" fills what is missing and the allowance is checked as for an import.

**How it works.** `20261106170000_ux_publish_selection.sql`: `create_inventory_publish_selection` stages the SKU as an
already-applied import (one row per SKU, prefilled with SKU, name, variant, category and price; no stock change),
closed from the start so it never blocks a real import, and marked `options.source = 'inventory_selection'`. The
import's existing publication functions then work unchanged.

**Files.** The migration, `app/api/store/imports/publish-selection/route.ts`,
`components/store-import/publish-selection.tsx`, `app/mi-cuenta/tienda/publicar-seleccionados/[sessionId]/page.tsx`,
`app/mi-cuenta/tienda/inventario/importar/[sessionId]/page.tsx` (redirects such a batch to its page),
`app/mi-cuenta/tienda/inventario/importar/page.tsx` (leaves batches out of the history). Smallest edits in files the
inventory batch owns: `components/inventory/inventory-table.tsx` (one button in the bulk bar),
`lib/store-inventory.ts` (the import-errors tile ignores these batches).

**Defaults picked.** UXD-stores-10: at most 200 SKU per batch, the bulk bar's existing limit. Like an import, a batch's
staged rows are purged 30 days after it is created.

## Storefront: find-13, find-14, list-12, shop-04

Migration `supabase/migrations/20261106140000_ux_store_location.sql` (additive: two columns on `public.stores`, one
check, two read functions). Shared pure helpers: `lib/store-storefront.ts`. Tests: `tests/ux-stores-storefront.test.cjs`
(unit and static checks, run by `pnpm test`) and `tests/ux-stores-storefront.sql` (database).

### find-13: a real list of stores

**Before.** "Tiendas verificadas" (strip, home header, home "Categorías" panel, home "Ver todas", footer, Admin
accordion, store breadcrumb) opened the catalog filtered to verified stores (decision N7). Nobody could browse the stores
themselves.

**After.**

- New page `/tiendas` with two tabs. They are plain links with their own URLs, `/tiendas` and
  `/tiendas?vista=publicaciones` (`?vista=tiendas` or any other value also gives the first tab), the current one with
  `aria-current="page"` and a 2 px ink underline (the Inventario view-tabs pattern; no `role="tab"`). Targets are 44 px.
- **Tiendas**: every active store, verified first, then by name. Each card is one link to the store page: the logo or
  white initials, the name, `VerifiedMark` or the "Tienda" tag, district/city/region, the rating ("4.8 ★ · 9 reseñas",
  read as "4.8 de 5") only when there are visible reviews, and "N publicaciones" (approved listings, in stock and out of
  stock: the store page's own figure). City chips ("Todas 3", "Lima 2", "Huancayo 1": real counts) filter by
  `?ciudad=`; the selected chip has the check and `aria-current`. A count line ("2 tiendas en Lima"), the
  "¿Tienes una tienda?" tile (as on the home), and empty states (no stores yet; no stores in that city).
- **Publicaciones de tiendas verificadas**: the catalog query (`fetchCatalogPage` with `seller_type=verified_store`),
  the listing card in the store page's 2/3/4/5-column grid, 24 a page with the shared `Pagination`, "N publicaciones ·
  Más recientes" and a link "Filtrar por categoría, precio o condición" to the same listings in the catalog (all its
  filters and sort).
- Lead line: "Tiendas de instrumentos y audio de todo el país. Las verificadas van primero: Laria revisó a mano su RUC,
  razón social y contacto. Coordinas el pago y la entrega directamente con cada tienda."
- `VERIFIED_STORES_PATH` (lib/shell.ts) is now `/tiendas` (new `STORES_PATH`), so every "Tiendas verificadas" entry
  above points there, the footer's `exploreLinks` included, with no edit to `components/site-footer.tsx` (it already
  reads the constant). `currentStripKey("/tiendas")` marks "Tiendas verificadas"; the old filtered catalog URL still
  marks it too. `getShellLayout("/tiendas")` was already a browse page (`under("/tiendas")`); now pinned by a test.
- Store breadcrumb: "Inicio / Tiendas / <tienda>" for every store (was "Inicio / Tiendas verificadas / …" for verified
  stores only, "Inicio / …" for others).
- Metadata: `/tiendas` is indexed with canonical `/tiendas` ("Tiendas de instrumentos en Perú"); a city filter, the
  listings tab and later pages are `noindex, follow` without canonical, like the catalog's filtered URLs. `/tiendas` is
  in the sitemap; its variants are not.
- Data: one call, `public.get_public_store_directory()` (security definer, active stores only, public columns only:
  no address, contact or business data; rating counted exactly like `get_public_reputation`; capped at 2,000 rows).

**Files.** `app/tiendas/page.tsx` (new), `components/store/store-directory.tsx` (new), `lib/store-storefront.ts`
(new), `lib/shell.ts`, `components/store/store-header.tsx` (breadcrumb), `app/sitemap.ts`, the migration,
`lib/supabase/database.types.ts`; tests `tests/ux-shell.test.cjs`, `tests/ux-home.test.cjs`,
`tests/ux-listing.test.cjs` (they pinned N7's `/listados?seller_type=verified_store` and L19's breadcrumb; each changed
assertion says why).

**How to test.** Open `/tiendas`: stores verified first, city chips, real figures. Press a city chip, then "Todas".
Open the second tab: verified stores' listings, 24 a page, the catalog link. Check the strip underlines "Tiendas
verificadas" on both tabs, and that the footer, home header and home "Ver todas" lead to `/tiendas`. View source:
canonical only on `/tiendas`, `noindex` on `?ciudad=` and `?vista=publicaciones`.

**Defaults picked.**
- UXD-stores-20: the directory lists all active stores (Tienda and Tienda verificada), verified first, then
  alphabetically, while the entry keeps the label "Tiendas verificadas". The owner may prefer relabelling the strip and
  footer entry "Tiendas" (one constant and label change).
- UXD-stores-21: city chips (not grouped sections), ordered by number of stores, then alphabetically; shown only with
  two cities or more.
- UXD-stores-22: the listings tab has no filters or sort of its own; it links to the catalog's verified-store filter,
  which has them all.
- UXD-stores-23: every store page's breadcrumb goes through "Tiendas" (replaces L19's per-type trail).
- UXD-stores-24: the directory card shows rating only with visible reviews and always "N publicaciones" (Q18/F12 kept
  stats off the home tiles; the directory is where they now appear).

**Limitations.** No pagination on the stores tab (capped at 2,000 stores, far above today). A city typed in the URL
that has no store shows the empty state with no chip selected. The home's `VerifiedStoresSection` comment in
`components/home/home-sections.tsx` still says "there is no stores directory (N7)" (not my file; behaviour is right
through the constant). The `docs/design-system.md` rows that describe N7 and L19 need the integrator's update.

### find-14: search and sort inside a store

**Before.** The store page showed every listing 24 a page, newest first, with no category, brand or sort (L16 A). With
allowances up to 2,000 listings, that is up to 84 pages.

**After.** Under "Publicaciones": category chips with real counts, only for categories the store has, in taxonomy
order ("Todas 8", "Guitarras 2", "Pedales 2"…; hidden when the store has one category and no filter is on); the brand
box ("Buscar por marca en esta tienda", the catalog's `BrandFilterForm`); sort (the catalog's `SortMenu` on desktop and
`SortSheetButton` on phones and tablets). Applied filters show as the catalog's `AppliedChip`s with "Limpiar todo".
Every choice is a URL (`/tiendas/<slug>?category=guitars&brand=Fender&sort=price_asc`) that the 24-a-page pagination
keeps; the section navigates in the catalog's transition (`CatalogNavigation`/`CatalogResults`: results dim, focus
returns to the chosen chip). In-stock listings still come before "Agotado" ones in every order. The header's
"N publicaciones" stays the whole store; the section heading shows the filtered count. No results: "No encontramos
publicaciones con esos filtros" with "Ver todas sus publicaciones". Filtered store URLs are `noindex, follow`, canonical
the store page. The page comment that recorded "no in-store search, chips or sort" now points to find-14.

**Files.** `app/tiendas/[slug]/page.tsx`, `components/store/store-listing-filters.tsx` (new),
`lib/store-storefront.ts`, the migration (`public.get_store_listing_categories(p_store_id)`, security invoker:
row-level security decides what is counted), `lib/supabase/database.types.ts`. Smallest edits to the catalog batch's
files, listed below.

**How to test.** Open `/tiendas/laria-demo-musica`: chips and counts match the grid; press "Guitarras", sort "Mayor
precio", search brand "Fender", page through; check the URL keeps the choices and "Limpiar todo" clears them. A brand
with no match shows the empty state.

**Defaults picked.**
- UXD-stores-25: the store page reads only `category`, `brand` and `sort` (same names as the catalog); other catalog
  parameters are ignored. Brand matches "contains", like the catalog.
- UXD-stores-26: category counts do not narrow with the brand filter (they always describe the whole store).
- UXD-stores-27: out-of-stock listings stay last whatever the sort (store-operations design §5.2).

**Limitations.** Next scrolls to the top of the page after a chip or sort choice (the catalog's transition provider has
no scroll option); the section sits under a compact header, so the move is short. No price or condition facets in the
store (not asked).

### list-12: where the store is, and when it opens

**Before.** Store page and listings showed the city/district only (L18 A), though the store gave its street address
and the safety advice says to check the instrument in person.

**After.**

- `public.stores` gains `show_address boolean not null default false` and `opening_hours text` (null, or 1–300
  characters that are not only spaces: check `stores_opening_hours_length`).
- When `show_address` is true: the street address with "Cómo llegar" (a Google Maps search for address, district,
  city and "Perú", `target="_blank" rel="noopener noreferrer"`, "(abre Google Maps en otra pestaña)" for screen
  readers) in the store header under the place, in "Sobre la tienda" ("Dirección"), and in the seller card of that
  store's listings. Opening hours, when written, show in the same three places ("Horario de atención", line breaks
  kept). Icons (map pin, clock) are decorative; each line has a visually hidden label.
- The address becomes public only through `publicStoreLocation()` (lib/store-storefront.ts), which returns it only
  when `show_address === true`. The store page strips `address`, `show_address` and `owner_user_id` from the row
  (`withoutPrivateStoreFields`) before anything renders. Public query paths checked: store page (selects the address
  on the server, gated), listing page (service-role detail query now selects `show_address, address, opening_hours`,
  gated before the seller card), home stores (`id, name, slug, city, district, logo_url`), the directory function (no
  address), sitemap (`id, slug, updated_at`), contact route (`name, whatsapp_phone`), listing embeds (`name, slug,
  status, is_verified`). Owner and Admin reads are not public.
- Owners can save both columns through the existing path: RLS "Store members can update store profile fields", the
  table-level UPDATE grant, and `protect_store_admin_fields` (which does not cover them); the active-store invariant
  trigger does not fire on them. Covered in the SQL suite.

**Files.** The migration, `lib/store-storefront.ts`, `components/store/store-visit.tsx` (new),
`components/store/store-header.tsx`, `components/store/store-sections.tsx`, `app/tiendas/[slug]/page.tsx`,
`lib/supabase/database.types.ts` (stores Row/Insert/Update), and smallest edits to the listing batch's files below.

**How to test.** Apply the migration; `update stores set show_address = true, opening_hours = E'Lun a vie 10–19\nSáb
10–14' where slug = 'laria-demo-musica'`; open the store page and one of its listings: address, "Cómo llegar" (opens
Maps in a new tab) and hours in the header, "Sobre la tienda" and the seller card. Set `show_address = false`: the
address and map link disappear, the hours stay. Run `tests/ux-stores-storefront.sql`.

**Defaults picked.**
- UXD-stores-28: opening hours show whenever the store wrote them (writing them is the consent); only the address
  needs `show_address`.
- UXD-stores-29: "Cómo llegar" only with a shown address (a district-only search is not useful); the query is address,
  district, city, "Perú", with repeated parts once.
- UXD-stores-30: free-text hours (no structured weekdays, no "Abierto ahora": that would need a timezone-aware
  schedule and could be wrong).

**Limitations.** The database does not hide the raw `address` column of an active store from the API: anon and
authenticated keep the table-level SELECT they already had, so `GET /rest/v1/stores?select=address` returns it for
active stores, as it already does today for `ruc`, `email`, `contact_person` and `razon_social`. This predates the
batch. Closing it needs column-level grants for anon/authenticated (and RPCs for owner/Admin reads); I left it out as a
separate, reviewed change and recommend it. In `next dev`, React's development-only debug data in the page payload
includes awaited query results (the raw row, address included); production builds do not emit it. The form fields are
yours (`components/store-registration-form.tsx`): send `opening_hours` as null when blank (trimmed), since the check
rejects empty or space-only text.

### shop-04: see your store page before it is public

**Before.** A store could not see its page until approved; every non-active store slug was a 404.

**After.** The owner of a store in review, rejected or hidden can open `/tiendas/<slug>` and sees a private preview:
a notice "Vista previa: solo tú ves esta página. Será pública cuando Laria apruebe tu tienda." (rejected: "Laria no
aprobó tu solicitud. Revisa el motivo en Mi tienda, corrige los datos y vuelve a enviarla."; hidden: "Laria ocultó tu
tienda y por ahora nadie más la ve. Revisa los detalles en Mi tienda.") with "Editar perfil" (`/mi-cuenta/tienda`). The
preview shows the owner's approved listings (what the public will see; the empty state says listings in review do
not show), the header with the WhatsApp button drawn inert ("En la vista previa este botón no abre WhatsApp. Funcionará
cuando tu tienda sea pública."), "Sobre la tienda" without "Reportar tienda" and with "Laria aún no aprueba esta
tienda…" instead of a verification line. No visit telemetry, no contact link, no JSON-LD, no payment methods, no strip
mark; metadata `noindex, nofollow`, title "Vista previa de <tienda>"; not in the sitemap (it lists active stores
only). Everyone else still gets the 404. On an active store its owner sees "Esta es tu tienda. Así ven tu página los
compradores." with "Editar perfil"; the page is otherwise unchanged (visit telemetry included).

Ownership: the store is read with the signed-in user's server client (`getSupabaseServerClient`, RLS "Store owners can
read own stores", `owner_user_id = <user>`), never the service role. Anonymous visitors carry no Supabase auth cookie,
so the page skips the session lookup for them (`hasSupabaseAuthCookie`).

**Files.** `app/tiendas/[slug]/page.tsx`, `components/store/store-owner-notice.tsx` (new),
`components/store/store-header.tsx`, `components/store/store-sections.tsx`, `lib/store-storefront.ts`.

**How to test.** Sign in as a store owner whose store is pending and open `/tiendas/<slug>`: notice, inert button,
noindex. Signed out or as another user: 404. Approve the store and reload as the owner: the reminder notice and
"Editar perfil"; as anyone else, no notice. (Verified locally against `next dev` on a copy of the tree with a temporary
owner and pending store, then removed.)

**Defaults picked.**
- UXD-stores-31: the preview shows only approved listings, not ones in review (it shows what the public will see).
- UXD-stores-32: the WhatsApp button is shown inert with an explanation rather than hidden, so the owner sees the real
  layout.
- UXD-stores-33: the active-store owner notice keeps visit telemetry as before (owner self-visits still count, as
  today).

**Limitations.** Store members other than the owner (not in V1) do not get the preview. The "Ver mi página" link on
/mi-cuenta/tienda is yours.

### Smallest edits to files other batches own

1. `lib/catalog-filters.ts` (catalog batch): `CatalogScope` gains an optional `path`, and `catalogHref` uses it as the
   base instead of `/listados`:
   - `export type CatalogScope = { landing?: { category: string; path: string }; path?: string };` (plus a one-line
     comment above it)
   - in `catalogHref`: `const base = scope.path ?? CATALOG_PATH; return query ? \`${base}?${query}\` : base;`
   Without `path` every URL is byte for byte as before (`tests/ux-discovery.test.cjs` unchanged and passing).
2. `components/catalog-filter-forms.tsx` (catalog batch): both forms' `action={CATALOG_PATH}` became
   `action={scope.path ?? CATALOG_PATH}`, so the brand box works without JavaScript on the store page.
3. `components/listing/seller-card.tsx` (listing batch): an optional `visit?: PublicStoreLocation` prop, rendered as
   `{visit ? <StoreVisitLines location={visit} className="mt-3" /> : null}` after the figures list; two imports.
4. `app/instrumentos/[slug]/page.tsx` (listing batch): the detail query's `stores (...)` embed adds `show_address,
   address, opening_hours`; `<SellerCard … visit={isStore && store ? publicStoreLocation(store) : undefined} …>`; one
   import (`publicStoreLocation` from `@/lib/store-storefront`).
5. `lib/supabase/database.types.ts`: `show_address` and `opening_hours` in stores Row/Insert/Update;
   `get_public_store_directory` and `get_store_listing_categories` under Functions.
6. `components/site-footer.tsx`: not edited (its `exploreLinks` reads `VERIFIED_STORES_PATH`, now `/tiendas`).
7. `app/sitemap.ts`: one entry, `/tiendas`.

## trust-05 Libro de Reclamaciones virtual

**Pendiente de revisión legal antes de producción.** The page, the form, the constants and the migration carry this marker as a code comment. Users never see internal notes, but the provider data on the page are visibly bracketed stand-ins ("[RUC por confirmar]").

### Before

Laria had no complaints book and no link to one anywhere. A visitor with a complaint about Laria's service could only use "Reportar" on a listing or the contact e-mail.

### After

- **Public page `/libro-de-reclamaciones`.** It uses the legal pages' layout and follows the Indecopi virtual sheet (Anexo I of the Reglamento del Libro de Reclamaciones, D.S. 011-2011-PCM and amendments, under Ley 29571):
  - **Provider block:** razón social, RUC and domicilio, all from `COMPLAINTS_BOOK_PROVIDER` in `lib/complaints-book.ts`. They are bracketed stand-ins. No RUC was invented.
  - **1. Identificación del consumidor reclamante:**
    - nombre completo
    - document type and number: DNI (8 digits), carné de extranjería or pasaporte (6–12 letters or digits), or RUC (11 digits)
    - domicilio, teléfono, correo
    - a "Soy menor de edad" checkbox that reveals a required "Nombre del padre, madre o apoderado" field
  - **2. Identificación del bien contratado:** Producto or Servicio, an optional monto reclamado in soles, and a descripción.
  - **3. Detalle de la reclamación y pedido del consumidor:** Reclamo or Queja, each with the regulation's definition under the option, then detalle and pedido.
  - **4. Información importante:**
    - the answer term ("…en un plazo no mayor a quince (15) días hábiles improrrogables")
    - "La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI."
    - a declaration checkbox that is not pre-ticked, linked to the Privacy policy
  - **Intro:** says plainly that Laria is a marketplace that does not sell the instruments, process payments or ship. Cases about a seller can still be described, and "Reportar" is mentioned.
- **Validation.** It runs in the browser with the shared `useFormErrors` summary (field-by-field messages, focus on the summary). The database applies the same rules again, so the server is always the authority.
- **On submit.** The browser calls `submit_complaints_book_entry` (SECURITY DEFINER, callable by anon and authenticated). The RPC assigns:
  - a correlative number `LR-<año>-<000001>` from a counter row locked in the same transaction. It resets each year (Lima time) and has no gaps.
  - the filing date
  - the signed-in user's id, when there is one

  The form is then replaced by the filed sheet: number, "Fecha de registro … (hora de Lima)", the provider block, a copy of every field, section 4 "Observaciones y acciones adoptadas por el proveedor" showing "Recibida…", and the legal notes. Next to it are **"Imprimir o guardar como PDF"** (`window.print`) and "Registrar otra hoja". The print stylesheet shows only the sheet, with no header, footer, legal navigation or buttons. The confirmation says **"Guarda o imprime esta hoja: es tu constancia"**. No e-mail is promised or sent.
- **Optional context.** `?publicacion=<slug>` from an approved listing prefills the description with «Title» and its path. The text stays editable, the slug is stored only if it is well formed, and an unknown slug prefills nothing.
- **Light abuse limit.** At most 5 sheets per e-mail address, and per signed-in account, in 24 hours (`COMPLAINT_RATE_LIMITED`, with a friendly message).
- **Admin.** The RPCs `get_admin_complaints_book_page(status, page, page_size ≤ 50)` (newest first, with total) and `answer_complaints_book_entry(id, answer)` (records section 4 once) both check `laria_private.assert_admin()`, the JWT `app_metadata.role = 'admin'` check. There is no Admin UI: Admin is outside this program and the RPCs are enough for now.
- **Footers.** A "Libro de Reclamaciones" text link is in the full footer's "Ayuda y legal" column, the phone link list (its grid went from 3 to 4 rows for 7 links) and the slim footer row. `exploreLinks` was not touched.

### Files

- `supabase/migrations/20261106150000_ux_complaints_book.sql` (new):
  - `public.complaints_book_entries`: RLS on, no policies, all privileges revoked from anon and authenticated, length and format checks on every field
  - `laria_private.complaints_book_counters`
  - the submit, admin page and answer RPCs
- `lib/complaints-book.ts` (new): path and label, provider stand-ins, answer term, limits, document types, validation, normalization, RPC arguments, error messages, Lima date format, listing context.
- `app/libro-de-reclamaciones/page.tsx` (new): metadata (indexable, canonical), the `?publicacion` lookup, intro.
- `app/libro-de-reclamaciones/complaints-book-form.tsx` (new, client): the form and the filed state.
- `app/libro-de-reclamaciones/complaints-book-sheet.tsx` (new): provider block, legal definitions and notes, filed sheet, print styles.
- `components/site-footer.tsx`: the three footer links.
- `lib/supabase/database.types.ts`: the three RPC signatures.
- `tests/ux-stores-complaints.test.cjs` and `tests/ux-stores-complaints.sql` (new).
- Edited by the coordinator at my request:
  - `tests/ux-copy.test.cjs`: `libro-de-reclamaciones` added to the LEGAL exemption, because the regulation's wording says "productos o servicios"
  - `tests/ux-shell.test.cjs`: the slim footer's expected links need `/libro-de-reclamaciones` as a 4th entry

Note: the form and sheet live in `app/libro-de-reclamaciones/` rather than `components/complaints-book*.tsx`, so that all the legal wording sits under the one path the copy test exempts.

### How to test

1. Apply the migration: `psql -h 127.0.0.1 -p 54322 -U postgres -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261106150000_ux_complaints_book.sql`.
2. Run the SQL suite: `psql -h 127.0.0.1 -p 54322 -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null -f tests/ux-stores-complaints.sql`. It runs inside begin … rollback and covers:
   - anon filing
   - correlative numbering, with no gap after a refused or rate-limited sheet
   - the user id recorded for a signed-in filer
   - anon and authenticated denied on the table and the counter
   - admin RPCs refusing anon (no execute) and non-admins (ADMIN_REQUIRED)
   - format and length checks
   - the rate limit
   - admin paging, filtering and answer-once
3. Run `pnpm test` (`tests/ux-stores-complaints.test.cjs`), `pnpm typecheck` and `pnpm lint`.
4. In the browser:
   - Open any page, follow "Libro de Reclamaciones" in the footer and submit empty: the error summary lists each field.
   - Fill the form (try "Soy menor de edad" and Carné de extranjería) and submit. You should see the sheet with N.° LR-2026-00000n and the Lima date.
   - Press "Imprimir o guardar como PDF". The preview should show only the sheet.
   - Try `/libro-de-reclamaciones?publicacion=<slug of an approved listing>`.

### Defaults picked (proposed decisions)

- **UXD-stores-40:** One complaints book for Laria, the platform. It is not a book per store: stores, as providers, keep their own books.
- **UXD-stores-41:** Numbering is `LR-<año>-<6 digits>`, correlative per calendar year in Lima time. It comes from a locked counter rather than a sequence, because a sequence skips values on rollback and the book must not have gaps.
- **UXD-stores-42:** The answer goes to the consumer's e-mail (the field hint says "Aquí recibirás la respuesta"). The form has no "respuesta por domicilio" option.
- **UXD-stores-43:** No e-mail copy of the sheet. The visitor saves or prints it. The marketplace e-mail outbox only accepts a fixed set of notification kinds for registered users (`recipient_user_id` is required) and would need a new template in `lib/email/*`, which another batch owns.
- **UXD-stores-44:** Light abuse limit of 5 sheets per e-mail address (and per account) in 24 hours. There is no IP or CAPTCHA limit, so a legitimate consumer is never blocked by shared networks.
- **UXD-stores-45:** Accepted documents are DNI, carné de extranjería, pasaporte and RUC.
- **UXD-stores-46:** The page is indexable, with its canonical URL. It was not added to `legalPages` or the sitemap, to keep edits minimal. The coordinator can add it to the sitemap if wanted.
- **UXD-stores-47:** The footer has a text link only, with no Libro de Reclamaciones icon (see Limitations).
- **UXD-stores-48:** Admin has RPCs only (`get_admin_complaints_book_page`, `answer_complaints_book_entry`) and no Admin screen in this program.
- **UXD-stores-49:** `?publicacion=<slug>` is the only prefill. Signed-in users' names and e-mails are not prefilled; that is a possible follow-up.

### Limitations

- Provider data are stand-ins until Laria's legal entity is confirmed.
- No e-mail copy of the sheet. The Reglamento as amended may require one; this needs a legal and ops decision and an outbox kind and template in `lib/email/*`.
- No Admin UI to list or answer sheets, and no notification to the team when a sheet arrives. Ops must poll the admin RPC.
- The consumer is not notified of the answer automatically. Ops answers by e-mail outside Laria and records it with `answer_complaints_book_entry`.
- There is no Libro de Reclamaciones icon or graphic notice. Indecopi practice shows one; a text link plus the page title was accepted for now.
- Not linked from listing or store pages yet. The `?publicacion=` prefill is ready for such a link.
- The rate limit is per e-mail, so an abuser can rotate addresses. It is meant to be light.
- The sheet's date and time come from the database and are shown in the browser's rendering of Lima time.
- `pnpm typecheck` currently fails only in `app/tiendas/[slug]/page.tsx` (`get_store_listing_categories` missing from the types), which another agent is editing in parallel. It is not from this change.

### Legal review items

- [ ] Confirm the Libro de Reclamaciones obligation applies to Laria as a platform or intermediary. Check the reported 2025 rule for e-commerce platforms, and whether stores must be pointed to their own books.
- [ ] Provide Laria's razón social, RUC and domicilio fiscal, and replace `COMPLAINTS_BOOK_PROVIDER` in `lib/complaints-book.ts`.
- [ ] Confirm the answer term: "quince (15) días hábiles improrrogables" (Ley 29571, art. 24, as amended by Ley 31435; Reglamento as amended by D.S. 101-2022-PCM). Also confirm whether it applies to quejas as well as reclamos.
- [ ] Confirm the exact wording of the reclamo and queja definitions and of the two notes.
- [ ] Decide on the e-mail copy of the sheet to the consumer: whether it is required, and when.
- [ ] Decide the channel for the answer (e-mail only, or offer domicilio).
- [ ] Set the retention period for sheets. Nothing is deleted automatically today.
- [ ] Decide whether the book's icon or graphic notice must appear in the footer or on listing and store pages.
- [ ] Review the declaration and the privacy wording ("Laria usará estos datos solo para atender tu reclamo o queja"), and whether the Privacy policy needs a line for complaint data.
- [ ] Decide whether a minor needs more than the guardian's name, such as the guardian's document.
- [ ] Check whether a monthly or periodic report to Indecopi, or registration of the virtual book, is required.
