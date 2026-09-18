# Architecture

## Overview

Laria is a specialized musical-instrument marketplace for Peru. The app is a Next.js App Router application deployed on Vercel and backed by Supabase Postgres, Storage, Auth, RLS, and RPC functions.

The architecture is intentionally simple:

```text
Browser
  -> Next.js App Router
  -> Supabase client / route handler calls
  -> Supabase Postgres + Storage + Auth
```

The codebase currently favors server-rendered public pages with small client islands for forms, admin auth/moderation, filters, card photo carousel behavior, and listing detail metadata.

Release boundary: Sprints 1–4 are **CLOSED / ACCEPTED**, including owner production evidence dated 2026-09-17. Production remains Sprint 4 commit `427ac8e8aa514ae10a47c0a4d2eee3dfe827ccaa`; see `docs/sprint-4-production-verification.md`. Sprint 5 changes below are local only, awaiting a separate release gate.

## Core Responsibilities

Next.js handles:
- Routing and metadata.
- Server-rendered public pages.
- Client interactive components.
- Public forms.
- Admin UI.
- Route handlers for photo loading, authorized edit-image delivery/cleanup, and trusted first-party event/contact ingestion.
- Calls to Supabase.

Supabase handles:
- Database tables.
- Row Level Security policies.
- Listing and store records.
- Pending listing revisions and proposed photo sets.
- Seller/store-owner account ownership tables.
- Listing photos.
- Public initial-submission image buckets and private listing-edit staging.
- Admin auth through Supabase Auth.
- RPC helpers such as `is_admin()`, store membership checks, publication validation, owner lifecycle/edit operations, revision review, trusted event recording, and owner-scoped analytics.

Vercel handles:
- Production deployments.
- Preview deployments.
- Environment variables.
- Automatic redeploys from GitHub pushes.

GitHub is the source repository. Supabase schema is managed separately through SQL migrations.

## Runtime Clients

`lib/supabase/public-client.ts` exposes `getPublicSupabaseClient()`:
- Uses `NEXT_PUBLIC_SUPABASE_URL`.
- Uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Returns `null` if either variable is missing.
- Uses `persistSession: false`.
- Used for server/public reads. Account-bound submission writes/uploads use the authenticated browser/server clients and trusted finalization paths, not anonymous listing inserts.

`lib/supabase/browser-client.ts` exposes `getSupabaseBrowserClient()`:
- Uses the same public env vars.
- Caches a browser Supabase client.
- Uses `@supabase/ssr` `createBrowserClient`.
- Used by `components/admin-panel.tsx` and account UI because Supabase Auth session persistence is needed in the browser.

`lib/supabase/server-client.ts` exposes `getSupabaseServerClient()`:
- Uses `@supabase/ssr` `createServerClient`.
- Reads and writes Supabase Auth cookies through Next.js `cookies()`.
- Used by `/auth/callback`, `/logout`, and server-side session utilities.

`lib/supabase/admin-client.ts` exposes `getSupabaseAdminClient()`:
- Server-only.
- Uses `SUPABASE_SERVICE_ROLE_KEY`.
- Must never be imported by Client Components or exposed as `NEXT_PUBLIC_*`.
- Used by the current admin invite and duplicate-email server routes and available for other trusted server actions.

`middleware.ts` refreshes Supabase Auth sessions and protects account routes that start with `/mi-cuenta` or `/mis-publicaciones`.

## Actual Route Map

