# Catalog read performance and request deadlines

How the public catalog keeps its database work bounded: the query rewrite in
`supabase/migrations/20261111120000_catalog_read_performance.sql`, the time budgets every public read runs under, the
shared caches for public aggregates, and how to roll it out. The recovery switch that can still turn the optional
reads off is in [catalog-recovery.md](catalog-recovery.md).

Live incident details, provider logs and account identifiers belong in private operational records, not here. This
document changes no V1 acceptance status.

## What made the catalog fragile

Every point below was measured or read in the code; together they let a small database be overwhelmed by ordinary
page views.

- **Per-row visibility function.** The listings and photos policies called `public.listing_is_public(id)` for every
  row. It is a security-definer function with its own `search_path`, so Postgres can neither inline nor cache it, and
  it reads the listing and its store again: about 23 times the cost of the same condition written in the policy. Every
  anonymous read of listings, photos and photo counts paid it.
- **Facets as about 20 function calls per listing.** `catalog_facets` evaluated `laria_private.catalog_filter_ok`
  (and `seller_verified_rank`) once per listing per facet, after the per-row visibility function.
- **Search re-parsed the query per row.** `catalog_search` ran `listing_matches_query` on every approved listing,
  splitting the query and reading synonyms for each row, with no index able to help.
- **Fan-out per page view.** The root layout ran the brand-menu aggregate on every page; the home page ran eleven
  counts; each catalog render ran facets uncached; each keystroke in search ran the type counts.
- **Failures were never remembered.** `unstable_cache` does not keep a failed load, so a timed-out aggregate ran again
  on the next render of every page.
- **Retries and no deadlines.** postgrest-js retries GET and HEAD three times (1 s, 2 s, 4 s) on network errors and
  503/520, and no public read had a client-side deadline, so a slow database held server renders open up to the
  platform's 300 s limit while each retry added load.
- **PostgREST does not cancel abandoned statements.** Measured locally on PostgREST 12.2.3: a request dropped by its
  client after 1 s kept its statement running to completion. Only the role's `statement_timeout` (anon: 3 s on
  Supabase) stops it.

## What changed

### Database (forward migration, compatible both ways)

| Change | Effect at 5,000 listings (anon, one at a time) |
| --- | --- |
| Visibility written inline in the listings and photos policies, word for word `listing_is_public` | public listings count 73.6 → 1.3 ms; one category count 20.5 → 0.9 ms; catalog page 9.3 → 3.7 ms |
| `catalog_search_condition` + `catalog_search_ids` + trigram GIN index on `listing_search_text(...)` | search "fender strato" page 1,458 → 92 ms; "guitara" 1,376 → 357 ms |
| `catalog_facets` computes each filter's yes/no once per listing and counts every facet from those flags | facets, no filters 756 → 47 ms; guitars + Lima 901 → 23 ms; with a search 1,317 → 117 ms |
| `catalog_brand_counts`, `catalog_type_counts`, `catalog_suggest` use the inline condition | 97 → 29 ms, 73 → 6 ms, 339 → 53 ms |

Every function keeps its name, arguments, result shape and grants, so the application before and after this change
works with either schema. `listing_is_public`, `listing_matches_query` and `laria_private.catalog_filter_ok` are
unchanged for their other callers (single-listing checks, saved-search alerts).

### Application

- **Public read client** (`lib/supabase/public-read-client.ts`): anonymous key only, no session, no cookies; every
  request carries a deadline signal; automatic retries are off. Writes, uploads, auth, workers and admin keep their own
  clients, untouched.
- **Budgets** (`lib/request-deadline.ts`): see below. One deadline per server render is shared by metadata, layout and
  page (`getRequestReads`, request-scoped), so sequential fallbacks draw on one total.
- **Shared aggregates** (`lib/shared-aggregate.ts`): single flight, failure cool-down, last-good fallback, a breaker,
  bounded memory. Used for brand menus, type counts, home counts, facets, the empty-search rescue and suggestions.
