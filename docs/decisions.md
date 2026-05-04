# Product and Engineering Decisions

This file records important decisions so future Codex sessions do not accidentally undo them.

## Marketplace First, Payments Later

Decision: Laria begins as a discovery marketplace with WhatsApp contact, not a transactional platform.

Why:
- Faster MVP.
- Lower legal/payment complexity.
- Sellers in Peru are already comfortable with WhatsApp.
- The main unknown is marketplace liquidity, not checkout infrastructure.

Do not add payments, checkout, escrow, delivery, reviews, commissions, or internal chat until explicitly planned.

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

Decision: keep marketplace mechanics limited to discovery, moderation, and WhatsApp contact.

Why:
- It lets the product ship quickly.
- It avoids payment, shipping, dispute, tax, and support complexity.
- It matches current buyer/seller behavior.

## Admin Curation Matters

Decision: listings and stores go through admin approval.

Why:
- Trust is essential in used gear markets.
- Low-quality listings can quickly damage marketplace perception.
- Early-stage supply should be curated.

Current status model:
- Listings: `pending`, `approved`, `rejected`, `hidden`, `sold`.
- Stores: `pending`, `active`, `hidden`.

Only approved listings and active stores are public.

## Use Supabase RLS Instead of a Custom Backend

Decision: public reads/inserts and admin updates are controlled primarily by Supabase RLS.

Why:
- Small team can understand and review SQL policies.
- No separate backend server or service role key is needed for current flows.
- Supabase Auth can carry admin identity through JWT app metadata.

Tradeoff:
- Some actions, like view-count incrementing, need carefully scoped security-definer RPCs.

## JSONB Attributes for Advanced Filters

Decision: use `listings.instrument_type` plus `listings.attributes jsonb`.

Why:
- Instruments have very different specs.
- Avoids dozens/hundreds of nullable columns.
- Allows each instrument group to have its own filter set.
- Easier to add new groups later.

Do not convert this to many columns unless there is a strong reason.

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

Decision: the current production workflow uses manual SQL execution in Supabase.

Why:
- The owner currently has online Supabase access.
- SQL migrations remain reviewable in `supabase/migrations`.

Tradeoff:
- The owner must apply SQL before deploying code that depends on new schema/RPC.
- Vercel does not automatically run migrations.

## Use v0 Carefully

Decision: use v0 UI as a source of visual components, not as a replacement for business logic.

Why:
- v0 can improve presentation quickly.
- The existing app contains working Supabase, routing, and moderation logic.

Rule:
- Integrate one page at a time.
- Replace mock data with real data.
- Keep existing routes and backend logic unless explicitly changing them.

## Branding Redesign Should Wait for Final Identity

Decision: do not over-polish the visual system until the Laria brand identity is ready.

Why:
- Brand identity and logo are still in progress.
- Site design should be revamped consistently once the visual direction is known.
- Temporary UI improvements are acceptable for iteration.

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

