# Laria V1 Functional Specification

This document defines the **expanded Laria V1 product contract**, reconciled on 2026-10-28 (America/Lima).
The owner has explicitly expanded the initial MVP through store operations, Effortless Laria and the approved feature ideas in PR #54.

Scope approval does not imply deployment or owner acceptance. Sections marked **PR #54** are approved V1 scope built on that draft branch, awaiting release. Other implemented extensions are on the inspected remote main; optional pilots still require their gates. See [feature status](features.md) and the [source and release record](documentation-status.md) for exact refs, evidence and activation dependencies.

- `docs/functional-spec.md` is canonical for product behavior.
- `docs/design-system.md` is canonical for visual and UI behavior.
- Existing code and database schema describe the current implementation state. If older planning documentation conflicts with this functional specification, this document wins.
- Changes to the V1 contract require an explicit new product decision.

The original sprint contract remains the baseline except where an approved extension below explicitly replaces it. Historical “post-V1” or “proposed” labels do not exclude extensions accepted in the decisions summarized here. Unbuilt and deferred work remains listed separately at the end.

## Product Model

Laria is a vertical marketplace for musical instruments and music gear in Peru. V1 is a discovery and lead-generation marketplace, not a transaction-processing platform. Public users can browse listings and stores, and transactions happen outside Laria, primarily through WhatsApp.

Laria V1 does not include:

- Laria-processed payments or Laria-managed checkout.
- Escrow.
- Delivery or shipping management.
- Transaction commissions.
- Subscription billing.
- Internal chat.

Laria V1 includes buyer and seller identity, owned listings, verified transaction confirmation, reviews, favorites, alerts, moderation, analytics and store verification, plus the inventory, assisted-commerce pilot, discovery, services, trust and selling tools described below. A merchant’s stated payment methods, warranty, installments, delivery terms or Nubefact receipt are the merchant’s responsibility; Laria does not become the payment processor, courier, insurer or issuer of the merchant’s receipt. No pilot charges sellers for using Laria.

## Account Types

### Particular

A Particular account can both buy and sell; a user must not need a second buyer account. It can browse, favorite listings, create search alerts, receive price-drop alerts, contact sellers, buy items, publish and manage owned listings, and participate in verified-transaction reviews.

The current database value `profiles.account_type='seller'` represents the Particular product role. That implementation name does not narrow the account to selling only.

### Store Owner

Store owners use accounts separate from Particular accounts. One effective owner account manages one store in V1. Although the current schema contains `store_members` and supports several membership roles, multiple employees or store staff management is outside V1.

### Admin

One admin role is sufficient. Admin authority continues to come from the secure current mechanism: Supabase Auth `app_metadata.role='admin'`. V1 does not require granular moderator or support roles.

## Buyer Accounts and Authentication

Browsing and WhatsApp contact remain public. Visitors may save favorites on their device; an account is required for synchronized favorites, saved-search and account notifications, verified transaction participation and reviews.

A Particular profile contains at least:

- Full name.
- Email and Supabase Auth identity.
- Password where password login is used.
- WhatsApp phone.
- City and region where appropriate.

V1 authentication includes signup, email confirmation, password login, magic-link login, logout, forgot password, password reset, profile editing, and password change. Email change and self-service Particular account anonymization are approved PR #54 scope; see Accounts, Help and Safety. Admin-assisted anonymization already exists on main.

WhatsApp numbers are stored as digits with the country code. A Peruvian mobile typed as nine digits starting with 9
gets 51 in front, on every write to profiles, listings and stores (fix-01); the WhatsApp field shows the number buyers
will see ("+51 987 654 321") with a link to try it. Signing in before confirming the e-mail says "Confirma tu correo"
and offers "Reenviar enlace", as does the screen right after signing up, with a 60-second wait between sends (fix-08).
A Particular account starts with name, e-mail and password; WhatsApp and city are asked at the first publication. Every
password field has a show/hide control and one minimum of 8 characters. After a failed password the sign-in page
offers the e-mail link for the same address. Sign-in, sign-up and the confirmation e-mail return to the page the person
came from, and the sign-in page says why it is asking.

Supabase Auth remains appropriate for confirmation, password recovery, invitations, and other authentication messages. Marketplace-generated emails use a centralized application email abstraction. The provider behind that abstraction is an implementation choice, not a product decision.

## Particular Listing Creation

A Particular must be authenticated to publish. Anonymous publication is no longer supported. Every new Particular listing requires admin moderation.

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

On an Android phone with Laria added to the home screen, photos shared from the gallery to Laria (up to 10) open the sell form with them already picked, the Particular form or the store's. They wait on the device for at most a day and reach Laria only when the form uploads them; signed out, Laria asks to sign in first. iPhone has no share target for web apps. *(Effortless Laria, big-12; UXD-speed-11.)*

The form is saved on the device as the seller types and offered back on return. "Guardar borrador" also saves it to the account (`listing_drafts`, at most 20 per seller) so it can be finished on another device from Mis publicaciones or the publish page; publishing deletes the draft. After sending, a listing in review shows its steps (Enviada, En revisión, Publicada) and, once at least 20 Particular listings were reviewed in the last 60 days, the usual wait; a live listing offers Ver publicación and Compartir. "Publicar uno parecido" keeps category, type, brand, condition, location, description and attributes, and "Duplicar" in Mis publicaciones starts a new listing from an existing one.

## Listing Lifecycle

The normal lifecycle is:

`draft -> pending -> approved`

An approved listing can later become `hidden` or `sold`. V1 provides no normal user hard-delete action. Existing `rejected` and `archived` states remain useful operational states, but they are not public active inventory.

### Hidden

An owner can hide or unpublish an approved listing. A hidden listing disappears from public browsing. It can be restored subject to normal publication requirements and, for stores, the concurrent-listing cap.

### Sold and relisting

A sold listing disappears from normal catalog and search but remains available at its direct URL with a clear `Vendido` state. The original sold record is immutable historical inventory and must never be reactivated.

`Republicar` starts a new draft copied from the sold listing; the owner reviews it and submits it through normal publication. The old sold record stays intact. A Particular or normal Tienda submission requires moderation; a qualifying Tienda Verificada submission may publish directly. The new identity inherits no favorites or verified-transaction relationship.

