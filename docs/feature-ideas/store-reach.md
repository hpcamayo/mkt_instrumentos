# Feature ideas: store-reach batch

Ideas reach-01 (Importar desde Mercado Libre), reach-02 (Catálogo para redes), reach-04 (Distribuidor oficial),
reach-05 (Campañas Laria) and reach-06 (Lo que buscan en Laria). All five were marked Yes by Henri on 2026-10-26, with
one note on reach-06: "we should be very strict and clear here though. dont suggest stores to just stock up on the most
searched items, we have to explain the limitations of our recommendation model and stats." Branch
`claude/project-thread-l047u4`, draft PR into `features/marketplace`.

Nothing here is applied to a hosted database, nothing is deployed, and no outside service is called in tests. Proposed
decisions are numbered FD-store-reach-n; acceptance proposals are in `store-reach-acceptance.tsv` (GROW-400 to
GROW-445, Not Run).

## Migrations (slot 20261205)

| File | What | Redefines |
| --- | --- | --- |
| `20261205120000_feat_store_reach_demand.sql` | reach-06: monthly report tables, builder, job, reader | none |
| `20261205130000_feat_store_reach_feeds.sql` | reach-02: the store's feed switch and the feed readers | none |
| `20261205140000_feat_store_reach_dealers.sql` | reach-04: authorizations, private bucket, Admin review | none |
| `20261205150000_feat_store_reach_campaigns.sql` | reach-05: price history, campaigns, entries, job | none |
| `20261205160000_feat_store_reach_mercadolibre.sql` | reach-01: encrypted connection, photo queue | none |

No shared function is redefined. Two text checks gain values through `laria_private.ux_extend_text_check` (notification
event types `store_dealer_*` and `store_campaign_entry_*`; audit target types `dealer_authorization`, `campaign` and
`campaign_entry`). `laria_private.reach_caller_store(p_active)` is the batch's own helper for "the caller's store".

Two pg_cron jobs: `demand-report-monthly` (`30 10 * * *`, daily; builds last month's report once) and `laria-campaigns`
(`*/10 * * * *`). Both also run from CRON_SECRET-protected routes, `/api/internal/jobs/demand-report` and
`/api/internal/jobs/campaigns`, and both are idempotent.

Every store page of the batch is reached from a new block on Mi tienda, "Más alcance para tu tienda", with five links.
The account menu is frozen (sprint-9 and store-ops-review-ux tests), so the batch adds no menu entry
(**FD-store-reach-1**).

## reach-06: Lo que buscan en Laria

**What changed.** Mi tienda → "Lo que buscan en Laria" (`/mi-cuenta/tienda/demanda`) shows, for last calendar month
(Lima time) and by city, how many distinct people searched for each brand, typed each search, filtered each category or
type, found nothing, or kept a search alert, next to how many active publications match and how many of them are the
store's. A month and a city can be picked; reports are kept 13 months.

Henri's note shapes the whole page:

- It is counts, never advice. The intro says "Son conteos, no recomendaciones: no dicen qué comprar ni qué se va a
  vender." No row is called "oportunidad", nothing is ranked as a suggestion, and tables are ordered only by number of
  people, as the page says.
- A box "Qué no te dice este reporte" sits above the tables, open, with six limits: a search is not a sale; small
  numbers move by chance; most data is from Lima (with the month's real split); one person can count twice (two
  devices, several alerts); no prices, margins or costs; no model predicts demand.
- Every table says exactly what it counts, its dates and its city, and "Solo filas con 5 o más".
- "Cómo se cuenta" explains the sources: catalog searches (page 1 views) counted once per account or signed-out
  session, store and Admin accounts left out; active alerts of Particular accounts.

**Privacy.** The report is stored aggregated: no row keeps an account, session or event id, and a check constraint keeps
every stored figure at 5 or more (`demand_report_threshold()`). Typed text is folded, limited to letters, digits and
model punctuation, and dropped when it looks like an e-mail, phone or document number. Totals under 5 show "menos de 5".

**Files.** `supabase/migrations/20261205120000_feat_store_reach_demand.sql`, `lib/demand-report.ts`,
`components/demand/demand-report.tsx`, `app/mi-cuenta/tienda/demanda/page.tsx`,
`app/api/internal/jobs/demand-report/route.ts`, `lib/store-reach-jobs.ts`, `tests/store-reach-demand.sql`,
`tests/store-reach-demand.test.cjs`.

- **FD-store-reach-2.** Floor of 5 distinct people for every figure, stored aggregated, 13 months kept.
- **FD-store-reach-3.** Active stores (and Admin) only; Particulares do not see it. Store and Admin searches are not
  counted.
- **FD-store-reach-4.** "Búsquedas sin resultados" counts only searches without price, condition, seller or attribute
  filters, so a narrowed search that found nothing is not read as missing supply.

## reach-02: Catálogo para redes

**What changed.** Mi tienda → "Catálogo para redes" (`/mi-cuenta/tienda/catalogo-redes`). The store turns on its feed
(off by default) and gets one address, `/api/feeds/tiendas/<slug>`, to paste once into Meta Commerce Manager as a
scheduled data feed (Instagram Shopping, Facebook and the WhatsApp Business catalog). The page explains the steps, what
goes in the feed (approved publications with a price and a photo; "out of stock" when stock is zero; sold or hidden ones
leave), that Meta reads it on its own schedule, and that Laria does not run ads or pay for publicity.

The feed is RSS 2.0 with Google's `g:` namespace. Price and stock come from the publication on every fetch (CDN cache of
one hour). A store's feed is a 404 while it is off or the store is not active.

