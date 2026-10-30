# Laria features and implementation status

Updated **2026-10-28 (America/Lima)**. This is the capability inventory; [functional-spec.md](functional-spec.md) is the product contract. See [documentation-status.md](documentation-status.md) for exact source refs, branch-only designs, verification evidence and release dependencies.

**Main** below means the inspected remote main through PR #80, not this older local checkout or a new production smoke. **PR #54** means approved V1 functionality built on the open draft `features/marketplace` branch, pending its coordinated application/database release. **Gated** means code alone does not make the feature available. No row implies owner acceptance.

## Capability overview

| Area | Main | PR #54 additions | Activation or limitation |
| --- | --- | --- | --- |
| Discovery | Text search, URL filters/facets, categories, stores, comparison, recently viewed, device personalization, Descubrir | Maps, gifts, guides, collections, makers, artists, Andean instruments | Map is bounded to 300 matches; no precise Particular address. |
| Accounts | Particular/store roles, Auth, profile/security, Admin MFA and anonymization | Remembered devices, Admin TOTP/recovery, secure email change, data export, Particular deletion, Google/Apple, help | OAuth buttons depend on provider configuration; Admin's incomplete two-step sessions are refused at API/Storage after PR migrations; other accounts use ordinary sign-in during the pilot. |
| Publication | Four-step form, background photo upload, drafts, moderation/revisions, sound clip, owner management | Detailed condition scale, fixed/open price, trades, delivery/try-out terms, combos | Particular and normal-store moderation remains; condition migration requires compatible code. |
| Availability | Hide/restore, immutable sold history, new-draft republication, vacation mode, Particular reservations/release watches | Expected arrivals and store try-out bookings | A reservation is not a payment; a try-out holds time, not stock. |
| Retention | Device/account favorites, shared lists, notes, follows, search/price/restock alerts, email preferences, push | Private offers, gear-maintenance reminders | Daily search digest offered first; push and email honor their own preferences and schedules. |
| Trust | Listing-contact buyer/seller confirmation, double-blind reviews, public Q&A, reports and moderation | Seller pages/levels, buyer card, provenance, counter-purchase QR, review photos, safe meetup tools, stolen-gear leads | None verifies payment, delivery, authenticity or safety. |
| Particular selling | Owned publications, Pendientes, analytics | Mi equipo, offers from stores, consignment, part payment, automatic price steps | No estimated gear value; agreements/payments stay with the parties. |
| Store operations | Store approval/verification, SKU inventory, stock history, Mostrador, Excel/CSV import and publication | Sedes, labels/poster, warranty/exchange terms, try-outs, arrivals | Inventory is enabled per store; public buyers never see unit counts. |
| Store commerce | Reviewed merchant payment methods and WhatsApp purchase-request pilot | Interest-free installments; Nubefact receipts | Assisted commerce has application/database gates. Nubefact is explicitly deferred and off. |
| Store reach | Storefront, filtering, follows and aggregate analytics | Mercado Libre import, social feed, dealer mark, campaigns, demand counts | External credentials/history/eligibility required; demand is not stock advice. |
| Services | — | Separate service directory, provider tools, moderation, confirmed-client reviews | Never enters instrument search, favorites, alerts or publication allowance. |
| Administration | Moderation hub, reports, audit history, legacy ownership, operational health tools | New accounts/trust/service/dealer/campaign/help queues | Server and database authority; required reasons, bounded reads and audited mutations. |

## Public discovery and navigation — main

The home leads with actual instruments and the shared text search. It offers category chips, device-ranked Para ti, a reset and explanation, new listings since the last visit, price drops, followed arrivals and recently viewed items. Personal taste and comparison live on the device. The previous vitrina/category-tile home is historical.

`/listados` and `/instrumentos/<categoría>` share the real catalog. Search uses `q` over brand/model/type/category/title with accent/case folding, curated synonyms and small-typo tolerance. Supported phrases become removable filter chips. Existing filters survive a search; “Buscar en todo el catálogo” escapes them. Facet counts, multi-value location/condition filters, price shortcuts, result summaries and zero-result recovery use actual catalog data.