- **Canonical, cacheable endpoints**: `/api/catalog/facets` redirects (308) any non-canonical query to the canonical
  one and is shared by the CDN; `/api/catalog/suggest` is shared by the CDN per query.
- **Honest failures**: a failed core read shows "No pudimos cargar las publicaciones. Vuelve a intentarlo en unos
  minutos." with "Reintentar" (home, catalog, stores directory) or the error page (listing, store), never an empty
  catalog or a 404.
- **Recovery switch** now also covers suggestions, home counts and type counts; the sell form's brand suggestions come
  from the reference catalog and no longer depend on it.

### Remove the catalog rendering waterfall

The catalog route starts the shared facet read after URL and search-phrase validation, alongside its fresh inventory
read. It passes that promise to `CatalogView`, which consumes it once. Category routes start facets and type counts
alongside inventory and brands, then pass those reads through `CategoryLanding`. Previously the catalog waited for
inventory before starting facets; categories waited for inventory/brands, then type counts, then facets.

This changes scheduling only: the existing optional budgets, cache keys, cache bounds, breakers, recovery switch,
anonymous clients and request-scoped inventory deduplication still apply. Inventory failures remain errors. Listing
cards, counts, category JSON-LD and pagination still render on the server. The middleware crawler guard, malformed
URL redirects, robots rules, canonical metadata and `nofollow` refinements are unchanged.

An inventory error or overflow-page redirect can now start one bounded facet load that the old catalog skipped
(categories can also start their shared type-count load). These reads use the existing caches and deadlines; redirects
do not wait for them. Malformed URLs, interpreted-phrase redirects, forwarded category filters and blocked crawlers
still start no catalog enrichment reads. Empty-search rescue still starts only after inventory confirms no results.

Controlled local `next build` / `next start` comparison against the merged crawler optimization, with 350 ms inventory,
450 ms facets and 300 ms type-count delays; totals include SSR and transfer on loopback, with the shared menu warmed:

| Scenario | Before | After | Upstream reads before / after |
| --- | ---: | ---: | --- |
| Cold filter key, median of 5 | 845 ms | 487 ms | 1 inventory + 1 facet / same |
| Warm filter key | 385 ms | 384 ms | 1 fresh inventory / same |
| Inventory delayed to 1,200 ms | 1,692 ms | 1,235 ms | 1 inventory + 1 facet / same |
| Facets delayed beyond optional budget | 1,881 ms | 1,536 ms | 1 inventory + 1 facet / same |
| Cold category | 1,140 ms | 494 ms | 1 inventory + 1 type-count + 1 facet / same |
| Each restricted crawler / malformed URL | 403 / 308 | 403 / 308 | 0 / 0 |

The trace shows facets starting 356 ms after inventory before, versus 1 ms after it with parallel reads. These are
controlled measurements, not a prediction of production p95: database latency, query mix, cache reuse and instance
startup still affect production. No production load test or schema change is needed for this scheduling fix.

Reproduce with `scripts/perf/catalog-latency.cjs` (local targets only): start its `fixture` mode, build and start each
revision in a separate directory with the dummy API variables documented at the top of that script, then run
`node scripts/perf/catalog-latency.cjs measure http://127.0.0.1:PORT` once per fresh server process. It prints per-request
timings and upstream traces and asserts fresh inventory, one facet load per cold key, SSR cards, and zero upstream
reads for blocked or malformed requests. Deferred-read regressions in `tests/catalog-latency.test.cjs` verify overlap,
validation before reads, unavailable optional counts, core errors and prompt overflow redirects. Run the existing
`tests/catalog-routing-http.cjs` against that fixture-backed build for the full SEO and pagination smoke checks.

## Budgets

| Budget | Value | Covers |
| --- | --- | --- |
| Optional read | 1.5 s | facets, menus, home and type counts, suggestions, price guidance, empty-search rescue |
| Core read | 3.5 s | the listings themselves: catalog page, listing, store, home feed. Just above the database's 3 s anon limit, so the usual failure is the database's own timeout |
| Server render | 8 s | everything one page waits for, metadata and layout included; later reads only get what is left |
| API request | 4 s | facets, suggestions, next page, sold-listing check; also ends when the browser disconnects |
| Route hard stop | 30 s | `maxDuration` on catalog pages and endpoints, far below the platform's 300 s default |