```text
app/
  layout.tsx
  page.tsx                         Homepage
  admin/page.tsx                   Admin panel
  auth/callback/route.ts           Supabase magic-link/invite callback
  api/admin/invite-user/route.ts   Server-only admin invite endpoint
  api/auth/check-email/route.ts    Server-only duplicate-email availability check
  api/listings/[id]/manage/route.ts
                                    Owner listing edit/lifecycle endpoint
  api/listings/[id]/photo-cleanup/route.ts
                                    Owner-bound, reference-checked cleanup
  api/listing-images/[...path]/route.ts
                                    Authorized delivery of private edit photos
  api/listings/[id]/photos/route.ts
  api/listings/[id]/view/route.ts
  api/events/session/route.ts       Signed first-party session bootstrap
  api/events/route.ts               Bounded event batches
  api/contact/route.ts              Canonical WhatsApp destination + intent event
  confirmacion-correo/page.tsx     Email confirmation success page
  instrumentos/[slug]/page.tsx     Listing detail
  listados/page.tsx                Listings/search page
  listados/loading.tsx             Listings loading skeleton
  login/page.tsx                   Password and magic-link login
  logout/route.ts                  Sign out and redirect to /login
  mi-cuenta/layout.tsx             Protected role-aware account shell
  mi-cuenta/page.tsx               Particular/Store Owner account summary
  mi-cuenta/publicaciones/page.tsx Particular owned-listing view
  mi-cuenta/publicaciones/[id]/editar/page.tsx
                                    Owner listing editor
  mi-cuenta/publicar/page.tsx      Particular listing submission
  mi-cuenta/tienda/page.tsx        Store application/profile management
  mi-cuenta/tienda/inventario/page.tsx
                                    Store inventory view
  mi-cuenta/tienda/publicar/page.tsx
                                    Store inventory submission
  mi-cuenta/tienda/estadisticas/page.tsx
                                    Owner-only real store analytics (production Sprint 4)
  publicar/page.tsx                Redirects to /vender
  registrar-tienda/page.tsx        Compatibility gate/redirect to account store area
  registro/vendedor/page.tsx       Individual seller account signup
  registro/vendedor/invitacion/page.tsx
                                    Invited seller profile setup
  registro/tienda/invitacion/page.tsx
                                    Invited store-owner profile setup
  tiendas/[slug]/page.tsx          Public store page
  vender/page.tsx                  Individual listing submission
```

Important note from older business docs: some expected routes were written as `/instrumentos` or `/listing/[slug]`. The actual current code uses `/listados` for search and `/instrumentos/[slug]` for detail. Keep existing routes unless a route migration is explicitly requested.

## Main Domain Concepts

### Listings

Listings are the primary marketplace unit. A listing can belong to:
- An individual seller.
- A store.

Listing status lifecycle:

```text
pending -> approved
pending -> rejected
rejected -> pending
approved -> hidden
hidden(owner) -> approved
approved -> sold
sold -> copied new pending/approved listing
```

Only `approved` listings participate in catalog/search. A sold historical record remains available at its exact detail URL with `Vendido`, but its row is not exposed through broad public table RLS.

Phase 2 adds nullable listing ownership through `owner_user_id`, plus `sold_at`, `archived_at`, `created_by_source`, and `marketplace_rules_accepted_at`. Legacy listings can keep `owner_user_id=null`.

Sprint 3 adds owner/admin hide provenance and reasons, rejection reasons, sold-to-copy lineage, and immutable sold rows. Owner lifecycle mutations run through locked security-definer RPCs, so direct client updates cannot bypass status, store-cap, publication, or ownership rules.

Approved Particular and normal-Tienda edits are split by trust boundary. Price, description, location, and supported attributes apply to the live row immediately. Title, category, instrument type, brand, model, condition, and photos are stored in one `listing_revisions` proposal; proposed photos live in `listing_revision_photos`, and the existing approved row/photos remain public until admin approval. A later moderated save locks and amends the same pending row, preserves its other proposed values, replaces the latest photo set, removes reverted differences, and increments `version`. Admin review supplies the version displayed; a mismatch aborts and reloads the latest proposal. When instrument type changes, its dependent attribute set travels with that proposal so incompatible attributes do not leak onto the old public type. Admin approval patches only proposed fields in one transaction and never changes a concurrent owner/admin hide state. A qualifying Tienda Verificada bypasses revision moderation and applies the validated edit directly; if that later direct edit supersedes a pre-verification pending proposal, the old proposal is retained as cancelled history.

If a listing is marked sold while a revision waits, the proposal becomes `cancelled` and cannot be applied to the historical row. Owner or admin hiding leaves the proposal pending; approving it patches content but preserves the current hidden status. Store verification does not auto-approve pending edit revisions, while future edits check current verification state inside the trusted transaction. Revocation therefore restores moderation for later edits immediately.

### Listing-photo editing — production Sprint 4

New edits receive an owner/listing-bound HMAC capability from `POST /api/listings/[id]/manage` with `action='start_edit'`. Files are appended to the private `listing-edit-photos` bucket at `{ownerId}/listing-edits/{listingId}/{attemptId}/{sortOrder}.{ext}`. Stored URLs use `/api/listing-images/...`, not public bucket URLs. Existing public/legacy objects and initial signed submission paths are unchanged; the public bucket no longer accepts the edit-folder convention.

