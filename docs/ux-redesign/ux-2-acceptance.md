# UX-2 Shell and navigation — acceptance package

Status: **accepted by the owner, 8 Oct 2026** (review page: 22 of 22 checks Correct, § Owner acceptance (8 Oct)). Built 30 Sep–1 Oct; the owner's answers of 7 Oct applied (§ Owner answers (7 Oct)). Implemented and audited by Claude Code on `ux/redesign` against the approved brief `ux-2-shell.md`. Prepared for an independent external review on 2 Oct (`review-guide.md`): re-verified on a clean local stack, one defect found and fixed (§ Review preparation). The 3 Oct external-review fixes are verified below. **Amended 3 Oct (owner, N12): the mega-menu's category and type access is restored inside the UX-2 design** (§ Hybrid category navigation); the canonical V1 reconciliation stays with the owner (§ What still needs owner acceptance). Nothing is pushed or merged.

| # | Commit | Content |
| --- | --- | --- |
| 1 | `645d51e` docs(ux) | UX-1 accepted; the brief and the home visual audit committed; README, decisions (N1–N7, G1), roadmap |
| 2 | `0813138` feat(ui) | The shell: header, category strip, account menu, breadcrumbs, account and Admin frames, footers, 404/500, logo hairline, text-wrap rule; tests; harness routes |
| 3 | `2d06b7e` docs(ux) | `docs/design-system.md`, this package, README status, the decision log (N8) and audit item 17 note, selected before/after frames |
| 4 | `37d441b` fix(ui) | One `<main>` on 404 and error pages under `/admin` (found while preparing the external review) |
| 5 | `cde9c5a` chore(ux) | `scripts/ux-local-accounts.cjs` and `scripts/ux-audit.cjs`, to reproduce the evidence |
| 6 | `1a96bf5` test | The favorites browser smoke's Admin check (page titles use `<header>`; the signal is the missing header search) |
| 7 | `15e689f` docs(ux) | `review-guide.md`; this package, the decision log (N9–N12, F9), README, design system, roadmap and UX-1 package brought up to date; reviewer pointers in `AGENTS.md` and the root README |
| 8 | `b6614e0` fix(ux) | The external review's fixes, as the reviewer (Codex) left them: the deeper Admin 404 catch-all (UX2-R01), the "Tiendas verificadas" native link and the audit's frame and strip checks (UX2-R03), the review report |
| 9 | `424c13c` feat(ui) | Hybrid category navigation (owner, N12): strip menus, Admin "Explorar categorías", catalog links as native links, the Esc rule for nested menus; tests and audit checks |
| 10 | `e122b88` docs(ux) | The brief's amendment, N12 in the decision log, this package (§ Hybrid, § What still needs owner acceptance), the review guide, the design system, the README and a follow-up note in the review report |
| 11 | `d3d7f8f` fix(ui) | N11: the phone back link only on listing pages; tests; a more accurate note on the catalog transition |
| 12 | `a689a1e` fix(ui) | Admin "Explorar categorías": closed levels were on screen (a display class overrode `hidden`); a unit test for every `hidden` panel; an audit check |
| 13 | `51e4ed4` chore(ux) | `scripts/ux-pub-rerun.cjs`: re-runs PUB-008 to PUB-015 on a local build and records what it observes |
| 14 | docs(ux), after `51e4ed4` | The owner's answers (N9–N14), `ux-2-reconciliation.md`, this package, the review guide, the design system, the README and the detailed plans for UX-3 to UX-8 in `roadmap.md` |

## What changed

- **Header** (`components/site-header.tsx`): black bar, 64 px from 768 px and 56 px on phones; logo 68×36 / 61×32; brand search 44 px (up to 680 px, 28 px after the logo) with a 36 px icon button; "Vender" as the 36 px outline button on dark; "Ingresar", or the bell with the unread count and the avatar with "Mi cuenta" that opens the account menu; labels become icons below 900 px; the last item's visible edge on the gutter. On phones the search is a row under the bar on browse pages and the home, behind an icon on listing pages, and absent elsewhere; while publishing only the logo and the account entry remain.
- **Account menu**: the rail's sections, order and counts, "Admin" for admins, a divider, "Cerrar sesión".
- **Category strip** (`components/global-categories.tsx`, replaces the mega-menu): "Instrumentos", the eight categories, "Tiendas verificadas"; current item underlined in blue with `aria-current`; scrolls sideways when it does not fit; on public pages except the home (phones: browse pages only). After the 3 Oct fix, the verified-store item uses a native anchor to apply its filter reliably from the unfiltered catalog. *Amended 3 Oct (N12): the categories open menus again and the strip sits on every page with the public header; see § Hybrid category navigation.*
- **Breadcrumbs** (`components/breadcrumbs.tsx`): catalog, category landings and listing page; the full trail from 768 px, a back link to the parent on phones.
- **Frames**: the account rail (248 px) and the phone switcher; the Admin sidebar (240 px, black) and the phone bar with "Menú"; Admin has no site header or footer and owns its `<main>`.
- **Footers**: full on the home (four columns), slim everywhere else, none in Admin.
- **404 and 500**: one centred body with the title, one line, the search and two links; the 500 page (`app/error.tsx`) is new.
- **Logo**: the stray hairline removed from `app/logo-clear.svg`; `BrandLogo` renders the decided sizes.
- **Text wrap**: `balance` for headings and leads, `pretty` for paragraphs, globally.
- **Header data** (`/api/account-navigation`, N6): also the name, the admin check and the rail's two counts.
- **Route rules** in `lib/shell.ts` (`getShellLayout`, `stripItems`, `currentStripKey`, `listingBreadcrumbs`).

No product rule, route, query of product data, schema or authorization changed. The only data-reading change is N6 (owner-approved): the header's state endpoint reads the user's own name, the existing `is_admin` check and the two counts the account layout already reads, with the same RLS client.

## Checks

