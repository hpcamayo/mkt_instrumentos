# External review guide — Laria UX redesign (`ux/redesign`)

For an independent reviewer, person or agent, with no access to the design chats or canvases. Everything needed is in this repository: the specs, the owner's decisions, the concept renders, the code, the tests and the scripts that reproduce the evidence. Written 2 Oct 2026; the setup in § 4–6 was run that day on a clean local stack built only from this branch (§ 6.4 says exactly how). External-review fixes and a fresh browser pass were completed on 3 Oct (§ 6.5; `reviews/ux-2-external-review.md`). The same day the owner asked for the mega-menu's category and type access back inside the UX-2 design (N12): the hybrid is described in `ux-2-shell.md` § Amendment and verified in § 6.6. On 7 Oct the owner answered the open questions (N9–N14); the resulting fixes and re-runs are in § 6.7. On 8 Oct the owner accepted UX-2 through its review page (22 of 22 checks Correct).

## 1. What is under review

Branch `ux/redesign`, cut from `main` at `49a38e5` (the close of Sprint 9). Not pushed; nothing is merged or deployed.

| Sub-sprint | Commits | State | What the review should do |
| --- | --- | --- | --- |
| UX-1 Foundations | `06f0d42` … `3da7afa` (12) | Accepted by the owner, 30 Sep. External review still pending | Check the foundations against `ux-1-foundations.md` and `ux-1-acceptance.md`; findings feed UX-8 or a fix-up |
| UX-2 Shell and navigation | `645d51e`, `0813138`, `2d06b7e`, `37d441b` (fix found in review preparation), `cde9c5a` (review scripts), `1a96bf5` (browser-smoke correction), `15e689f` (this guide), then the 3 Oct commits: the external-review fixes (Admin 404 catch-all, "Tiendas verificadas" link, audit checks) and the hybrid category navigation (N12), then the 7 Oct commits: N11, the Admin accordion fix, `scripts/ux-pub-rerun.cjs` and the docs | Accepted by the owner, 8 Oct (as amended 3 Oct and answered 7 Oct) | **Main focus.** Check the build against the brief `ux-2-shell.md` and the claims in `ux-2-acceptance.md` |
| UX-3a Discovery, part 1 | `5f4bdd1` (the stall fix), `4ddf8cc` (the one card), `6651815` (catalog, filters with F11, chips, sort, pages, landings, states), then the evidence and docs commit | Accepted by the owner, 9 Oct (review page 31 of 31 Correct); seed-id fix `4057065` on 9 Oct | Check the build against `ux-3-discovery.md` (3a parts, § Filters with F11, § Owner answers) and the claims in `ux-3a-acceptance.md`; reproduce with § 6.8 |
| UX-3b Discovery, part 2 (the home) | `eeeb7ad` (the local photo fixture), `7806053` (the home), then the evidence and docs commit | Accepted by the owner, 9 Oct (review page 37 of 37 Correct) | Check the build against `ux-3-discovery.md` (§ Home, § States, § Owner answers) and the claims in `ux-3b-acceptance.md`; reproduce with § 6.9 |

```bash
git log --oneline 49a38e5..ux/redesign          # all redesign commits
git diff 3da7afa..ux/redesign -- app components components_v0 lib scripts tests   # UX-2 and UX-3 code and tests (components_v0 is removed in 3b)
git diff 49a38e5..3da7afa                        # UX-1
```

Relation to `main`: as of the last fetch (30 Sep), `origin/main` is one docs-only commit ahead (`f04e909`: `docs/context.md`, `docs/functional-spec.md`, `docs/go-live-checklist.md`, `docs/sprint-9-production-release-gate.md`; Sprint 9 records). No file overlaps this branch. The branch has not been rebased; the roadmap asks for a rebase before merge, which is the owner's call.

Out of scope: page content owned by later sub-sprints (listing and store UX-4, selling UX-5, account pages UX-6, the Admin workbench UX-7), the catalog branch `catalog/canonical-catalog`, Supabase schema and any hosted environment.

## 2. Rules the work follows

Review against these; they are binding for this branch.

- `AGENTS.md`: Spanish interface, mobile first, no product behaviour, schema, auth or authorization changes in visual work, the acceptance registry rules (`acceptance/cases.tsv` is canonical and was not edited).
- `docs/functional-spec.md` is canonical for behaviour; `docs/design-system.md` is canonical for visuals (rewritten in UX-1, extended in UX-2).
- Owner decisions in `docs/ux-redesign/decisions.md` are binding. Decided items (D1–D12, H1–H11, N1–N8, G1) are not defects, though the review may say if one causes a problem. Open items are listed in § 8.
- The UX-2 brief: where it and the concept renders differ, the brief wins.