`Republicar` (sold) and `Duplicar` (any listing that is not archived) create a new **draft** with the text, specs and photos copied, open it in the edit form so the seller can adjust price or photos, and send it with the usual submission (UXD-my-listings-6). An owner can mark an owner-hidden listing sold (`Ya lo vendí`), and can withdraw a pending, draft or rejected listing as sold (`Lo vendí, retirar`): it goes to the sold history as archived and never becomes public. An owner can pause all their listings until a return date between tomorrow and 90 days (`Modo vacaciones`): the listings stay public with `Vuelve el …`, WhatsApp contact is replaced by that note, availability questions stop, and everything returns by itself on that date.

### Reserved listings

A Particular can mark a published listing "Reservado" for 1, 2, 3 or 5 days when they agreed to hold it for a buyer.
It stays public and contactable: the listing page (with the end date), the catalog cards and Descubrir say "Reservado",
and a signed-in buyer can ask "Avísame si se libera". Laria never records who it was held for. When the period ends the
seller is asked once, in the app, by e-mail and in Pendientes, whether it sold: "Se vendió" is the ordinary sold flow,
"Sigue disponible" confirms availability; without an answer it reads as available after 24 hours. The people waiting
are told once, when it is free again or (in the app) when it sold, and their request then ends. Store listings are not
reserved this way; store listings follow their SKU availability and inventory workflows. *(Effortless Laria maybe talk-06;
UXD-maybes-reservado-1 to UXD-maybes-reservado-4.)*

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

The account home (`Resumen`) opens on **Pendientes**: one list, most urgent first, of what needs the person (confirm a purchase, a buyer who says they bought, a review that closes soon, a rejected listing or revision with its reason, a listing Moderación hid, `¿Compraste…?`, `¿Sigue disponible?`, a sale with no buyer chosen, drafts, favorites that dropped in price, new alert matches). Each item answers in one tap on the spot or links to the screen where it is done. Metrics move to `Estadísticas` (`/mi-cuenta/estadisticas`): 7, 30 or 90-day views, WhatsApp contacts and saves per listing with up to two plain tips each (UXD-my-listings-1, UXD-my-listings-9). `Mis publicaciones` has status tabs with counts, search, sorting by views or contacts, inline price changes, bulk hide or restore, pages of 50, and a private preview for listings that are not public. Hide, restore and price changes happen at once with `Deshacer` for 10 seconds; only marking sold keeps a confirmation.

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

The edit form follows the sell form's order (photos, the instrument, condition and price, location, description, characteristics). On approved listings each field carries `Se publica al instante` or `Pasa por revisión`, and a live note says what saving will do. A rejected listing or revision opens with the moderator's reasons as a checklist and the affected fields marked `Revisar`; rejected listings and drafts have one button, `Guardar y enviar a revisión` (`Guardar y publicar` for a Tienda verificada).

## Store Account and Application

The V1 flow is:

1. The owner creates a separate store-owner account, associated with one store.
2. The account/store starts its `Tienda` application; that identity does not make an unapproved store public.
3. The owner submits business information for approval and verification.
4. The owner may submit listings immediately.
5. Before basic admin approval, the public store page is not visible and its listings follow normal moderation.
6. Admin approval makes the store a public `Tienda`; its products still require listing moderation.
7. Admin may separately verify the business, making it a `Tienda Verificada`.
8. A Tienda Verificada can publish qualifying inventory and listing edits without listing-by-listing moderation.

The application requires RUC, razón social/business identity, email, phone, physical address, geographic location, and contact person. Physical-store photos, logo, banner, Instagram, Facebook, TikTok, website, and other social links are optional.

RUC is unique across stores. Duplicate RUC submissions must not silently create multiple stores; admin may resolve exceptional cases manually.

## Store Approval and Verification

Basic store approval and business verification have two public labels:

- `Tienda`: the store passed basic admin approval, its page may be public, and its products still require moderation.
- `Tienda Verificada`: Laria manually verified the business identity, and the store can directly publish qualifying inventory and apply listing edits.

Verification is manual and admin-only. At minimum, admin evaluates unique RUC, razón social, business email, phone, address, location, and contact person. Store photos may help. Automatic SUNAT verification is not required. The PR #54 dealer, maker, artist and destacado marks have their own stated criteria and do not replace basic store approval or business verification.

When a store becomes verified, all its current `pending` listings automatically become `approved`. Rejected, hidden, and sold listings keep their states, and historical moderation records remain intact. Revoking verification removes direct-publication privileges but does not automatically hide already-approved listings.

## Store Listing Cap

The default free store allowance is 50 concurrent publications; Admin may set an audited per-store allowance from 1 to 2,000 with a reason. Inventory SKUs do not count as publications. `pending` and `approved` count toward the cap. `sold`, `rejected`, `archived`, and `hidden` do not. This is a concurrent cap, not a lifetime quota.

Creating or restoring a counted listing must fail gracefully if it would exceed the current allowance. Lowering an allowance never hides existing publications. No paid plans are active in V1, even though legacy schema enum values may name possible plans.

## Store Dashboard

The store-owner dashboard supports editing the store profile and allowed business/contact data; managing logo, banner, optional store photos, and social links; creating and editing inventory; viewing status and moderation reasons; marking sold; hiding/unpublishing; relisting; and aggregate analytics.

Stores set a default condition and a standard text for the end of every description once, at Mi tienda → Valores por defecto (`store_listing_defaults`); the sell form starts with both and the seller can change them per listing. The store's own text does not count towards the 40-character description minimum. Each inventory SKU remembers the brand, model, type, condition, description and attributes of its last publication or import (`store_inventory_items.listing_details`), editable in the SKU's "Datos para publicar" panel, and "Publicar este SKU" starts with them (Effortless Laria SHOP 06, STOCK 09).

Store listings resolve their WhatsApp contact from the store's current number, the way account-owned Particular listings resolve it from the profile: when a store changes its number, every unsold listing of that store follows (sold listings keep their historical record). WhatsApp links add Peru's country code (51) to a 9-digit mobile number stored without it. *(Effortless Laria, batch "listing", fix-03; UXD-listing-1.)*

Commercial analytics include listing impressions, listing views, favorites, WhatsApp contacts, sold listings, and meaningful conversion-oriented ratios. They must not present WhatsApp interest or mutually confirmed transactions as revenue. Merchant-recorded inventory sales remain separately labelled operational data, not Laria-processed payments. These metrics should remain suitable for evaluating later paid store packages without activating such packages in V1.

The store home opens on **Hoy en tu tienda**: the same Pendientes plus today's purchase requests, out-of-stock SKUs people saved, low stock, an unfinished import with its expiry, and SKUs without a listing. A new store sees a checklist that ticks itself (Solicitud, Logo y portada, Descripción y redes, Primera publicación o Importar desde Excel, Medios de pago when the payments pilot is on, Ver tu página) until every step is done. `Estadísticas` adds a 12-week trend of views and contacts, the top listings by views, contacts and purchase requests, and the listings with contacts but no sale in 30 days.
### Store workflow extensions

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