- `pnpm lint`, `pnpm typecheck`, `pnpm build`: pass (final run on a clean `.next`, without the temporary 500 route).
- `pnpm test`: 275/275 (258 before UX-2; 271 after the 2 Oct fix; 274 with the 3 Oct hybrid; 275 with the 7 Oct guard for `hidden` panels). `tests/ux-shell.test.cjs` now has 17 tests.
- First-load JS unchanged: 101 kB shared, 113 kB on the home, 135 kB on the catalog (same as before UX-2).

## Evidence setup

Production builds (`next build` + `next start`, Chromium through `agent-browser`) against local Supabase only; no hosted data. Test accounts, all local: a Particular, a Store Owner with an active verified store "Tienda Prueba UX", and an Admin (`app_metadata.role = "admin"`), as `scripts/ux-local-accounts.cjs` now creates them. The 500 page was rendered through a temporary route that throws (`app/ux2-prueba-error`), used for the captures and the audit and deleted before the final build; it is in no commit.

- **1 Oct (the numbers in the criteria below):** the owner's local Supabase stack, which besides this branch's 19 migrations also carried 17 later migrations from the catalog branch (`20260927…` to `20261013…`). UX-2 reads none of their tables.
- **2 Oct (re-verification for the external review):** an archive of the branch, built and served separately, on a new local stack started from this branch only (19 migrations + `supabase/seed.sql`), accounts from `scripts/ux-local-accounts.cjs`, the audit from `scripts/ux-audit.cjs`. Results in § Review preparation. `review-guide.md` § 4–6 gives the steps.

## Acceptance criteria