Laria's own feed, `/api/feeds/laria`, is all public publications for Laria's Google Merchant Center account (Google only
takes items whose pages are on a domain the account owns). It answers only on the production deployment, and the page
says Laria sends the store's publications to Google only when `LARIA_GOOGLE_SHOPPING_ACTIVE=true` (before that, "Aún no
está activo"). `robots.ts` allows `/api/feeds/` so the platforms can read
it.

**Files.** `supabase/migrations/20261205130000_feat_store_reach_feeds.sql`, `lib/store-feed.ts`,
`lib/store-feed-settings.ts`, `components/store-reach/feed-settings.tsx`, `app/mi-cuenta/tienda/catalogo-redes/page.tsx`,
`app/api/store/feeds/route.ts`, `app/api/feeds/tiendas/[slug]/route.ts`, `app/api/feeds/laria/route.ts`, `app/robots.ts`,
`tests/store-reach-feeds.sql`, `tests/store-reach-feeds.test.cjs`.

- **FD-store-reach-5.** The store's feed is for Meta; Google is one Laria-wide feed under Laria's account, off until
  the account exists.
- **FD-store-reach-6.** Feeds are not served on previews, read only public data with the anonymous key, and stop at
  20,000 items.

## reach-04: Distribuidor oficial

**What changed.** Mi tienda → "Distribuidor oficial" (`/mi-cuenta/tienda/distribuidor`). An active store uploads the
brand's authorization (PDF, JPG, PNG or WebP, up to 5 MB, with an optional end date and note). The browser uploads to a
path the database issued in the private bucket `store-dealer-documents`; the server checks the bytes (magic numbers,
size) with the service role before the request reaches Admin. Admin → Distribuidores (`/admin/distribuidores`) opens the
document through a 60-second signed link and approves, rejects or revokes with a reason; each decision is audited and
notifies the owner in the app.

While approved and in force, the store's **new** publications of that brand show "Distribuidor oficial <marca>" with
"Qué revisó Laria": Laria checked a document from the brand or its representative, not each instrument or the warranty,
which is the store's and the manufacturer's. The store page lists its brands, and the catalog filtered by a brand names
the brand's dealers on Laria.