## 3. Reading order

1. `AGENTS.md`
2. `docs/ux-redesign/README.md` (workspace map and status)
3. `docs/ux-redesign/ux-2-shell.md` (the UX-2 spec, with its acceptance criteria) and the UX-2 items of `docs/ux-redesign/home-visual-audit.md`
4. `docs/ux-redesign/decisions.md` (N1–N12, G1, F9)
5. `docs/design-system.md`, section "Shell and navigation"
6. `docs/ux-redesign/ux-2-acceptance.md` (the claims, evidence, measurements and deviations)
7. Visual references: `docs/ux-redesign/screenshots/page-concepts/` (Catalogo, Ficha, Cuenta, Publicar, Admin) and `screenshots/home-final/` (header and footer of the home)

For UX-1: `ux-1-foundations.md`, `ux-1-acceptance.md`, `screenshots/ux1-audit/index.html`.

Not in the repository, and not needed: the design canvases ("Laria Redesign", "Laria Page Concepts"), whose renders are in `screenshots/`, and the redline and logo-size sheets mentioned in `home-visual-audit.md`, whose numbers are in its text. The brief, the decisions and the design system are the specification.

## 4. Local environment

Never point the app at a hosted Supabase project for this review; the scripts refuse non-local URLs.

Prerequisites (versions used): Node 24.15, pnpm 11.0.9 (corepack), Docker, Supabase CLI 2.98.2, and for the screenshots and the audit the `agent-browser` CLI (Chromium) plus a copy of `axe-core` 4.11.x (`axe.min.js`, from npm; not a project dependency, by decision D10).

```bash
git checkout ux/redesign
pnpm install                     # the lockfile is committed
supabase init                    # this branch ships no supabase/config.toml
supabase start                   # applies the 19 migrations in supabase/migrations, then supabase/seed.sql
supabase status -o env           # API_URL, ANON_KEY, SERVICE_ROLE_KEY
```

The start log must show 19 "Applying migration" lines (`20260427195000` … `20260923120000`) and "Seeding data from supabase/seed.sql". If the default ports are taken, raise the `port` values in `supabase/config.toml`; the services the app does not use (Studio, Inbucket, analytics, realtime, edge runtime) can be disabled there. The files `supabase init` generates are local setup; do not commit them. The Supabase CLI also rewrites the tracked `supabase/.temp/cli-latest` when it checks for updates; restore it with `git checkout -- supabase/.temp/cli-latest`.

Create `.env.local` (gitignored):

```bash
NEXT_PUBLIC_SUPABASE_URL=<API_URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
NEXT_PUBLIC_SITE_URL=http://localhost:3100
```

Test accounts and the app:

```bash
node scripts/ux-local-accounts.cjs   # Particular, Store Owner (+ an active verified store), Admin; writes .ux-accounts.local.json
pnpm build && pnpm start -p 3100
```

`.ux-accounts.local.json` holds generated passwords for `ux-particular@laria.test`, `ux-tienda@laria.test` and `admin@laria.test` (Admin = `app_metadata.role = "admin"`); sign in at `/login`. Rerunning the script resets the passwords and keeps the accounts. The seed gives 20 listings (14 approved) and 3 stores (2 active); the accounts script adds the Store Owner's store. Local photos are placeholder images.

## 5. Checks

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: no lint or type errors, **275/275** tests, a clean build. `typecheck` also reads the generated `.next/types`; after removing a route, delete `.next` and build again before typechecking. The integration and browser-smoke scripts (`tests/*.integration.cjs`, `tests/*-browser-smoke.cjs`) need their own seeded fixtures and were not run for UX-2 (`tests/favorites-browser-smoke.cjs` was updated to the new shell).

## 6. Reproduce the evidence

### 6.1 Screenshots

```bash
LARIA_AGENT_BROWSER_BIN=<path to agent-browser> node scripts/ux-snapshots.cjs --base http://localhost:3100 --label review
```

33 routes × 390 / 768 / 1280 / 1440 px: public pages signed out; the Particular, Store Owner and Admin, each also on the catalog. Output in `.ux-snapshots/review/` (gitignored). Compare with `docs/ux-redesign/screenshots/ux2-after/` (selected frames, same names) and `ux2-before/`.

### 6.2 Accessibility and shell audit

```bash
node scripts/ux-audit.cjs --base http://localhost:3100 --axe <path>/axe.min.js --label review [--error-route /ux2-prueba-error]
```

