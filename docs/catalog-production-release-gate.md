# Catalog schema and reduced catalog — production release gate

**2026-10-09: PASSED.** The catalog schema and reduced reference data are in production. This release changes no
application code or V1 marketplace behavior; the V1 app does not read the new catalog tables yet.

## Candidate and database state

The candidate was `f04e909afec13f0c67573019f45b83ea1f367a1e` plus exactly two local commits:
`c41110e` (25 SQL migrations, `20260927120000`–`20261021120000`) and
`a377bce06673400d66664b70534fdcfbb6761eda` (catalog and post-V1 documentation).
The working tree was clean. `git diff --stat origin/main main` contained only the 25 added files under
`supabase/migrations/` and five modified `docs/*.md` files.

The owner confirmed on 2026-10-09 that production Postgres is `17.11.0.003` with supautils `3.4.4`, all 25
catalog migrations are applied (44 recorded migrations total), and the reduced catalog is loaded. The owner-reported
`catalog_products` comment is `Laria catalog: production profile; 170 brands with products; 20386 products;
sha256 2e0bd5efd20ed753`. This gate did not run migrations, the loader, or privileged SQL.

Using only `.env.local`'s public anon URL/key, seven PostgREST GETs with `Prefer: count=exact` returned the expected
`Content-Range` totals:

| Table | Exact count | Result |
| --- | ---: | --- |
| `catalog_products` | 20,386 | Pass |
| `catalog_categories` | 132 | Pass |
| `catalog_manufacturers` | 1,392 | Pass |
| `catalog_product_attributes` | 62,073 | Pass |
| `catalog_product_variants` | 16,345 | Pass |
| `catalog_product_aliases` | 70,633 | Pass |
| `catalog_product_families` | 765 | Pass |

## Preconditions and deployment

`npm run typecheck`, `npm run lint`, `npm test` (241/241), and `npm run build` all exited zero before the push.
`git push origin main` fast-forwarded `f04e909..a377bce`; no force push was used. GitHub Production deployment
`6953432056` for the exact candidate SHA reached `success`. Vercel deployment
`dpl_9qxJS8KgYDfXR66yUV8i3Wis9ybX` was `READY` with target `production`, and an independent
`vercel inspect laria.audio` resolved the alias to that same deployment.

## Live audit

All HTTP and browser visits were read-only. No account form, contact link, or moderation control was submitted.

| Check | Result | Evidence |
| --- | --- | --- |
| Public and legal pages | Pass | `/`, `/listados`, `/instrumentos/guitarras`, an approved listing, `/tiendas/casa-musical-grau`, the four legal/safety pages, `/robots.txt`, and `/sitemap.xml` all returned HTTP 200. Browser headings and navigation were in Spanish. |
| SEO and Open Graph | Pass | The repository's live rendered-metadata smoke exited zero for Googlebot and Bingbot. It verified canonical/`og:url`, index/noindex rules, robots, sitemap, category aliases and pagination, filtered catalog, sold-listing exclusion, and home/listing/store/category JSON-LD. |
| WhatsApp contact | Pass | Browser links on the approved listing and store page still pointed to `wa.me` with listing/store-specific Spanish messages. No contact link was clicked. |
| Browser console | Pass | The isolated browser recorded zero error-level console messages on home, `/listados`, the guitar category, listing, store, four legal/safety pages, `/login`, and both signup pages. |
| Response times and auth pages | Pass | Full GETs took 98–837 ms across the sampled public routes; anonymous `/login`, `/registro/vendedor`, and `/registro/tienda` returned 200 in 156, 224, and 134 ms. Sprint 9's anonymous auth samples were about 176–181 ms; no 504 or 25-second delay recurred. |
| Production runtime logs | Pass | Deployment-scoped Vercel scans after the audit returned no error-level or 5xx records in the checked hour. |
| Catalog lookup | Pass | Anon `catalog_lookup(..., max_results: 1)` returned Roland Juno-106 (`exact_alias`), Fender Stratocaster (`exact_alias_with_brand`), Boss DD-3 (`exact_alias`), and Zildjian `16" A Custom Fast Crash` (`sku`) for the four requested queries; each returned HTTP 200. |
| Jev and match contracts | Pass | Boss DD-3 `catalog_jev_inputs` returned `MATCH / AUTO`, `detailed=true`. Fender Stratocaster `catalog_match` returned `FAMILY / REVIEW`; both returned HTTP 200. |
| Anon Admin-RPC isolation and recovery | Pass | Anon `get_catalog_review_queue` returned HTTP 401, code `42501`; an immediate Boss DD-3 `catalog_lookup` returned HTTP 200. |
| Authenticated Admin pages | Not Run | No Admin session was provided for this gate. |
| Empty-category SEO branch | Not Run | All eight live categories have approved inventory; the smoke explicitly waived this data-dependent surface. |

## Limits and follow-up

The owner-confirmed Postgres version, supautils version, migration history, and catalog comment were recorded as owner
evidence; this gate independently verified the seven public counts and RPC behavior. The browser and HTTP timings are
bounded samples, and the production log scan covered the checked hour. No evidence here closes the separate owner
SEO/legal reviews, natural daily-email alert acceptance, Search Console registration, or launch scheduler in
`docs/go-live-checklist.md`. The acceptance TSV was not changed and no XLSX was read or regenerated.

No deployment-caused failure was observed, so the previous `f04e909` production deployment was not promoted back.
The catalog data remains in the production database for post-V1 work.
