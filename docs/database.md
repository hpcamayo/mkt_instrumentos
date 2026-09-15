# Database and Supabase

This document reflects the actual current migration files and TypeScript types. `docs/functional-spec.md` is canonical for frozen V1 behavior; schema gaps recorded here are implementation gaps, not product exclusions.

## Supabase Usage

Supabase is used for:
- Postgres database tables.
- Row Level Security policies.
- Supabase Auth for admin login and the Phase 2 seller/store-owner account foundation.
- Storage buckets for listing photos and store images.
- RPC functions for admin checking, account ownership checks, publication validation, and listing view count increments.

Environment variables used in current code:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Important:
- `NEXT_PUBLIC_SUPABASE_URL` should be only the base Supabase URL, for example `https://xxxxx.supabase.co`, not `/rest/v1/`.
- `SUPABASE_SERVICE_ROLE_KEY` is accessed only through `lib/supabase/admin-client.ts` for current trusted invite, email-lookup, and submission server routes and future server actions.
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
- `price_pen` must be non-negative when present.
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
- `view_count` is incremented by an RPC when detail pages are opened.
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

### `public.listing_revisions`

Purpose: one pending moderated edit proposal per approved Particular or normal Tienda listing while the current live row remains public.

Key columns:
- `id uuid primary key`
- `listing_id uuid references listings(id) on delete restrict`
- `owner_user_id uuid references profiles(id)`
- `store_id uuid references stores(id)`
- `status text` constrained to `pending`, `approved`, `rejected`, or `cancelled`
- `changed_fields text[]` containing only proposed moderated fields, including condition
- nullable proposed `title`, `category`, `instrument_type`, dependent `attributes`, `brand`, and `model`; attributes are included only when they must move atomically with a type change
- `rejection_reason text`
- submission/review timestamps and `reviewed_by`

A partial unique index on `listing_id` where `status='pending'` prevents a second pending revision. Owners can read only their own revisions; public roles have no access; admin review remains inside trusted RPCs.

### `public.listing_revision_photos`

Purpose: ordered proposed photo sets for revisions without mutating `listing_photos` early.

- `revision_id uuid references listing_revisions(id) on delete restrict`
- `image_url text`, `alt_text text`, and unique non-negative `sort_order`

An accepted revision replaces the live photo rows atomically inside the admin review transaction. Rejected proposals remain historical moderation evidence.

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
- `store_members`
- `store_photos`

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
- Security definer function for public view-count increments.
- Updates only approved listings.
- Returns the next `view_count`.

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

`public.update_owned_listing(listing_id, immediate_fields, moderated_fields, photos)`:
- Locks and validates the owner-bound listing. Price, description, location, and supported attributes apply immediately. Condition joins title, category, instrument type, brand, model, and photos in the moderated proposal for Particular and normal Tienda inventory.
- For approved Particular/normal-Tienda rows, title, category, instrument type, brand, model, and photos create one pending revision while the live row remains unchanged. Nonpublic rows and eligible verified-store rows apply the complete valid edit directly.
- A moderated instrument-type change carries its compatible dynamic attributes inside the same revision, preventing either the old or proposed public version from exposing a mismatched type/attribute pair.
- Proposed photo sets contain 2–10 unique URLs. Every URL must already belong to the listing or resolve to an existing ≤5 MB JPEG/PNG/WebP object in that owner's listing-edit folder, so direct RPC callers cannot inject arbitrary photos.
- Store verification alone leaves an existing pending edit revision untouched. If the verified owner later applies a direct moderated/photo edit, that older pending proposal is atomically retained as `cancelled`/superseded so it cannot overwrite the newer live values.

`public.set_owned_listing_lifecycle(listing_id, action)`:
- Owner-only `hide`, `restore`, and `sold` transitions. Restore is allowed only for owner-hidden listings and reuses publication validation plus the store cap invariant. Marking sold cancels any pending revision; hiding leaves it pending, and later approval changes content without restoring visibility.

`public.relist_sold_listing(listing_id)`:
- Creates a new linked copy and copies the live photo references without mutating the sold source. Particular/normal-Tienda copies return to moderation; an eligible verified-store copy can publish directly.

`public.review_listing(listing_id, decision, reason)` and `public.review_listing_revision(revision_id, decision, reason)`:
- Admin-only, row-locked moderation. Listing reject/hide and revision reject require a reason. Revision approval applies only proposed fields and an optional staged photo set in one transaction, preserving unrelated immediate edits and any current owner-hidden state.

## Storage Buckets

`listing-photos`:
- Public bucket.
- Max file size: 5 MB.
- Allowed MIME types: JPEG, PNG, WebP.
- Public select policy for approved listing images; anonymous insert is removed.
- Particular submissions upload through authenticated owner paths `{auth.uid()}/{submissionId}/{sortOrder}.{ext}`.
- Listing edit uploads use `{auth.uid()}/listing-edits/{listingId}/{attemptId}/{sortOrder}.{ext}` and are verified against the owner before they can enter a direct edit or pending revision.
- Signed completion and cleanup remain server-controlled and service-role credentials never reach the browser.

`store-assets`:
- Public bucket.
- Max file size: 5 MB.
- Allowed MIME types: JPEG, PNG, WebP.
- Public select policy; anonymous insert is removed.
- Store applications and profile edits upload optional logo, banner, and physical-store photos under `{auth.uid()}/{submissionOrStoreId}/...`.
- Authenticated Store Owners can upload/update/delete only beneath their own top-level folder.

Tradeoff: buckets are public. Moderation controls public app visibility through database status, not private object access.
Database/store visibility controls public discovery. Because the bucket remains public for responsive image delivery, undiscoverable abandoned objects still require operational retention cleanup.

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

Frozen V1 still requires data models for favorites, exact-state search alerts and delivery deduplication, price-drop delivery, marketplace/contact events, verified transactions, two-way reviews, reports, analytics, and centralized marketplace email delivery. Listing revisions are now present in the Sprint 3 migration.

The existing `profiles` table is the Particular/store-owner identity foundation; do not add a separate seller-only account that would prevent one Particular from buying and selling.

Post-V1 concepts include `featured_listing_orders` and `store_plan_subscriptions`. The existing paid-sounding store-plan enum values are legacy schema possibilities, not active V1 products.

## September 2026 reliability migration

`20260909120000_marketplace_performance.sql` adds an RLS-aware computed photo count, a service-only indexed email lookup, first-approval timestamps, bounded-browsing indexes, and atomic idempotent public submissions. See `docs/performance.md` for behavior and rollback-only verification.

`20260910100000_particular_sprint_1.sql` binds Particular submissions to profiles, enforces the 2–10 contract in the publication RPC, removes anonymous listing creation/upload policies, enables approved seller-profile resolution, and adds minimum-preserving owner photo deletion.

`20260910120000_sprint_1_owner_acceptance_fixes.sql` updates the Auth user trigger to persist normalized signup name, WhatsApp, city, and region without duplicate onboarding, safely fills only missing/default values on existing profiles from Auth metadata, and allows the shared `instrument_type='other'` fallback for supported categories.

`20260913120000_listing_sprint_3.sql` adds owner lifecycle management, moderated revision isolation, sold immutability, copied relisting, owner-visible moderation reasons, admin review operations, and append-only edit uploads without weakening legacy or Sprint 2 store behavior.
