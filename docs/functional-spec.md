# Laria V1 Functional Specification

This document defines the frozen Laria V1 launch functionality.

- `docs/functional-spec.md` is canonical for product behavior.
- `docs/design-system.md` is canonical for visual and UI behavior.
- Existing code and database schema describe the current implementation state. If older planning documentation conflicts with this functional specification, this document wins.
- Changes to the V1 contract require an explicit new product decision.

Status labels in this document distinguish the frozen requirement from the implementation that exists today. An approved V1 requirement is not necessarily implemented merely because it appears here.

## Product Model

Laria is a vertical marketplace for musical instruments and music gear in Peru. V1 is a discovery and lead-generation marketplace, not a transaction-processing platform. Public users can browse listings and stores, and transactions happen outside Laria, primarily through WhatsApp.

Laria V1 does not include:

- Payments or Laria-managed checkout.
- Escrow.
- Delivery or shipping management.
- Transaction commissions.
- Subscription billing.
- Internal chat.

Laria V1 does include buyer and seller identity, marketplace ownership, verified transaction confirmation, reviews, favorites, alerts, moderation, analytics, reports, and store verification. These features do not mean Laria processed or guaranteed a transaction.

## Account Types

### Particular

A Particular account can both buy and sell; a user must not need a second buyer account. It can browse, favorite listings, create search alerts, receive price-drop alerts, contact sellers, buy items, publish and manage owned listings, and participate in verified-transaction reviews.

The current database value `profiles.account_type='seller'` represents the Particular product role. That implementation name does not narrow the account to selling only.

### Store Owner

Store owners use accounts separate from Particular accounts. One effective owner account manages one store in V1. Although the current schema contains `store_members` and supports several membership roles, multiple employees or store staff management is outside V1.

### Admin

One admin role is sufficient. Admin authority continues to come from the secure current mechanism: Supabase Auth `app_metadata.role='admin'`. V1 does not require granular moderator or support roles.

## Buyer Accounts and Authentication

Browsing remains public. An account is required for favorites, search alerts, price-drop alerts, verified transaction participation, and reviews.

A Particular profile contains at least:

- Full name.
- Email and Supabase Auth identity.
- Password where password login is used.
- WhatsApp phone.
- City and region where appropriate.

V1 authentication includes signup, email confirmation, password login, magic-link login, logout, forgot password, password reset, profile editing, and password change. Email change and account deletion are post-V1.

<!-- Effortless Laria, accounts batch (docs/ux-effortless/accounts.md): fixes -->
WhatsApp numbers are stored as digits with the country code. A Peruvian mobile typed as nine digits starting with 9
gets 51 in front, on every write to profiles, listings and stores (fix-01); the WhatsApp field shows the number buyers
will see ("+51 987 654 321") with a link to try it. Signing in before confirming the e-mail says "Confirma tu correo"
and offers "Reenviar enlace", as does the screen right after signing up, with a 60-second wait between sends (fix-08).
<!-- end accounts batch: fixes -->
<!-- Effortless Laria, accounts batch (docs/ux-effortless/accounts.md): sign-in -->
A Particular account starts with name, e-mail and password; WhatsApp and city are asked at the first publication. Every
password field has a show/hide control and one minimum of 8 characters. After a failed password the sign-in page
offers the e-mail link for the same address. Sign-in, sign-up and the confirmation e-mail return to the page the person
came from, and the sign-in page says why it is asking.
<!-- end accounts batch: sign-in -->

Supabase Auth remains appropriate for confirmation, password recovery, invitations, and other authentication messages. Marketplace-generated emails use a centralized application email abstraction. The provider behind that abstraction is an implementation choice, not a product decision.

## Particular Listing Creation

A Particular must be authenticated to publish. The anonymous public listing path must be phased out when account-aware publication replaces it. Every new Particular listing requires admin moderation.

Creation supports:

- Title.
- Category.
- Instrument type where the category has meaningful subtypes.
- Brand and model.
- Condition.
- Price.
- City/location.
- Description.
- Dynamic instrument attributes.
- Photos.
- Acceptance of marketplace rules.

Instrument attributes are generally optional. Only selected important attributes become required when an explicit product rule says so.