Per template (home, catalog, category, listing, store, sign-in, 404, 500; Particular Resumen, catalog, Publicar; Store Owner Resumen; Admin, plus a 404 for an unknown Admin section and one for an unmatched deeper Admin path) at 390 and 1440: axe-core with WCAG 2.1 A/AA tags, a focus sweep (every visible focusable element must show a 2 px outline), the skip link (first Tab, lands on `<main>`), Tab order in the header and the strip, one `<main>` and one `<h1>`, horizontal overflow, and the correct public or Admin frame. The audit also scrolls the category strip at 390 and 768 px, verifies the last link is reachable and opens the verified-store catalog. Category menus (N12) at 390, 768 and 1440 px: a category opens its panel with "Ver todos" and the canonical types (axe with it open), Tab moves from the button into the panel, Esc closes it and returns focus, only one panel opens at a time, an outside press closes it, "Ver todos" and a type link reach their destinations (the type link with its filter applied), and "Instrumentos" leaves a filtered catalog. On account pages (Particular, 390 and 1440): the strip's panel opens and closes the account menu, and reaches its destination. Admin (390 and 1440): "Explorar categorías" opens in the sidebar or the phone "Menú" without the public header or footer, axe with it open, Esc closes one level at a time, and "Ver todos" reaches the landing. Category-menu failures also set a nonzero exit code. The keyboard checks run in their own browser sessions: a few seconds after a run of Esc, Enter and Tab presses, agent-browser navigates its tab to `about:blank` (reproduced on a bare HTML page), which would otherwise break the next checks. Then axe with each shell menu open, overflow at 640 and 720 px (200% zoom of 1280 and 1440), and layout shift. Report: `.ux-snapshots/review/audit.json`, summary on the last lines; frame and strip failures set a nonzero exit code.

Stop a `next start` server by its port (`lsof -tiTCP:3100 -sTCP:LISTEN | xargs kill`), not by its command line: the `next-server` process outlives its wrapper, and an old server over a rebuilt `.next` gives mixed results.

To include the 500 page, add a route that throws, build, run the audit with `--error-route`, then delete the route and build again. Never commit it:

```tsx
// app/ux2-prueba-error/page.tsx — temporary, local only
export const dynamic = "force-dynamic";
export default function Page() {
  throw new Error("Prueba local del error 500");
}
```

### 6.3 Layout shift before and after UX-2

Build the commit before the UX-2 code (`645d51e`) in a separate directory (for example `git worktree add ../laria-before 645d51e`, then `pnpm install` and its own `.env.local` there), start it on another port, and run `scripts/ux-audit.cjs` against both. Compare the `cls` lines (signed-out and Particular, 390 and 1440).

### 6.4 Results on a clean stack (2 Oct)

The numbers in `ux-2-acceptance.md` were first produced (1 Oct) on a local database that also carried 17 later migrations from the catalog branch (`20260927…` to `20261013…`). UX-2 reads none of their tables, but to rule it out the setup above was rerun on 2 Oct from an archive of this branch, on a separate stack with only this branch's 19 migrations and the seed, with accounts from `scripts/ux-local-accounts.cjs`:

| Check | 1 Oct (shared local DB) | 2 Oct, clean stack, before the fix (`2d06b7e`) | 2 Oct, clean stack, after the fix (`cde9c5a`) |
| --- | --- | --- | --- |
| Unit tests | 270/270 | 270/270 | 271/271 |
| Template runs (390 and 1440) | 26 | 26 | 30 (+ two Admin 404s × 2 widths) |
| axe violations, menus closed / open (5 menus) | 0 / 0 | 0 / 0 | 0 / 0 |
| Focusable elements without a 2 px ring | 0 of 852 | 0 of 852 | 0 of 885 |
| The 8 UX-1 templates: runs, focusables, without a ring, axe | 16, 541, 0, 0 | 16, 541, 0, 0 | 16, 541, 0, 0 |
| Skip link, shell Tab order, one `<main>` and `<h1>` | no problems | no problems | no problems |
| Horizontal overflow (templates; 12 checks at 640 / 720 px) | none | none | none |
| Layout shift, signed out / signed in 390 / signed in 1440 | 0 / 0.0012–0.0016 / 0.0004 | 0 / 0.0012–0.0016 / 0.0004 | 0 / 0.0012–0.0016 / 0.0004 |

