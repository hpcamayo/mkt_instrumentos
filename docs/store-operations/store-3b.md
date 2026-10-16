# STORE-3b: publication from an import and the listing allowance

Status: implemented on branch `store-ops/store-3b-import-publish` (from `store-ops/store-3a-import-photos`), local
tests and a browser run on the local prototype green, **not applied to production and not accepted yet**. Acceptance,
the proposed `INV-040…049` and `IMP-030…049` cases and the independent review (design §17 item 5) wait for the final
review of the combined prototype. The design is [`design.md`](design.md) §7.7 and §10; D-1 is at its accepted default
(50 publications per store unless Admin grants more).

## What it adds

**Listing allowance (§10).**

- `laria_private.store_listing_allowance(store)` returns `coalesce(store_operation_settings.listing_allowance, 50)`.
  `enforce_store_inventory_cap()` is replaced and reads it **after** taking the existing per-store advisory lock.
  What counts is unchanged: `pending` and `approved` listings with the store's `store_id`. Inventory items, stock
  and staged import rows never count. The error text now carries the store's own number:
  `STORE_INVENTORY_LIMIT_REACHED: La tienda ya tiene N publicaciones concurrentes.`
- `public.get_store_listing_quota(p_store_id default null)` returns `{allowance, used, remaining, is_default}` for
  the caller's own store, or any store for an Admin.
- `public.admin_set_store_listing_allowance(p_store_id, p_allowance, p_reason)`: Admin only, 1–2000, reason of 3–280
  characters. It locks the store row and the same advisory lock, upserts the setting, and writes
  `record_admin_audit('store_listing_allowance_changed', …)` with `from`, `to`, `reason` and `used` when the value
  changes. Lowering below the current count is allowed and hides nothing.
- The UI reads the allowance instead of the literal 50: the Publicar gate (`app/mi-cuenta/tienda/publicar`), the
  inventory meta line (`app/mi-cuenta/tienda/inventario`) and the limit messages of the submission and restore routes
  (`lib/store-allowance.ts`).
- Admin → Tiendas has a "Cupo de publicaciones" form on each store (`components/admin-store-allowance.tsx`).

**Publication from an import (§7.7).**

- `laria_private.insert_store_listing(id, store, fields, photos)` is the store-listing body extracted from
  `complete_public_submission`. The form path now calls it, so the form and the import share one implementation.
  It takes an optional `inventory_item_id` and links the new listing to that SKU through the STORE-1a
  `link_new_store_listing` path.
- `public.publish_store_import_rows(owner, session, rows, rules_accepted)`, service role only, publishes ≤ 20 rows
  per call. It re-checks ownership, the import state, inventory write access and store eligibility, takes the
  allowance lock once, and handles each row in its own subtransaction. Price comes from the SKU, photos from the
  row's validated import photos (§8), contact data from the store. A row that fails rolls back alone and gets a
  Spanish reason. A row over the allowance gets "Sin cupo de publicaciones." Already published rows return their
  listing and create nothing (retry is idempotent).
- `store_import_rows` gains `publish_status` (`published` / `failed` / `no_quota`), `publish_message`,
  `published_listing_id` (unique) and `published_at`; `store_import_sessions` gains `publish_counts`.
- `GET/POST /api/store/imports/[id]/publication`. GET lists every applied row with what it still needs; POST takes
  `{rows, rulesAccepted}`, re-parses each row's staged cells with the confirmed columns, validates them with the
  publish form's rules (`lib/store-import/publication.ts`) and calls the RPC, retrying once on a serialization error.
- A "Publicar en Laria" section on the import result page (`components/store-import/import-publish.tsx`): allowance
  line, a note on what happens for this store (verified: direct; Tienda: review; store pending: private), filters
  (Listas / Faltan datos / Publicadas o vinculadas / Todas), "Seleccionar las listas", a warning when the selection
  is over the allowance, the marketplace rules checkbox, and "Publicar seleccionados (N)" sent in chunks of 20 with
  progress and a summary.

## Defaults taken (no owner question asked)

1. **Publishing is a service-role function called by the route**, the same trust model as
   `complete_public_submission`. Staged cells are owner-written, and attribute values need the TypeScript
   validators the publish form uses, so the route validates the fields; the database decides ownership, price,
   photos, contact data, allowance and the publication requirements.
