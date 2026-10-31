# Feature ideas: build plan

Henri marked the feature-ideas page on 2026-10-26: 60 Yes, 7 Maybe, 0 No. On the same day he said: "begin on implementation now (separate branch), use higher effort threads when necessary. keep track of the deferred features for later."

This plan splits the approved ideas into batches. Each batch runs in its own build thread. The integrator merges the batches into `features/marketplace`.

- **What each idea says** (what, why, sources, cost, effort, flags): `docs/feature-ideas/ideas.json`
- **Henri's marks and notes:** `docs/feature-ideas/verdicts.json`. Copies of both files are in `/mnt/project-files/feature-ideas/`.
- **The marking page,** with the research, the lessons from other marketplaces and the guardrails: https://claude.ai/artifact/7iWMJuxxKLaxsdibsWEZQd
- **Deferred ideas:** `docs/feature-ideas/deferred.md`, the single list of what waits and why.
- **Integrator:** the thread "Build the approved feature ideas", thread id `cmsg_01Bo1BYzRsGE34WoaxArAipP5V3JMKR79m4GFsmrKRiA1D`. Report to it with `message_thread`.

## What gets built

**Wave 1** starts now, with 41 ideas in eight batches (table below).

**Wave 2** starts once its wave-1 dependency is merged:
- buy-09: Henri's note says "next wave". It ships as store-floor's second PR.
- run-02 and run-03: the store-locations batch. It starts after store-floor merges because both batches change stock.

**Waiting for the catalog.** These are approved, but they need typical prices or catalog matching. That work must reach main first, and it must never be copied from `proto/catalog-autofill-jev-bvvvxm`.
- reach-07 (your price against the market)
- disc-01 (price guide pages)
- disc-08 (fits your gear)
- The estimated value in sell-01. Mi equipo itself is built now.
- The price rule in safe-05. The photo-copy rule is built now.

**Deferred:** 13 Yes ideas marked "later" and the 7 Maybes. See `deferred.md`. None of them is built in this program.

## Henri's notes (verbatim; they are requirements)

| Idea | Note |
| --- | --- |
| safe-08 Two-step sign-in for stores | "yes but i dont want the seller to be inputting their token everytime they open their account. the 'keep me logged in' option must work 100%;" |
| buy-08 Results on a map | "i want this. there are def free map tile providers. we dont need laria to give directions, a simple link to google maps or waze would suffice." |
| buy-09 Installments | "next wave" |
| reach-06 What buyers are looking for | "incredible, market IQ reports for sellers is perhaps the best idea yet. we should be very strict and clear here though. dont suggest stores to just stock up on the most searched items, we have to explain the limitations of our recommendation model and stats." |
| disc-04 Made in Peru | "perhaps we should have some features for stores who are direct manufacturers. this would work wonders for traditional peruvian instruments like quenas or tinyas. right now there is no dedicated category for those (there should be)" |
| bet-02 Lessons, repairs and studios | "love this. we shouldnt mix service listings with items though." |
| earn-01, earn-02 (deferred) | "later. no charging in the pilot yet." / "later. no charging yet." Nothing in this program charges anyone. |
| safe-01 (deferred, Maybe) | "next wave. im thinking of charging perticular sellers a fee when the item is over 500 or 1000 soles. not defined yet." |

How the notes become requirements:
- **safe-08.**
  - A store owner enters a code only on a new device, or after signing out.
  - "Mantener sesión iniciada" keeps the session, its second-factor level included, for at least 30 days on that device.
  - A trusted device can be revoked from Seguridad.
  - Test it: sign in, close the browser, reopen it, and no code is asked for.
- **buy-08.** Use MapLibre GL with OpenFreeMap tiles: no key, no cost, attribution shown. Laria gives no directions. A store pin offers "Abrir en Google Maps" and "Abrir en Waze" links. Particulares show only an approximate area.
- **reach-06.**
  - The report shows counts, never advice. There is no "stock up on X" and no ranking framed as a recommendation.
  - Every figure says what it counts, over which period, and its minimum threshold (5).
  - A plain "Qué no te dice este reporte" box sits next to the data: searches are not sales, small samples, Lima-heavy data, alerts can be duplicated, there is no price or margin data, and no model predicts demand.