| # | Criterion | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | Header, strip, menus, breadcrumbs, frames, footers, 404 and 500 match the brief at 390 / 768 / 1280 / 1440, signed out and as Particular, Store Owner and Admin | Harness: 132 "after" captures (33 routes × 4 widths: public signed out; Particular, Store Owner and Admin, each also on the catalog) plus the 500 page at all four widths. Measured in the browser (table below). Concept comparisons: catalog (Catalogo-1440/390), listing (Ficha-390), account (Cuenta-1440/390), publishing (Publicar-390), Admin (Admin-1440), home footer (R-Inicio-1440/390) | Met, with the deviations listed below |
| 2 | N1–N5 and G1 applied; audit items 1, 1b, 5, 10, 14 and 17 applied with the brief's values | N1 onDark outline "Vender" (36 px; the border colour differs, see deviation 1). N2 hairline removed. N3 nothing sticky (test). N4 compact phone header, no bottom bar. N5 full / slim / none (test). G1 "Instrumentos" in the header strip, footer, breadcrumbs and structured data. Items 1 (36 / 32 / 28 / 24 px), 1b, 5, 10 (both ends on the gutter at every width), 14 (global rule), 17 (one placeholder, text changed by N8) | Met; the placeholder text follows N8 instead of item 17 |
| 3 | "Listados" no longer appears in the interface; "Para tiendas" is gone from the header; tests updated without weakening them | `grep` finds neither in `app`, `components`, `components_v0`, `lib`. The copy test lost its "Listados" exception and now rejects "Listado" in any case (it only caught lower case before) and "Para tiendas"; the header test asserts the sell entry's destination per account type | Met |
| 4 | The keyboard walk and axe on the 8 harness templates show no regressions against UX-1 | axe-core 4.11.4, WCAG 2.1 A/AA, on the UX-1 templates (home, catalog, listing, store, sign-in, Particular Resumen and Publicar, Admin) at 390 and 1440: **0 violations** (UX-1: 0). Focus sweep: **541** visible focusable elements, **0** without a 2 px ring (UX-1: 0 of 682. The totals are not comparable one to one: the mega-menu's category buttons and the old header links are gone, and closed menus stay hidden). Skip link first and landing on `<main>` on every run; one `<main>` and one `<h1>` per page. Extra runs (category, 404, 500, signed-in catalog, Store Owner): 0 violations, 0 missing rings; 852 focusables in all 26 runs. With each menu open (account menu at 390 and 1440, account switcher, Admin menu, phone search): 0 violations. Tab order in the header and the strip follows the visual order on every run. Reproduced on the clean stack on 2 Oct with the same numbers; the Admin 404s added then also pass (§ Review preparation) | Met |
| 5 | Before/after captures with `scripts/ux-snapshots.cjs`; selected frames in `screenshots/ux2-before/` and `screenshots/ux2-after/` | Local sets `.ux-snapshots/ux2-before/` (132) and `.ux-snapshots/ux2-after/` (132, plus the 500 page at four widths), gitignored. Repo: 24 "before" and 26 "after" WebP frames with the same names: the 8 UX-1 templates, the 404 and the Store Owner Resumen at 390 and 1440, the catalog at 768, the category page at 390, the signed-in catalog at 1440 and the account frame at 768; the 500 page (390, 1440) exists only after. *Refreshed 7 Oct: the after frames show the build as amended (hybrid menus, N11, the Admin accordion fix).* | Met |
| 6 | `pnpm lint`, `typecheck`, `test` and `build` pass | Checks above | Met |
| 7 | `docs/design-system.md` updated; `ux-2-acceptance.md` written | New section "Shell and navigation" (route table, logo sizes, header and its button rule, menus, strip, breadcrumbs, frames, footers, 404/500), the text-wrap rule under Typography, the `<main>` rule, focus on light panels, the glossary row for "Instrumentos", the logo note under Brand touchpoints | Met |

### Measurements (production build, Chrome)

| Width | Bar | Logo | Search | "Vender" | Right edge of the last item | Strip | Page overflow |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1440 | 64 | 68×36 at x 32 | 680×44, 28 px after the logo | 36 px | 1408 (gutter 32) | 48 + 1, fits; "Tiendas verificadas" ends at 1408 | none |
| 1280 | 64 | 68×36 | 680×44 | 36 px | 1248 | fits | none |
| 1024 | 64 | 68×36 | 680 (signed out) / 604 (signed in) | 36 px | 992 | scrolls | none |
| 900 | 64 | 68×36 at x 24 | shrinks first; labels visible from 900 | 36 px | 876 (gutter 24) | scrolls | none |
| 768 | 64 | 68×36 | shrinks; "Ingresar" / "Mi cuenta" as icons | 36 px, 16 px after the search | icon on the gutter | scrolls | none |
| 390 | 56 | 61×32 at x 16 | row under the bar, 44 px (browse pages, home) | 36 px look, 44 px target | icon edge at 374 (gutter 16) | 44 + 1, scrolls | none |

200% zoom (640 and 720 CSS px, which render the phone layout): no horizontal scroll on the home, catalog, listing, account, Admin and legal pages. Worst case on a phone (a store owner without a store, "Solicitud de tienda", on a listing page with the search icon, bell and avatar): fits at 390 without overflow.

Layout shift from the shell (Chrome layout-instability entries, 1.5 s after load, same probe on both builds):

| Visitor | Width | Before UX-2 | After UX-2 |
| --- | --- | --- | --- |
| Signed out (home, catalog, listing) | 390, 1440 | 0 | 0 |
| Signed in (home, catalog, listing, Resumen) | 390 | 0.0357 (the old header re-wrapped and pushed the page down) | 0.0012–0.0016 |
| Signed in | 1440 | 0.0023 | 0.0004 |

The remaining shift for a signed-in visitor is the actions group moving left when the bell and avatar replace the space kept for "Ingresar". The brief asks for none; removing it would need the signed-in state at server render (a cookie read in the root layout, which makes every page dynamic), so it stays, far under the 0.1 budget and well below the shell it replaces.

## Deviations from the brief (for the owner)

1. **"Vender" border colour (N9, decided 7 Oct: keep white at 40%).** N1 names a 1 px #4B5563 border. On the frame black that is 2.6:1, below the design system's 3:1 rule for control boundaries, so the button uses the existing `onDark` variant (white at 40%, about 3.7:1). The button is otherwise as N1 says (white text, 36 px, outline). Kept as built (N9).
2. **Search placeholder (N8, decided).** The brief's "Marca, modelo o instrumento" would promise model and instrument search; the catalog matches the brand only. The placeholder is "Busca por marca: Yamaha, Fender…". Free-text search is logged for UX-3.
3. **"Registrar mi tienda" goes to `/registrar-tienda`**, not `/registro/tienda` (N10, decided 7 Oct: keep `/registrar-tienda`). It is the existing gate: a signed-out visitor gets "Crear cuenta de Tienda" (`/registro/tienda`) or "Ingresar", a signed-in Particular is told a store needs its own account, a store owner lands on their store. The brief's path would drop a signed-in visitor into the sign-up form. Kept as built (N10).
4. **Full footer promise.** The concept's line is "…Laria no cobra comisiones ni procesa pagos." The footer carried the full limitation before (LEGAL-005 evidence, pinned by `tests/sprint-9.test.cjs`), so the brand column now reads "El mercado de instrumentos y audio profesional del Perú. Laria no cobra comisiones, no procesa pagos, no retiene dinero, no gestiona envíos ni garantiza el equipo ni las transacciones." The slim footer uses the brief's copy exactly.
5. **Footer links that don't exist yet are left out** ("Cómo funciona Laria", "Consejos para vender"). Explora lists Instrumentos, Guitarras, Baterías, Pedales and Tiendas verificadas (the concept's three categories); the phone footer shows six links in two columns (Instrumentos in place of "Cómo funciona Laria").
6. **Phone breadcrumbs on browse pages (N11, decided 7 Oct and built: listing pages only).** As first built, the brief's rule (phones show only the back link) applied on the catalog ("‹ Inicio") and the category landings ("‹ Instrumentos") as well as the listing; the Catalogo-390 concept shows no back link on browse pages. Now only the listing has it; on phones the catalog and the category landings show no breadcrumb.
7. **Publishing header** reduces to the logo and the account entry on phones only (the brief and Publicar-390 describe the phone); from 768 px the standard header stays.
8. **Small print 12 px on phones** in both footers, so the promise line fits one line and the slim footer stays at two lines as the brief asks (13 px from 640 px).
9. **Admin sidebar**: "Moderación" carries the total of the moderation queues; the other sections are record views without a pending count of their own. The name and role sit at the bottom of the first screen; on a long page the black column continues below them (nothing sticky).
10. **Account menu** starts with the name and the account type as a heading (not in the brief; a label, no new action). Its rows are 44 px on phones and 36 px from 768 px.
11. **Two search rows in the header markup**, never shown together: inline from 768 px, and on phones a row that follows the bar's actions, so Tab follows the visual order at both sizes (a single element placed by CSS would tab out of order on one of them).

## Spec and acceptance rows touched (not edited; N12 recording open)

*As written on 1–2 Oct, before the hybrid. For the current state, row by row, see § What still needs owner acceptance.*

No row of `acceptance/cases.tsv` and no line of `docs/functional-spec.md` was edited. These describe the shell UX-2 replaced; the owner decides whether to reword and re-run them:

- **PUB-008** (shared header and categories on public, auth, account and Admin routes) and functional-spec "Sprint 5 owner navigation clarification": after UX-2 the category strip is not on account or Admin pages, and Admin has its own frame without the header search (brief: page frames). Search stays on public and account pages (and on phones on browse pages, the home and behind an icon on listings).
- **PUB-011 to PUB-015** (mega-menu and mobile category accordion) and the "Sprint 6 implementation clarification": the mega-menu is replaced by the category strip (links to the eight category landings; instrument types stay on each category page as chips). The closing behaviour those rows test now applies to every shell menu (`useDisclosure`).
- **PUB-009** (header search submits the brand to `/listados`): unchanged behaviour.
- **LEGAL-001 to LEGAL-004** evidence and functional-spec §Legal/safety pages say the pages are linked from the global footer: the home's full footer links all four; the slim footer links Consejos de seguridad, Términos y reglas and Privacidad (brief). "Artículos prohibidos" is still linked from the sell form's rules and the home footer. **LEGAL-005/006** (Not Run, owner review pending): the full footer keeps the whole limitation; the slim footer states no commissions and no payment processing.

