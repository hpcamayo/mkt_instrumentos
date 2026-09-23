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
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Current behavior:
- Store applications require an authenticated `profiles.account_type='store_owner'`, bind `owner_user_id` server-side, and insert `status='pending'` with `listing_plan='free'`.
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
- `review_reports` stores a visible review target, authenticated reporter, fixed reason, optional bounded detail, timestamp and moderation state. Sprint 6 intentionally does not implement Sprint 8 listing/store reports or report resolution/dismissal UI.
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
- Active stores are readable by `anon` and `authenticated`.
- Individual approved listings are public; store listings additionally require an active parent store.
- Listing photos follow the same combined listing/store eligibility predicate. Store photos require an active store.

Public insert policies:
- Anonymous store, listing, and listing-photo insert policies are removed. Legacy rows remain intact.

Account policies:
- Users can read and update their own profile; admins can read and update all profiles.
- Authenticated users can insert their own profile with `account_type='seller'` or `account_type='store_owner'`.
- Store owners/members can read their own stores and memberships.
- Store Owner accounts can insert one pending owner-bound store application.
- Store owners can update allowed store profile/business/contact fields and optional store photos. Protected authority fields are writable only through controlled review RPCs.
- Listing owners and store members can read their own manageable listings. Lifecycle and edit mutations use owner-scoped RPCs; triggers block direct changes to protected authority fields and make sold rows immutable.
- The owner of a pending or active store can insert pending store inventory. Server publication logic distinguishes normal Tienda from Tienda Verificada.
- Authenticated owners cannot mutate listing or live-photo rows directly; validated owner-scoped RPCs apply nonpublic/verified-store edits or stage approved Particular/normal-Tienda photo changes on a revision.
- Listing-photo objects are append-only from the browser beneath the authenticated owner folder; update/delete policies are removed so a historical object cannot be replaced or destroyed. Trusted server cleanup still removes failed-attempt uploads.
- Public users may read a profile only when it belongs to an approved account-owned Particular listing; this supports dynamic seller display without exposing unrelated profiles.

Admin policies:
- Admin read/update policies depend on `public.is_admin()`.
- `is_admin()` checks `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`.
- Admin users must be created in Supabase Auth and given `app_metadata.role = "admin"`.

## RPC Functions

`public.is_admin()`:
- Used by the admin panel to verify access.
- Used by RLS policies for admin reads/updates.

`public.listing_has_status(listing_id, expected_status)`:
- Security definer helper used by photo RLS; approved store inventory also requires an active parent store.

`public.listing_is_public(listing_id)`:
- Central public predicate: approved Particular inventory, or approved store inventory whose parent store is active.

`public.increment_listing_view_count(p_listing_id uuid)`:
- Historical compatibility function; the production-applied Sprint 4 migration revokes public/anonymous/authenticated execution so it cannot bypass event dedupe. The HTTP compatibility endpoint uses the trusted event recorder instead.

`public.record_marketplace_event(event_type, session_id, event_id, actor_user_id, listing_id, store_id, source, metadata, submission_id)`:
- Service-only trusted write path with canonical attribution, public visibility, owner/admin exclusion, rolling dedupe, and accepted-view cache updates.

`public.get_account_analytics(days, owner_id)` and `public.get_marketplace_admin_analytics(days)`:
- Authenticated owner reports default to `auth.uid()`; only an admin may request another owner's aggregate. Global reports require admin authority. Supported periods are all recorded history (`0`), `7`, and `30` days; raw event/buyer directories remain inaccessible.

`public.is_store_member(store_id)`, `public.is_store_owner(store_id)`, and `public.is_approved_store_member(store_id)`:
- Security-definer helpers for account and store membership RLS.

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

`public.review_listing(listing_id, decision, reason)` and `public.review_listing_revision(revision_id, decision, expected_version, reason)`:
- Admin-only, row-locked moderation. Listing reject/hide and revision reject require a reason. Revision approval applies only proposed fields and an optional staged photo set in one transaction, preserving unrelated immediate edits and any current owner-hidden state. The expected version must match the locked pending row, so a stale admin screen cannot resolve an owner-amended proposal.

## Storage Buckets

`listing-photos`:
- Public bucket.
- Max file size: 5 MB.
- Allowed MIME types: JPEG, PNG, WebP.
- Public select policy for approved listing images; anonymous insert is removed.
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
- Public select policy; anonymous insert is removed.
- Store applications and profile edits upload optional logo, banner, and physical-store photos under `{auth.uid()}/{submissionOrStoreId}/...`.
- Authenticated Store Owners can upload/update/delete only beneath their own top-level folder.

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

## Missing V1 Data Models and Post-V1 Concepts

Frozen V1 still requires listing/store reports with resolve/dismiss, the remaining full Admin Hub, category pages, final legal/safety content and legacy ownership linking. Search alerts and centralized marketplace email delivery are production-deployed in Sprint 7; exact owner real-inbox/usability acceptance remains pending. Sprint 6 verified transactions, two-way reviews, review reports/moderation and verified funnel metrics are production-deployed and owner-accepted.

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
