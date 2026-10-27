# Database and Supabase

This document reflects the actual current migration files and TypeScript types. `docs/functional-spec.md` is canonical for frozen V1 behavior; schema gaps recorded here are implementation gaps, not product exclusions.

## Supabase Usage

Supabase is used for:
- Postgres database tables.
- Row Level Security policies.
- Supabase Auth for admin login and the Phase 2 seller/store-owner account foundation.
- Storage buckets for listing photos and store images.
- RPC functions for admin checking, account ownership checks, publication validation, trusted event recording, and private account/admin aggregates.

Environment variables used in current code:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MARKETPLACE_EMAIL_PROVIDER`
- `MARKETPLACE_EMAIL_FROM`
- `MARKETPLACE_EMAIL_BASE_URL`
- `RESEND_API_KEY`
- `CRON_SECRET`
- `NEXT_PUBLIC_SITE_URL` (optional; canonical public origin, default `https://laria.audio`)
- `NEXT_PUBLIC_CONTACT_EMAIL` (official legal/privacy contact shown on legal pages; required before go-live)

Important:
- `NEXT_PUBLIC_SUPABASE_URL` should be only the base Supabase URL, for example `https://xxxxx.supabase.co`, not `/rest/v1/`.
- `SUPABASE_SERVICE_ROLE_KEY` is accessed through `lib/supabase/admin-client.ts` for trusted invite, email-lookup, submission, private-photo delivery/cleanup, and event-recording routes. The server-only event helper also uses it to sign first-party session and search-receipt HMACs.
- `SUPABASE_SERVICE_ROLE_KEY` must stay server-only and must never be exposed to browser code or prefixed with `NEXT_PUBLIC_`.

## Current Tables

## Planning Docs vs Current Schema

Older Laria business docs describe the intended model in product language. The current code and migrations use slightly different names in a few places:
- Listing seller fields are `contact_name` and `whatsapp_phone`, not `seller_name` and `seller_whatsapp`.
- Listing photos live in `listing_photos.image_url`, not a `photos` array on `listings`.
- Listing-level `is_featured` and `is_verified` do not exist yet. Verification is currently store-level through `stores.is_verified`.
- Store WhatsApp is `whatsapp_phone`, not `whatsapp`.
- Store plan exists as `listing_plan`; there is no separate `listing_limit` column yet.
- Current instrument types include plural values for some groups: `microphones`, `pedals`, and `amplifiers`.

Migration files and the live Supabase schema are the source of truth for current implementation only. The functional specification wins for required V1 behavior. Product names should become schema names only through an explicit migration and app update.

`lib/supabase/database.types.ts` includes the Phase 2 account tables, ownership fields, enums, and helper RPCs. Keep it aligned with later migrations. The PostgREST computed photo-count field uses explicit query result types because the SDK select parser does not infer computed columns.

### `public.profiles`

Purpose: one app-level profile per Supabase Auth user.

Added by `20260516180000_phase_2_accounts.sql`:
- `id uuid primary key references auth.users(id)`
- `full_name text`
- `phone text`
- `city text`
- `region text default 'Peru'`
- `account_type text default 'seller'`
- `created_at timestamptz`
- `updated_at timestamptz`

`account_type` is currently `seller`, `store_owner`, or `admin`. Admin authority still comes from Supabase Auth `app_metadata.role = "admin"`; profile `account_type` is app metadata, not the security boundary.

### `public.store_members`

Purpose: currently links store accounts to store records and technically supports multiple employees. Frozen V1 uses one effective owner account per store; employee/staff management is post-V1.

Added by `20260516180000_phase_2_accounts.sql`:
- `id uuid primary key`
- `store_id uuid references stores(id)`
- `user_id uuid references profiles(id)`
- `role text`
- `created_at timestamptz`

Roles are `owner`, `manager`, or `staff`. New stores with `owner_user_id` automatically create an owner membership.

### `public.stores`

Purpose: small music store profiles.

Actual columns represented in current code/types:
- `id uuid primary key`
- `name text not null`
- `slug text unique not null`
- `description text`
- `status store_status not null default 'pending'`
- `listing_plan store_listing_plan not null default 'free'`
- `contact_name text`
- `whatsapp_phone text not null`
- `city text not null`
- `region text not null default 'Peru'`
- `district text`
- `address text`
- `instagram_url text`
- `facebook_url text`
- `logo_url text`
- `banner_url text`
- `is_verified boolean not null default false`
- `owner_user_id uuid references profiles(id)` for Phase 2 store ownership
- `razon_social text`
- `ruc text`
- `contact_person text`
- `email text`
- `tiktok_url text`
- `website_url text`
- `rejection_reason text`
- `verification_lapsed_at timestamptz` and `verification_lapsed_from jsonb` (launch audit A09; private, no column grant)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Current behavior:
- Store applications require an authenticated `profiles.account_type='store_owner'`, bind `owner_user_id` server-side, and insert `status='pending'` with `listing_plan='free'`. Only `complete_public_submission` creates stores: `anon` and `authenticated` have no INSERT on `stores` (launch audit A06).
- `created_at` and `slug` are read-only outside the controlled functions. When the owner of a verified Tienda changes its name, RUC or razón social (compared after trimming, collapsing spaces and ignoring case; RUC digits only), the store stays active but `is_verified` turns false, `verification_lapsed_at` records when and `verification_lapsed_from` the verified values, and the store waits in Admin's "Verificación" queue. `set_store_verification` clears both fields either way; Admin's own edits keep the badge (launch audit A09).
- A partial unique index permits only one nonlegacy store per owner. Another unique index enforces normalized 11-digit RUC values.
- Public store pages only read `status='active'`; public listing/photo RLS also requires an active parent store.
- Basic approval produces `Tienda`. The admin-only verification RPC produces `Tienda Verificada` and atomically approves valid pending inventory.

Current V1 store boundaries:
- No paid store plans are active. Every store uses the same database-enforced 50-concurrent-listing cap counting only `pending` and `approved`.
- `is_verified` grants direct publication for qualifying new inventory and direct valid edits of approved inventory. A normal Tienda uses the same pending-revision path as a Particular for moderated edits.
- Existing code still uses `name` and `whatsapp_phone`; do not introduce duplicate `store_name` or `whatsapp` columns unless a later migration intentionally renames the app model.

### `public.store_photos`

Purpose: optional physical-store images used in the application/profile flow.

- `id uuid primary key`
- `store_id uuid references stores(id) on delete cascade`
- `image_url text not null`
- `alt_text text`
- `sort_order integer not null default 0`
- timestamps

Public reads require an active parent store. The authenticated owner and admin can manage rows under RLS.

### `public.listings`

Purpose: marketplace product listings from individuals or stores.

Actual columns represented in current code/types:
- `id uuid primary key`
- `store_id uuid references stores(id) on delete set null`
- `seller_type seller_type not null`
- `status listing_status not null default 'pending'`
- `title text not null`
- `slug text unique not null`
- `description text`
- `category text not null`
- `brand text`
- `model text`
- `condition text`
- `price_pen integer`
- `instrument_type text`
- `attributes jsonb default '{}'::jsonb`
- `published_at timestamptz`
- `view_count integer default 0`
- `owner_user_id uuid references profiles(id)` for Phase 2 listing ownership
- `sold_at timestamptz`
- `archived_at timestamptz`
- `created_by_source text default 'legacy'`
- `marketplace_rules_accepted_at timestamptz`
- `rejection_reason text`
- `hidden_source text` constrained to `owner`, `admin`, or the legacy backfill marker `legacy`
- `hidden_reason text`
- `hidden_at timestamptz`
- `relisted_from_listing_id uuid references listings(id) on delete restrict`
- `city text not null`
- `region text not null default 'Peru'`
- `contact_name text`
- `whatsapp_phone text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Important constraints:
- `slug` must be lowercase URL-safe words separated by hyphens.
- `price_pen` is stored as exact whole soles and must be positive for publication. Client and server parsing reject fractional, negative, unsafe, or reformatted values rather than applying fees or arithmetic.
- Individual listings must have `store_id is null`.
- Store listings must have `store_id is not null`.

Current behavior:
- Catalog/search pages only show `status='approved'`. A `sold` record remains resolvable by its exact detail slug through a trusted server read, but is not broadly public through table RLS.
- New individual submissions enter as `pending`.
- Trusted admin RPCs approve, reject, hide, and restore listings; rejection and administrative hiding require a reason.
- Phase 2 account-aware listings can be owned by `owner_user_id`; legacy listings keep `owner_user_id=null` and continue to display through existing contact fields.
- New self-service Particular listings always set `owner_user_id`, remain `pending`, and copy profile contact values only as a compatibility snapshot. Approved owned listings resolve current seller identity/contact from `profiles`.
- `created_by_source` tracks `legacy`, `self_service`, `admin_invite`, or `admin`.
- `published_at` is used for newest sort and detail metadata. If null, detail metadata falls back to `created_at`.
- `view_count` preserves the historical cache. After the production-applied Sprint 4 events migration, only an accepted, deduplicated detail-view event increments it; SSR/GET/prefetch rendering does not. Historical counts are not converted into fabricated events.
- Listing detail pages render `attributes` as user-facing specification rows through `lib/listing-specs.ts`, using labels/options from `lib/instrument-filters.ts`. Empty attributes are hidden and raw JSON should not be shown in the UI.
- Listing detail seller/store trust boxes count approved listings by `store_id` for stores and by `owner_user_id` for account-owned Particular listings; legacy individual listings retain the WhatsApp fallback.
- Seller and admin forms reuse `lib/instrument-filters.ts` for `instrument_type` and labeled `attributes` controls.
- Owners can hide an approved listing, restore only an owner-hidden listing, and mark it sold. Sold rows are immutable and can only be copied by the relist RPC.
- Relisted rows reference the sold source through `relisted_from_listing_id`; the source row is retained.
- `stock_state text` (STORE-1a, local only): `null` unless a store links the listing to an inventory item, then
  `in_stock` or `out_of_stock`. Controlled field, written only by the inventory functions. Stock never changes
  `status`; an out-of-stock listing keeps its URL with "Agotado" but leaves discovery and the index. A linked listing
  cannot become `sold`. See "Store inventory (STORE-1a)" below.

### `public.listing_photos`

Purpose: image records for listings.

Actual columns:
- `id uuid primary key`
- `listing_id uuid not null references listings(id) on delete cascade`
- `image_url text not null`
- `alt_text text`
- `sort_order integer not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Current behavior:
- Browse pages embed only the first related photo.
- Cards fetch additional photos on demand from `/api/listings/[id]/photos`.
- Detail pages fetch the full relation and render main photo plus additional thumbnails.
- Existing photo objects are not overwritten or deleted during owner edits. Proposed revision photos use new object paths and become live database photo rows only when the revision is approved.
- New Sprint 4 edit objects live in the private `listing-edit-photos` bucket and use durable `/api/listing-images/{ownerId}/listing-edits/{listingId}/{attemptId}/{index}.{ext}` references. Existing public/legacy URLs are preserved. Reorder/replacement/removal change the ordered complete photo set, not the bytes of an existing object.

### `public.listing_revisions`

Purpose: one pending moderated edit proposal per approved Particular or normal Tienda listing while the current live row remains public.

Key columns:
- `id uuid primary key`
- `listing_id uuid references listings(id) on delete restrict`
- `owner_user_id uuid references profiles(id)`
- `store_id uuid references stores(id)`
- `status text` constrained to `pending`, `approved`, `rejected`, or `cancelled`
- `version integer not null` incremented whenever the owner amends the active proposal
- `changed_fields text[]` containing only proposed moderated fields, including condition
- nullable proposed `title`, `category`, `instrument_type`, dependent `attributes`, `brand`, and `model`; attributes are included only when they must move atomically with a type change
- `rejection_reason text`
- submission/review timestamps and `reviewed_by`

A partial unique index on `listing_id` where `status='pending'` prevents a second pending revision. The owner may amend the locked pending row in place; fields restored to their live value leave the effective proposal, and an empty proposal becomes cancelled history. Owners can read only their own revisions; public roles have no access; admin review remains inside trusted RPCs.

### `public.listing_revision_photos`

Purpose: ordered proposed photo sets for revisions without mutating `listing_photos` early.

- `revision_id uuid references listing_revisions(id) on delete restrict`
- `image_url text`, `alt_text text`, and unique non-negative `sort_order`

An accepted revision replaces the live photo rows atomically inside the admin review transaction. Rejected proposals remain historical moderation evidence.

### `public.listing_edit_attempts` and `public.listing_photo_cleanup_claims`

Added by `20260916180000_sprint_4_photos.sql`, applied locally and in production:

- `listing_edit_attempts` stores an owner/attempt primary key, listing, SHA-256 payload hash, result, and timestamp. The owner-scoped edit RPC serializes the attempt and returns its prior receipt for the same payload without advancing the proposal version again; changed-payload replay fails. Listing/profile deletion cascades receipts.
- `listing_photo_cleanup_claims` has a `(bucket, path)` primary key and timestamp. The service-only claim RPC locks the owned listing, rejects foreign paths, and excludes every live or historical revision reference across listings before claiming an unreferenced object. The photo validator refuses subsequently claimed paths, closing the reference-check/Storage-delete race. Storage deletion can safely retry a previously claimed path.
- Both tables have RLS enabled with no `anon`/`authenticated` table grants. Failed/reverted uploads can be cleaned through the authenticated owner endpoint, not arbitrary browser Storage deletion. Approved, rejected, sold, and superseded history remains referenced; an owner-reverted empty proposal releases its unused photo component. There is no automatic orphan-retention scheduler.

### `public.marketplace_event_types` and `public.marketplace_events`

Added by `20260916200000_sprint_4_events.sql`, applied locally and in production. Its original extensible text/FK taxonomy contained 16 types:

`listing_impression`, `listing_view`, `store_view`, `whatsapp_contact`, `store_contact`, `search`, `filter_applied`, `listing_creation_started`, `listing_submitted`, `listing_approved`, `listing_rejected`, `listing_sold`, `store_application_started`, `store_application_submitted`, `store_approved`, `store_verified`.

Event rows contain UUID `id`, `event_type`, `created_at`, nullable listing/store/seller/actor/session/submission IDs, constrained `source`, bounded object `metadata`, `identity_key`, and unique nullable `dedupe_key`. Listing/store deletion cascades targeted events; deleted profiles null identity references. No historical events are backfilled.

- Raw tables have RLS enabled and no browser-role read/write grants. The service-only recorder checks its service role, validates targets, derives the seller/store relationship, and enforces public eligibility. The HTTP server obtains the actor from Auth and the anonymous identity from a signed random first-party session; payloads cannot supply actor/seller authority.
- Listing impressions/views and store views use a rolling 30-minute identity/entity window, preferring authenticated identity over session identity. An advisory transaction lock protects concurrent dedupe; the event UUID protects response-loss retries. Owner/admin commercial inspections are excluded. Separate explicit WhatsApp contact actions remain separate events.
- Search receipts are signed from existing canonical filters and the actual result count. Database validation bounds metadata and derives `zero_results`; there is no parallel search engine or zero-result event type. Contact events never contain WhatsApp messages/drafts, passwords, tokens, IP addresses, or user-agent fingerprints.
- Listing submission/approval/rejection/sold and store application/approval/verification triggers record real transitions inside their domain transaction. Creation/application-start events come from the trusted signed-submission start path. Sprint 5 added favorite lifecycle events; production Sprint 6 adds confirmation requested/confirmed/declined, transaction verified and review submitted, for 23 current types without historical backfill.
- Owner reports use one grouped aggregate RPC, not one query per listing. Lifetime views retain the historical `view_count`; 7/30-day views and ratio denominators use recorded events only. Active counts require approved listings with an active parent store where applicable. Sprint 6 keeps sold state separate from buyer-confirmed transactions and exposes only labelled counts/rates, never buyer identities, payment, delivery or revenue.