Proposed spec wording, if you want it recorded: "UX-2 clarification (30 Sep 2026): the site shell is a black header with the brand search, a category strip on public pages (Instrumentos, the eight categories, Tiendas verificadas) and breadcrumbs; account pages keep the header without the strip; Admin has its own frame without the public header. The mega-menu is retired; instrument types are reached from each category page."

## Tests

Updated to the new shell, same or stronger assertions:
- `tests/account-shell.test.cjs`: `getHeaderNavigation` became `getSellEntry`; the test pins each account type's destination and label and that the header offers no store registration to anyone (was: only to signed-in accounts). The phone switcher is asserted as a disclosure button (`aria-expanded`, `hidden`) instead of `<details>`.
- `tests/sprint-6.test.cjs`: the mega-menu test now pins the strip's canonical taxonomy and `aria-current`, and the closing behaviour (route change, outside press, Escape with focus return) of the shared disclosure used by every shell menu.
- `tests/sprint-8.test.cjs`: Admin sidebar and phone menu button instead of `<details>`/`<summary>`.
- `tests/sprint-9-gate.test.cjs`: the strip and the listing breadcrumbs build category and type links only through `categoryLandingPath` / `categoryTypePath` (behavioural checks on `stripItems` and `listingBreadcrumbs` instead of source strings of the mega-menu).
- `tests/sprint-9.test.cjs`: the full footer keeps the whole limitation (plus "no cobra comisiones") and all legal links, `/listados` and `/registrar-tienda`; the slim footer's three links and promise are asserted; the listing breadcrumb goes through `listingBreadcrumbs`.
- `tests/ux-copy.test.cjs`: "Listados" exception removed; "Listado" rejected in any case; "Para tiendas" added.
- `tests/ux-contrast.test.cjs`: the frame-children allowance for the deleted `site-header-controls.tsx` is gone (every frame component declares `surface-frame`).
- `tests/seo-smoke.test.cjs`: fixtures say "Instrumentos" like the real breadcrumb data.
- `tests/favorites-browser-smoke.cjs` (browser smoke, not run here): its per-page shell check now expects the header search everywhere except Admin and the strip on public pages except the home; on phones it checks the strip scrolls without page overflow and opens the account switcher (was: the old category accordion and `<details>`); the search steps run at 1280, where the header search is visible on account pages; sign-out goes through the header's account menu (the rail is no longer an `<aside>`); the store owner's header is recognised by its "Publicar" entry (every account now reads "Mi cuenta").

New: `tests/ux-shell.test.cjs` (frame per route, nothing sticky, strip items and current item, header signed out / signed in / per template, header endpoint fields, breadcrumbs, footers, 404/500, logo file and sizes, text-wrap rule).

Harness: `scripts/ux-snapshots.cjs` also opens the catalog in each signed-in group and a listing for the Particular, so the signed-in header is captured on public pages.

## Known limitations