Each listing requires 2–10 photos, with front and back views as the expected minimum coverage. The owner can reorder, replace, and remove photos, provided the listing continues to satisfy the two-photo minimum. Before upload the browser redraws every listing photo as a JPEG of at most 2,400 px on its longest side, which removes its metadata (including the camera's location) and keeps it under the 5 MB storage limit, so sellers can pick photos of any common size (Effortless Laria FIX 02).

The sell form (Effortless Laria, selling batch; docs/ux-effortless/selling.md) is four short steps on every screen size: Fotos, Qué es, Estado y precio, Revisar y publicar. Photos come first and upload in the background, three at a time, while the seller fills in the rest; on phones the photo step opens the camera and a per-category shot list names the photos buyers expect. iPhone HEIC photos are converted in the browser. The title follows brand and model until the seller edits it; brand suggestions come from the instrument catalog; description starters and a 40-character counter help write the description; advisory hints point out what usually gets a listing rejected (phone numbers, links, all-caps titles, symbolic prices) without blocking. Step 4 shows the catalog card and the listing page as buyers will see them, and Publicar only confirms. An optional sound clip of at most 20 seconds can be recorded or picked; it is compressed in the browser, played only when a buyer taps it, and reviewed with the listing.

On an Android phone with Laria added to the home screen, photos shared from the gallery to Laria (up to 10) open the sell form with them already picked, the Particular form or the store's. They wait on the device for at most a day and reach Laria only when the form uploads them; signed out, Laria asks to sign in first. iPhone has no share target for web apps. *(Effortless Laria, big-12; proposed UXD-speed-11.)*

The form is saved on the device as the seller types and offered back on return. "Guardar borrador" also saves it to the account (`listing_drafts`, at most 20 per seller) so it can be finished on another device from Mis publicaciones or the publish page; publishing deletes the draft. After sending, a listing in review shows its steps (Enviada, En revisión, Publicada) and, once at least 20 Particular listings were reviewed in the last 60 days, the usual wait; a live listing offers Ver publicación and Compartir. "Publicar uno parecido" keeps category, type, brand, condition, location, description and attributes, and "Duplicar" in Mis publicaciones starts a new listing from an existing one.

## Listing Lifecycle

The normal lifecycle is:

`draft -> pending -> approved`

An approved listing can later become `hidden` or `sold`. V1 provides no normal user hard-delete action. Existing `rejected` and `archived` states remain useful operational states, but they are not public active inventory.

### Hidden

An owner can hide or unpublish an approved listing. A hidden listing disappears from public browsing. It can be restored subject to normal publication requirements and, for stores, the concurrent-listing cap.

### Sold and relisting

A sold listing disappears from normal catalog and search but remains available at its direct URL with a clear `Vendido` state. The original sold record is immutable historical inventory and must never be reactivated.

`Relistar` creates a new listing copied from the sold listing. The old record stays intact. Copies belonging to a Particular or normal Tienda return require moderation. Copies belonging to a Tienda Verificada may publish directly when they meet publication requirements.

<!-- ux my-listings: start -->
`Republicar` (sold) and `Duplicar` (any listing that is not archived) create a new **draft** with the text, specs and photos copied, open it in the edit form so the seller can adjust price or photos, and send it with the usual submission (replaces the direct relist copy; UXD-my-listings-6). An owner can mark an owner-hidden listing sold (`Ya lo vendí`), and can withdraw a pending, draft or rejected listing as sold (`Lo vendí, retirar`): it goes to the sold history as archived and never becomes public. An owner can pause all their listings until a return date between tomorrow and 90 days (`Modo vacaciones`): the listings stay public with `Vuelve el …`, WhatsApp contact is replaced by that note, availability questions stop, and everything returns by itself on that date.
<!-- ux my-listings: end -->

## Particular Dashboard and Dynamic Profile Data

`Mi cuenta` for a Particular seller supports:

- Creating a listing.
- Viewing every owned listing and opening it.
- Editing a listing.
- Marking it sold.
- Hiding or unpublishing it.
- Viewing moderation status and rejection reason.
- Relisting a sold listing.
- Editing the profile and changing the password.
- Viewing listing analytics.

Per-listing analytics include views, favorites, WhatsApp contacts, status, publication date, and sold state. The account summary includes active listings, total views, favorites, WhatsApp contacts, and sold listings. Revenue must not be invented or displayed because transactions occur off-platform.

<!-- ux my-listings: start -->
The account home (`Resumen`) opens on **Pendientes**: one list, most urgent first, of what needs the person (confirm a purchase, a buyer who says they bought, a review that closes soon, a rejected listing or revision with its reason, a listing Moderación hid, `¿Compraste…?`, `¿Sigue disponible?`, a sale with no buyer chosen, drafts, favorites that dropped in price, new alert matches). Each item answers in one tap on the spot or links to the screen where it is done. Metrics move to `Estadísticas` (`/mi-cuenta/estadisticas`): 7, 30 or 90-day views, WhatsApp contacts and saves per listing with up to two plain tips each (UXD-my-listings-1, UXD-my-listings-9). `Mis publicaciones` has status tabs with counts, search, sorting by views or contacts, inline price changes, bulk hide or restore, pages of 50, and a private preview for listings that are not public. Hide, restore and price changes happen at once with `Deshacer` for 10 seconds; only marking sold keeps a confirmation.
<!-- ux my-listings: end -->

Account-owned Particular listings resolve seller identity and contact information from the current profile where appropriate. Updating name, WhatsApp, city, or region should update the display of current account-owned listings without unnecessary duplication. Legacy listings may continue to use historical listing-level contact fields until an admin manually assigns ownership.

## Editing Approved Listings

Approved listings have two edit classes.

Immediate edits apply without renewed moderation:

- Price.
- Description.
- Location.
- Detailed instrument attributes.

Moderated edits require admin review for a Particular and normal Tienda:

- Title.
- Category.
- Instrument type.
- Brand.
- Model.
- Condition.
- Photos.

The old approved version must remain public while a moderated revision waits for approval. This is a revision or pending-edit workflow; it must not mutate or remove the approved public version prematurely. There is at most one active pending revision per listing, but its owner may amend that same proposal before the admin decision. Later moderated field/photo changes merge into the pending proposal, reverting a field to its approved value removes that difference, and a proposal with no remaining differences is cancelled. Admin decisions must reject a stale proposal version and require review of the latest state. A Tienda Verificada can apply edits to an approved listing directly without moderation.

<!-- ux my-listings: start -->
The edit form follows the sell form's order (photos, the instrument, condition and price, location, description, characteristics). On approved listings each field carries `Se publica al instante` or `Pasa por revisión`, and a live note says what saving will do. A rejected listing or revision opens with the moderator's reasons as a checklist and the affected fields marked `Revisar`; rejected listings and drafts have one button, `Guardar y enviar a revisión` (`Guardar y publicar` for a Tienda verificada).
<!-- ux my-listings: end -->

## Store Account and Application

The V1 flow is:

1. The owner creates a separate store-owner account, associated with one store.
2. The account/store receives the basic product identity `Tienda`.
3. The owner submits business information for approval and verification.
4. The owner may submit listings immediately.
5. Before basic admin approval, the public store page is not visible and its listings follow normal moderation.
6. Admin approval makes the store a public `Tienda`; its products still require listing moderation.
7. Admin may separately verify the business, making it a `Tienda Verificada`.
8. A Tienda Verificada can publish qualifying inventory and listing edits without listing-by-listing moderation.

The application requires RUC, razón social/business identity, email, phone, physical address, geographic location, and contact person. Physical-store photos, logo, banner, Instagram, Facebook, TikTok, website, and other social links are optional.

RUC is unique across stores. Duplicate RUC submissions must not silently create multiple stores; admin may resolve exceptional cases manually.

## Store Approval and Verification

There are exactly two public store trust labels in V1:

- `Tienda`: the store passed basic admin approval, its page may be public, and its products still require moderation.
- `Tienda Verificada`: Laria manually verified the business identity, and the store can directly publish qualifying inventory and apply listing edits.

Verification is manual and admin-only. At minimum, admin evaluates unique RUC, razón social, business email, phone, address, location, and contact person. Store photos may help. Automatic SUNAT verification is not required.

When a store becomes verified, all its current `pending` listings automatically become `approved`. Rejected, hidden, and sold listings keep their states, and historical moderation records remain intact. Revoking verification removes direct-publication privileges but does not automatically hide already-approved listings.

## Store Listing Cap

Every free store has a maximum of 50 concurrent inventory listings. `pending` and `approved` count toward the cap. `sold`, `rejected`, `archived`, and `hidden` do not. This is a concurrent cap, not a lifetime quota.

Restoring a hidden listing must fail gracefully if it would exceed the cap. No paid plans are active in V1, even though legacy schema enum values may name possible plans.

## Store Dashboard

The store-owner dashboard supports editing the store profile and allowed business/contact data; managing logo, banner, optional store photos, and social links; creating and editing inventory; viewing status and moderation reasons; marking sold; hiding/unpublishing; relisting; and aggregate analytics.

Stores set a default condition and a standard text for the end of every description once, at Mi tienda → Valores por defecto (`store_listing_defaults`); the sell form starts with both and the seller can change them per listing. The store's own text does not count towards the 40-character description minimum. Each inventory SKU remembers the brand, model, type, condition, description and attributes of its last publication or import (`store_inventory_items.listing_details`), editable in the SKU's "Datos para publicar" panel, and "Publicar este SKU" starts with them (Effortless Laria SHOP 06, STOCK 09).

Store listings resolve their WhatsApp contact from the store's current number, the way account-owned Particular listings resolve it from the profile: when a store changes its number, every unsold listing of that store follows (sold listings keep their historical record). WhatsApp links add Peru's country code (51) to a 9-digit mobile number stored without it. *(Effortless Laria, batch "listing", fix-03; proposed UXD-listing-1.)*

Commercial analytics include listing impressions, listing views, favorites, WhatsApp contacts, sold listings, and meaningful conversion-oriented ratios. They must not show revenue without actual transaction data. These metrics should remain suitable for evaluating later paid store packages without activating such packages in V1.

<!-- ux my-listings: start -->
The store home opens on **Hoy en tu tienda**: the same Pendientes plus today's purchase requests, out-of-stock SKUs people saved, low stock, an unfinished import with its expiry, and SKUs without a listing. A new store sees a checklist that ticks itself (Solicitud, Logo y portada, Descripción y redes, Primera publicación o Importar desde Excel, Medios de pago when the payments pilot is on, Ver tu página) until every step is done. `Estadísticas` adds a 12-week trend of views and contacts, the top listings by views, contacts and purchase requests, and the listings with contacts but no sale in 30 days.
<!-- ux my-listings: end -->

<!-- Effortless Laria, batch "stores" (docs/ux-effortless/stores.md): proposed until Henri's review. -->
### Effortless Laria changes to stores (proposed)

- **Application and profile (shop-01, shop-03).** A new application is prefilled from the invitation or signup. Mi
  tienda separates "Perfil público" from "Datos de la empresa"; changing the RUC or razón social warns that declared
  payment methods go back to Admin review. The physical address stays required but is shown publicly only when the
  store ticks "Mostrar la dirección" (off by default); opening hours are optional free text (list-12).
- **Owner preview (shop-04).** The owner can open their store page before it is public, marked as a preview and
  `noindex`; buyers still get a 404 until approval.
- **Stores directory (find-13).** `/tiendas` lists active stores (verified first) with a tab of listings from verified
  stores. "Tiendas verificadas" in the header and footer opens it.
- **Store page filters (find-14).** A store page has category chips, a brand box and a sort, scoped to that store.
- **Listing allowance (shop-05).** The cap is called "Cupo de publicaciones" everywhere. Mi tienda shows a meter of what
  uses it; a store can hide its published out-of-stock listings in one step to free slots, and ask Admin for more
  ("Pedir más cupo"). A request changes nothing until Admin sets a new allowance.
- **Inventory access (stock-21).** A store without Inventario can request it; Admin turns it on from the request.
- **Import (stock-12, stock-13, stock-22).** The review corrects a failing cell in place and excludes a whole filter;
  the Fotos step has a phone photo session; an open import shows when it expires and can be discarded from the notice.
- **Bulk publication (stock-10).** "Publicar seleccionados" in Inventario opens the import's publication step for the
  chosen SKU without changing stock.
- **Libro de Reclamaciones (trust-05).** `/libro-de-reclamaciones` follows Indecopi's virtual complaints book format
  with correlative numbers; its provider data and terms are pending legal review before production.

## Favorites and Alerts

### Favorites

Authenticated users can favorite and unfavorite approved listings. Favorites are accessible from the account area, and the state appears on supported listing cards and detail pages. A sold or hidden favorite may remain in history but must display its current availability clearly.

### Price-drop alerts

Price-drop alerts apply to favorited approved listings. When the public price decreases, eligible users may receive an email. The same unchanged price must not trigger repeated alerts. Pending, rejected, or hidden inventory must not generate price-drop alerts.

The listing page and catalog cards show a real recent drop as "Antes S/ X" for 30 days: the listing is approved, the new price is at least 5% below a price that had been in effect for 7 days, and any increase clears it. Sold listings never show it. *(Effortless Laria, list-05; proposed UXD-listing-4.)*

### Back-in-stock alerts

On an out-of-stock ("Agotado") store listing, a signed-in buyer can ask to be told when it is available again. When its stock returns they receive one in-app notification and one e-mail, and the request ends. Owners cannot watch their own listings. A sold listing instead offers a ready immediate search alert for its category, type and brand. *(Effortless Laria, list-11; proposed UXD-listing-9.)*

### Search alerts

Authenticated users can save the exact state of a marketplace search, including the free-text query (`query`, find batch), category, supported filters and instrument attributes, location, price filters, and other supported search state.

Frequency options are `immediate` and `daily digest`. Immediate alerts notify shortly after a new matching listing becomes public. Daily alerts bundle matching new listings. Only newly public matches qualify; the same user/alert/listing combination must not be notified repeatedly; empty emails are forbidden. Users can pause or delete alerts, and emails link directly to listings or matching search results.

<!-- Effortless Laria, accounts batch (docs/ux-effortless/accounts.md): saving -->
Visitors can save favorites without an account; they live on the device and merge into the account at sign-in, then
work on every device. Favorites show the price when saved ("Antes"), a private note, WhatsApp for available listings
and similar listings or a similar alert for sold ones, and can be shared through a revocable link. Price drops alert
favorites at 5% or more, at most once a day per listing. Alerts can be renamed, switch between daily (default) and
instant, hold several cities or conditions, and show their last match and total. A repeated search offers an alert
once. Buyers can follow stores and brands; new arrivals appear with the reason they are shown, and a weekly e-mail is
optional. An action interrupted by sign-in (an alert, a report) is finished on return.
<!-- end accounts batch: saving -->

## Category SEO Pages

V1 includes useful, indexable category browsing pages such as `/instrumentos/guitarras`, `/instrumentos/baterias`, and `/instrumentos/microfonos`. They use the real listing and filter system and must not be fake-content SEO doorway pages. Exact routing may follow the existing Next.js conventions; implementation must also avoid ambiguity with current listing-detail slugs.

## Search, Browse and the Home (Effortless Laria, find batch)

Proposed with the find batch (`docs/ux-effortless/find.md`, UXD-find-1 to UXD-find-16); not part of V1 until merged.

- **One search box.** The header, the home banner and the not-found page share one free-text search (`q`) over brand,
  model, type, category words and title. It ignores accents and case, forgives small typos (trigram similarity) and
  knows a small curated list of musicians' slang (strato, LP, ampli, bass…), all inside Postgres (`catalog_search`).
  Every word must match. Results keep the usual newest-first order.
- **Phrases become filters.** A phrase such as "bajo 5 cuerdas menos de 2000 en Lima" opens the catalog with those
  filters as editable chips (Bajos · Número de cuerdas: 5 · Hasta S/ 2,000 · Lima); what is left stays as the text.
- **The search keeps the filters.** Searching from the catalog or a category page keeps the filters already chosen;
  the suggestion list offers "Buscar en todo el catálogo". Suggestions name categories, types, brands and models that
  have listings, with their counts.
- **The catalog counts.** Every filter option shows how many results choosing it gives; the phone sheet's button says
  "Ver N resultados". Locations list the places that have listings, grouped into zones ("Todo Lima y Callao", Norte,
  Centro, Sur, Oriente). Price shortcuts follow the prices on sale. Cards show the store's district when known.
- **Headings say what was searched**, in the page and the tab ("Fender en Guitarras · Lima (34)").
- **No results rescue the search:** one-tap ways out with their counts ("Sin “Arequipa” hay 12"), the closest
  listings and the alert in one tap.
- **Sorts:** "Bajaron de precio" (a lower price in the past 30 days first, with the previous price on the card) and
  "Tiendas verificadas primero" join the existing three.
- **No dead links:** menus and category pages offer only brands, types and categories that have listings.
- **Back to results:** a listing opened from the results offers "Volver a resultados" (the same search and place) and
  "Anterior" / "Siguiente" through them.
- **Phones load more:** "Ver N más" adds the next page below; numbered pages remain as links for search engines.
- **Recently viewed and compare:** "Vistos recientemente" on the home, the catalog and the not-found page; desktop
  cards carry "Comparar" (up to three, side by side on `/comparar` with the spec table); phones compare from the
  favorites. Both are kept on the device only.
- **A gone listing** (once public, now hidden or removed) says "Esta publicación ya no está disponible" and shows live
  listings of its type, revealing nothing else about it.
- **The home starts with instruments:** the search, a row of category chips (empty ones hidden), then "Para ti",
  ranked on the device from what this person opened (types, brands, price band, place) and an optional first-visit
  "¿Qué tocas?" row; never two listings of one seller in a row. "¿Por qué veo esto?" explains the order, "Empezar de
  cero" forgets it and "Sin personalizar" shows plain newest first. "Nuevo desde tu última visita", "Bajaron de
  precio" and "Vistos recientemente" follow. Nothing of this leaves the device. The vitrina and the category tiles
  are retired.

## Discovery: gifts, guides, collections, makers and artists (feature ideas, discovery batch)

Proposed with the discovery batch (`docs/feature-ideas/discovery.md`, FD-discovery-1 to FD-discovery-13); not part of
V1 until merged.

- **Eleventh category.** "Andinos y tradicionales" (`/instrumentos/andinos`) with one type, Instrumento andino, and an
  Instrumento attribute (charango, ronroco, bandurria, arpa andina, quena, quenacho, zampoña o siku, antara, pinkillo,
  tinya, bombo andino, wankara, chajchas). The cajón stays in Percusión.
- **Hecho en Perú.** A store declares itself Fabricante or Taller with its city; its listings can say "Hecho a mano" and
  "Se hace a pedido: N semanas" (1 to 26). The marks say they are the store's word. Admin can hide a maker with a
  reason. `/hecho-en-peru` lists the makers.
- **Verified artists.** Admin verifies an artist's identity on an existing account; their listings may carry a short
  note on how the gear was used, shown as the seller's word. `/artistas` lists them. Revoking removes every mark.
- **Buying guides.** `/guias`: nine guides, with try-out checklists ticked on the device only; unsold listings link the
  guides for their kind under "Antes de ir a verlo".
- **Gift finder.** `/regalos` (and four occasion pages) by recipient and budget, from real listings; no countdowns.
  Stores can say they accept gift exchanges for 3 to 60 days.
- **Collections.** Admin saves dated collections of up to four catalog filter sets; the home shows up to three current
  ones and the gift finder card; `/colecciones` lists them.

<!-- feature-ideas:deal-trust -->
## Deal trust: seller pages, safer meetups and verified store purchases (feature ideas, deal-trust batch)

Proposed with the deal-trust batch (`docs/feature-ideas/deal-trust.md`, FD-deal-trust-1 to FD-deal-trust-18); not part
of V1 until merged. Laria still never charges, holds money, checks an instrument or guarantees a deal.

- **Verified store purchases (reach-11).** After a Mostrador sale the store can show a one-time QR (24 hours, one
  use). The customer signs in and confirms "Sí, compré en <Tienda>", which creates a verified transaction for the
  store with the usual double-blind reviews. This changes two rules on purpose: a customer who confirms a counter code
  becomes a verified buyer without a WhatsApp contact, and a counter sale unlocks reviews once the customer confirms
  (a stock movement alone still does not). Never at one's own store; one per store per customer a day, five a day.
- **Review photos (safe-06).** A buyer's review of the seller can carry up to three photos of what arrived. Each one
  waits for Admin and shows only once approved and its review is visible.
- **Seller page (sell-09).** Every Particular who published has `/vendedores/<slug>`: first name, city, member since,
  verified sales, the level, reviews and active publications. Not indexed; the seller can hide it.
- **Vendedor destacado / Tienda destacada (sell-08).** Granted and lifted every night from public criteria: 5 verified
  sales, 3 visible reviews averaging 4.5, no upheld report in 90 days, no public question unanswered over 7 days.
  Nobody applies or pays.
- **Buyer track record (safe-07).** Off by default. Once the buyer turns it on, a line with a link to a small card
  (first name, buying since, verified purchases, average rating from sellers) joins their WhatsApp messages; it can be
  removed per listing. Turning it off kills the link.
- **History on Laria (safe-11).** A buyer who resells an instrument bought through a verified transaction can link the
  new listing to it: "Comprado en Laria en <mes> · N dueños anteriores en Laria" and the original specs. Nothing about
  the previous seller is shown.
- **Safe meetups (safe-03).** On a Particular's listing, "Encuentro seguro" lists «Punto seguro Laria» stores in the
  city (verified, active stores showing their address that opted in; Admin can turn one off with a reason), public
  shopping centers and the nearest police station, prepares an "Avisar a alguien" WhatsApp message and links the
  try-out checklist. The copy never promises safety.
- **Admin > Confianza** reviews photos, Puntos seguros and confirmed counter purchases (repeat confirmations flagged).
  A daily job (`/api/internal/jobs/deal-trust`, `CRON_SECRET`) runs the levels, counter-purchase review reminders and
  photo upload cleanup.
<!-- /feature-ideas:deal-trust -->

## WhatsApp Contact Tracking

Laria records buyer intent when a user initiates WhatsApp contact. It never records WhatsApp message content.

The event associates the listing, authenticated buyer when present, seller or store, timestamp, and useful source/context. It supports conversion analytics and determines which authenticated buyers are eligible for transaction confirmation when a seller marks that listing sold. Anonymous contact remains possible, but an anonymous buyer cannot later participate in the verified Laria transaction or review workflow for that contact.

The WhatsApp message opens pre-filled with the listing's title, price (when set) and link, asking whether it is still available. Optional quick questions (try it, shipping, case, negotiable price), never preselected, are appended when chosen. The button opens WhatsApp at once; the contact is recorded in the background and never delays or blocks it. Before a buyer's first contact about a listing from S/ 1,000, or any purchase request, a short safety sheet appears once per browser. Signed-out visitors see a quiet hint to sign in first so they can later confirm the purchase and review; contact never requires an account. *(Effortless Laria, talk-01 to talk-05; proposed UXD-listing-6 and UXD-listing-7.)*

## Marketplace Analytics

The primary funnel is:

`impression -> listing open -> favorite -> WhatsApp contact -> sold -> verified transaction`

Useful events include listing impression and detail view; favorite added/removed; WhatsApp click; store page view; search, zero-result search, and filter applied; alert creation and alert clicks; listing creation start, submission, approval, rejection, and sold state; store application start, submission, approval, and verification; transaction verification; and review submission.

Derived metrics include listing click-through, contact, and favorite rates; sell-through proxy; zero-result search rate; alert click/conversion rate; seller submission conversion; and store funnel conversion.

Laria must not track WhatsApp message content or use invasive fingerprinting. Use authenticated IDs where appropriate and privacy-conscious anonymous or session identifiers otherwise.

## Sold and Verified Transaction Workflow

When a seller marks a listing sold:

1. The listing becomes sold.
2. Laria asks whether the buyer was found through Laria.
3. The seller may select a buyer only from authenticated users who previously generated a WhatsApp-contact event for that listing. The seller cannot search or browse the user directory.
4. The seller may instead choose `Vendido fuera de Laria / comprador sin cuenta`.
5. Without a selected Laria buyer, the listing remains sold, but no verified transaction exists and reviews stay locked.
6. With a selected buyer, Laria sends that buyer a confirmation request.
7. If the buyer answers `Sí, lo compré`, the relationship becomes a verified Laria transaction.
8. If the buyer declines or never confirms, the listing remains sold without a verified transaction or review relationship.

This confirmation verifies only that both parties identify the sale as a Laria-originated transaction. It does not verify payment amount, delivery, or item condition.

<!-- feature-ideas:deal-trust -->
Proposed (deal-trust batch, reach-11): a store's Mostrador sale can also become a verified transaction, with no listing and no WhatsApp contact, when the customer confirms the store's one-time code. See "Deal trust" above.
<!-- /feature-ideas:deal-trust -->

<!-- ux my-listings: start -->
The loop can also start from the buyer: 3 to 30 days after a signed-in buyer opened WhatsApp on a listing, Laria asks them once `¿Compraste …?` (in Pendientes, on the listing as `¿Cómo te fue?`, and by e-mail). `Sí` notifies the seller, who confirms with one tap (`Sí, me lo compró`): the listing becomes sold and the transaction is verified without a second buyer confirmation, because the buyer already said yes. `No` only stops the question. If the seller already asked that buyer, the buyer's `Sí` answers that request. Stock-managed store listings are excluded; their sales are recorded in Inventario. The buyer list a seller chooses from shows each person's name, contact date and the last three digits of their WhatsApp, with no one pre-selected.
<!-- ux my-listings: end -->

## Reviews

Reviews are available only for verified Laria transactions and are two-way: seller/store reviews buyer, and buyer reviews seller/store. Each review requires 1–5 stars, permits an optional text comment, and is limited to one review per side per transaction.

<!-- ux my-listings: start -->
Stars are tapped directly (five radio buttons, nothing pre-selected), with the comment right below. After the buyer confirms, a closing panel (`Que lo disfrutes`) leads into the review, and a seller's first verified sale is marked once as a milestone. Reminders go to the buyer on day 2 and day 7 of an unanswered confirmation request, and to whoever has not reviewed 3 days and 1 day before the window closes.
<!-- ux my-listings: end -->

For a Particular sale, the seller-side identity is the Particular account. For a store sale, the buyer's seller-side review belongs to the store, not the individual owner account.

Reviews use double-blind publication. The review window is 10 days after buyer confirmation. Neither party sees the other's review while both may still submit. If both submit, both may be revealed immediately; otherwise a submitted review is revealed when the window ends.

Published reviews cannot be freely edited or deleted. Users can report them. Admins can hide abusive or inappropriate reviews but must never rewrite review content. Ratings and reviews must not imply that Laria processed payment. The data model should remain compatible with possible future on-platform payments.

## Reports

Users can report a listing, store, or review. A report has a fixed reason category, optional written detail, timestamp, reporter identity where applicable, and moderation status. Reports enter the admin moderation hub, where admin can resolve or dismiss them. V1 does not need a complex ticketing or support system. Public questions on listings can be reported too.

## Public Questions on Listings

A signed-in buyer can ask a short public question on a published listing that is not their own; it appears at once for everyone. The seller (the listing owner, or the store owner) answers once, publicly; the seller is notified in the app and by e-mail, the asker in the app. Questions and answers refuse phone numbers, links and e-mails with the same filter as purchase requests; neither side can edit, and the seller cannot delete. Limits: 3 unanswered questions per buyer per listing and 20 per day. Admin can hide and restore a question with a reason. A sold listing keeps its questions read-only. This is public Q&A, not private messaging: transactions and private conversation stay on WhatsApp. *(Effortless Laria, big-11; proposed UXD-listing-8.)*

## Admin Moderation Hub

`/admin` is the operational moderation hub, not only a pending queue. Admin can search, filter, and manage all listings, stores, user accounts, pending listing revisions, reports, reviews, verified transactions, store verification state, and legacy ownership links.

Listing actions include approve, reject, hide, mark sold where appropriate, inspect revision history, and restore/manage lifecycle where appropriate. Store actions include basic approval, rejection, hiding, verification, and verification revocation.

Rejection and administrative hiding require a reason visible to the owner.

<!-- ux my-listings: start -->
A listing or revision rejection takes one or more fixed reasons (`pocas fotos`, `falta el reverso`, `precio incoherente`, `datos de contacto en la descripción` and six more) plus an optional note; with no reason picked the note is required. The owner sees the reasons as a checklist tied to the fields.
<!-- ux my-listings: end --> Approval, rejection, relevant store-status changes, and other important lifecycle changes generate marketplace emails. Admin assigns legacy listing ownership manually; ownership must never be auto-claimed only from a matching WhatsApp number or email.

## Email Notifications

Centralized application email infrastructure sends listing approval/rejection, store approval/rejection, useful verification-status changes, buyer transaction-confirmation requests, review workflow notifications, search alerts, and price-drop alerts. Product logic must not depend on a particular email provider.

The listing approval e-mail reads "Tu publicación está en línea" and opens the live listing (Effortless Laria POST 15).

<!-- ux my-listings: start -->
Rejection e-mails open the edit form and include the reason, also for rejected revisions. A daily job (14:00 UTC) sends, at most once each: purchase checks to buyers, `¿Sigue disponible?` to sellers (after 30 days without a confirmation or 5 contacts, not more than every 14 days, never while paused or for stock-managed listings), purchase-confirmation reminders and review reminders.
<!-- ux my-listings: end -->

Supabase Auth may continue sending authentication-related messages.

<!-- Effortless Laria, accounts batch (docs/ux-effortless/accounts.md): e-mail choices -->
Alert, price-drop and weekly-digest e-mails are optional: each says why it arrived, carries a signed one-click link to
stop that kind of e-mail and the List-Unsubscribe headers, and links to Mi cuenta › Correos. Alert and price-drop
e-mails include the photo and price. Transactional e-mails stay as they are. In-app notifications can all be marked
read at once, are paged, name the listing on price drops and include alert matches.
<!-- end accounts batch: e-mail choices -->

## In-App Notifications

The authenticated account shell includes an in-app notification center for Particular and Store Owner accounts. It records important listing moderation, listing-revision, store approval/rejection, and store verification changes with a typed event, short Spanish message, timestamp, read state, and relevant account destination. A user can read and mark only their own notifications. This does not replace or prematurely implement the centralized application-email infrastructure.

<!-- Effortless Laria, speed batch (docs/ux-effortless/speed.md): push notices -->
A person can also receive their notices on a phone or browser ("Avisos en este teléfono" in Mi cuenta › Notificaciones), a lighter companion to e-mail, never a replacement. Laria asks the browser for permission only when the person presses "Activar avisos", never on a first visit. A push reads and opens like its row in the list; several pending notices go out as one message, and the phone shows one Laria notice at a time. Nothing is pushed from 22:00 to 08:00 Lima (those notices go out together in the morning), and notices already read in Laria or older than three days are skipped. A device belongs to whoever turned notices on last, a person keeps ten devices at most, and signing out turns that device off. On an iPhone, push works only with Laria added to the home screen. *(Effortless Laria, big-12; proposed UXD-speed-5 to UXD-speed-10.)*
<!-- end speed batch: push notices -->

<!-- Effortless Laria, speed batch (docs/ux-effortless/speed.md): speed and accessibility -->
## Speed, Install and Accessibility (Effortless Laria, speed batch)

Proposed with the speed batch (UXD-speed-1 to UXD-speed-4 and UXD-speed-13); not part of V1 until merged.

- A tap that changes the page shows a thin bar after 100 ms and, after a second, a skeleton of the next page over the old one; faster changes show nothing. No route has a `loading.tsx` (owner decision Q1 A).
- When the phone asks to save data or the connection is 3G or slower, images that appear after the page loads are requested smaller, and listing pages are not loaded ahead of time.
- Laria can be added to the home screen and then opens without the browser's bar. Laria shows no install banner of its own; the service worker only receives shared photos, and there is no offline mode.
- The error page offers "Reintentar", which asks the server again and redraws the failed part in place.
- Pages meet WCAG 2.2 AA: every gesture has a button, bars fixed to the bottom of the screen never cover a focused field, touch targets are at least 24 px, and status changes are announced to screen readers.
<!-- end speed batch: speed and accessibility -->

## Legal and Safety

V1 has dedicated content or pages for Terms/marketplace rules, Privacy Policy, prohibited-item rules, and marketplace safety guidance.

The interface clearly says Laria currently does not process payments, provide escrow, manage shipping/delivery, or guarantee transactions. Trust copy must not imply otherwise. On the listing page this is said once, as the line under the contact button with a link to the safety tips. *(Effortless Laria, list-02; proposed UXD-listing-3.)*

## Functionally Out of V1

The following remain post-V1 unless an explicit new product decision changes the contract:

- Laria-managed checkout, payments, escrow, or shipping/delivery integration.
- Transaction commission enforcement.
- Paid subscriptions, packages, or listing boosts.
- Internal messaging or chat (public questions on listings are not messaging; see Public Questions on Listings).
- Multiple store employee accounts.
- Automatic SUNAT verification.
- Account deletion or account email-change workflows.
- Sophisticated fraud scoring.
- Arbitrary new social or community functionality.

## Planned After V1: Catalog Autofill, Jev and Category Navigation

Status: approved product direction for post-V1 sprints. It is **not** part of the V1 contract or V1 acceptance, and
nothing in it changes V1 behavior. The canonical instrument catalog these features read is in production since
2026-10-08: one record per real product (brand, model, category, product line, variants and detailed attributes with
Spanish display values), reduced to the brands the Peruvian market sells (`database.md`).

Listing creation with autofill:

- The seller types brand and model as today. When the text matches a catalog product, the form prefills the
  category, instrument type and the product's model-level attributes, each marked as autocompleted.
- Every prefilled value stays editable. The listing records which catalog product it matched, which values were
  autofilled and which the seller changed.
- Values that differ between versions of the same model (for example colour or handedness) are prefilled only when the
  seller's text or choice identifies that version. Details of the specific unit (condition, what is included,
  modifications, price, photos, description, location) always come from the seller.
