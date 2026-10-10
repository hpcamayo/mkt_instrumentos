# UX-4b · The store page — acceptance package

**State: built in the cloud session of 10 Oct (N17), waiting for the owner's review** (4b was built before 4a's acceptance because the owner is away; N17). Answers L16–L20 provisional; choices U2, U6, U7 in `decisions.md`.

## What was built

- `components/store/store-header.tsx`: the compact header (L17 A), the breadcrumb by store type (L19 A), the figures (L20 A: rating, today's exact count, "En Laria desde"), the one contact button and the trust statement.
- `components/store/store-sections.tsx`: the section links (L16 A) and "Sobre la tienda" (L18 A); `store-photos.tsx` opens the listing page's lightbox.
- `app/tiendas/[slug]/page.tsx`: reads the store's `region`, `created_at`, social links and `store_photos` (existing public columns, anonymous read under RLS for active stores; STORE-012); the grid in 2 / 3 / 4 / 5 columns; reviews through `ReputationSection` (left out when the call fails); `StripCurrent` "verified_stores" on a verified store. Unchanged: `StoreVisitTelemetry` (AN-007), metadata and JSON-LD, 404 before approval (STORE-015), numbered pages (REL-002).

## Criteria (brief § 4b)

| # | Criterion | State |
| --- | --- | --- |
| 1 | Matches the brief at four widths for a verified store with banner, socials, photos and reviews, and a plain Tienda with none | Cloud check on the stand-in build at 390 and 1440 (both store states): one `h1`, one `<main>`, one `wa.me`, no overflow. Captures **pending on the Mac** |
| 2 | 4a's criteria 4, 5, 7 for the store page | lint, typecheck, 318 tests, build pass; rows and audit **pending on the Mac** |
| 3 | First load ≤ 145 kB (195 before) | **132 kB** (build table) |

Tests: see `ux-4a-acceptance.md` § Tests changed (the store parts) and `tests/ux-listing.test.cjs` "4b".

## Known limitations

- An invalid social URL (anything but `http(s)`) is silently left out; Admin still stores it as typed.
- The store figures' "N publicaciones" is the page query's exact count; when that query fails the figure and the section count are left out and the error notice shows.