- The strip marks no current item on listing and store pages (the shell does not know a listing's category from its URL); the breadcrumb names it on listings. Store pages have no breadcrumb yet (UX-4).
- The home keeps its UX-1 hero (UX-3). On phones the header's search row now sits above the hero's search-looking link to the catalog until the banner search replaces it.
- A signed-in visitor sees the header's account entry appear after the account check; the space is kept, but "Vender" moves left by the width difference (layout shift 0.0004–0.0016, table above). Without JavaScript the "Ingresar" link comes from a `<noscript>` copy.
- The header's account data (name, admin, counts) is read on every navigation, like the signed-in state before; a failed count shows no badge rather than an error.
- Integration and browser-smoke scripts that need a hosted or seeded Supabase (`tests/*.integration.cjs`, `*-browser-smoke.cjs`) were not run. One drove the old shell and was updated (see Tests); the others do not touch it.
- Local seed photos are placeholders, so full-page captures show grey or lettered photo areas.
- Tested in Chromium only (agent-browser); not on Safari/WebKit or Firefox, not with a screen reader, not on touch devices, not on a deployment (network performance).
- 3 Oct, hybrid:
  - **Client transitions between catalog URLs.** Some transitions between two `/listados` URLs never complete (root cause not identified). The shell avoids it with native links. *7 Oct: measured; it arrived with UX-1, pagination is not affected (§ Owner answers (7 Oct)); the fix is UX-3's.*
  - **The pre-existing #418** on listing pages (§ Hybrid) keeps the strict browser smoke from passing end to end; it passes when only that error is tolerated.
  - **The root `FallbackMain`** (an error thrown by the Admin layout itself) has not been induced; Admin page errors and both Admin 404 depths were. *7 Oct: induced; one `<main>`, axe 0, navigable, no frame (§ Owner answers (7 Oct)).*
  - **The home shows the strip** until the UX-3 home header brings its own "Categorías" menu. On phones the publishing pages keep their focused frame without the strip.

## Review preparation (2 Oct)

Everything below was done to make the evidence reproducible by someone outside the project; `review-guide.md` is the entry point.

- **Clean re-verification.** On a separate local stack built only from this branch (see § Evidence setup), the unit suite passed and `scripts/ux-audit.cjs` reproduced the 1 Oct numbers exactly: 26 template runs, 0 axe violations (also with each menu open), 852 focusable elements all with a visible ring, 0 Tab-order and 0 skip-link problems, one `<main>` and one `<h1>` on every page, no overflow at 390 / 1440 or at 200% zoom, layout shift at most 0.0016. After the fix below, a second clean pass with the two Admin 404s added (30 runs): 0 axe violations, 885 focusable elements all with a ring, and the same results everywhere else; the unit suite passed 271/271. Table in `review-guide.md` § 6.4.
- **Defect found and fixed (`37d441b`).** A 404 for an unknown Admin section (`/admin/no-existe`) rendered with no `<main>`, no header and no sidebar: Next renders the root `not-found` outside the Admin layout, and on `/admin` paths the shell leaves `<main>` to that layout. Errors thrown in Admin pages had the same gap. Now `app/admin/not-found.tsx` and `app/admin/error.tsx` render the 404/500 body inside the Admin frame, and the root `not-found` and `error` add a `<main>` (`FallbackMain`) only where the shell has none (an unmatched deeper `/admin/…` URL, a crash in the Admin layout). Covered by a new test in `tests/ux-shell.test.cjs` and by the Admin 404 runs in `scripts/ux-audit.cjs`. 404s under `/mi-cuenta` and public paths were already correct (shell header, one `<main>`).
- **Reproducibility.** `scripts/ux-local-accounts.cjs` (the three local accounts and the store) and `scripts/ux-audit.cjs` (all accessibility and layout-shift checks) replace the one-off scripts used on 1 Oct. `scripts/ux-snapshots.cjs` is unchanged.
- **Open decisions** moved into `decisions.md`: N9–N12 (the deviations below) and F9 (free-text search).

## External-review fixes (3 Oct)

- The external report `reviews/ux-2-external-review.md` identified a deeper Admin 404 that lost the Admin frame (UX2-R01). `app/admin/[section]/[...rest]/page.tsx` now calls `notFound()` inside the Admin layout. The route-level audit asserts Admin navigation and the absence of the public header/footer, in addition to one `<main>` and `<h1>`. Anonymous access redirects to `/login?next=%2Fadmin`; authenticated shallow and deeper 404s pass at 390 and 1440 px. The root `FallbackMain` still handles failures above that layout; an induced Admin-layout failure was not tested on 3 Oct.
- The mobile-strip coverage gap (UX2-R03) is closed in `scripts/ux-audit.cjs`: at 390 and 768 px it verifies sideways overflow, actual movement, reachability of the last item, no page overflow and the "Tiendas verificadas" destination. This surfaced a stalled client transition from unfiltered `/listados`; `components/global-categories.tsx` now uses a native anchor for that item. Both widths passed after the fix.
- Verification on an isolated production copy on port 3105, with the local Supabase stack and UX accounts: Next build, ESLint, TypeScript and the configured Node suite (**271/271**) pass. Final browser audit: **28 template runs**, zero axe violations (including five menus open), zero missing focus rings among **840** visible focusables, zero Tab-order/skip-link failures, zero overflow, zero wrong `<main>`/`<h1>` counts, zero frame failures and zero strip failures; maximum measured layout shift **0.0016**. The temporary 500 route was not used in this pass. The report is `.ux-snapshots/ux2-fix-final/audit.json` in the isolated verification copy; it is gitignored.
- UX2-R02 / N12 remains for the owner. No V1 functional-spec wording or acceptance TSV status/evidence was edited. No commit, push or merge was made.

## Hybrid category navigation (3 Oct, owner N12)

The owner asked for the mega-menu's functionality back inside the UX-2 design. The amendment is in `ux-2-shell.md` § Amendment; the pre-UX-2 menu (Sprint 6) was the behavioural reference.

**What changed**
- `lib/shell.ts`:
  - `stripItems` marks "Instrumentos" and "Tiendas verificadas" as links and the eight categories as menus.
  - `categoryMenus` gives each category "Ver todos" (its landing) and its canonical types through `categoryTypePath`.
  - `isCatalogHref` marks catalog URLs.
  - `getShellLayout` puts the strip on every page with the public header (home, listing, legal, sign-in, 404/500 and account pages, every width), on the publishing pages from 768 px, and never in Admin.
- `components/global-categories.tsx`:
  - Category disclosure buttons and `CategoryPanel`, which renders after its button and is positioned across the page under the strip.
  - A stacked list with 44 px rows on phones.
- `components/use-disclosure.ts`: `useDisclosureGroup`, the same closing rules for a row of buttons sharing one panel.
- `components/shell-link.tsx`: catalog URLs as native links, other routes as client links.
- `components/category-accordion.tsx` and `components/admin-navigation.tsx`: "Explorar categorías" in the Admin sidebar and phone "Menú", with an in-place accordion that handles Esc level by level.
- Tests: `tests/ux-shell.test.cjs` (frames per route, strip buttons and links, panel destinations, Admin entry); `tests/sprint-6.test.cjs` (pins the mega-menu again: one panel, canonical taxonomy, closing rules); `tests/sprint-9-gate.test.cjs` (every type link through `categoryTypePath`); `tests/favorites-browser-smoke.cjs` (the strip's menu on every non-Admin page, the phone panel and Esc).
- `scripts/ux-audit.cjs`: category-menu checks at 390 / 768 / 1440, on account pages and in Admin (below).
- The browser smoke (`tests/favorites-browser-smoke.cjs`, run through `tests/favorites.integration.cjs` with `LARIA_FAVORITES_BROWSER=1`) was run on a separate local stack built from this branch, with its own fixtures, removed afterwards; the shared local database was not used.

**Found while building it**
- **A second instance of the stalled link (UX2-R03):** "Instrumentos" clicked on a filtered catalog (`/listados?seller_type=verified_store`) never left it. A client transition between two `/listados` URLs fetches the page data (HTTP 200) but never commits; reproduced in both directions.
  - All shell links into the catalog are now native links (`ShellLink`), the same rule as the applied-filter chips. That covers "Instrumentos", "Tiendas verificadas" and every type link; Codex's working destination for "Tiendas verificadas" is unchanged.
  - The root cause is not identified. The catalog's own pagination uses client links to `/listados?page=N` and may have the same problem. That code is UX-3's and was not changed.
- **Panel placement:** a panel placed after the whole strip would have made a keyboard user Tab through the remaining categories before reaching it. Each panel now follows its own button.
- **A hydration error that predates UX-2** stops the browser smoke at its sign-in step. A listing page for a freshly created listing with two Storage photos logs React error #418 in production builds:
  - this build: 4 of 4 sessions; the pre-UX-2 build `645d51e`: 3 of 4, against the same fixture on the isolated stack;
  - none in `next dev`, none on the seed listings (16 sessions);
  - UX-1 recorded the same error as pre-existing on listing pages. The cause sits in the listing page content (UX-4) and is not fixed here.
- **Esc in Admin's phone "Menú" closed too much.** Esc inside "Explorar categorías" closed the whole phone "Menú" as well as the inner level (found by the audit at 390).
  - Cause: Next.js hydrates React on `document`, so React's handler and the menu's own Esc listener sit on the same node, and `stopPropagation` cannot separate them.
  - Fix: the accordion marks its Esc handled (`preventDefault`), and every shell menu ignores an Esc already handled inside it.
  - Checked by hand at 390: each Esc closes one level, with focus back on that level's button, the third closing "Menú".
- **A behaviour of the browser tool, not the app:** a few seconds after a run of Esc, Enter and Tab presses, agent-browser navigates its tab to `about:blank`; reproduced on a bare HTML page with no app code. This explained intermittent audit failures (a hung click, a blank page after "Ver todos"); by hand, the same steps work. `scripts/ux-audit.cjs` now runs the keyboard checks in their own browser sessions. If a menu-button click still hangs, it retries once as a DOM click after 30 s and records that (none needed in the final run).
- **Two stale assertions in the browser smoke, corrected:**
  - it expected an anonymous visit to `/admin` to stay there; since Sprint 8 the server sends it to sign-in, and the smoke now asserts that redirect with `next=/admin`;
  - it expected a sold favorite to read "Vendido"; UX-1's status dictionary says "Vendida".

**Evidence** (production build, local Supabase, the local Particular, Store Owner and Admin):

- **Checks:** `pnpm lint`, `pnpm typecheck` and `pnpm build` pass on a clean `.next`; `pnpm test` **274/274** (271 before the hybrid; 3 new tests in `tests/ux-shell.test.cjs`, and the sprint-6 and sprint-9-gate tests pin the restored menu). First-load JS: 101 kB shared, home 113 kB and catalog 135 kB as before; Admin 196 kB (+1 kB for the accordion).
- **`scripts/ux-audit.cjs`** (report `.ux-snapshots/hybrid/audit.json`, gitignored), production build on the shared local stack with the local Particular, Store Owner and Admin, the 500 page through the temporary route:
  - **Templates (30 runs at 390 and 1440):** home, catalog, category, listing, store, sign-in, 404, 500, Particular Resumen / catalog / Publicar, Store Owner Resumen, Admin and both Admin 404 depths.
    - 0 axe violations; 1,011 focusables, 0 without a ring; 0 Tab-order and 0 skip-link problems; one `<main>` and `<h1>` everywhere; 0 frame failures; no page overflow.
    - The 8 UX-1 templates: 16 runs, 612 focusables, 0 without a ring, 0 axe.
  - **Strip sideways access** (Codex's check) at 390 and 768: pass, including the "Tiendas verificadas" destination.
  - **Category menus, 34 checks, 0 failures, no fallback clicks:**
    - At 390, 768 and 1440: opens with "Ver todos" and its 3 types (axe 0 with it open); Esc returns focus to the button; Tab goes from the button to "Ver todos"; one panel at a time; an outside press closes it; "Ver todos" reaches the landing; a type link reaches `/listados?category=guitars&instrument_type=electric_guitar` with the filter applied; "Instrumentos" leaves a filtered catalog.
    - Account pages, 390 and 1440: the panel closes when the account menu opens, and reaches its destination.
    - Admin, 390 and 1440: "Explorar categorías" opens without the public header or footer, with 26+ category and type links and axe 0; "Ver todos" reaches the landing; Esc closes one level at a time.
  - **Other shell menus open** (account menu at 390 and 1440, account switcher, Admin "Menú", phone search): 0 axe violations.
  - **200% zoom:** 12 page loads at 640 and 720 px, no overflow.
  - **Layout shift:** 0 signed out; 0.0012–0.0016 signed in at 390 and 0.0004 at 1440, as before the hybrid.
- **Admin after hydration** (isolated stack, by hand, 390 and 1440): both 404 depths (`/admin/no-existe`, `/admin/no-existe/de-verdad`) and an error thrown in an Admin page (temporary route in the scratch copy) show one `<main>`, the Admin navigation with "Explorar categorías", and no public header or footer.
- **Browser smoke** (`tests/favorites.integration.cjs` with `LARIA_FAVORITES_BROWSER=1`, isolated stack, fixtures removed afterwards):
  - Strict (as committed): stops at its sign-in step on the pre-existing #418 (§ Found while building).
  - With only that error tolerated, in a scratch copy: passes end to end. That covers the shell check on every page it opens, the phone category panel with its Esc, the account switcher, the search steps, both favourite-history checks and the integration assertions.
  - On a separate stack the 3 Oct audit was not repeated; the 2 Oct clean-stack results are in `review-guide.md` § 6.4.

## Owner answers (7 Oct)

Asked on 4 Oct as nine questions, each with a recommended option; on 7 Oct the owner answered "go with your recommendations". Recorded in `decisions.md` (N9–N14).

| # | Question | Options offered | Taken |
| --- | --- | --- | --- |
| 1 | N9 "Vender" border | a) keep white at 40% (3.7:1) · b) #4B5563 (2.6:1, needs an exception to the 3:1 rule) | a |
| 2 | N10 "Registrar mi tienda" | a) keep `/registrar-tienda` · b) `/registro/tienda` | a |
| 3 | N11 phone back links | a) listing pages only · b) catalog, category landings and listings (as first built) | a: built |
| 4 | N12, build side | a) keep the build, reword the record · b) search back in Admin and on phone account/legal/sign-in pages · c) an accordion on phones | a |
| 5 | N12, record side | a) Claude drafts the wording and re-runs the rows, the owner records · b) the owner does it all · c) reconcile at merge | a: `ux-2-reconciliation.md` |
| 6 | Known issues before acceptance | a) induce the Admin-layout failure and check whether pagination stalls, comparing with the pre-UX-2 build · b) only the first · c) leave them | a: below |
| 7 | Rebase on `main` | a) now · b) once, at merge time | b (N13) |
| 8 | Human-only checks | a) Safari + VoiceOver on the owner's Mac now, phones later · b) all to UX-8 | a (N14): steps on the review page |
| 9 | How to review | a) one checklist page with Correct/Wrong per check · b) walk the build with `review-guide.md` | a |

