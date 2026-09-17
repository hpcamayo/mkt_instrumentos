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
- Sprint 1 and Sprint 2 are **CLOSED / ACCEPTED**. Sprint 3 and Sprint 3.1 are deployed. Owner manual production retest PASS on 2026-09-16 covers `STORE-018`, `DASH-008`, `NOTIF-001`, `NOTIF-002`, `LIST-013`, `REV-011`, and `REV-012`; canonical evidence is in `acceptance/cases.tsv`. `REV-014` was the photo-amendment failure, not a new text-amendment failure.
- Sprint 4 is **local implementation only, not production-deployed**: safe same-password guidance, complete private/retryable photo editing, first-party events/contacts, and real Particular/Store analytics. Local photo SQL/API/actual-browser proof exercises `REV-014`; owner production acceptance still awaits the separate release gate and retest. Sprint 5 has not started; favorites, alerts, transactions/reviews, and later hub/email work remain absent.
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
- `/mi-cuenta`: protected account summary inside a shared server-authenticated layout with a persistent desktop sidebar and equivalent mobile menu.
- `/mi-cuenta/publicaciones` and `/mi-cuenta/publicar`: real Particular listing view and publication form.
- `/mi-cuenta/publicaciones/[id]/editar`: shared owner listing editor with immediate/moderated edit separation.
- `/mi-cuenta/tienda` and `/mi-cuenta/tienda/inventario`: Store Owner application/profile and inventory views.
- `/mi-cuenta/tienda/publicar`: Store Owner inventory submission for pending, normal, or verified stores.
- `/mi-cuenta/tienda/estadisticas`: real owner-only statistics with lifetime/7-day/30-day windows, active locally in Sprint 4.
- `/mi-cuenta/perfil`: Particular profile editing.
- `/mi-cuenta/seguridad`: authenticated password change.
- `/mi-cuenta/notificaciones`: owner-scoped in-app listing/revision/store lifecycle notifications and read state.
- `/tiendas/[slug]`: public store page plus approved store listings.
- `/vender`: authenticated, account-owned Particular listing submission form.
- `/publicar`: redirects to `/vender`.
- `/registro/tienda`: separate Store Owner account signup.
- `/registrar-tienda`: authenticated owner-bound store application/profile management.
- `/admin`: Supabase Auth admin panel with listing lifecycle/revision moderation and Sprint 2 store approval/rejection/verification operations.
- `/api/listings/[id]/manage`: authenticated owner edit, lifecycle, and relist actions backed by trusted Postgres RPCs.
- `/api/listings/[id]/photo-cleanup`: owner-bound reference-checked cleanup through a service-only retirement-claim RPC.
- `/api/listing-images/...`: authorized private edit-photo delivery; unattached/proposed objects are not anonymous public assets.
- `/api/events/session`, `/api/events`, and `/api/contact`: signed first-party identity bootstrap, bounded typed event batches, and canonical WhatsApp click-intent tracking (local Sprint 4).
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
- `components/marketplace-telemetry.tsx` and `components/whatsapp-contact-link.tsx`: actual visible activity tracking and fail-safe WhatsApp intent recording.
- `lib/marketplace-event-payload.ts`, `lib/marketplace-events-client.ts`, and `lib/marketplace-events-server.ts`: strict payloads, bounded retrying batches, server-verified actors, signed sessions/search receipts, and service-only event recording.
- `components/listing-management-table.tsx`: role-shared inventory states and lifecycle actions.
- `components/listing-edit-form.tsx`: split immediate/moderated edits plus staged photo proposals.
- `lib/listing-photo-cleanup.ts`: explicit retryable cleanup failures, database reference/retirement checks, and trusted Storage removal; no browser deletion of historical objects.
- `lib/account-analytics.ts` and `components/account-analytics.tsx`: validated request-scoped aggregate reads and honestly labelled real metrics; no global cache of private owner data.
- `lib/auth/password.ts`: maps only Supabase `same_password` to safe Spanish guidance without inspecting the current password; unknown failures remain generic.
- `components/page-notice.tsx`: shared accessible page-level result notice with focus and scroll-into-view behavior.
- `components/notifications-list.tsx`: newest-first in-app notices, target navigation, and read actions.
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
- `supabase/migrations/20260910190000_store_sprint_2.sql`: Store Owner/application ownership, RUC uniqueness, store-photo RLS, trust/publication RPCs, active-parent visibility, and the concurrent inventory cap.
- `supabase/migrations/20260913120000_listing_sprint_3.sql`: owner lifecycle, listing/revision moderation, sold immutability, relist lineage, proposed photos, and cap-safe restoration/relisting.
- `supabase/migrations/20260916120000_sprint_3_1_acceptance_fixes.sql`: amendable/versioned pending revisions, stale-admin protection, notification schema/RLS/events, and read state.
- `supabase/migrations/20260916180000_sprint_4_photos.sql`: private staging, canonical image validation, cleanup retirement claims, edit receipts, and empty-proposal photo-reference release (local only).
- `supabase/migrations/20260916200000_sprint_4_events.sql`: service-only typed events, authoritative lifecycle triggers, rolling view/impression dedupe, preserved view cache, and restricted grouped analytics (local only).
- `supabase/migrations/*`: manual SQL migrations for schema, RLS, storage, metadata, and view count RPC.