Reads are cancelled at the HTTP level (`AbortSignal` on fetch), not raced: the socket closes and nothing keeps
waiting. A caller's own signal is still honored. Shared loads (single flight) run under their own bounded deadline, so
one request giving up does not cancel the work others wait for, and none of it outlives that deadline.

Database-side limits: Supabase's role limits stay as they are (anon 3 s). Abandoned statements run until that limit
(see above), which is why the breaker and cool-downs below matter: they stop new optional statements from being
started while the database is struggling.

## Caching and freshness

Only public, anonymous data is shared. Nothing here reads cookies or a session; loads use the public read client.

| Data | Shared where | Fresh for | When a refresh fails |
| --- | --- | --- | --- |
| Reference catalog brands (sell form) | Next data cache + memory | 1 day | last good copy up to 7 days; 5 min cool-down |
| Brands with listings (menus) | Next data cache + memory | 120 s | last good up to 1 h; 30 s cool-down |
| Type and category counts (home, landings, suggestions) | Next data cache + memory | 120 s | last good up to 1 h; 30 s cool-down |
| Facets per canonical filter set | memory per instance (500 keys) + CDN | 60 s; CDN 60 s, then up to 300 s stale while refreshing | last good up to 1 h; unavailable answers are shared 10 s |
| Empty-search rescue per filter set | memory per instance (300 keys) | 60 s | omitted |
| Individual removal counts reused by related empty searches | memory per instance (500 keys, including in-flight deduplication) | 60 s | no last-good answer beyond 60 s |
| Brand and model suggestions per query | memory per instance (500 keys) + CDN | 120 s | omitted; categories still suggested |

So a newly approved listing can take up to two minutes to appear in counts and menus (about seven at the CDN's stale
edge). Its listing page, search results and the catalog itself are live. Facets and rescues stay in memory only, so a
crawl of filter combinations does not write a data-cache entry per combination. After three optional failures within
10 s, one breaker pauses facets and rescues for 30 s in that instance. The rescue's removal counts have a breaker of
their own: one empty search asks up to eight at once, so their failures alone must not pause every visitor's facets.

## Input limits

- Free-text search: 200 characters (as before; the database also refuses longer).
- Every other filter value: 80 characters; longer values are ignored.
- Advanced attribute values: at most 20 per request.
- Filter values the catalog does not offer are dropped: an unknown category or instrument type, a select or
  multiselect value outside the filter's options, an unknown condition, sort or seller type, a price that is not a
  number (a price typed as "1,500" or "S/ 1500" redirects to 1500), and a brand or place containing "=". A page
  number our links never write ("page=abc", "page=0", "page=02") redirects to the one they do. Blank values from the
  no-JavaScript forms are not reported.
  Values over the existing 80-character limit are also reported as rejected, including repeated locations and
  advanced attributes. `/listados` answers such an address with a permanent redirect to the cleaned one, keeping
  valid filters, their repeated values, sorting, prices and pagination. Both the page and `generateMetadata` check
  this before starting their catalog query; a redirect does not need a result count for its title.
  Some crawlers decode `&microphone_type` in our links as
  `µphone_type`; before this, each mangled value was kept, carried into every filter link and produced endless new
  uncached addresses. Old links keep working where they map to real values (legacy categories); values that never
  existed no longer narrow the results to nothing.
- Valid free-text searches keep their existing 200-character limit (including literal "="), arbitrary real brands
  and locations remain supported, and the legacy category aliases still work. Category/listing/store SEO, sitemap,
  robots.txt and valid filtered pages' `noindex, follow` behavior are unchanged. This is URL cleanup, not a bot rate
  limit: a crawler may still request and follow redirects. The root layout can still load its shared brand menus.