Results support price/date sorts, recent drops and verified stores first. Mobile adds the next 24 results in place; numbered pagination remains available. Comparison holds up to three listings at `/comparar`. Results trails preserve return context and previous/next listings. Main has ten categories: Guitarras, Bajos, Teclados, Percusión, Vientos, Cuerdas, Pedales, Amplificadores, Micrófonos and Audio. Retired drum/cymbal/audio-interface category URLs normalize to their replacements. Catalog-backed navigation already supplies subtype/brand links; a complete model/variant tree remains separate work.

`/tiendas` lists active stores, verified first. Store pages show identity, the scope of verification, contact, available products and store-scoped category/brand/order controls. An owner can preview an unapproved store privately; it stays unavailable to public visitors.

`/descubrir` is an optional, finite one-listing-per-screen view of recent inventory or the current filtered results. Photos and listing actions have buttons and keyboard equivalents. No autoplay or endless loop; “No me interesa” stays on the device. It is noindex and counts impressions/contacts without inventing detail views.

## Cards, detail and WhatsApp — main

Cards share photo, price, readable specs, location/seller identity and favorite controls. They load the first image plus a computed photo count; no card carousel downloads every photo. Listing detail supports a zoomable gallery, specifications, actual price history indicators, seller/store facts, visible reviews, public questions, sharing and real similar listings. Sold records keep their direct URL and history, leave search and have no purchase/contact action. Unavailable former listings expose no private details.

The single primary contact opens WhatsApp with a Spanish message. Quick questions are optional and adapt to facts already shown; event recording must never trap navigation. A first-contact safety sheet applies to higher-priced listings and purchase requests. The contact records intent and authenticated attribution, never the WhatsApp conversation.

Public Q&A requires an account and prevents self-questions and contact details. Questions/one public seller answer are immutable, rate limited and reportable; Admin can hide/restore with a reason. Sold-listing questions become read-only. This is distinct from private chat.

## Account, favorites and notifications — main

One Particular account buys and sells; Store Owner is a separate role, managing one store. Signup, confirmation/resend, password/magic-link login, recovery, password changes and profile editing retain safe return destinations. Particular signup asks for identity first; WhatsApp/city are required when publishing. Peruvian nine-digit mobile numbers normalize to country code 51.

A visitor can save up to 100 favorites on the device. Signing in merges them into the account. Account favorites retain clear unavailable/sold history, notes and revocable share links. Buyers can follow stores and brands; the weekly digest is opt-in.

Saved-search alerts preserve supported text and filters, including multiple cities/conditions. Users rename, pause, resume, delete and change frequency; daily is offered first. New alerts do not notify for old inventory, a restore does not create a new-listing match, and pause periods do not backfill. Price-drop alerts require at least 5%, at most once a day per listing. The public “Antes” badge has its own genuine-history rule: a qualifying drop from a price held at least seven days, shown for up to 30 days, cleared on increases. Restock and reservation-release watches end after the relevant news.

The account notification center is private, paginated and supports mark-all-read. Optional email types have preferences and signed unsubscribe controls; authentication and transactional messages remain distinct. Push is opt-in per device, groups unread notices, suppresses stale/read ones, respects 22:00–08:00 Lima quiet hours and stops on logout. iPhone push needs the installed web app.

## Publishing and account work — main

The sell form has Fotos, Qué es, Estado y precio, Revisar y publicar. It requires an account, rules acceptance and 2–10 photos. Browser image preparation removes metadata, reduces size and handles HEIC; upload runs in the background. Instrument-specific guidance, brand suggestions, advisory text checks and the preview help the seller finish. A sound clip is optional and tap-to-play. Android's installed share target can open publication with photos; it is not general offline publication.

