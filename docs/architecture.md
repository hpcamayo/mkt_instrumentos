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
  api/listings/[id]/photos/route.ts
  api/listings/[id]/view/route.ts
  confirmacion-correo/page.tsx     Email confirmation success page
  instrumentos/[slug]/page.tsx     Listing detail
  listados/page.tsx                Listings/search page
  listados/loading.tsx             Listings loading skeleton
  login/page.tsx                   Password and magic-link login
  logout/route.ts                  Sign out and redirect to /login
  mi-cuenta/page.tsx               Protected account/seller panel shell
  publicar/page.tsx                Redirects to /vender
  registrar-tienda/page.tsx        Store registration
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

Admin authority remains based on Supabase Auth `app_metadata.role = "admin"`. Profile `account_type` is app metadata only and is not the security boundary.

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
- `components/store-registration-form.tsx`
- `components/site-header.tsx`
- `components/site-footer.tsx`

Generated/imported UI:
- `components_v0/*`
- Removed unused `components_v0/ui` scaffold

The homepage uses `components_v0` sections, but marketplace data logic remains in the route page. v0-generated UI should be integrated carefully and should not replace Supabase/business logic blindly.

The listing detail route composes `ListingDetailGallery` in a sticky desktop column using `minmax(0,0.82fr)`, with the main listing facts, seller/store trust box, description, and full specs in the wider `minmax(0,1fr)` right column. Recommendation sections stay below that main detail grid.

The UI visual refresh covers the homepage, listings/catalog page, listing detail page, `/mi-cuenta` seller/account panel shell, and `/admin` panel. It is a visual layer only: it does not add backend logic, schema changes, Supabase queries, auth changes, moderation changes, or marketplace features. Unsupported visual areas must remain placeholder-only and commented in code.

Account UI uses the browser Supabase client for interactive auth. `/login` supports password login and magic-link login; the login magic-link path passes `shouldCreateUser:false` to avoid creating accounts accidentally. `/recuperar-contrasena` and `/restablecer-contrasena` use Supabase Auth recovery through the same callback, while `/mi-cuenta/seguridad` performs authenticated password changes. `/registro/vendedor` and `/registro/tienda` create distinct account types with normalized profile metadata. The auth-user trigger persists name, WhatsApp, city, and region immediately. `/auth/callback` accepts PKCE `code` callbacks and server-verifiable `token_hash` callbacks, writes the Supabase session cookies on its returned redirect, and repairs incomplete Particular or Store Owner profiles from trusted Auth metadata when possible.

`/vender` is protected in middleware and again in its Server Component, and Store Owner accounts are directed to `/mi-cuenta/tienda/publicar` instead of creating Particular inventory. The browser keeps direct-to-Storage uploads and retry recovery, while all submission capabilities are HMAC-signed and bound to `auth.uid()`. Authenticated uploads use `{userId}/{submissionId}/{sortOrder}.{ext}`; `/api/submissions` revalidates account/store ownership and a service-only idempotent RPC atomically inserts the application/listing plus photo rows. A normal or pending store produces pending inventory; an active verified store may approve a qualifying new listing in the same transaction.

Approved account-owned Particular detail pages join the seller's profile under RLS and resolve current name, WhatsApp, city, and region dynamically. Legacy `owner_user_id=null` listings continue using their historical contact fields. More-from-seller grouping uses ownership when available and WhatsApp only for legacy rows.

Seller signup checks duplicate emails through `app/api/auth/check-email/route.ts` before calling Supabase `signUp()`. The route uses a service-only indexed Auth email lookup and returns only an availability flag, because `profiles` does not currently store email. Repeated signup attempts show a Spanish error and a link to `/login` instead of a false "check your email" success state.

Signup confirmation emails redirect through `/auth/callback?next=%2Fmi-cuenta%3Fconfirmed%3D1`. The dashboard renders the explicit confirmed-email state while preserving the normal account experience. `/confirmacion-correo` remains as a legacy standalone success page. Supabase needs the `/auth/callback` URL allowlisted for each domain, and the signup, magic-link, and recovery templates must use the token-hash links documented in `docs/auth-email-templates.md`.

Invite setup pages require an authenticated Supabase session after the invite callback. `/registro/vendedor/invitacion` completes a Particular seller profile and continues to `/vender`; `/registro/tienda/invitacion` completes a store-owner profile and continues to `/registrar-tienda` for the store application. Invite routing depends on `account_type` metadata when available. If metadata/profile type does not match the route, the page shows a recovery panel instead of changing account type blindly. Temporary passwords are not used.

The admin invite endpoint builds Supabase `redirectTo` URLs as `/auth/callback?next=/registro/.../invitacion`, so the app callback exchanges the Supabase code before sending the user to the seller/store setup page. Seller invite metadata stores `account_type='seller'` plus `invite_account_type='individual'`; store-owner invite metadata stores `account_type='store_owner'`.

Location onboarding uses `components/location-fields.tsx` with a fixed Peru region list from `lib/location.ts`. Region values are normalized to canonical labels such as `Junín`; city uses suggestions but remains free text after trimming.

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
