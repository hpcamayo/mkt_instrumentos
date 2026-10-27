# Product and Engineering Decisions

This file records important decisions so future Codex sessions do not accidentally undo them.

`docs/functional-spec.md` is canonical for the frozen V1 product contract. This file preserves decision rationale and implementation history; where older planning language conflicts with the functional specification, the functional specification wins.

## Sprint 5 Global Navigation and In-App Price Drops

Sprint 5 owner navigation clarification (2026-09-18): marketplace logo, canonical catalog search and the shared category/subtype tree belong in the root site shell across public/auth/account/admin routes. The role-aware account sidebar/mobile menu remains nested. Search reuses the existing brand filter, not a new free-text engine. Sprint 5 price-drop delivery is in-app only; centralized email delivery remains Sprint 7. These changes were production-released on 2026-09-18; automated evidence is separate from owner usability acceptance.

## Marketplace First, Payments Later

Decision: Laria begins as a discovery marketplace with WhatsApp contact, not a transactional platform.

Why:
- Faster MVP.
- Lower legal/payment complexity.
- Sellers in Peru are already comfortable with WhatsApp.
- The main unknown is marketplace liquidity, not checkout infrastructure.

Do not add payments, checkout, escrow, delivery, commissions, subscriptions, or internal chat in V1. Reviews are included only through the verified Laria transaction workflow in `docs/functional-spec.md`.

## Two Seller Models

Decision: support two seller models from day one:
- `Particular`
- `Tienda`

Why:
- Individual sellers provide used gear inventory and market depth.
- Stores provide stable supply and future monetization.
- Stores need their own pages and catalogue-like presence.

## Store Monetization Comes Before Individual Commission

Decision: do not rely too early on commission from individual sellers.

Why:
- WhatsApp/cash transactions can bypass Laria.
- Commission enforcement is weak without payment control.
- Stores are more likely to pay for recurring visibility.

Future monetization priority:
1. Store plans.
2. Featured listings.
3. Featured stores.
4. Catalog services.
5. Transaction commission only later if payment control exists.

## Keep the MVP Simple

Decision: Laria remains a discovery and lead-generation marketplace without processing transactions. V1 nevertheless includes the identity, ownership, favorites, alerts, intent analytics, verified-transaction confirmation, transaction-bound reviews, and reports defined in the functional specification.

Why:
- It lets the product ship quickly.
- It avoids payment, shipping, dispute, tax, and support complexity.
- It matches current buyer/seller behavior.

## Admin Curation Matters

Decision: Particular and normal Tienda listings go through admin approval. Store pages require basic approval. Tienda Verificada inventory and edits can publish directly when they meet requirements.

Why:
- Trust is essential in used gear markets.
- Low-quality listings can quickly damage marketplace perception.
- Early-stage supply should be curated.

Current status model:
- Listings: `pending`, `approved`, `rejected`, `hidden`, `sold`.
- Stores: `pending`, `active`, `hidden`.

Only approved listings and active stores are public.

Frozen V1 lifecycle clarification:
- A sold listing is excluded from normal search but remains visible at its direct URL and is never reactivated; relisting creates a new record.
- Moderated changes preserve the old approved version while a revision is pending.
- Rejection and administrative hiding require an owner-visible reason.

## Use Supabase RLS Instead of a Custom Backend

Decision: public reads/inserts and admin updates are controlled primarily by Supabase RLS.

Why:
- Small team can understand and review SQL policies.
- Most public/admin access remains understandable through RLS and scoped RPCs.
- Supabase Auth can carry admin identity through JWT app metadata.

Tradeoff:
- Some actions, like view-count incrementing, need carefully scoped security-definer RPCs.
- Phase 2 adds a server-only service-role client for future invite/admin server actions. It must never be imported into client code.

## Phase 2 Account Ownership Is Additive

Decision: add `profiles`, `store_members`, and nullable ownership fields without breaking legacy listings or public store pages.

Why:
- Existing approved listings and active stores must remain visible.
- Legacy listings do not have Auth users yet, so `owner_user_id` stays nullable.
- Store approval continues to use the existing database value `stores.status='active'`.
- Admin moderation keeps working while account-aware seller/store flows are built.

Protected fields such as listing `status`, `published_at`, `view_count`, store `status`, `listing_plan`, and `is_verified` should only be changed by admins or controlled RPC/server logic.

## Supabase Auth Emails First

Decision: use Supabase Auth invite links and magic links for Phase 2 account onboarding before adding a custom email provider.

Why:
- It keeps the sprint focused on accounts and ownership.
- Supabase Auth already supports invite links and magic links.
- Seller/store-specific behavior can be routed through `account_type` metadata and `redirectTo` paths.

Current limitation:
- Supabase may only expose one built-in invite email template. If distinct seller/store invite bodies become important, add a custom email provider or custom server-side email flow later.

Frozen V1 clarification:
- Supabase Auth remains responsible for authentication messages.
- Marketplace lifecycle, transaction/review, search-alert, and price-drop messages use a centralized application email abstraction. Provider selection remains an implementation choice.

Implementation note:
- Admin-created invites are sent from a trusted server route, not from browser code.
- The route verifies `is_admin()` with the user's normal Supabase session before using the server-only service-role client.
- No temporary passwords are created.
- Invite links route through `/auth/callback?next=...` so the app can establish the session before the seller/store setup page.

## Duplicate Signup UX Uses A Server Precheck

Decision: seller signup checks for existing Auth emails before calling Supabase `signUp()`.

Why:
- Supabase can obfuscate repeated signup attempts and return a response that looks successful even when no confirmation email will be sent.
- Showing "check your email" for `user_repeated_signup` is confusing during field testing.
- `profiles` does not currently store email, and adding an email column is not required just for this UX fix.

Implementation:
- `/api/auth/check-email` uses the server-only service-role client to call a targeted normalized-email lookup.
- The endpoint returns only whether the normalized email is available; it does not expose user IDs or profile details.
- Existing emails show `Este correo ya está registrado. Ingresa con tu cuenta o usa otro correo.` with a link to `/login`.

Tradeoff:
- This intentionally reveals that an email is registered, which is acceptable for this marketplace onboarding flow. If abuse becomes a concern, add rate limiting or move to a less specific message.

## JSONB Attributes for Advanced Filters

Decision: use `listings.instrument_type` plus `listings.attributes jsonb`.

Why:
- Instruments have very different specs.
- Avoids dozens/hundreds of nullable columns.
- Allows each instrument group to have its own filter set.
- Easier to add new groups later.

Do not convert this to many columns unless there is a strong reason.

Frozen V1 submission behavior requires `instrument_type` where categories have meaningful subtypes and supports dynamic attributes. Attributes remain optional unless an explicit product rule marks selected fields required.

## Store Verification Is Operational Authority

Decision: `Tienda` and `Tienda Verificada` are the only public V1 store trust labels. Verification is manual and admin-only; it grants direct publication/edit authority, not merely a badge.