- **disc-04.**
  - Add a store attribute for direct manufacturers ("Fabricante" / "Taller"), with a maker profile and the "Hecho a mano en <ciudad>" mark.
  - Listings can be made to order.
  - Add a new eleventh category for traditional Peruvian and Andean instruments. Quena, zampoña or siku, charango, tinya and bombo andino are examples. Cajón stays in Percusión, and the new category's landing page links to it. Write down the list of types you pick.
- **bet-02.** Services are a separate section, with separate tables and pages. They never show up in instrument search, listing counts, alerts or favorites of items.

## Rules for every build thread

1. **Repository and branches.**
   - Use `hpcamayo/mkt_instrumentos` (attach it with `add_repo`).
   - Your base is `features/marketplace`, cut from `main` at cbc4fcb.
   - Work on `features/<batch>` and open a draft PR against `features/marketplace`.
   - Never target `main`, never merge yourself, and never touch `proto/catalog-autofill-jev-bvvvxm`.
   - Merge `features/marketplace` into your branch before you ask for the final merge.
2. **Read first.**
   - Read `AGENTS.md`, `docs/functional-spec.md`, `docs/design-system.md`, `docs/decisions.md`, `docs/ux-redesign/decisions.md` and `docs/database.md`.
   - For store work, also read `docs/store-operations/design.md`.
   - Then read each of your ideas in `ideas.json`, and Henri's notes above.
   - Henri's Yes on an idea is his explicit product decision to change V1 where the idea says so. Every other owner decision stays binding.
3. **Scope.**
   - Build what each idea's "what" says, plus Henri's notes.
   - Where a detail forks, pick the reasonable default, write it down and keep going. Don't ask Henri anything mid-way.
   - If part of an idea turns out to be unsafe, illegal or not doable, build the safe part and record the rest in your write-up, with the reason.
4. **Guardrails, from the page.**
   - No invented urgency, countdowns, fake scarcity or fake social proof.
   - No endless feeds or autoplay.
   - No pre-ticked choices or confirmshaming.
   - Personalization says why, and it can be reset.
   - Notifications only for real news, with digests by default and a one-tap stop.
   - Leaving is as easy as joining.
   - Laria never charges anyone, never handles money, and never implies that it holds payments, verifies instruments or guarantees a deal. Promises about warranty, condition or provenance are the seller's or the store's, and the copy says so.
   - All UI copy in Spanish, mobile first, using the design-system tokens and components. `tests/ux-copy.test.cjs` and `tests/ux-contrast.test.cjs` must pass.
   - Accessibility: every gesture has a button, targets are at least 24 px, and nothing depends on color alone.
5. **Launch-audit changes are landing on main at the same time** (thread "Audit the live build end to end"). Build on them; don't duplicate them.
   - Migration `20261112120000` removes direct INSERT on `stores` and `listings` for anon and authenticated users. Create rows only through the definer functions.
   - Storage read policies on `listing-photos` and `store-assets` become owner-folder only.
   - `lib/same-origin.ts`: middleware refuses cross-site non-GET requests to every `/api` route except `/api/internal/`, `/api/email/unsubscribe` and `/api/csp-report`. A webhook that a provider calls must be added to `CROSS_SITE_API_PATHS`.
   - The CSP is built in `lib/security-headers.ts`. Add new hosts there, for example `tiles.openfreemap.org` for the map.
   - Admin second factor (A15) and account anonymising (A20) arrive in a later audit PR. accounts builds safe-08 and safe-09 on top of them.
   - The integrator merges `main` into `features/marketplace` as these land and tells every thread.
6. **Files.**
   - Edit the files your batch owns (table below) freely.
   - Shared registries take small, additive edits in their own clearly marked block. They are e-mail templates, notification and event types, account and admin navigation, `docs/database.md`, `docs/functional-spec.md` and `lib/security-headers.ts`.
   - A file another batch owns takes only the smallest edit your idea needs, usually a one-line import of your own component. Name that edit in your PR.