**Files.** `supabase/migrations/20261205140000_feat_store_reach_dealers.sql`, `lib/dealers.ts`, `lib/dealers-server.ts`,
`components/store-reach/dealer-requests.tsx`, `components/store-reach/dealer-marks.tsx`,
`components/store-reach/admin-dealer-review.tsx`, `app/mi-cuenta/tienda/distribuidor/page.tsx`,
`app/admin/distribuidores/page.tsx`, `app/api/store/dealers/route.ts`, `app/api/store/dealers/[id]/complete/route.ts`,
`app/api/admin/dealers/route.ts`, `app/api/admin/dealers/[id]/document/route.ts`, `tests/store-reach-dealers.sql`,
`tests/store-reach-dealers.test.cjs`.

- **FD-store-reach-7.** The mark shows on new instruments only ("Nuevo"); a used one is not covered by a dealer's
  warranty.
- **FD-store-reach-8.** One open request per brand and store; a document cannot be replaced, only withdrawn and sent
  again. Brands are matched folded (catalog_fold), with the catalog's usual spelling shown.
- **FD-store-reach-9.** An authorization past its end date stops showing the next day (Lima) without Admin action.

## reach-05: Campañas Laria

**What changed.** Admin → Campañas creates dated campaigns (at most 30 days, minimum discount 5 to 70 %, a public page
`/campanas/<slug>`). Stores see them at Mi tienda → Campañas Laria and add publications with a campaign price and an
explicit choice for when it ends ("Volver al precio anterior" or "Mantener el precio de campaña"; neither is
preselected). `/campanas` lists current and upcoming campaigns.

Laria checks the "Antes" itself:

- `listing_price_history` records every price from this migration on (one open row per publication).
- The reference is the lowest price of the 30 days before; the current price must be that lowest price (a price raised
  within the 30 days cannot be an "Antes"), and the campaign price must be the minimum discount below it.
- The publication must have been public, with its price recorded, for the whole 30 days. History starts at the
  migration, so no publication qualifies before 30 days have passed; Laria never guesses an older price.
- The check runs when the store applies and again when the entry goes live.

Laria sets the campaign price at the start and, when the store asked for it, restores the earlier price at the end. A
store that changes the price during the campaign takes the publication out of it (including a store-ops price campaign).
Pages show plain dates ("Del 24 al 31 de octubre de 2026"), never countdowns. The publication page shows "En <campaña>:
N % menos, hasta el …" with "Qué revisó Laria", and the campaign page uses the listing's own card with the checked
"Antes".

**Files.** `supabase/migrations/20261205150000_feat_store_reach_campaigns.sql`, `lib/campaigns.ts`,
`lib/campaigns-server.ts`, `components/store-reach/campaign-*.tsx`, `components/store-reach/listing-reach-marks.tsx`,
`app/campanas/page.tsx`, `app/campanas/[slug]/page.tsx`, `app/mi-cuenta/tienda/campanas/**`, `app/admin/campanas/**`,
`app/api/store/campaigns/route.ts`, `app/api/admin/campaigns/route.ts`, `app/api/internal/jobs/campaigns/route.ts`,
`lib/notifications.ts`, `tests/store-reach-campaigns.sql`, `tests/store-reach-campaigns.test.cjs`.

- **FD-store-reach-10.** Reference = lowest price of the 30 days before, and the current price must equal it.
- **FD-store-reach-11.** At most 30 days per campaign, so a card's "Antes" (list-05 shows drops of 30 days) holds
  throughout.
- **FD-store-reach-12.** The after-campaign choice is required, with no default.
- **FD-store-reach-13.** Any price change by the store ends its entry; the publication keeps the store's new price.
- **FD-store-reach-14.** Public marks are cached for 10 minutes and shown only while the publication's price still
  equals the campaign price.
- **FD-store-reach-15.** Only Admin creates campaigns. "Cyber Wow" is a trademark of IAB Perú; the Admin page warns not
  to use it without legal review.

## reach-01: Importar desde Mercado Libre