When verification is granted, pending inventory is approved automatically while rejected, hidden, and sold inventory keeps its state. Revocation removes future direct-publication authority without hiding already-approved listings. Free stores have a 50-concurrent-listing cap across `pending` and `approved`; no paid plan is active in V1.

## Verified Transactions Gate Reviews

Decision: reviews are two-way and exist only after a seller selects an authenticated buyer who contacted that specific listing through Laria and the buyer confirms the purchase. This does not verify payment, delivery, amount, or item condition.

Reviews use one submission per side, required 1–5 stars, optional text, double-blind release, and a 10-day window. Admin may hide reported abusive content but never rewrite it.

## URL-Driven Filters

Decision: use GET forms and query params rather than hidden client-only state.

Why:
- Filter URLs are shareable.
- Browser back/forward works naturally.
- Server-side Supabase queries remain the source of truth.
- Mobile and desktop UIs can share one filter model.

## Listing Card Titles Should Be Clean

Decision: card titles should prefer brand + model, not long descriptive sentences.

Use:

```text
Squier Stratocaster
```

Avoid:

```text
Guitarra electrica Squier Stratocaster usada
```

Why:
- Category and condition are metadata.
- Short titles make cards easier to scan.
- The marketplace feels more professional.

## Condition Belongs in Subtitle

Decision: condition should appear as subtitle/metadata.

Example:

```text
Usado · Buen estado
```

Why:
- Keeps title clean.
- Makes cards consistent.

## Instrument Type Appears as Image Tag

Decision: instrument type/category appears as a tag over the card image.

Why:
- Helps quick scanning.
- Saves text space.
- Makes the grid feel organized.

## Cards Should Not Show Published Date or Views

Decision: do not show `Publicado hace X dias` or `Visto X veces` in listing cards.

Show those on listing detail pages instead.

Why:
- Keeps cards compact.
- Avoids visual clutter.
- Detail page is the right place for secondary metadata.

## Load Only the First Photo on Listings Page

Decision: listing grids initially load/render only the first photo per listing.

Additional photos are fetched only when the user interacts with the card carousel.

Why:
- Better performance.
- Lower bandwidth.
- Faster listing grid.
- Avoids loading images users may never see.

## Use Public Storage Buckets

Decision: `listing-photos` and `store-assets` are public buckets.

Why:
- The MVP shows public listing/store images.
- It avoids signed URL management.
- Uploaded records remain hidden from normal browsing until the related listing/store is approved or active.

Tradeoff:
- Uploaded objects are public if someone knows the URL.
- Moderation relies on database visibility, not private object access.

## Manual Supabase SQL Migrations

Decision: schema changes are tracked in `supabase/migrations`, while production application can be manual SQL or Supabase CLI depending on project state.

Why:
- The owner currently has online Supabase access.
- SQL migrations remain reviewable in `supabase/migrations`.
- The Supabase CLI is now linked for this project, but earlier production schema changes were originally applied manually and migration history was repaired afterward.

Tradeoff:
- The owner/Codex must confirm migration history before applying schema changes.
- Vercel does not automatically run migrations.
- Old baseline migrations should not be replayed blindly against production.

## Use v0 Carefully

Decision: use v0 UI as a source of visual components, not as a replacement for business logic.

Why:
- v0 can improve presentation quickly.
- The existing app contains working Supabase, routing, and moderation logic.

Rule:
- Integrate one page at a time.
- Replace mock data with real data.
- Keep existing routes and backend logic unless explicitly changing them.

## Laria Visual System Is Canonical

Decision: the current Laria visual system is documented in `docs/design-system.md` and should guide future UI work.

Why:
- The UI has been refreshed around a light marketplace canvas, black header/footer, yellow Laria logo/major CTAs, and blue interface accents.
- Future UI work should extend the implemented system instead of starting a new visual direction.
- Visual tickets should not add product features or change Supabase/business logic unless explicitly requested.

## Separate Brands for Future Verticals

Decision: if this model expands to other niches, use separate brands/sites rather than forcing everything under Laria.

Examples:
- Musical instruments -> Laria.
- Audiovisual/camera gear -> separate brand.
- Professional tools -> separate brand.

Why:
- Each vertical has its own buyer psychology.
- Separate brands can speak each market's language.
- Stronger category dominance than a generic marketplace.

## Repo Documentation Is the Memory Layer

Decision: detailed `/docs` files are part of the product.

Why:
- Codex context resets/compacts over time.
- Future sessions must reconstruct product logic from the repo.
- Documentation prevents AI from undoing product/engineering decisions.

Every significant feature should update docs.

## Performance and retry handling

Catalog/store results are paginated, images use responsive Next Image delivery, and recommendation sections stream independently. Public submissions upload first and finalize atomically with a signed retry token; they still enter admin review. See `docs/performance.md`.

## Store inventory guards live in listing triggers

Decision (STORE-1a, 2026-10-15): the rule "a listing linked to inventory cannot become sold" and the price
write-through from a listing edit to its inventory item are `listings` triggers, not edits to
`set_owned_listing_lifecycle`, `review_listing` or `update_owned_listing`.

Why:
- One place covers the owner, Admin and every future path that changes a listing.
- The trigger runs after the listing row is locked, so the lock order stays listing → item everywhere.

## Inventory items soft-link catalog variants

Decision (STORE-1a, 2026-10-15): `store_inventory_items.catalog_product_id` is a foreign key (`on delete set null`);
`catalog_variant_id` is a plain uuid checked when it is written.

Why:
- The production catalog loader upserts products by stable id and never deletes them, but it deletes variants that a
  new build no longer has. A variant FK would make a catalog reload fail or silently change merchant data.


## Spreadsheet imports run as leased steps driven by the open page

Decision (STORE-2, 2026-10-15): an import is a session that the open import page advances with short `/step` calls.
Each call takes a 90-second lease, does bounded work for up to 20 seconds (stage 500 rows, plan 100, commit 50),
checkpoints and releases. Closing the page pauses at the last checkpoint.

Why:
- Vercel Hobby has no queue and short function limits; a 2,000-row file still finishes in seconds locally.
- The lease stops two tabs from processing one import, and each committed row has its own idempotency key, so a retried
  chunk never applies twice.

## XLSX is read with fflate and an own bounded reader

Decision (STORE-2, 2026-10-15): `lib/store-import/xlsx-read.ts` inflates only allowlisted parts through `fflate`'s
streaming API with a 40 MB total and 100:1 per-part budget, refuses macros, `.xls`, DTDs and entities, and never
evaluates formulas. No SheetJS or ExcelJS.

Why: only a streaming reader bounds decompression before the bytes exist; merchant files are untrusted.

## One CSV writer for merchant files

Decision (combined prototype, 2026-10-15): the inventory export, the import template and the import report all write
CSV through `lib/spreadsheet/csv-write.ts`: formula-like text gets a leading apostrophe, numbers stay numbers, fields
with `,`, `;`, quotes or line breaks are quoted, UTF-8 BOM and CRLF.

Why: STORE-1b and STORE-2 each had a copy with slightly different quoting (only one quoted `;`, which Excel with a
Spanish locale treats as a separator). One writer keeps the formula guard in one place for review.