Device drafts and account drafts preserve work; an account holds at most 20. Mis publicaciones supports status counts, search, sorting, price edits, bulk hide/restore, private previews and new drafts from duplicate/republicar. Approved price, description, location and detailed attributes apply immediately; title/category/type/brand/model/condition/photos require one amendable, versioned revision for Particular and normal stores while the live version stays public. Verified-store valid edits can apply directly.

Pendientes brings confirmations, review deadlines, moderation reasons, drafts, alerts and availability questions to the account home. Estadísticas holds actual aggregates. Vacation mode leaves listings public with the return date and pauses contact. A Particular can mark a listing reserved for 1/2/3/5 days; it stays public and contactable, offers a release watch, then follows the seller-response/release rules. “Hacer una oferta” only composes a WhatsApp amount; main stores no negotiated offer.

## Stores, inventory and imports — main; gated

Stores apply with unique RUC, razón social, contact and location. Basic approval makes the page public; manual business verification separately permits direct publication. Changing an unsold store listing's contact follows the store's current number. Street address is private unless the store opts to show it.

The default cupo is 50 pending/approved publications, with reasoned Admin overrides from 1 to 2,000. SKU rows do not consume publication slots. A lowered allowance hides nothing; new counted publications/restores fail gracefully. Paid plans remain off.

Admin enables Inventario per store. Each SKU has merchant identity, pricing, stock, thresholds, optional catalog linkage and append-only stock history. Changes are serialized and retry-safe; corrections are linked entries. A SKU can control one listing: zero stock shows Agotado, removes normal public discovery, keeps the URL and moves it last on the storefront. Restocking restores availability without repeating old new-listing alerts. A controlled listing cannot use the ordinary sold action while linked.

Inventory includes search, filters, saved views, bulk operations, exports, reorder support, variants, price campaigns and Mostrador by camera, scanner or typing. Counter sales may queue offline and synchronize safely; that does not make the rest of Laria an offline app. Purchase-request follow-up is operational bookkeeping, not proof of payment.

CSV/XLSX import is preview-and-confirm, with bounded files/rows, remembered mapping, cell corrections, row exclusions, downloadable results, photo/ZIP assignment and optional bulk publication. Blank fields preserve values, absent SKUs are untouched, formulas never execute, and concurrent sales cause conflicts rather than overwritten stock. Files stay private with retention/cleanup. Publication reuses the same validation, moderation, photos and allowance as the ordinary form.

## Assisted commerce — main; gated

Verified stores may declare cash on pickup, Yape/Plin, POS or a payment link the store sends itself. Each method is reviewed; holder details stay private. Business-identity changes send approved methods back to review, and loss of verification suppresses public methods.

Both `LARIA_ASSISTED_COMMERCE=1` and the database pilot switch are required, after legal review. Eligible listings use Solicitar compra with quantity capped by availability and 10, then open WhatsApp. No payment is processed, no checkout order or paid state is created, no provider payment link is shown on Laria, and the inquiry reserves no stock. A recorded merchant sale changes stock separately.

## Confirmed transactions, reviews and moderation — main

For listing sales, seller-selected buyers must have an authenticated exact-listing WhatsApp contact no later than the sold timestamp. External/no-account sales remain sold without verified reviews. The buyer can also initiate a purchase check after contact; verification still requires the seller's confirmation. Neither path exposes a user directory. Managed stock listings use their inventory flow.

Confirmed transactions allow one immutable 1–5-star review per side in a database-owned ten-day window. Reviews reveal together when both submit or after the window ends, subject to moderation holds; review counts must not inflate reputation through repeated buyers. The buyer's seller review belongs to the Particular or store. Admin may hide/restore abusive content, never rewrite it.

The moderation hub manages listing/store states, revisions, users, reports, reviews, transactions and one-time explicit legacy ownership linking. Reasons and audit records preserve privileged decisions. Closing a report is separate from acting on its target. Raw reports, contact identity and operational data remain private. Admin authority is verified on the server and in privileged SQL; current main includes stronger MFA, account anonymization, security headers, rate limiting, restricted public columns, retention and operational error/audit tools.