7. **Database.**
   - Each batch has its own migration date slot. Name files `<slot>HHMMSS_feat_<topic>.sql` and keep them readable.
   - Use `add value if not exists` for enum changes.
   - Respect the store-operations lock order (idempotency key, then listing, then item).
   - Never apply anything to a hosted database.
   - **Redefined functions.** A `create or replace` of an existing function silently drops whatever an earlier migration added to it, and git shows no conflict.
     - If your migration redefines a function, put that function alone in its own small migration and name it in your PR.
     - The batch with the later slot rebuilds it from the merged branch, so its version carries both changes.
     - Known shared functions:
       - `laria_private.normalize_saved_search` and `laria_private.listing_matches_saved_search`: owned by listing-details. store-floor adds `with_warranty`.
       - `catalog_facets`: owned by listing-details.
       - The submission and update functions: `complete_public_submission`, `update_owned_listing`.
     - The integrator diffs every redefined function at each merge.
   - Test with the Docker-free Postgres in `/mnt/project-files/store-operations/local-db-setup/` (`setup`, `reset`, `test`). Add SQL suites under `tests/` for every new rule and RLS policy.
8. **Scheduled work.**
   - Vercel Hobby runs cron at most daily. Put each job behind `app/api/internal/jobs/<name>/route.ts`, protected by `CRON_SECRET` the way the existing internal routes are.
   - Make each job idempotent and safe to run more than once a day.
   - Don't edit Vercel settings. The integrator collects the schedules for Henri.
9. **Outside services.**
   - Code that needs credentials Henri doesn't have yet stays off until they are set, and it fails closed: Google and Apple sign-in, the Mercado Libre app, Nubefact, Laria's WhatsApp support number.
   - Read the credentials from environment variables, list them in your write-up, and never call a real outside service from tests.
10. **Checks before each PR.**
   - Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and every SQL suite on the local database.
   - For anything a person sees, take browser screenshots at 390 px and 1366 px wide on the Docker-free prototype. Follow `scripts/prototype/README.md`, use Chromium at `/opt/pw-browsers/chromium`, and run the a11y scripts there.
   - Put the screenshots in `/mnt/project-files/feature-ideas/screens/<batch>/`.
11. **Docs.**
    - Change the `docs/functional-spec.md` sections your ideas change.
    - Record each product decision as a proposed entry, numbered `FD-<batch>-<n>`, in your write-up `docs/feature-ideas/<batch>.md`.
    - The write-up covers, per idea: what changed, files, how to test, defaults picked, known limitations, and any copy that needs legal review.
12. **Acceptance.**
    - Propose cases in `docs/feature-ideas/<batch>-acceptance.tsv`, with the same columns as `acceptance/cases.tsv`, IDs `GROW-nnn` from your range, and status Not Run.
    - Don't edit `acceptance/cases.tsv`. Henri approves new IDs at the review.
13. **Production stays closed.** No merge to main, no deploy, no hosted database, no real e-mail or WhatsApp sent, nothing charged.
14. **Reporting.**
    - After opening your PR, subscribe to it and keep it green.
    - Send the integrator one message when the PR is ready. Include the link, the checks you ran, the environment variables and schedules you need, and anything another batch must know.
    - Ask the integrator about ownership or overlaps.
15. **PR description.** Before, After and How paragraphs, then the changed areas, how to test, and the limitations.

## Batches (wave 1)