### Sprint 6 transaction, review, and review-report records

Added by `20260918120000_sprint_6_transactions_reviews.sql`; applied locally and in production on 2026-09-19.

- `transaction_claims` anchors every attribution attempt to one immutable sold listing, seller user, optional store and optional selected buyer. States are `pending`, `confirmed`, `declined`, `cancelled`, `superseded`, and `external`; a partial unique index permits only one active `pending`/`confirmed`/`external` relation per listing.
- `verified_transactions` has unique claim and listing references, immutable seller/store/buyer identity, the historical `sold_at`, database `verified_at`, and the exact `verified_at + 10 days` review deadline. Only buyer confirmation creates it, so external, declined, cancelled and unanswered claims never unlock reviews.
- `transaction_reviews` permits one `buyer_to_seller` and one `seller_to_buyer` row per verified transaction. Subject constraints attach buyer reviews to the Particular or store identity and seller/store reviews to the buyer. Rows are user-immutable; only reasoned admin hide/restore metadata changes, with append-only `review_moderation_actions` audit rows.
- Sprint 6 originally created `review_reports` for visible reviews. Sprint 8 renames the canonical table to `reports`, preserves IDs/history through a security-invoker compatibility view, and adds eligible listing/store targets plus resolve/dismiss state.
- Browser roles have no table grants. Owner/buyer access enters through guarded security-definer RPCs; public reputation reads only double-blind-revealed, non-admin-hidden buyer-to-seller reviews. The shared private aggregate can also compute seller-to-buyer reputation without creating a public buyer profile.
- Candidate lookup uses only authenticated `whatsapp_contact` events for the exact listing at or before `sold_at`, excludes the seller and any buyer who already declined/confirmed, and returns display name plus last contact time—never email, phone, raw event payload, or a searchable user directory.
- `get_admin_review_queue()` returns bounded transaction linkage plus revealed review/report context; an unpaired pre-deadline review is not disclosed to the admin UI. `moderate_review()` allows only hide/restore with a mandatory reason and cannot rewrite stars or comments.
- Notifications add typed claim/transaction targets for confirmation requests, decline/cancel, verification and paired-review reveal. Existing owner RLS and read-state behavior remain unchanged.

### `public.notifications`

Purpose: reusable in-app account notices for important moderation and store trust-state transitions without coupling core product state to email delivery.

- `user_id uuid references profiles(id) on delete cascade`
- constrained `event_type text`, Spanish `message text`, and typed listing/store/claim/transaction/review targets as required by the event
- `created_at timestamptz` and nullable `read_at timestamptz`
- listing/store target foreign keys cascade so removed QA/domain targets cannot leave invalid typed notices

Authenticated users have `SELECT` only for `user_id=auth.uid()`. `mark_notification_read(notification_id)` can set only `read_at` on an owned row; clients cannot rewrite ownership, event type, message, or target. A partial `(user_id, created_at)` unread index supports the account badge.

### Sprint 7 saved searches and marketplace email records

Added by production-applied migration `20260921120000_sprint_7_marketplace_email_alerts.sql`:

- `public.saved_search_alerts` owns one normalized JSON filter state, SHA-256 semantic hash, match bucket, `immediate`/`daily` frequency, `active`/`paused`/`deleted` state, prospective `active_since`, and timestamps per authenticated profile. A partial unique `(user_id, search_hash)` index prevents duplicate live alerts; owner SELECT uses RLS and owner mutations use guarded RPCs.
- `laria_private.listing_alert_publications` records the first time a listing identity is publicly eligible. The migration baselines existing public inventory without generating historical matches or deliveries.
- `laria_private.search_alert_matches` stores unique `(alert_id, listing_id)` matches, Lima match date, suppression state and optional delivery. The relation is never browser-readable; full profile cleanup cascades it, while normal alert deletion remains soft and preserves delivery history.
- `laria_private.marketplace_email_deliveries` is the durable outbox. It stores a constrained event type, trusted recipient profile, optional recipient email snapshot, typed domain references, bounded safe context, unique logical dedupe key, attempt/lock/retry state, provider ID, bounded failure category/code and sent timestamp. Rendered bodies and auth tokens are not stored.

`create_saved_search_alert`, `set_saved_search_alert_status`, and `delete_saved_search_alert` bind ownership to `auth.uid()`. Private matching applies current catalog semantics after category/type bucket narrowing. First publication, verified direct publication and store activation create matches; the same listing identity cannot match the same alert twice. Pausing/deleting suppresses unsent matches and cancels pending/retry/claimed alert jobs; resuming updates `active_since` and never backfills pause-period listings.

Only the service role may prepare daily deliveries, claim outbox rows, or complete/fail delivery. Claims use row locks with `SKIP LOCKED`; abandoned 15-minute claims become bounded retries. Daily dedupe is alert plus Lima date; immediate dedupe is alert plus listing. `get_pending_buyer_confirmation_count()` is an authenticated canonical `transaction_claims` count used by account navigation, not a notification count.

### Sprint 8 reports, Admin queries, audit, and legacy ownership

Added locally by `20260923120000_sprint_8_admin_reports_legacy.sql`; not applied to production:

- `reports` is the canonical private report table for `listing`, `store`, and `review` targets. Exactly one target column must match `target_type`; fixed reasons and bounded optional detail are enforced. A partial unique index permits one open report per `(reporter_user_id, target_type, target_id)` while preserving resolved/dismissed history and independent reporters.
- `submit_content_report()` derives the reporter from `auth.uid()`, blocks self-reporting, and validates public eligibility: approved/sold Particular listings, approved/sold inventory under an active store, active stores, and double-blind-revealed nonhidden reviews. Anonymous or ineligible-target calls fail without exposing target existence.
- Raw report reads and writes remain revoked from browser roles. `moderate_report()` is Admin-only and closes one report without changing its target. Listing/store/review moderation remains a separate trusted operation.
- `admin_audit_actions` is append-only and browser-inaccessible. Existing domain triggers plus explicit report/legacy operations record trusted Admin actor, action, target, time and bounded before/after context. Allowlisted Admin listing/store content edits are also recorded. `get_admin_audit_history()` is guarded and returns a bounded newest-first target history.
- `get_admin_moderation_counts()` and `get_admin_moderation_queue()` serve the six stable workbench tabs. The verification tab is truthfully empty because V1 has no owner verification-request state; active unverified Tiendas are valid, while manual verify/revoke remains under Tiendas. A review leaves the actionable review queue after it is hidden even while its open report remains independently actionable under Reportes.
- Dedicated/general Admin domain RPCs provide bounded search/filter/pagination for listings, revisions, stores, users, reports, reviews, transactions and legacy candidates; every privileged function rechecks Auth `app_metadata.role='admin'`. Transaction filters use the displayed canonical state; confirmation atomically creates a verified transaction, so the UI offers `verified` and omits the empty `confirmed` filter.
- Both revision readers return current/effective proposed scalar values and detailed attributes, plus ordered `current_photos` and staged `proposed_photos` bounded to 10 each. Unchanged values resolve from the current listing; Admin uses the existing authenticated lazy photo preview and compares formatted attributes without changing revision/version authority.
- Report-count subqueries branch by listing/store/review with equality on the active target and `IS NULL` on inactive target columns. The existing `reports_target_status_idx` covers these predicates; no additional partial index or pagination change is needed.
- Database edit-invariant triggers prevent allowlisted Admin edits from leaving an approved listing or active store below the existing publication/application requirements. The canonical `review_listing()` transition also supports the frozen Admin mark-sold action without creating a buyer or verified transaction.
- `link_legacy_listing_owner()` locks the listing, requires a genuinely eligible `owner_user_id IS NULL` legacy row and an existing account, assigns ownership once, and preserves listing identity, publication/sold/hidden state, photos, revisions and historical contact fallback. Repeat, reassignment, nonadmin and concurrent loser attempts fail.

## Enums

`seller_type`:
- `individual`
- `store`

`listing_status`:
- `draft`
- `pending`
- `approved`
- `rejected`
- `hidden`
- `sold`
- `archived`

`store_status`:
- `pending`
- `active`
- `hidden`
- `rejected`

`store_listing_plan`:
- `free`
- `starter_20`
- `growth_50`
- `pro_100`

Only `free` is used by the current public store registration flow.

## RLS Assumptions

RLS is enabled on:
- `profiles`
- `stores`
- `listings`
- `listing_photos`
- `listing_revisions`
- `listing_revision_photos`
- `listing_edit_attempts`
- `listing_photo_cleanup_claims`
- `marketplace_event_types`
- `marketplace_events`
- `store_members`
- `store_photos`
- `notifications`
- `saved_search_alerts`

The `laria_private` schema is revoked from `public`, `anon`, and `authenticated`; its first-public markers, alert matches and marketplace outbox have no browser table access.

Public read policies:
- Active stores are readable by `anon` and `authenticated`, but only through column grants (migration `20261022130000_store_public_columns.sql`): `id`, `name`, `slug`, `description`, `status`, `city`, `district`, `region`, `whatsapp_phone`, `logo_url`, `banner_url`, `is_verified`, `created_at`, `updated_at` and the four social/web URLs; `authenticated` also reads `owner_user_id`. RUC, razón social, e-mail, contact person, legacy contact name, street address, rejection reason and plan are private: the owner reads them with `get_own_store()`, Admin with `admin_get_store(p_store_id)`. A column added to `stores` later is private until a migration grants it.
- Individual approved listings are public; store listings additionally require an active parent store. `anon` and
  `authenticated` read only a listing's public columns, through column grants (`20261114140000`): the columns of
  `public.public_listings`, plus `rejection_reason`, `rejection_codes`, `hidden_source` and `hidden_reason` for
  `authenticated` (owners). The contact (`contact_name`, `whatsapp_phone`) and the internal fields are read on the
  server, and by Admin with `admin_get_listing(p_listing_id)`. Public pages that use a computed field
  (`photo_count:listing_photo_count`, `recent_price_drop_at`, `seller_verified_rank`) read them on `public_listings`,
  and the catalog's free-text search returns its rows (launch audit A27, below). A column added to `listings` later is
  private until a migration grants it.