The listing page and catalog cards show a real recent drop as "Antes S/ X" for 30 days: the listing is approved, the new price is at least 5% below a price that had been in effect for 7 days, and any increase clears it. Sold listings never show it. *(Effortless Laria, list-05; UXD-listing-4.)*

### Back-in-stock alerts

On an out-of-stock ("Agotado") store listing, a signed-in buyer can ask to be told when it is available again. When its stock returns they receive one in-app notification and one e-mail, and the request ends. Owners cannot watch their own listings. A sold listing instead offers a ready immediate search alert for its category, type and brand. *(Effortless Laria, list-11; UXD-listing-9.)*

### Search alerts

Authenticated users can save the exact state of a marketplace search, including the free-text query (`query`, find batch), category, supported filters and instrument attributes, location, price filters, and other supported search state.

Frequency options are `immediate` and `daily digest`. Immediate alerts notify shortly after a new matching listing becomes public. Daily alerts bundle matching new listings. Only newly public matches qualify; the same user/alert/listing combination must not be notified repeatedly; empty emails are forbidden. Users can pause or delete alerts, and emails link directly to listings or matching search results.

Visitors can save favorites without an account; they live on the device and merge into the account at sign-in, then
work on every device. Favorites show the price when saved ("Antes"), a private note, WhatsApp for available listings
and similar listings or a similar alert for sold ones, and can be shared through a revocable link. Price drops alert
favorites at 5% or more, at most once a day per listing. Alerts can be renamed, switch between daily (default) and
instant, hold several cities or conditions, and show their last match and total. A repeated search offers an alert
once. Buyers can follow stores and brands; new arrivals appear with the reason they are shown, and a weekly e-mail is
optional. An action interrupted by sign-in (an alert, a report) is finished on return.

## Category SEO Pages

V1 includes useful category browsing pages such as `/instrumentos/guitarras`, `/instrumentos/percusion`, and `/instrumentos/microfonos`, indexable when eligible. The older `/instrumentos/baterias` landing redirects to its current category/type destination. They use the real listing and filter system and must not be fake-content SEO doorway pages. Exact routing may follow the existing Next.js conventions; implementation must also avoid ambiguity with current listing-detail slugs.

## Search, Browse and the Home

Included in expanded V1 through the accepted Effortless Laria program (UXD-find-1 to UXD-find-16), recorded live since 2026-10-23. See the [source map](documentation-status.md).

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

### Descubrir

`/descubrir` shows listings one per screen, as a second way to browse; the grid stays the default. From the home,
"Descubrir lo nuevo" shows the listings published in the last 7 Lima days, newest first (30 days when the week holds
fewer than 12), with a stop after today's listings. From any results list, "Ver en Descubrir" shows that list, with its
filters and order, to its end. Each screen has the photos (swipe or arrows), the price, the title, the key specs, the
place and the seller, WhatsApp, ♥, "No me interesa" and "Ver publicación"; a reserved listing says "Reservado" there
too. Every gesture has a button and the keyboard works on a computer. No autoplay, no endless loop and no swipe
verdicts; every feed ends with a screen that says what was seen. "No me interesa" is kept on the device and only hides
listings in Descubrir. The page is not indexed, and the bulk catalog crawlers are refused there as on `/listados`.
Analytics: impressions with the home or catalog source; contacts through `/api/contact`; no listing view.
*(Effortless Laria maybe big-02; UXD-maybes-descubrir-1 to UXD-maybes-descubrir-9.)*

## Listing details: condition, sale terms, combos and the map

**PR #54 — approved V1 extension; built, pending release.** See the [batch sources](documentation-status.md#pr-54-sources). Every term is the seller's word; Laria handles no shipping,
payment or trade and gives no directions.

- **Condition scale.** Condition is one step of a scale, each with a one-line definition: Nuevo, Exhibición o caja
  abierta (store listings only), Como nuevo, Excelente, Muy bueno, Bueno, Regular, Para reparar. It replaces Nuevo /
  Usado - buen estado / Usado - con detalles: old listings read Muy bueno or Bueno, and an old search value finds every
  step it covered. The listing shows the step and opens the whole scale.
- **Price mode.** Optional "Precio fijo" or "Precio conversable" beside the price and on cards; nothing is pre-chosen.
  A "Precio fijo" listing offers no "Hacer una oferta" (FD-integration-6).
- **Cómo se entrega and trades.** Optional terms in the sell and edit forms: pickup (district or zone, never an
  address), "Se puede probar", delivery in Lima and who pays, shipping to provinces (Shalom, Olva, another agency; paid
  on sending or at the agency), and "Acepto cambios por…" with categories. They go live when saved, refuse contact
  details, and the listing says "Lo indica quien vende. Laria no gestiona envíos, pagos ni cambios." "Usar lo de tu
  última publicación" copies the last terms only when pressed. A listing that takes trades offers the WhatsApp chip
  "Te propongo un cambio"; chips the listing already answers are not offered.
- **Yes/no filters.** "Envía a provincia", "Se puede probar" and "Acepta cambios" (`?opciones=`) in the catalog
  filters, chips, counts and saved alerts, all of the chosen ones at once.
- **Combos.** "Agregar al combo" keeps a list per seller on the device (up to 10, for 30 days); "Pedir el combo por
  WhatsApp" sends one message with each listing, the sum of published prices and the seller's declared discount. Each
  listing counts as a contact. Sellers may declare one discount (5 % to 30 %, from 2 to 5 listings); stores attach up to
  six "Lo que suele acompañarlo" listings to one. Not offered on sold listings or in the assisted-purchase pilot.
- **Ver en mapa.** "Lista | Mapa" on the catalog and category pages (the list stays the default; `?vista=mapa`). Stores
  that show their address and placed their pin (Mi tienda → "Tu tienda en el mapa") are pins with "Abrir en Google
  Maps" and "Abrir en Waze"; everyone else is an approximate area (a Lima district for a store, the city otherwise).
  Nearby places merge and part on zoom; a list beside the map does everything the map does. The map shows the newest
  300 matches. Map data: OpenFreeMap, credited on the map.
- **Maker marks when selling.** A maker store's and a verified artist's sell form include discovery's marks.

## Discovery: gifts, guides, collections, makers and artists

**PR #54 — approved V1 extension; built, pending release.** See the [batch sources](documentation-status.md#pr-54-sources).

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