The database validates the complete ordered 2–10-photo set, owner/listing scope, actual Storage metadata, MIME, size, duplicate URLs, and retired cleanup claims. Pending photo amendments reuse the same versioned revision and preserve other pending moderated fields. The editor can explicitly restore the approved photo order, which removes only the photo difference; reverting every difference cancels the empty proposal. Approval atomically promotes the latest set, while rejection, superseded/sold-cancelled proposals, sold source photos, and relisted-copy references retain their audit/history protection.

`listing_edit_attempts` stores a payload SHA-256 and result under a transaction-serialized owner/attempt key. Replaying the identical signed request returns that result without another revision version; changing its payload is rejected. The client retains the prepared token/upload payload in memory after an uncertain final response, avoids duplicate busy submissions, and remounts from refreshed server revision state after success.

`/api/listing-images/...` serves referenced public live/historical photos only when their listing/store eligibility permits it, otherwise requires the owning session or trusted admin. Unattached uploads and other owners' proposals return 404. Private previews bypass the anonymous Next.js image optimizer; public cards/detail keep responsive resizing and lazy thumbnails.

The owner-bound cleanup endpoint calls a service-only claim RPC under the same listing row lock as editing. It checks every live and revision/history reference, records an irrevocable retirement claim before deleting eligible bytes, and prevents a concurrent edit from attaching them afterward. Storage/RPC failures are explicit and retryable, not false empty-success. Browser users never directly delete or overwrite historical objects. This is targeted partial-upload/discard cleanup, not a new scheduled orphan collector.

### Stores

Stores are mini-shop pages for small music stores. A store has:
- Public profile page.
- Logo and banner.
- WhatsApp contact.
- City, district, address.
- Verification status.
- Product listings.

Only `active` stores should be visible publicly.

`profiles.account_type='seller'` represents a Particular and `store_owner` represents the separate Store Owner identity. Sprint 2 binds one nonlegacy store to one owner, keeps `store_members` for schema compatibility, and does not expose employee management. A pending/rejected/hidden store is nonpublic; `stores.status='active'` is the basic Tienda approval state and `is_verified=true` is the separate Tienda Verificada state.

Public listing eligibility is a combined invariant: the listing must be `approved`, and store inventory additionally requires an `active` parent store. `listing_is_public()` centralizes this rule for listing and photo RLS so an individually moderated row cannot leak a pending or hidden store.

The free-store cap is enforced by a trigger, not by UI counts. Capacity-consuming inserts/restores acquire a transaction advisory lock keyed by store ID and count only `pending`/`approved`, which prevents simultaneous requests from moving a store from 49 to 51.

### Admin

Admin controls supply quality. The admin panel can:
- View pending listings.
- Edit basic listing fields.
- Approve, reject, hide, or mark listings sold.
- Inspect the complete Store application and owner identity.
- Edit allowed business/profile fields.
- Approve a complete store as Tienda or reject/hide it with a required reason.
- Verify an active store or revoke verification through admin-only RPCs.
- Atomically approve the verified store's valid pending inventory.
- Review all listing lifecycle states with mandatory reasons for rejection or administrative hiding.
- Compare current and proposed moderated listing fields/photos, then approve or reject a pending revision through admin-only RPCs.

Admin authority remains based on Supabase Auth `app_metadata.role = "admin"`. Profile `account_type` is app metadata only and is not the security boundary.

Lifecycle moderation RPCs also append typed `notifications` rows inside the same database transaction. Notification RLS exposes rows only to the owning profile; an owner-only RPC changes read state without granting direct update access to event or target metadata. `/mi-cuenta/notificaciones` is shared by both account types and the persistent account navigation computes an RLS-scoped unread count.

Admin-created invites are sent through `app/api/admin/invite-user/route.ts`. The route first checks the current cookie session with the normal server Supabase client and `is_admin()`, then uses the server-only service-role client to call Supabase Auth Admin invite APIs. `SUPABASE_SERVICE_ROLE_KEY` must never be imported into Client Components.

## Component Structure

