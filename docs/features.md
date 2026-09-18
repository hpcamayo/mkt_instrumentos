# Features

This file describes current implementation. The frozen V1 requirements live in `docs/functional-spec.md`; missing behavior below is an implementation gap unless that specification marks it post-V1.

Sprints 1–4 are **CLOSED / ACCEPTED**; Sprint 4 owner production evidence is dated 2026-09-17. Production remains commit `427ac8e8aa514ae10a47c0a4d2eee3dfe827ccaa`. Sprint 5 functionality below is local only, awaiting a separate release gate; see `docs/sprint-5-verification.md`.

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
- Production Sprint 4: record an impression only while at least 50% of the actual card is in the viewport and the document is visible; scrolling back into view does not inflate the rolling deduplicated count.

Implementation:
- Listing/store/home queries select `id`, `listing_id`, `image_url`, `alt_text`, and `sort_order` for the first embedded photo.
- Browse pages calculate `photo_count` with a lightweight `listing_photos` query for `listing_id`.
- `/api/listings/[id]/photos` fetches additional photos on demand, optionally excluding the already-rendered first photo by `exclude_id`.

## Listing Detail

Route: `/instrumentos/[slug]`

Features:
- Reads one approved or sold listing by exact `slug`; sold records are available only on their direct detail URL and remain absent from catalog/search.
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
- Production Sprint 4: records visible client detail opens through the first-party event path; SSR, HEAD, prefetch, owner/admin opens, and ineligible inventory do not increment commercial views.
- Uses a database-serialized rolling 30-minute identity/listing window instead of the old localStorage-only 24-hour rule. Accepted events increment the preserved historical `view_count` cache once; the compatibility view endpoint uses the same trusted writer.
- Primary CTA opens WhatsApp using a prefilled Spanish message.
- Sold detail shows `Vendido`, keeps the historical product information, and removes WhatsApp/contact actions.
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
- Production Sprint 4: visible public store opens and actual WhatsApp click intents are recorded with canonical store ownership; pending/hidden stores are not ordinary public analytics targets.

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

## Owned Listing Management

Routes:
- `/mi-cuenta/publicaciones` for Particular inventory.
- `/mi-cuenta/tienda/inventario` for Store Owner inventory.
- `/mi-cuenta/publicaciones/[id]/editar` for the shared owner editor.
- `/api/listings/[id]/manage` for authenticated edit/lifecycle actions backed by trusted database RPCs.

Current behavior:
- Owners see all owned states plus moderation or administrative-hide reasons, pending-revision state, and allowed actions.
- Rejected listings remain editable and expose `Enviar nuevamente`; the trusted publication RPC clears the prior rejection reason and returns the corrected row to the appropriate pending/direct-publication path.
- Approved owners can hide; only owner-hidden listings can be restored. Admin-hidden rows stay blocked from owner restoration.
- Marking sold is irreversible for the historical row and cancels a pending revision. `Relistar` creates a new linked copy with a new slug and keeps the old record intact.
- Particular and normal-Tienda relists return to moderation; eligible Tienda Verificada copies can publish directly.
- Price, description, location, and supported attributes apply immediately on approved Particular/normal-Tienda inventory. Title, category, instrument type, brand, model, condition, and photo changes create one pending revision while the old public version remains live. Further moderated edits amend that same versioned proposal, including its isolated photo set; reverted fields leave the proposal and an empty proposal is cancelled. Attributes that depend on a proposed instrument-type change stay inside that revision and are promoted atomically with the type.
- A Tienda Verificada applies a complete valid edit directly. Revocation immediately returns later edits to revision moderation without altering already-approved inventory.
- Verification does not auto-approve an older pending edit revision; it remains pending because the store-verification operation applies only to pending inventory listings. Future verified edits are evaluated directly at transaction time, and a later direct moderated/photo edit cancels an older pending proposal as superseded so it cannot overwrite newer live values.
- Production Sprint 4 completes repeated photo amendments onto the existing pending revision: add/remove/replace/reorder/primary, restoration of the approved photo order while preserving other pending fields, and refreshed persisted form state after saving.
- New edit uploads are owner/listing/attempt-scoped in the private `listing-edit-photos` bucket and use authorized `/api/listing-images/...` URLs. Pending/unattached bytes are not anonymous public bucket assets; existing legacy/live submission URLs remain compatible.
- Signed edit attempts persist a request hash/result. Identical uncertain-response retries reuse the uploaded payload and do not increment the revision again; changed retries are rejected. Busy guards prevent duplicate submissions or photo mutations during a save.
- Cleanup is server-bound and reference-checked under the listing lock, with retired-path claims preventing a check/delete race. Every live, sold/shared, and retained revision-history reference is protected; explicit cleanup failures remain retryable. Browser users cannot overwrite/delete historical objects. A new scheduled orphan sweeper is not implemented.

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
- Loads recent listings across lifecycle states, pending revisions, and all store applications/trust states needed for current operation.
- Allows editing listing basics before moderation.
- Allows inspecting/editing instrument type and supported attributes with labeled controls.
- Listing actions use trusted review RPCs: `Aprobar`, required-reason `Rechazar`, required-reason administrative `Ocultar`, and `Restaurar` where allowed.
- Pending revisions show current/proposed moderated fields, current/proposed photo sets, proposal version, and latest update time. Admin decisions include the displayed version; an owner amendment makes a stale decision fail and refresh the queue. A recent resolved-revision table keeps approved, rejected, and sold-cancelled history inspectable.
- Shows RUC, owner ID, razón social, business email, phone, address/location, contact person, links, status, and trust state.
- Store actions use trusted RPCs: basic approve, reject/hide with mandatory reason, verify, and revoke verification.
- Verification is atomic with approval of all qualifying pending inventory; the UI reports the transitioned count.