**N11, built.** `Breadcrumbs` takes `phoneBackLink`; only `app/instrumentos/[slug]/page.tsx` passes it. On the catalog and the category landings the whole trail is hidden below 768 px (no empty landmark, no back link); the listing keeps "‹ <parent>". `tests/ux-shell.test.cjs` pins both cases and the call sites; `tests/sprint-9.test.cjs` pins the listing call.

**The Admin-layout failure, induced** (scratch copy of this build, never committed: `app/admin/layout.tsx` throws when a probe cookie is set; `next start` on its own port, local Supabase). `/admin` answers HTTP 500. After hydration, at 1440 and 390: one `<main id="contenido">` (the root `FallbackMain`), the 500 body ("Algo salió mal", one line, the search, "Ir al inicio" · "Ver instrumentos"), the skip link, no public header or footer, no Admin navigation (its layout is what failed), no overflow; axe-core 4.11.4 WCAG 2.1 A/AA: 0 violations at both widths. The server HTML carries no `<main>` yet: Next renders an error boundary on the client, as for any server error. The page has no logo or frame; it is navigable through its search and two links.

**Catalog transitions, measured** (production builds with the page size lowered to 2 in scratch copies so that pagination appears with the 14 local listings; client navigation through `window.next.router.push`, 6 s per trial):