- The seller can reject the match and continue without it. When nothing matches, the listing continues exactly as
  today, and the unmatched brand/model text feeds the catalog's gap queue.
- Autofilled attributes describe the catalog product, not an inspection of the seller's unit; Laria must not imply
  that it verified the instrument.

Moderation and edits: existing rules apply unchanged. Every new Particular listing still requires admin moderation,
autofilled attributes follow the same immediate-edit rule as other detailed instrument attributes, and brand, model,
category and instrument type remain moderated fields.

Jev is Laria's AI decision engine. It will score whether a listing is identified and detailed enough for automatic
approval, using the catalog match (`catalog_jev_inputs`), the matched product's completeness and the values the seller
changed. What Jev may do (advisory score, automatic approval, thresholds, account types) is decided in its sprint;
until then Jev has no effect on moderation.

Category navigation enrichment: each marketplace category gets a detailed tree of the products in it, built from the
catalog: subcategories, brands, product lines and models (with their variants). Buyers browse the tree and reach the
listings of a model; the tree uses the catalog's Spanish category labels. Only brands with products appear (the
catalog also stores every brand name, to recognize listings of brands it does not carry). The tree covers the
reduced Peruvian-market catalog; adding a brand to the catalog adds it to the tree.

Open product questions for those sprints:

