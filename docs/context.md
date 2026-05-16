# Laria Codex Context

Laria is a vertical marketplace for musical instruments and related gear in Peru. The current codebase is a Next.js + TypeScript + Tailwind CSS + Supabase MVP deployed through GitHub -> Vercel, with Supabase managed separately.

Strategic goal: make Laria the best place in Peru to discover musical instruments and gear before adding transactional complexity.

Product scope:
- Buyers discover approved listings and contact sellers by WhatsApp.
- Sellers are either `individual` / Particular or `store` / Tienda.
- Individual sellers submit used gear from `/vender`.
- Stores register from `/registrar-tienda`; after approval they get public pages at `/tiendas/[slug]`.
- Store products also appear in `/listados`.
- Admin curation is central: pending listings/stores must be reviewed before public visibility.
- Phase 2 account foundation exists in the database: `profiles`, `store_members`, listing/store ownership fields, account-aware RLS helpers, and publication validation RPCs. The public account UI still needs to be built.
- Future monetization likely starts with stores: listing packages, featured stores/listings, homepage/category placement, and catalog services.
- Do not add payments, checkout, escrow, delivery, reviews, subscriptions, commissions, seller dashboards, or in-app chat unless explicitly requested.
- UI copy should stay in Spanish.
- Domain/brand target: `laria.audio`. Some current app metadata/copy may still say "Instrumentos Peru"; treat Laria as the intended platform name.

Important current routes:
- `/`: homepage using `components_v0` sections with real Supabase data.
- `/listados`: advanced searchable listings page.
- `/instrumentos/[slug]`: listing detail page with a sticky desktop gallery at about 45% of the main detail grid, a wider right-side detail column, WhatsApp CTA, published/view metadata, seller/store trust box, description, full specs, and recommendation sections below the main grid.
- `/login`: magic-link login.
- `/auth/callback`: Supabase email invite/magic-link callback.
- `/logout`: session logout.
- `/tiendas/[slug]`: public store page plus approved store listings.
- `/vender`: public individual listing submission form.
- `/publicar`: redirects to `/vender`.
- `/registrar-tienda`: public store registration form.
- `/admin`: Supabase Auth admin panel for pending listings/stores.

Key files:
- `lib/listings.ts`: shared listing types, filter parsing, labels, WhatsApp URLs.
- `lib/listing-specs.ts`: listing detail spec rows, base field labels, and attributes JSONB display formatting.
- `lib/instrument-filters.ts`: actual advanced filter config and current filter keys.
- `components/listing-filters.tsx`: desktop sidebar and mobile filter/sort sheets.
- `components/listing-card.tsx`: compact card with first-photo lazy loading and on-demand photo carousel fetch.
- `app/instrumentos/[slug]/page.tsx`: listing detail layout, gallery, breadcrumb, specs, seller trust sections, similar listings, and more-from-seller listings.
- `components/listing-detail-gallery.tsx`: interactive listing detail gallery with main image, thumbnails, and previous/next controls.
- `components/listing-detail-metadata.tsx`: `Publicado hace X dias` / `Visto X veces` and client-side view-count increment.
- `components/page-container.tsx`: shared public page width and horizontal padding wrapper.
- `components/admin-panel.tsx`: admin login, moderation queues, status updates.
- `lib/supabase/server-client.ts`: cookie-aware Supabase server client for auth routes/session utilities.
- `lib/supabase/admin-client.ts`: server-only service-role client for later invite/admin server actions.
- `lib/auth/session.ts`: current-user/session helpers and protected-route redirect helper.
- `middleware.ts`: Supabase session refresh and protection for future account routes.
- `supabase/migrations/20260516180000_phase_2_accounts.sql`: Phase 2 account schema, ownership fields, helper functions, and RLS policies.
- `supabase/migrations/*`: manual SQL migrations for schema, RLS, storage, metadata, and view count RPC.

Operational rule: Vercel deploys code, but does not apply Supabase SQL migrations. Schema changes must be run manually in Supabase SQL Editor unless migration automation is added later.

Context-reset rule: before new work, read `/docs` first and summarize the current product, architecture, schema, features, filters, decisions, and roadmap. Do not rely on chat history.

Local npm checks are available in this workspace. Use `npm run typecheck`, `npm run lint`, and `npm run build` for implementation tickets when code changes.