- Profiles: a signed-in user reads their own, Admin every profile; visitors none (`20261114140000` dropped "Public can
  read profiles for approved listings"). A seller's name on a public page is read on the server.
- Listing photos follow the same combined listing/store eligibility predicate. Store photos require an active store.

Public insert policies:
- Anonymous store, listing, and listing-photo insert policies are removed. Legacy rows remain intact.

Account policies:
- Users can read and update their own profile; admins can read and update all profiles.
- Authenticated users can insert their own profile with `account_type='seller'` or `account_type='store_owner'`.
- Store owners/members can read their own stores and memberships.
- Store Owner accounts submit one pending owner-bound store application through `complete_public_submission`; there is no direct INSERT policy or grant on `stores` (A06).
- Store owners can update allowed store profile/business/contact fields and optional store photos. Protected authority fields are writable only through controlled review RPCs.
- Listing owners and store members can read their own manageable listings. Lifecycle and edit mutations use owner-scoped RPCs; triggers block direct changes to protected authority fields and make sold rows immutable.
- Listings are created only by the submission, copy and import functions (security definer); `anon` and `authenticated` have no INSERT on `listings` (A12). Server publication logic distinguishes normal Tienda from Tienda Verificada.
- Logo, banner and store photo addresses written through the API must point at the caller's own folder for that store in this project's `store-assets` bucket (`stores_guard_image_urls`, `store_photos_guard_image_url`, A32).
- Authenticated owners cannot mutate listing or live-photo rows directly; validated owner-scoped RPCs apply nonpublic/verified-store edits or stage approved Particular/normal-Tienda photo changes on a revision.
- Listing-photo objects are append-only from the browser beneath the authenticated owner folder; update/delete policies are removed so a historical object cannot be replaced or destroyed. Trusted server cleanup still removes failed-attempt uploads.
- Public users may read a profile only when it belongs to an approved account-owned Particular listing; this supports dynamic seller display without exposing unrelated profiles.

Admin policies:
- Admin read/update policies depend on `public.is_admin()`.
- `is_admin()` checks `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`.
- Admin users must be created in Supabase Auth and given `app_metadata.role = "admin"`.

## RPC Functions

`public.get_own_store()` / `public.admin_get_store(p_store_id)`:
- Return every column of the signed-in owner's store, or of any store for Admin (raises `ADMIN_REQUIRED` otherwise). SECURITY DEFINER; not callable by `anon`.

`public.admin_get_listing(p_listing_id)`:
- Returns every column of one listing for Admin (raises `ADMIN_REQUIRED` otherwise; `is_admin()` asks for the second sign-in step). SECURITY DEFINER; not callable by `anon`. Admin's listing editor reads the contact name and WhatsApp through it.

`public.is_admin()`:
- Used by the admin panel to verify access.
- Used by RLS policies for admin reads/updates.

`public.listing_has_status(listing_id, expected_status)`:
- Security definer helper used by photo RLS; approved store inventory also requires an active parent store. Callers can't execute it directly (A31).

`public.listing_is_public(listing_id)`:
- Central public predicate: approved Particular inventory, or approved store inventory whose parent store is active.

`public.increment_listing_view_count(p_listing_id uuid)`:
- Historical compatibility function; the production-applied Sprint 4 migration revokes public/anonymous/authenticated execution so it cannot bypass event dedupe. The HTTP compatibility endpoint uses the trusted event recorder instead.

`public.record_marketplace_event(event_type, session_id, event_id, actor_user_id, listing_id, store_id, source, metadata, submission_id)`:
- Service-only trusted write path with canonical attribution, public visibility, owner/admin exclusion, rolling dedupe, and accepted-view cache updates.

`public.get_account_analytics(days, owner_id)` and `public.get_marketplace_admin_analytics(days)`:
- Authenticated owner reports default to `auth.uid()`; only an admin may request another owner's aggregate. Global reports require admin authority. Supported periods are all recorded history (`0`), `7`, and `30` days; raw event/buyer directories remain inaccessible.

`public.is_store_member(store_id)`, `public.is_store_owner(store_id)`, and `public.is_approved_store_member(store_id)`:
- Security-definer helpers for account and store membership RLS. `is_approved_store_member` is no longer executable by callers (A31).

`public.can_manage_listing(listing_id)`:
- Security-definer helper that allows admins, listing owners, and store members to manage a listing.

`public.listing_meets_publish_requirements(listing_id)`:
- Checks 2–10 photos, a category-compatible instrument type, required brand/model/condition/location/contact fields, positive price, minimum description length, and accepted marketplace rules.

`public.complete_public_submission(id, kind, fields, photos)`:
- Remains service-role only and idempotent.
- For listings, requires a complete Particular profile and rules acceptance, inserts `owner_user_id`, `instrument_type`, `attributes`, a profile contact snapshot, `created_by_source='self_service'`, and `status='pending'` with 2–10 ordered photos.
- For `store`, requires a Store Owner profile and creates the complete owner-bound pending application with optional assets/photos.
- For `store_listing`, requires the owner-bound pending/active store, enforces 2–10 photos, and directly approves only when the store is active and verified.

`public.submit_listing_for_publication(listing_id)`:
- Requires a session: `anon` can't execute it, and a caller without `auth.uid()` is refused, so nobody can push an ownerless legacy listing back into review (A21).
- A valid Particular draft/rejected submission can only move to or remain `pending`; the owner cannot self-approve through this RPC.
- Store inventory remains pending for pending/normal stores and may become approved directly only for an active Tienda Verificada.
- Status transitions into `approved` are guarded by the shared publication requirements.

`public.review_store_application(store_id, decision, reason)`:
- Admin-only basic approval/rejection/hiding. Approval requires a complete application; rejection/hiding requires a persisted reason.

`public.set_store_verification(store_id, verified)`:
- Admin-only, row-locked atomic verification/revocation. Verification validates and approves the complete pending inventory set; other listing states are unchanged.

`public.resubmit_store_application(store_id)`:
- Owner-only trusted transition from rejected to pending after the required data is corrected.

`public.enforce_store_inventory_cap()`:
- Trigger invariant for inserts and counted-state transitions. A per-store advisory transaction lock prevents concurrent over-cap writes.

`public.update_owned_listing(listing_id, immediate_fields, moderated_fields, photos, attempt_id)`:
- Locks and validates the owner-bound listing. Price, description, location, and supported attributes apply immediately. Condition joins title, category, instrument type, brand, model, and photos in the moderated proposal for Particular and normal Tienda inventory.
- For approved Particular/normal-Tienda rows, title, category, instrument type, brand, model, and photos create one pending revision while the live row remains unchanged. Nonpublic rows and eligible verified-store rows apply the complete valid edit directly.
- If a pending proposal already exists, later moderated field/photo saves merge into that row under the listing lock, increment its version, preserve unchanged proposed values, and cancel it if no difference from live remains.
- A moderated instrument-type change carries its compatible dynamic attributes inside the same revision, preventing either the old or proposed public version from exposing a mismatched type/attribute pair.
- Proposed photo sets contain 2–10 unique URLs. Every URL must already belong to the live/pending photo set or resolve to an existing owned ≤5 MB JPEG/PNG/WebP private edit object at the exact listing/attempt path, using a literal-dot extension check. Admin promotion validates the retained pending references rather than treating the admin as the uploading owner.
- Optional `attempt_id` adds an idempotent receipt; existing four-argument calls remain compatible. New HTTP edit attempts use a signed owner/listing-bound token and the private upload folder.
- Store verification alone leaves an existing pending edit revision untouched. If the verified owner later applies a direct moderated/photo edit, that older pending proposal is atomically retained as `cancelled`/superseded so it cannot overwrite the newer live values.

`public.set_owned_listing_lifecycle(listing_id, action)`:
- Owner-only `hide`, `restore`, and `sold` transitions. Restore is allowed only for owner-hidden listings and reuses publication validation plus the store cap invariant. Marking sold cancels any pending revision; hiding leaves it pending, and later approval changes content without restoring visibility.

`public.relist_sold_listing(listing_id)`:
- Creates a new linked copy and copies the live photo references without mutating the sold source. Particular/normal-Tienda copies return to moderation; an eligible verified-store copy can publish directly.
- Retired: callers lost EXECUTE in launch audit A31 (it appended "-republicado-xxxx" to slugs). The app relists with `copy_owned_listing(listing_id, 'relist')` followed by `submit_listing_for_publication`.

`public.review_listing(listing_id, decision, reason)` and `public.review_listing_revision(revision_id, decision, expected_version, reason)`:
- Admin-only, row-locked moderation. Listing reject/hide and revision reject require a reason. Revision approval applies only proposed fields and an optional staged photo set in one transaction, preserving unrelated immediate edits and any current owner-hidden state. The expected version must match the locked pending row, so a stale admin screen cannot resolve an owner-amended proposal.

## Storage Buckets

`listing-photos`:
- Public bucket.
- Max file size: 5 MB.
- Allowed MIME types: JPEG, PNG, WebP.
- No public select policy since launch audit A10: files are served by public URL without one, and listing the bucket is not possible. The signed-in owner can read objects in their own top-level folder; anonymous insert is removed.
- Particular submissions upload through authenticated owner paths `{auth.uid()}/{submissionId}/{sortOrder}.{ext}`.
- New edit staging in this public bucket is denied. Existing public/legacy edit URLs already attached to live/pending records remain compatible and are not relocated by the migration.
- Signed completion and cleanup remain server-controlled and service-role credentials never reach the browser.

`listing-edit-photos`:

- Private bucket, ≤5 MB JPEG/PNG/WebP objects.
- Authenticated editable-listing owners may append beneath `{auth.uid()}/listing-edits/{listingId}/{attemptId}/{sortOrder}.{ext}`; browser overwrite/delete is not granted.
- `/api/listing-images/[...path]` checks references before streaming bytes through the server-only Storage client. Approved live inventory or retained sold-history photos are public only with an active parent store where applicable. Owner/admin may read retained nonpublic live/revision references; unrelated and unreferenced uploads return 404, including to their uploader before attachment.
- Responses are `private, no-store` with `nosniff`. Approval promotes the database references atomically without copying bytes to a public bucket. Rejected/superseded revision objects and sold/relist source references are protected from cleanup.
- `POST /api/listings/[id]/photo-cleanup` authenticates the exact owner and uses `claim_listing_photo_cleanup` before Storage removal; protected/referenced paths are omitted rather than deleted.

`store-assets`:
- Public bucket.
- Max file size: 5 MB.
- Allowed MIME types: JPEG, PNG, WebP.
- No public select policy since launch audit A10 (files are served by public URL); the signed-in owner can read their own top-level folder; anonymous insert is removed.
- Store applications and profile edits upload optional logo, banner, and physical-store photos under `{auth.uid()}/{submissionOrStoreId}/...`.
- Authenticated Store Owners can upload/update/delete only beneath their own top-level folder.

`store-imports` (STORE-2, local only):
- Private bucket, ≤5 MB, `text/csv` and `.xlsx` only.
- The owner may insert exactly `{auth.uid()}/{sessionId}/source.{csv|xlsx}` while that import session awaits its file, and read it; no update or delete. Files are deleted through the service-role cleanup route after the 30-day retention.

`store-import-photos` (STORE-3a, local only):
- Private bucket, ≤5 MB, JPEG/PNG/WebP. The owner may insert only at a server-issued path `{auth.uid()}/{sessionId}/{assetId}.{ext}`, once, while that asset waits for its upload and the import is between `ready` and `partially_committed`; owner and Admin read; no browser update or delete.
- Served publicly only through `/api/listing-images/{uid}/import-photos/{session}/{asset}.{ext}` when a public listing references it (owner/Admin otherwise), with the stored MIME type, `nosniff` and a sandbox CSP.

Legacy limitation: initial listing photos and store assets remain in public buckets for existing URL/image compatibility. Database moderation prevents discovery but cannot make a known existing public Storage URL private. Sprint 4 guarantees private staging/access gating for new listing edit objects; it does not claim to revoke previously public URLs. Abandoned initial uploads still require operational retention cleanup.

## Indexes and Metadata

Important listing indexes include:
- `listings_status_idx`
- `listings_seller_type_idx`
- `listings_store_id_idx`
- `listings_category_idx`
- `listings_brand_idx`
- `listings_city_idx`
- `listings_price_pen_idx`
- `listings_created_at_idx`
- `listings_instrument_type_idx`
- `listings_published_at_idx`
- `listings_view_count_idx`
- `listings_attributes_gin_idx`
- `listings_search_idx`

`attributes` uses a GIN index because advanced filters rely on JSONB containment.

Sprint 4 event indexes cover recent timestamps, listing/type/time, store/time, seller/time, and identity/time, plus a partial authenticated buyer/listing contact index for future eligibility without exposing a user directory. The event UUID and unique `dedupe_key` protect retries/funnel uniqueness. Account/admin counts are grouped SQL aggregates; no per-card/per-listing event-count request is introduced.

## Migrations

Current migrations:
- `20260427195000_initial_marketplace_schema.sql`: base tables, enums, indexes, triggers, RLS.
- `20260427202000_listing_photo_storage.sql`: `listing-photos` bucket and policies.
- `20260427203000_store_registration_fields.sql`: store fields, `store-assets` bucket and policies, pending free store insert policy.
- `20260427204000_store_verification.sql`: `is_verified`.
- `20260503120000_listing_marketplace_metadata.sql`: `instrument_type`, `attributes`, `published_at`, `view_count`, indexes.
- `20260503233000_increment_listing_view_count.sql`: view count RPC.
- `20260516180000_phase_2_accounts.sql`: profiles, store members, ownership columns, lifecycle fields, account RLS helpers, owner/member RLS policies, publication validation RPC, and authenticated owner-folder storage policies.
- `20260910190000_store_sprint_2.sql`: Store Owner/application ownership, normalized unique RUC, optional store photos, active-parent public visibility, trusted review/verification RPCs, verified direct publication, and serialized 50-item cap.
- `20260913120000_listing_sprint_3.sql`: listing lifecycle reasons/provenance, immutable sold history and relist lineage, pending revisions and proposed photos, owner/admin moderation RPCs, append-only listing-photo storage, and cap-safe restoration/relisting.
- `20260916120000_sprint_3_1_acceptance_fixes.sql`: amendable/versioned pending revisions, stale-admin protection, proposal photo reuse, owner notifications/RLS/read state, and lifecycle notification events.
- `20260916180000_sprint_4_photos.sql`: private edit bucket, corrected photo-path/admin validation, reference-safe cleanup claims, SHA-256 edit-attempt receipts, and owner-revert photo-reference release.
- `20260916200000_sprint_4_events.sql`: 16-type trusted event foundation, raw-log RLS, transactional lifecycle events, rolling dedupe/cache compatibility, and grouped private owner/admin analytics.
- `20260917120000_sprint_5_favorites.sql`: private favorites, trusted add/remove actions, atomic price-drop notifications, safe history/destination RPCs and favorite aggregate extensions. All 16 migrations are applied locally and in production; Sprint 5 production migration history was verified on 2026-09-18.
- `20260918120000_sprint_6_transactions_reviews.sql`: verified-transaction claims, buyer confirmation, immutable double-blind reviews, review reports/moderation, typed notifications, verified funnel metrics, guarded event transport, RLS and concurrency indexes. All 17 migrations are synchronized locally and in production; the Sprint 6 release history was verified on 2026-09-19.
- `20260921120000_sprint_7_marketplace_email_alerts.sql`: normalized owner alerts, prospective first-public matching, private match/outbox records, notification/price-drop email eligibility, service-only daily/claim/complete/fail RPCs and pending-buyer account count. All 18 migrations apply from a clean local reset and are synchronized with production; Sprint 7 production history was verified on 2026-09-22.
- `20260923120000_sprint_8_admin_reports_legacy.sql`: general private reports, report moderation, bounded Admin workbench/domain reads, append-only privileged-action audit and atomic one-time legacy ownership linking. All 19 migrations apply from a clean local reset; this nineteenth migration is local-only and production remains at the synchronized Sprint 7 history.
- `20261023120000_store_inventory_foundation.sql` (STORE-1a, local only, not applied to production): store inventory tables, append-only stock ledger, owner and Admin functions, `listings.stock_state` and its listing triggers. See "Store inventory (STORE-1a)".
- `20261024120000_store_inventory_ui.sql` (STORE-1b, local only): `get_inventory_summary()` adds recorded sales and recent movements; bulk threshold and bulk hide functions. See "Store operations: later sub-sprints".
- `20261025120000_store_inventory_import.sql` (STORE-2, local only): spreadsheet import sessions and staged rows, private `store-imports` bucket, step/commit functions, ledger FK `import_session_id`, saved column mapping, retention job. See "Store operations: later sub-sprints".
- `20261026120000_store_import_photos.sql` (STORE-3a, local only): import photo assets and assignments, private `store-import-photos` bucket, matching, listing-photo validator branch and attachment guard, photo cleanup. See "Store operations: later sub-sprints".
- `20261027120000_store_import_publication.sql` (STORE-3b, local only): per-store listing allowance read by the cap trigger, Admin allowance function, shared `insert_store_listing`, publication of import rows. See "Store operations: later sub-sprints".
- `20261028120000_pay_1_store_payment_methods.sql` (PAY-1, local only): accepted payment methods with Admin review and history, public read functions, purchase-intent metadata on `whatsapp_contact`. See "Store operations: later sub-sprints".
- `20261029120000_review_fixes_payment_methods.sql` … `20261029120300_review_fixes_photo_cleanup.sql` (review fixes A, local only): fixes from the Codex review of the Store Operations prototype. See "Store operations: review fixes" and `docs/store-operations/review-fixes.md`.
- `20261030120000_store_review_fixes_ux.sql` (review fixes B, local only): SKU category and category counts for Inventario, owner-entered publication fields on import rows, no publication hint on rows with nothing to publish. See "Store operations: review fixes".

Sprint 4 release state: both migrations were applied to production in order on 2026-09-17 and the exact committed application `427ac8e8aa514ae10a47c0a4d2eee3dfe827ccaa` was promoted immediately afterward. All 15 migration versions are synchronized. Private staging, trusted event writes, owner-only aggregates and exact permission denials passed production checks without changing hosted `supautils.hint_roles` or broadening grants. Baseline 36 listings, 62 photos, 5 stores, 1 revision, 3 notifications and historical view total 2643 were preserved; temporary QA resources were removed. See `docs/sprint-4-production-verification.md`.

Production history note:
- The six pre-Phase-2 migrations describe the historical baseline that already existed in production. Earlier schema work was originally applied manually in Supabase SQL Editor, then Supabase migration history was repaired so the CLI would not replay those files.
- Do not re-apply old baseline migrations blindly against production. Use `supabase migration list` first and apply only pending migrations through the CLI or a carefully reviewed SQL path.
- `20260516180000_phase_2_accounts.sql` was applied to local Supabase and pushed to production through Supabase CLI during Phase 2 Ticket 2.

## Manual Migration Reminder

Vercel does not apply database migrations automatically.

When adding tables, columns, indexes, policies, RPCs, or storage buckets:
1. Create a migration file in `supabase/migrations`.
2. Review the SQL.
3. Prefer `supabase migration list` and `supabase db push` when the CLI is logged in and linked.
4. If using SQL Editor manually, verify migration history/state afterward so old migrations are not replayed later.
5. Deploy code only after production Supabase has the required schema.
6. Give every UPDATE and DELETE in a function or trigger a WHERE clause (`where true` when every row is meant).
   Supabase loads pg_safeupdate for API connections, which refuses one without, the statements of the functions and
   triggers an API call runs included; local Postgres and the migration connection don't load it, so only production
   fails. `tests/api-safeupdate.integration.cjs` scans every function of `public` and `laria_private` after a reset.

## Missing V1 Data Models and Post-V1 Concepts

After the local Sprint 8 implementation, the remaining frozen V1 data/product gaps are category pages and final legal/safety content. General reports, the full moderation-first Admin Hub and manual legacy ownership linking are locally complete but not production-deployed. Search alerts and centralized marketplace email delivery remain production-deployed in Sprint 7; `ALERT-005` and `TX-018` remain the exact outstanding Sprint 7 owner cases. Sprint 6 verified transactions, two-way reviews and verified funnel metrics are production-deployed and owner-accepted.

## Sprint 5 private favorites and price drops — deployed

- `favorites`: `(user_id, listing_id)` primary key, cascading profile/listing references, timestamp, listing lookup and owner/recent indexes. Authenticated SELECT is RLS-scoped to `auth.uid()`; anonymous access and direct account DML are revoked. Mutation is only through `set_listing_favorite(uuid, boolean)` with trusted owner, public listing/active-parent checks, self exclusion and listing `FOR UPDATE` serialization. Removal remains available for unavailable history.
- `listing_price_drops`: private transition UUID, listing FK, authoritative OLD/NEW prices and timestamp; decrease/nonnegative constraint and listing/time index. No ordinary account table grants.
- `notifications`: adds `listing_price_drop`, transition FK and typed old/new prices. Metadata constraints and unique `(user_id, price_drop_id)` prevent malformed/duplicate delivery; recipient/listing index supports safe target resolution. Existing recipient RLS, immutable fields and trusted read RPC remain unchanged.
- `notify_favorite_price_drop()`: AFTER live price UPDATE, requires OLD/NEW approved, active parent/public eligibility and a lower price. Inserts one transition plus all current recipients atomically. Same-price/increase/nonpublic edits produce none; each later decrease may notify again. Favorite mutation locks serialize against the same listing UPDATE. Rejected/hidden/sold/archived and proposal-only changes never publish alerts.
- `get_account_favorites(integer)`: trusted own relations, stable 24-item pagination, sold history under active parents and null title/slug/price/image for unavailable entries. `get_favorite_destination(uuid)` additionally accepts the caller's own price-drop notification and never reveals private listing content.
- `capture_favorite_event()`: INSERT/DELETE lifecycle actions emit `favorite_added`/`favorite_removed`, taking the actor from the trusted relation/auth context. Idempotent operations and cascading cleanup do not invent events. The event taxonomy is now 18 locally and in production; the external service recorder still rejects forged favorite lifecycle events.
- Guarded account/admin aggregate wrappers separate current relation totals from period actions and compute favorite rate as additions / recorded detail views for the same period (`NULL` with no denominator). Their renamed internal implementations cannot be directly executed by ordinary users; sellers see counts/rates, never raw favoriting users.

No historical migration, seed ownership, existing listing/store lifecycle, paid-plan authority or 50-listing invariant is rewritten.

The existing `profiles` table is the Particular/store-owner identity foundation; do not add a separate seller-only account that would prevent one Particular from buying and selling.

Post-V1 concepts include `featured_listing_orders` and `store_plan_subscriptions`. The existing paid-sounding store-plan enum values are legacy schema possibilities, not active V1 products.

## September 2026 reliability migration

`20260909120000_marketplace_performance.sql` adds an RLS-aware computed photo count, a service-only indexed email lookup, first-approval timestamps, bounded-browsing indexes, and atomic idempotent public submissions. See `docs/performance.md` for behavior and rollback-only verification.

`20260910100000_particular_sprint_1.sql` binds Particular submissions to profiles, enforces the 2–10 contract in the publication RPC, removes anonymous listing creation/upload policies, enables approved seller-profile resolution, and adds minimum-preserving owner photo deletion.

`20260910120000_sprint_1_owner_acceptance_fixes.sql` updates the Auth user trigger to persist normalized signup name, WhatsApp, city, and region without duplicate onboarding, safely fills only missing/default values on existing profiles from Auth metadata, and allows the shared `instrument_type='other'` fallback for supported categories.

`20260913120000_listing_sprint_3.sql` adds owner lifecycle management, moderated revision isolation, sold immutability, copied relisting, owner-visible moderation reasons, admin review operations, and append-only edit uploads without weakening legacy or Sprint 2 store behavior.

## Canonical instrument catalog (`catalog_*` tables)

Added by the 25 migrations `20260927120000_canonical_catalog.sql` … `20261021120000_catalog_attribute_value_es.sql`.
Reference data for listing autofill, Jev and category navigation (post-V1, see `functional-spec.md`); it changes no
marketplace table, RLS policy or listing behavior. The only application read so far is the category navigation's
brand list (`lib/catalog-brands.ts`, read-only, on branch `ux/catalog-category-nav-0ueck4`).

- **Identity:** `catalog_manufacturers` (+ `catalog_manufacturer_aliases`), `catalog_products` (manufacturer + model key +
  identity domain; `entity_level` model / family, `family_product_id`), `catalog_product_aliases`,
  `catalog_product_variants` (SKU, GTIN, finish, colour, size, configuration), `catalog_product_families`.
- **Taxonomy:** `catalog_categories`, a tree (`parent_id`, `depth`) with Spanish labels and terms, mapped to
  `listings.category` / `listings.instrument_type` through `laria_category` / `laria_instrument_type`;
  `catalog_category_terms` (materialized view).
- **Detail:** `catalog_product_attributes` holds one normalized value per (product, attribute) with `value_es` (the
  Spanish display text), provenance, weight, `trusted` and conflicting values. On `catalog_products`:
  - `detail_status`, `missing_attributes`, `untrusted_attributes`: whether a product is detailed enough to autofill;
  - `variant_attributes`: attributes that differ between variants, so they are filled only from the variant a listing
    names.
- **Matching:** `catalog_lookup(query, manufacturer_hint, max_results)` returns ranked candidates.
  `catalog_match(query, manufacturer_hint)` decides MATCH / FAMILY / CONFLICTING / INSUFFICIENT with a tier (AUTO /
  REVIEW / INSUFFICIENT). `catalog_jev_inputs(query, manufacturer_hint)` is Jev's one-row contract. Helpers:
  `catalog_normalize()`, `catalog_compact()`; vocabulary table `catalog_lookup_terms`.
- **Gap queue:** `catalog_search_log` with a daily `pg_cron` prune job (`catalog-search-log-prune`, 08:30 UTC); `catalog_search_gaps` (view).
- **Review:** `catalog_review_candidates`, `catalog_review_decisions` and admin RPCs (`get_catalog_review_queue`,
  `decide_catalog_review`, …).
- **Provenance:** `catalog_sources`, `catalog_product_sources`, `catalog_source_records`, `catalog_product_specs`,
  `catalog_product_external_ids`, `catalog_conflicts`.
- **RLS:** reference tables are public read-only; raw records, conflicts and the review queue are admin-only; writes go
  through the service role / loader. Extensions: `pg_trgm`, `unaccent`, `fuzzystrmatch`, `pg_cron`.

**Production data** is the reduced Peruvian-market catalog: every product of the 170 brands Peruvian stores sell or
list (20,386 products), every brand name, and only the tables the site reads. Raw payloads, specs, external IDs and
conflicts stay empty; provenance is kept only for review pairs. That is about 80 MB.
- **Where it lives:** the catalog pipeline, its data and the full catalog (29,001 products) are on branch
  `catalog/canonical-catalog`, not in `main`.
- **How it is loaded:** with `catalog/scripts/ops/load_production.sh` from that branch's worktree. The loader stops
  before commit above 450 MB and writes the loaded build (profile, brands, products, checksum) as the comment on
  `catalog_products`.
- **Details:** sizes, guards and procedure are in that branch's `catalog/docs/production_footprint.md`.
- `lib/supabase/database.types.ts` is regenerated for these tables in the sprint that first reads them.

## Store inventory (STORE-1a)

Added by `20261023120000_store_inventory_foundation.sql`; local only until the owner approves a production apply.
Design: `docs/store-operations/design.md`; implementation notes, deviations, rollback runbook and review guide:
`docs/store-operations/store-1a.md`.

- **Tables:** `store_operation_settings` (pilot gate `inventory_enabled`, default off; missing row = off),
  `store_inventory_items` (one per SKU; stock, price, threshold, catalog product FK and variant soft link, optional
  link to one listing of the same store through the composite FK `(listing_id, store_id) → listings(id, store_id)`),
  `store_stock_movements` and `store_inventory_changes` (append-only: no browser grants, triggers raise on update,
  delete and truncate), `laria_private.store_inventory_batch_receipts` (bulk idempotency).
- **RLS:** owner `SELECT` through `is_store_owner(store_id)`, Admin `SELECT` through `is_admin()`; no browser writes.
- **Owner functions:** `create_inventory_item`, `update_inventory_item`, `change_inventory_sku`,
  `record_stock_movement`, `apply_bulk_stock_operations`, `preview_inventory_price_bulk`, `set_inventory_price_bulk`,
  `link_inventory_listing`, `unlink_inventory_listing`, `archive_inventory_item`, `unarchive_inventory_item`,
  `get_inventory_page`, `get_inventory_summary`. Admin: `admin_set_store_inventory_enabled` (reason required,
  audited). Lock order on every path: idempotency key (advisory) → linked listing → item.
- **Listing triggers:** `listings_guard_inventory_managed` (no `stock_state` on insert; a linked listing cannot become
  `sold`), `listings_sync_inventory_price` (listing price edits write through to the item). Changed functions:
  `protect_listing_admin_fields`, `notify_favorite_price_drop`, `capture_listing_alert_publication` (and its trigger,
  now also on `stock_state`), `capture_store_alert_publication`, `complete_public_submission` (`inventory_item_id`).
- **Tests:** `tests/store-ops-1.sql` (rolled back) and `tests/store-ops-concurrency.integration.cjs` (separate
  connections, local only).


## Store operations: later sub-sprints

Combined on branch `store-ops/prototype` for the owner's review; local only, nothing applied to production. Per
sub-sprint detail, deviations, rollback and review guides: `docs/store-operations/store-1b.md`, `store-2.md`,
`pay-1.md`, `store-3a.md`, `store-3b.md`. The combined review package is
`docs/store-operations/prototype-review.md`.

- **STORE-1b, Inventario screens** (`20261024120000_store_inventory_ui.sql`): `get_inventory_summary()` replaced
  (adds `sales_30d_units`, `sales_30d_count`, `hidden`, `recent_movements`); `set_inventory_threshold_bulk(ids,
  threshold, key)` and `hide_inventory_listings_bulk(ids, key)` (receipt + replay, all-or-nothing for the threshold;
  hide calls the V1 `set_owned_listing_lifecycle` per listing and reports skipped SKU). No new tables.
- **STORE-2, spreadsheet import** (`20261025120000_store_inventory_import.sql`):
  - `store_import_sessions` (status machine `awaiting_upload` → `parsing` → `mapping_required` → `validating` →
    `ready` → `committing` → `committed` / `partially_committed`, or `failed` / `cancelled` / `expired`; lease
    `lock_token` + `locked_until`; `version`; one open import per store by partial unique index) and
    `store_import_rows` (raw ≤ 32 KB, parsed values, issues, planned action and changes, owner decision, commit
    status). RLS: owner and Admin `SELECT`; writes only through functions.
  - `store_stock_movements.import_session_id` (FK) with a check that import movements carry their row number;
    `store_operation_settings.import_mapping_default`; `laria_private.store_import_file_deletions` (cleanup queue).
  - Owner functions: `create_store_import_session`, `claim_store_import_step` / `release_store_import_step` (90 s
    lease), `begin_store_import_parse`, `stage_store_import_rows`, `finish_store_import_parse`, `fail_store_import`,
    `confirm_store_import_mapping`, `plan_store_import_rows`, `finish_store_import_validation`,
    `set_store_import_rows_decision`, `start_store_import_commit`, `commit_store_import_chunk` (≤ 50 rows, savepoint
    per row, key `import:{session}:{row}`), `finish_store_import_commit`, `reopen_store_import`,
    `cancel_store_import`. Service role: `claim_store_import_file_deletions`, `complete_store_import_file_deletions`.
  - `pg_cron` job `store-import-retention` daily at 09:15 UTC (`laria_private.run_store_import_retention()`): idle
    imports expire after 7 days; rows purged and files queued 30 days after close.
- **STORE-3a, import photos** (`20261026120000_store_import_photos.sql`):
  - `store_import_photo_assets` (one per file: sanitized name, claim from the name, the `Foto(s)` column or a photo
    list, server check result, sha256, match outcome, cleanup timestamps) and `store_import_photo_assignments`
    (asset → row, order 1–10, deferrable unique order); `store_import_rows.photo_state` / `photo_count`,
    `store_import_sessions.photo_counts`. RLS: owner and Admin read; writes through functions.
  - Owner functions: `request_store_import_photo_uploads` (≤ 25 per call, 600 per import), `place_store_import_photo`,
    `order_store_import_photos`, `reset_store_import_photo_matching`. Service role only:
    `record_store_import_photo_checks` (the owner can never validate their own bytes),
    `claim_store_import_photo_deletions`, `complete_store_import_photo_deletions`.
  - `laria_private.match_import_photos` re-runs after every upload; uncertain photos are set aside, never guessed;
    manual placements are kept. `listing_photo_set_is_valid` gains an import-photo branch, and a trigger on
    `listing_photos` and `listing_revision_photos` refuses any import-photo URL not valid for that listing's owner and
    store. Cancel, expiry, failure or the 30-day purge discards assets no listing or revision references.
- **STORE-3b, publication from an import and the listing allowance** (`20261027120000_store_import_publication.sql`):
  - `enforce_store_inventory_cap()` replaced: reads `laria_private.store_listing_allowance(store)` (the store's
    `store_operation_settings.listing_allowance`, default 50) after the existing per-store advisory lock; what counts
    is unchanged (pending + approved listings of the store). Message `STORE_INVENTORY_LIMIT_REACHED: La tienda ya
    tiene N publicaciones concurrentes.`
  - `get_store_listing_quota(p_store_id default null)` (owner's own store, any store for Admin) and
    `admin_set_store_listing_allowance(store, allowance 1–2000, reason)` (same advisory lock, audited as
    `store_listing_allowance_changed`; lowering hides nothing).
  - `laria_private.insert_store_listing(id, store, fields, photos)`: the store-listing body of
    `complete_public_submission`, now shared by the sell form and the import; optional `inventory_item_id` link.
  - `publish_store_import_rows(owner, session, rows, rules_accepted)` (service role, ≤ 20 rows, one subtransaction
    per row; price from the SKU, photos from the row's validated import photos, contact data from the store; "Sin cupo"
    over the allowance; idempotent). `store_import_rows` gains `publish_status`, `publish_message`,
    `published_listing_id` (unique), `published_at`; `store_import_sessions` gains `publish_counts`.
- **PAY-1, accepted payment methods** (`20261028120000_pay_1_store_payment_methods.sql`):
  - Enum `store_payment_method` (`efectivo_al_recoger`, `yape_plin`, `pos_tarjeta_al_recoger`, `link_de_pago`);
    `store_payment_methods` (one row per store and method: status `pending_review` / `approved` / `rejected` /
    `disabled` / `withdrawn`, `holder_name` owner/Admin only, public `provider_label`, `owner_note`, review fields);
    `store_payment_method_changes` (append-only history). RLS: owner and Admin read; no direct writes.
  - Trigger `stores_review_payment_methods_on_business_change`: a RUC or razón social change sends approved methods
    back to review.
  - Functions: `set_store_payment_method`, `withdraw_store_payment_method` (owner),
    `admin_review_store_payment_method`, `get_admin_store_payment_methods` (Admin), `get_store_payment_methods`,
    `get_listing_purchase_request` (anyone; approved methods only while the store is active and verified, checked at
    read time; never the holder). `laria_private.record_marketplace_event_service` accepts exactly
    `{"intent":"purchase"}` as metadata on `whatsapp_contact`.
  - No amount, paid state, payment URL, reservation or order is stored anywhere.

## Store operations: review fixes

Fixes from the Codex review of the prototype, branch `store-ops/review-fixes-core`; local only. What each one fixes and
why is in `docs/store-operations/review-fixes.md`. Long functions are patched from their current definition by
`pg_temp.review_fix(function, old, new, …)`, which fails unless each old text occurs exactly once.

- `20261029120000_review_fixes_payment_methods.sql`: `laria_private.assisted_commerce_settings` (singleton,
  `pilot_enabled` default false) with `laria_private.assisted_commerce_pilot_enabled()` and
  `laria_private.set_assisted_commerce_pilot(enabled, reason)` (database owner only); `store_payment_methods.revision`
  (bumped by trigger on every update); `admin_review_store_payment_method(store, method, decision, reason,
  expected_revision integer)` replaces the `expected_updated_at` version; provider labels from a fixed list per method;
  stricter free-text filter; a RUC or razón social change also moves pending methods' revision. With the pilot off,
  `set_store_payment_method` refuses (`PAYMENT_PILOT_OFF`) and the public reads return nothing.
- `20261029120100_review_fixes_lock_order.sql`: store rows are locked `FOR NO KEY UPDATE` (not `FOR UPDATE`) in
  `complete_public_submission`, `resubmit_store_application`, `review_store_application`, `set_store_verification`,
  `submit_listing_for_publication`, `admin_set_store_inventory_enabled`, `admin_set_store_listing_allowance` and
  `publish_store_import_rows`; publication locks an unlinked SKU before reading its price; `link_inventory_listing`
  locks the SKU directly; `guard_import_photo_reference()` locks the asset `FOR NO KEY UPDATE` and refuses a photo
  another listing or another listing's revision uses.
- `20261029120200_review_fixes_alerts_and_import.sql`: `search_alert_matches.suppression_reason` accepts
  `listing_out_of_stock`, index `search_alert_matches_delivery_idx`; `claim_marketplace_email_deliveries` cancels
  queued price-drop and search e-mails of out-of-stock listings and digests left empty; first-public matching during
  an import row waits for its price (`laria_private.capture_deferred_listing_publication`); `confirm_store_import_mapping`
  refuses once a row is applied (`IMPORT_MAPPING_LOCKED`); `mark_import_duplicates` includes rows already in error.
- `20261029120300_review_fixes_photo_cleanup.sql`: `store_import_photo_assets.reference_checked_at` and a partial index;
  `laria_private.discard_detached_import_photos(limit)`, run by `claim_store_import_photo_deletions` when called
  without a session, discards validated photos of closed or purged imports that nothing references any more.
- `20261030120000_store_review_fixes_ux.sql` (branch `store-ops/review-fixes-ux`, section B of the review-fixes doc):
  trigger `store_import_rows_drop_linked_publication_hint` clears the "Para publicar falta…" issue on planned update or
  adopt rows whose SKU already has a publication; nullable `store_inventory_items.category` (valid taxonomy key), set
  by trigger `store_import_rows_record_item_category` when an import row is applied; `get_inventory_category_counts()`
  (owner, active SKUs, `none` for no category); `get_inventory_page` filters `category` by the publication's category,
  else the SKU's; nullable `store_import_rows.publish_fields` (brand, model, category, instrument_type, condition,
  description) written by the owner through `set_store_import_row_publish_fields(session, row, fields)`, refused once the
  row is published (`IMPORT_ROW_PUBLISHED`) or publication is closed (`IMPORT_PUBLISH_CLOSED`). No function that locks
  or writes stock is replaced.

## Effortless Laria: search and browse (find batch)

Migration `20261101120000_ux_find_search.sql` (not applied to any hosted database). Read-only for visitors except the
alert changes; no new private data.

- `public.listing_search_text(title, brand, model, category, instrument_type)`: the folded words a listing is found by.
- `public.search_synonyms(term, expansions text[])`: the curated slang list (RLS on, read-only to everyone).
- `public.search_query_words(q)`, `public.listing_matches_query(text, q)`: every word of the query must appear, be a
  synonym, or be similar (`word_similarity` ≥ 0.55 for words of four letters or more; `pg_trgm`).
- `public.catalog_search(p_q) returns setof listings` (security invoker, so RLS applies): the catalog's source when a
  text query is present; PostgREST filters only on the columns the select includes, hence the card select's `status`,
  `stock_state` and `store_id`.
- `public.catalog_facets(p_filters jsonb, p_q text, p_attribute_keys text[]) returns jsonb` (security definer, public
  listings only): total, per-option counts (each facet without its own filter), locations, top brands, price spread.
- `public.catalog_brand_counts()`, `public.catalog_type_counts()`, `public.catalog_suggest(p_q, p_limit)`: menu counts
  and suggestions over public listings.
- Computed field `seller_verified_rank(listings)` for the "Tiendas verificadas primero" sort. The "Bajó de precio" sort,
  the home's drops row and the "Antes" price read the listing batch's drop columns through
  `recent_price_drop_at(listings)` (`20261109120000_ux_effortless_integration.sql`, UXD-integration-1): the drop time
  when an approved listing's `previous_price_pen` is above its price and the drop is under 30 days old, else null.
- `public.listing_gone_hint(p_slug)`: category and type of a listing that was public and no longer is; nothing else.
- Saved search alerts accept `query` (up to 200 characters, compared without case in the duplicate hash) and match it
  with the catalog's rule (`normalize_saved_search`, `saved_search_hash`, `listing_matches_saved_search` patched).
- Tests: `tests/ux-find-search.sql`.

## Catalog read performance

Migration `20261111120000_catalog_read_performance.sql` (not applied to any hosted database). Same names, arguments,
results and grants; no data changes. Details, measurements and rollout: `docs/operations/catalog-performance.md`.

- Policies "Public can read publicly eligible listings" and "Public can read photos for publicly eligible listings"
  write `listing_is_public`'s condition inline (approved; an individual listing without a store, or a store listing
  whose store is active). `listing_is_public` itself is unchanged for single-listing checks; keep the three in step.