## Store Operations and Assisted Commerce

Inventory, imports, Mostrador and the assisted-commerce implementation are on inspected main and included in expanded V1. Older prototype-only labels are historical. Inventory remains enabled per store by Admin. The buyer-facing assisted-commerce pilot remains off until legal review and both its deployment and database gates are enabled. See the [source map](documentation-status.md) for detailed STORE/INV/IMP/IPH/PAY designs and acceptance boundaries.

Inventory (Tiendas, enabled per store by an Admin during the pilot):

- A store keeps one inventory record per SKU: its own SKU (unique per store, case-insensitive, letters, digits, `.`,
  `_`, `-`; a `LAR-000001` code is generated when blank and changed only through an audited SKU change with a reason),
  name, variant, price in whole soles, low-stock threshold, optional catalog product and external reference.
- Stock is merchant-reported: units on hand, never below zero, changed only by recorded movements (sale, return,
  restock, damage or loss, count, import reconciliation) with author, channel and reason in an append-only history.
  Concurrent stock writes cannot consume the same last unit twice, and a retried write never applies twice. A WhatsApp inquiry itself does not hold stock.
- A SKU may control one publication of the same store. A controlled publication shows "Agotado" at zero stock, keeps
  its URL, leaves the catalog, home, sitemap and related strips (`noindex, follow`), appears last on the store page,
  and returns when restocked without re-sending alerts. Stock never changes a publication's status, and moderation
  never changes stock. A controlled publication cannot be marked sold; the store unlinks it first to use the V1 sold
  and verified-transaction flow. Particular listings and uncontrolled store listings behave exactly as in V1.
- Buyers see only Disponible / Agotado, never unit counts. Sales recorded in Inventario are the store's own notes:
  they never by themselves create verified transactions or unlock reviews. PR #54’s separate counter-purchase confirmation can create a verified relationship after the buyer accepts its one-time code.
- Screens: Inventario (summary tiles, recent movements, search, filters, sort, bulk stock, price, threshold and hide,
  CSV and Excel export with formula-safe text), the SKU page (stock actions, history, publication link, data, SKU
  change, archive), and publishing a SKU as a listing through the existing form and moderation.

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
  pay the store directly and that Laria processes no payment and holds no money. Optional Nubefact receipts are issued by the store through its own provider account, not by Laria. The listing's
  one contact button reads "Solicitar compra" and opens WhatsApp with the title, the store's SKU, the selected quantity (up to available stock, capped at 10) and the
  link; it is recorded as a WhatsApp contact with the purchase intent. The pilot never marks payment as received, displays a payment link, reserves stock for this inquiry or creates a checkout order. Solicitudes records the contact’s follow-up; only a merchant-recorded sale changes stock.

## Store floor: arrivals, warranty, labels and try-outs

**PR #54 — approved V1 extension; built, pending release.** See the [batch sources](documentation-status.md#pr-54-sources). Every promise here is the store's; Laria handles no money and sends no WhatsApp.

- **Por llegar.** A SKU without units can carry the date the store expects more (today to a year ahead). Its listing
  shows "Por llegar" with the date as an estimate and "Avísame cuando llegue" (the back-in-stock watch); it otherwise
  follows every out-of-stock rule. The date clears when units arrive; dates that pass are removed daily and the store
  is told once.
- **Garantía y cambios.** A store states its warranty (months, its own or the brand's) and exchange terms (days and a
  short note) once per condition group (Nuevos, Exhibición o caja abierta, Usados), or for one listing. Store listings
  show the lines as the store's offer. "Con garantía" is a yes/no filter and saved-alert option (more than 0 months).
  Where the store's terms accept exchanges, they replace its gift-exchange line on the store page and `/regalos`.
- **Labels and poster.** From Inventario, the store prints price labels (name, price, a Code 128 barcode of the SKU
  for Mostrador, a QR to the listing) on four common papers, and an A4 or A5 "Encuéntranos en Laria" poster with a QR to
  its store page. Built in the browser; nothing is stored.
- **Reservar una prueba.** A store that switches try-outs on sets weekly try-out hours; on its listings with units
  available, a signed-in buyer books a day and time. The store confirms or declines in one tap; both sides get a notice
  and an e-mail and can open WhatsApp with the details written; confirmed try-outs get one reminder; unanswered
  requests expire at their time; try-outs are deleted 90 days after their date. A try-out holds a time, never the
  instrument. Stores see the day's try-outs on Mi tienda and the agenda in Pruebas; buyers see theirs in Mis pruebas.
- **Daily job.** `/api/internal/jobs/store-floor` (CRON_SECRET), once a day.
- **Cuotas sin intereses (buy-09).** Part of PAY-1 Pilot A and off with it. A verified store with a card method (POS
  al recoger or enlace de pago) states in Pagos how many interest-free installments it offers (2 to 36), optionally
  with which credit cards (fixed list) and from what price, confirming each time that the buyer pays no interest or
  surcharge. Laria reviews each change as it does a method. While the offer is approved and a card method of the store
  is approved, its listings at or above the minimum price with units show "o N cuotas sin intereses de S/ X" (the
  price split evenly) on the listing and its cards, the methods box adds the store's sentence, and "Acepta cuotas" is a
  filter and saved-alert option (shown only when results carry it). Installments with interest are never shown.

## Store reach: Mercado Libre import, social catalog, dealers, campaigns and demand

**PR #54 — approved V1 extension; built, pending release.** See the [batch sources](documentation-status.md#pr-54-sources). Every page below is linked from Mi tienda → "Más alcance para tu tienda"; the account menu is
unchanged.

- **Importar desde Mercado Libre.** A store connects its Mercado Libre account (OAuth with PKCE), picks up to 100 active
  publications and gets an ordinary inventory import; photos are copied from Mercado Libre through the import's photo
  check. Laria only reads, never publishes or changes anything there. Off without the server's credentials.
- **Catálogo para redes.** A store turns on its feed (off by default) and connects `/api/feeds/tiendas/<slug>` to its
  Meta catalog once. Laria's own feed `/api/feeds/laria` is for Laria's Google Merchant Center account.
- **Distribuidor oficial.** A store sends a brand's authorization; Admin approves, rejects or revokes it with a reason.
  While in force, the store's publications in condition Nuevo of that brand show the mark with what Laria checked (a document, not
  the instruments or the warranty); the store page and the brand filter name the dealers.