Store and listing/revision moderation are operable, while the full future hub remains a V1 gap: listing/store search and filtering, users, reports, reviews, transactions, lifecycle emails, and legacy ownership linking belong to later scheduled sprints.

## In-App Notifications

- `/mi-cuenta/notificaciones` is available in both role-specific account menus with an accurate unread badge.
- Typed notices cover listing approve/reject/admin hide, revision approve/reject, store approve/reject, verification, and verification revocation.
- Notices are newest first, visually distinguish unread rows, link to the relevant listing/store account area, and can be marked read through an owner-constrained RPC.
- This center is in-app only. Marketplace email delivery/preferences remain unimplemented.

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
- `/mi-cuenta`: protected role-aware account summary inside the shared account shell.
- `/mi-cuenta/publicaciones` and `/mi-cuenta/publicar`: Particular owned-listing view and publication form.
- `/mi-cuenta/tienda`, `/mi-cuenta/tienda/inventario`, and `/mi-cuenta/tienda/publicar`: Store Owner application/profile, inventory, and publication routes.
- `/mi-cuenta/tienda/estadisticas`: real owner-only Store analytics with lifetime/7-day/30-day periods (production Sprint 4).
- `/mi-cuenta/perfil`: edits the authenticated Particular or Store Owner contact profile.
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
- Production Sprint 4 maps Supabase `same_password` to `La nueva contraseña debe ser diferente de tu contraseña actual.` Unknown update errors remain generic; the existing password is never retrieved or manually compared. Secure callback/recovery/session behavior is preserved.
- Intended invite next paths are `/registro/vendedor/invitacion` and `/registro/tienda/invitacion`.
- Seller invite flow shows `Activa tu cuenta de vendedor`, completes missing profile fields, confirms the Particular account type, and continues to creating a first listing through `/vender`.
- Store invite flow shows `Activa la cuenta de tu tienda`, completes store-owner contact profile fields, explains that admin approval is required, and continues to the store application form at `/registrar-tienda`.
- `/registro/tienda` creates a separate Store Owner account, and `/registrar-tienda` creates/edits the owner-bound application. The auth callback repairs incomplete Store Owner metadata just as it does for Particular signup.
- Invite pages require an authenticated session after `/auth/callback`; anonymous visitors are redirected to `/login` with the invite route preserved in `next`.
- Invite pages use `account_type` metadata/profile type when available. If metadata is missing or mismatched, they show a safe recovery panel instead of silently changing account type.
- Invite flows do not use temporary passwords.
- Account and invite location forms use a fixed Peru region list and city suggestions with free-text city fallback. Region must normalize to one of: Amazonas, Áncash, Apurímac, Arequipa, Ayacucho, Cajamarca, Callao, Cusco, Huancavelica, Huánuco, Ica, Junín, La Libertad, Lambayeque, Lima, Loreto, Madre de Dios, Moquegua, Pasco, Piura, Puno, San Martín, Tacna, Tumbes, Ucayali.
- Supabase Auth email template requirements are documented in `docs/auth-email-templates.md`; signup sends trusted `user_metadata.account_type` for conditional Particular/Tienda wording. Sprint 4 changes no hosted template or callback format.
- Type-specific invite behavior is planned through `account_type` metadata plus `redirectTo`, not separate email infrastructure.
- Middleware refreshes Supabase Auth cookies and protects `/mi-cuenta` and future `/mis-publicaciones` routes.
- Sprint 3 lifecycle and Sprint 3.1 revisions remain implemented for both account types. Accepted Sprint 4 completes photo amendments and event-backed analytics; Sprint 5 locally adds Favorites and in-app price drops. Saved-search/email alerts, transactions and reviews remain later-sprint work.