| Batch | Thread effort | Ideas | Owns | Migration slot | GROW range |
| --- | --- | --- | --- | --- | --- |
| accounts | xhigh | safe-08, safe-09, buy-11, safe-10, safe-02, safe-05 (photo copies only) | `app/login`, `app/registro` (not `registro/tienda`), `app/auth`, `app/api/auth/*`, `app/mi-cuenta/{seguridad,perfil}`, `login-form.tsx`, `seller-signup-form.tsx`, `password-form.tsx`, `profile-edit-form.tsx`, `lib/auth/*`, new `app/ayuda/*`, new `app/reportar-robo/*`, new Admin sections for help tickets, stolen-gear matches and red flags, the image fingerprint step in `app/api/listing-images` | 20261201 | 001-099 |
| listing-details | xhigh | sell-10, sell-07, sell-06, buy-02, buy-01, buy-08 | the sell form (`sell-listing-form.tsx`, `components/selling/*`, `lib/sell-form.ts`, `lib/listing-submission.ts`, `lib/public-submission.ts`), `listing-edit-form.tsx`, the listing page (`app/instrumentos/[slug]/*`, `components/listing/*`, `lib/listing-page.ts`, `lib/listing-specs.ts`), `listing-card.tsx`, the filters and search (`listing-filters.tsx`, `filter-sheet.tsx`, `catalog-filter-forms.tsx`, `catalog-view.tsx`, `lib/instrument-filters.ts`, `lib/catalog-filters.ts`, `lib/catalog-query.ts`, `lib/catalog-facets.ts`, search SQL), `lib/listings.ts` except categories, alert matching for new filters in `lib/search-alerts.ts`, new `components/map/*` | 20261202 | 100-199 |
| deal-trust | xhigh | safe-03, safe-06, safe-07, safe-11, sell-08, sell-09, reach-11 | transactions and reviews (`lib/transactions.ts`, `components/transactions/*`, `transaction-center.tsx`, `transaction-detail.tsx`, `purchase-checkin.tsx`, `app/mi-cuenta/transacciones/*`, `app/api/listing-reviews/*`), `lib/contact-message.ts`, `whatsapp-contact-link.tsx`, `lib/seller-contact.ts`, `app/consejos-de-seguridad/*`, new `app/vendedores/[slug]/*`, the store "Punto seguro" opt-in, the sale QR in `app/mi-cuenta/tienda/inventario/mostrador` | 20261203 | 200-299 |
| selling-tools | xhigh | sell-01 (without values), sell-02, sell-03, sell-04, sell-05, buy-06, run-04 | new `app/mi-cuenta/equipo/*`, `app/mi-cuenta/publicaciones/*` except the edit form, `listing-management-table.tsx`, `lib/my-listings.ts`, new store inbox `app/mi-cuenta/tienda/ofertas/*`, new `components/gear/*` and `components/offers/*`, the jobs for price steps and reminders | 20261204 | 300-399 |
| store-reach | xhigh | reach-01, reach-02, reach-04, reach-05, reach-06 | `lib/store-import/*` (a new Mercado Libre source), new `app/api/feeds/*`, new `app/mi-cuenta/tienda/{demanda,campanas,distribuidor,catalogo-redes}`, new `app/campanas/*`, new Admin sections for campaigns and dealer checks, the monthly demand job | 20261205 | 400-499 |
| store-floor | xhigh | reach-08, reach-09, reach-10, buy-07; then buy-09 as a second PR | `app/mi-cuenta/tienda/page.tsx` and the store settings form, `app/mi-cuenta/tienda/inventario/*` except `importar` and the Mostrador QR, `components/inventory/*`, `lib/store-inventory.ts`, `lib/inventory-*.ts`, `lib/payment-methods.ts`, `components/payment/*`, `app/mi-cuenta/tienda/{medios-de-pago,pagos,solicitudes}`, new `app/mi-cuenta/tienda/{citas,etiquetas}` | 20261206 | 500-599 |
| discovery | project default | buy-05, disc-02, disc-03, disc-04 (with the new category and maker stores), disc-05 | `app/page.tsx` and `components/home/*`, categories everywhere (`lib/category-nav.ts`, `lib/category-pages.ts`, the category lists in `lib/listings.ts`, `lib/site.ts`, `lib/seo.ts`, category SQL checks and import mappings), new `app/{regalos,guias,colecciones,hecho-en-peru,artistas}/*`, new Admin sections for collections, makers and artists | 20261207 | 600-699 |
| services | xhigh | bet-02 | new `app/servicios/*`, new `app/mi-cuenta/servicios/*`, new `components/services/*`, new `lib/services*.ts`, its own tables, RLS, moderation queue and reviews, the services line on `app/articulos-prohibidos` | 20261208 | 700-799 |