- Whether Tienda inventory creation uses the same autofill.
- Whether buyers see that a value came from the catalog.
- Marketplace categories the catalog covers but Laria does not list today (keyboards, pianos, synthesizers), and
  splitting `cutaway` out of the acoustic body-shape field.
- How deep the navigation tree goes on mobile, and whether models without listings appear.

## Planned After V1: Store Operations and Assisted Commerce

Status: built as a prototype for the owner's review on branch `store-ops/prototype` (design
`docs/store-operations/design.md`, owner decisions D-1…D-15 at their accepted defaults). It is **not** part of the V1
contract or V1 acceptance until the owner accepts it, nothing is applied to production, and every part is off for
existing stores and buyers until an Admin enables a store (inventory) or the deployment switches the pilot on
(payments). Proposed acceptance families: `INV-`, `IMP-`, `IPH-`, `PAY-`.

Inventory (Tiendas, enabled per store by an Admin during the pilot):

- A store keeps one inventory record per SKU: its own SKU (unique per store, case-insensitive, letters, digits, `.`,
  `_`, `-`; a `LAR-000001` code is generated when blank and changed only through an audited SKU change with a reason),
  name, variant, price in whole soles, low-stock threshold, optional catalog product and external reference.
- Stock is merchant-reported: units on hand, never below zero, changed only by recorded movements (sale, return,
  restock, damage or loss, count, import reconciliation) with author, channel and reason in an append-only history.
  Two buyers can never get the last unit through Laria, and a retried request never applies twice.
