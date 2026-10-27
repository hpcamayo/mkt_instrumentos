# Feature ideas: store-locations batch

Ideas run-02 ("Sedes": a store with several shops) and run-03 ("Boleta electrónica" from Mostrador). Henri marked
both Yes on 2026-10-26. Wave 2. Branch `claude/project-thread-vqn8t0`, PR into `features/marketplace`.

Nothing here is applied to a hosted database, no test or seed ever calls Nubefact, and Laria still handles no money:
the store connects its own Nubefact account, pays Nubefact itself and is the issuer of every comprobante. Proposed
decisions are numbered FD-store-locations-n. Acceptance proposals are in `store-locations-acceptance.tsv` (GROW-800
to GROW-829, Not Run).

## Migrations (slot 20261209)

| File | What | Redefines |
| --- | --- | --- |
| `20261209120000_feat_store_locations.sql` | `store_locations`, `store_location_stock`, `store_stock_transfers`, `location_id`/`location_split` on `store_stock_movements`, the allocation trigger, the commit-time check, owner and public functions | none |
| `20261209120100_feat_store_receipts.sql` | `store_einvoice_settings`, `store_receipts`, settings, prepare, void and result functions | none |

No shared function is redefined. Every existing stock path (Inventario, Mostrador, imports, purchase requests, undo,
Admin) keeps writing the store's total through `apply_stock_movement` / `apply_stock_correction` exactly as before. A
BEFORE INSERT trigger on `store_stock_movements` decides which sede each movement's units come from or go to, and a
deferred constraint trigger checks at commit that the sedes add up to the total. Lock order is unchanged
(idempotency key, then listing, then item); sede rows of an item are only written while the item is locked.

Suites: `tests/store-locations.sql`, `tests/store-receipts.sql`. Unit tests: `tests/store-locations.test.cjs`.

## run-02: Sedes

**What changed.** In Mi tienda → Sedes (`/mi-cuenta/tienda/sedes`) the owner adds up to 20 sedes: name, place
(region, city, district), address (shown publicly only when the owner ticks it), hours and whether buyers can pick up
there. The first sede becomes the main one and receives every unit the store has, so switching sedes on never changes a
total. Then:

- **Inventario** shows "Miraflores 3 · Centro de Lima 1" under each SKU's quantity. The SKU page has a "Stock por
  sede" card with "Contar" per sede and "Mover entre sedes"; movement history names the sede.
- **Mostrador** has a "Sede" select, remembered per device. Availability is capped by that sede and the sale's
  units come out of it. Offline sales keep their sede.
- **Stock por sede sheet** (on Sedes): download the inventory with one "Stock <sede>" column per sede, count, upload
  it back. Each filled cell is a count at that sede; blank cells are left alone; totals follow. Applied in requests of
  up to 200 SKU with their own keys, so a retry never counts twice. The inventory export also carries these columns.
- **Listing**: when the store has two or more active sedes and the listing has units, "Disponible en Miraflores y
  Centro de Lima", a "Ver sedes" list (place, hours, address when public) and an optional "¿Dónde lo recoges?"
  select. The chosen sede is added as a sentence to the WhatsApp message. Names only; per-sede quantities are never
  public.
- **Store page** lists the sedes with place, hours and the address when public.
- **Archiving** a sede moves its units to another sede first; archiving the last one switches sedes off and keeps the
  totals.

**Files.** `supabase/migrations/20261209120000_feat_store_locations.sql`, `lib/store-locations.ts`,
`lib/store-locations-server.ts`, `lib/inventory-actions.ts` (the `location_*` actions in a marked block),
`lib/inventory-counter.ts`, `components/store-locations/*`, `components/inventory/counter.tsx`,
`components/inventory/inventory-table.tsx`, `app/mi-cuenta/tienda/sedes/page.tsx`,
`app/mi-cuenta/tienda/inventario/page.tsx`, `app/mi-cuenta/tienda/inventario/[itemId]/page.tsx`,
`app/mi-cuenta/tienda/inventario/mostrador/page.tsx`, `app/api/store/inventory/export/route.ts`,
`app/mi-cuenta/tienda/page.tsx`, `app/tiendas/[slug]/page.tsx`, `app/instrumentos/[slug]/page.tsx`,
`lib/account-navigation.ts`.

- **FD-store-locations-1.** `quantity_on_hand` stays the store total and `store_location_stock` is the split. The
  alternative (the total becomes a sum of sede rows) would have meant redefining every stock function of four earlier
  batches.
- **FD-store-locations-2.** Movements that don't name a sede (imports, purchase requests, Admin, the inventory table's
  ±1, older clients): increases go to the main sede; decreases come from the main sede first and then from the others
  in their order. An undo reverses exactly the split of the movement it undoes.
