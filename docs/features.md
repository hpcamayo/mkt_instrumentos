# Features

This file describes current implementation. The frozen V1 requirements live in `docs/functional-spec.md`; missing behavior below is an implementation gap unless that specification marks it post-V1.

## Marketplace Model

Laria supports two seller models.

### Particular

Individual sellers publishing used instruments.

Current model:
- Free listing submission.
- Admin approval.
- Buyer contacts seller through WhatsApp.

Frozen V1 requirement:
- A Particular account can buy and sell, owns its listings, and receives the dashboard, favorites, alerts, analytics, verified-transaction, and review capabilities in `docs/functional-spec.md`.
- New Particular listings require an account and moderation.

Post-V1 monetization possibilities (not active V1 features):
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

Frozen V1 requirement:
- A normal Tienda continues to require product moderation.
- A Tienda Verificada can directly publish qualifying inventory and edits; verification also approves its currently pending inventory.
- Free stores have a 50-concurrent-listing cap. Paid plans are not active in V1.

Post-V1 monetization possibilities (not active V1 features):
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
- Seller badge: `Particular`, `Tienda`, or `Tienda Verificada`.
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
- Ratings and reviews are not currently implemented. Frozen V1 requires them only for verified Laria transactions; checkout, delivery, payments, and chat remain out of V1.
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

## Account-owned Particular Listing Submission

Routes:
- `/vender`: form page.
- `/publicar`: redirect to `/vender`.

Current form fields:
- Title.
- Category.
- Instrument type.
- Supported dynamic attributes.
- Brand.
- Model.
- Condition.
- Price.
- City and region for the item location.
- Description.
- 2–10 ordered photos.
- Marketplace rules acceptance.

Current behavior:
- Requires a signed-in Particular account and preserves `/vender` as the login return path.
- Uses the current profile for seller name, WhatsApp, city, and region; listing-level contact remains as a compatibility snapshot.
- Supports adding, reordering, replacing, and removing photos, with 2–10 enforced.
- Accepts JPEG, PNG, WebP.
- Max 5 MB per photo.
- Atomically inserts a `pending` individual listing with `owner_user_id=auth.uid()` and `created_by_source='self_service'`.
- Uploads photos to `listing-photos`.
- Inserts photo records in `listing_photos`.
- Shows a success message saying an admin will review before publication.
- Page wrapper uses `PageContainer`; the form content remains capped for readability.

The signed/idempotent retry architecture remains in place. Listing tokens are account-bound, and authenticated uploads use `{auth.uid()}/{submissionId}/...` storage paths. Legacy anonymous listings remain readable through their historical contact fields but the anonymous listing-creation policy is removed.

## Store Registration

Route: `/registrar-tienda`

The route requires a separate Store Owner account. An authenticated Particular receives a safe explanation/sign-out path and is never converted. New Store Owners can register at `/registro/tienda` using the shared Supabase Auth infrastructure.

Required application fields:
- Public store name, RUC, razón social, business email, phone/WhatsApp, physical address, city/region, and contact person.

Current behavior:
- Binds the application to `auth.uid()` and preserves one effective store per owner.
- Normalizes RUC and enforces uniqueness in Postgres.
- Accepts optional description, district, logo, banner, physical-store photos, Instagram, Facebook, TikTok, and website.
- Shows pending/active/rejected/hidden state, owner-visible rejection reason, and Tienda/Tienda Verificada trust state.
- Owners can edit allowed business/profile fields, manage optional physical-store photos, and resubmit a corrected rejected application.
- Pending and normal Tienda inventory enters moderation. Qualifying Tienda Verificada inventory publishes directly.
- The database serializes the 50-item pending+approved inventory cap; the owner UI shows real capacity and a clear full-cap message.
- Page wrapper uses `PageContainer`; the form content remains capped for readability.

## Admin Panel

Route: `/admin`

Admin behavior:
- Uses Supabase Auth email/password login.
- Calls `is_admin()` to verify `app_metadata.role = "admin"`.
- Includes an `Invitar usuario` section for fieldwork onboarding.
- Loads pending listings and all store applications/trust states needed for Sprint 2 operation.
- Allows editing listing basics before moderation.
- Allows inspecting/editing instrument type and supported attributes with labeled controls.
- Listing actions: `Aprobar`, `Rechazar`, `Ocultar`, `Marcar vendido`.
- Shows RUC, owner ID, razón social, business email, phone, address/location, contact person, links, status, and trust state.
- Store actions use trusted RPCs: basic approve, reject/hide with mandatory reason, verify, and revoke verification.
- Verification is atomic with approval of all qualifying pending inventory; the UI reports the transitioned count.