- A SKU may control one publication of the same store. A controlled publication shows "Agotado" at zero stock, keeps
  its URL, leaves the catalog, home, sitemap and related strips (`noindex, follow`), appears last on the store page,
  and returns when restocked without re-sending alerts. Stock never changes a publication's status, and moderation
  never changes stock. A controlled publication cannot be marked sold; the store unlinks it first to use the V1 sold
  and verified-transaction flow. Particular listings and uncontrolled store listings behave exactly as in V1.
- Buyers see only Disponible / Agotado, never unit counts. Sales recorded in Inventario are the store's own notes:
  they never create verified transactions or unlock reviews.
- Screens: Inventario (summary tiles, recent movements, search, filters, sort, bulk stock, price, threshold and hide,
  CSV and Excel export with formula-safe text), the SKU page (stock actions, history, publication link, data, SKU
  change, archive), and publishing a SKU as a listing through the existing form and moderation.

<!-- Effortless Laria, inventory batch (proposed; docs/ux-effortless/inventory.md) -->
- Inventario search (fix-06) matches the SKU, name, variant, external reference (barcodes) and the linked
  publication's title, brand and model; every word must appear, in any order, ignoring accents and case, and the
  table follows the box as the owner types. The "En revisión" tile counts new publications and changes in review and
  opens exactly those; rejected publications have their own tile. The catalog filter stays hidden until catalog
  matching exists (fix-09).