## PR #54 — listing and selling tools

These are built on the draft branch and require its unreleased schema.

- **Condition:** Nuevo, Exhibición o caja abierta (stores only), Como nuevo, Excelente, Muy bueno, Bueno, Regular, Para reparar. Legacy values normalize across existing records, URLs, alerts and imports.
- **Seller terms:** optional fixed/conversable price, pickup area, try-before-buy, Lima/province delivery and trade categories. Terms come from the seller. Fixed-price and reserved listings suppress Hacer una oferta.
- **Combos:** a device-only per-seller bundle, published-price total, declared bundle discount and one WhatsApp message. No checkout; unavailable inventory and the assisted-purchase pilot follow their exclusions.
- **Map:** list/map switch backed by OpenFreeMap. Opted-in stores place a pin; other results use approximate areas, and Particulars never expose a precise address. Accessible list fallback and external directions links; newest 300 results.
- **Mi equipo:** a Particular's private gear, serials, purchase/warranty notes and confirmed purchases, with Vender esto. No estimated market value.
- **Store offers/part payment:** opt-in verified stores receive a Particular's request; only the chosen store gets their WhatsApp. Estimates, inspection and payment stay outside Laria.
- **Consignment:** store-owned publication identifies the arrangement; the instrument owner follows performance and sale status. The parties agree any commission; Laria charges none.
- **Price tools:** floor-bound 5%/10% automatic steps every 7/14 days, plus expiring private prices for current favorites, at most once per listing per week. Private prices do not change the public price.
- **Maintenance reminders:** opt-in strings/reeds/drumheads reminders with an easy stop; they do not estimate gear value or predict purchases.

## PR #54 — trust, accounts and safety

- **Seller pages and levels:** hideable, noindex Particular profiles with limited identity and real inventory/reputation. Destacado criteria include five distinct confirmed buyers, three visible reviews averaging 4.5, report history and unanswered-question limits. Nobody pays for the level.
- **Buyer history:** an opt-in, revocable limited card and optional WhatsApp line; no purchase list, contact information or seller-review comments become public.
- **Provenance:** an owner may link a resale to their earlier listing-based verified purchase; previous-owner identity stays private.
- **Counter purchase QR:** one-use code expires after 24 hours; a signed-in customer's confirmation creates store reputation eligibility without a prior WhatsApp event. Stock movement alone still creates none. Own-store claims and repeat abuse are constrained.
- **Review photos:** up to three buyer photos, public only after Admin approval and review visibility.
- **Safer meetups:** opted-in active verified stores, city meeting-place suggestions, a share-to-someone message and checklists. No guarantee of safety; local place checks remain a launch task.
- **Account controls:** remembered sessions/second-factor level, authenticator codes and recovery, session revocation, new-device email, secure email change and own-data JSON export. Particular deletion anonymizes while preserving shared transaction/review history; Admin/store closure uses the team.
- **Two-step enforcement (pilot decision, 2026-10-30):** Admin only. Store owners, Particulars and service providers have no enrollment control or prompt, even with approved payment methods. Admin's incomplete sessions are rejected by PostgREST, Storage and service-role routes; recovery revokes all sessions. Wider enforcement is deferred until paying users and a new owner-approved release. Anonymous browsing remains allowed.
- **OAuth/help:** Google/Apple behind provider flags, help articles/search and a small question inbox. Google setup is recorded; Apple is deferred. Support contact appears only with configured number/hours.
- **Stolen gear/copied photos:** private serial/report and perceptual-photo matches create Admin leads, never automatic public accusations or rejection. Price-anomaly detection waits for market-price data.

## PR #54 — store floor and reach

Stores gain merchant-stated warranty/exchange terms, estimated Por llegar dates, stock-linked arrival alerts, printable labels/posters and try-out requests. Try-outs require confirmation, reminders and bounded retention; they reserve time, not units. Interest-free installment offers require reviewed card methods and both assisted-commerce gates; interest-bearing offers are excluded.

