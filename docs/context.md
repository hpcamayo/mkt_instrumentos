# Laria Codex Context

Laria is a vertical marketplace for musical instruments and related gear in Peru. The current codebase is a Next.js + TypeScript + Tailwind CSS + Supabase MVP deployed through GitHub -> Vercel, with Supabase managed separately.

Strategic goal: make Laria the best place in Peru to discover musical instruments and gear before adding transactional complexity.

Product scope:
- `docs/functional-spec.md` is canonical for the frozen V1 product contract. Code and schema describe current implementation, not the complete V1 scope.
- Buyers discover approved listings and contact sellers by WhatsApp.
- Sellers are either `individual` / Particular or `store` / Tienda.
- Individual sellers submit used gear from `/vender`.
- Stores register from `/registrar-tienda`; after approval they get public pages at `/tiendas/[slug]`.
- Store products also appear in `/listados`.
- Admin curation is central. Particular and normal Tienda listings require moderation; qualifying Tienda Verificada inventory publishes directly. Store pages require basic store approval.
- Particular Sprint 1 is implemented: full account/profile/password flows, account-required owned listing creation, dynamic instrument data, 2–10 ordered photos, and profile-resolved seller contact. Store-owner V1 work remains separate.
- No paid plans are active in V1. Future monetization may start with stores, but the frozen V1 rule is a free 50-concurrent-listing cap.
- V1 requires buyer/Particular accounts, ownership, seller/store dashboards, favorites, alerts, analytics, reports, verified transactions, and transaction-bound reviews. These are not all implemented yet; see the status matrix in `docs/functional-spec.md`.
- Payments, checkout, escrow, delivery, subscriptions, commissions, and in-app chat remain post-V1.
- UI copy should stay in Spanish.
- Visual/frontend work should follow `docs/design-system.md`.
- The completed UI visual refresh covers the homepage, listings/catalog page, listing detail page, user/seller panel, and admin panel. It was UI-only: no backend logic, schema changes, Supabase queries, or marketplace features were added.
- Domain/brand target: `laria.audio`. Some current app metadata/copy may still say "Instrumentos Peru"; treat Laria as the intended platform name.

Important current routes:
- `/`: homepage using `components_v0` sections with real Supabase data.
- `/listados`: advanced searchable listings page.
- `/instrumentos/[slug]`: listing detail page with a sticky desktop gallery at about 45% of the main detail grid, a wider right-side detail column, WhatsApp CTA, published/view metadata, seller/store trust box, description, full specs, and recommendation sections below the main grid.
- `/login`: account login with email/password and magic-link modes.
- `/recuperar-contrasena` and `/restablecer-contrasena`: password recovery and reset.
- `/auth/callback`: Supabase signup, invite, magic-link, and recovery callback. It accepts PKCE codes and server-verifiable token hashes, then writes the session cookie on the final redirect.
- `/confirmacion-correo`: legacy standalone confirmation-success page; current Particular confirmation lands on `/mi-cuenta?confirmed=1`.
- `/logout`: session logout.
- `/registro/vendedor`: Particular account signup for buying and selling. Signup metadata creates the complete profile; authenticated users are sent to `/mi-cuenta` instead of being asked for the same fields again. The database stores this account as `profiles.account_type='seller'`.
- `/registro/vendedor/invitacion`: invited seller profile setup after Supabase invite callback.
- `/registro/tienda/invitacion`: invited store-owner profile setup after Supabase invite callback; store approval still requires a pending store application.
- `/mi-cuenta`: protected account shell with real profile data and working profile/password navigation. Metrics and listing management remain incomplete.
- `/mi-cuenta/perfil`: Particular profile editing.
- `/mi-cuenta/seguridad`: authenticated password change.
- `/tiendas/[slug]`: public store page plus approved store listings.
- `/vender`: authenticated, account-owned Particular listing submission form.
- `/publicar`: redirects to `/vender`.
- `/registrar-tienda`: public store registration form.
- `/admin`: Supabase Auth admin panel for pending listings/stores.
- `/api/admin/invite-user`: server-only admin invite endpoint using Supabase service role after verifying the current user is admin.
- `/api/auth/check-email`: server-only duplicate-email precheck for seller signup. It uses a service-only indexed database lookup and returns only availability, never user details.

