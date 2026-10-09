# Laria UX-1–UX-3 production release gate

**2026-10-09 (America/Lima): PASSED.** Henri authorized the push. The audited redesign and its independent audit report reached production; the read-only live smoke found no blocking regression.

## Release identity and boundaries

- Application and audit-report SHA pushed to `main`: `50963fbba87882c0a5e6cafee1533a499a317323`. The application code under audit was `d993f5d46186f4d9b40f4e5605be54b871c74e6d`, based on the previous production `313fb7e158a8f4b9c96139de2832e97de0b03158`.
- Vercel production deployment: `dpl_57FCmnsw4EyQxCB4XwKkeZniKMfx`, confirmed `READY`, targeting production, serving `laria.audio` from `50963fb`.
- The push was a plain fast-forward. The release changed no Supabase migration, dependency lockfile or hosted Supabase data. The post-smoke release record is a separate docs-only commit and therefore triggers a later Vercel deployment with the same application code.
- Pre-push method, gates, product checks and limitations are in [the independent release audit](ux-redesign/reviews/ux-release-audit.md). Its 305 tests, lint, typecheck, build, 403-case acceptance validation, local rendered SEO smoke and local role/browser checks passed. The local build used only the local Supabase environment; the main checkout's production `.env.local` was not used for any build or test.

## Read-only production smoke

All production traffic in this gate used GET requests. Browser automation blocked non-GET `fetch`, XHR, beacons and form submissions before network dispatch. The site's attempted `POST /api/events/session` calls were blocked by that guard. No sign-up, contact, favorite, alert, moderation or other production write was performed; no WhatsApp link was opened.

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Rendered SEO smoke | **Pass** | `node tests/seo-rendered-metadata-smoke.cjs https://laria.audio` exited 0 with explicit data/session waivers below. It checked robots, sitemap, Googlebot/Bingbot metadata, canonical and index rules, home/catalog/legal/auth pages, categories and aliases, populated landings, page 2, filtered catalog, a public listing and store, and JSON-LD. The script's browser renderer was disabled; requests were GET only. |
| Browser routes | **Pass** | At 390 and 1440 px, `/`, `/listados`, `/instrumentos/guitarras`, `/instrumentos/test-444-0146bca8-6ff9-4f35-85da-f8c15ccbb737`, `/tiendas/casa-musical-grau`, `/login`, `/terminos`, `/privacidad`, `/articulos-prohibidos`, `/consejos-de-seguridad`, `/robots.txt` and `/sitemap.xml` all returned HTTP 200: 24/24 navigations. |
| Browser structure and runtime | **Pass** | Every HTML page had one `main` and one H1, no horizontal document overflow, no completed broken image, no console/page error and no failed application GET request. Home, catalog, listing and store screenshots at both widths were visually inspected. At 390 px the browser's own XML viewer overflowed for `sitemap.xml`; app HTML did not. Chrome made a harmless `/favicon.ico` GET returning 404 while viewing `robots.txt`. |
| Home data | **Pass, content follow-up** | The production vitrina showed two photo-qualified listings; a smaller or absent vitrina is expected when few listings have at least three photos. Those two visible records have test-like titles and mismatched photo/category details. Henri should clean or moderate the production content; this is not a release-code failure. |
| Production writes | **None** | The smoke did not exercise live sign-in, sign-up, publishing, favorite, alert, WhatsApp contact, Admin moderation or hosted Supabase mutations. Those flows passed the pre-push local build audit, not this production smoke. |

The SEO smoke explicitly waived `empty-category` because all eight live categories have listings; `admin-records` because no production Admin session was used in this read-only gate; and `sold-listing` because no known production sold-listing URL was available. These branches were exercised locally before release where data and roles allowed. The production browser sampled representative pages and two viewport widths, not every account or acceptance case. Production Core Web Vitals percentiles and every hosted data shape remain unmeasured.

## Decision and follow-up

**Go: keep the deployment live.** No rollback threshold was met. The content-quality issue and the waivers above are recorded for Henri. This UX release does not close the separate V1 launch dependencies in [the go-live checklist](go-live-checklist.md), including owner legal/SEO reviews, Search Console registration, the alert worker scheduler and natural daily-alert acceptance. `acceptance/cases.tsv` and `docs/functional-spec.md` were left unchanged.
