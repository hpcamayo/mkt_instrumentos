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
- Future monetization likely starts with stores: listing packages, featured stores/listings, homepage/category placement, and catalog services.
- Do not add payments, checkout, escrow, delivery, reviews, subscriptions, commissions, seller dashboards, or in-app chat unless explicitly requested.
- UI copy should stay in Spanish.
- Domain/brand target: `laria.audio`. Some current app metadata/copy may still say "Instrumentos Peru"; treat Laria as the intended platform name.

Important current routes:
- `/`: homepage using `components_v0` sections with real Supabase data.
- `/listados`: advanced searchable listings page.
- `/instrumentos/[slug]`: listing detail page with WhatsApp CTA, published/view metadata, and full photo display.
- `/tiendas/[slug]`: public store page plus approved store listings.
- `/vender`: public individual listing submission form.
- `/publicar`: redirects to `/vender`.
- `/registrar-tienda`: public store registration form.
- `/admin`: Supabase Auth admin panel for pending listings/stores.

Key files:
- `lib/listings.ts`: shared listing types, filter parsing, labels, WhatsApp URLs.
- `lib/instrument-filters.ts`: actual advanced filter config and current filter keys.
- `components/listing-filters.tsx`: desktop sidebar and mobile filter/sort sheets.
- `components/listing-card.tsx`: compact card with first-photo lazy loading and on-demand photo carousel fetch.
- `components/listing-detail-metadata.tsx`: `Publicado hace X dias` / `Visto X veces` and client-side view-count increment.
- `components/admin-panel.tsx`: admin login, moderation queues, status updates.
- `supabase/migrations/*`: manual SQL migrations for schema, RLS, storage, metadata, and view count RPC.

Operational rule: Vercel deploys code, but does not apply Supabase SQL migrations. Schema changes must be run manually in Supabase SQL Editor unless migration automation is added later.

Context-reset rule: before new work, read `/docs` first and summarize the current product, architecture, schema, features, filters, decisions, and roadmap. Do not rely on chat history.

Known local environment limitation from recent sessions: `npm` and `node_modules` were not available in this workspace, so local build/typecheck/lint could not be run here. Verify with `npm install`, `npm run typecheck`, `npm run lint`, and `npm run build` in a proper Node environment or on Vercel.

