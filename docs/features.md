# Features

## Marketplace Model

Laria supports two seller models.

### Particular

Individual sellers publishing used instruments.

Current model:
- Free listing submission.
- Admin approval.
- Buyer contacts seller through WhatsApp.

Future monetization:
- Featured listings.
- Visibility boosts.
- Transaction commission only later, if Laria controls payment/transaction flow.

Reasoning: commission from individuals is weak early because WhatsApp/cash transactions can bypass the platform.

### Tienda

Small music stores with public mini-shop pages.

Current model:
- Free store registration.
- Admin approval.
- Public store page.
- Store products appear in general listings search.

Future monetization:
- Monthly plans by listing volume.
- Featured store placement.
- Homepage/category boosts.
- Catalog management services.

Stores are likely the first realistic monetization engine.

## Homepage

Route: `/`

The homepage uses newer UI sections from `components_v0`:
- `HeroSection`
- `CategoriesSection`
- `FeaturedListings`
- `VerifiedStores`
- `TrustSection`
- `CTASection`

It fetches real Supabase data:
- Up to 8 approved listings for featured listings.
- Up to 4 active verified stores.
- Only the first listing photo is embedded for homepage listings.

Layout uses the shared `PageContainer` public width system.

Visual refresh:
- Uses the canonical Laria visual system from `docs/design-system.md`.
- Keeps the black header/footer, yellow major CTAs, light marketplace sections, blue interface accents, and placeholder-only unsupported blocks.
- Does not add backend logic, Supabase queries, or new marketplace features.

## Listings Page

Route: `/listados`

This is the most important buyer page. It should feel useful and serious for musicians before Laria adds transactional features.

Features:
- Public browse/search for approved listings.
- Result count, for example `128 resultados`.
- Active filter chips.
- `Limpiar filtros` links.
- Desktop sticky filter sidebar around 260px.
- Mobile `Filtrar` and `Ordenar` controls.
- Empty state: `No encontramos resultados con esos filtros`.
- Route-level skeleton loaders.
- URL query params as source of truth, so filtered pages are shareable.

Layout:
- Max width around `1600px`, centralized through `PageContainer`.
- Desktop: `260px` sidebar + listing grid.
- Grid: 1 column on narrow screens, 2 on wider mobile, 3 on medium, 4 on large desktop, 5 on very wide screens.

Visual refresh:
- Light page canvas with white filter/card surfaces.
- Blue active filter, focus, and selected states.
- Product cards follow the image/title/metadata/price hierarchy from `docs/design-system.md`.
- The refresh did not change filter logic, route params, query params, or listing fetching.

## Listing Cards

Component: `components/listing-card.tsx`

Cards are compact and optimized for dense browsing:
- 4:3 image ratio.
- Instrument type/category tag over the image.
- Photo controls only when multiple photos exist.
- Seller badge: `Particular`, `Tienda`, or `Tienda verificada`.
- Title prefers `brand + model`, falling back to `title`.
- Condition appears as subtitle, for example `Usado · Buen estado`.
- Price and location are shown.
- Store name links to `/tiendas/[slug]` when present.

Cards intentionally do not show:
- `Publicado hace X dias`
- `Visto X veces`
- raw `published_at`
- raw `view_count`

Why:
- Category/type and condition are metadata, not part of the title.
- Short cards scan better in a 4-column marketplace grid.
- Published/view metadata belongs on the detail page.

## Listing Card Photo Behavior

Listings page behavior:
- Initially load/render only the first photo per listing.
- Show arrows/dots if more photos exist.
- Fetch remaining photos only when the user interacts with card photo controls.
- Cache fetched photos in component state.
- Render only the active photo.
- Use lazy loading.

Implementation:
- Listing/store/home queries select `id`, `listing_id`, `image_url`, `alt_text`, and `sort_order` for the first embedded photo.
- Browse pages calculate `photo_count` with a lightweight `listing_photos` query for `listing_id`.
- `/api/listings/[id]/photos` fetches additional photos on demand, optionally excluding the already-rendered first photo by `exclude_id`.