## Assisted commerce is one deployment switch

Decision (PAY-1, 2026-10-15): every buyer- and store-facing payment surface is behind `LARIA_ASSISTED_COMMERCE=1`
(off by default). The Admin review page works either way.

Why: the Terms and Privacy additions need legal review before any store shows payment methods; the Admin approval per
method is already the per-store gate.

## A purchase request is a WhatsApp contact with an intent

Decision (PAY-1, 2026-10-15): "Solicitar compra" records `whatsapp_contact` with metadata `{"intent":"purchase"}`
instead of a new event type.

Why: Sprint 6 uses `whatsapp_contact` to decide who may be named as buyer in a sale claim; a new type would make
purchase-request buyers ineligible, and contact counts stay comparable.

## Store listings are inserted by one function

Decision (STORE-3b, 2026-10-15): the store-listing body of `complete_public_submission` became
`laria_private.insert_store_listing`, called by both the sell form and import publication.

Why: one implementation keeps verified direct approval, pending-store privacy, photo rules, contact data and the
allowance check identical for both paths. The Sprint 4 submission suites and `store-ops-3b.sql` run the form path
unchanged.

## The listing allowance is read inside the cap lock

Decision (STORE-3b, 2026-10-15): `enforce_store_inventory_cap()` reads the store's allowance after taking the existing
per-store advisory lock, and `admin_set_store_listing_allowance` takes the same lock.

Why: two publishes (form, import chunks, restore) cannot pass the limit together, and a lowered allowance is never read
stale.

## Effortless Laria: proposed decisions (2026-10-19)

These are the decisions taken while building the owner-approved UX ideas of the Effortless Laria program, and they remain proposals until the owner reviews the combined prototype. Each line gives the decision in short; the batch write-up in `docs/ux-effortless/` has the reasoning, files and limits. Where a decision replaces an earlier owner decision, its line says which.

### Find and browse (find)

Detail: [docs/ux-effortless/find.md](ux-effortless/find.md).

