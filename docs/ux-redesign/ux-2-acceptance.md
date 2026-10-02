# UX-2 Shell and navigation — acceptance package

Status: **ready for owner acceptance** (1 Oct 2026; built 30 Sep–1 Oct). Implemented and audited by Claude Code on `ux/redesign` against the approved brief `ux-2-shell.md`. Prepared for an independent external review on 2 Oct (`review-guide.md`): re-verified on a clean local stack, one defect found and fixed (§ Review preparation). Nothing is pushed or merged.

| # | Commit | Content |
| --- | --- | --- |
| 1 | `645d51e` docs(ux) | UX-1 accepted; the brief and the home visual audit committed; README, decisions (N1–N7, G1), roadmap |
| 2 | `0813138` feat(ui) | The shell: header, category strip, account menu, breadcrumbs, account and Admin frames, footers, 404/500, logo hairline, text-wrap rule; tests; harness routes |
| 3 | `2d06b7e` docs(ux) | `docs/design-system.md`, this package, README status, the decision log (N8) and audit item 17 note, selected before/after frames |
| 4 | `37d441b` fix(ui) | One `<main>` on 404 and error pages under `/admin` (found while preparing the external review) |
| 5 | `cde9c5a` chore(ux) | `scripts/ux-local-accounts.cjs` and `scripts/ux-audit.cjs`, to reproduce the evidence |
| 6 | `1a96bf5` test | The favorites browser smoke's Admin check (page titles use `<header>`; the signal is the missing header search) |
| 7 | docs(ux), after `1a96bf5` | `review-guide.md`; this package, the decision log (N9–N12, F9), README, design system, roadmap and UX-1 package brought up to date; reviewer pointers in `AGENTS.md` and the root README |

## What changed

- **Header** (`components/site-header.tsx`): black bar, 64 px from 768 px and 56 px on phones; logo 68×36 / 61×32; brand search 44 px (up to 680 px, 28 px after the logo) with a 36 px icon button; "Vender" as the 36 px outline button on dark; "Ingresar", or the bell with the unread count and the avatar with "Mi cuenta" that opens the account menu; labels become icons below 900 px; the last item's visible edge on the gutter. On phones the search is a row under the bar on browse pages and the home, behind an icon on listing pages, and absent elsewhere; while publishing only the logo and the account entry remain.
- **Account menu**: the rail's sections, order and counts, "Admin" for admins, a divider, "Cerrar sesión".
- **Category strip** (`components/global-categories.tsx`, replaces the mega-menu): "Instrumentos", the eight categories, "Tiendas verificadas"; current item underlined in blue with `aria-current`; scrolls sideways when it does not fit; on public pages except the home (phones: browse pages only).
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
- `pnpm test`: 271/271 (258 before UX-2; new: `tests/ux-shell.test.cjs`, 13 tests, one of them added with the 2 Oct fix).
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
| 5 | Before/after captures with `scripts/ux-snapshots.cjs`; selected frames in `screenshots/ux2-before/` and `screenshots/ux2-after/` | Local sets `.ux-snapshots/ux2-before/` (132) and `.ux-snapshots/ux2-after/` (132, plus the 500 page at four widths), gitignored. Repo: 24 "before" and 26 "after" WebP frames with the same names: the 8 UX-1 templates, the 404 and the Store Owner Resumen at 390 and 1440, the catalog at 768, the category page at 390, the signed-in catalog at 1440 and the account frame at 768; the 500 page (390, 1440) exists only after | Met |
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