## Listing Detail

Route: `/instrumentos/[slug]`

Features:
- Reads one approved listing by `slug`.
- Uses a commercial two-column layout on desktop:
  - Left side: sticky product gallery using `minmax(0,0.82fr)`, currently about 45% of the main detail grid.
  - Right side: wider detail panel using `minmax(0,1fr)`, with breadcrumb, seller badge, title, price, metadata, key specs, WhatsApp CTA, seller trust box, description, and full specs.
- Gallery behavior:
  - Desktop gallery uses `position: sticky` with a top offset and remains beside the right-side detail panel while details scroll past it.
  - Mobile gallery is not sticky and appears above the detail column.
  - Main image uses `object-contain` to avoid aggressive instrument cropping.
  - Thumbnail buttons update the active image and show a visible selected state.
  - Previous/next buttons appear when multiple photos exist; arrow keys also work when the gallery is focused.
  - Missing photos show a `Foto pendiente` fallback.
  - The gallery renders one large active image plus compact thumbnails, preserving existing Supabase image URLs and upload/storage behavior.
- Breadcrumb format is `Inicio / Categoria / Titulo`, with the category linking back to filtered listings.
- Title prefers `brand + model`, falling back to the original listing title.
- Top metadata shows:
  - `Publicado hace X dias`
  - `Visto X veces`
- Key specs near the title/price show category, brand, model, condition, city, seller, and selected instrument attributes when available.
- The right detail column shows `Descripción` and `Especificaciones completas` below `Sobre el vendedor` or `Sobre la tienda`, so the sticky gallery can remain beside the full detail content on desktop.
- Lower recommendation sections remain below the main two-column detail area:
  - `Artículos similares`
  - `Más de este vendedor` or `Más de esta tienda`
- Recommendation sections use the existing compact listing cards:
  - `Artículos similares` reads approved listings only, excludes the current listing, prioritizes the same `instrument_type` when present or otherwise the same category, boosts same-brand results within that pool, and can fill remaining slots with same-brand listings. It shows up to 4 items.
  - `Más de este vendedor` / `Más de esta tienda` reads approved listings only, excludes the current listing, uses `store_id` for stores and `whatsapp_phone` for individual sellers, shows up to 4 items, and is hidden when there are no results.
- `Especificaciones completas` renders clean label/value rows. It includes base fields `Publicado`, `Condición`, `Categoría`, `Marca`, `Modelo`, `Ciudad`, and `Vendedor`/`Tienda`, followed by non-empty `attributes` values.
- Attribute labels and option values reuse `lib/instrument-filters.ts` through `lib/listing-specs.ts`; raw JSON and snake_case keys should not be exposed to users.
- Increments `view_count` through `/api/listings/[id]/view`.
- Uses localStorage to avoid incrementing the same listing repeatedly in the same browser within 24 hours.
- Primary CTA opens WhatsApp using a prefilled Spanish message.
- Store listings include a secondary link to the store page.
- Includes a safety/trust notice reminding users that Laria does not process payments, shipping, or guarantees.
- Seller/store trust box:
  - Individual listings show `Sobre el vendedor`, seller name when available, `Particular`, location, active approved listing count, visible-since date, WhatsApp contact action, and a short safety note.
  - Store listings show `Sobre la tienda`, store name, verified badge when `stores.is_verified=true`, location, short store description when available, active approved listing count, visible-since date, WhatsApp contact action, and a link to the public store page.
  - Listing counts use approved active listings from the same store or, for individuals, the same WhatsApp contact.
- Ratings, sales counts, reviews, checkout, delivery, payments, and chat are not shown because the MVP does not store or support them.
- Layout uses the shared `PageContainer` public width system.
- Visual refresh keeps the same data and contact behavior while aligning the gallery, detail panels, seller trust box, specs, and recommendation cards with `docs/design-system.md`.