- UXD-find-1: The catalog has one free-text search parameter, `q`, matched in Postgres (folding, curated synonyms, trigram similarity), and `brand` stays as a filter (big-03; supersedes N8's brand-only search).
- UXD-find-2: A plain search phrase becomes filters through one redirect, and the remainder stays as `q` (big-03).
- UXD-find-3: Searching from the catalog or a category page keeps the current filters, and "Buscar en todo el catálogo" escapes them (find-01).
- UXD-find-4: Filter options show counts computed without their own facet, and empty options are dimmed, not hidden (find-07).
- UXD-find-5: Locations come from listings and group into five zones, and cards show the store's district (find-05).
- UXD-find-6: Menus and landings offer only brands, types and categories with listings, and when the counts fail they fall back to showing all (find-06).
- UXD-find-7: The catalog gets two new sorts, "Bajaron de precio" (30 days) and "Tiendas verificadas primero" (find-10).
- UXD-find-8: Personal signals (recently viewed, taste, "¿Qué tocas?", comparison, last visit, results trail) stay on the device, and each surface says so and can be cleared. The last visit is the accounts batch's first-party cookie, which the browser sends with each request and which Favoritos and Alertas read on the server (UXD-accounts-6, UXD-integration-9).
- UXD-find-9: The home leads with instruments, and the vitrina and the category tiles are retired (big-01; replaces H1's "B Vitrina" and H2's automatic vitrina).
- UXD-find-10: "Para ti" never shows two listings of the same seller in a row, and the server exposes only a hashed seller key (big-01).
- UXD-find-11: Phones use "Ver 24 más", while numbered pages remain in the HTML for search engines (find-15).
- UXD-find-12: A listing opened from the results offers "Volver a resultados" plus previous and next (find-09).
- UXD-find-13: The comparison holds up to three public listings, picked from cards on desktop and from favorites on phones, and `/comparar` is noindex (find-12).
- UXD-find-14: A gone listing's page reveals only that it is gone and its type, with live similar listings (find-16).
- UXD-find-15: Search alerts can keep the text query, compared without case (big-03).
- UXD-find-16: The search placeholder is "Busca guitarras, marcas, modelos…" and its label is "Buscar en el catálogo" (big-03; replaces N8's "Busca por marca: Yamaha, Fender…", since search now matches more than brands).

### Listing page and WhatsApp (listing)

Detail: [docs/ux-effortless/listing.md](ux-effortless/listing.md).

- UXD-listing-1: Store listings use the store's current WhatsApp number, unsold listings' stored copy follows the store while sold ones keep theirs (fix-03), and wa.me links add 51 to 9-digit mobiles.
- UXD-listing-2: A sold listing's "Publicaciones similares" stays as a one-line pointer to the catalog when nothing similar is public (fix-09; an exception to L12, which leaves empty sections out, for sold listings only).
- UXD-listing-3: The listing page states the payment limitation once, as the line under the contact button with "Cómo comprar seguro", and TrustNote leaves the listing page (list-02).
- UXD-listing-4: A price drop is public ("Antes") for 30 days only when the listing is approved, the drop is at least 5% and the old price had stood 7 days (list-05).
- UXD-listing-5: The seller card shows only facts Laria records (activity bucket, confirmed sales, member age, confirmed e-mail; verified stores' checked RUC, razón social, address, the street only where the store shows it per UXD-integration-11), never reply times (list-10, trust-03; showing confirmed sales replaces L20, "no public confirmed-sales count").
- UXD-listing-6: The WhatsApp opening message carries title, price and link, and quick questions are optional, never preselected (talk-01, talk-02).
- UXD-listing-7: Contact opens WhatsApp at once, recording is fire-and-forget, and a one-time safety sheet precedes contacts from S/ 1,000 and every purchase request (talk-03, talk-04).
- UXD-listing-8: Public Q&A on listings (big-11) is allowed in V1 (public, one answer, contact details filtered, reportable and hideable by Admin), and it is not private messaging.
- UXD-listing-9: Back-in-stock alerts are opt-in per listing, fire once and end, and sold listings offer a similar-listings search alert instead (list-11).
- UXD-listing-10: The listing page offers "Compartir" again (reverses UX-4 L8), with generated link previews and a story image for public listings only (list-08, list-09).

### Accounts, saving and alerts (accounts)

Detail: [docs/ux-effortless/accounts.md](ux-effortless/accounts.md).

- UXD-accounts-1: WhatsApp numbers are stored as digits with the country code, nine-digit Peruvian mobiles get 51 added on every write, and stored numbers are corrected once (fix-01).
- UXD-accounts-2: Signing in with a correct password before confirming the e-mail says so and offers to resend the link, with 60 seconds between sends (fix-08).
- UXD-accounts-3: Visitors save favorites on the device, and signing in merges them into the account (big-04).
- UXD-accounts-4: An action interrupted by sign-in is finished on return, for up to one hour and only once (save-01).
- UXD-accounts-5: `next` survives sign-in, sign-up and the confirmation e-mail, and the header's "Ingresar" sets it (save-02).
- UXD-accounts-6: "New since your last visit" uses a first-party cookie and a 30-minute visit gap (save-04).
- UXD-accounts-7: Alerts can be renamed, switch frequency and hold several values per filter, and daily is the default (save-05).
- UXD-accounts-8: The repeat-search prompt appears from the second occasion of a search and never again for that search once declined (save-06).
- UXD-accounts-9: Optional e-mails carry signed one-click links and RFC 8058 headers, and a GET never changes state (save-07).
- UXD-accounts-10: Favorites are alerted on drops of 5% or more, at most once a day per listing (save-08).
- UXD-accounts-11: Shared lists are revocable, unguessable links showing only public listings and the first name (save-11).
- UXD-accounts-12: Follows cover stores and brands, and the weekly digest is opt-in (save-12).
- UXD-accounts-13: Passwords have one minimum of 8 characters everywhere and a show/hide eye on every field (auth-01).
- UXD-accounts-14: A Particular account needs only name, e-mail and password, and contact details come at publishing (auth-02).

### Selling (selling)

Detail: [docs/ux-effortless/selling.md](ux-effortless/selling.md).

- UXD-selling-1: Every listing photo is stored as JPEG, and transparent PNG areas become white, as in the store import (fix-02).
- UXD-selling-2: For "Publicar el siguiente SKU sin publicación", the next SKU is the first active, unlinked SKU by SKU code (fix-05).
- UXD-selling-3: The seller's contact and store notice stay at the top of step 1, so who publishes is clear before the first photo (big-06).
- UXD-selling-4: Drafts get their own owner-only table, not `listings.status = 'draft'`, so no listing reader, allowance or moderation query has to learn to skip them (post-01, post-02).
- UXD-selling-5: A draft's id is its submission id, and resuming re-signs a token for that id, so its photos stay where they are (post-01, post-02).
- UXD-selling-6: A seller can keep at most 20 drafts (post-01, post-02).
- UXD-selling-7: A photo slot is never reused within a submission (a replacement is a new file), so no upload overwrites a photo another device still shows, and unused files are removed at completion (post-03, post-04).
- UXD-selling-8: The usual review wait is the median for Particular listings published in the last 60 days and is shown only when there are at least 20 of them; otherwise nothing is promised (post-14).
- UXD-selling-9: The live-listing confirmation has no exclamation marks, per the copy rules (`tests/ux-copy.test.cjs`), and no confetti (post-15).
- UXD-selling-10: A sound clip's row is readable exactly when its listing is (its policy reads `listings` under the caller's RLS), and only Admins delete it (post-16).
- UXD-selling-11: A store listing's location is the store's and is shown read-only on the sell form (shop-06).

### My listings, sales and reviews (my-listings)

Detail: [docs/ux-effortless/my-listings.md](ux-effortless/my-listings.md).

- UXD-my-listings-1: The account home opens on Pendientes, not metrics, and metrics move to Estadísticas (big-09; supersedes U16, "Resumen is not turned into a to-do list").
- UXD-my-listings-2: A buyer's "Sí, lo compré" from a check-in plus the seller's one-tap confirmation is a verified transaction, with no second buyer confirmation (big-08).
- UXD-my-listings-3: Check-ins (purchase and availability) are skipped for stock-managed store listings, whose sales go through Inventario (big-08, mine-08).
- UXD-my-listings-4: "Sí, sigue disponible" records the date and resets the 30-day clock, the first-publication date never changes, and the listing shows "Quien vende confirmó que sigue disponible el …" for 30 days (mine-08).
- UXD-my-listings-5: "Lo vendí, retirar" archives a pending, draft or rejected listing with a sold date, and it never becomes public (mine-07).
- UXD-my-listings-6: Republicar and Duplicar create a draft opened in the edit form and sent with the usual submission (mine-10, shop-08; replaces the direct relist copy).
- UXD-my-listings-7: Vacation mode is all-or-nothing per account, runs until a date from tomorrow to 90 days ahead, keeps listings public with "Vuelve el …" and contact off, and ends by itself (mine-12).
- UXD-my-listings-8: Rejections use ten fixed reasons plus an optional note (required when no reason is picked), stored as codes and as readable text (mine-03).
- UXD-my-listings-9: Particular statistics offer 7, 30 and 90 days (lifetime totals stay below), and tips are at most two per listing, plain and rule-based (mine-11).
- UXD-my-listings-10: Reminders are sent at most once per key (dedupe table) by one daily job at 14:00 UTC (09:00 Lima), and never for anything the person already answered (trust-01).
- UXD-my-listings-11: No buyer is pre-selected when a seller attributes a sale (mine-09).
- UXD-my-listings-12: The closing panel reads "Que lo disfrutes" without exclamation marks (trust-04).
- UXD-my-listings-13: The store checklist shows until every step is done, then disappears, and "Medios de pago" is a step only while the payments pilot is on (shop-02).

### Store profile, storefront and import (stores)

Detail: [docs/ux-effortless/stores.md](ux-effortless/stores.md).

- UXD-stores-1: The import asks "¿Qué actualiza este archivo en los SKU que ya tienes?" only when the file has both a stock and a price column, and no answer is preselected (fix-04).
- UXD-stores-2: Stale stock is detected only in files that carry "Exportado el" (a Laria export), since a store's own POS file is a fresh count and applies as before (fix-04).
- UXD-stores-3: "Usar el stock del archivo" is one choice for the whole file, not per row, and a store that recounted only some SKU can exclude the others in the review (fix-04).
- UXD-stores-4: Under "Precios", a stock cell for a new SKU is still its opening stock, since a new SKU has no history to undo (fix-04).
- UXD-stores-5: The application prefill fills only empty fields of a new application, and nothing is saved until the owner sends the form (shop-01).
- UXD-stores-6: The RUC confirmation appears only when a payment method would actually go back to review (approved or pending), and otherwise the inline warning is enough (shop-03).
- UXD-stores-7: "Ocultarlas" acts only on listings linked to an inventory SKU marked out of stock, since a store without inventory has no "Agotado" state to act on (shop-05).
- UXD-stores-8: A "Pedir más cupo" request changes nothing by itself, and Admin still sets the allowance with an audited reason (shop-05).
- UXD-stores-9: Correcting an import cell on the page re-plans only the edited row and duplicate rows, not the whole file, and other rows keep the plan they had (stock-12).
- UXD-stores-10: "Publicar seleccionados" takes at most 200 SKU per batch (the store's listing allowance is far lower, and each new publication goes to review), and like an import a batch's staged rows are purged 30 days after it is created (stock-10).
- UXD-stores-20: The directory lists all active stores (Tienda and Tienda verificada), verified first, then by name, and the entry keeps the label "Tiendas verificadas", though the owner may prefer "Tiendas" (find-13; replaces N7, where "Tiendas verificadas" opened the catalog filtered to verified stores because no directory existed).
- UXD-stores-21: The directory's city chips (not grouped sections) are ordered by number of stores, then alphabetically, and shown only with two cities or more (find-13).
- UXD-stores-22: The directory's listings tab has no filters or sort of its own and links to the catalog's verified-store filter, which has them all (find-13).
- UXD-stores-23: Every store page's breadcrumb goes through "Tiendas" (find-13; replaces L19's per-type trail).
- UXD-stores-24: The directory card shows the rating only with visible reviews and always "N publicaciones" (find-13; Q18/F12 kept stats off the home tiles, and the directory is where they now appear).
- UXD-stores-25: The store page reads only `category`, `brand` and `sort` (the catalog's names) and ignores other catalog parameters, and brand matches "contains", like the catalog (find-14).
- UXD-stores-26: Store category counts do not narrow with the brand filter and always describe the whole store (find-14).
- UXD-stores-27: Out-of-stock listings stay last on the store page whatever the sort, per the store-operations design §5.2 (find-14).
- UXD-stores-28: Opening hours show whenever the store wrote them (writing them is the consent), and only the address needs `show_address` (list-12).
- UXD-stores-29: "Cómo llegar" appears only with a shown address (a district-only search is not useful), and its query is address, district, city and "Perú", with repeated parts once (list-12).
- UXD-stores-30: Opening hours are free text, with no structured weekdays and no "Abierto ahora", which would need a timezone-aware schedule and could be wrong (list-12).
- UXD-stores-31: The owner's store preview shows only approved listings, not ones in review, because it shows what the public will see (shop-04).
- UXD-stores-32: In the preview, the WhatsApp button is shown inert with an explanation rather than hidden, so the owner sees the real layout (shop-04).
- UXD-stores-33: The owner notice on an active store keeps visit telemetry as before, so owner self-visits still count, as today (shop-04).
- UXD-stores-40: Laria keeps one complaints book for the platform, not one per store, because stores, as providers, keep their own books (trust-05).
- UXD-stores-41: Sheets are numbered `LR-<año>-<6 digits>`, correlative per calendar year in Lima time, from a locked counter rather than a sequence, so a rollback never leaves a gap (trust-05).
- UXD-stores-42: The answer goes to the consumer's e-mail (the field hint says "Aquí recibirás la respuesta"), and the form has no "respuesta por domicilio" option (trust-05).
- UXD-stores-43: No e-mail copy of the sheet is sent and the visitor saves or prints it, since the e-mail outbox only serves registered users' fixed notification kinds and would need a new template (trust-05).
- UXD-stores-44: A light abuse limit allows 5 sheets per e-mail address (and per account) in 24 hours, with no IP or CAPTCHA limit, so shared networks never block a legitimate consumer (trust-05).
- UXD-stores-45: Accepted documents are DNI, carné de extranjería, pasaporte and RUC (trust-05).
- UXD-stores-46: The page is indexable with its canonical URL, and it was not added to `legalPages` or the sitemap to keep edits minimal, though the coordinator can add it to the sitemap (trust-05).
- UXD-stores-47: The footer has a text link only, with no Libro de Reclamaciones icon (trust-05).
- UXD-stores-48: Admin has RPCs only (`get_admin_complaints_book_page`, `answer_complaints_book_entry`) and no Admin screen in this program (trust-05).
- UXD-stores-49: `?publicacion=<slug>` is the only prefill, and signed-in users' names and e-mails are not prefilled, which is a possible follow-up (trust-05).

### Store inventory and counter (inventory)

Detail: [docs/ux-effortless/inventory.md](ux-effortless/inventory.md).

- UXD-inventory-1: Inventario search matches SKU, name, variant, external reference and the linked publication's title, brand and model, needs every word (accents and case ignored) and updates the table as you type (fix-06).
- UXD-inventory-2: "En revisión" in Inventario means new publications plus changes in review, rejected publications are a separate tile, and the catalog filter is hidden until catalog matching exists (fix-09).
- UXD-inventory-3: Undo is a linked correction in the append-only ledger, offered for 10 s after each change and 15 min on the SKU page, and sales totals ignore corrected sales (stock-02, stock-03).
- UXD-inventory-4: Purchase requests get their own page with marks and a one-step "Vendido", and the store gets ready replies without numbers or links (stock-04, stock-05).
- UXD-inventory-5: Stores get a default low-stock threshold and an opt-in daily summary in Notificaciones, never by e-mail (stock-06).
- UXD-inventory-6: The bulk limit is 2,000 SKUs, a view can be selected whole, and price changes are revertible campaigns with optional rounding to …9 (stock-14, stock-15).
- UXD-inventory-7: The reorder list is a file round trip, and "Agotados con interés" ranks out-of-stock SKUs by favorites and contacts (stock-07, stock-08).
- UXD-inventory-8: Inventario adds saved views, export of a view, keyboard shortcuts and the list position (stock-16 to stock-19).
- UXD-inventory-9: "Solicitar compra" asks for a quantity up to what is available, capped at 10, without showing stock (stock-23).
- UXD-inventory-10: Mostrador makes the browser the counter, with the camera where BarcodeDetector exists and an offline queue (big-10).

### Integration (integration)

Detail: [docs/ux-effortless/integration.md](ux-effortless/integration.md).

- UXD-integration-1: The listing batch's price-drop rule (list-05) applies everywhere, so a listing never sits under "Bajaron de precio" (find-10) without the "Antes" its page shows, and a raise-then-drop cannot put it there.
- UXD-integration-2: "Duplicar" is the my-listings batch's full copy (photos, specs and text into a new draft, shop-08), "Publicar uno parecido" keeps the selling batch's rule (post-13), and the sell form drops `?desde=`.
- UXD-integration-3: Every batch adds notification and e-mail types through one helper, the listing batch's `laria_private.ux_extend_text_check`, which evaluates the allowed list instead of reading its text.
- UXD-integration-4: "Solicitar compra" with a quantity uses the listing batch's link, so WhatsApp opens at once with the quantity in the message, the route still clamps it, and the safety sheet applies (stock-23).
- UXD-integration-5: The ready WhatsApp replies use the pickup hours when the store wrote them, otherwise its opening hours, and the pickup field says so and stays, since pickup hours can still differ (stock-05, list-12).
- UXD-integration-6: The SKU page shows "Datos para publicar" in Publicación, above "Publicar este SKU", while the SKU has no publication, and the category is edited once, in "Categoría del SKU" (stock-09, stock-20).
- UXD-integration-7: The owner's store preview leaves out "Seguir", the account home says "Cupo de publicaciones" and points to Mi tienda at the limit, and "Publicar seleccionados" joins the new bulk bar, for ticked rows only.
- UXD-integration-8: One module, `lib/notifications.ts`, names each notice and picks its page for both the notifications list and push, so a push reads and opens like its row and a new type is added in one place (big-12).
- UXD-integration-9: "Vistos recientemente" is one list on the device (every listing page opened, drawn from today's public cards on the home, the catalog, the not-found page and Favoritos), and "your last visit" is one cookie with one rule for the home, Favoritos and Alertas (FIND 11, big-04, save-04).
- UXD-integration-10: What the accounts batch left for the others is in place: the home shows what a signed-in person follows above "Para ti" (save-12); every price field is the shared "S/ 1,250" input and brand and model are never autocorrected (auth-03); both store forms use the +51 WhatsApp field and the store sign-up has the password eye (auth-01, auth-03); and the account home asks to complete the profile only once the person has publications, since Publicar asks the first time (auth-02).
- UXD-integration-11: A store's street address appears only where the store chose to show it (list-12): the "Tienda verificada" explainer (trust-03) keeps RUC and razón social and otherwise says the address was checked, with its district and city.

### Speed, install and push (speed)

Detail: [docs/ux-effortless/speed.md](ux-effortless/speed.md).

- UXD-speed-1: No `loading.tsx` anywhere (owner decision Q1 A stands): a bar after 100 ms and a skeleton after 1 s cover the old page while the next one loads (fast-01).
- UXD-speed-2: Data saving changes only images that appear after the page loads, asking for about 1.5 device pixels per CSS pixel from the same `srcset`, and turns off loading pages ahead of time (fast-03).
- UXD-speed-3: The service worker is scoped to `/compartir/` and caches nothing but shared photos: no offline mode (big-12).
- UXD-speed-4: No install banner of Laria's own; the browser offers the install (big-12).
- UXD-speed-5: Push is a per-device companion to e-mail, asked for only from the switch in Notificaciones, never on a first visit (big-12).
- UXD-speed-6: No push from 22:00 to 08:00 Lima; those notices go out together in the morning (big-12).
- UXD-speed-7: Several pending notices go out as one message, and the phone shows one Laria notice at a time (big-12).
- UXD-speed-8: Notices read in Laria or older than three days are not pushed (big-12).
- UXD-speed-9: Pushes go only to browsers' push services, and only with real keys (big-12).
- UXD-speed-10: Ten devices per person at most; a shared phone belongs to whoever turned notices on last, and signing out turns the device off (big-12).
- UXD-speed-11: Shared photos wait on the device, up to 10 and for one day, and reach Laria only when the form uploads them (big-12).
- UXD-speed-12: The push worker is started by hand until a scheduler exists, and without VAPID keys it only logs (big-12).
- UXD-speed-13: Every bar fixed to the bottom of the screen carries `data-bottom-bar` and measures itself, so focus scrolls clear of it, and the phone contact bar pads the listing page by its height (fast-04).

## Feature ideas: proposed decisions (2026-10-26)

These are the decisions taken while building the feature ideas Henri approved on 2026-10-26 (marking page https://claude.ai/artifact/7iWMJuxxKLaxsdibsWEZQd). They remain proposals until Henri reviews the combined build. Each line gives the decision's first sentence; the batch write-up in `docs/feature-ideas/` has the full text, the reasoning, the files and the limits. The plan and its rules are in [docs/feature-ideas/build-plan.md](feature-ideas/build-plan.md), and what was left for later is in [docs/feature-ideas/deferred.md](feature-ideas/deferred.md).

### Accounts, help and safety (accounts)

Detail: [docs/feature-ideas/accounts.md](feature-ideas/accounts.md).

- FD-accounts-1: The code is asked only on a new device or after signing out, and a session keeps its second-factor level for its whole life (Henri's requirement).
- FD-accounts-2: Two-step is optional for everyone, and required only for store owners with an approved payment method (Mi tienda, store contact details and payment methods) and for Admin.
- FD-accounts-3: Authenticator apps only, no SMS codes (cost per message, and SIM-swap fraud).
- FD-accounts-4: One new-device e-mail per new browser, the first browser excluded, ten a day at most.
- FD-accounts-5: Supabase project settings must keep sessions alive: Sessions › "Time-box user sessions" and "Inactivity timeout" off, or at least 30 days; MFA › TOTP enabled (Supabase's default).
- FD-accounts-6: E-mail change lives in Seguridad (how you sign in), not in Perfil.
- FD-accounts-7: The export is one JSON file downloaded on the spot.
- FD-accounts-8: Self-service deletion anonymises instead of erasing rows that other people rely on: verified transactions and their reviews stay under «Cuenta eliminada»; unsold listings are archived, sold ones kept as history.
- FD-accounts-9: The A20 stand-in is created only when A20's `laria_private.anonymize_account(uuid, text)` does not exist; the integrator removes `20261201120100_feat_anonymize_standin.sql` once A20 is merged.
- FD-accounts-10: The buttons stay hidden until Henri turns each provider on: `NEXT_PUBLIC_AUTH_GOOGLE=1` and `NEXT_PUBLIC_AUTH_APPLE=1`, after setting up the provider in Supabase Auth (client IDs and secrets live in Supabase, not in Laria's environment).
- FD-accounts-11: Articles live in code (`lib/help/articles.ts`), reviewed like any copy; no CMS.
- FD-accounts-12: Laria sends e-mail only to addresses that belong to an account.
- FD-accounts-13: A match is a lead for Admin, never a public mark.
- FD-accounts-14: A police report number is required to file a report, to keep the registry for real thefts.
- FD-accounts-15: `laria_private.flag_serial_against_stolen_reports(serial, source, ref, owner default null)` is the one entry point for serials held elsewhere; selling-tools' "Mi equipo" calls it with source `gear`.
- FD-accounts-16: Photos are hashed off the upload path (daily, and when Admin opens the listing) rather than in `app/api/listing-images`, so uploads stay as fast as today and the upload route is unchanged; review is where the flag is needed.
- FD-accounts-17: A flag goes on the newer listing and never blocks it; a catalog photo used by two stores is legitimate, so Admin decides.

### Listing details, filters and map (listing-details)

Detail: [docs/feature-ideas/listing-details.md](feature-ideas/listing-details.md).

- FD-listing-details-1: Old values map to one step each: "Usado - buen estado" → Muy bueno, "Usado - con detalles" → Bueno.
- FD-listing-details-2: "Exhibición o caja abierta" is for store listings only (the database refuses it for a Particular), and it is sold as used in structured data.
- FD-listing-details-3: Nothing is chosen for the seller: the price mode starts empty and stays optional.
- FD-listing-details-4: Delivery and trade terms are not moderated, like the price: they go live when saved.
- FD-listing-details-5: The pickup or try-out place is a district or zone, never an address.
- FD-listing-details-6: The yes/no filters are "all of" and are derived by the database from the listing's own columns; nobody can set a flag directly.
- FD-listing-details-7: Trade categories are the catalog's own (a category added later, like Andinos, is accepted without changes here), at most 12.
- FD-listing-details-8: The last published terms are remembered on the device only and applied only when the seller presses the button; the price mode is never copied.
- FD-listing-details-9: The combo list lives on the device only: no account, no server copy.
- FD-listing-details-10: The discount is the seller's declared offer.
- FD-listing-details-11: The combo is not offered on sold or out-of-stock listings, nor while a listing is in the assisted-purchase pilot ("Solicitar compra"), so a listing never shows two ways to buy.
- FD-listing-details-12: Companions are for stores only (a Particular's few listings rarely go together), up to six, from the same store, and only ones still for sale.
- FD-listing-details-13: A store is a pin only while it shows its address (the same consent as list-12); otherwise it is an area around its district.
- FD-listing-details-14: Laria gives no directions: a store pin opens the point in Google Maps or Waze, and the buyer's app does the rest.
- FD-listing-details-15: The list stays the default view; the map shows the 300 newest results that match and says when there are more.
- FD-listing-details-16: No address search for the pin: it would need a geocoding service.
- FD-listing-details-17: The map library and its worker load only when the map is opened; the recovery switch (`LARIA_CATALOG_ENRICHMENT_DISABLED`) also turns the map's data off.
- FD-listing-details-18: A duplicate or relisted copy keeps "Hecho a mano" and "a pedido" while the store still shows its maker profile; the artist's note, about one physical instrument, is not copied.

### Seller pages and trusted deals (deal-trust)

Detail: [docs/feature-ideas/deal-trust.md](feature-ideas/deal-trust.md).

- FD-deal-trust-1: Shared functions are patched, not copied.
- FD-deal-trust-2: This changes two earlier rules on purpose, as the idea asked: V1's "only a WhatsApp contact becomes a verified buyer" (a customer who confirms a counter code is one too) and store operations D-12 "stock sales never unlock reviews" (a stock movement still creates nothing; only the customer's confirmation does).
- FD-deal-trust-3: A code belongs to one Mostrador sale, works once and expires 24 hours after the sale.
- FD-deal-trust-4: Limits against a store confirming its own sales: never at one's own store, one counter purchase per store per customer a day, five a day in all.
- FD-deal-trust-5: The QR is drawn with store-floor's encoder (`lib/labels/qr.ts`, byte mode, level M, versions 1 to 10), with no library.
- FD-deal-trust-6: Photos only on the buyer's review of the seller, pre-moderated, never public by default.
- FD-deal-trust-7: The image is served by `/api/review-photos/<id>`, which asks `get_review_photo_object` with the visitor's session who may see it; public photos are cached five minutes, others never; responses carry `nosniff`, a sandboxing CSP and `no-referrer`.
- FD-deal-trust-8: A person's page is `noindex` and stays out of the sitemap: it is for the people they send it to.
- FD-deal-trust-9: Criteria: at least 5 verified sales, at least 3 visible reviews from buyers averaging 4.5 or more, no report upheld in the last 90 days, no public question left unanswered for more than 7 days (questions up to 90 days old), and for a store, the store is active.
- FD-deal-trust-10: Stores get the same mark as «Tienda destacada», counting both listing purchases confirmed through WhatsApp and counter purchases (reach-11), which are how most of a store's sales can become verified.
- FD-deal-trust-11: Turning it on is consent shown in a sheet ("Nunca muestra tu teléfono, tu correo ni qué compraste…").
- FD-deal-trust-12: The card shows the average of the ratings sellers gave the buyer, which V1 kept private.
- FD-deal-trust-13: Once on, the line is included by default in every WhatsApp message to a seller or store (the first contact and "Solicitar compra" alike) and can be removed per listing with the chip.
- FD-deal-trust-14: Only the new owner links, which is their consent; the purchase and the publication must both be theirs, one publication per purchase.
- FD-deal-trust-15: Previous owners are counted by following earlier links, at most ten.
- FD-deal-trust-16: Only on Particulars' publications that are not sold; a store's own address is already on its page.
- FD-deal-trust-17: The public places are a hand-picked list per city in `lib/safe-meetup-places.ts` (Lima, Callao, Arequipa, Trujillo, Chiclayo, Piura, Cusco, Huancayo), opened as map searches, never fixed addresses.
- FD-deal-trust-18: A store can be a spot only while active, verified and showing its street address; the check runs again on every read, so a store that hides its address drops out at once.

### Selling tools (selling-tools)

Detail: [docs/feature-ideas/selling-tools.md](feature-ideas/selling-tools.md).

- FD-selling-tools-1: No estimated value (deferred: it needs typical prices).
- FD-selling-tools-2: Mi equipo is for Particular accounts.
- FD-selling-tools-3: Up to 200 items per person.
- FD-selling-tools-4: The store sees no name or phone until it is chosen; then only that store gets the person's WhatsApp, which they confirm on the accept screen.
- FD-selling-tools-5: Photos go to a private bucket under `<person>/<request>/<n>.jpg`, uploaded before the request is sent (the request id is made in the browser).
- FD-selling-tools-6: Limits: 5 open requests per person, 10 a day, descriptions without phone numbers or links.
- FD-selling-tools-7: Which stores receive it: active, verified, same region, the category in their list.
- FD-selling-tools-8: The commission and the payment are agreed between the store and the owner; Laria shows neither.
- FD-selling-tools-9: The setting is `listings.accepts_part_payment` (null follows the store).
- FD-selling-tools-10: A Particular's "Acepto cambios por…" (sell-06, listing-details) is a different thing and stays as it is.
- FD-selling-tools-11: Not for a listing whose price Inventario controls (a store changes it there).
- FD-selling-tools-12: Buyers see nothing new: no "the price will drop" banner, no countdown.
- FD-selling-tools-13: The e-mail follows the price-drop choice and its one-click link is "No más bajas de precio": it is the same kind of news for the same people.
- FD-selling-tools-14: The owner and the listing's store owner are never recipients.
- FD-selling-tools-15: Stores are listed by region and city only, never paid placement.

### Store reach (store-reach)

Detail: [docs/feature-ideas/store-reach.md](feature-ideas/store-reach.md).

- FD-store-reach-2: Floor of 5 distinct people for every figure, stored aggregated, 13 months kept.
- FD-store-reach-3: Active stores (and Admin) only; Particulares do not see it.
- FD-store-reach-4: "Búsquedas sin resultados" counts only searches without price, condition, seller or attribute filters, so a narrowed search that found nothing is not read as missing supply.
- FD-store-reach-5: The store's feed is for Meta; Google is one Laria-wide feed under Laria's account, off until the account exists.
- FD-store-reach-6: Feeds are not served on previews, read only public data with the anonymous key, and stop at 20,000 items.
- FD-store-reach-7: The mark shows on new instruments only ("Nuevo"); a used one is not covered by a dealer's warranty.
- FD-store-reach-8: One open request per brand and store; a document cannot be replaced, only withdrawn and sent again.
- FD-store-reach-9: An authorization past its end date stops showing the next day (Lima) without Admin action.
- FD-store-reach-10: Reference = lowest price of the 30 days before, and the current price must equal it.
- FD-store-reach-11: At most 30 days per campaign, so a card's "Antes" (list-05 shows drops of 30 days) holds throughout.
- FD-store-reach-12: The after-campaign choice is required, with no default.
- FD-store-reach-13: Any price change by the store ends its entry; the publication keeps the store's new price.
- FD-store-reach-14: Public marks are cached for 10 minutes and shown only while the publication's price still equals the campaign price.
- FD-store-reach-15: Only Admin creates campaigns.
- FD-store-reach-16: Up to 100 publications per import, picked by hand.
- FD-store-reach-17: USD prices and used conditions are left empty for the store to fill in the review; prices are rounded to whole soles.
- FD-store-reach-18: Photos are copied when the store presses the button in the wizard, not in the background.
- FD-store-reach-19: Disconnecting deletes the tokens in Laria; the store removes the app in Mercado Libre itself.

### Store floor (store-floor)

Detail: [docs/feature-ideas/store-floor.md](feature-ideas/store-floor.md).

- FD-store-floor-1: "Por llegar" is the listing's `out_of_stock` state plus a date, not a new stock state.
- FD-store-floor-2: Dates go from today to a year ahead, in Lima's calendar.
- FD-store-floor-3: The bulk action works on ticked rows (up to 200), like "Ajustar stock", not on "todos los que coinciden".
- FD-store-floor-4: Three condition groups, matching the condition scale: Nuevo; Exhibición o caja abierta (stores only); every other value is Usados.
- FD-store-floor-5: Terms apply at once and are not moderated, like the price.
- FD-store-floor-6: "Con garantía" means more than 0 months, from the store or the brand.
- FD-store-floor-7: The store's returns terms win over its gift-exchange policy on the store page and `/regalos` (integrator's decision), as described above.
- FD-store-floor-8: Labels are drawn in the browser, not as a server PDF: no new dependency, works offline once the page is open, and nothing about the store's stock leaves it.
- FD-store-floor-9: Limits: 200 SKUs per print, 50 copies per SKU and 1,000 labels.
- FD-store-floor-10: The poster's QR goes to the store page (`/tiendas/<slug>`), where buyers follow and browse.
- FD-store-floor-11: A try-out holds a time, never the instrument: stock, listings and purchase requests are untouched (talk-06 "Reservado" is still a Maybe).
- FD-store-floor-12: Try-out hours are their own weekly schedule, because the store profile's opening hours are free text.
- FD-store-floor-13: "Both get the details by WhatsApp" is done with prefilled WhatsApp links on both screens plus Laria's notices and transactional e-mails.
- FD-store-floor-14: Booking needs an account (so the store knows who is coming and the buyer can be told).
- FD-store-floor-15: One reminder, sent by the daily job for confirmed try-outs of today and tomorrow, skipped when the try-out starts within the hour.
- FD-store-floor-16: A try-out, with the buyer's name and number, is deleted 90 days after its date.
- FD-store-floor-17: Buyers reach their try-outs from Compras y ventas (and every notice), with no new buyer menu entry.
- FD-store-floor-18: listing-details' "Se puede probar" flag (a seller's yes/no) stays separate from booking.

### Discovery (discovery)

Detail: [docs/feature-ideas/discovery.md](feature-ideas/discovery.md).

- FD-discovery-1: The eleventh category is "Andinos y tradicionales" with one type and an `andean_type` attribute (the thirteen values above), instead of one type per instrument.
- FD-discovery-2: The cajón stays in Percusión, and "charango" searches open the new category.
- FD-discovery-3: Maker status is self-declared, shown with whose word it is, and Admin can hide it.
- FD-discovery-4: Made to order is a listing of a concrete instrument with its price and photos plus a lead time.
- FD-discovery-5: Particulars cannot be makers; only stores (a luthier opens a store, which is free).
- FD-discovery-6: The marks live in their own table, set from the edit page through `set_listing_maker_details`, not through the submission functions.
- FD-discovery-7: "Verificado" means only that Laria checked the identity.
- FD-discovery-8: Artists apply by e-mail for now; there is no self-service form (it would need identity documents, which this batch does not collect).
- FD-discovery-9: Guides are code, not Admin content: they change rarely and need review. deal-trust's safe meetup sheet can link `/guias/<slug>` through `guidesForListing` in `lib/discovery/buying-guides.ts`.
- FD-discovery-10: The finder uses the catalog filters only; it does not rank or recommend beyond them.
- FD-discovery-11: The gift exchange is a store-level setting owned by this batch.
- FD-discovery-12: A collection is saved catalog filters, never a hand-picked list of listings, so it never shows a sold or hidden listing and needs no upkeep.
- FD-discovery-13: The home row has no feed and no "trending": up to three collections and the gift finder.

### Services for musicians (services)

Detail: [docs/feature-ideas/services.md](feature-ideas/services.md).

- FD-services-1: Five kinds, fixed vocabularies. Kinds, units, places and skills are fixed lists, kept in step between `lib/services.ts` and the migration (a unit test compares them).
- FD-services-2: One service per kind per account. A studio that rents rooms and records has two services.
- FD-services-3: Stores offer services as the store. A store owner needs a store request first; the service shows the store's name, logo and verification and links to it.
- FD-services-4: Moderation before publication; post-moderation of edits. New services wait for Admin.
- FD-services-5: "Desde" price in whole soles, 1 to 100,000, with a unit. It is a reference, said so on the page; the parties agree the final price.
- FD-services-6: Contact through WhatsApp only, recorded like listing contacts. A view counts once per person or session per 30 minutes; every press is a contact, at most 20 per person and service a day.
- FD-services-7: Confirmed booking from either side, 180-day contact window, 30-day answer, 30-day review. Mirrors the listing transaction flow (Sprint 6).
- FD-services-8: Reviews are permanent; deletion is not. A service with confirmed clients or reviews cannot be deleted, only paused.
- FD-services-9: Separate section, never mixed. Services have their own tables and pages and never appear in instrument search, listing counts, alerts, favorites or the store's listing allowance (Henri's note).
- FD-services-10: Entry points. Footer, account menu, Admin menu and sitemap; then (follow-up PR, agreed with the integrator) the home header's Categorías menu, which is also the phone menu, a home teaser and one repair line on worn gear.
- FD-services-11: Photos. Public bucket `service-photos`, 5 MB, JPEG/PNG/WebP, uploaded into the owner's folder; the owner can remove only photos no service uses, so a photo still on a service (even a hidden one) stays.

### Integration (integrator)

Detail: [docs/feature-ideas/build-plan.md](feature-ideas/build-plan.md) and the integration section of [docs/database.md](database.md).

- FD-integration-1: A new or redefined shared function goes alone in its own migration, and a batch that needs another batch's function changes it through a registry (listing flags, listing detail writers) instead of redefining it.
- FD-integration-2: An old condition value in a link reads as its part of the new scale (sell-10), so catalog links carry the new values from then on.
- FD-integration-3: Mi equipo serials take part in the stolen-gear matching both ways, and Admin sees the item and the listing it became, never its owner.
- FD-integration-4: Deal-trust's counter-sale QR uses store-floor's encoder (`lib/labels/qr.ts`), and its own encoder is removed.
- FD-integration-5: The Terms and Privacy lines for the batches that listed points without writing them are drafted in one component (`components/legal/feature-ideas-legal.tsx`) and reviewed together with the others ([docs/feature-ideas/legal-review.md](feature-ideas/legal-review.md)).
