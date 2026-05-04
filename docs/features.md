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
- Max width around `1600px`.
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
- Shows full title, price, category, brand, model, condition, city, seller, description.
- Displays main photo and additional thumbnails.
- Shows seller type and verified-store badge where relevant.
- Shows metadata:
  - `Publicado hace X dias`
  - `Visto X veces`
- Increments `view_count` through `/api/listings/[id]/view`.
- Uses localStorage to avoid incrementing the same listing repeatedly in the same browser within 24 hours.
- Primary CTA opens WhatsApp using a prefilled Spanish message.
- Store listings include a secondary link to the store page.
- Includes a safety/trust notice reminding users that Laria does not process payments, shipping, or guarantees.

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