- Filter, applied-filter and sort links are `rel="nofollow"` (filtered `/listados` pages are already `noindex, follow`).
  robots.txt still allows them, because the SEO gate requires noindex pages to stay crawlable.
- Suggestions: 2 characters minimum, 60 used; the browser waits 250 ms after typing and cancels superseded requests.
- Draft counts in the filter sheet: 250 ms after the last change, the previous request cancelled, the canonical
  address requested directly.

### Crawl cleanup follow-up verification (26 Oct 2026)

`pnpm test` passes 703 tests; lint, TypeScript and the production build pass. The crawl regression tests reproduce
the malformed-condition, overlong-value and metadata-query gaps before the fix, and exercise the actual page and
metadata exports after it. They preserve repeated valid filters, arbitrary real brands/places, a literal `=` in
free-text search, legacy categories, pagination and catalog SEO metadata.

The compiled production build was also checked over HTTP with a local read-only PostgREST-shaped fixture. Every
malformed condition/brand/location/attribute case returns 308 to the cleaned URL; following it returns 200. Valid
repeated filters, price bounds, sorting and page 2 survive cleanup. Unfiltered pagination and category-only aliases
keep their canonical tags; valid filtered searches keep `noindex, follow`. A browser smoke applied two conditions
through the phone filter sheet and changed the sort to `price_asc`, preserving both conditions. The local fixture
caused an unrelated `/vender` prefetch warning; authentication was not part of this check.

Comparison against merged PR #35 (`6ed8bf7`), using the same Next.js 15.5.18 production build dependencies, a
Googlebot user agent, warmed caches and 20 requests per case:

| Malformed value | Catalog reads per initial response, before → after | Local CPU reduction | Uncompressed HTML reduction |
| --- | --- | --- | --- |
| Condition | 1 → 0 | 51% | 90% |
| Short brand containing `µphone_type=` (already redirected by #35) | 2 → 0 | 18% | 18% |
| Brand over 80 characters | 1 → 0 | 45% | 90% |
| Location over 80 characters | 1 → 0 | 61% | 90% |
| Advanced attribute over 80 characters | 1 → 0 | 67% | 90% |

These are measurements of the malformed response only, not of a crawler following its target. An equal mix of the
five cases used 52% less local CPU per initial response. In a separate conservative run (eight initial URLs per case)
that followed every redirect and freshly fetched every destination, the same mix used about 16% **more** CPU and
29% fewer catalog reads than #35. Redirected destinations still render and query the catalog. Savings depend on
crawlers remembering the permanent redirect and stopping discovery/revisits of malformed combinations; this change
does not enforce a request cap. Root-layout menu reads may still run on a cold cache.

For planning only, if 25%, 50% or 75% of catalog CPU belongs to affected malformed responses and crawlers converge on
the clean destinations, a 52% per-response CPU saving corresponds to roughly 13%, 26% or 39% less catalog CPU. This
is a scenario, not a measured production forecast. The available request metrics/log sample omit query strings, so
the affected share cannot be established from them. There is no defensible percentage reduction in total bot
requests yet. Local Node CPU and uncompressed HTML are not Vercel billing measurements; memory, compressed origin
transfer, instance concurrency and crawler behavior require post-deployment observation.

### Catalog traffic optimization (26 Oct 2026)

The early routing guard in `middleware.ts` covers `/listados` and `/api/catalog/:path*`. Public requests leave this
branch before session-client construction, cookie handling or auth calls. Existing account/Admin middleware remains
in place. `lib/catalog-request.ts` shares the malformed-value cleanup with both catalog page exports; a known
malformed URL returns a small 308 response before rendering the root layout. The page and metadata keep their own
check as defense in depth. Valid free text, repeated filters, page numbers and legacy category links retain their
existing behavior. Unknown or tracking-only parameters do not trigger a new incoming redirect.

`lib/catalog-crawlers.ts` restricts **Amazonbot, Reflectionbot and MJ12bot**, by their advertised user-agent token,
to prevent bulk crawling of filter combinations and catalog data APIs. They receive a small 403 with
`Cache-Control: private, no-store` and `Vary: User-Agent`; it must never be shared with ordinary visitors. This is
resource containment for those declared crawler identities, not an authentication or DDoS control: agents can change
their identity. No broad "bot" substring, shared-IP limit or challenge is added to application code.

SEO safeguards:

- Every agent can still fetch clean category, product, store, sitemap and robots URLs. Googlebot, Bingbot, social
  preview agents (`facebookexternalhit`, WhatsApp), user-triggered AI fetchers and other agents retain catalog access.
- The production robots file adds only a specific group for the three selected crawlers, disallowing `/listados`.
  Their group also retains **all** private-route restrictions from the wildcard group, because a specific group
  replaces that group. The wildcard does not disallow catalog pagination. Preview deployments still disallow `/`.
- Clean catalog/category pagination remains followable; canonical tags and valid filtered searches'
  `noindex, follow` metadata are unchanged. Refined `/listados?...` links now consistently use `nofollow` in result
  navigation, price/attribute chips, category exploration and public menus. Clean category/product links remain
  followable. `nofollow` is a crawl hint, not a request cap.
- Internal search fields, pagination, retry and return-to-results links now serialize only normalized supported
  filters. Unknown keys such as `µphone_type`, framework keys such as `_rsc`, and `utm_*` attribution keys do not
  multiply into the next URL. The incoming URL is left available for attribution. Repeated conditions, cities and
  supported multi-select attributes survive serialization.

The empty-search rescue still shows the same removal choices and fallback listings. Related searches share their
optional "without this filter" counts for a minute in a bounded, non-persistent cache; sort does not change a count.
Concurrent requests asking the same question share one in-flight read. Duplicate fallback states are tried once
rather than repeating the same category query. No shared cache was added to the primary catalog result, and there
is no migration, visibility-policy change, session change or new environment variable.

Validation:

```sh
pnpm test
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm build
# Against a running production build with at least two catalog pages and the default canonical site origin:
node tests/catalog-routing-http.cjs http://127.0.0.1:3000
```

The suite passes 712 tests. The HTTP smoke exercises 33 cases: selected crawler denials, preserved clean discovery,
early malformed redirects, allowed search/social/user agents, normalized generated URLs, canonical metadata and
filtered `noindex, follow`. Its local fixture replay checked 25 refinement links. The mobile browser smoke applied
one condition and two locations, then changed to lowest price; all filters survived and unknown/tracking parameters
did not propagate. A fixture-only `/vender` auth prefetch warning was unrelated to this flow.

A deterministic three-search rescue replay (two locations and a changed sort, all empty) makes **five rather than
nine count calls**, and **six rather than nine fallback calls**: 11 optional listing reads instead of 18, about 39%
less for that case. A separate concurrency test confirms a shared in-flight count. These are fixture results, not
a prediction for every empty search; new unique filter combinations can still miss the bounded cache.

Against merged main (`139d413`), a warmed local Next.js 15.5.18 production replay with an isolated read-only API
fixture and 30 requests per case measured:

| Request | Local CPU ms, before → after | Raw response bytes, before → after | API reads, before → after |
| --- | --- | --- | --- |
| Amazonbot catalog | 33.39 → 1.10 | 228,356 → 20 | 1 → 0 |
| Reflectionbot catalog | 29.50 → 1.26 | 228,356 → 20 | 1 → 0 |
| MJ12bot catalog | 30.78 → 4.62 | 228,356 → 20 | 1 → 0 |
| Malformed-condition redirect | 6.04 → 0.90 | 23,056 → 52 | 0 → 0 |

These are local process CPU and uncompressed bytes, not billed Vercel resources. The redirect comparison excludes
following the destination. Normal valid pages still render and read the catalog. Four additional alternating
40-request control batches showed 21.8–26.6 ms CPU/request on main and 22.3–32.4 ms after the change as the processes
warmed; the final matched batches were 21.8 and 22.3 ms. The guard adds routing work to valid requests, and this
replay does not establish a normal-user CPU or latency improvement. The middleware build grows from 89.3 to 93.7 KB.

Deployment and measurement limits:

- The PR deploys application routing protection. It does **not** publish account-level Vercel Firewall or billing
  settings. Existing firewall rules stay in force. For the lowest platform cost, an equivalent reviewed WAF deny can
  stop the selected crawler requests before application middleware. Log/review exact path and identity matches
  before publishing that separate operational change; preserve search engines and social previews.
- An application middleware 403 still consumes middleware/CDN resources. It is **not** the free WAF mitigation
  category, so do not claim that HTTP request counts or CDN tier usage disappear when only this code is deployed.
- Measure production function CPU, origin transfer, Supabase calls, middleware cost, allowed CDN requests and
  Google/Bing/social success separately over comparable windows. Do not add overlapping code and bot-policy savings.
- The source rollback is a revert/redeploy; it does not alter existing WAF rules. No automatic pause or broad robots
  exclusion is introduced.

## Functionality contract

Healthy means the database answers within budget; containment means `LARIA_CATALOG_ENRICHMENT_DISABLED=true`.

| | Feature | Healthy | Slow or failing optional read | Containment |
| --- | --- | --- | --- | --- |
| A | Filter counts, "Ver 12 resultados", zero indicators | restored, up to 60 s old | neutral controls, plain "Ver resultados"; filters apply exactly | same as failing |
| B | Locations from live inventory, zones | restored | the predefined cities plus every chosen city, so a chosen city outside the list stays visible and can be unticked; zones need counts and are hidden | same as failing |
| C | Price shortcuts and range guidance | restored | manual minimum and maximum work | same |
| D | Brand links and counts in menus and category pages | restored, up to 120 s old | menus without brands; search and the brand filter work | same |
| E | Counts on types and categories, hiding empty ones | restored, up to 120 s old | links shown without numbers, empty ones included | same |
| F | Empty-search rescue ("Sin … hay 12", "Lo más parecido") | restored, within 1.5 s | honest no-results message, filter chips still remove, search alert offered | same |
| G | Seller brand suggestions | from the reference catalog, independent of listing aggregates | manual brand entry; publishing unaffected | **kept** (no longer switched off) |
| H | Autocomplete | restored, shared per query | brands and models omitted, categories still suggested; submitting the search works | empty list; submitting the search works |

Not changed: listing results, selected filters, sorting, pagination, store scoping, individuals and stores together in
search, visibility, stock rules, moderation, ownership, authorization, auth and account flows, WhatsApp contact,
favorites, alerts, reviews, analytics, drafts, publishing, editing and inventory.

## Behavior changes and limitations

- **Search under a signed-in store member.** `catalog_search` used to apply the caller's row-level security, so a
  signed-in member of an inactive store could find that store's approved listings. It now applies the public
  condition for everyone. The application only calls it with the anonymous key, so no page changes.
- **Brand facet ties.** The facet lists at most 30 brands; when brands tie at the cut-off, the previous function chose
  arbitrarily and the new one by name. Counts are identical.
- **Counts can be up to two minutes old** (see Caching). Results are live.
- **Per-instance memory.** Single flight and memory caches are per server instance; with several instances each may
  load the same key once. Persistent aggregates share the Next data cache.
- **Failed listing or store reads** now show the error page (HTTP 500, "Reintentar") instead of a 404.
- **Search for typos stays the costliest query**: a misspelt common word ("guitara") still compares many rows, about
  350 ms at 5,000 listings. A stored search column would remove it but changes every listing write, so it is left for
  when the catalog nears 20,000 listings.
- **Abandoned statements run on in the database** up to the 3 s role limit (PostgREST behavior).
- **Viewport prefetch is kept.** The first row of listing cards still prefetches its listing pages in full (FAST 02),
  up to four listing renders per catalog view. Each now costs one indexed listing read plus cached menus; the load test
  does not simulate it, so real catalog views cost somewhat more than measured.
- **Not measured here**: Vercel's multi-instance behavior and its CDN, Supabase's pooler and compute size, the network
  between them (local round trips are about 1 ms), cold starts and production's traffic mix. The load tests below are
  local and compare like with like.

## Measurements

All local: Postgres 16, PostgREST 12.2.3 with a 10-connection pool, the anon role's `statement_timeout` at 3 s as on
Supabase, the production build of each version (`next start`), 4 CPUs. Data: `scripts/perf/seed-catalog.cjs 5000`
(5,000 listings, 80 stores, every visibility case). "Before" is `main` at PR #33 on the schema before
`20261111120000`; "after" is this change on the new schema. Load: `scripts/perf/load-catalog.cjs`, a closed loop over
the home page (20%), catalog (15%), random filter combinations (15%), searches (15%), landings, listings, stores and the
two endpoints, fresh combinations every time. Faults: `scripts/perf/fault-proxy.cjs` between the app and its database
API.

### Normal operation

| Run | Requests/min | p50 | p95 | p99 | 5xx | Degraded pages | Busy DB connections (max) | Statement timeouts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Before, 10 clients | 299 | 1,695 ms | 3,758 ms | 4,340 ms | 0 | 17 | 10 of 10 | 19 |
| After, 10 clients | 1,079 | 573 ms | 967 ms | 1,457 ms | 0 | 0 | 3 | 0 |
| Before, 30 clients | 315 | 4,965 ms | 11,472 ms | 14,425 ms | 3 | 21 | 10 of 10 | 29 |
| After, 30 clients | 1,098 | 1,621 ms | 3,085 ms | 3,389 ms | 0 | 0 | 5 | 0 |

Before, the database pool was saturated at 10 clients, with statements running past 2 s and timing out. After, the
database is never the bottleneck (at most 5 of 10 connections busy at 30 clients); the limit is rendering CPU in one
local process. Runs vary by about 15% (an earlier run of the same build at 10 clients gave 1,244 a minute).

### Database faults (10 clients, 30 s, `fault-proxy.cjs`)

| Fault | Build | Requests/min | p50 | p95 | max | Upstream requests per page | Left open after the run |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hangs (never answers) | before | 11 | 60 s (client gave up) | 60 s | 60 s | not measurable (none finished) | 84, still open until the server was stopped |
| Hangs | after | 186 | 3.5 s | 7.0 s | 7.0 s | 1.4 | 0: all 143 cancelled by the app |
| Slow (2.5 s per call) | before | 105 | 4.5 s | 10.3 s | 10.4 s | 4.4 | 0 |
| Slow | after | 202 | 2.6 s | 8.0 s | 8.3 s | 2.1 | 0 |
| Fails at once (503, pool exhausted) | before | 134 | 7.1 s | 7.3 s | 7.5 s | 13.0 (retries) | 0 |
| Fails at once | after | 1,938 | 336 ms | 490 ms | 684 ms | 1.4 | 0 |

Under a hung database the previous build kept every request open until the platform limit; the new one answers within
its 8 s budget with the unavailable states and closes every request. Under failures the previous build multiplied each
failed read by its retries (13 upstream requests per page); the new one makes each read once and answers in under a
second. Pages in the fault runs showed the "No pudimos cargar…" state or the error page (500); the facet and suggestion
endpoints answered 503 or without enrichment; none showed an empty catalog.

The first fault run found six public reads still on the default client (the listing's sound clip, the reviews and
photos endpoints, the sitemap, share images, the complaints-book page) and the listing page's service-role read still
retrying; all are now bounded and a test keeps it that way. The contact endpoint (WhatsApp) keeps its client unchanged.

## Verification

- `pnpm test`: includes `tests/catalog-performance.test.cjs` (budgets, cancellation of hung reads with no request left
  open, no retries on 503/520/network errors, caller signals, anonymous-only headers, single flight, expiry with
  simultaneous requests, failure cool-down and last-good fallback, the breaker, bounded memory, the rescue's shared
  deadline, the canonical facet endpoint and its cache headers, shared suggestion counts, input limits, chosen
  locations without counts, core failures never shown as empty) and the recovery-switch suite
  (`tests/catalog-recovery.test.cjs`), including suggestions and the static audit of every aggregate caller.
- `tests/catalog-performance.sql` (run by the local DB setup's `test`): recreates the previous definitions in a
  scratch schema and compares them with the new ones over a seeded catalog: listing and photo visibility for anon and
  for a signed-in user equal `listing_is_public`; search equal to `listing_matches_query` for accents, synonyms, typos,
  `%` and `_`; facets equal for 16 filter sets × 11 queries, including self-exclusion and advanced attributes; brand and
  type counts and suggestions equal; invalid input refused; the trigram index usable; a store activated mid-way shows at
  once. It fails when the visibility policy or an aggregate is altered.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Rollout

Keep `LARIA_CATALOG_ENRICHMENT_DISABLED=true` in production until step 6.

1. **Review.** The migration changes row-level security and security-definer functions: review it (Codex review per
   the project's rules) together with `tests/catalog-performance.sql`.
2. **Staging database.** Apply the migration to a non-production database with production's schema (local stack or a
   staging project): `supabase db push`. Then run `tests/catalog-performance.sql` against it; it seeds inside a
   transaction and rolls back, so run it only on staging, never on production.
3. **Staging app.** Deploy this branch against the staging database with the switch off, and run the smoke checks
   below plus `scripts/perf/load-catalog.cjs` against a local `next start` pointed at staging.
4. **Production migration.** Before applying, check nothing long-running holds `public.listings`
   (`select pid, now() - xact_start, query from pg_stat_activity where state <> 'idle' order by 2 desc`). Apply with
   `supabase db push` (only this file is pending). The index build takes a SHARE lock on listings: reads continue,
   listing writes wait for it, milliseconds at production's size. The running application keeps working with the new
   schema. Check: `select public.catalog_facets('{}', null, '{}')` returns the same counts as before.
5. **Deploy the application** by merging, switch still on. Smoke checks: `/`, `/listados`, `/listados?q=fender`, a
   category landing, a listing, a store, `/tiendas`; `GET /api/catalog/facets?category=guitars` answers 200 `null`;
   `GET /api/catalog/suggest?q=fe` answers `[]`. Watch 30 minutes: Supabase API 5xx and `PGRST003`, statement
   timeouts, database CPU; Vercel function durations (none should approach 8 s).
6. **Turn the optional reads back on**: remove the variable (or set `false`) and redeploy. Check the facet endpoint
   returns counts and the filter sheet shows "Ver N resultados". Watch for an hour.
7. **Stop conditions** (any of them): a `PGRST003` pool timeout; more than 1% 5xx on catalog routes over 5 minutes;
   catalog function p95 above 3 s; database CPU above 80% for 5 minutes; statement timeouts above a few per minute.
   Response: set the switch back to `true` and redeploy (minutes), then investigate.

### Rollback

- **Application**: roll back the deployment in Vercel (or revert the merge). The previous application works with the
  new schema.
- **Database**, only if the migration itself is at fault:
  `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/rollback/20261111120000_catalog_read_performance.rollback.sql`.
  It restores the previous policies and functions verbatim and drops the index and the two helper functions; brief
  locks on listings and photos. The migration stays recorded as applied; re-apply it by running its file by hand.
  Tested locally as a round trip (rollback, the older SQL suites, re-apply, this suite).

## Maintenance

- The index stores `public.listing_search_text(...)`. A migration that changes that function or `public.catalog_fold`
  must `reindex index public.listings_search_text_trgm_idx` in the same migration.
- A change to `listing_is_public` must make the same change to the two inline policies and to `catalog_search_ids`,
  `catalog_facets`, `catalog_brand_counts`, `catalog_type_counts` and `catalog_suggest`; `tests/catalog-performance.sql`
  compares them with `listing_is_public` and fails if they drift.
- A new public aggregate goes through `sharedAggregate` with the public read client, checks
  `catalogEnrichmentDisabled()` if it is optional, and is added to the audit in `tests/catalog-recovery.test.cjs`.