1. **"Vender" border colour (open: N9).** N1 names a 1 px #4B5563 border. On the frame black that is 2.6:1, below the design system's 3:1 rule for control boundaries, so the button uses the existing `onDark` variant (white at 40%, about 3.7:1). The button is otherwise as N1 says (white text, 36 px, outline). Changing it is one class if you prefer #4B5563.
2. **Search placeholder (N8, decided).** The brief's "Marca, modelo o instrumento" would promise model and instrument search; the catalog matches the brand only. The placeholder is "Busca por marca: Yamaha, Fender…". Free-text search is logged for UX-3.
3. **"Registrar mi tienda" goes to `/registrar-tienda`**, not `/registro/tienda` (open: N10). It is the existing gate: a signed-out visitor gets "Crear cuenta de Tienda" (`/registro/tienda`) or "Ingresar", a signed-in Particular is told a store needs its own account, a store owner lands on their store. The brief's path would drop a signed-in visitor into the sign-up form. One string to change if you prefer the direct link.
4. **Full footer promise.** The concept's line is "…Laria no cobra comisiones ni procesa pagos." The footer carried the full limitation before (LEGAL-005 evidence, pinned by `tests/sprint-9.test.cjs`), so the brand column now reads "El mercado de instrumentos y audio profesional del Perú. Laria no cobra comisiones, no procesa pagos, no retiene dinero, no gestiona envíos ni garantiza el equipo ni las transacciones." The slim footer uses the brief's copy exactly.
5. **Footer links that don't exist yet are left out** ("Cómo funciona Laria", "Consejos para vender"). Explora lists Instrumentos, Guitarras, Baterías, Pedales and Tiendas verificadas (the concept's three categories); the phone footer shows six links in two columns (Instrumentos in place of "Cómo funciona Laria").
6. **Phone breadcrumbs on browse pages (open: N11).** The brief's rule (phones show only the back link) is applied on the catalog ("‹ Inicio") and the category landings ("‹ Instrumentos") as well as the listing; the Catalogo-390 concept shows no back link on browse pages. Easy to limit to the listing page.
7. **Publishing header** reduces to the logo and the account entry on phones only (the brief and Publicar-390 describe the phone); from 768 px the standard header stays.
8. **Small print 12 px on phones** in both footers, so the promise line fits one line and the slim footer stays at two lines as the brief asks (13 px from 640 px).
9. **Admin sidebar**: "Moderación" carries the total of the moderation queues; the other sections are record views without a pending count of their own. The name and role sit at the bottom of the first screen; on a long page the black column continues below them (nothing sticky).
10. **Account menu** starts with the name and the account type as a heading (not in the brief; a label, no new action). Its rows are 44 px on phones and 36 px from 768 px.
11. **Two search rows in the header markup**, never shown together: inline from 768 px, and on phones a row that follows the bar's actions, so Tab follows the visual order at both sizes (a single element placed by CSS would tab out of order on one of them).

## Spec and acceptance rows touched (not edited; open: N12)

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

## Review preparation (2 Oct)

Everything below was done to make the evidence reproducible by someone outside the project; `review-guide.md` is the entry point.

- **Clean re-verification.** On a separate local stack built only from this branch (see § Evidence setup), the unit suite passed and `scripts/ux-audit.cjs` reproduced the 1 Oct numbers exactly: 26 template runs, 0 axe violations (also with each menu open), 852 focusable elements all with a visible ring, 0 Tab-order and 0 skip-link problems, one `<main>` and one `<h1>` on every page, no overflow at 390 / 1440 or at 200% zoom, layout shift at most 0.0016. After the fix below, a second clean pass with the two Admin 404s added (30 runs): 0 axe violations, 885 focusable elements all with a ring, and the same results everywhere else; the unit suite passed 271/271. Table in `review-guide.md` § 6.4.
- **Defect found and fixed (`37d441b`).** A 404 for an unknown Admin section (`/admin/no-existe`) rendered with no `<main>`, no header and no sidebar: Next renders the root `not-found` outside the Admin layout, and on `/admin` paths the shell leaves `<main>` to that layout. Errors thrown in Admin pages had the same gap. Now `app/admin/not-found.tsx` and `app/admin/error.tsx` render the 404/500 body inside the Admin frame, and the root `not-found` and `error` add a `<main>` (`FallbackMain`) only where the shell has none (an unmatched deeper `/admin/…` URL, a crash in the Admin layout). Covered by a new test in `tests/ux-shell.test.cjs` and by the Admin 404 runs in `scripts/ux-audit.cjs`. 404s under `/mi-cuenta` and public paths were already correct (shell header, one `<main>`).
- **Reproducibility.** `scripts/ux-local-accounts.cjs` (the three local accounts and the store) and `scripts/ux-audit.cjs` (all accessibility and layout-shift checks) replace the one-off scripts used on 1 Oct. `scripts/ux-snapshots.cjs` is unchanged.
- **Open decisions** moved into `decisions.md`: N9–N12 (the deviations below) and F9 (free-text search).

## How to review

1. Follow `review-guide.md` (scope, setup, checks, evidence, traceability, risk areas, report format).
2. Read `ux-2-shell.md` (the brief) and the "Shell and navigation" section of `docs/design-system.md`.
3. Compare `screenshots/ux2-before/` with `screenshots/ux2-after/` (same file names; `<width>-<group>-<route>.webp`).
4. Run the app and walk: a category page at 1440 and 390, a listing on a phone (search icon, back link), the account menu signed in, `/mi-cuenta` on a phone (switcher), `/admin` at 1440 and 390, a 404 (also `/admin/no-existe`).
5. Owner: decide N9–N12 (N9, N10 and N11 are one-line changes).