Key files:
- `lib/listings.ts`: shared listing types, filter parsing, labels, WhatsApp URLs.
- `lib/listing-specs.ts`: listing detail spec rows, base field labels, and attributes JSONB display formatting.
- `lib/instrument-filters.ts`: actual advanced filter config and current filter keys.
- `lib/listing-submission.ts`: shared 2–10 photo, category/instrument type, and dynamic-attribute validation.
- `components/listing-filters.tsx`: desktop sidebar and mobile filter/sort sheets.
- `components/listing-card.tsx`: compact card with first-photo lazy loading and on-demand photo carousel fetch.
- `app/instrumentos/[slug]/page.tsx`: listing detail layout, gallery, breadcrumb, specs, seller trust sections, similar listings, and more-from-seller listings.
- `components/listing-detail-gallery.tsx`: interactive listing detail gallery with main image, thumbnails, and previous/next controls.
- `components/listing-detail-metadata.tsx`: `Publicado hace X dias` / `Visto X veces` and client-side view-count increment.
- `components/page-container.tsx`: shared public page width and horizontal padding wrapper.
- `components/login-form.tsx`: login form with password and magic-link modes; login magic links do not create new users.
- `components/seller-signup-form.tsx`: individual seller signup/profile completion form.
- `components/invite-profile-setup-form.tsx`: shared invite setup form for seller/store owner profile completion.
- `components/invite-recovery-panel.tsx`: safe fallback UI when invite metadata/profile type does not match the route.
- `components/location-fields.tsx`: reusable city/region inputs for account and store onboarding.
- `components/admin-panel.tsx`: admin login, moderation queues, status updates.
- `app/api/admin/invite-user/route.ts`: trusted server route for admin-created seller/store-owner invites. Uses `SUPABASE_SERVICE_ROLE_KEY` only on the server.
- `lib/auth/profile.ts`: profile upsert helper for individual seller accounts. Uses the schema value `seller` for Particular accounts.
- `lib/location.ts`: valid Peru region list, city suggestions, and region normalization/validation.
- `lib/supabase/server-client.ts`: cookie-aware Supabase server client for auth routes/session utilities.
- `lib/supabase/admin-client.ts`: server-only service-role client used by trusted admin invite and duplicate-email routes and available for other server actions.
- `lib/auth/session.ts`: current-user/session helpers and protected-route redirect helper.
- `middleware.ts`: Supabase session refresh and protection for `/vender` and account routes.
- `docs/auth-email-templates.md`: owner-facing Supabase Auth invite and magic-link email copy for Phase 2 accounts.
- `docs/design-system.md`: canonical Laria visual system for future UI work.
- `supabase/migrations/20260516180000_phase_2_accounts.sql`: Phase 2 account schema, ownership fields, helper functions, and RLS policies.
- `supabase/migrations/20260910100000_particular_sprint_1.sql`: account-bound finalization, 2–10 publication requirements, profile projection policy, and removal of anonymous listing creation.
- `supabase/migrations/*`: manual SQL migrations for schema, RLS, storage, metadata, and view count RPC.

Operational rule: Vercel deploys code, but does not apply Supabase SQL migrations. Schema changes must be run manually in Supabase SQL Editor unless migration automation is added later.

Context-reset rule: before product or behavior work, read `docs/functional-spec.md` first, then the relevant `/docs` references. Do not rely on chat history. The functional specification wins over older planning notes.

Local npm checks are available in this workspace. Use `npm run typecheck`, `npm run lint`, and `npm run build` for implementation tickets when code changes.

Current reliability/performance reference: `docs/performance.md`. Catalog/store inventory is paginated; images are responsive; recommendations stream; public submissions use signed retries and atomic finalization through `/api/submissions`.