- **FD-store-locations-3.** Transfers don't change the total, so they are not stock movements; they have their own
  append-only ledger (`store_stock_transfers`) with idempotency keys.
- **FD-store-locations-4.** A count at a sede is converted to a new store total (total + counted − at that sede); other
  sedes don't change.
- **FD-store-locations-5.** A Mostrador batch key is bound to one sede, so a retried sale can never land in another
  sede.
- **FD-store-locations-6.** The listing shows sede names only, and only with two or more active sedes; quantities per
  sede stay private.
- **FD-store-locations-7.** Pickup is a sentence in the WhatsApp message ("Quiero recogerlo en Miraflores."), not a
  reservation. The store confirms availability, as for any purchase request.
- **FD-store-locations-8.** Addresses are private by default; a sede's address is public only when the owner ticks
  "Mostrar la dirección". This matches the open decision on the review page (street address only when the store
  agrees).
- **FD-store-locations-9.** Limit 20 active sedes per store; names unique among active sedes.
- **FD-store-locations-10.** Map pins stay one per store (listing-details' map); sedes are not pinned yet.

## run-03: Boleta electrónica

**What changed.** In Mi tienda → Comprobantes (`/mi-cuenta/tienda/comprobantes`) a verified store connects its own
Nubefact account: it pastes the RUTA and TOKEN from Nubefact → API - Integración and picks its series (B001, F001 by
default), next numbers, IGV treatment (gravado, exonerado or inafecto) and whether Nubefact e-mails the PDF. Laria
checks the pair with Nubefact before saving, encrypts the token and never shows it again (only its last four
characters).

At **Mostrador**, a "Comprobante" box offers "Sin comprobante" (the default), "Boleta" or "Factura", the customer's
document (DNI, CE, pasaporte or RUC), name, fiscal address (factura) and e-mail, and "Cambiar el precio cobrado" per
SKU. "Registrar venta y emitir boleta" records the sale and then issues the comprobante. The outcome shows the status,
"Ver PDF", "Enviar por WhatsApp al celular" (a wa.me link with the PDF link written) and "Reintentar envío" when
Nubefact could not be reached. Comprobantes lists everything issued with "Reintentar" and "Anular" (comunicación de
baja, up to 7 days).

**Files.** `supabase/migrations/20261209120100_feat_store_receipts.sql`, `lib/einvoice/nubefact.ts` (payloads and
answers, pure), `lib/einvoice/secret.ts` (AES-256-GCM sealing), `lib/einvoice/server.ts` (the only code that calls
Nubefact), `lib/einvoice/errors.ts`, `lib/einvoice/client.ts`, `app/api/store/receipts/route.ts`,
`components/einvoice/*`, `app/mi-cuenta/tienda/comprobantes/page.tsx`, `components/inventory/counter.tsx`.

- **FD-store-locations-11.** The provider is Nubefact (JSON API v1). One provider keeps the setup to two fields; the
  table has a `provider` column for more later.
- **FD-store-locations-12.** The feature is off, and the route answers 503 `EINVOICE_OFF`, until `LARIA_EINVOICE_KEY`
  (32 bytes, base64 or hex) is set. Disconnecting still works without it.
- **FD-store-locations-13.** The token is sealed with AES-256-GCM using `LARIA_EINVOICE_KEY` and the store id as
  associated data, so a ciphertext copied to another store doesn't open. Only the service role can read the column.
- **FD-store-locations-14.** The owner's session prepares the receipt (`prepare_store_receipt`): it checks the sale
  (the Mostrador batch, matched by exact movement keys), validates DNI (8 digits), RUC (11 digits starting 10, 15, 17
  or 20), factura (RUC and razón social required) and boletas from S/ 700 (document and name required), and takes the
  next number under a row lock on the settings row, so two receipts never share a number. One receipt per sale.
- **FD-store-locations-15.** Only the server with the service role records what Nubefact answered
  (`record_store_receipt_result`), so no browser can mark a receipt "aceptada". Only https links are kept. An accepted
  or voided receipt is never downgraded.
- **FD-store-locations-16.** When Nubefact says the number already exists, or the call times out (20 s), Laria looks
  the document up before anything else, so a retry never issues twice.
- **FD-store-locations-17.** Prices are IGV-included, as on Laria; the payload splits base and IGV (18 %) per line
  when the store is gravado.
- **FD-store-locations-18.** Voiding is a comunicación de baja through Nubefact, up to 7 days after the issue date. It
  doesn't change stock; a returned item is recorded as a return in Inventario. No credit notes yet.
- **FD-store-locations-19.** Receipts are issued after the sale is recorded, never before. If the sale is undone the
  receipt stays, and the undo message says to void it in Comprobantes.
- **FD-store-locations-20.** Offline sales keep their receipt request and issue it when the sale goes through.

## Changes to other batches' and shared files

- `components/inventory/counter.tsx` (Store Operations, deal-trust): new optional props `locations`, `locationStock`,
  `receipts`; a Sede select; the Comprobante box; the outcome. Merged with deal-trust's `storeName` and customer code
  (both kept).
- `lib/inventory-counter.ts`: `QueuedSale` gains optional `location_id` and `receipt`; `saleRequest(sale)`.
- `components/inventory/inventory-table.tsx`: optional `locationLines` prop (one line under the quantity).
- `app/mi-cuenta/tienda/inventario/[itemId]/page.tsx`, `.../inventario/page.tsx`, `.../mostrador/page.tsx`,
  `app/api/store/inventory/export/route.ts`, `app/mi-cuenta/tienda/page.tsx`, `app/tiendas/[slug]/page.tsx`,
  `app/instrumentos/[slug]/page.tsx`, `lib/account-navigation.ts`: one component or a few lines each, marked
  "store-locations".
- The pickup sentence goes through listing-details' quick-question store (`components/listing/contact-state.ts`)
  unchanged.

## Environment

- `LARIA_EINVOICE_KEY`: 32 random bytes, base64 or hex (`openssl rand -base64 32`). Without it receipts stay off.
  Changing it makes every saved token unreadable; stores would reconnect.
- `SUPABASE_SERVICE_ROLE_KEY`: already set; used to read the sealed token and record results.
- No schedules.

## How to test

Local prototype (`scripts/prototype/README.md`): `bash scripts/prototype/start-docker-free.sh seed`, then
`psql "$PGURL" -f scripts/prototype/store-locations-seed.sql`, add
`LARIA_EINVOICE_KEY=ERERERERERERERERERERERERERERERERERERERERERE=` (local only) to `.env.local` and run `pnpm dev`. Sign
in as `demo-tienda@laria.test`.

1. Sedes: Miraflores (main) and Centro de Lima. Add a third, archive it.
2. Inventario: the sede line under Boss DS-1; open it, "Mover entre sedes", "Contar" in Centro.
3. Mostrador: choose Centro, add BOSS-DS1, check availability is Centro's. Choose Boleta and DNI to see the fields.
   Don't press "Registrar venta y emitir" against the seed's fake connection: it would try to reach Nubefact. Use a
   Nubefact demo account for that.
4. Comprobantes: an accepted boleta, a factura, a voided boleta and one with "Reintentar".
5. Signed out, `/instrumentos/demo-boss-ds-1`: "Disponible en Miraflores y Centro de Lima", "¿Dónde lo recoges?".
   `/tiendas/laria-demo-musica`: the sedes.

Screenshots and axe-core: `node scripts/prototype/store-locations-screens.cjs <dir>` (26 shots at 390 px and 1366 px
in `/mnt/project-files/feature-ideas/screens/store-locations/`, no WCAG 2.2 AA violations). The console errors there
are blocked external images and an existing hydration mismatch in Inventario's "Último movimiento" date (Node and
Chromium format the "p. m." space differently); neither comes from this batch.

## Limitations

- **Check the payload on a Nubefact demo account before any store uses it.** The payload follows Nubefact's published
  JSON API v1, but it was never sent to Nubefact from here (tests use a fake fetch). In particular the "clientes
  varios" document type ("-") and the rounding of IGV per line.
- Imports and the inventory table's ±1 still mean the store total; differences go to the main sede (FD-2). Per-sede
  uploads are on Sedes.
- Purchase requests (Solicitar compra) take units from the main sede first; the buyer's pickup choice is only text.
- No credit notes, no guías de remisión, no comprobantes for online sales (only Mostrador).
- One Nubefact connection per store; all sedes share the series.
- Map pins are per store, not per sede.

## Copy that needs legal review

- Comprobantes: "La cuenta, sus series y su costo son de tu tienda; Laria solo le envía las ventas que registras en el
  Mostrador." and "Lo emite tu tienda con su cuenta de Nubefact."
- The customer data kept with each receipt (document, name, address, e-mail) and for how long; the Privacy draft
  should say stores keep it for their tax records and Laria processes it on their behalf.
- Listing: "Lo agregamos a tu mensaje de WhatsApp. La tienda confirma la disponibilidad."
- Anular: "La anulación se comunica a SUNAT por Nubefact. No cambia el stock."