Account shell:
- `app/mi-cuenta/layout.tsx` keeps role-appropriate navigation visible across account subpages: a persistent desktop sidebar and an accessible collapsed mobile menu with active-section state.
- Particulars see Particular routes; Store Owners see store routes after an owner-bound store exists. `Estadísticas` remains real. Both account types now have a real Favorites destination locally; saved-search alerts and employee management are not exposed as fake links.
- Particular summary aggregates all owned listings through one owner-scoped RPC; the recent-five list is only presentation. Both inventory tables show actual views/WhatsApp contacts, first-publication date, status, and sold metadata. Unavailable aggregates never become estimated zero.

## First-party Marketplace Events and Analytics — Production Sprint 4

- Events cover visible card impressions, detail/store opens, WhatsApp intentions, signed search/filter/zero-result context, and trusted submission/moderation/store transitions. Lifecycle writes run in the authoritative database transaction, not from a browser admin flag.
- A signed random HttpOnly/SameSite=Lax first-party cookie lasts 24 hours. Authenticated actor IDs come from the server session; listing/store/seller attribution is resolved server/database-side. No raw IP, invasive fingerprint, WhatsApp content, password, or auth token is event payload data.
- Raw event tables/recording RPC are service-only. Owner aggregate access is enforced in SQL; accounts cannot request another owner's commercial data or a browsable buyer directory.
- Impressions/detail/store views use a rolling serialized 30-minute anti-refresh window and exclude owner/admin activity. Actual contact clicks remain distinct intents; replaying the same event ID does not duplicate them. Retryable client event batches are bounded and never gate public SSR.
- Search receipts preserve the existing real server filter/result semantics; client-forged result counts or arbitrary metadata are rejected. Pagination is not a newly applied filter.
- Lifetime views include the existing historical cache; no event history is fabricated. Seven/thirty-day views and contact counts come from recorded events. Active means current approved/public inventory; sold means current seller-marked state, not verified sales in a date window.
- Store statistics include product impressions/views/contacts, public store visits/contacts, current active/sold counts, CTR (recorded views / impressions), and contact rate (contacts / recorded views). Ratios use one recorded-event period; zero denominator is `Sin datos`. Historical cache views are not silently used as a conversion denominator.
- No revenue or fake favorite/transaction/review metrics. The admin aggregate RPC is groundwork, not the full analytics/moderation hub.

## Frozen V1 Gaps and Post-V1 Exclusions

Required V1 gaps include saved-search alerts, price-drop email delivery, verified transactions, two-way reviews, reports and marketplace email infrastructure. Favorites/in-app price drops and favorite analytics are implemented locally in Sprint 5 but not released. Accepted Sprint 4 remains production. See `docs/functional-spec.md`.

## Sprint 5 — local implementation, not released

- One global header includes logo, prominent brand search and trusted hydrated account controls on every route. Shared category/subtype links use the existing filter taxonomy; mobile menus preserve access without horizontal overflow. Account navigation remains nested and persistent.
- Search submits the canonical `/listados?brand=...` filters. Only actual catalog search/filter interactions use the existing signed analytics receipt; typing or rendering a header does not count as a search.
- Duplicate-RUC application rejection is recoverable by changing only RUC in the same form, keeping business fields and optional assets. Unknown/lost-response commits remain locked to their exact signed retry. Existing accessible notices focus and scroll into view.
- Private Favorites support both account types on real home/catalog/recommendation/store cards and approved details. Anonymous actions preserve a safe login destination; sellers cannot favorite their own inventory. `/mi-cuenta/favoritos` shows 24 items/page, removable sold history and redacted unavailable entries; copied relists start without favorites.
- Public live price decreases create one in-app notification per current favorite recipient per transition atomically. Unchanged/increased prices, pending proposals and nonpublic inventory do not alert. Unfavorite stops future alerts; refavorite does not send old drops. Notification links recheck current availability rather than exposing private data.
- Particular and Store analytics show current favorites, selected-period additions/removals and favorite-add/view rate. Counts/rates are real grouped aggregates with no buyer directory. No revenue, verified sales, email delivery or saved-search UI is fabricated.

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