## Store Pages

Route: `/tiendas/[slug]`

Public store pages show:
- Banner.
- Logo.
- Store name.
- Verified badge if applicable.
- City/district.
- Description.
- WhatsApp button.
- Approved listings from that store.

Layout uses the shared `PageContainer` public width system.

Store products also appear in general listings search.

## Public Listing Submission

Routes:
- `/vender`: form page.
- `/publicar`: redirect to `/vender`.

Current form fields:
- Title.
- Category.
- Brand.
- Model.
- Condition.
- Price.
- City.
- Seller name.
- WhatsApp.
- Description.
- Photos.

Current behavior:
- Requires at least one photo.
- Allows up to 6 photos.
- Accepts JPEG, PNG, WebP.
- Max 5 MB per photo.
- Inserts a `pending` individual listing.
- Uploads photos to `listing-photos`.
- Inserts photo records in `listing_photos`.
- Shows a success message saying an admin will review before publication.
- Page wrapper uses `PageContainer`; the form content remains capped for readability.

Note: the current seller form does not yet expose `instrument_type` or `attributes`, even though the listings page supports advanced filters. That is an important future improvement.

## Store Registration

Route: `/registrar-tienda`

Current form fields:
- Store name.
- City.
- District.
- Address.
- WhatsApp.
- Instagram.
- Facebook.
- Description.
- Logo.
- Banner.

Current behavior:
- Uploads logo/banner to `store-assets`.
- Inserts a `pending` store with `listing_plan='free'`.
- Shows a success message saying an admin will review before activation.
- Page wrapper uses `PageContainer`; the form content remains capped for readability.

## Admin Panel

Route: `/admin`

Admin behavior:
- Uses Supabase Auth email/password login.
- Calls `is_admin()` to verify `app_metadata.role = "admin"`.
- Includes an `Invitar usuario` section for fieldwork onboarding.
- Loads pending listings and pending stores.
- Allows editing listing basics before moderation.
- Listing actions: `Aprobar`, `Rechazar`, `Ocultar`, `Marcar vendido`.
- Allows editing store basics and `Tienda verificada`.
- Store actions: `Aprobar`, `Ocultar`.

Only pending queues are shown. Already approved/hidden/rejected/sold items are not listed in the current admin UI.

Admin visual refresh:
- Uses a dark admin sidebar/header area and light operational workspace.
- Uses white cards, subtle borders, dense readable tables, blue active states, and subtle status badges.
- Placeholder admin metrics are visual-only and must stay commented in code until real metrics exist.
- The refresh did not change moderation logic, approval/rejection behavior, invite behavior, or admin authorization.

Admin invite behavior:
- Admin can invite a seller or store owner by email.
- Fields include email, full name, WhatsApp, account type, optional city/region, optional store name, and notes for fieldwork follow-up.
- Invites are sent by `/api/admin/invite-user`, a trusted server route that verifies `is_admin()` before using the server-only Supabase service-role client.
- Seller invites route through `/auth/callback?next=/registro/vendedor/invitacion`.
- Store-owner invites route through `/auth/callback?next=/registro/tienda/invitacion`.
- No temporary passwords are created.
- Seller invite metadata stores the database-safe `account_type='seller'` and `invite_account_type='individual'`.
- Store-owner invite metadata stores `account_type='store_owner'`.
- Store-owner invites do not create or approve a store automatically; the user completes the existing store application after activation.
- Supabase may still use one built-in invite email template, so seller/store-specific experience currently happens after the click.

## Account Auth Plumbing