- **Campañas Laria.** Admin publishes dated campaigns of up to 30 days with a minimum discount. Stores add publications
  whose current price is the lowest of the 30 days before (Laria's own price history), choose what happens at the end,
  and Laria applies and restores prices. A full 30 days of recorded public price history is required; do not infer history before migration. A store's own price change takes the publication out. Plain dates, never
  countdowns.
- **Lo que buscan en Laria.** Active stores see last month's searches and alerts as counts of distinct people by city,
  with active publications next to them, never under 5 people, stored aggregated, and with the report's limits stated
  above the tables. It gives no advice on what to stock.

## Services for musicians

**PR #54 — approved V1 extension; built, pending release.** See the [batch sources](documentation-status.md#pr-54-sources).

- **A separate section.** «Servicios para músicos» (`/servicios`) for lessons, lutherie and repairs, rehearsal rooms,
  recording studios and sound for events, each kind with its own page. Services have their own tables, pages and Admin
  queue and never appear in instrument search, the catalog, listing counts, saved alerts, favorites or a store's
  listing allowance. Services are still not allowed as listings.
- **Profiles.** A Particular or a store (as the store) offers one service per kind: title, description, a "desde" price
  in soles per unit, where it happens, skills (lessons and repairs), city and zones, WhatsApp and up to six photos.
  Contact details in the text are refused.
- **Moderation.** New services wait for Admin; edits to the title, description, name or photos of an approved service
  stay public and are rechecked. Rejecting or hiding needs a reason the owner sees. Reports on services and their
  reviews have their own queue.
- **Contact.** WhatsApp only, recorded like listing contacts; the owner sees 30-day views and contacts in aggregate.
- **Confirmed bookings and reviews.** A client who wrote through Laria's button signed in (180 days) can say they hired
  the provider, or the provider can ask them to confirm; the other side answers within 30 days. A confirmed client can
  leave one review within 30 days. Confirmation does not verify payment or work. A service with confirmed clients or
  reviews can be paused, not deleted.
- **Laria's role.** Laria does not schedule, charge, take payments, verify titles or the quality of the work, or take
  part in the agreement (Terms § 5 bis, draft pending legal review).

## Deal trust: seller pages, safer meetups and verified store purchases

**PR #54 — approved V1 extension; built, pending release.** See the [batch sources](documentation-status.md#pr-54-sources). Laria still never charges, holds money, checks an instrument or guarantees a deal.

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
  sales, 3 visible reviews averaging 4.5, no upheld report in 90 days, no public question unanswered over 7 days. The five buyers must be distinct; repeat purchases by one buyer do not inflate the threshold.
  Nobody applies or pays.
- **Buyer track record (safe-07).** Off by default. Once the buyer turns it on, a line with a link to a small card
  (first name, buying since, verified purchases, average rating from sellers) joins their WhatsApp messages; it can be
  removed per listing. Turning it off kills the link.
- **History on Laria (safe-11).** A buyer who resells an instrument bought through a listing-based verified transaction can link the
  new listing to it: "Comprado en Laria en <mes> · N dueños anteriores en Laria" and the original specs. Nothing about
  the previous seller is shown.
- **Safe meetups (safe-03).** On a Particular's listing, "Encuentro seguro" lists «Punto seguro Laria» stores in the
  city (verified, active stores showing their address that opted in; Admin can turn one off with a reason), public
  shopping centers and the nearest police station, prepares an "Avisar a alguien" WhatsApp message and links the
  try-out checklist. The copy never promises safety.
- **Admin > Confianza** reviews photos, Puntos seguros and confirmed counter purchases (repeat confirmations flagged).
  A daily job (`/api/internal/jobs/deal-trust`, `CRON_SECRET`) runs the levels, counter-purchase review reminders and
  photo upload cleanup.

## Accounts, Help and Safety

**PR #54 — approved V1 extension; built, pending release.** See the [batch sources](documentation-status.md#pr-54-sources).

- **Staying signed in.** "Mantener sesión iniciada" on the sign-in page: the session survives
  closing the browser and lasts while it is used (Supabase's 400-day cookies, no session time-box), preserving the second-factor level for at least 30 days when the hosted session settings permit it. Unticked, the
  session ends with the browser. It applies to password, e-mail link and Google or Apple sign-in.
- **Two-step sign-in — Admin only during the pilot (owner decision, 2026-10-30).** Admin must use an authenticator
  app (no SMS), with ten one-time recovery codes. Particulars, store owners and service providers have no enrollment
  control or code prompt during the pilot, including stores with approved payment methods. Older non-Admin factors
  are retired at the next sign-in or visit to Seguridad so Auth does not block password/email changes. Admin's password-only
  sessions with an enrolled factor are refused by PostgREST, Storage and routes that act through the service role
  until the code is entered. Anonymous browsing and contact remain public. Recovery revokes every session before
  removing the app, invalidates the other recovery codes and sends an email; old access tokens are refused at the
  API/Storage boundary and old refresh tokens cannot renew. Admin must sign in and enroll again. Wider two-step
  verification is deferred until Laria gains paying users and the owner explicitly authorizes its return; it must
  be released with matching UI, Auth and database checks rather than being activated automatically by payment status.
- **Devices.** Seguridad lists the account's sessions by browser and last activity, closes one or all of them, and a
  sign-in from a browser the account has not used before sends one e-mail.
- **E-mail change** from Seguridad through Supabase's confirmation link; the old address works until it is confirmed.
- **Tus datos.** The person downloads all their data as one JSON file, and a Particular can delete the account after
  the password and one confirmation: the profile becomes «Cuenta eliminada», unsold listings are archived, personal
  lists and notices are erased, verified transactions and their reviews stay. Admin and store-owner accounts are closed
  with the team.
- **Google and Apple.** Buttons on sign-in and Particular sign-up, shown only when each provider is enabled; a first
  sign-in creates a Particular account.
- **Help center.** `/ayuda` with topics, accent-insensitive search and short articles; "¿No encontraste tu respuesta?"
  sends a question with a code. Signed-in senders see answers in Mis consultas and by e-mail; Admin answers others from
  their own mailbox. Laria's WhatsApp support line shows only once its number and hours are set. This is a simple
  inbox, not a ticketing system.
- **Stolen-gear registry.** A signed-in person reports stolen gear with the police report number, the serial and
  private photos. Sellers can add a private serial to a listing, and stores to each SKU. Matching serials or photos
  create a lead for Admin only; nothing changes on the listing, nobody is named publicly, and only a match Admin
  confirms tells the reporter, without naming the listing or the seller.
- **Copied photos.** Listing photos are compared by a perceptual hash computed on Laria's server; a photo nearly
  identical to another seller's flags the newer listing for Admin at review ("Foto parecida a la de otro vendedor").
  Flags never reject or hide anything. The price rule waits for typical prices.

## Selling Tools: Mi equipo, store offers, consignment, price steps and private offers

**PR #54 — approved V1 extension; built, pending release.** See the [batch sources](documentation-status.md#pr-54-sources). Laria never charges, handles money or values gear in any of these.

- **Mi equipo.** A Particular's private list of their gear (Mi cuenta › Mi equipo): brand, model, serial, purchase date,
  warranty end and a note. Confirmed purchases are added by themselves. "Vender esto" opens the sell form with the
  item's details. No estimated value.
- **¿Prefieres vender ya?** Verified stores opt in to buying used guitars, basses, amplifiers, pedals or keyboards. A
  Particular sends photos and a description to every such store of their region, sees how many will receive it
  first, gets offers within 24 hours and has 3 days to choose one or none. Choosing shares their WhatsApp with that
  store only; they bring the gear within 5 days and the store confirms the price and pays directly.
- **Consignment.** A verified store lists a Particular's instrument as its own listing, marked "En consignación en
  <Tienda>", and invites the owner by a one-time link; the owner follows its views, contacts and saves and is told when
  it sells. The commission is agreed between them.
- **Part payment.** A store listing can say "Aceptamos tu equipo como parte de pago" (store default, per-listing
  choice). The buyer sends their gear from Mi equipo or with photos to that store, which answers with an estimate.
- **Bajada automática.** The owner of a listing sets a floor and a pace (5 % or 10 % every 7 or 14 days, optionally
  only without WhatsApp contacts). A daily job lowers the price until the floor, a sale or a pause; each step is a
  normal price change, so saved-listing alerts follow. Buyers see no countdown.
- **Oferta a interesados.** Once per listing per week, the owner sends one private price, for 1 to 7 days, to the
  people who saved it, by notification and e-mail (respecting the price-drop e-mail choice). The listing shows it to
  them with a WhatsApp button that quotes it; the public price does not change.
- **Reminders.** A Mi equipo item with strings, reeds or drumheads can have one reminder (off by default, every 1 to 12
  months) that names up to three stores of the region that sell them; one tap stops it, also from the e-mail.
- **Ofertas (stores).** The store inbox for sell and part-payment requests and the "Qué recibimos" settings (used gear,
  consignment, part payment, consumables). Mis publicaciones links each listing's "Herramientas de venta".

## Store locations (sedes) and merchant electronic receipts

**PR #54 — approved V1 extension; built, pending release.** See the [batch sources](documentation-status.md#pr-54-sources).

- **Sedes.** A store can add up to 20 sedes (name, place, hours, pickup, address shown only when the store agrees).
  The store's total stock is split across its sedes; Inventario, the SKU page and the export show stock per sede, the
  owner moves units between sedes and counts per sede, and a "Stock por sede" sheet counts many SKUs at once.
  Movements that don't name a sede go to the main sede first.
- **Mostrador per sede.** Mostrador sells from the sede chosen on that device; offline sales keep it.
- **Listings and store page.** With two or more sedes, a listing with units says "Disponible en Miraflores y Centro"
  and lets the buyer say where they'd pick it up (added to the WhatsApp message; not a reservation). The store page
  lists the sedes. Quantities per sede are never public.
- **Boleta electrónica — activation deferred.** A verified store connects its own Nubefact account. At Mostrador it can issue a boleta or
  factura with the sale, with the customer's DNI or RUC, and send the PDF by e-mail (Nubefact) or WhatsApp. The store
  is the issuer and pays Nubefact; Laria never charges or handles money. Comprobantes lists receipts, retries the ones
  that did not reach Nubefact and voids accepted ones up to 7 days. Off until `LARIA_EINVOICE_KEY` is set. The owner has deferred Nubefact and removed that key; keep it off during the general feature release. A fresh key and a successful Nubefact demo boleta/factura test are required before activation. These are the store’s receipts, never Laria-issued receipts.

## WhatsApp Contact Tracking

Laria records buyer intent when a user initiates WhatsApp contact. It never records WhatsApp message content.

The event associates the listing, authenticated buyer when present, seller or store, timestamp, and useful source/context. It supports conversion analytics and determines which authenticated buyers are eligible for transaction confirmation when a seller marks that listing sold. Anonymous contact remains possible, but an anonymous buyer cannot later participate in the verified Laria transaction or review workflow for that contact.

The WhatsApp message opens pre-filled with the listing's title, price (when set) and link, asking whether it is still available. Optional quick questions (try it, shipping, case, negotiable price), never preselected, are appended when chosen. The button opens WhatsApp at once; the contact is recorded in the background and never delays or blocks it. Before a buyer's first contact about a listing from S/ 1,000, or any purchase request, a short safety sheet appears once per browser. Signed-out visitors see a quiet hint to sign in first so they can later confirm the purchase and review; contact never requires an account. *(Effortless Laria, talk-01 to talk-05; UXD-listing-6 and UXD-listing-7.)*

On a reserved listing the message says so instead of asking whether it is still available ("Vi que está reservado. Si
se libera, ¿me avisas?"), from the listing page and from Descubrir alike. On a Particular's published listing with a
price that is neither reserved nor marked Precio fijo, "Hacer una oferta" lets the buyer name an amount in soles (with three round amounts under
the price as suggestions) and opens WhatsApp with "Hola, te ofrezco S/ … por tu … publicado en Laria: <link>". The
amount lives only in the buyer's message: Laria records the contact as any other and never stores the offer.
*(Effortless Laria maybes talk-06 and talk-07; UXD-maybes-reservado-5 and UXD-maybes-2.)*

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
3. For this listing-based path, the seller may select a buyer only from authenticated users who generated a WhatsApp-contact event for that exact listing at or before its sold timestamp. The seller cannot search or browse the user directory.
4. The seller may instead choose `Vendido fuera de Laria / comprador sin cuenta`.
5. Without a selected Laria buyer, the listing remains sold, but no verified transaction exists and reviews stay locked.
6. With a selected buyer, Laria sends that buyer a confirmation request.
7. If the buyer answers `Sí, lo compré`, the relationship becomes a verified Laria transaction.
8. If the buyer declines or never confirms, the listing remains sold without a verified transaction or review relationship.

PR #54 adds a second eligible path: a customer confirms a store’s one-time Mostrador code, without requiring a listing or prior WhatsApp contact (see Deal trust). A stock movement alone never verifies a purchase or unlocks reviews.

This confirmation verifies only the parties’ recognition of the purchase. It does not verify payment amount, delivery, or item condition.

The loop can also start from the buyer: 3 to 30 days after a signed-in buyer opened WhatsApp on a listing, Laria asks them once `¿Compraste …?` (in Pendientes, on the listing as `¿Cómo te fue?`, and by e-mail). `Sí` notifies the seller, who confirms with one tap (`Sí, me lo compró`): the listing becomes sold and the transaction is verified without a second buyer confirmation, because the buyer already said yes. `No` only stops the question. If the seller already asked that buyer, the buyer's `Sí` answers that request. Stock-managed store listings are excluded; their sales are recorded in Inventario. The buyer list a seller chooses from shows each person's name, contact date and the last three digits of their WhatsApp, with no one pre-selected.

## Reviews

Instrument-transaction reviews are available only for verified Laria transactions and are two-way: seller/store reviews buyer, and buyer reviews seller/store. Each review requires 1–5 stars, permits an optional text comment, and is limited to one review per side per transaction.

Stars are tapped directly (five radio buttons, nothing pre-selected), with the comment right below. After the buyer confirms, a closing panel (`Que lo disfrutes`) leads into the review, and a seller's first verified sale is marked once as a milestone. Reminders go to the buyer on day 2 and day 7 of an unanswered confirmation request, and to whoever has not reviewed 3 days and 1 day before the window closes.

For a Particular sale, the seller-side identity is the Particular account. For a store sale, the buyer's seller-side review belongs to the store, not the individual owner account.

Reviews use double-blind publication. The review window is 10 days from the database verification timestamp, whether the listing path or the PR #54 counter-purchase path established it. Neither party sees the other's review while both may still submit. If both submit, both may be revealed immediately; otherwise a submitted review is revealed when the window ends.

Published reviews cannot be freely edited or deleted. Users can report them. Admins can hide abusive or inappropriate reviews but must never rewrite review content. Ratings and reviews must not imply that Laria processed payment. The data model should remain compatible with possible future on-platform payments.

## Reports

Users can report a listing, store, or review. A report has a fixed reason category, optional written detail, timestamp, reporter identity where applicable, and moderation status. Reports enter the admin moderation hub, where admin can resolve or dismiss them. V1 does not need a complex ticketing or support system. Public questions on listings can be reported too.

## Public Questions on Listings

A signed-in buyer can ask a short public question on a published listing that is not their own; it appears at once for everyone. The seller (the listing owner, or the store owner) answers once, publicly; the seller is notified in the app and by e-mail, the asker in the app. Questions and answers refuse phone numbers, links and e-mails with the same filter as purchase requests; neither side can edit, and the seller cannot delete. Limits: 3 unanswered questions per buyer per listing and 20 per day. Admin can hide and restore a question with a reason. A sold listing keeps its questions read-only. This is public Q&A, not private messaging: transactions and private conversation stay on WhatsApp. *(Effortless Laria, big-11; UXD-listing-8.)*

## Admin Moderation Hub

`/admin` is the operational moderation hub, not only a pending queue. Admin can search, filter, and manage all listings, stores, user accounts, pending listing revisions, reports, reviews, verified transactions, store verification state, and legacy ownership links.

Listing actions include approve, reject, hide, mark sold where appropriate, inspect revision history, and restore/manage lifecycle where appropriate. Store actions include basic approval, rejection, hiding, verification, and verification revocation.

Rejection and administrative hiding require a reason visible to the owner.

A listing or revision rejection takes one or more fixed reasons (`pocas fotos`, `falta el reverso`, `precio incoherente`, `datos de contacto en la descripción` and six more) plus an optional note; with no reason picked the note is required. The owner sees the reasons as a checklist tied to the fields.

Approval, rejection, relevant store-status changes, and other important lifecycle changes generate marketplace emails. Admin assigns legacy listing ownership manually; ownership must never be auto-claimed only from a matching WhatsApp number or email.

## Security, privacy and operational authority

Main includes Admin second-factor protection, reasoned account anonymization, restricted public listing/contact columns, same-origin request checks, bounded rate limits and retention/cleanup. Admin authority must be checked server-side and inside privileged database functions. Ordinary owners cannot browse raw buyer/report identities or bypass publication and stock invariants. Sensitive credentials stay server-only.

PR #54 extends anonymization to its new personal records and enforces Admin's second step at PostgREST and Storage, not only page navigation. During the pilot, non-Admin accounts use ordinary sign-in; see the 2026-10-30 decision above. Revoked account sessions must not keep API/Storage access through previously issued tokens. Anonymous public inventory remains readable. The account-data export contains only the requester's data, never unrelated reporter/buyer identity or provider secrets. Shared transaction/review history and legally retained records must survive anonymization in the documented form.

Operational error lists/counts, audit history, email backlog controls, typed database clients and scheduled cleanup are part of the maintained implementation. Job configuration must be verified against actual execution. Consult the [source and release record](documentation-status.md), rather than historical manual-worker assumptions.

## Email Notifications

Centralized application email infrastructure sends listing approval/rejection, store approval/rejection, useful verification-status changes, buyer transaction-confirmation requests, review workflow notifications, search alerts, and price-drop alerts. Product logic must not depend on a particular email provider.

The listing approval e-mail reads "Tu publicación está en línea" and opens the live listing (Effortless Laria POST 15).

Rejection e-mails open the edit form and include the reason, also for rejected revisions. A daily job (14:00 UTC) sends, at most once each: purchase checks to buyers, `¿Sigue disponible?` to sellers (after 30 days without a confirmation or 5 contacts, not more than every 14 days, never while paused or for stock-managed listings), purchase-confirmation reminders and review reminders.

Supabase Auth may continue sending authentication-related messages.

Alert, price-drop and weekly-digest e-mails are optional: each says why it arrived, carries a signed one-click link to
stop that kind of e-mail and the List-Unsubscribe headers, and links to Mi cuenta › Correos. Alert and price-drop
e-mails include the photo and price. Transactional e-mails stay as they are. In-app notifications can all be marked
read at once, are paged, name the listing on price drops and include alert matches.

## In-App Notifications

The authenticated account shell includes an in-app notification center for Particular and Store Owner accounts. It records important listing moderation, listing-revision, store approval/rejection, and store verification changes with a typed event, short Spanish message, timestamp, read state, and relevant account destination. A user can read and mark only their own notifications. This complements the centralized marketplace-email outbox; it does not replace email delivery or its preferences.

A person can also receive their notices on a phone or browser ("Avisos en este teléfono" in Mi cuenta › Notificaciones), a lighter companion to e-mail, never a replacement. Laria asks the browser for permission only when the person presses "Activar avisos", never on a first visit. A push reads and opens like its row in the list; several pending notices go out as one message, and the phone shows one Laria notice at a time. Nothing is pushed from 22:00 to 08:00 Lima (those notices go out together in the morning), and notices already read in Laria or older than three days are skipped. A device belongs to whoever turned notices on last, a person keeps ten devices at most, and signing out turns that device off. On an iPhone, push works only with Laria added to the home screen. *(Effortless Laria, big-12; UXD-speed-5 to UXD-speed-10.)*

## Speed, Install and Accessibility

Included in expanded V1 with the speed batch (UXD-speed-1 to UXD-speed-4 and UXD-speed-13); live since 2026-10-23.

- A tap that changes the page shows a thin bar after 100 ms and, after a second, a skeleton of the next page over the old one; faster changes show nothing. No route has a `loading.tsx` (owner decision Q1 A).
- When the phone asks to save data or the connection is 3G or slower, images that appear after the page loads are requested smaller, and listing pages are not loaded ahead of time.
- Laria can be added to the home screen and then opens without the browser's bar. Laria shows no install banner of its own; the service worker only receives shared photos, and there is no offline mode.
- The error page offers "Reintentar", which asks the server again and redraws the failed part in place.
- Pages meet WCAG 2.2 AA: every gesture has a button, bars fixed to the bottom of the screen never cover a focused field, touch targets are at least 24 px, and status changes are announced to screen readers.

## AI Helpers (off by default)

Added with the maybes stock-24 and big-07 (UXD-maybes-ai-1 to UXD-maybes-ai-7). Neither shows until the server has
`ANTHROPIC_API_KEY` and `LARIA_AI_HELPERS=1`; on 2026-10-28 the owner chose to leave them off for now.

- **Pregúntale a tu tienda (stores with Inventario).** A question in plain words on Mi tienda or Inventario opens the
  existing Inventario filters, a view of Estadísticas or Reposición, with "Así lo entendí" listing each filter used as a
  removable chip and saying what no filter covers. Only the question goes to the AI service, never the store's data.
  50 questions per store a day.
- **Completar con IA (sell form, Particular and store).** After the photos, one button sends up to four reduced photos
  and returns suggestions for category and type, brand, model, title, details and description, each used only when the
  seller taps it; nothing about condition, price or specifications, and moderation is unchanged. 20 a day per account.
- A site-wide daily cap applies to both, and each call is logged without its content for 90 days.

## Legal and Safety

V1 has dedicated content or pages for Terms/marketplace rules, Privacy Policy, prohibited-item rules, and marketplace safety guidance.

The interface clearly says Laria currently does not process payments, provide escrow, manage shipping/delivery, or guarantee transactions. Trust copy must not imply otherwise. On the listing page this is said once, as the line under the contact button with a link to the safety tips. *(Effortless Laria, list-02; UXD-listing-3.)*

## Functionally Out of V1

The following remain post-V1 unless an explicit new product decision changes the contract:

- Laria-managed checkout, payments, escrow, or shipping/delivery integration.
- Transaction commission enforcement.
- Paid subscriptions, packages, or listing boosts.
- Internal messaging or chat (public questions on listings are not messaging; see Public Questions on Listings).
- Multiple store employee accounts.
- Automatic SUNAT verification.
- Sophisticated fraud scoring beyond the defined private serial/photo leads for Admin.
- Arbitrary new social or community functionality.

## Catalog, autofill and Jev

The canonical instrument catalog is a production data foundation, with model/variant identities and Spanish attributes. Main already reads it for brand/subtype navigation and brand suggestions; a complete model/variant browsing tree is not thereby implemented.

Catalog-backed listing autofill and Jev remain separate work, not delivered by PR #54 or by the photo AI helper. Local research and benchmarks do not activate Jev or authorize automatic moderation. The approved direction is editable category/type/model-attribute suggestions with catalog-match provenance; unit-specific condition, price, photos, included items and modifications remain the seller's input. Rejecting a match must leave ordinary publication usable, and variant-dependent values require an identified variant. Unmatched text may enter the catalog gap queue.

Normal edit/moderation rules continue until an explicit decision changes them. Jev's approval authority, thresholds and account eligibility remain separate decisions. Full catalog trees, typical prices, price-guide pages, market comparisons, compatibility suggestions, Mi equipo valuations and price-based red flags wait for their dependencies. Existing Teclados, Vientos and Cuerdas are already marketplace categories; they are not future category proposals. PR #54 adds Andinos y tradicionales.

## Deferred work and V1 release rule

The expanded scope replaces the original frozen MVP list. It does not authorize unbounded additions: new behavior still requires an explicit product decision. V1 release requires compatible application/schema, legal and operational gates, and the relevant acceptance evidence. A merge, successful build or documentation entry never substitutes for those gates.

The 13 approved-but-later feature ideas remain deferred: staff accounts, protected payments, managed shipping, listing video, pedalboard planner, auctions, rentals/rent-to-own, donations, events/clinics, linked live demos, institutional quotes, paid store plans and paid featured placement. Three further approved ideas wait for catalog dependencies: market price comparison, price guides and compatibility. Mi equipo valuation and price-anomaly detection are postponed parts of otherwise built ideas.

The separate feature-ideas maybes (identity checks/fees, technician inspections, Ask Laria, photo search, WhatsApp alerts, custom store domains and WhatsApp publication) are not made commitments by this refresh. These are distinct from the five Effortless maybes already merged on main: reservations/release watches, Descubrir, the two AI helpers and WhatsApp offers. See the [deferred source](documentation-status.md#pr-54-sources) for individual reasons and partial limitations.

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

## Implementation and acceptance status

Use [features.md](features.md) for the capability inventory and [documentation-status.md](documentation-status.md) for source identities and release gates. The working checkout predates the inspected remote main. PR #54 is open and draft; its feature migrations are not applied in production at this checkpoint. Existing optional integrations and pilots may remain disabled after a merge.

The old Sprint 1–9 DONE/MODIFY/BUILD table and September acceptance totals were historical snapshots and are replaced here by that source-aware inventory. Their dated evidence remains in the sprint/release documents. The current contract does not infer owner/manual Pass from code. `acceptance/cases.tsv` is canonical; proposed EASE/GROW/INV/IMP/IPH/PAY cases require their recorded acceptance process. This documentation task changes no acceptance status and generates no XLSX.