**What changed.** Mi tienda → "Importar desde Mercado Libre" (`/mi-cuenta/tienda/mercado-libre`). The store connects
its account through Mercado Libre's OAuth (authorization code with PKCE S256, a signed state cookie for 10 minutes),
then sees its active publications 50 at a time, picks up to 100 (nothing preselected) and presses "Importar". Laria
builds an ordinary inventory import from them and opens the existing wizard: mapping, review, then publishing under
the usual moderation and allowance. In the wizard's photo step, "Copiar fotos de Mercado Libre" copies the photos (up
to 10 per row) from Mercado Libre's image hosts through the import's own photo check.

The page says first what Laria does with the account: it reads active publications only when asked, never publishes,
changes or pauses anything on Mercado Libre, and the store can disconnect at any time (and should also remove Laria
from its connected apps there).

**Mapping.** One row per variation. SKU: the store's own code when valid and unique, else the publication code. Price in
whole soles; a USD price is left empty. Condition "Nuevo" only; a used one is left empty for the store to pick on the
scale. Category guessed from Mercado Libre's category path, or left empty. Photos only from `*.mlstatic.com` over HTTPS.

**Security.** Tokens are encrypted with AES-256-GCM (`MERCADOLIBRE_TOKEN_KEY`, the store id as associated data) and only
service-role functions read them, for the owner the route checked. Refresh tokens are single use, so the update is a
compare-and-swap. Every call has a deadline and a size cap and refuses redirects. Without `MERCADOLIBRE_CLIENT_ID`,
`MERCADOLIBRE_CLIENT_SECRET` and `MERCADOLIBRE_TOKEN_KEY` the routes answer 503 and the page links to the Excel import.

**Files.** `supabase/migrations/20261205160000_feat_store_reach_mercadolibre.sql`, `lib/mercadolibre/*.ts`,
`components/store-reach/mercadolibre-picker.tsx`, `components/store-reach/mercadolibre-photos.tsx`,
`app/mi-cuenta/tienda/mercado-libre/page.tsx`, `app/api/store/mercado-libre/{connect,callback,disconnect,items,import,photos}/route.ts`,
`components/store-import/import-photos.tsx` (one marked line), `tests/store-reach-mercadolibre.sql`,
`tests/store-reach-mercadolibre.test.cjs`.

- **FD-store-reach-16.** Up to 100 publications per import, picked by hand.
- **FD-store-reach-17.** USD prices and used conditions are left empty for the store to fill in the review; prices are
  rounded to whole soles.
- **FD-store-reach-18.** Photos are copied when the store presses the button in the wizard, not in the background.
- **FD-store-reach-19.** Disconnecting deletes the tokens in Laria; the store removes the app in Mercado Libre itself.

## Changes to other batches' and shared files

Each is one import and a marked line:

- `app/instrumentos/[slug]/page.tsx`: `ListingReachMarks` (dealer and campaign marks) for unsold listings.
- `app/tiendas/[slug]/page.tsx`: `StoreDealerBrandsSlot`, after discovery's section.
- `components/catalog-view.tsx`: `BrandDealersSlot` when the catalog is filtered by brand.
- `app/mi-cuenta/tienda/page.tsx`: `StoreReachLinks`, after discovery's link.
- `components/store-import/import-photos.tsx`: `MercadoLibrePhotos` after the intro; renders nothing for other imports.
- `components/admin-navigation.tsx`: Distribuidores and Campañas.
- `lib/notifications.ts`: five labels and their link.
- `app/robots.ts`: `allow: ["/", "/api/feeds/"]`.

## Overlaps for other batches

- **Launch audit.** The Mercado Libre callback is a top-level GET redirect; add `/api/store/mercado-libre/callback` to
  `CROSS_SITE_API_PATHS` when `lib/same-origin.ts` lands. `/api/feeds/` must stay reachable by crawlers (no auth, no
  firewall rule on it). The ML page shows no ML images, so the CSP needs no change.