Core local components:
- `components/page-container.tsx`
- `components/listing-card.tsx`
- `components/listing-filters.tsx`
- `components/listing-detail-gallery.tsx`
- `components/listing-detail-metadata.tsx`
- `components/login-form.tsx`
- `components/seller-signup-form.tsx`
- `components/invite-profile-setup-form.tsx`
- `components/invite-recovery-panel.tsx`
- `components/location-fields.tsx`
- `components/admin-panel.tsx`
- `components/sell-listing-form.tsx`
- `components/listing-management-table.tsx`
- `components/listing-edit-form.tsx`
- `components/store-registration-form.tsx`
- `components/site-header.tsx`
- `components/site-footer.tsx`

Generated/imported UI:
- `components_v0/*`
- Removed unused `components_v0/ui` scaffold

The homepage uses `components_v0` sections, but marketplace data logic remains in the route page. v0-generated UI should be integrated carefully and should not replace Supabase/business logic blindly.

The listing detail route composes `ListingDetailGallery` in a sticky desktop column using `minmax(0,0.82fr)`, with the main listing facts, seller/store trust box, description, and full specs in the wider `minmax(0,1fr)` right column. Recommendation sections stay below that main detail grid.

`app/mi-cuenta/layout.tsx` is the canonical authenticated application shell. It resolves the account type and owned-store presence from server-authenticated Supabase state, then renders persistent role-specific desktop navigation plus an accessible mobile account menu around every account subpage. `/vender` and authenticated `/registrar-tienda` remain compatibility entry points that redirect into the canonical account routes.

Account UI uses the browser Supabase client for interactive auth. `/login` supports password login and magic-link login; the login magic-link path passes `shouldCreateUser:false` to avoid creating accounts accidentally. `/recuperar-contrasena` and `/restablecer-contrasena` use Supabase Auth recovery through the same callback, while `/mi-cuenta/seguridad` performs authenticated password changes. `/registro/vendedor` and `/registro/tienda` create distinct account types with normalized profile metadata. The auth-user trigger persists name, WhatsApp, city, and region immediately. `/auth/callback` accepts PKCE `code` callbacks and server-verifiable `token_hash` callbacks, writes the Supabase session cookies on its returned redirect, and repairs incomplete Particular or Store Owner profiles from trusted Auth metadata when possible.

The production Sprint 4 password form maps only Supabase's safe `same_password` code to `La nueva contraseña debe ser diferente de tu contraseña actual.` Unknown provider failures stay generic. It never retrieves, stores, or manually compares the existing plaintext password; callback/recovery/session behavior is unchanged. Production provider/token-hash/actual-browser verification passed; real-inbox owner acceptance remains separate.

`/vender` is protected in middleware and again in its Server Component, and Store Owner accounts are directed to `/mi-cuenta/tienda/publicar` instead of creating Particular inventory. The browser keeps direct-to-Storage uploads and retry recovery, while all submission capabilities are HMAC-signed and bound to `auth.uid()`. Authenticated uploads use `{userId}/{submissionId}/{sortOrder}.{ext}`; `/api/submissions` revalidates account/store ownership and a service-only idempotent RPC atomically inserts the application/listing plus photo rows. A normal or pending store produces pending inventory; an active verified store may approve a qualifying new listing in the same transaction.

Approved account-owned Particular detail pages join the seller's profile under RLS and resolve current name, WhatsApp, city, and region dynamically. Legacy `owner_user_id=null` listings continue using their historical contact fields. More-from-seller grouping uses ownership when available and WhatsApp only for legacy rows.

The sold-listing detail exception is server-only: `app/instrumentos/[slug]/page.tsx` uses the server service client for the exact approved-or-sold record, then separately checks the existing `listing_is_public()` predicate for approved rows. Catalog, recommendations, photo endpoints, and ordinary public Supabase reads retain approved-only RLS. Sold pages remove WhatsApp actions.

Seller signup checks duplicate emails through `app/api/auth/check-email/route.ts` before calling Supabase `signUp()`. The route uses a service-only indexed Auth email lookup and returns only an availability flag, because `profiles` does not currently store email. Repeated signup attempts show a Spanish error and a link to `/login` instead of a false "check your email" success state.

Signup confirmation emails redirect through `/auth/callback?next=%2Fmi-cuenta%3Fconfirmed%3D1`; the token-hash callback/session behavior is unchanged. Signup supplies trusted `account_type` metadata for the conditional Particular/Tienda body and neutral subject documented in `docs/auth-email-templates.md`. Sprint 4 does not introduce a hosted-template change or new callback format. `/confirmacion-correo` remains a legacy standalone success page.