- Every stock change can be undone for 10 seconds (15 minutes on the SKU page) as a linked correction; corrected sales
  don't count in sales totals. Rows have −1 / +1. Bulk actions reach every SKU that matches a view (up to 2,000) and
  include archive, reactivate, publish again and category; price changes are named campaigns, optionally rounded to
  prices ending in 9, that can be reverted. Saved views, "Exportar esta vista", keyboard shortcuts and "1–50 de N"
  paging. A default low-stock threshold and an opt-in daily in-app summary. Reposición (a reorder file with 30-day
  sales and a suggestion, re-imported to add what arrived), "Agotados con interés", "Duplicar SKU" and variants.
  Mostrador sells from the browser by camera, typing or USB scanner, with an offline queue.
- During the payments pilot, Solicitudes lists purchase requests with one-step "Vendido", "Atendida" and "No se
  vendió", plus ready WhatsApp replies without numbers or links; "Solicitar compra" asks for a quantity up to what is
  available (at most 10) without showing stock.
<!-- /Effortless Laria, inventory batch -->

Spreadsheet import:

- An enabled store imports CSV or XLSX (up to 5 MB, 2,000 rows, 80 columns, first visible sheet) in steps: upload,
  confirm columns (Spanish or English headings recognized, the mapping remembered), review every row as current →
  new, exclude rows, confirm, result with a downloadable report.
- Nothing changes until the owner confirms. Stock in the file is the counted total (a difference is recorded as an
  import reconciliation); blank cells keep current values; SKUs missing from the file are untouched; a sale made
  after the preview is never overwritten (the row becomes a conflict to review again). Formulas are never evaluated.
- The file stays private to the owner and is deleted after the retention period. One open import per store.
- Photos (optional): the store adds photos or a ZIP, named `SKU__01.jpg` … or listed in a `Foto(s)` column or a photo
  list. Laria checks each file on the server, matches what is certain (2–10 photos per SKU) and sets aside anything
  uncertain for the owner to place, reorder or drop by hand; nothing is guessed. Photos can be added after confirming
  and stay until the import is purged; any photo a listing uses stays with the listing.
- Publishing (optional, after confirming, until the import is purged): the store selects rows that meet the sell
  form's requirements (category, type, brand, model, condition, a 40-character description, a price on the SKU and
  2–10 photos) and accepts the marketplace rules. Each publication goes through the existing rules: verified active
  store publishes directly, other Tiendas go to review, a store in review publishes privately. Each new listing is
  linked to its SKU. A row that fails does not stop the others.

Listing allowance: a store holds up to 50 pending or published listings (Store Listing Cap) unless an Admin sets
another allowance for it (1–2000, with a reason, audited). Lowering it hides nothing; only new publications are
refused, including import rows, which show "Sin cupo". Inventory SKUs, stock and import rows never count.

Accepted payment methods (Pilot A, verified stores only, behind a deployment switch that stays off until legal
review):

- A verified store declares which methods it accepts (cash on pickup, Yape or Plin, card POS on pickup, a payment link
  the store sends). Every method except cash names the account holder, which only the owner and Admin see; numbers,
  links and e-mails are refused. An Admin approves each method against the store's RUC and razón social; any change,
  or a change of RUC or razón social, sends it back to review. Revoking verification hides the methods at once.
- Buyers see the approved methods on the store page and that store's in-stock listings, with a statement that they
  pay the store directly and that Laria processes no payment, holds no money and issues no receipts. The listing's
  one contact button reads "Solicitar compra" and opens WhatsApp with the title, the store's SKU, quantity 1 and the
  link; it is recorded as a WhatsApp contact with the purchase intent. Laria stores no amount, paid state, payment
  link, reservation or order.

## V1 Freeze Rule

Once this specification is implemented, tested, and documented, Laria V1 is functionally frozen. Work then shifts to QA, reliability, visual polish, marketplace supply, store onboarding, real-user testing, analytics, and observing marketplace behavior.

Do not add features merely because they seem useful. Post-freeze features require actual marketplace evidence, a commercial need, or an explicit product decision.

## Implemented Reliability Baseline

The September 2026 reliability work is complete and must be preserved:

- 24-item catalog and store pagination.
- Stable pagination with deterministic ordering and filter preservation.
- Database-computed photo counts.
- Responsive image delivery.
- Streamed listing recommendations.
- Reduced authentication overhead on public routes.
- Targeted email lookup.
- First-publication timestamps.
- Signed, idempotent public-submission retries and atomic finalization.
- Partial-upload cleanup attempts and retry recovery.
- Regression tests covering pagination and submission reliability.

See `docs/performance.md` for the implemented behavior and verification details.

## Implementation Status

