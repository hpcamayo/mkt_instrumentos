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

## Core Responsibilities

Next.js handles:
- Routing and metadata.
- Server-rendered public pages.
- Client interactive components.
- Public forms.
- Admin UI.
- Route handlers for photo loading and view count increments.
- Calls to Supabase.

Supabase handles:
- Database tables.
- Row Level Security policies.
- Listing and store records.
- Seller/store-owner account ownership tables.
- Listing photos.
- Public image storage buckets.
- Admin auth through Supabase Auth.
- RPC helpers such as `is_admin()`, store membership checks, publication validation, and `increment_listing_view_count()`.

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
- Used for server/public reads and public form inserts/uploads.

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
- Intended for later admin invite/server actions.

`middleware.ts` refreshes Supabase Auth sessions and protects future account routes that start with `/mi-cuenta` or `/mis-publicaciones`.

## Actual Route Map

```text
app/
  layout.tsx
  page.tsx                         Homepage
  admin/page.tsx                   Admin panel
  auth/callback/route.ts           Supabase magic-link/invite callback
  api/listings/[id]/photos/route.ts
  api/listings/[id]/view/route.ts
  instrumentos/[slug]/page.tsx     Listing detail
  listados/page.tsx                Listings/search page
  listados/loading.tsx             Listings loading skeleton
  login/page.tsx                   Magic-link login
  logout/route.ts                  Sign out and redirect to /login
  publicar/page.tsx                Redirects to /vender
  registrar-tienda/page.tsx        Store registration
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
approved -> hidden
approved -> sold
approved -> archived
```

Only `approved` listings should be visible publicly.

Phase 2 adds nullable listing ownership through `owner_user_id`, plus `sold_at`, `archived_at`, `created_by_source`, and `marketplace_rules_accepted_at`. Legacy listings can keep `owner_user_id=null`.

### Stores

Stores are mini-shop pages for small music stores. A store has:
- Public profile page.
- Logo and banner.
- WhatsApp contact.
- City, district, address.
- Verification status.
- Product listings.

Only `active` stores should be visible publicly.

Phase 2 adds `profiles` and `store_members`. Stores can have `owner_user_id`, and owner stores automatically get an owner membership when inserted through the account-aware flow. The database still uses `stores.status='active'` for product-approved stores.

### Admin

Admin controls supply quality. The admin panel can:
- View pending listings.
- Edit basic listing fields.
- Approve, reject, hide, or mark listings sold.
- View pending stores.
- Edit basic store fields.
- Approve or hide stores.
- Mark stores verified.

Admin authority remains based on Supabase Auth `app_metadata.role = "admin"`. Profile `account_type` is app metadata only and is not the security boundary.

## Component Structure

Core local components:
- `components/page-container.tsx`
- `components/listing-card.tsx`
- `components/listing-filters.tsx`
- `components/listing-detail-gallery.tsx`
- `components/listing-detail-metadata.tsx`
- `components/admin-panel.tsx`
- `components/sell-listing-form.tsx`
- `components/store-registration-form.tsx`
- `components/site-header.tsx`
- `components/site-footer.tsx`

Generated/imported UI:
- `components_v0/*`
- `components_v0/ui/*`

The homepage uses `components_v0` sections, but marketplace data logic remains in the route page. v0-generated UI should be integrated carefully and should not replace Supabase/business logic blindly.

The listing detail route composes `ListingDetailGallery` in a sticky desktop column using `minmax(0,0.82fr)`, with the main listing facts, seller/store trust box, description, and full specs in the wider `minmax(0,1fr)` right column. Recommendation sections stay below that main detail grid.

## Styling

The app uses Tailwind CSS 3-style config:
- `tailwind.config.ts`
- `postcss.config.js`
- `app/globals.css`

Tailwind includes content paths for:
- `app/**/*`
- `components/**/*`
- `components_v0/**/*`

Custom colors include `ink`, `brass`, `cedar`, `mist`, and shadcn-like tokens such as `background`, `foreground`, `card`, `primary`, `muted`, `border`, `input`, and `ring`.

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