Routes:
- `/login`: email/password login plus magic-link login for existing users.
- `/registro/vendedor`: public individual seller signup and profile completion.
- `/confirmacion-correo`: email confirmation success page after seller signup.
- `/registro/vendedor/invitacion`: invited seller profile setup.
- `/registro/tienda/invitacion`: invited store-owner profile setup.
- `/mi-cuenta`: protected account/seller panel shell after login/signup.
- `/auth/callback`: exchanges Supabase magic-link/invite `code` values for an app session.
- `/logout`: signs out and redirects to `/login`.

Behavior:
- Magic links use `/auth/callback?next=...`.
- Login-page magic links use `shouldCreateUser:false` so they do not accidentally create new users.
- Individual seller signup creates a Supabase Auth user, stores onboarding metadata, and creates or updates the matching `profiles` row.
- Before seller signup calls Supabase Auth, `/api/auth/check-email` performs a server-side duplicate-email precheck using the service-role Auth Admin API. If the email already exists, the form shows `Este correo ya está registrado. Ingresa con tu cuenta o usa otro correo.` with a link to `/login`.
- The product concept Particular maps to `profiles.account_type='seller'` in the current database schema.
- Signup collects full name, email, WhatsApp, city, region, password, and marketplace rules acceptance.
- If Supabase email confirmation is enabled, `/auth/callback` completes the seller profile from Auth user metadata after the user clicks the confirmation link, then redirects to `/confirmacion-correo`.
- Callback redirects only to safe same-site paths.
- Intended invite next paths are `/registro/vendedor/invitacion` and `/registro/tienda/invitacion`.
- Seller invite flow shows `Activa tu cuenta de vendedor`, completes missing profile fields, confirms the Particular account type, and continues to creating a first listing through `/vender`.
- Store invite flow shows `Activa la cuenta de tu tienda`, completes store-owner contact profile fields, explains that admin approval is required, and continues to the store application form at `/registrar-tienda`.
- Current store application submission at `/registrar-tienda` remains the existing public pending-store form; deeper account-owned store application management is still a later Phase 2 step.
- Invite pages require an authenticated session after `/auth/callback`; anonymous visitors are redirected to `/login` with the invite route preserved in `next`.
- Invite pages use `account_type` metadata/profile type when available. If metadata is missing or mismatched, they show a safe recovery panel instead of silently changing account type.
- Invite flows do not use temporary passwords.
- Account and invite location forms use a fixed Peru region list and city suggestions with free-text city fallback. Region must normalize to one of: Amazonas, Áncash, Apurímac, Arequipa, Ayacucho, Cajamarca, Callao, Cusco, Huancavelica, Huánuco, Ica, Junín, La Libertad, Lambayeque, Lima, Loreto, Madre de Dios, Moquegua, Pasco, Piura, Puno, San Martín, Tacna, Tumbes, Ucayali.
- Supabase Auth email template copy is documented in `docs/auth-email-templates.md`.
- Type-specific invite behavior is planned through `account_type` metadata plus `redirectTo`, not separate email infrastructure.
- Middleware refreshes Supabase Auth cookies and protects `/mi-cuenta` and future `/mis-publicaciones` routes.
- Seller dashboards, listing management pages, store account signup, and invite setup pages are not built yet.

Account panel visual refresh:
- `/mi-cuenta` now uses a seller-control-panel style shell with sidebar navigation, profile data, empty publications table, and placeholder metric/chart cards.
- Placeholder metrics and chart areas are visual-only and commented in code; they do not represent real analytics.
- The refresh did not change auth/session logic or add seller listing management calculations.

## Features Intentionally Not Implemented Yet

Do not add without explicit decision:
- Payments.
- Checkout.
- Escrow.
- Delivery.
- Reviews.
- Internal chat.
- Full seller dashboards.
- Subscription billing.
- Commission logic.
- Complex analytics.

## Performance and submission reliability

Catalog and store inventories have 24-item pages. Product images are resized responsively. Detail recommendations stream separately from the product. Failed submissions can be retried in the same open form without creating duplicates; records are finalized only after uploads finish. See `docs/performance.md`.