Invite setup pages require an authenticated Supabase session after the invite callback. `/registro/vendedor/invitacion` completes a Particular seller profile and continues to `/vender`; `/registro/tienda/invitacion` completes a store-owner profile and continues to `/registrar-tienda` for the store application. Invite routing depends on `account_type` metadata when available. If metadata/profile type does not match the route, the page shows a recovery panel instead of changing account type blindly. Temporary passwords are not used.

The admin invite endpoint builds Supabase `redirectTo` URLs as `/auth/callback?next=/registro/.../invitacion`, so the app callback exchanges the Supabase code before sending the user to the seller/store setup page. Seller invite metadata stores `account_type='seller'` plus `invite_account_type='individual'`; store-owner invite metadata stores `account_type='store_owner'`.

Location onboarding uses `components/location-fields.tsx` with a fixed Peru region list from `lib/location.ts`. Region values are normalized to canonical labels such as `Junín`; city uses suggestions but remains free text after trimming.

## First-party events and owner analytics — production Sprint 4

`marketplace_events` stores typed events with canonical listing/store/seller relations, an optional Auth-verified actor, random session ID, timestamp, allowlisted source, bounded metadata, and replay keys. Raw tables and `record_marketplace_event()` are service-only; ordinary accounts receive aggregate RPC results, never a buyer directory or global event log.

The server obtains actors with Supabase `getUser()` and uses a signed random first-party `laria-marketplace-session` cookie: HttpOnly, SameSite=Lax, Secure in production, and 24-hour expiry. Browser payloads cannot supply actor/seller authority, arbitrary metadata, or administrative lifecycle events. No raw IP, invasive fingerprint, WhatsApp draft/message text, password, or token is product-event data.

Card impressions require at least 50% real viewport intersection and a visible document. Detail/store views are client-visible events, not SSR, HEAD, or prefetch effects. The database serializes a **rolling 30-minute** identity/entity/event window for impressions and views; authenticated identity survives session rotation, while anonymous identity is intentionally session-scoped. Owners and admins are excluded from ordinary commercial view/contact activity. Contacts are separate real click intents with event-ID replay protection, not deduplicated conversations or unique buyers. The WhatsApp UI uses the server's current canonical contact URL and a short bounded tracking deadline; telemetry failure preserves the existing safe destination.

Search/filter events carry a short-lived signed receipt of the existing server-parsed filters and actual result count; pagination is not a new filter. Submission-start receipts and transaction triggers record authoritative submission, approval, rejection, sold, store-application, approval, and verification transitions. Same-attempt transport/finalization retries cannot invent another logical lifecycle event; no historical synthetic events are backfilled.

`get_account_analytics()` checks the authenticated owner (or trusted admin) and performs grouped indexed aggregates. `lib/account-analytics.ts` validates its JSON and caches only within the current server render. Particular summary uses all owned listings, not the latest-five presentation list. Both management tables include real views/contacts, first-publication date, status, and sold date. Store Owners with a store have the real `/mi-cuenta/tienda/estadisticas` destination with lifetime/7-day/30-day windows (default 30).

Lifetime listing views use the preserved `view_count` cache, including pre-event history; new accepted detail events increment that same cache once. Seven/thirty-day views use only events. CTR is recorded detail views / recorded impressions; contact rate is recorded product contacts / recorded detail views in the same window. Zero denominators display `Sin datos`; unavailable RPCs display unavailable, never invented zero. Active inventory means currently approved **and public** (active parent store); sold counts mean current seller-marked state, not verified paid sales. Sprint 5 locally adds favorite metrics below; revenue, transaction analytics and the full admin analytics hub remain absent. `get_marketplace_admin_analytics()` supplies a restricted aggregate RPC foundation only.

## Sprint 5 global shell and Favorites — local only

The root server layout presents one global header and category tree around all routes, including admin. Header search uses native GET `/listados?brand=...`, the existing catalog parser and its signed search receipt; typing, focus and header rendering record nothing. Category/subtype links reuse `categoryOptions` and `getInstrumentTypeOptions`, including `Otro`. Native mobile details expose the same navigation; the authenticated account layout remains nested rather than replaced.

`MarketplaceAccountProvider` is a small client context, not a client renderer for server children. `/api/account-navigation` verifies `getUser()` and own profile/store state for hydrated header controls without adding public SSR Auth queries. The provider registers mounted listing IDs and batches up to 100 favorite states per private request. Unknown state remains disabled until a successful read. Session/route/focus changes invalidate cached state; server RPCs and protected layouts remain the authorization boundary.