- Index `listings_search_text_trgm_idx`: GIN trigram on `listing_search_text(title, brand, model, category,
  instrument_type)` where `status = 'approved'`. Reindex it when `listing_search_text` or `catalog_fold` changes.
- `public.catalog_search_condition(p_q) returns text`: `listing_matches_query`'s rule for one query as SQL with the
  words and synonyms as constants (escaped `like`, `<%` at word similarity 0.55).
- `public.catalog_search_ids(p_q) returns setof uuid` (security definer, public listings only; over 200 characters
  raises `CATALOG_FILTERS_INVALID`). `catalog_search(p_q)` now selects approved listings among these ids, so its result
  is the public set for every caller (before, RLS let a signed-in store member also find an inactive store's listings).
- `catalog_facets` computes each filter's result once per listing; same JSON; brands tied at the 30th place are now
  ordered by name. `catalog_brand_counts`, `catalog_type_counts` and `catalog_suggest` use the inline condition.
- Rollback (by hand, not a migration): `supabase/rollback/20261111120000_catalog_read_performance.rollback.sql`.
- Tests: `tests/catalog-performance.sql` (compares every rewritten definition with the previous one).

<!-- ux my-listings: start -->
## UX: my listings, sales and reviews (migrations `20261105120000`–`20261105120200`)

Local only; never applied to a hosted database. SQL suite: `tests/ux-my-listings.sql`.

- `listings` gains `rejection_codes text[]`, `availability_confirmed_at`, `availability_checkin_at`, `paused_until date`;
  `listing_revisions` gains `rejection_codes`. Owners cannot write them directly (trigger
  `ux_protect_listing_owner_state`); codes clear when `rejection_reason` is cleared.
- Notification and e-mail types are added with the shared `laria_private.ux_extend_text_check` (listing batch,
  `20261102120500`), which keeps every value already allowed, so batches adding types don't overwrite each other's
  constraint rebuilds (UXD-integration-3).
- `review_listing` and `review_listing_revision` take `p_reason_codes text[] default null` (ten codes, labels in
  `laria_private.ux_rejection_reason_label`; mirrored in `lib/rejection-reasons.ts`). The stored reason reads
  "Label; Label. Nota: note"; a rejection needs at least one code or a note.
- `set_owned_listing_lifecycle`: `sold` also from owner-hidden; `withdraw_sold` moves pending, draft or rejected to
  archived with `sold_at`.
- New owner RPCs: `copy_owned_listing(id, 'relist'|'duplicate')` (new draft with copied photos; relist sets
  `relisted_from_listing_id`), `set_owned_listing_price`, `set_owned_listings_lifecycle_bulk(ids, 'hide'|'restore')`
  → `{changed, failed}`, `set_owned_listings_pause(until|null)` (tomorrow to 90 days), `listing_is_paused(date)`,
  `confirm_listing_available`.
- `public.purchase_checkins` (one row per listing and buyer: answer, seller decision, claim). RLS: the buyer reads their
  rows; the seller reads rows answered yes. Written only through `answer_purchase_checkin(listing, bought)` and
  `decide_purchase_checkin(checkin, confirmed)`; `get_purchase_checkin(listing)` returns the caller's state or null.
- Notification and e-mail types `listing_purchase_check`, `listing_buyer_reported_purchase`,
  `listing_availability_checkin`, `listing_purchase_confirmation_reminder`, `listing_review_reminder`; sent once each
  through `laria_private.ux_notify_once` (dedupe table `laria_private.ux_reminders_sent`). A trigger on e-mail deliveries
  fills `context.reason` for `listing_revision_rejected`.
- `laria_private.run_my_listings_reminders()` runs from pg_cron job `ux-my-listings-reminders` (`0 14 * * *`).
- Reads: `get_account_pendientes()` (buyer, seller and store blocks for the account home), `get_listing_statistics(7|30|90)`
  (per listing, 12 weekly buckets, contacts without sale in 30 days). `get_eligible_transaction_buyers` adds
  `phone_last3` and `reported_purchase`; `get_transaction_detail` adds `seller_verified_sales` for the seller.
<!-- ux my-listings: end -->

<!-- ux-effortless:listing (batch "listing", migration slot 20261102) -->
## Effortless Laria: listing page and WhatsApp

- `20261102120000_ux_store_listing_contact.sql` (fix-03): trigger `stores_sync_listing_contact_phone` (after update of
  `stores.whatsapp_phone`) runs `laria_private.sync_store_listing_contact_phone()`, which copies the store's new number
  to every unsold store listing (`status <> 'sold'`; sold rows stay immutable history). It opens the listing guard
  (`app.allow_listing_admin_fields`) for that one statement and restores it. A one-time update brings listings that
  had already drifted to their store's number. Not callable by `anon` or `authenticated`. The app also reads a store
  listing's contact from the store (`lib/seller-contact.ts` `resolveContactPhone`). Suite: `tests/ux-listing-contact.sql`.
- `20261102120500_ux_listing_registry.sql`: `laria_private.ux_extend_text_check(table, constraint, column, values[])`
  adds allowed values to an `= any (array[...])` check in place, idempotently and in any order with other batches (any
  batch may reuse it). Since `20261112120000_launch_audit_security.sql` it re-adds the check `NOT VALID`: the list only
  grows, so validating would scan the table under an exclusive lock to find nothing, and new rows are checked anyway. Adds notification types `listing_back_in_stock`, `listing_question_asked`,
  `listing_question_answered` and e-mail types `listing_back_in_stock`, `listing_question_asked`.
- `20261102140000_ux_listing_page.sql`:
  - `listings.content_changed_at`, `price_changed_at`, `previous_price_pen`, `price_dropped_at` (check
    `listings_previous_price_check`), owned by the BEFORE trigger `listings_track_content_change`
    (`laria_private.track_listing_content_change()`): content changes move `content_changed_at`; a drop is recorded only
    on an approved listing, ≥5% below a price in effect ≥7 days (a further drop within 30 days keeps the first
    "previous" price); any increase clears it. View counts and moderation fields never move these columns.
  - `public.get_public_seller_facts(p_listing_id)`: member since, last-active bucket (`today|week|month`, from
    `auth.users.last_sign_in_at`), confirmed sales, e-mail confirmed, and for verified stores RUC, razón social,
    address, phone on file and `verified_since` (from the `store_verified` audit action). Public and sold listings only.
  - `public.get_public_review_page(p_subject_user_id, p_subject_store_id, p_offset, p_limit ≤ 50)`: count, per-star
    breakdown and one page of published reviews.
  - `public.listing_stock_watches (user_id, listing_id)` with RLS select-own; `set_listing_stock_watch(uuid, boolean)`
    and `get_listing_stock_watch(uuid)` (authenticated only; errors `STOCK_WATCH_AUTH_REQUIRED`,
    `STOCK_WATCH_UNAVAILABLE`, `STOCK_WATCH_OWN_LISTING`). Trigger `listings_notify_stock_watchers` (after update of
    `stock_state`, `out_of_stock` → `in_stock`) notifies each watcher once (`listing_back_in_stock`, e-mail dedupe key
    `back_in_stock:<notification id>`) and deletes the watches.
  - Suite: `tests/ux-listing-page.sql`.
<!-- /ux-effortless:listing -->

<!-- ux-effortless:listing questions -->
## Effortless Laria: public questions on a listing (big-11)

- `20261102130000_ux_listing_questions.sql`: table `public.listing_questions` (`listing_id` → listings, cascade;
  `asker_user_id` → profiles, cascade; `body` 5–300 characters; `answer` 2–600 with `answered_at`/`answered_by`, set
  once; `status` `visible`|`hidden` with `hidden_reason` (3–500), `hidden_at`, `hidden_by`; `created_at`
  `clock_timestamp()`). RLS on, no policies and no grants to `anon`/`authenticated`: every read and write goes through
  security-definer functions.
- Public functions (errors read `QUESTION_CODE: mensaje en español`):
  - `get_listing_questions(p_listing_id uuid) → jsonb` (anon + authenticated): `{signed_in, can_ask, can_answer,
    is_admin, accepting, questions: [{id, body, asker_name, created_at, answer, answered_at, status, hidden_reason,
    is_mine}]}`, newest first, up to 100. Visible questions of a published listing, or of a sold listing still shown;
    an admin also gets hidden ones with the reason. `asker_name` is "Nombre I." (never the full name).
  - `ask_listing_question(p_listing_id uuid, p_body text) → jsonb {id, created_at}` (authenticated): listing
    `listing_is_public`, caller not its seller, text through the PAY-1 contact-detail filter, at most 3 unanswered
    visible questions per asker and listing and 20 per asker in 24 hours (advisory lock per asker). Inserts a
    `listing_question_asked` notification for the seller and queues the e-mail with
    `laria_private.enqueue_marketplace_email('listing_question_asked', seller, 'listing_question:<id>', notification, listing)`.
  - `answer_listing_question(p_question_id uuid, p_answer text) → jsonb {id, answered_at}` (authenticated): only the
    seller (the listing owner, or the store owner for a store listing), once, on a visible question of a published
    listing. Inserts a `listing_question_answered` notification for the asker; no e-mail.
  - `hide_listing_question(p_question_id uuid, p_reason text)` / `restore_listing_question(p_question_id uuid, p_reason
    text) → jsonb {id, status}` (authenticated, `is_admin()` only): recorded in `admin_audit_actions` as
    `question_hidden` / `question_restored`, target type `question` (added to `admin_audit_actions_target_type_check`).
- Internal helpers (`laria_private`, not callable by browser roles): `raise_question_error`, `text_has_contact_details`
  (the PAY-1 regexes), `question_text`, `listing_question_seller`, `listing_questions_readable`,
  `question_display_name`, `question_snippet`.
- Reports: nullable `reports.question_id` → `listing_questions` (restrict); `reports_target_type_check` gains
  `question` (via `laria_private.ux_extend_text_check`); `reports_target_check` is recreated with the three existing
  branches unchanged plus the question branch; `reports_question_target_check` keeps `question_id` to question reports;
  unique open report per reporter and question; `submit_content_report` accepts `p_target_type = 'question'` (a
  visible question on a readable listing, not one's own). The Admin report pages do not render question targets yet.
- Suite: `tests/ux-listing-questions.sql`.
<!-- /ux-effortless:listing questions -->

<!-- ux-effortless:store-columns -->
## Store details: public columns only (integration fix)

Migration `20261022130000_store_public_columns.sql` (not applied to any hosted database). Its timestamp sorts before the
store-operations migrations (`20261023120000` onwards) because it fixes a gap older than them, so a database that
already has later migrations applied needs `supabase migration up --include-all` (or a reset) to pick it up. SQL suite:
`tests/store-public-columns.sql`.

- `revoke select on public.stores from anon, authenticated` removes the table-level read; column grants to both roles
  put back `id`, `name`, `slug`, `description`, `status`, `city`, `district`, `region`, `whatsapp_phone`, `logo_url`,
  `banner_url`, `is_verified`, `created_at`, `updated_at`, `instagram_url`, `facebook_url`, `tiktok_url` and
  `website_url`; `authenticated` also gets `owner_user_id`. `ruc`, `razon_social`, `email`, `contact_person`,
  `contact_name`, `address`, `rejection_reason` and `listing_plan` have no browser read grant, and `select *` from a
  browser role fails with a permission error. Row policies and writes are unchanged.
- `public.get_own_store() returns setof public.stores` (SQL, stable, security definer, `search_path = public`): every
  column of the store whose `owner_user_id` is `auth.uid()` (one row at most). `authenticated` only.
- `public.admin_get_store(p_store_id uuid) returns setof public.stores` (plpgsql, stable, security definer): every
  column of one store when `is_admin()`, else `ADMIN_REQUIRED` (42501). `authenticated` only.
- A column added to `stores` later is private until a migration grants it. `20261106140000_ux_store_location.sql` grants
  `show_address`, `opening_hours` and `public_address`, so the result is the same in either apply order.
<!-- /ux-effortless:store-columns -->

<!-- ux-effortless:accounts -->
## Effortless Laria: accounts, saving and alerts

Migrations `20261103120000` and `20261103130000` (not applied to any hosted database). Public functions are security
definer with a fixed `search_path`; errors are bare codes.

- `20261103120000_ux_phone_normalization.sql` (fix-01): `laria_private.normalize_pe_phone(p_value text) → text`
  (immutable) keeps digits, drops a leading `00` and puts `51` before nine digits starting with 9. BEFORE triggers
  `profiles_normalize_phone`, `listings_normalize_whatsapp_phone` and `stores_normalize_whatsapp_phone` apply it on
  insert or update of the number, ahead of the `*_protect_admin_fields` triggers (name order). At apply time stored
  numbers are rewritten (listing guard opened for the transaction; changed rows get a new `updated_at`; changed stores
  fire `stores_sync_listing_contact_phone`). Suite: `tests/ux-accounts-phone.sql`.
- `20261103130000_ux_accounts_saving.sql` (big-04, save-04 to save-12). Suite: `tests/ux-accounts-saving.sql`.
  - Types `listing_alert_match` (notification) and `follow_weekly` (e-mail) through `ux_extend_text_check`; a `do` block
    rebuilds `marketplace_email_context_check` with `week_start` and `items` added to the keys it reads with the new
    `laria_private.check_constraint_values(p_table regclass, p_name text, p_after text)`.
  - `favorites.saved_price_pen numeric` (backfilled with the old price of the first drop after the save, else the
    current price; trigger `favorites_capture_saved_price` on insert), `favorites.note` (≤ 280),
    `saved_search_alerts.name` (1–80).
  - Tables with RLS on, one select-own policy, only `select` granted to `authenticated` (all else revoked from `anon`
    and `authenticated`) and no write policy:
    `favorite_shares` (unique 24-hex `token`, `revoked_at`, one active row per user), `follows` (`store_id` → stores or
    `brand` 1–80 with generated `brand_key`; one row per user and target), `email_preferences` (`user_id` PK,
    `price_drop_emails` default true, `follow_digest_emails` default false). `user_id` → profiles, cascade.
  - `authenticated`: `merge_device_favorites(p_ids uuid[]) → integer` (≤ 100, each through `set_listing_favorite`,
    failures skipped), `set_favorite_note(p_listing_id uuid, p_note text) → text`, `get_or_create_favorite_share() →
    text`, `revoke_favorite_share() → boolean`, `set_follow(p_store_id uuid, p_brand text, p_follow boolean)`
    (`FOLLOW_UNAVAILABLE`, `FOLLOW_SELF_NOT_ALLOWED`), `get_account_follows() → jsonb`, `get_followed_arrivals(p_limit
    integer default 12, p_days integer default 14) → jsonb`, `set_email_preferences( p_price_drop_emails boolean,
    p_follow_digest_emails boolean)`, `update_saved_search_alert(p_alert_id uuid, p_name text, p_frequency text)`
    (`ALERT_NOT_OWNED`), `get_account_search_alerts(p_since timestamptz default null) → jsonb` (total, last and new
    matches per alert), `mark_all_notifications_read() → integer`.
  - `anon` and `authenticated`: `get_public_listing_cards(p_ids uuid[], p_slugs text[]) → jsonb` (≤ 120; public listings
    and sold ones under an active parent), `get_shared_favorite_list(p_token text) → jsonb` (first name and public
    favorites with notes; null for an unknown or revoked token), `get_new_listing_counts(p_since timestamptz,
    p_categories text[] default null) → jsonb` (public listings per category, `p_since` within 90 days).
  - Service role only (`EMAIL_SERVICE_REQUIRED`): `apply_email_link_action(p_user_id uuid, p_action text, p_alert_id
    uuid default null)` (`pause_alert`, `no_price_drops`, `no_follow_digest`) and `prepare_weekly_follow_emails(
    p_week_start date, p_limit integer default 100) → integer` (a Monday; up to 8 arrivals of the previous Lima week per
    delivery). No pg_cron job: the app's e-mail worker calls it.
  - Replaced, same signatures: `get_account_favorites` (saved price, category, type, brand, note),
    `notify_favorite_price_drop()` (drops of 5% or more, one per listing in 24 h, the notice names the listing),
    `enqueue_marketplace_email` (no price-drop e-mail after opting out), `marketplace_email_payload` (recipient id,
    first photos), `normalize_saved_search` and `listing_matches_saved_search` (location and condition as a list of up
    to 20; find's `query` clause is put back), `capture_saved_search_matches` (adds an in-app notice per match).
<!-- /ux-effortless:accounts -->

<!-- ux-effortless:selling -->
## Effortless Laria: selling

Migrations `20261104120000`–`20261104120200` (not applied to any hosted database). SQL suite:
`tests/ux-effortless-selling.sql`; no suite asserts the import trigger below.

- `20261104120000_ux_selling_drafts.sql` (POST 02): `public.listing_drafts` (`id` is the signed submission id, no
  default; `owner_user_id` default `auth.uid()` → `auth.users`, cascade; `kind` `listing` | `store_listing`, with
  `store_id` → stores (cascade) set exactly for store drafts; `inventory_item_id` without FK; `title` ≤ 200; `form`
  jsonb object ≤ 64 KB; `photos` jsonb array ≤ 10; `sound_clip` jsonb object). BEFORE trigger `listing_drafts_check`
  (`laria_private.check_listing_draft()`, security definer): id, owner, kind and store never change; photos must be
  `<owner>/<id>/<0–99>.(jpg|png|webp)` and the clip `<owner>/<id>/sonido-<n>.(webm|ogg|m4a|wav)` of 0.5–20.5 s, a
  missing path or duration refused; a store
  draft needs the owner's own store; an insert raises `LISTING_DRAFT_ALREADY_PUBLISHED` when a listing has that id and
  `LISTING_DRAFT_LIMIT` at 20 drafts. RLS: select, insert, update and delete own rows (to `authenticated`). Grants:
  `revoke all … from anon, authenticated`; `select, insert, update, delete` to `authenticated`.
- `20261104120100_ux_selling_sound_clips.sql` (POST 16): public bucket `listing-sound-clips` (1 MiB; `audio/webm`,
  `audio/ogg`, `audio/mp4`, `audio/wav`); one storage policy lets `authenticated` insert under
  `<auth.uid()>/<36-character id>/`; no update or delete policy. `public.listing_sound_clips` (`listing_id` PK →
  listings, cascade; `clip_url` http(s) ≤ 500; `mime_type`; `duration_seconds numeric(4,1)` 0.5–20.5). RLS: select for
  `anon` and `authenticated` when the caller can read the listing (subquery under the caller's RLS), delete for
  `is_admin()`. Grants: select to both, delete to `authenticated`, no insert (the publish route writes the row with the
  service role). The file itself is public by its address, like listing photos, and deleting the row leaves the file
  (the orphan-photo sweep due before launch should cover clips too). `get_admin_moderation_queue(text, integer,
  integer)` is patched to return `sound_clip_url`.
- `20261104120200_ux_selling_store_defaults_sku_details.sql`:
  - SHOP 06: `public.store_listing_defaults` (`store_id` PK → stores, cascade; `condition` null or one of the three;
    `description_footer` ≤ 1000). RLS: select for the owner or Admin, insert and update for the owner
    (`is_store_owner`), no delete. Grants: `revoke all … from anon, authenticated`; `select, insert, update` to
    `authenticated`.
  - STOCK 09: `store_inventory_items.listing_details jsonb` (object ≤ 16 KB, descriptive only).
    `laria_private.sanitize_listing_details(jsonb)` keeps `brand`, `model`, `instrument_type`, `condition`,
    `description` and `attributes` with sane values and drops anything else;
    `laria_private.remember_sku_listing_details(p_item_id uuid, p_details jsonb)` (security definer, no browser execute)
    merges them, and a valid `category`, into a SKU its caller has locked. It runs from trigger
    `store_import_rows_remember_listing_details` (after update of `commit_status` to `applied`) and from
    `laria_private.insert_store_listing`, patched to call it after `link_new_store_listing` (which locks the SKU).
    `update_inventory_listing_details(p_item_id uuid, p_details jsonb) → jsonb {changed, listing_details, category}`
    (security definer, `authenticated`; inventory write check, `lock_inventory_item`, logged as a `details` change;
    `INVENTORY_FIELD_INVALID`, `INVENTORY_ITEM_NOT_OWNED`) replaces the details.
  - POST 02: `complete_public_submission` is patched to delete the `listing_drafts` row with the submission id before it
    returns, in the same transaction.
  - POST 14: `listing_review_wait_minutes() → integer` (security definer, `authenticated` only): median minutes from
    creation to publication of Particular listings published in the last 60 days; null below 20 of them.
- The two patches add one call or statement each and leave the functions' locks as they were; no stock-writing function
  is replaced, and `update_inventory_listing_details` writes no stock.
<!-- /ux-effortless:selling -->

<!-- ux-effortless:stores -->
## Effortless Laria: store profile, storefront and import

Migrations `20261106120000`–`20261106170000` (not applied to any hosted database). New public functions are security
definer (except `get_store_listing_categories`) and return jsonb unless noted. SQL suites: `tests/ux-stores-import.sql`,
`tests/ux-stores-requests.sql`, `tests/ux-stores-storefront.sql` and `tests/ux-stores-complaints.sql`.

- `20261106120000_ux_import_update_scope.sql` (fix-04): `confirm_store_import_mapping(p_session_id uuid, p_mapping
  jsonb, p_expected_version integer, p_save_as_default boolean default false, p_update_scope text default null,
  p_stale_stock text default null)` replaces the four-argument form (`authenticated`). It saves `update_scope` (`prices`
  | `stock` | `both`, null = `both`) and `stale_stock` (`keep` | `apply`, null = `keep`) in the session's `options` and
  needs the stock column unless the scope is `prices`, the price column when it is (`IMPORT_SCOPE_INVALID`,
  `IMPORT_MAPPING_PRICE_REQUIRED`). `laria_private.plan_import_row` gets the options as a fourth argument: on an
  existing SKU it skips values outside the scope and keeps today's stock if the SKU moved after the row's `exported_at`
  (new mapping key; `IMPORT_STOCK_KEPT`, `IMPORT_STOCK_STALE`) unless `stale_stock = 'apply'`. Its callers,
  `plan_store_import_rows` and the stock writer `laria_private.commit_import_row`, only pass the options on;
  `refresh_import_counts` adds `since_export` counts.
- `20261106130000_ux_store_requests.sql` (shop-05, stock-21): `public.store_admin_requests` (`store_id` → stores,
  cascade; `kind` `listing_allowance` | `inventory_access`; `status` `open` | `resolved` | `dismissed`; one open request
  per store and kind; owner or Admin select only). `authenticated`: `request_store_admin_help(p_kind text, p_message
  text default null, p_requested_allowance integer default null)`, `get_store_listing_allowance_detail()`,
  `hide_out_of_stock_store_listings(p_batch_key text)` (≤ 200 approved out-of-stock SKU listings, via
  `hide_inventory_listings_bulk`); Admin: `get_admin_store_requests(p_status text default 'open', p_store_id uuid
  default null)`, `admin_close_store_request(p_request_id uuid, p_status text, p_note text default null)`;
  `STORE_REQUIRED`, `STORE_NOT_WRITABLE`, `REQUEST_INVALID`, `INVENTORY_ALREADY_ENABLED`, `REQUEST_NOT_FOUND`,
  `ADMIN_REQUIRED`. A request changes no allowance or setting.
- `20261106140000_ux_store_location.sql` (list-12, find-13, find-14): `stores.show_address boolean` (default false),
  `opening_hours text` (1–300 characters, not blank) and generated `public_address` (`address` while `show_address`),
  column-granted to `anon` and `authenticated`, written by owners under the existing update policy. `anon` and
  `authenticated`: `get_public_store_directory()` returns a table of active stores' public columns with approved listing
  count and visible review count and average, ≤ 2000 rows; `get_store_listing_categories(p_store_id uuid) returns table
  (category text, listing_count bigint)` is security invoker (RLS decides what is counted).
- `20261106150000_ux_complaints_book.sql` (trust-05, pending legal review): `public.complaints_book_entries` (the
  Indecopi sheet; `user_id` → `auth.users`, set null) with RLS on, no policies and all privileges revoked; numbers
  `LR-<year>-<000001>` from `laria_private.complaints_book_counters` (a row per Lima year, locked while filing: no
  gaps). `submit_complaints_book_entry(p_consumer_name … p_declaration_accepted)` (one argument per sheet field) returns
  table `(sheet_number text, filed_at timestamptz)`; `anon` and `authenticated`, 5 per e-mail and per account in 24 h
  (`COMPLAINT_DECLARATION_REQUIRED`, `COMPLAINT_INVALID`, `COMPLAINT_RATE_LIMITED`). Admin only:
  `get_admin_complaints_book_page(p_status text default null, p_page integer default 1, p_page_size integer default
  20)`, `answer_complaints_book_entry(p_entry_id uuid, p_answer text)` (once; `COMPLAINT_ANSWER_INVALID`,
  `COMPLAINT_NOT_ANSWERABLE`).
- `20261106160000_ux_import_cell_edit.sql` (stock-12): `edit_store_import_cell(p_session_id uuid, p_row_number integer,
  p_field text, p_value text, p_expected_version integer)` (`authenticated`; `ready` session, mapped field;
  `IMPORT_CELL_INVALID`, `IMPORT_ROW_APPLIED`) writes the cell into the locked row's `raw`, resets it and unapplied
  duplicate rows to unplanned and sends the session back to `validating`. `20261106170000_ux_publish_selection.sql`
  (stock-10): `create_inventory_publish_selection(p_item_ids uuid[])` (`authenticated`, inventory write check, 1–200
  SKU; `INVENTORY_PUBLISH_NONE`) stages active SKU without a listing as a closed, applied import (`options.source =
  'inventory_selection'`) for `publish_store_import_rows`; no stock change.
<!-- /ux-effortless:stores -->

<!-- ux-effortless:inventory -->
## Effortless Laria: store inventory and counter

Migrations `20261107120000`–`20261107130300` (not applied to any hosted database); suites `tests/ux-inventory-fixes.sql`
(`20261107120000`) and `tests/ux-inventory.sql`. New public functions are security definer, `authenticated` only, scoped
to the caller's store and return jsonb unless noted. Lock order stays key (advisory) → linked listings → SKU.

- `20261107120000_ux_inventory_search.sql` (fix-06, fix-09): `get_inventory_page` searches SKU, name, variant, external
  reference and the linked listing's title, brand, model (every word, folded); new publication filter `in_review`.
  `20261107130000_ux_inventory_enum.sql`: `stock_movement_type` gains `correction` (own file, committed before use).
- `20261107130100_ux_inventory_undo_and_bulk.sql`:
  - Bulk limit 200 → 2000 (`laria_private.inventory_bulk_limit()`) in `validate_bulk_price_args`,
    `set_inventory_threshold_bulk`, `hide_inventory_listings_bulk` and the stock writer `apply_bulk_stock_operations`.
  - Undo: `store_stock_movements.corrects_movement_id` (self FK, restrict, unique; set exactly on `correction` rows).
    `undo_stock_movements(p_movement_ids uuid[], p_idempotency_key text)` appends one `correction` per movement through
    the new stock writer `laria_private.apply_stock_correction`, all or nothing, for owner-recorded sales, returns,
    restocks, losses, adjustments and counts up to 15 minutes old (`STOCK_UNDO_NOT_FOUND`, `STOCK_UNDO_NOT_ALLOWED`,
    `STOCK_UNDO_EXPIRED`, `STOCK_UNDO_DONE`, `STOCK_UNDO_INSUFFICIENT`). `get_inventory_summary()` is replaced: sales
    skip undone ones; adds `undone`, `preferences` and pending revisions in `in_review`.
  - `public.store_inventory_preferences` (default threshold, `daily_stock_summary`, `pickup_hours`; owner select only),
    BEFORE INSERT trigger `store_inventory_items_default_threshold`, `set_inventory_preferences(p_fields jsonb,
    p_apply_to_unset boolean default false)`. Notification type `store_stock_summary` (`ux_extend_text_check`) from
    `laria_private.send_inventory_daily_summaries(p_day date default null)`, run by pg_cron job
    `inventory-daily-summary` (`0 1 * * *`, 20:00 Lima), once per opted-in store and day.
  - `public.store_price_campaigns` (owner select only): `preview_inventory_price_campaign(p_item_ids uuid[], p_mode
    text, p_value integer, p_rounding text)`, `apply_inventory_price_campaign` (the same plus `p_name text, p_batch_key
    text`; prices through `apply_inventory_price`), `revert_inventory_price_campaign(p_campaign_id uuid)`.
  - `set_inventory_item_category(p_item_id uuid, p_category text, p_expected_version integer)`,
    `apply_inventory_bulk_action(p_item_ids uuid[], p_action text, p_value text, p_reason text, p_batch_key text)`
    (`category`, `archive`, `unarchive`, `restore`; a listing that cannot be restored is skipped as `requirements`,
    while a concurrent change fails the whole batch), `undo_inventory_batch(p_batch_key text, p_undo_key text)`.
- `20261107130200_ux_inventory_views.sql`: `get_inventory_page` is replaced again (filters in
  `laria_private.inventory_ranked`, new `price: 'none'`) with `total`, `offset`, `has_prev`, `prev_cursor`;
  `get_inventory_neighbors(p_item_id uuid, p_filters jsonb default '{}')`, `get_inventory_item_ids(p_filters jsonb
  default '{}')` (≤ 2000); `public.store_inventory_views` (owner select only), `save_inventory_view(p_name text,
  p_filters jsonb)` (≤ 12), `delete_inventory_view(p_view_id uuid)`; `get_counter_index()`,
  `get_out_of_stock_demand(p_limit integer default 10)` (counts only), `get_reorder_list()`.
- `20261107130300_ux_purchase_requests.sql` (stock-04, stock-23): `public.store_purchase_request_marks` (`event_id` PK →
  `marketplace_events`, cascade; `answered` | `sold` | `not_sold`; `sale_movement_id` → movements, restrict; owner
  select only) for `whatsapp_contact` events with `{"intent":"purchase"}` from the last 60 days.
  `get_store_purchase_requests(p_status text default 'waiting', p_limit integer default 50)` (names signed-in buyers),
  `get_store_purchase_request_count() → integer`, `mark_store_purchase_request(p_event_id uuid, p_status text)`,
  `record_purchase_request_sale(p_event_id uuid, p_quantity integer, p_expected_version integer, p_idempotency_key
  text)` (request lock, then `record_stock_movement`, channel `whatsapp_laria`); `PURCHASE_REQUEST_NOT_FOUND`,
  `PURCHASE_REQUEST_SOLD`, `PURCHASE_REQUEST_NO_SKU`. `get_listing_purchase_request(p_listing_id uuid)` is replaced,
  PAY-1 grants kept (`anon` included), adding `max_quantity`: the linked SKU's available units clamped to 1–10, 1
  without a SKU. Below 10 it is the exact count, as the stepper's limit is (stock-23 "up to what is available"); the
  page never prints it (D-14). No SQL suite asserts it.
<!-- /ux-effortless:inventory -->

<!-- ux-effortless:speed -->
## Effortless Laria: push notices (big-12)

Migration `20261108120000_ux_push_notifications.sql` (not applied to any hosted database). Write-up:
`docs/ux-effortless/speed.md`. Suite: `tests/ux-effortless-push.sql`.

- `laria_private.push_subscriptions` (one row per device): `user_id` → profiles (cascade), `endpoint` unique, checked
  by `laria_private.is_push_service_endpoint(text)` (HTTPS on `fcm.googleapis.com`, `updates.push.services.mozilla.com`,
  `web.push.apple.com` or `*.notify.windows.com`, at most 1,024 characters); `p256dh` (65-byte uncompressed P-256 key)
  and `auth_secret` (16 bytes), base64url, checked by `laria_private.push_key_bytes(text, length)`; `failure_count`
  (0–10), `created_at`, `last_success_at`.
- `laria_private.push_deliveries` (one row per notification): `notification_id` unique → notifications (cascade),
  `user_id`, `status` `pending|processing|sent|skipped|failed`, `attempt_count` (0–5), `next_attempt_at`,
  `last_attempt_at`, `locked_at`/`locked_by` (set only while `processing`), `failure_code` (≤200), `sent_at` (set only
  when `sent`).
- Neither table is granted to `anon` or `authenticated`; both are reached only through the functions below.
- Trigger `notifications_push_delivery` (after insert on `public.notifications`,
  `laria_private.enqueue_notification_push()`): queues one delivery when the recipient has a device on.
- The person's own functions (security definer, `authenticated` only; `PUSH_AUTH_REQUIRED` without a session):
  - `save_push_subscription(p_endpoint, p_p256dh, p_auth) → uuid`: refuses other hosts (`PUSH_ENDPOINT_UNSUPPORTED`)
    and keys that are not a real P-256 point and 16-byte secret (`PUSH_KEYS_INVALID`). An endpoint already saved moves
    to the caller (a shared phone belongs to whoever turned notices on last) with its failures reset; only the
    newest 10 devices per person are kept.
  - `get_push_subscription(p_endpoint) → uuid | null`: the caller's device id for this browser.
  - `delete_push_subscription(p_subscription_id, p_endpoint) → boolean`: deletes only the caller's own device, by id
    (sign-out passes it from a cookie) or by endpoint (the switch).
- The worker's functions (security definer, `service_role` only, and `PUSH_SERVICE_REQUIRED` unless the JWT role is
  `service_role`):
  - `claim_push_deliveries(p_worker_id, p_limit 1–200) → jsonb`: first returns claims older than 15 minutes to
    `pending` (or `failed` after five attempts) and marks as `skipped` deliveries whose notice was read (`read`), is
    older than three days (`stale`) or whose person has no device left (`no_device`). Then it claims up to `p_limit`
    people with all their due notices (`for update skip locked`) and returns, per person, the notices newest first
    (type, message, listing id and title, store, claim, transaction, prices) and their devices.
  - `finish_push_deliveries(p_worker_id, p_delivery_ids, p_outcome, p_failure_code, p_sent_device_ids,
    p_failed_device_ids, p_gone_device_ids) → integer`: only for deliveries this worker holds
    (`PUSH_DELIVERY_CLAIM_INVALID` otherwise; `PUSH_OUTCOME_INVALID` for an unknown outcome). `sent`, `failed` and
    `skipped` are final; `retry` comes back after 5 min, 30 min, 2 h and 8 h, then `failed`. Devices the push service
    no longer knows are deleted, a device that failed five times in a row too, and a success resets the count; only
    devices of the people in the claim are touched.
- Quiet hours (22:00–08:00 Lima), grouping into one message and the RFC 8291/8292 encryption and signing are in the
  app (`lib/push/push-worker.ts`, `lib/push/web-push.ts`), run by `GET /api/internal/push/process` with `CRON_SECRET`.
  No scheduler runs it yet.
<!-- /ux-effortless:speed -->

<!-- ux-effortless:integration -->
## Effortless Laria: integration

Migration `20261109120000_ux_effortless_integration.sql` (not applied to any hosted database). Write-up:
`docs/ux-effortless/integration.md`. Suite: `tests/ux-effortless-integration.sql`.

- `public.recent_price_drop_at(listings) → timestamptz` (computed field, security invoker, `anon` and
  `authenticated`): `price_dropped_at` when the listing is approved, `previous_price_pen` is above its price and the drop
  is under 30 days old, else null. The catalog's "Bajó de precio" order and the home's drops row read it, so they show
  exactly the drops the cards and the listing page show as "Antes S/" (UXD-integration-1). The find batch's own drop
  functions were removed from `20261101120000_ux_find_search.sql`.
- Every batch adds notification and e-mail types through `laria_private.ux_extend_text_check`
  (`20261102120500_ux_listing_registry.sql`), so the checks on `public.notifications.event_type` and
  `laria_private.marketplace_email_deliveries.event_type` keep every type any batch added, in any order
  (UXD-integration-3). The suite copies each check onto a scratch table and inserts every type.
- `public.get_public_seller_facts(p_listing_id)` is redefined unchanged except for a verified store's address: it
  returns `public_address` (the street only while the store shows it, list-12) and `address_checked` (the store has an
  address on file) instead of the raw `address` (UXD-integration-11).
- `20261104120100` and `20261104120200` drop their helper `pg_temp.selling_fix`, so every migration also applies in
  one database session, as the Supabase CLI runs them.
<!-- /ux-effortless:integration -->

<!-- launch-audit:security -->
## Launch audit: security fixes

Migration `20261112120000_launch_audit_security.sql` (findings A06, A09, A10, A12, A21, A31, A32 of the 26 Oct 2026
launch audit). Suite: `tests/launch-audit-security.sql`. The application before and after it works with it, so it can
be applied before the deploy.

- A06/A12: the direct INSERT policies on `stores` and `listings` are dropped and `anon`/`authenticated` lose INSERT on
  both tables. Rows come only from `complete_public_submission`, `copy_owned_listing`, the import functions and
  `laria_private.insert_store_listing`, all security definer.
- A09: `protect_store_admin_fields` keeps `created_at` and `slug` and the two lapse fields; `protect_profile_admin_fields`
  keeps `created_at`. An identity change on a verified store lifts the badge as described under `public.stores`;
  `get_admin_moderation_counts` and `get_admin_moderation_queue('verificacion')` count and list active, unverified
  stores with a lapse (`reason = 'store_identity_changed'`, `previous_identity` from `verification_lapsed_from`).
  The trigger `launch_audit_store_verification_lapsed` (`laria_private.notify_store_verification_lapsed()`, security
  definer, after update when `verification_lapsed_at` goes from null to a time) gives the owner an in-app notification
  of the new type `store_verification_lapsed` (added with `ux_extend_text_check`; no e-mail). `set_store_verification
  (..., false)` sends `store_verification_revoked` when the store was verified or waiting with a lapse.
- A10: the public SELECT policies on `listing-photos` and `store-assets` give way to owner-folder SELECT policies for
  `authenticated`.
- A21: `submit_listing_for_publication` requires `auth.uid()` and is executable only by `authenticated`.
- A31: EXECUTE revoked from callers on `relist_sold_listing`, `can_add_listing_photo`, `can_remove_listing_photo`,
  `listing_has_status` and `is_approved_store_member`; `anon` also loses `get_admin_review_queue`.
- A32: `laria_private.guard_store_image_urls()` checks API writes (`current_user` is `anon` or `authenticated`) of
  `stores.logo_url`, `stores.banner_url` and `store_photos.image_url`: the address must be
  `{project}/storage/v1/object/public/store-assets/{auth.uid()}/{store id}/{file}`, where `{project}` is the origin of
  the session's issuer (`iss` is `{project}/auth/v1`) and the file name starts with a letter or digit. A session
  without an issuer matches nothing. Unchanged values and the security definer functions are not checked. Error
  `STORE_IMAGE_URL_INVALID`.
- Locks: nothing scans a table (the `notifications` check is re-added `NOT VALID`), and the migration sets
  `lock_timeout = '10s'`, so behind a long-running query it fails and can be run again instead of queueing traffic.
<!-- /launch-audit:security -->

<!-- launch-audit:contacts -->
## Launch audit: phone numbers and contacts

Finding A27 of the 26 Oct 2026 launch audit: through the public API key anyone could read every column of a public
listing, `contact_name` and `whatsapp_phone` included, and the name, phone, city and region of every Particular with
an approved listing (the policy "Public can read profiles for approved listings"). A listing page shows its seller's
name and number by design; the API handed out all of them in one paginated request, past the firewall and its rate
limits. The fix is column grants on `listings`, as `stores` has, and no access to other users' profiles, in two steps
so the running site never reads what it may no longer read.

Step 1, `20261114130000_launch_audit_contact_reads.sql` (suite `tests/launch-audit-contact-reads.sql`), changes
nothing the site reads, so it is applied before its application deploys:
- `public.public_listings`: a listing's public columns (`id`, `store_id`, `owner_user_id`, `seller_type`, `status`,
  `title`, `slug`, `description`, `category`, `instrument_type`, `brand`, `model`, `condition`, `attributes`,
  `price_pen`, `previous_price_pen`, `price_dropped_at`, `city`, `region`, `view_count`, `stock_state`, `published_at`,
  `created_at`, `updated_at`, `content_changed_at`, `availability_confirmed_at`, `paused_until`, `sold_at`), a
  security invoker view, so the policies on `listings` decide which rows a caller sees. Select only for `anon` and
  `authenticated`. PostgREST embeds `stores` and `listing_photos` through it from the base table's foreign keys.
- `listing_photo_count`, `recent_price_drop_at` and `seller_verified_rank` also take a `public_listings` row, with the
  bodies and rights of the `listings` ones. A computed field reads the whole row, and a whole `listings` row needs
  SELECT on every column, so under column grants only the view's rows can carry them.
- `catalog_search(p_q)` returns `setof public_listings` (same rows and rule as `20261111120000`).
- `admin_get_listing(p_listing_id)` (RPC Functions above).
- The application: the catalog, the home, the store page, the compare page and the listing page's similar and seller
  rows read `public_listings`. The contact button (`app/api/contact`) reads the listing with the public key, so the
  policies still decide it is public, and its contact (`contact_name`, `whatsapp_phone`, the owner's profile) with the
  service role. "Más de este vendedor" for an old Particular listing without an account matches the seller by
  WhatsApp number on the server with the service role, then reads the cards as usual. Admin's listing editor loads
  through `admin_get_listing`. `tests/launch-audit-contacts.test.cjs` checks that no read through the public key
  names a private column, a computed field on `listings` or another user's profile.

Step 2, `20261114140000_launch_audit_contact_columns.sql` (suite `tests/launch-audit-contact-columns.sql`; three
older suites now read a visitor's view the same way), is applied once step 1's application is live: it revokes
the table-wide SELECT on `listings` from `anon` and `authenticated`, grants them the columns of `public_listings`,
grants `authenticated` also `rejection_reason`, `rejection_codes`, `hidden_source` and `hidden_reason` (owners see
them on their own listings; approval and showing a listing again clear them), drops the public profile policy and
revokes `anon`'s SELECT on `profiles`. A signed-in user still reads their own profile, Admin every profile.

From step 2 on, a column added to `listings` is private by default: a public one needs its column grant to `anon`
and `authenticated` and, when a public page reads it next to a computed field, its place at the end of
`public_listings` (`create or replace view` keeps the existing columns in order and adds new ones last). A public read
of another user's profile goes through the server or a security definer function.
<!-- /launch-audit:contacts -->

<!-- launch-audit:trust -->
## Launch audit: trust fixes

Migration `20261113120000_launch_audit_trust.sql` (findings A15, A16 and A28 of the 26 Oct 2026 launch audit). Suite:
`tests/launch-audit-trust.sql`.

- A15: `public.is_admin()` is true only for `app_metadata.role = 'admin'` in a session that passed the authenticator
  code (`aal = 'aal2'`, Supabase MFA with TOTP), and `laria_private.assert_admin()` raises `ADMIN_REQUIRED` for anyone
  else or `ADMIN_MFA_REQUIRED` for an Admin whose session used the password alone. Every Admin policy and function goes
  through one of the two; the catalog policies that read the role inline now call `is_admin()`. The service role is
  not affected. The app sends an Admin without the code to `/mi-cuenta/seguridad` to set up the app or type the code
  (`lib/admin-server.ts`, `lib/auth/two-step.ts`).
- A16, A28: `laria_private.rate_limit_hits` (bucket, HMAC of the visitor's address, fixed window, count; no API access)
  and `public.consume_rate_limit(p_bucket, p_key, p_limit, p_window_seconds)` (service role only, true while within
  the limit). One call in fifty first removes up to 500 rows older than a day through the `window_start` index,
  skipping rows another call is removing, so a visitor's own count is never locked during the sweep.
  `lib/rate-limit.ts` uses it for `/api/auth/login`, `/auth/callback`, `/api/auth/check-email` and
  `/api/auth/resend-confirmation`. When it can't count (before the migration the function doesn't exist yet, or any
  other database failure), the failure is logged, the e-mail check refuses to answer, and the other routes go on under
  Supabase's own limits.
- Locks: replacing the catalog policies takes an ACCESS EXCLUSIVE lock on each table until the commit, and every lock
  wait is capped at 10 seconds (`lock_timeout`), so behind a long query the migration fails and can be run again.
- Order: deploy first, then apply. The application before this change has no code step, so with the migration alone
  Admin would be locked out until the deploy; the new application works with the old function too, except that the
  sign-up forms can't check an address until the migration is in, so it goes in as soon as the deploy is ready.
<!-- /launch-audit:trust -->

<!-- launch-audit:page-refresh -->
## Launch audit: public page refresh

Migration `20261113130000_launch_audit_page_refresh.sql` (finding A19 of the 26 Oct 2026 launch audit). Suite:
`tests/launch-audit-page-refresh.sql`. Nothing before it reads the new tables, so it can be applied before the deploy.
Its triggers are made with `create or replace trigger`, which takes a SHARE ROW EXCLUSIVE lock (writes wait, reads
don't), on a second run too. Writers take those nine tables in many orders (a listing's price edit updates its
inventory item, an inventory price edit its listing, a new listing its photos), so the first statement takes all nine
locks at once with `nowait`: while one is held it lets go of the others and tries again 20 to 100 ms later, and after
30 seconds of busy tables it fails with `PAGE_REFRESH_TABLES_BUSY` and can be run again. From then on it waits for no
writer; every other lock wait is capped at 10 seconds. A second run takes no lock on the record's tables: a writer
holds its own table's lock while its trigger inserts into the record, so locking the record could deadlock with it.
`tests/launch-audit-page-refresh-locks.integration.cjs` (local database, `pg` from `node_modules`) replays a writer
holding each of the nine tables and then taking the other eight and the record while a second run applies, and checks
itself by running the migration without its first statement, where a listing price edit deadlocks with it.
Follow-up `20261113140000_launch_audit_page_refresh_safeupdate.sql`: the claim's update of every waiting row had no
WHERE clause, which Supabase refuses on API calls (pg_safeupdate), so every run of the job failed after the deploy of
27 Oct 2026 until it was applied; it is the same function with `where true`. `tests/api-safeupdate.integration.cjs`
runs both functions with that check loaded when the database has it (`safeupdate`, or a local build of the same check
named `laria_safeupdate`), and checks itself on the claim as first applied.

- `laria_private.public_page_changes` (`id` identity, `changed_at`, `claim_id`, `claimed_at`, `first_claimed_at`,
  `armed_nonce`, `armed_deployment`; no API access): one row per statement that changes what the cached home and
  listing pages show. Statement-level triggers with transition tables (`<table>_public_page_changes_insert|update|delete`)
  write it:
  - `listings`: a listing shown publicly before or after the statement (`laria_private.listing_row_is_shown`: approved
    or sold, from a Particular or an active store, for a row's own values) added, removed or changed in any column but
    `view_count`, `availability_checkin_at` and `updated_at`;
  - `listing_photos` and `listing_sound_clips`: a photo or the sound clip of such a listing added, removed or changed
    (a photo's `updated_at` alone doesn't count);
  - `stores`: a store entering or leaving `active`, or an active store added, removed or changed in a column the pages
    show (`laria_private.mark_store_page_changes` lists them; e-mail, contact person, plan and the like don't count);
  - `profiles` (update and delete only): `full_name`, `phone`, `city`, `region` or `created_at` changed, or a profile
    removed;
  - `transaction_reviews`: a review added, changed or removed, in either direction (the second review of a sale reveals
    the first, `laria_private.review_is_visible`);
  - while the payments pilot is on, what `public.get_listing_purchase_request` shows: `store_payment_methods` (an
    approved method of an active, verified store added, removed or relabelled) and `store_inventory_items` (the SKU of
    a shown listing's active item, or the most a buyer can ask for, its available quantity from 1 to 10);
    `laria_private.assisted_commerce_settings` (the pilot switched on or off).
  Writers only insert, so they never wait on each other or on the job.
- `laria_private.public_page_deployment`: the deployment the job last ran in (one row).
- `laria_private.public_page_clock`: when the job last looked for changes that come with time alone (one row).
- `claim_public_page_changes(p_deployment text default null)` (service role only): a deployment other than the last one
  adds a row, and so does a review deadline passed since the previous look on a sale with a review, or a shown
  listing's pause that ended since (midnight in Lima on its `paused_until` date; the first look only starts the clock,
  and the clock never goes back). Then it puts a new claim on every row, folds rows waiting for the same thing into one
  (not armed and first claimed by the same run, or armed with the same nonce in the same deployment), and returns the
  claim, or null when none wait.
- `complete_public_page_changes(p_claim uuid, p_nonce text, p_deployment text)` (service role only): `p_nonce` is the
  nonce of the check page (`app/api/public-pages/probe`) the run read after claiming, or null, and `p_deployment` the
  deployment the run is in, which the check page names too (the job ignores a check page built by another deployment).
  It deletes the claim's rows armed in this deployment with another nonce (a clear reached this deployment's cache
  since), arms again the rows armed in another deployment, arms the rows first claimed at least 35 seconds before this
  claim, and returns `{done, waiting}`. A row is armed with a nonce and a deployment together. Without a deployment name
  (`VERCEL_DEPLOYMENT_ID` and `VERCEL_URL` both missing: Vercel's system environment variables turned off, or outside
  Vercel) it arms and deletes nothing, since every unnamed deployment would look the same; the rows wait and every run
  clears the pages, logging `public_pages_no_deployment`. A claim another run took over since does nothing. The job is
  `app/api/internal/public-pages/refresh/route.ts`, every minute from `vercel.json`; it clears the pages while rows wait.
- Columns added later count as shown on a page, except on `stores` and `profiles`, which list theirs, and on the
  pilot's tables, which compare what the purchase details show. A column that a job updates on shown listings without
  any page showing it belongs in the listing trigger's exclusion list, or the job clears the cache each time it runs; a
  new store or profile field a cached page shows belongs in its list, and a new table a cached page reads needs its own
  triggers.
<!-- /launch-audit:page-refresh -->

<!-- launch-audit:database-speed -->
## Launch audit: foreign key indexes and policies that read the account once

Migrations `20261114190000_launch_audit_foreign_key_indexes.sql` and
`20261114191000_launch_audit_policy_checks_once.sql` (finding A34 of the 26 Oct 2026 launch audit). Suite:
`tests/launch-audit-database-speed.sql`. Neither changes what anybody can read or write, so they can be applied before
or after any deploy.

- Indexes: each foreign key of `public` and `laria_private` has an index that starts with its columns, so deleting the
  row it points at, and joins on it, read only the matching rows. 47 were added, partial (`where ... is not null`) on a
  column that may be null. Left out on purpose: `marketplace_events.event_type` (a fixed list never deleted, on the
  busiest table), and `store_inventory_items (listing_id, store_id)` and `store_import_photo_assignments (asset_id,
  session_id)`, whose first column has a unique index of its own. The suite fails on any other foreign key without an
  index, so a new one needs its index in the same migration.
- Policies: 60 policies of `public` and `storage` wrote `auth.uid()` or `public.is_admin()` as is, which Postgres runs
  for every row it checks (`is_admin()` parses the JWT claims each time). They now read `(select auth.uid())` and
  `(select public.is_admin())`, which run once per statement, and are otherwise the same text as before. The suite
  fails on a policy of either schema that calls them as is, so new policies should use the same form. Calls that take
  a value of the row (`public.is_store_member(store_id)`, `public.is_store_owner(store_id)`) stay per row.
- Locks: an index build takes a SHARE lock (writes wait, reads don't) and a policy change an ACCESS EXCLUSIVE lock
  (reads wait too), held until the migration commits. Each migration first takes all its locks at once with `nowait`
  (25 tables, then 36 with `storage.objects`): while one is held it lets go of the others and tries again 20 to 100 ms
  later, and after 30 seconds it fails and can be run again. Locally each one runs in under 0.1 seconds.
- Rollback: drop the 47 indexes; alter each of the 60 policies back to the same text without the `(select ...)`.
<!-- /launch-audit:database-speed -->

<!-- launch-audit:privacy -->
## Launch audit: privacy

Migration `20261114120000_launch_audit_privacy.sql` (findings A18 and A20 of the 26 Oct 2026 launch audit, and the
retention part of A33). Suites: `tests/launch-audit-privacy.sql`, and `tests/launch-audit-privacy.integration.cjs`
(local database, `pg` from `node_modules`) for the sweep's locks. Procedure for requests: `docs/privacy/arco.md`. The
application before it calls none of the new functions, so it can be applied before the deploy.

- Daily upload allowance (A18): the restrictive policy "Daily upload allowance" (insert on `storage.objects`, for
  `authenticated`) calls `public.storage_upload_allowed(bucket, name)`. Per account and 24 hours: 120 files in
  `listing-photos` (600 for the owner of an active store), 120 in `listing-edit-photos`, 20 in `listing-sound-clips`
  and 40 in `store-assets` (`laria_private.upload_daily_limit`); other buckets have none. It counts the account's own
  files of the bucket (its folder) created in the last 24 hours, so removing one frees its place; a path of its own
  folder that exists already always passes, so a repeated upload still fails as a duplicate (only there, so the answer
  never tells whether someone else's file exists). Parallel uploads can each see the last free
  place. `public.my_upload_allowance(bucket) → {bucket, limit, used, next_at}` (`authenticated`) lets a form whose
  upload failed say so and when the next place frees up (`lib/upload-allowance.ts`).
- Sweep of files nothing uses (A18): `laria_private.upload_removals` (bucket, path, `queued_at`, `removed_at`; no API
  access) is the queue. `public.claim_upload_removals(p_limit 1–500)` (service role only) hands out files queued and
  not removed yet; when there are none it queues up to `p_limit` files of `listing-photos`, `listing-edit-photos`,
  `listing-sound-clips` and `store-assets` that are over 48 hours old, carry a name the forms give
  (`laria_private.upload_is_sweepable`) and that nothing points at (`laria_private.upload_references`: listing, edit
  and store photos, sound clips, store logos and banners, the photos and clip of saved drafts, and the edit photos
  another cleanup is removing). `public.complete_upload_removals(bucket, paths)` (service role only) marks them removed
  and drops rows removed over 30 days ago. `app/api/internal/uploads/sweep` runs both daily (`vercel.json`, 09:30 UTC)
  and deletes the files through the Storage API in between; a batch that fails stays queued for the next run.
  - A file is never queued while something points at it: the claim takes a per-file transaction lock
    (`pg_try_advisory_xact_lock`, skipping a file whose lock is held, so it never waits) and checks again in its own
    statement; the triggers `*_guard_upload` on `listing_photos`, `listing_revision_photos`, `listing_sound_clips`,
    `store_photos`, `stores` (logo, banner) and `listing_drafts` (photos, clip) take the same locks, shared
    (`pg_advisory_xact_lock_shared`, so two of them never wait for each other, in whatever order their rows come), for
    every address they add and refuse a queued or removed one with `UPLOAD_REMOVED` (P0001).
  - A new place that keeps a file of these buckets belongs in `laria_private.upload_references` and gets the guard;
    a new file name the forms give belongs in `laria_private.upload_is_sweepable`, or the sweep leaves such files.
  - A draft kept only on the device points at nothing, so its files go after 48 hours: `/api/submissions` "renew"
    returns `present` (the files still in the folder, by bucket) and the sell form drops the missing ones.
- Anonymising an account (A20): `laria_private.anonymize_account(p_user_id, p_reason default null)` (service role only,
  `ANONYMIZE_SERVICE_REQUIRED`, through a security definer function: the self-service deletion of
  `features/marketplace` calls it from `public.service_delete_account`; no API role can call it directly) and
  `public.admin_anonymize_account(p_user_id, p_reason)` (Admin with the authenticator code; a reason of 3–500
  characters, `ANONYMIZE_REASON_REQUIRED`; writes `admin_audit_actions` with `action = 'anonymize_account'`,
  `target_type = 'account'`) run `laria_private.anonymize_account_core`:
  - refuses an Admin account (`ANONYMIZE_ADMIN`) and the owner of an active store (`ANONYMIZE_ACTIVE_STORE`: Admin hides
    the store first); `ANONYMIZE_ACCOUNT_NOT_FOUND` without a profile;
  - listings not sold are archived, and every listing of the account and its stores loses `contact_name` and
    `whatsapp_phone`; pending revisions are cancelled; a pending store application is rejected, and the account's
    stores lose their contact data (name, person, e-mail, WhatsApp, address) but keep RUC and business name; their
    payment methods are withdrawn without holder or note (the method history is append-only and stays);
  - deletes store memberships, favorites, shared lists, follows, search alerts and matches, stock watches, drafts, edit
    attempts, e-mail preferences and deliveries, push deliveries and devices, notifications, check-ins outside a sale
    and unanswered questions no report points at; analytics events lose the account as actor or seller and its
    identity key;
  - the profile becomes "Cuenta eliminada" without phone or city; `laria_private.anonymize_auth_user` empties the Auth
    user's e-mail, phone, password, metadata and pending tokens, bans it and deletes its identities, sessions, refresh
    tokens, factors, one-time tokens, flow states and Auth audit entries (the access token already issued lasts until
    it expires, an hour at most);
  - calls `laria_private.anonymize_account_feature_data(uuid)` when it exists (from `features/marketplace`) and keeps
    what it returns under `features`; that function must not check the caller's role, since Admin runs reach it too,
    and queues any files to remove in `laria_private.upload_removals`, any bucket, for the sweep;
  - records the run in `laria_private.account_anonymizations` (first and last time, the first reason and Admin, the
    counts); a second run finds nothing more to clear. Sales, reviews, reports and Libro de Reclamaciones entries stay.
- Admin: "Anonimizar cuenta" on each card of `/admin/usuarios` (reason and confirmation), and the account's history at
  `/admin/auditoria/account/<id>`; `get_admin_audit_history` and the `admin_audit_actions.target_type` check accept
  `account`.
- Retention of analytics events (A33): pg_cron job `marketplace-event-retention` (09:45 UTC) runs
  `laria_private.run_marketplace_event_retention()`, which calls `laria_private.scrub_marketplace_events(5000)` until a
  batch comes back short (at most 100 batches a day). Browsing events (`listing_impression`, `listing_view`,
  `store_view`, `search`, `filter_applied`, `favorite_added`, `favorite_removed`) lose `actor_user_id`, `session_id` and
  `identity_key` after 90 days, every other event after 365 days; the seller and the counts stay.
  `laria_private.marketplace_event_scrub_clock` keeps where each kind left off, so no run reads a cleared row again.
- Locks: the policy takes an ACCESS EXCLUSIVE lock on `storage.objects` (uploads and Storage reads wait for the
  migration, well under a second), the target-type check one on `admin_audit_actions`, and each guard a SHARE ROW
  EXCLUSIVE lock on its table. The first statement takes all of them at once with `nowait`, retrying for 30 seconds
  (`PRIVACY_TABLES_BUSY`); every other lock wait is capped at 10 seconds.
<!-- /launch-audit:privacy -->
