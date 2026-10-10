# UX-4a · The listing page — acceptance package

**State: built in the cloud session of 10 Oct (N17), waiting for the owner's review.** Built on the provisional answers L1–L21 (`ux-4-listing-store.md`) and the build choices U1–U8 (`decisions.md`). Nothing here sets a status in `acceptance/cases.tsv`.

## Commits

| Commit | What |
| --- | --- |
| `0dda0ec` | React #418 fixed (Mac session; cause and trials in `overnight-2026-10-10.md`) |
| `3d57c86` | The listing page: L15 (report form on demand), gallery and lightbox, contact module and phone bar, trust statement, spec strip and table, seller card, reviews, related sections, the strip's current item; tests |
| (4b commit) | Store page; shared pieces (`ReputationSection`, `SellerAvatar`, `TrustNote`) reused there |

## Criteria (brief § Acceptance criteria, 4a)

| # | Criterion | Evidence | State |
| --- | --- | --- | --- |
| 1 | #418 gone | Fixed and pinned by `tests/favorites.test.cjs` (`0dda0ec`). 10 fresh-listing sessions and the strict favorites smoke on this build | **pending: run on the Mac** (commands below) |
| 2 | Matches the brief at 390 / 768 / 1280 / 1440, signed out and as a Particular, for the listed fixtures | Cloud check only: a production build against a stand-in REST server with fixtures (a Particular with 8 photos and 9 reviews, a verified store's listing with 2 photos, a sold listing, a listing without photo); 390 and 1440, signed out. One `<main>`, one `h1`, no horizontal overflow at 390, one `wa.me` link (none when sold), no console errors other than the stand-in's missing event API | **partly verified**; captures with `scripts/ux-snapshots.cjs` pending on the Mac |
| 3 | One contact button and one trust statement per page; sold pages have neither | `tests/ux-copy.test.cjs` (one `WhatsAppContactLink` body per contact component, one `ContactModule` in the page, no `seller_panel` source), `tests/ux-listing.test.cjs` (sold branch renders no module, trust note or bar spacer) | verified (source and render tests) |
| 4 | Product rules hold (rows below, observations) | Not run here (needs the local stack) | **pending: run on the Mac** |
| 5 | Audit: axe (also with the lightbox open), focus, lightbox trap/Esc/focus return, the bar never hides focus and reflows below 560 px, no overflow at 390, 200% zoom, no layout shift | Lightbox rules pinned in `tests/ux-listing.test.cjs`; overflow checked at 390 on the stand-in build | **pending: `scripts/ux-audit.cjs` on the Mac** (extend it with the lightbox and the bar as the brief's evidence plan says) |
| 6 | First-load JS: listing ≤ 160 kB (208 before) | `pnpm build`: `/instrumentos/[slug]` **146 kB**, `/tiendas/[slug]` **132 kB** (195 before), shared 102 kB. LCP on the first photo | build table verified; browser cold load and LCP **pending on the Mac** |
| 7 | SEO smokes; lint, typecheck, test, build | lint, typecheck, **318 tests**, build pass in the cloud | SEO smokes **pending on the Mac** |

## Tests changed (updated, never weakened)

- `ux-copy`: the WhatsApp check now reads the contact components (exactly one body each, same label and glyph), checks one `ContactModule` and one `StoreHeader` per page, and adds: no `source="seller_panel"` anywhere while the API keeps accepting it. The store monogram check follows `SellerAvatar`. The copy-scan sentinel "Publicaciones de la tienda" became "Sobre la tienda".
- `sprint-8`: report labels and rules read the trigger and the on-demand form together; adds that the trigger never imports the browser client and loads the form with `next/dynamic`; review and store labels follow `ReputationSection` and `StoreAboutSection`.
- `sprint-9`: the trust-surface list grows with the new components (same forbidden wording); `TrustNote` holds the safety link and the full limitation, the page renders it.
- `marketplace-tracking`: "Visto N veces" is gone (L6 A); the view is still registered once visible and on `visibilitychange`, deduplicated, never when sold, and no count is rendered.
- `ux-primitives`: the `Skeleton` exemption is removed (the related sections use it).
- `analytics-browser-smoke`: the main photo is not lazy and has `fetchpriority="high"`; thumbnails `sizes="(max-width: 1023px) 56px, 72px"`, lazy; store cards use the store grid's sizes.
- New `tests/ux-listing.test.cjs` (12 tests): strip and table (L9), reviewer name and dates (L11), reviews left out on failure, seller figures, related sections, gallery and lightbox, the bar rule, L15, L13, store socials, the store sections.
- Unchanged and passing: `ux-shell` (no `loading.tsx`; the listing breadcrumb), `sprint-3-1` (the `h1`), `listing-lifecycle` (sold copy, `trackView={!isSold}`, the published-count rule).

## Acceptance rows to re-run (observations only)

PUB-003, PUB-004, PUB-007; LIFE-005, LIFE-006; PHOTO-017; LIST-009, LIST-011, LIST-015–018; WA-001–007; FAV-006; AN-001 (sources `recommendations`, `store`), AN-002, AN-007; SANA-001; REP-001–005; REVW-015, REVW-018–020; REL-002; STORE-011, STORE-012, STORE-015; VERIFY-001, VERIFY-012; LEGAL-005/006 and SCOPE-001–006. **All pending on the Mac.**

## Pending on the Mac (commands)

```sh
cd ../mkt_instrumentos-ux && git pull && pnpm install
pnpm build && pnpm start -p 3100                    # .env.local → 127.0.0.1:54321
node scripts/ux-hydration-trials.cjs http://localhost:3100/instrumentos/<fresh-slug> 10
LARIA_FAVORITES_BROWSER=1 LARIA_AGENT_BROWSER_BIN=… node tests/run-local.cjs node tests/favorites.integration.cjs http://localhost:3100
node scripts/ux-snapshots.cjs --label ux4-after       # then copy selected frames to screenshots/ux4-after/
node scripts/ux-audit.cjs --axe <axe.min.js>
node tests/run-local.cjs node tests/analytics.integration.cjs http://localhost:3100   # runs analytics-browser-smoke
```

## Known limitations

- The fixtures the brief lists (eight photos, a store with banner/socials/photos, verified reviews) are not scripted yet; the cloud check used a throwaway stand-in REST server, which is not evidence of product rules.
- The swipe in the lightbox uses pointer events (a 40 px threshold); real-device feel needs the N14 device pass (UX-8).
- No review page (Artifact) was published from the cloud; the review checklist is `ux-4-review-checklist.md`.