`/api/favorites` accepts only same-origin authenticated state/mutation requests. `set_listing_favorite()` derives the owner from `auth.uid()`, locks the listing row, enforces public eligibility/self-favorite exclusion, and performs idempotent add/remove. Both account types share `/mi-cuenta/favoritos`, bounded to 24 items per page. Its security-definer reader exposes only the caller's relations, redacts nonpublic content, and permits recognizable sold history only beneath an active parent store. `/mi-cuenta/favoritos/[id]` resolves an owned relation or price notification to a currently safe public/sold destination, otherwise generic unavailability. Sold store detail URLs also require an active parent.

Live price UPDATE triggers record trusted OLD/NEW decreases and fan out typed notifications in the same transaction. The unique transition/recipient index, listing row lock shared with favorite mutations, and unchanged-price exclusion preserve exact current-recipient/retry semantics. Neither pending proposal edits nor nonpublic inventory sends alerts; relisted IDs inherit no favorite relation. No email worker or provider is introduced.

Favorite relation triggers emit trusted add/remove actions, not client-supplied administrative events. Existing guarded aggregate RPCs are extended by grouped queries; renamed internal implementations have no public/anonymous/authenticated execution grant. Current favorite counts are independent of selected period; additions/removals and additions/recorded-view rate use the same 0/7/30-day window. Raw buyer relations/events are never returned to sellers.

The duplicate-RUC carry-over defect began at the client attempt's retained `commitStarted` flag after a known transaction rejection. Explicit trusted `rejected` responses release that flag only before any uncertain outcome; network/unknown failures retain the exact signed retry lock. Correcting RUC safely starts a fresh attempt and cleans old uploads without losing the form's field/file values. Existing `PageNotice` focus and smooth scroll expose success/error feedback.

## Styling

Canonical visual guidance lives in `docs/design-system.md`. Read it before UI/design/frontend visual work.

The app uses Tailwind CSS 3-style config:
- `tailwind.config.ts`
- `postcss.config.js`
- `app/globals.css`

Tailwind includes content paths for:
- `app/**/*`
- `components/**/*`
- `components_v0/**/*`

Custom colors include legacy aliases such as `ink`, `brass`, `cedar`, and `mist`, shadcn-like tokens such as `background`, `foreground`, `card`, `primary`, `muted`, `border`, `input`, and `ring`, plus the current `laria.*` palette. Future UI work should prefer the Laria tokens and the rules in `docs/design-system.md`.

Current Laria visual tokens include `laria.yellow` (`#F1EA16`) for logo/major CTAs, `laria.blue` (`#6BA6FF`) for interface accents, `laria.black` (`#050608`) for header/footer/dark panels, `laria.cloud` (`#F1F3F5`) for light page backgrounds, `laria.fog` (`#E9EDF3`) and `laria.steel` (`#C8CDD6`) for borders, and `laria.muted` (`#9DA3AF`) for low-priority text.

Public page width is centralized in `components/page-container.tsx`. `PageContainer` uses the listings-page rhythm: `max-w-[1600px]` with `px-3 sm:px-4 lg:px-5 xl:px-6`. It is used by the public header/footer, homepage sections, `/listados`, `/instrumentos/[slug]`, `/tiendas/[slug]`, `/vender`, and `/registrar-tienda`. Admin pages remain on their existing admin-specific wrapper.

Do not blindly replace working Tailwind 3 global CSS with v0/Tailwind 4 CSS. Merge variables/config deliberately.

## Deployment Flow

```text
GitHub push -> Vercel auto-deploy -> site updates
```

But:

```text
GitHub push does not run Supabase migrations.
```

Database schema changes must be applied manually in Supabase SQL Editor unless CI/CD for migrations is later configured.

## Build Health Expectations

Before merging significant changes:
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Verify affected public pages.
- Verify Supabase reads/writes.
- Verify image uploads if forms/storage changed.
- Review Vercel deployment logs.

## Performance and reliability

See `docs/performance.md` for pagination, responsive images, streamed recommendations, narrowed authentication middleware, computed photo counts, and the signed `/api/submissions` workflow. Homepage sections are server components. The unused v0 UI library and animation/theme dependencies were removed.