Sprints 1–6 are **CLOSED / ACCEPTED**. Sprint 7 migration `20260921120000_sprint_7_marketplace_email_alerts.sql` and application source `37f7507829193306ddaaa37e80787069308bdffc` were production-deployed on 2026-09-22. Owner production inbox/link acceptance was recorded on 2026-09-25; the natural daily-digest check (`ALERT-005`) remains blocked. Owner production Compras UX acceptance (`TX-018`) passed on 2026-09-27. Sprint 8 is **CLOSED / ACCEPTED** following successful production deployment of hotfix `bb16e319540a9d6721e990bc1e9900825c7473ac`, browser/session/hydration smoke, and owner production QA on 2026-09-27. Migration `20260923120000_sprint_8_admin_reports_legacy.sql` is already live; the production retry confirmed 19/19 synchronized migrations. `ADMIN-023` is Pass and `ADMIN-005` retains Pass with updated owner production smoke evidence. Sprint 9 (category SEO/public discovery, legal/safety pages and account-navigation cleanup) was initially committed as `bcf9e6142a1c86caa3feb8ee24cd23a126a3cc42`; its first production gate failed and the application was restored. Remediation commit `bbb586bc0457941da92025766e266fc893ebf474` passed the automated production re-gate on 2026-09-27. Hosted Supabase stayed at 19/19 migrations and no scheduler was enabled. Owner SEO/legal checks remain open; see `docs/sprint-9-production-release-gate.md`. Laria remains pre-go-live on Vercel Hobby with deliberately manual marketplace-email worker invocation until the mandatory launch scheduler is enabled.

Subsequently, `SEO-005` passed real production category pagination/filter verification with disposable inventory and proven zero-residue cleanup. The category URL follow-up `49a38e5be7b6e195617a841fe1c572420769dab0` is READY at `laria.audio` as of 2026-09-30. Canonical acceptance is **332 Pass / 70 Not Run / 1 Blocked / 403 total**. Owner checks `SEO-006`, `SEO-007`, `LEGAL-005` and `LEGAL-006` remain open; `ALERT-005` remains Blocked. The app release does not close the V1 launch gate or start automatic scheduling.

- **DONE**: the functional area is materially implemented for its V1 requirement.
- **MODIFY**: a related implementation exists, but it must change or expand to meet V1.
- **BUILD**: the functional workflow is absent beyond incidental schema/UI foundations.