How it was run: the branch was exported with `git archive` into a separate directory (a stand-in for a fresh clone), `supabase init` with every port raised by 100 and the unused services off, `supabase start` (19 migrations and the seed applied, nothing else), `.env.local` from `supabase status -o env`, accounts from `scripts/ux-local-accounts.cjs` (run twice to check reruns), `next build` and `next start` on port 3102, the unit suite, then `scripts/ux-audit.cjs` with `--error-route`. Differences from § 4: the copy reused an existing `node_modules` (so `pnpm install` was not exercised there) and called `next build`/`next start` directly.

The same pass found one defect, fixed in `37d441b` before the last column: a 404 for an unknown Admin section rendered with no `<main>` (`ux-2-acceptance.md` § Review preparation).

### 6.5 External-review fix pass (3 Oct)

On `ux/redesign` at `15e689f` plus the uncommitted fixes, an isolated production copy on port 3105 used the local Supabase stack and existing UX accounts. Next build, ESLint, TypeScript and the configured Node suite passed (271/271). The audit without the temporary 500 route ran 28 templates: zero axe violations, missing focus rings (840 focusables), Tab-order or skip-link failures, wrong `<main>`/`<h1>` counts, page overflow, frame failures or strip failures. The strip checks at 390 and 768 px both reached the verified-store filter. Maximum measured layout shift was 0.0016. The report is `.ux-snapshots/ux2-fix-final/audit.json` in that gitignored isolated copy. The deeper Admin URL redirects anonymous visitors through the Admin login gate; signed-in 404s use the Admin frame. The 500 and induced Admin-layout-failure paths were not rerun in this pass. N12 remains an owner acceptance decision.

### 6.6 Hybrid category navigation (3 Oct)

On `ux/redesign` with the hybrid (the commits after `b6614e0`), a production build on the shared local stack with the local accounts:

| Check | Result |
| --- | --- |
| Lint, typecheck, build | pass (clean `.next`) |
| Unit tests | **274/274** |
| Template runs (390, 1440), including both Admin 404 depths and the 500 | 30; 0 axe violations; 1,011 focusables, 0 without a ring; 0 Tab-order, skip-link, `<main>`/`<h1>`, frame or overflow problems |
| Strip sideways access and "Tiendas verificadas" (390, 768) | pass |
| Category-menu checks (390 / 768 / 1440 public; 390 / 1440 account and Admin) | 34, 0 failures, no fallback clicks |
| Other shell menus open (5), 200% zoom (12 loads) | 0 axe violations; no overflow |
| Layout shift | 0 signed out; ≤ 0.0016 signed in |

Admin after hydration, both 404 depths and an Admin page error (isolated stack, by hand): one `<main>`, Admin navigation with "Explorar categorías", no public header or footer.

The browser smoke ran on a separate local stack with its own fixtures, removed afterwards. Committed as strict, it stops at a pre-existing React #418 on a fresh listing page; that error is reproduced on the pre-UX-2 build too. With only that error tolerated, in a scratch copy, it passes end to end. Details are in `ux-2-acceptance.md` § Hybrid category navigation.

### 6.7 Owner answers, fixes and re-runs (7 Oct)

On `ux/redesign` with the 7 Oct commits, a production build on the shared local stack with the local accounts (`ux-2-acceptance.md` § Owner answers (7 Oct)):

| Check | Result |
| --- | --- |
| Lint, typecheck, build | pass (clean `.next`); first-load JS unchanged (101 kB shared, home 113, catalog 135, Admin 196) |
| Unit tests | **275/275** (new: the `hidden`-panel guard) |
| N11 | the phone back link only on listings; the catalog and the landings show no breadcrumb on phones |
| Admin accordion | closed levels were on screen (a display class overrode `hidden`); fixed, guarded by a unit test and an audit check |
| Admin-layout failure (induced in a scratch copy) | one `<main>`, the 500 body, skip link, axe 0 at 1440 and 390; no frame |
| Catalog transitions (scratch builds, page size 2) | `/listados` → `?seller_type=verified_store` stalls since UX-1 (14/18 here, 3/7 on `645d51e`, 0/16 on `49a38e5`); `?page=2` and `?category=` always complete |
| PUB-008 to PUB-015 re-run | `scripts/ux-pub-rerun.cjs`; observations and proposed wording in `ux-2-reconciliation.md` |
| `scripts/ux-audit.cjs` (28 template runs at 390 and 1440, no 500 route) | 0 axe violations; 964 focusables, 0 without a ring; 0 Tab-order, skip-link, `<main>`/`<h1>`, frame, strip or overflow problems; 34 category-menu checks, 0 failures (Admin: closed levels show no links); layout shift ≤ 0.0016 |

Reproduce the row re-run:

```bash
LARIA_AGENT_BROWSER_BIN=<agent-browser> node --require ./tests/setup-alias.cjs scripts/ux-pub-rerun.cjs \
  --base http://localhost:3100 --label n12-rerun --db-container <local Supabase Postgres container> [--rows PUB-010,PUB-011]
```

`--db-container` lets PUB-009 count the search events it causes (`docker exec … psql`); without it PUB-009 is skipped. Report: `.ux-snapshots/<label>/pub-rerun.json`.

### 6.8 UX-3a (8 Oct)

Production builds on the shared local stack with the local accounts (`ux-3a-acceptance.md` § Evidence setup). The paged scratch builds lower `LISTINGS_PAGE_SIZE` to 2 in a `git archive` copy; never commit that.

| Check | Result |
| --- | --- |
| Lint, typecheck, build | pass; first-load JS: home 114 kB, catalog 140 kB (136 before), landings/listings 208 kB (203), stores 195 kB (197) |
| Unit tests | **290/290** (275 before 3a); 291/291 after the 9 Oct seed-id fix (`ux-3a-acceptance.md`, commit 5) |
| Transition trials, 12 moves × 10 | before 32/120 stalls, after the fix 0/120, on the finished build 0/120 |
| SEO rendered smoke | pass (sold listing and empty category waived: none in the local data) |
| `scripts/ux-audit.cjs` (68 template runs at four widths) | 0 axe violations (also with the sheet, the sort menu and the alert panel open); 2,513 focusables, 0 without a ring; 0 overflow (also at 640 / 720); 34 category-menu and 25 discovery checks, 0 failures; layout shift ≤ 0.0016 |
| Acceptance rows (observations) | `scripts/ux-discovery-rerun.cjs`; summary in `ux-3a-acceptance.md` |

Reproduce:

```bash
# The transition trials (a paged scratch build on its own port).
LARIA_AGENT_BROWSER_BIN=<agent-browser> node scripts/ux-transition-trials.cjs --base http://localhost:3301 --label ux3-trials --trials 10 --moves all
# Captures before/after (UX-3 frames include the filter sheet and the sort menu open).
LARIA_AGENT_BROWSER_BIN=<agent-browser> node scripts/ux-snapshots.cjs --base http://localhost:3300 --label ux3-after --only public,particular
# The audit, with the UX-3 checks (sheet, sort, pending state, focus after a facet, card tab stops, grid columns, alert panel).
LARIA_AGENT_BROWSER_BIN=<agent-browser> node scripts/ux-audit.cjs --base http://localhost:3300 --axe <axe.min.js> --label ux3a-audit --widths 390,768,1280,1440
# The rows (a normal build and a paged one; the Postgres container counts favourites, alerts and events).
LARIA_AGENT_BROWSER_BIN=<agent-browser> node scripts/ux-discovery-rerun.cjs --base http://localhost:3300 --paged-base http://localhost:3301 --db-container <container> --label ux3a-rows
```

Run the rows on a quiet stack: they count events and rows before and after their own steps.

### 6.9 UX-3b, the home (9 Oct)

Production builds on the shared local stack with the local accounts and the photo fixture (`ux-3b-acceptance.md` § Evidence setup). The fixture changes only `listing_photos` rows of ten seed listings, with fixed ids; `--remove` takes them out again.