Operational rule: Vercel deploys code, but does not apply Supabase SQL migrations. Schema changes must be run manually in Supabase SQL Editor unless migration automation is added later.

Context-reset rule: before product or behavior work, read `docs/functional-spec.md` first, then the relevant `/docs` references. Do not rely on chat history. The functional specification wins over older planning notes.

Local npm checks are available in this workspace. Use `npm run typecheck`, `npm run lint`, and `npm run build` for implementation tickets when code changes.

Current reliability/performance reference: `docs/performance.md`. Catalog/store inventory is paginated; images are responsive; recommendations stream; public submissions use signed retries and atomic finalization through `/api/submissions`.

Sprint 4 implementation semantics: new edit photos use private `listing-edit-photos` owner/listing/attempt paths and authorized `/api/listing-images/...` URLs. Identical signed edit retries return one stored result; changed payloads are rejected. Pending amendments retain one versioned proposal and unchanged live photos until approval; restoration removes only intended differences. Cleanup claims are serialized with editing and protect every live/sold/shared/retained-history reference. Existing public/legacy objects remain compatible; no scheduled orphan sweeper was added.

Event identity is a random signed HttpOnly/SameSite=Lax first-party cookie with 24-hour expiry plus server-verified Auth identity when available; no raw IP, fingerprint, WhatsApp content, password, or auth-token payloads. Impressions require 50% real visible intersection; detail/store views are visible-client events, never SSR/prefetch effects. Database dedupe uses a rolling 30-minute identity/entity/event window; owner/admin commercial activity is excluded. Contact clicks remain separate intents, same-event retries are idempotent, and telemetry outage preserves contact navigation. Search filters/result counts use signed server receipts; lifecycle transitions are authoritative database triggers. Raw event access remains service-only, ordinary owners receive aggregate metrics without a buyer directory.

Analytics semantics: Particular summary aggregates all owned inventory, not its recent-five list. Lifetime listing views include the historical cache, 7/30-day views count recorded events, and no synthetic history is generated. CTR = recorded product views / impressions; contact rate = product contacts / recorded product views in one period. Zero denominator is `Sin datos`; failed aggregates are unavailable, not fabricated zero. Active inventory means currently approved/public including active-parent-store eligibility; sold counts mean seller-marked state, not verified paid sales. Store `Estadísticas` defaults to 30 days and supports 0/7/30. Favorites/revenue/transaction metrics and the full admin analytics hub are not implemented.

Acceptance process: `acceptance/cases.tsv` is canonical and `acceptance/sprints.tsv` is the selective retrieval guide. Read only exact current-sprint IDs/domain prefixes, preserve unrelated rows/IDs, and validate TSV changes. Do not read or regenerate XLSX until the final V1 freeze gate. Owner Sprint 4 production QA begins only after the separate release gate; local proof is not manual production acceptance.