| Build | `/listados` → `?seller_type=verified_store` | `/listados` → `?page=2` | `/listados` → `?category=guitars` |
| --- | --- | --- | --- |
| `main` `49a38e5` (before UX-1) | 16 of 16 complete | complete | complete |
| `645d51e` (UX-1, before UX-2) | 3 of 7 stall | complete | complete |
| This branch | 14 of 18 stall | 9 of 9 complete | complete |

- The stall arrived with UX-1, not UX-2, so under the owner's rule it stays with UX-3 (`roadmap.md` § UX-3 starts by finding it in UX-1's twelve commits).
- Catalog pagination is not affected.
- No link in the current interface makes the stalling move: the shell's catalog links, the applied-filter chips, the filter form and the sort links are all native.
- The listing's phone back link (kept by N11) is a client link into a filtered catalog, from outside the catalog. From a listing to `/listados?category=guitars&instrument_type=electric_guitar` it completed 6 of 6 trials on this build.
- When it stalls, the page data is fetched (HTTP 200) and no error reaches the console.

**Defect found and fixed while preparing the review page: Admin's "Explorar categorías" never collapsed.**
- **What happened:** the lists under "Explorar categorías" toggle with the `hidden` attribute, but each also carried Tailwind's `grid`, and a display class overrides `hidden`'s `display: none`. So the whole tree (eight categories and their types) stayed on screen in the Admin sidebar and the phone "Menú", open or closed.
- **What hid it:**
  - the buttons' `aria-expanded` and the Esc handling were right;
  - the audit counted links and checked `aria-expanded`, not visibility;
  - the 3 Oct by-hand check looked at each level opening, not at closed levels.
- **Fix** (`components/category-accordion.tsx`): no display class on those lists, with a comment saying why.
- **Guards:**
  - `tests/ux-shell.test.cjs` now fails when any element toggled by `hidden={…}` also carries a display utility (checked: it fails with the old class and passes without it; it covers the 5 such elements in `components/`: the two accordion lists, the account menu, the account switcher and the Admin "Menú");
  - `scripts/ux-audit.cjs` asserts that no link inside a closed Admin level is visible, before and after opening "Guitarras".
- **Other panels:** the account menu, the account switcher, the Admin "Menú" and the category panels (rendered only when open) were not affected.

**Checks after the 7 Oct changes** (production build at `a689a1e`, shared local stack, local accounts):
- `pnpm lint`, `pnpm typecheck`, `pnpm build` pass on a clean `.next`; first-load JS unchanged (101 kB shared, home 113 kB, catalog 135 kB, Admin 196 kB).
- `pnpm test` **275/275**.
- `scripts/ux-audit.cjs` (`.ux-snapshots/ux2-n11/audit.json`, gitignored), 28 template runs at 390 and 1440 (the temporary 500 route was not used):
  - 0 axe violations; 964 focusables, 0 without a ring; 0 Tab-order, skip-link, `<main>`/`<h1>`, frame, strip or overflow problems;
  - 34 category-menu checks, 0 failures and no fallback clicks, including the new Admin check (closed levels show 0 links at 390 and 1440);
  - 200% zoom: no overflow; layout shift at most 0.0016.

**N12 re-runs:** `ux-2-reconciliation.md` (row by row, with the proposed wording). Report: `.ux-snapshots/n12-rerun/pub-rerun.json` (gitignored).

## Owner acceptance (8 Oct)

