# Product and Engineering Decisions

This file records important decisions so future Codex sessions do not accidentally undo them.

`docs/functional-spec.md` is canonical for the frozen V1 product contract. This file preserves decision rationale and implementation history; where older planning language conflicts with the functional specification, the functional specification wins.

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