| Functional area | Status | Repository evidence or required change |
| --- | --- | --- |
| Public browsing | DONE | Public homepage, approved-listing catalog, approved listing detail, and active store pages exist. |
| Catalog pagination | DONE | Catalog and store inventory use stable 24-item pagination with filter preservation. |
| Listing detail | DONE | Approved detail pages work; sold listings remain available only by direct URL with a clear `Vendido` state and no contact CTA. |
| WhatsApp contact | DONE | Listing/store links use a trusted contact endpoint that records canonical intent before navigation, with bounded failure fallback so telemetry cannot trap contact. |
| Seller authentication | DONE | Particular signup, confirmation callback, password and magic-link login, logout, forgot/reset password, authenticated password change, and profile editing are implemented. |
| Buyer/Particular account model | DONE | One Particular identity supports buying and selling, Favorites, authenticated exact-listing contact attribution, buyer confirmation, transaction history, two-way verified-transaction reviews and saved-search alerts. |
| Account-required listing publication | DONE | `/vender` requires authentication, preserves the login return path, binds signed retries to the current user, and atomically creates owned `pending` Particular listings. |
| Seller listing ownership | DONE | New Particular listings set `owner_user_id`; owner/public/admin boundaries remain enforced by RLS, while legacy nullable ownership remains supported. |
| Seller dashboard | DONE | The persistent role-aware `/mi-cuenta` shell exposes real profile/security, publication, owned-listing management, edit, hide/restore, sold, and relist workflows. Analytics remain tracked separately below. |
| Seller analytics | DONE | Owner-scoped views, contacts, inventory and dates include current favorites/actions/rate plus precisely labelled buyer-confirmed transaction totals and contact-to-verified rate. Zero denominators are Sin datos; no buyer directory, payment, delivery or fabricated revenue is exposed. |
| Instrument type/attributes submission | DONE | Seller creation and admin moderation reuse the canonical instrument filter definitions; supported attributes use labeled controls rather than raw JSON. |
| 2–10 photo handling | DONE | Creation/edit validation enforces 2–10 valid owned photos, canonical order/primary, replacement/removal and signed retry receipts. Private revision staging, current-proposal amendment, exact atomic promotion, retained historical references and reference-safe cleanup are verified locally and through production automation; required owner acceptance remains separate. |
| Revision moderation | DONE | Particular and normal Tienda moderated fields/photos create one evolving pending proposal while the approved live version remains public. Owners amend that same versioned proposal; stale admin decisions fail, and approval patches only the latest proposed fields/photos. Tienda Verificada edits remain direct. |
| Sold/relist flow | DONE | Owners can mark sold, sold records are immutable historical inventory with direct `Vendido` URLs, and relisting creates a linked copy with the correct moderation/verification behavior. |
| WhatsApp contact event tracking | DONE | Durable first-party events record exact listing/store/seller, server-verified buyer or random signed anonymous session, timestamp and bounded source. Message/draft content is never accepted. Only the authenticated exact-listing buyer event at or before `sold_at` can enter the transaction candidate flow. |
| Verified transactions | DONE | Seller attribution is bound to an immutable sold listing; only an eligible contacted account can be selected, only that buyer can confirm, declines cannot be overridden, external sales never verify, races remain single-active/single-verified, and relists inherit no relationship. |
| Two-way reviews | DONE | Verified transactions open one immutable review per direction for 10 days from database `verified_at`. Double-blind visibility, Particular/store/buyer identity, visible-only aggregates, public seller/store reputation, reporting and reasoned admin hide/restore are enforced by trusted RPCs. |
| Favorites | DONE | Sprint 5 production implementation adds private owner-scoped relations, idempotent mutations, shared card/detail controls, paginated account history, sold/unavailable labels and safe destinations; relist copies do not inherit favorites. |
| Search alerts | DONE | Sprint 7 production stores normalized exact supported filters, matches only first-public eligible listings, provides Immediate/Daily delivery, pause/resume/delete, private account UI, dedupe and a protected Lima-time worker. Pre-go-live Hobby QA invokes it manually; frequent automatic scheduling is mandatory before launch. Owner real-inbox acceptance remains separate. |
| Price-drop alerts | DONE | Sprint 5's authoritative live-public price-drop transition now creates one deterministic Sprint 7 email delivery per eligible favorite recipient; retries reuse the same transition/recipient identity and later decreases remain independent. |
| Store-owner ownership | DONE | Dedicated Store Owner signup/profile repair, one-owner/one-store uniqueness, owner-bound signed submissions, and owner-only RLS are implemented without converting Particular accounts. |
| Store application | DONE | The authenticated application collects all required business/contact/location fields and supports optional logo, banner, physical-store photos, TikTok, website, and social links. Owners can edit allowed fields and resubmit rejected applications. |
| RUC uniqueness | DONE | RUC is normalized to 11 digits and protected by a database unique index; migration preflight refuses unsafe historical duplicates and the UI reports duplicate RUC without exposing another owner. |
| Store public approval | DONE | Pending/rejected/hidden stores and their inventory are nonpublic. The trusted admin review RPC requires complete data for approval and a reason for rejection/hiding. |
| Tienda Verificada direct publication | DONE | Verified stores directly publish qualifying new inventory and apply valid listing edits directly; normal Tienda inventory and moderated edits remain reviewed. |
| Automatic approval after verification | DONE | The admin-only verification RPC atomically verifies an active eligible store and approves all valid pending inventory while preserving rejected/hidden/sold rows. |
| 50 concurrent listing cap | DONE | A serialized database trigger counts only pending/approved store inventory, permits the 50th row, blocks the 51st and guards future counted-state restoration. |
| Store dashboard | DONE | The persistent Store Owner shell exposes summary, application/profile, inventory, publication, profile/security, trust/rejection/cap states, real counts, and Sprint 3 lifecycle actions. Analytics remain tracked separately below. |
| Store analytics | DONE | Grouped owner aggregates include impressions, views, contacts, sold state, favorites/actions/rate and buyer-confirmed transaction totals/rate over lifetime/7/30-day windows. Current relations are separate from period actions; zero denominators show Sin datos. |
| Full admin moderation hub | DONE | The server-authorized `/admin` shell prioritizes six actionable queues with canonical live counts, URL-addressable state and bounded domain management for listings, revisions, stores, users, reports, reviews, transactions and legacy ownership. Authority/status moderation uses trusted domain RPCs; direct Admin listing/store edits are restricted to the documented content/profile allowlists. |
| Reports | DONE | Authenticated users can report eligible listings, active stores and revealed reviews with one open report per reporter/target. Reporter data stays Admin-private; Admin can inspect history and resolve/dismiss a report separately from target moderation. |
| Moderation reasons | DONE | Store and listing rejection/administrative hiding persist required owner-visible reasons; revision rejection also requires and preserves a reason. |
| In-app notifications | DONE | The account shell provides owner-scoped, RLS-protected typed lifecycle notifications with unread state and target navigation. |
| Application emails | DONE | Supabase Auth mail remains separate. Sprint 7 production adds a centralized durable marketplace outbox, branded Spanish templates, a verified `laria.audio` Resend sender, bounded retry/idempotency, trusted recipient derivation, moderation/store/transaction/review/price/search event coverage and a protected server worker. Pre-go-live Hobby execution is manual until the mandatory launch scheduler is enabled. |
| Password reset | DONE | Existing token-hash recovery/session behavior is preserved; the safe provider same_password condition now gives specific Spanish guidance while unknown failures remain generic. |
| Category SEO pages | DONE | Sprint 9 production: `/instrumentos/<categoría>` landing pages for every canonical category (for example `guitarras`, `baterias`, `microfonos`) render the real public catalog query with stable 24-item pagination, forward refinements to URL-driven `/listados`, emit category-specific canonical metadata and are `noindex` while empty. Global category links and a single specific type representing its whole category use the existing Spanish landing; narrower types and `other` use filtered `/listados`. The catalog form can still submit both category and type. Reserved category slugs are dispatched before listing lookup; generated listing slugs cannot collide. `SEO-005` passed live pagination/filter verification; owner SEO review remains separate. |
| Legal/safety pages | DONE | Sprint 9 production: `/terminos`, `/privacidad`, `/articulos-prohibidos` and `/consejos-de-seguridad` exist, are linked from the site footer (all four from the home's full footer; Consejos de seguridad, Términos y reglas and Privacidad from the slim footer on other pages), publication/signup rule acceptance and listing contact copy, and state that Laria does not process payments, provide escrow, manage shipping/delivery or guarantee authenticity or transactions. The configured official contact email renders on relevant pages; owner legal review remains a go-live dependency. |
| Legacy ownership linking | DONE | `/admin/legacy` requires explicit listing and account selection plus confirmation. A guarded row-locked RPC links an eligible null-owner legacy listing once, rejects self-service/reassignment/races, preserves historical state/contact data and appends a durable Admin audit event. |

Historical snapshot after the local Sprint 9 implementation: **38 DONE**, **0 MODIFY**, and **0 BUILD** areas. At that point the application had not yet been released and canonical acceptance was 328 Pass / 1 Blocked / 74 Not Run / 403 total. The later production re-gate and SEO-005 follow-up updated the release and acceptance state above; owner/manual review and go-live infrastructure in `docs/go-live-checklist.md` remain separate gates.

Summary after Sprint 8 production deployment and owner acceptance: **36 DONE**, **0 MODIFY**, and **2 BUILD** areas. Sprint 8 is **CLOSED / ACCEPTED**; canonical acceptance is 323 Pass / 1 Blocked / 79 Not Run / 403 total, with only `ALERT-005` Blocked for its natural daily-email test. The matrix is an implementation snapshot, not a priority change or evidence that the remaining category SEO and legal/safety work is optional.

Sprint 5 owner navigation clarification: the shared site shell provides marketplace category/subtype navigation and canonical catalog search on public, authentication, account and admin pages. Protected account pages retain their nested role-appropriate sidebar/mobile account menu. This clarification does not add category SEO pages or a new search engine.

Sprint 6 implementation clarification: the same category/type source now drives an accessible one-category-at-a-time desktop mega-menu and mobile accordion. This improves global navigation only; it does not implement the separate V1 category SEO pages.

UX-2 navigation clarification (owner, 2026-10-09): the redesigned site shell supersedes the presentation described in the Sprint 5 navigation and Sprint 6 implementation clarifications; destinations and the shared category/type source are unchanged. Public, authentication and account pages share one root shell: a header with the logo, the catalog brand search and the account controls, and a category strip with "Instrumentos", the eight canonical categories and "Tiendas verificadas". Each category opens one panel at a time with "Ver todos" (its category page) and its canonical instrument types; on phones the strip scrolls sideways and the panel is a stacked list under it. The home replaces the strip and the header search with its own header: a "Categorías" menu listing "Todos los instrumentos", every category (each opening its category page) with its canonical instrument types, and "Tiendas verificadas", stacked on phones, plus the brand search in the home banner. A panel or menu closes when a destination is chosen, on a route change, on an outside press and on Escape, which returns focus to its button. On phones the search is a row on the catalog, the category pages and store pages, sits behind a search icon on listing pages, and is the banner's search on the home; account, legal and authentication pages show no search on phones. Protected account pages keep their nested, role-appropriate account navigation (a rail on desktop, a switcher on phones). Admin pages use their own frame without the public header, search or footer; the Admin navigation offers "Explorar categorías" with the same categories, types and destinations. This changes presentation only: it adds no search engine, page, route or rule.

Sprint 7 implementation clarification: both role-specific account menus call the transaction area `Compras`, show an authoritative pending-buyer-confirmation badge from transaction claims, and expose `Alertas`. Search-alert matching never scans historical inventory into a new alert: an existing public catalog baseline plus per-alert activation times make delivery prospective. Daily windows use `America/Lima`, prepare only completed days after 08:00, and replay a bounded seven-day window safely.

Sprint 8 implementation clarification: Admin authorization is checked server-side for every `/admin` route and again inside privileged database functions. The moderation workbench is operational—not analytics—and always shows every queue, including truthful zero states. General reports preserve individual reporter records and history; closing a report never silently moderates its target. Manual legacy ownership is explicit and one-time, never inferred from contact similarity.

Sprint 9 implementation clarification: public discovery uses one canonical origin (`NEXT_PUBLIC_SITE_URL`, default `https://laria.audio`), per-page canonical/Open Graph metadata, `robots.txt`, a bounded dynamic sitemap of public pages, non-empty categories, approved listings and active stores, and Product/Store/Breadcrumb JSON-LD. Sold listings stay reachable at their direct URL but are `noindex` and excluded from the sitemap. Account, Admin, API, signup/onboarding (`/registro/vendedor`, `/registro/tienda`) and authentication utility routes are `noindex` through metadata and `X-Robots-Tag`, and Vercel preview deployments are never indexable. The account shell follows the frozen V1 order and groups profile and password under `Perfil y seguridad`. Sprint 9 adds no migration, scheduler, payment, escrow, shipping, chat or paid feature.

Effortless Laria listing page clarification (batch "listing", proposed UXD-listing-3 to UXD-listing-10): the listing page shows up to five key specs in one line under the title; dates read as people say them ("Publicado hace 2 semanas", "Actualizado hace 3 días" only after a later content change), and a listing untouched for months invites checking availability. The seller card shows only facts Laria records (activity bucket, confirmed sales, account age, confirmed e-mail) and "Tienda verificada" opens to list what Laria checked by hand (RUC, razón social, address, a phone on file) and since when. The reviews section shows the count per star and loads every review on request. Similar listings are ranked by brand, a price within 30% and the city, in a scrollable row of up to eight. Photos can be zoomed in the lightbox by gesture, button or key. "Compartir" shares the link (or a story image) and links show a generated preview card for public listings. The owner of a listing sees shortcuts to edit, lower the price or mark it sold. `/instrumentos/<listing id>` redirects to the listing's slug.
