# Database and Supabase

This document reflects the actual current migration files and TypeScript types, plus business expectations from Laria planning docs.

## Supabase Usage

Supabase is used for:
- Postgres database tables.
- Row Level Security policies.
- Supabase Auth for admin login.
- Storage buckets for listing photos and store images.
- RPC functions for admin checking and listing view count increments.

Environment variables used in current code:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Important:
- `NEXT_PUBLIC_SUPABASE_URL` should be only the base Supabase URL, for example `https://xxxxx.supabase.co`, not `/rest/v1/`.
- There is no service-role key used in current app code.
- If a future `SUPABASE_SERVICE_ROLE_KEY` is added, it must be server-only and never exposed to browser code.

## Current Tables

## Planning Docs vs Current Schema

Older Laria business docs describe the intended model in product language. The current code and migrations use slightly different names in a few places:
- Listing seller fields are `contact_name` and `whatsapp_phone`, not `seller_name` and `seller_whatsapp`.
- Listing photos live in `listing_photos.image_url`, not a `photos` array on `listings`.
- Listing-level `is_featured` and `is_verified` do not exist yet. Verification is currently store-level through `stores.is_verified`.
- Store WhatsApp is `whatsapp_phone`, not `whatsapp`.
- Store plan exists as `listing_plan`; there is no separate `listing_limit` column yet.
- Current instrument types include plural values for some groups: `microphones`, `pedals`, and `amplifiers`.

When in doubt, treat migration files and `lib/supabase/database.types.ts` as the implementation source of truth. Planning names should only become schema names through an explicit migration and app update.

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
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Current behavior:
- Public store registration inserts `status='pending'` and `listing_plan='free'`.
- Public store pages only read `status='active'`.
- Verified stores are highlighted through `is_verified`.

Future business expectations:
- Store plans may become monetized packages such as 20, 50, or 100 listings.
- Additional store owner tooling may eventually require store members/accounts.

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
- Public pages only show `status='approved'`.
- New individual submissions enter as `pending`.
- Admin can set listing status to `approved`, `rejected`, `hidden`, or `sold`.
- `published_at` is used for newest sort and detail metadata. If null, detail metadata falls back to `created_at`.
- `view_count` is incremented by an RPC when detail pages are opened.
- Listing detail pages render `attributes` as user-facing specification rows through `lib/listing-specs.ts`, using labels/options from `lib/instrument-filters.ts`. Empty attributes are hidden and raw JSON should not be shown in the UI.
- Listing detail seller/store trust boxes count active approved listings by `store_id` for stores and by `whatsapp_phone` for individual sellers, because full seller accounts do not exist yet.
- Listing detail recommendation sections only read `status='approved'` listings. Similar listings exclude the current listing, prioritize the same `instrument_type` or category, and use `brand` as a secondary relevance signal. More-from-seller/store listings use `store_id` for stores and `whatsapp_phone` for individual sellers.

Important current gap:
- The public seller form does not yet collect `instrument_type` or `attributes`, although advanced filtering uses those fields.
- Individual seller listing counts are a best-effort contact-based signal until seller accounts exist.

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

## Enums

`seller_type`:
- `individual`
- `store`

`listing_status`:
- `pending`
- `approved`
- `rejected`
- `hidden`
- `sold`

`store_status`:
- `pending`
- `active`
- `hidden`

`store_listing_plan`:
- `free`
- `starter_20`
- `growth_50`
- `pro_100`

Only `free` is used by the current public store registration flow.

## RLS Assumptions

RLS is enabled on:
- `stores`
- `listings`
- `listing_photos`

Public read policies:
- Active stores are readable by `anon` and `authenticated`.
- Approved listings are readable by `anon` and `authenticated`.
- Photos are readable when their listing is approved.

Public insert policies:
- Pending listings can be inserted by `anon` and `authenticated`.
- Pending free stores can be inserted by `anon` and `authenticated`.

Admin policies:
- Admin read/update policies depend on `public.is_admin()`.
- `is_admin()` checks `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`.
- Admin users must be created in Supabase Auth and given `app_metadata.role = "admin"`.

## RPC Functions

`public.is_admin()`:
- Used by the admin panel to verify access.
- Used by RLS policies for admin reads/updates.

`public.listing_has_status(listing_id, expected_status)`:
- Security definer helper used by photo RLS to allow photo reads for approved listings.

`public.increment_listing_view_count(p_listing_id uuid)`:
- Security definer function for public view-count increments.
- Updates only approved listings.
- Returns the next `view_count`.

## Storage Buckets

`listing-photos`:
- Public bucket.
- Max file size: 5 MB.
- Allowed MIME types: JPEG, PNG, WebP.
- Public select and insert policies.
- Public listing submissions upload to paths like `pending/{listingId}/{n}-{uuid}.{ext}`.

`store-assets`:
- Public bucket.
- Max file size: 5 MB.
- Allowed MIME types: JPEG, PNG, WebP.
- Public select and insert policies.
- Store registration uploads logo and banner to `pending/{storeId}/...`.

Tradeoff: buckets are public. Moderation controls public app visibility through database status, not private object access.

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

## Manual Migration Reminder

Vercel does not apply database migrations automatically.

When adding tables, columns, indexes, policies, RPCs, or storage buckets:
1. Create a migration file in `supabase/migrations`.
2. Review the SQL.
3. Run it manually in Supabase SQL Editor.
4. Deploy code only after production Supabase has the required schema.

## Future Tables Not Yet Implemented

Do not add these until explicitly requested:
- `profiles`
- `favorites`
- `saved_searches`
- `seller_accounts`
- `store_members`
- `featured_listing_orders`
- `store_plan_subscriptions`

These are useful future concepts, but adding them early would create operational complexity before Laria has enough supply, store participation, and buyer demand to justify account, billing, or marketplace mechanics.
