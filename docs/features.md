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
  - Left side: sticky product gallery.
  - Right side: breadcrumb, seller badge, title, price, metadata, key specs, WhatsApp CTA, and seller trust box.
- Gallery behavior:
  - Desktop gallery uses `position: sticky` with a top offset so details scroll past it.
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
- Lower sections show:
  - `Descripción`
  - `Especificaciones completas`
  - `Sobre el vendedor` or `Sobre la tienda`
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
- Loads pending listings and pending stores.
- Allows editing listing basics before moderation.
- Listing actions: `Aprobar`, `Rechazar`, `Ocultar`, `Marcar vendido`.
- Allows editing store basics and `Tienda verificada`.
- Store actions: `Aprobar`, `Ocultar`.

Only pending queues are shown. Already approved/hidden/rejected/sold items are not listed in the current admin UI.

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
