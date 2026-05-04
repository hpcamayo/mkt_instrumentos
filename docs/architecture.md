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
- Listing photos.
- Public image storage buckets.
- Admin auth through Supabase Auth.
- RPC helpers such as `is_admin()` and `increment_listing_view_count()`.

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
- Used by `components/admin-panel.tsx` because admin login needs Supabase Auth session persistence.

There is no service-role key used in current app code. If `SUPABASE_SERVICE_ROLE_KEY` is ever added for server-only jobs, it must never be exposed to browser/client code.

## Actual Route Map

```text
app/
  layout.tsx
  page.tsx                         Homepage
  admin/page.tsx                   Admin panel
  api/listings/[id]/photos/route.ts
  api/listings/[id]/view/route.ts
  instrumentos/[slug]/page.tsx     Listing detail
  listados/page.tsx                Listings/search page
  listados/loading.tsx             Listings loading skeleton
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
```

Only `approved` listings should be visible publicly.

### Stores

Stores are mini-shop pages for small music stores. A store has:
- Public profile page.
- Logo and banner.
- WhatsApp contact.
- City, district, address.
- Verification status.
- Product listings.

Only `active` stores should be visible publicly.

### Admin

Admin controls supply quality. The admin panel can:
- View pending listings.
- Edit basic listing fields.
- Approve, reject, hide, or mark listings sold.
- View pending stores.
- Edit basic store fields.
- Approve or hide stores.
- Mark stores verified.

## Component Structure

Core local components:
- `components/listing-card.tsx`
- `components/listing-filters.tsx`
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

Recent local limitation: npm and dependencies were not available in this workspace, so checks may need to run elsewhere.