The Sprint 2 store workflow is operable, while the full future hub remains a V1 gap: listing/store search and filtering, users, revisions, reports, reviews, transactions, listing moderation reasons, and legacy ownership linking belong to their scheduled sprints.

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
- `/recuperar-contrasena`: sends a Supabase Auth recovery link.
- `/restablecer-contrasena`: sets a new password after the recovery callback.
- `/registro/vendedor`: public Particular signup for buying and selling; authenticated users return to the dashboard instead of re-entering profile data.
- `/confirmacion-correo`: legacy standalone confirmation success page; current signup confirmation shows success inside `/mi-cuenta`.
- `/registro/vendedor/invitacion`: invited seller profile setup.
- `/registro/tienda/invitacion`: invited store-owner profile setup.
- `/mi-cuenta`: protected account/seller panel shell after login/signup.
- `/mi-cuenta/perfil`: edits Particular name, WhatsApp, city, and region.
- `/mi-cuenta/seguridad`: authenticated password change.
- `/auth/callback`: verifies Supabase signup, magic-link, recovery, and invite token hashes (and supports PKCE codes), then sets a server-readable app session on the redirect response.
- `/logout`: signs out and redirects to `/login`.

Behavior:
- Magic links use `/auth/callback?next=...`.
- Login-page magic links use `shouldCreateUser:false` so they do not accidentally create new users.
- Individual seller signup creates a Supabase Auth user, stores onboarding metadata, and creates or updates the matching `profiles` row.
- Before seller signup calls Supabase Auth, `/api/auth/check-email` performs a server-side duplicate-email precheck using the service-role Auth Admin API. If the email already exists, the form shows `Este correo ya está registrado. Ingresa con tu cuenta o usa otro correo.` with a link to `/login`.
- The product concept Particular maps to `profiles.account_type='seller'` in the current database schema.
- Signup collects full name, email, WhatsApp, city, region, password, and marketplace rules acceptance.
- If Supabase email confirmation is enabled, `/auth/callback` repairs an incomplete seller profile from Auth user metadata when needed, then redirects to `/mi-cuenta?confirmed=1`. The dashboard confirms verification explicitly and keeps any genuinely incomplete profile work inside the account experience.
- Callback redirects only to safe same-site paths.
- Intended invite next paths are `/registro/vendedor/invitacion` and `/registro/tienda/invitacion`.
- Seller invite flow shows `Activa tu cuenta de vendedor`, completes missing profile fields, confirms the Particular account type, and continues to creating a first listing through `/vender`.
- Store invite flow shows `Activa la cuenta de tu tienda`, completes store-owner contact profile fields, explains that admin approval is required, and continues to the store application form at `/registrar-tienda`.
- `/registro/tienda` creates a separate Store Owner account, and `/registrar-tienda` creates/edits the owner-bound application. The auth callback repairs incomplete Store Owner metadata just as it does for Particular signup.
- Invite pages require an authenticated session after `/auth/callback`; anonymous visitors are redirected to `/login` with the invite route preserved in `next`.
- Invite pages use `account_type` metadata/profile type when available. If metadata is missing or mismatched, they show a safe recovery panel instead of silently changing account type.
- Invite flows do not use temporary passwords.
- Account and invite location forms use a fixed Peru region list and city suggestions with free-text city fallback. Region must normalize to one of: Amazonas, Áncash, Apurímac, Arequipa, Ayacucho, Cajamarca, Callao, Cusco, Huancavelica, Huánuco, Ica, Junín, La Libertad, Lambayeque, Lima, Loreto, Madre de Dios, Moquegua, Pasco, Piura, Puno, San Martín, Tacna, Tumbes, Ucayali.
- Supabase Auth email template copy is documented in `docs/auth-email-templates.md`.
- Type-specific invite behavior is planned through `account_type` metadata plus `redirectTo`, not separate email infrastructure.
- Middleware refreshes Supabase Auth cookies and protects `/mi-cuenta` and future `/mis-publicaciones` routes.
- Full seller listing lifecycle management is not built. The Sprint 2 Store Owner dashboard provides real application/trust/cap state, profile editing, optional asset management, and inventory submission; sold/hide/relist and approved-edit revision behavior remain for Sprint 3.

Account panel visual refresh:
- `/mi-cuenta` now uses a seller-control-panel style shell with sidebar navigation, profile data, empty publications table, and placeholder metric/chart cards.
- Placeholder metrics and chart areas are visual-only and commented in code; they do not represent real analytics.
- The refresh did not change auth/session logic or add seller listing management calculations.

## Frozen V1 Gaps and Post-V1 Exclusions

Required V1 features not implemented yet include favorites, search and price-drop alerts, WhatsApp-contact tracking, verified transactions, two-way reviews, reports, revision moderation, seller/store dashboards and analytics, and marketplace email infrastructure. The complete status is in `docs/functional-spec.md`.

Post-V1 unless a new product decision is explicit:
- Payments.
- Checkout.
- Escrow.
- Delivery.
- Internal chat.
- Subscription billing.
- Commission logic.
- Paid listing boosts and paid store packages.

## Performance and submission reliability

Catalog and store inventories have 24-item pages. Product images are resized responsively. Detail recommendations stream separately from the product. Failed submissions can be retried in the same open form without creating duplicates; records are finalized only after uploads finish. See `docs/performance.md`.