Sedes split stock across up to 20 active locations, support transfers/counts and preserve the selected counter location through offline sync. Buyers can see available location names and choose a pickup sentence; per-location quantities remain private. One map pin per store remains the current limit.

**Comprobantes is deferred/off:** code connects a verified store's own Nubefact account for boletas/facturas after a counter sale. The activation key was removed at the owner's request. It needs new configuration and a demo-provider test before use. Laria does not issue the store's tax receipt; online invoices, credit notes and shipping documents are outside this build.

Mercado Libre import reads selected active publications into the normal review/import flow, up to 100; credentials are incomplete. Social feeds are store opt-in. Google Shopping activation remains off and its marketplace/checkout eligibility is unresolved by a feed alone.

Dealer authorization is document-reviewed and scoped to new instruments of that brand. Campaigns use genuine recorded 30-day price history, explicit end-price choice and no countdowns. The monthly demand report shows aggregated searches/alerts with a minimum five people and visible limitations, never a recommendation to stock an item.

## PR #54 — discovery and services

Andinos y tradicionales is the eleventh category; cajón stays in Percusión. Fabricante/Taller pages, made-to-order terms and handmade marks are merchant declarations. Artist verification concerns identity; the gear-use story remains the artist's statement. Gift pages, nine buying guides/checklists and dated filter-based collections use actual inventory.

`/servicios` separates lessons, repairs/lutherie, rehearsal rooms, recording studios and event sound. Particulars/stores can offer one service per kind with their own profile, pricing unit, place, photos and contact. Services have separate moderation, reports, views/contact aggregates and confirmed-client reviews. They never enter the instrument catalog, item favorites/alerts or publication allowance.

Service confirmation requires a recent authenticated contact and the other party's agreement; one client review is allowed within 30 days after confirmation. This is a separate workflow from two-way ten-day instrument reviews. A service with confirmed clients/reviews may be paused, not deleted to erase history. Laria does not schedule or guarantee the work.

## Reliability, SEO and operational limits

Public pages use bounded reads, responsive images, computed photo counts, stable 24-item pages, isolated optional sections and refreshable cached public data. Ownership, publication, uploads, stock and retries use authoritative database checks; service secrets remain server-only. Analytics use actual visible impressions, canonical contacts/search receipts and trusted lifecycle transitions; no WhatsApp message content or invasive fingerprinting.

Category/listing/store metadata, structured data, robots and sitemaps use the canonical site origin. Sold, private/account/Admin, comparison, Descubrir and preview surfaces follow their indexing exclusions. Empty-category behavior and legacy redirects are covered by release evidence, not replaced by invented SEO content. Terms, Privacy, prohibited-item rules, safety guidance and Libro de Reclamaciones have their own legal/operational requirements.

Vercel Pro schedules on current main replace the original manual Hobby-worker assumption. PR #54 adds feature jobs and database cron work; deployments must verify actual execution, not just configuration. Application updates do not apply Supabase migrations.

The two AI helpers on main remain off without `LARIA_AI_HELPERS=1` and the server provider key. Pregúntale a tu tienda translates a question into existing store views without sending store records; Completar con IA offers individually accepted photo-based suggestions. Neither invents condition/price/specifications nor changes moderation or replaces catalog autofill/Jev. Per-account/store and site caps apply.

## Deferred work and verification

Protected payments, shipping booked by Laria, staff accounts, monetization, auctions, rentals, video and the other explicitly later ideas stay deferred. Catalog-dependent market prices, price guides, compatibility, Mi equipo valuations and price-based flags are not delivered by PR #54. The separate feature-ideas maybes remain undecided/deferred; the five Effortless maybes already on main must not be confused with them.

Use the checks and local database/browser harnesses in [verification](documentation-status.md#verification), then the area-specific sources. This refresh does not rerun application, SQL, provider or production acceptance; it changes no runtime code, canonical acceptance cases or XLSX. The dated sprint/release files retain historical evidence, while this file replaces their stale implementation summaries.