2. **Every imported row must meet the publish requirements**, also for a non-verified Tienda whose rows go to
   review. A half-filled row is "Faltan datos", not a weak listing in the Admin queue.
3. **Instrument type**: from the `Tipo de instrumento` column, or from the category when it has exactly one specific
   type (Pedales → pedal, Bajos → bajo…). Otherwise the row asks for it.
4. **Title** = SKU name, plus " - variant" when the name does not already contain it, 140 characters at most.
5. **Price** is the SKU's current price, not the cell; a SKU without price is "Faltan datos: precio".
6. **Attributes**: values Laria recognizes (by label or value, sí/no for yes/no, lists split on `;`, `,`, `/`) are
   published; unknown values or columns are dropped with a warning and never block publishing.
7. **Where**: a section on the import result page, not a seventh wizard step, so it is reachable later from the same
   import until it is purged (30 days, §7.9). After the purge the section says to publish from Inventario.
8. **Rules acceptance** is required on every publish, with the sell form's wording.
9. **Allowance**: default 50, Admin range 1–2000; lowering hides nothing; rows over the allowance get "Sin cupo".
   The section warns before sending but the database decides.
10. **Photos**: a published listing keeps its photos even when the import is purged (3a's guard); a photo already
    used by any listing cannot be reused by another row. Unused photos are still kept until the purge (3a default).
11. **`created_by_source`** stays `self_service`, like the form; the import link is `store_import_rows.published_listing_id`.
12. **Alt text** is "Foto de {title}" for every photo.
13. **Admin form** added (the design names only the RPC), since without it the allowance can only change in SQL.

## Where it differs from the design, and why

- §10 says the UI reads the allowance in `inventario/page.tsx` and the Publicar gate. Both are done here, but
  STORE-1b rewrites `inventario/page.tsx` on its own branch (see notes for the combined prototype).
- §7.7 lists "condition, category/type" as required; here condition, category, type, brand, model, a 40-character
  description and 2–10 photos are all required, matching the publish form exactly.
- §7.7 describes the step as part of the import loop (§7.3 "loop step again … for publication"). Publication here is
  a separate request per chunk of 20 rows, driven by the open page like the rest of the import, without a session
  state of its own: an import stays `committed` and records `publish_counts`.

## How to test

```bash
pnpm test                                   # includes tests/store-ops-3b.test.cjs (10 cases)
npx tsc --noEmit && pnpm lint && pnpm build
bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh reset
bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh test   # includes tests/store-ops-3b.sql
```

`tests/store-ops-3b.sql` (rolled back) covers anonymous and owner boundaries, the default of 50, Admin validation and
audit, the trigger at an allowance of 2 with the exact message, restore of a hidden listing refused at the limit,
lowering hiding nothing; publication closed before commit, request validation, two rows published on a verified
store (approved, stock state, price from the SKU, contact data, slug, photos, alt text, alerts), rows failing on one
photo, no price and a missing brand, an unknown row, counts; idempotent retry, a fixed row publishing, a used photo
refused for another row, the purge keeping used photos and discarding unused ones, publish closed after the purge; a
non-verified store going to `pending`, `no_quota` and publishing after a raise; a pending store's rows staying
private, and a hidden store becoming read-only; and the form path of `complete_public_submission` unchanged.
All earlier suites (1a, 2, 3a, Sprint 4 submissions) pass with the redefined function.

Browser run (local prototype from `store-ops/prototype`, not committed here), as `demo-tienda@laria.test`: the demo
CSV and its six photos, through review, photos and confirm. The result page showed "8 de 50 en uso", "Listas (1)"
(Fender Mustang LT25), "Faltan datos (2)" (drumsticks with one photo; the strap without category and
photos) and two rows "Ya tiene publicación". Selecting the ready row, accepting the rules and "Publicar seleccionados
(1)" created an approved listing with 2 photos and price 899 (now "9 de 50"), and its public page answered 200. At 390 px the
section stacks with no horizontal scroll. As `admin@laria.test`, Admin → Tiendas → Cupo de publicaciones saved 120
with a reason and showed "120 (9 en uso)".

## Rollback

To stop publishing from imports, revoke `execute` on `publish_store_import_rows` from `service_role` (the section then
shows an error). To undo fully: drop the publication route and section, drop `publish_store_import_rows` and its
helpers and the new `store_import_rows`/`store_import_sessions` columns (published listings stay, as ordinary
listings linked to their SKU), restore the 3a/Sprint 4 `complete_public_submission` and drop
`insert_store_listing`, restore the `enforce_store_inventory_cap` with the literal 50, and drop the two allowance
RPCs and the Admin form. Stored `listing_allowance` values can stay; nothing reads them after that.

## Independent review (design §17, item 5: publication and quota)

1. **Allowance under concurrency** — `enforce_store_inventory_cap`: allowance read after
   `pg_advisory_xact_lock(hashtextextended(store_id::text, 0))`; `admin_set_store_listing_allowance` takes the same
   lock. Questions: can two publishes (form + import, two import chunks, restore + publish) pass the limit together;
   can a lowered allowance be read stale?
2. **Extraction of `insert_store_listing`** — compare the new `complete_public_submission` with the previous one.
   Question: is any check, default or status rule of the form path lost or changed (verified direct approval,
   pending store privacy, photo count, contact data)?
3. **`publish_store_import_rows`** — service role with an explicit owner. Questions: can an owner publish another
   store's SKU, a row of another import, an archived or already linked SKU, or set price, store or contact through
   `fields`; does each row's subtransaction roll back everything it did; are 40001/40P01 re-raised so the route
   retries and never half-applies?
4. **Photos** — each URL must pass `import_photo_url_is_valid(url, owner, store, session)` and not be referenced by
   another listing; the 3a guard also runs. Question: can a row publish a photo of another row that is already in a
   listing, or one that is discarded?
5. **Route validation** — `lib/store-import/publication-server.ts`: fields are rebuilt from `raw` with the confirmed
   mapping, never from `parsed`. Question: can a crafted staged cell produce attributes or text the publish form
   would refuse?
6. **Moderation load (D-1)** — a Tienda can put up to its allowance in the Admin queue at once; worth a look before
   granting pilot stores 500.

### Codex result (2026-10-16)

Codex reviewed this item on PR #12 at `2524829`. Every finding below was reproduced locally and fixed on
`store-ops/review-fixes-core` with a regression test; details and defaults are in [`review-fixes.md`](review-fixes.md).

- Finding 1: publication could deadlock with an inventory write (store `FOR UPDATE` against the ledger's `KEY SHARE`).
  Fixed in `d216841`; the harness's "stock versus publication" and "price versus publication" cases deadlocked
  before it.
- Finding 2: photo exclusivity was checked without an atomic claim. Fixed in `d216841` (the asset row is locked in the
  shared attachment guard, then a photo another listing uses is refused); harness case "photo: publication versus
  edit".
- Answers 1 to 6 found no other issue; the moderation-load note (D-1) stands.

## Acceptance proposal (not in `acceptance/cases.tsv`)

Proposed cases for Henri's review; added to `acceptance/cases.tsv` only after it.

| Proposed ID | Requirement | Expected | Automated evidence |
| --- | --- | --- | --- |
| INV-040 | Allowance defaults to 50 | A store with no setting can hold 50 pending + approved publications | `store-ops-3b.sql` default |
| INV-041 | The limit uses the store's own allowance | At allowance N, publication N+1 is refused with "N publicaciones" | `store-ops-3b.sql` trigger |
| INV-042 | What counts is unchanged | Inventory items, stock, staged rows, rejected or hidden listings never count | `store-ops-3b.sql` trigger |
| INV-043 | Only Admin changes the allowance | Owners and anonymous visitors refused | `store-ops-3b.sql` boundaries |
| INV-044 | A reason is required, 1–2000 | Missing reason or out of range refused | `store-ops-3b.sql` Admin validation |
| INV-045 | Every change is audited | Audit entry with before, after, reason and count in use | `store-ops-3b.sql` audit; browser run |
| INV-046 | Lowering hides nothing | Current publications stay; only new ones are refused | `store-ops-3b.sql` lowering |
| INV-047 | Restore respects the allowance | Restoring a hidden listing at the limit is refused | `store-ops-3b.sql` restore |
| INV-048 | Screens show the store's allowance | Publicar gate, inventory line and limit messages use the number | browser run; `store-ops-3b.test.cjs` message |
| INV-049 | Owners see their own allowance only | Quota of another store refused; Admin sees any | `store-ops-3b.sql` boundaries |
| IMP-030 | Publishing is a separate explicit step | Nothing is published by confirming an import | `store-ops-3b.sql`; browser run |
| IMP-031 | Only after the import is confirmed, until purged | Before commit or after purge: closed with a reason | `store-ops-3b.sql` closed |
| IMP-032 | Only the import's owner publishes its rows | Other owners and unknown rows refused | `store-ops-3b.sql` boundaries |
| IMP-033 | At most 20 rows per request | 0 or 21 rows refused | `store-ops-3b.sql`; `store-ops-3b.test.cjs` parser |
| IMP-034 | Marketplace rules accepted on each publish | Without acceptance: refused | `store-ops-3b.sql`; route |
| IMP-035 | Rows meet the publish form's requirements | Missing fields reported in Spanish, row not published | `store-ops-3b.test.cjs` plan; `store-ops-3b.sql` brand |
| IMP-036 | 2–10 validated photos from the import | One photo: not published | `store-ops-3b.sql` row 4 |
| IMP-037 | Price comes from the SKU | No price: not published; published price equals the SKU | `store-ops-3b.sql` |
| IMP-038 | Contact data comes from the store | Listing carries the store's WhatsApp and location | `store-ops-3b.sql` |
| IMP-039 | The listing is linked to its SKU | Inventory shows it; stock state set; restock alerts as 1a | `store-ops-3b.sql` link |
| IMP-040 | Verified active store publishes directly | Status approved | `store-ops-3b.sql`; browser run |
| IMP-041 | Other Tiendas go to review | Status pending, in the Admin queue | `store-ops-3b.sql` store B |
| IMP-042 | A store in review publishes privately | Pending and not public until the store is approved | `store-ops-3b.sql` store C |
| IMP-043 | Over the allowance: "Sin cupo" | Those rows stay unpublished; the rest publish | `store-ops-3b.sql` no_quota |
| IMP-044 | A failing row does not stop the others | Its reason is shown; other rows publish | `store-ops-3b.sql` |
| IMP-045 | Retrying is safe | An already published row creates nothing new | `store-ops-3b.sql` retry |
| IMP-046 | A photo is used by one listing only | Reusing a published photo for another row refused | `store-ops-3b.sql` reuse |
| IMP-047 | Linked or archived SKUs are not published | "Ya tiene publicación" / not available | `store-ops-3b.sql` |
| IMP-048 | Published photos survive the purge | Listing photos still served; unused photos removed | `store-ops-3b.sql` purge |
| IMP-049 | The form path is unchanged | Publishing from the sell form behaves as before | `store-ops-3b.sql` regression; Sprint 4 suites |

## Notes for the combined prototype

- **Merge conflict expected with STORE-1b** in `app/mi-cuenta/tienda/inventario/page.tsx` and
  `app/mi-cuenta/tienda/publicar/page.tsx`: 1b rewrites them, 3b replaces the literal 50. Keep 1b's screens and call
  `getStoreListingQuota(supabase, used)` from `lib/store-allowance.ts` where they show or gate on 50.
- 1b's inventory screens could link SKUs without a publication to their import's result page ("Publicar en Laria");
  not added here because 1b's code is on another branch.
- `lib/database.types.ts` is not regenerated; the new RPCs are called untyped like 2 and 3a.
- New acceptance IDs (`INV-040…049`, `IMP-030…049`) are proposals only; `acceptance/*.tsv`, `docs/database.md`,
  `docs/functional-spec.md` and `docs/decisions.md` are untouched.

## Known limitations

- No catalog autofill in publication (STORE-3c waits for the autofill code to reach `main`).
- A row can be published once per import. After unpublishing, publish again from the sell form or a new import.
- Editing the photo order on the import page after publishing does not change the listing.
- The Admin queue grows by the number published; no batch moderation tools are added here.
- The Admin confirmation appears at the top of the Tiendas page, not next to the form.