| Check | Result |
| --- | --- |
| Lint, typecheck, build | pass; first-load JS: home 127 kB (114 before; +3.6 kB actually downloaded, `ux-3b-acceptance.md` § First-load JS), catalog 141 kB (unchanged), landings/listings 208 kB, stores 195 kB |
| Unit tests | **305/305** (291 before 3b) |
| SEO rendered smoke | pass (sold listing and empty category waived: none in the local data) |
| `scripts/ux-audit.cjs` (72 template runs at four widths) | 0 axe violations (also with each menu open, the home's "Categorías" included); 2,698 focusables, 0 without a ring; 0 overflow (also at 640 / 720); 34 category-menu, 25 discovery and 29 home checks, 0 failures; layout shift 0 on the home signed out, ≤ 0.0016 signed in |
| Banner and LCP | one banner file per load, the viewport's; layout shift 0; LCP the banner art, median 80 ms locally (44 / 56 ms before, the stock photo) |
| Acceptance rows (observations) | `scripts/ux-home-rerun.cjs` (PUB-001, PUB-006, SEO-002, AN-001, PUB-009 for the banner; the vitrina and the feed against anon SQL) and `scripts/ux-pub-rerun.cjs` (PUB-008–PUB-015 for N12); summaries in `ux-3b-acceptance.md` and `ux-2-reconciliation.md` |

Reproduce:

```bash
# The fixture: ten seed listings get 2 to 5 photos (local Supabase only).
node scripts/ux-local-photos.cjs
# Captures before/after (the home and its open "Categorías" menu; the signed-in home).
LARIA_AGENT_BROWSER_BIN=<agent-browser> node scripts/ux-snapshots.cjs --base http://localhost:3300 --label ux3b-after --only public,particular --routes inicio,inicio-categorias
# The audit, with the home checks ("Categorías", the banner, LCP).
LARIA_AGENT_BROWSER_BIN=<agent-browser> node scripts/ux-audit.cjs --base http://localhost:3300 --axe <axe.min.js> --label ux3b-audit --widths 390,768,1280,1440
# The home rows and the vitrina/feed rules (counts events; run on a quiet stack).
LARIA_AGENT_BROWSER_BIN=<agent-browser> node scripts/ux-home-rerun.cjs --base http://localhost:3300 --db-container <container> --label ux3b-rows
# N12: PUB-008 to PUB-015 on the 3b shell (PUB-009 counts events: run it alone).
LARIA_AGENT_BROWSER_BIN=<agent-browser> node --require ./tests/setup-alias.cjs scripts/ux-pub-rerun.cjs --base http://localhost:3300 --label n12-rerun-3b --db-container <container>
```

## 7. Traceability: brief → code → tests

| Brief item (`ux-2-shell.md`) | Code | Tests (`tests/…`) |
| --- | --- | --- |
| Frame per route: header, strip, phone search, footer (N3–N5) | `lib/shell.ts` `getShellLayout`; `components/site-shell.tsx`; `app/layout.tsx` | `ux-shell` "each route gets its frame", "nothing in the shell is sticky" |
| Header desktop / tablet / phone; "Vender" (N1); last item on the gutter (item 10) | `components/site-header.tsx`; `lib/account-navigation.ts` `getSellEntry` | `ux-shell` header tests; `account-shell` "header never offers stale store registration…" |
| Search (N8 placeholder, brand only, no suggestions) | `components/global-search.tsx` | `ux-shell` header test; `favorites` (form contract: `/listados`, `brand`, no `q`, no events on render) |
| Account menu (sections, counts, Admin, Cerrar sesión) | `site-header.tsx` `AccountMenu`; `components/account-navigation.tsx` `AccountSectionLinks` | `ux-shell` "bell, avatar and an account menu…"; `logout-navigation` |
| Header data (N6) | `app/api/account-navigation/route.ts`; `components/marketplace-account-provider.tsx` | `ux-shell` "header state endpoint…" |
| Menus: disclosure, Esc returns focus, one open at a time, 120 ms opacity | `components/use-disclosure.ts`; `.menu-fade` in `app/globals.css` | `sprint-6` "category navigation … shell menus close…" |
| Category menus (amendment, N12): category buttons, one panel with "Ver todos" and the canonical types, phone stacked list, closing rules | `components/global-categories.tsx` (`CategoryPanel`); `lib/shell.ts` `categoryMenus`, `getShellLayout`; `components/use-disclosure.ts` `useDisclosureGroup`; `components/shell-link.tsx` | `ux-shell` "strip categories are menu buttons…", "each category menu offers Ver todos…"; `sprint-6` "mega-menu is driven by canonical taxonomy…"; `sprint-9-gate`; audit category-menu checks at 390 / 768 / 1440 |
| Category access in Admin (amendment): "Explorar categorías" in the Admin navigation | `components/category-accordion.tsx`; `components/admin-navigation.tsx` | `ux-shell` "Admin reaches the same destinations…", "panels toggled by the hidden attribute carry no display utility…"; audit `admin-*` checks (closed levels show no links) |
| Category strip (G1 label, N7 destination) | `components/global-categories.tsx`; `lib/shell.ts` `stripItems`, `currentStripKey` | `ux-shell` strip test; `sprint-6`; `sprint-9-gate` "top-level categories…"; `ux-audit` sideways scroll and destination at 390 / 768 |
| Breadcrumbs (phone back link on listings only, N11); structured data name (G1) | `components/breadcrumbs.tsx` (`phoneBackLink`); `lib/shell.ts` `listingBreadcrumbs`; `app/listados/page.tsx`, `components/category-landing.tsx`, `app/instrumentos/[slug]/page.tsx` | `ux-shell` breadcrumbs test; `sprint-9-gate`; `sprint-9`; `seo-smoke` |
| Account frame (rail, phone switcher) | `components/account-navigation.tsx`; `app/mi-cuenta/layout.tsx` | `account-shell`; `sprint-7`; `logout-navigation`; `performance` |
| Admin frame (sidebar, phone bar, own `<main>`) | `components/admin-navigation.tsx`; `app/admin/layout.tsx` | `sprint-8` "persistent Admin navigation…"; `logout-navigation`; `ux-shell` frame test |
| Footers full / slim / none (N5) | `components/site-footer.tsx` | `ux-shell` footers test; `sprint-9` LEGAL tests |
| 404 and 500, one `<main>` everywhere | `components/error-page.tsx`; `app/not-found.tsx`, `app/error.tsx` (with `FallbackMain` from `components/site-shell.tsx`); `app/admin/not-found.tsx`, `app/admin/error.tsx`; `app/admin/[section]/[...rest]/page.tsx` for unmatched deeper Admin paths | `ux-shell` "404 and 500 share one body…", "404 and 500 always have exactly one <main>…"; `sprint-9` (404 noindex); audit runs `admin/no-encontrada*` and asserts the Admin frame |
| Logo hairline (N2) and sizes (item 1) | `app/logo-clear.svg`; `components/brand-logo.tsx` | `ux-shell` logo test |
| Text-wrap rule (item 14) | `app/globals.css`; `.text-lead` in `components/ui/page-header.tsx`, `components/ui/empty-state.tsx` | `ux-shell` text-wrap test |
| "Listados" and "Para tiendas" retired (G1, D8) | copy across `app`, `components`, `lib` | `ux-copy` "glossary terms replace their retired synonyms" |
| Focus ring on light panels inside the frame | `.surface-light` in `app/globals.css` | Audit focus sweep (§ 6.2); no unit test |

UX-3b, the home (`ux-3-discovery.md` § Home):

| Brief item | Code | Tests and checks |
| --- | --- | --- |
| Home header: "Categorías" (every category and type, rendered only while open), "Tiendas verificadas", "Cómo funciona"; no strip, no phone search row, full footer (N12, Q14) | `components/site-header.tsx` `HomeHeader`, `HomeCategoryPanel`; `lib/shell.ts` `getShellLayout`, `categoryMenus`; `components/site-shell.tsx` | `ux-shell` "each route gets its frame", "home header…", "the home Categorías panel…"; audit home `categorias-*` checks at 390 / 768 / 1440; `ux-pub-rerun.cjs` |
| Banner: one of nine per request, only its image preloaded, `<picture>`, `alt=""`, fixed heights, the brand search (H6, H7, H9–H11, N8, Q16) | `lib/home-banner.ts`; `components/home/home-banner.tsx`; `public/banners/` | `ux-home` banner tests; audit home `banner` and `lcp` checks; `ux-home-rerun.cjs` PUB-009 |
| The showcase tile and "En vitrina" (H2, H3, Q12) | `components/listing-card.tsx` (`variant="showcase"`); `components/home/home-sections.tsx` `ShowcaseSection`; `lib/home.ts` `selectVitrina`, `fetchHomeData` | `ux-discovery` "the showcase tile…"; `ux-home` vitrina and query tests; `ux-home-rerun.cjs` (anon SQL vs page) |
| "Explora por categoría" with counts (Q10 B), "Recién publicados" without the vitrina's (Q15 B) | `home-sections.tsx` `CategoryTiles`, `RecentListings`; `lib/home.ts` `selectFeed`; `lib/ui/listing-grid.ts` `HOME_FEED_GRID` | `ux-home`; `sprint-9-gate` "top-level categories…"; `sprint-9` category links |
| "Cómo funciona Laria" (H4), "Tiendas verificadas" (Q18 A, N7), the sell block | `home-sections.tsx` `HowItWorks`, `VerifiedStoresSection`, `SellBlock` | `ux-home` promises and stores test; `sprint-9` LEGAL-005/006 trust surfaces; `ux-copy` |
| States: failed listing queries leave their sections out; empty feed; no stores hidden | `app/page.tsx`; `lib/home.ts` | `ux-home` states and failed-query tests |

## 8. Decided and open

Decided by the owner (binding): D1–D12 (foundations), H1–H11 (home), N1–N11, N13, N14 and G1 (shell), and N12's preference and build side; UX-2 accepted 8 Oct. Open, where the review's opinion is welcome (N12 is listed for its history):

| ID | Topic | Where |
| --- | --- | --- |
| N12 | Decided and recorded: preference (3 Oct), build side (7 Oct), drafts approved 8 Oct and, refreshed for the shell after 3b, again on 9 Oct; recorded 9 Oct in `docs/functional-spec.md` (UX-2 navigation clarification, legal-pages line) and `acceptance/cases.tsv` (PUB-008–PUB-015 evidence, status Pass) | `decisions.md`, `ux-2-reconciliation.md` |
| F9 | Free-text search (brand, model, title) | `decisions.md` |
| G2, G3 | Legal-page wording; password minimum (6 vs 8) | `decisions.md` |
| F1–F7 | Product-behaviour flags for later sub-sprints | `decisions.md` |

## 9. Where to look hardest

- **Header data endpoint (N6).** `GET /api/account-navigation` now returns the signed-in user's name, an admin flag and two counts. It runs on every navigation and on window focus, with the RLS-scoped server client and `Cache-Control: private, no-store`; a failed count or admin check degrades to none. Check for leakage, caching and error handling.
- **Frame selection on the client.** `SiteShell` picks the frame from `usePathname()`; for `/admin…` it renders no header and no `<main>`, and `app/admin/layout.tsx` renders the `<main>`. This split produced the review-preparation defect (a 404 under `/admin` without `<main>`, fixed in `37d441b` with Admin's own `not-found`/`error` and `FallbackMain`) and the deeper unmatched-path defect fixed on 3 Oct by `app/admin/[section]/[...rest]/page.tsx`. Check both the frame and one `<main>` on every route and state, including 404s and errors under `/admin` and `/mi-cuenta` and errors thrown by a layout (an Admin-layout failure was induced on 7 Oct: one `<main>`, no frame, § 6.7).
- **Account entry before hydration.** Until the first account check settles, the entry is rendered invisible (with a `<noscript>` "Ingresar"), so signed-in visitors never see "Ingresar". The remaining layout shift for them is 0.0004–0.0016 (it was 0.0357 on phones before UX-2). Removing it would need the session at server render.
- **Two search forms in the header markup** (inline from 768 px; a phone row after the bar's actions), never displayed together, so Tab follows the visual order at both sizes. Distinct ids.
- **`useDisclosure`** and **`useDisclosureGroup`** coordinate "one menu open at a time" through a window event (`laria:disclosure-open`). The Admin accordion lives inside the phone "Menú", so it does not take part in that event; it handles Esc itself, one level at a time, and marks the key handled (`preventDefault`). Every shell menu ignores an Esc already handled inside it, because React and the menus all listen on `document`, where `stopPropagation` cannot separate them.
- **Category panels** render inside their button's list item (focus order) but are positioned against the strip container, so the strip's sideways scrolling does not clip them. Check at 390, 768 and 1440, with the strip scrolled.
- **Catalog links.** A client transition between two `/listados` URLs can fetch the page data and never commit (root cause not identified). Measured 7 Oct with `window.next.router.push` on production builds: `/listados` → `?seller_type=verified_store` stalled in 14 of 18 trials on this branch and 3 of 7 on the pre-UX-2 build `645d51e`, never on `main` `49a38e5` (16 of 16 completed), so it arrived with UX-1; `/listados` → `?page=2` and `?category=guitars` completed every time. The shell sends every catalog link through a native link (`ShellLink`). The catalog's own pagination still uses client links (UX-3 code, unchanged).
- **Tests rewritten with the shell** (§ 7 and `ux-2-acceptance.md` § Tests): check that none lost strength.
- **Known limitations** (`ux-2-acceptance.md`): no current strip item on listing and store pages; no breadcrumbs on store pages yet (UX-4); on phones the home's old hero (UX-3) shows a search-looking link under the header search.

Not covered by the internal audit: Safari/WebKit and Firefox (the tooling is Chromium), real screen readers (VoiceOver, NVDA, TalkBack), real touch devices, network performance on a deployment (Core Web Vitals), hosted Supabase, the integration and browser-smoke scripts.

## 10. Reporting

Please write findings to `docs/ux-redesign/reviews/<sub-sprint>-external-review.md` (or deliver them as a separate document), one entry per finding:

| Field | Content |
| --- | --- |
| ID | e.g. UX2-R01 |
| Severity | blocker / major / minor / note |
| Area | header, strip, menus, breadcrumbs, frames, footers, 404/500, accessibility, tests, docs, … |
| Where | `file:line`, or URL + width + account |
| Expected | with its source (brief section, spec line, design-system rule, decision ID) |
| Actual | what happens, with a screenshot or the audit JSON entry |
| Kind | defect / already-listed deviation (N9–N12) / disagreement with a decision |

Do not edit `acceptance/cases.tsv` or `docs/functional-spec.md`; the owner records acceptance changes.