The owner marked the review page (https://claude.ai/artifact/XQRP7EMmb4sACMtZ8G3BJx) on 8 Oct: **22 of 22 checks Correct, no notes.** Claude Code read the answers from the page's store; no answer was inferred.

| Section | Checks | Result |
| --- | --- | --- |
| A. The shell, as amended | A01–A10: header and strip, desktop and phone menus, new strip placements, N11 phone breadcrumbs, account and publishing frames, Admin "Explorar categorías" (fixed 7 Oct), footers (N10), 404/500 and the frameless Admin-layout failure page | all Correct |
| B. N12 record drafts | B01–B06: the proposed spec clarification and the PUB-008–PUB-015 observations and wording | all Correct: fine for the owner to record |
| C. Safari and VoiceOver on the owner's Mac (N14) | C0–C4: the build runs; menus by mouse and keyboard; phone size in Responsive Design Mode; VoiceOver on the public shell, the account menu and Admin | all Correct |
| D. Decision | D1: accept UX-2 as amended | **Accepted** |

**Still open after acceptance** (none blocks UX-3):
- **N12 recording:** the owner writes the spec clarification and the PUB-008–PUB-015 status and evidence from `ux-2-reconciliation.md` into `docs/functional-spec.md` and `acceptance/cases.tsv` (not done as of 8 Oct; Claude Code does not edit them).
- **Real devices** (iPhone and Android with touch, TalkBack/NVDA) and a deployment: UX-8 (N14).
- **Known limitations** above, owned by later sub-sprints: the catalog transition stall (UX-3), React #418 on fresh listing pages (UX-4), no current strip item on listing and store pages and no store breadcrumbs (UX-4).

## What still needed owner acceptance (as of 7 Oct)

*Kept as written before the 8 Oct acceptance.* Nothing below was decided or marked by the build. `acceptance/cases.tsv` and `docs/functional-spec.md` are unchanged, and no owner or manual Pass was inferred.

1. **UX-2 as amended.**
   - The owner's review page (§ Owner answers, question 9): https://claude.ai/artifact/XQRP7EMmb4sACMtZ8G3BJx (private; Correct/Wrong per check with screenshots, the N12 drafts, the Safari + VoiceOver steps, and the final accept/not-yet).
   - Accept or reject the shell against `ux-2-shell.md`, its criteria 1–7 and the 3 Oct amendment.
   - New placements to look at: the strip on the home (until the UX-3 home header), on listing, legal and sign-in pages and on account pages at every width, while the publishing pages show it from 768 px only. Admin's "Explorar categorías" entry.
2. **N9–N11 are decided** (7 Oct) and applied: N9 and N10 as built, N11 built (§ Owner answers (7 Oct)).
3. **N12, recording.** The preference (3 Oct) and the build side (7 Oct) are decided. What is left is the owner's record: the spec clarification and each row's status and evidence. `ux-2-reconciliation.md` gives, row by row, what this build was observed to do on 7 Oct, the gap, proposed wording and a proposed evidence entry. The table below is the gap list as written on 3 Oct.

| Canonical item | What it says | What this build does | Gap |
| --- | --- | --- | --- |
| functional-spec, Sprint 5 navigation clarification | Category/subtype navigation **and catalog search** on public, auth, account and Admin pages | Categories and subtypes: public, auth and account pages (strip) and Admin ("Explorar categorías"). Search: public and account pages from 768 px; on phones only on the home, browse pages and (behind an icon) listings | **No search in Admin; no search on phone account, legal or sign-in pages** (UX-2 brief) |
| functional-spec, Sprint 6 implementation clarification | One-category-at-a-time desktop mega-menu **and mobile accordion** | Desktop: one panel per category. Phones: the same panel as a stacked list under the strip (a compact menu). Admin: an accordion | Wording only ("accordion"), unless the owner wants the phone form to be an accordion |
| PUB-008 (Pass, Sprint 5/6 evidence) | One root shell with logo, search, account controls and categories across public, auth, account and **Admin** routes | Root shell on public, auth and account routes; **Admin has its own frame** (no root header, search or footer) with category access in its navigation | Admin differs by design (brief + owner instruction); needs rewording and a new run |
| PUB-009 (Pass) | Header search submits the brand to `/listados`, one search receipt | Unchanged behaviour (placeholder text per N8) | Re-run optional |
| PUB-010 (Pass) | Search, categories, subtypes and account options in a narrow viewport, no overflow | Categories, subtypes and account options on phones on every public and account page; no overflow (audit). **Search** only on the home, browse pages and listings | **Search on phone account pages** (UX-2 brief) |
| PUB-011 (Pass) | Open panel shows only the selected category's types | Same (audit: one panel, its "Ver todos" and types) | Re-run on this build |
| PUB-012 (Pass) | Destinations use the canonical category and `instrument_type` values | Same helpers (unit tests; audit destinations) | Re-run on this build |
| PUB-013 (Pass) | Closes after a destination and on route change | Same (audit: closes after "Ver todos", a type, a route change) | Re-run on this build |
| PUB-014 (Pass) | Closes on outside press and Escape, focus returns to the trigger | Same (audit) | Re-run on this build |
| PUB-015 (Pass) | Mobile menu with category-specific **accordions**, no overflow, collapses after a choice or close | Compact per-category panel under the strip, no overflow, closes after a choice, Esc or an outside press | Wording ("accordions"); re-run on this build |
| LEGAL-001–004 (Pass), LEGAL-005/006 (Not Run) | Legal pages linked from the global footer; limitations stated | Unchanged since 2 Oct: the home footer links all four and states every limitation; the slim footer links three and states commissions and payments | Unchanged; see § Spec and acceptance rows touched |

4. **Checks only a person can do (N14):** the owner's Safari + VoiceOver pass on the Mac against the local build (steps on the review page). Safari/iOS and Android on real phones, TalkBack/NVDA and a deployment wait for a preview deployment or UX-8. The build was tested in Chromium only.

## How to review

1. Follow `review-guide.md` (scope, setup, checks, evidence, traceability, risk areas, report format).
2. Read `ux-2-shell.md` (the brief) and the "Shell and navigation" section of `docs/design-system.md`.
3. Compare `screenshots/ux2-before/` with `screenshots/ux2-after/` (same file names; `<width>-<group>-<route>.webp`).
4. Run the app and walk: a category page at 1440 and 390, a listing on a phone (search icon, back link), the account menu signed in, `/mi-cuenta` on a phone (switcher), `/admin` at 1440 and 390, a 404 (also `/admin/no-existe`).
5. Owner: record N12 (`ux-2-reconciliation.md`) and mark the review page.