- **Store operations.** A price change through stock-15 price campaigns ends a Laria campaign entry, as any price change.
- **list-05 price drops.** The campaign page passes its own checked reference as the card's "Antes".
- **listing-details.** Fixtures use the condition scale ('Nuevo'); the ML import fills only "Nuevo".

## Environment and schedules

| Variable | Use | Without it |
| --- | --- | --- |
| `CRON_SECRET` | The two job routes | Routes answer 401; pg_cron still runs the jobs |
| `LARIA_GOOGLE_SHOPPING_ACTIVE` | `true` once Laria's Merchant Center reads `/api/feeds/laria` | The page says Google is not active yet |
| `MERCADOLIBRE_CLIENT_ID` | Laria's Mercado Libre app (digits) | Import off, page says so |
| `MERCADOLIBRE_CLIENT_SECRET` | Same app | Import off |
| `MERCADOLIBRE_TOKEN_KEY` | 32 bytes, hex or base64; encrypts tokens. Never rotate without disconnecting stores | Import off |
| `MERCADOLIBRE_REDIRECT_URI` | Optional; default `<site>/api/store/mercado-libre/callback`, registered in the ML app | Default used |

Schedules: pg_cron `demand-report-monthly` (`30 10 * * *`) and `laria-campaigns` (`*/10 * * * *`). A Vercel cron is not
needed; the routes exist for a manual run.

## How to test

1. `bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh reset`, then `… test` (all suites,
   including `tests/store-reach-*.sql` and the concurrency harness).
2. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
3. On the prototype, after `demo-seed.sql` (and `discovery-seed.sql`), load `scripts/prototype/store-reach-seed.sql`: the
   demo store's feed on, Boss approved and Fender waiting, two publications in "Semana de la música", an upcoming
   campaign, and last month's report from 30 sessions. As `demo-tienda@laria.test`, open Mi tienda → "Más alcance para tu
   tienda"; as `admin@laria.test`, Admin → Campañas and Distribuidores; signed out, `/campanas`,
   `/instrumentos/demo-boss-ds-1` and `/api/feeds/tiendas/laria-demo-musica`.
4. `node scripts/prototype/store-reach-screens.cjs <dir>` takes the screenshots below and runs axe on each page.

Screenshots at 390 and 1366 px, with `a11y.json`: `/mnt/project-files/feature-ideas/screens/store-reach/`. All 32 page
checks have no axe violations (WCAG 2.0 to 2.2, A and AA).

The Mercado Libre picker and the photo copy need a Mercado Libre test app and account; they are covered by unit tests
with a fake `fetch` and by the SQL suite, and need a check on a preview with test credentials.

## Limitations

- Campaign history starts at the migration: no publication can join a campaign until 30 days after it runs.
- The demand report describes searches on Laria, which are mostly from Lima and still few; it predicts nothing.
- Dealer marks rest on Admin reading a document; Laria does not verify instruments, serials or warranties.
- Mercado Libre: only active publications, up to 1,000 per account listing (Mercado Libre's offset limit), whole-sole
  prices, no USD, no automatic sync after the import.
- Feeds: Meta reads on its own schedule (hourly at best), so stock shown on Instagram can lag.
- The batch's store pages show "Resumen" in the account breadcrumb, because the frozen account menu has no entry for
  them.

## Copy that needs legal review

- Campaign pages and marks: "Laria revisó que S/ X fue el precio más bajo de esta publicación en los 30 días anteriores
  a la campaña", the "Cómo revisa Laria el precio «Antes»" rules, and the use of "Cyber Wow" (IAB Perú trademark).
- Dealer mark: "Qué revisó Laria" and the warranty line.
- Mercado Libre page: "Qué hace Laria con tu cuenta", and Laria's use of the Mercado Libre API under its developer terms.
- Catálogo para redes: the steps naming Meta and Google, and the line that Laria does not run ads.
- Lo que buscan en Laria: "Qué no te dice este reporte" and "Cómo se cuenta" (also for the privacy policy: aggregated
  search counts shown to stores).