Wave 2:

| Batch | Thread effort | Ideas | Starts when | Migration slot | GROW range |
| --- | --- | --- | --- | --- | --- |
| store-locations | xhigh | run-02 (several locations), run-03 (boleta from the counter, through the store's own Nubefact account) | store-floor's wave-1 PR is merged | 20261209 | 800-899 |

The integrator uses slot 20261210 and GROW 900-999.

### Known overlaps, settled here

- **Listing fields owned by other batches.** Every listing-level field belongs to the batch whose idea needs it, in that batch's migration:
  - Made to order: discovery.
  - Accepts part payment: selling-tools.
  - Warranty and returns, and Por llegar: store-floor.
  - Delivery, trades, price mode and conditions: listing-details.

  The owner of the data builds the input as its own component. listing-details places it in the sell form, the edit form and the listing page with a one-line import. Until listing-details is merged, add the import yourself and name it in your PR.
- **Filters.** listing-details owns the filter framework and adds "Envía a provincia", "Se puede probar" and "Acepta cambios". store-floor adds "Con garantía" and, in wave 2, "Acepta cuotas" as additive entries. Every new filter works in saved alerts too.
- **Conditions (sell-10).** listing-details maps the old values across listings, saved alerts, URLs, store imports, inventory, exports and SEO. "Exhibición o caja abierta" is for stores only.
- **The new category (disc-04).** discovery adds it everywhere: lists, navigation, filters, SQL checks, import mappings and SEO.
- **WhatsApp messages.** deal-trust owns `lib/contact-message.ts`, where it adds the buyer track record line and "Avisar a alguien". listing-details adds the combo message and the "Te propongo un cambio" chip as separate exports in that file.
- **Mi equipo.** selling-tools owns the gear table, including a private `serial` column. accounts' stolen-gear matching reads serials from listings, inventory SKUs and Mi equipo. buy-06 and run-04 (both selling-tools) build on it.
- **Mi tienda.** store-floor owns the page and the store settings form. These batches add their cards or links in a marked block:
  - deal-trust: Punto seguro opt-in.
  - selling-tools: "Compramos usados" and consignment opt-ins, and the offers inbox.
  - store-reach: Mercado Libre import, feeds, dealer authorizations, campaigns, demand report.
  - discovery: Fabricante or Taller.
- **Store hours** for buy-07 come from the store profile if they exist. If they don't, store-floor adds them.
- **Admin.** Each batch adds its queue as a new section, through the Admin navigation registry.
- **Seller level (sell-08)** shows on the new seller page, on store pages and next to the seller on listings. deal-trust owns the mark component.
- **Checklists.** discovery writes the try-out checklists (disc-02). deal-trust's safe meetup sheet links to them.
- **Saved-search and facet functions.** listing-details merges first and owns them. store-floor then merges `features/marketplace` into its branch and rebuilds those three functions with its `with_warranty` key and an `ok_warranty` facet flag added, so nothing is lost.
- **QR and barcodes.** store-floor writes a dependency-free QR and Code 128 encoder in `lib/labels/`. deal-trust's Mostrador sale QR imports it instead of adding a library.
- **Branch names.** Some threads can only push to their own `claude/project-thread-*` branch. That's fine; the PR still targets `features/marketplace`.

## Integration (the integrator)

- Merge each batch PR into `features/marketplace` as it turns green.
- Merge `main` into it as the launch-audit PRs land.
- Re-run the full check suite after every merge.
- Move proposed decisions into `docs/decisions.md`, and collect the acceptance proposals and the environment variables and schedules Henri must set.
- Keep `deferred.md` current.
- When everything is merged, build the combined prototype with fresh demo data and screenshots. Then open a draft PR from `features/marketplace` into `main` for Henri's review.
- Production migrations and the deploy wait for his explicit words.
