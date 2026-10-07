# UX-2 — V1 reconciliation draft (N12)

Prepared by Claude Code on 7 Oct 2026 at the owner's request (`decisions.md` N12, record side). **Nothing here is recorded.** `docs/functional-spec.md` and `acceptance/cases.tsv` are unchanged, no status was set and no Pass is inferred: the owner reads each proposal and the evidence, decides, and records it.

The build side is decided (N12, 7 Oct): the UX-2 shell stays as built, with no search in Admin, no search on phone account, legal or sign-in pages, and the compact category panel on phones. So the canonical text is what changes.

## How to record

`acceptance/README.md` allows an authorized acceptance update to change a row's **status (column 5)** and **evidence (column 8)** and to preserve its requirement, expected result and steps. Two ways to reconcile, per row:

- **A. Keep the row's text and add evidence.** The new spec clarification (§ 1) says how the shell now meets the requirement, and the evidence entry points at it. Enough where the row's text still describes the build (PUB-009, PUB-011–PUB-014).
- **B. Reword the row** (columns 6, 7 and 12). This goes beyond the README's routine edit, so it needs the owner's explicit decision. Proposed text is given for the three rows whose words name the retired shell (PUB-008, PUB-010, PUB-015).

Whichever you choose, the evidence entry proposed below leaves the verdict to you: replace `<result>` with your status word. After editing, run `python3 -B acceptance/validate.py` and review `git diff -- acceptance/cases.tsv`.

## 1. functional-spec: proposed "UX-2 navigation clarification"

Where: a new paragraph after "Sprint 6 implementation clarification" (`docs/functional-spec.md` line 364). The Sprint 5 and Sprint 6 paragraphs stay as history; the new one says what it supersedes.

> UX-2 navigation clarification (owner, <date>): the redesigned site shell supersedes the presentation described in the Sprint 5 navigation and Sprint 6 implementation clarifications; destinations and the shared category/type source are unchanged. Public, authentication and account pages share one root shell: a header with the logo, the catalog brand search and the account controls, and a category strip with "Instrumentos", the eight canonical categories and "Tiendas verificadas". Each category opens one panel at a time with "Ver todos" (its category page) and its canonical instrument types; on phones the strip scrolls sideways and the panel is a stacked list under it. A panel closes when a destination is chosen, on a route change, on an outside press and on Escape, which returns focus to its category. On phones the search is a row on the home, the catalog, the category pages and store pages, and sits behind a search icon on listing pages; account, legal and authentication pages show no search on phones. Protected account pages keep their nested, role-appropriate account navigation (a rail on desktop, a switcher on phones). Admin pages use their own frame without the public header, search or footer; the Admin navigation offers "Explorar categorías" with the same categories, types and destinations. This changes presentation only: it adds no search engine, page, route or rule.

Optional, the legal pages (line 355, "linked from the global footer"): the home's full footer links all four legal pages; the slim footer on every other public and account page links Consejos de seguridad, Términos y reglas and Privacidad, and "Artículos prohibidos" is also linked from the publication rules (unchanged since 2 Oct). If you want the line exact: "…are linked from the site footer (all four from the home's full footer; Consejos de seguridad, Términos y reglas and Privacidad from the slim footer on other pages), publication/signup rule acceptance and listing contact copy…".

## 2. Rows

Observed on a production build of `ux/redesign` (§ 3). "Observed" lists what the script saw; it is evidence, not a verdict.

### PUB-008 — Shared marketplace header and categories span public/auth/account/admin routes

- **Says:** one root shell exposes logo/search/account controls and canonical categories on public, auth, account and Admin routes, while protected account navigation stays nested.
- **Observed** (anonymous, Particular, Store Owner, Admin; 1440 and 390 px):
  - Home, catalog, a listing, a store page, `/registro/vendedor` and `/login`: logo, search, "Ingresar", the strip with its 8 category buttons, footer, one `<main>`, no overflow, at 1440. At 390 the search is a row on the home, catalog and store page, an icon on the listing, and absent on `/registro/vendedor` and `/login`.
  - Account pages (`/mi-cuenta`, `/mi-cuenta/favoritos`, `/mi-cuenta/tienda`): the same root header with the account menu and the strip; the nested account rail at 1440, the switcher at 390. No search at 390.
  - Account menu per role, at 1440: Particular 8 sections + "Cerrar sesión"; Store Owner 10 sections (Mi tienda, Inventario, Publicar, Estadísticas…) + "Cerrar sesión"; Admin the Particular sections + "Admin" + "Cerrar sesión".
  - `/admin` (1440 and 390): no public header, search, strip or footer; the Admin navigation with "Explorar categorías"; one `<main>`. On public pages the Admin gets the root shell with "Admin" in the account menu.
- **Gap:** Admin has its own frame (no root header or search), and phones have no search on account, auth and legal pages. Both by design (brief; N12 build side).
- **Option B wording:**
  - Requirement: "Shared marketplace shell spans public, auth and account routes; Admin keeps category access in its own frame"
  - Expected: "One root shell exposes logo, search, account controls and the canonical category strip on public, auth and account pages (search on phones per the UX-2 clarification), protected account navigation stays nested, and Admin's own frame offers the same category destinations."
  - Steps: unchanged.
- **Proposed evidence:** "UX-2 shell, automated local actual-browser re-run 2026-10-07 (scripts/ux-pub-rerun.cjs; ux/redesign): root shell with logo/search/account/8-category strip on home, catalog, listing, store, signup, login and account routes at 1440/390; nested account rail/switcher; role menus for Particular, Store Owner, Admin; Admin own frame with Explorar categorías — <result>."

### PUB-009 — Global search uses canonical catalog parsing and existing search analytics exactly once

- **Says:** Enter submits the brand to `/listados` with one signed search receipt; rendering, focus and typing emit no searches.
- **Observed** (anonymous, 1440, search events counted in the local `marketplace_events`): typing "MarcaInexistenteUX" without submitting: 0 events. Enter: `/listados?brand=MarcaInexistenteUX`, "0 resultados", **1** search event. Focusing the header search again: 0 events.
- **Gap:** none (the placeholder text changed, N8).
- **Proposed evidence:** "UX-2 shell, automated local actual-browser re-run 2026-10-07 (scripts/ux-pub-rerun.cjs): typing 0 events, Enter → /listados?brand=… with exactly 1 search event and 0 results, refocus 0 events — <result>."

### PUB-010 — Mobile global marketplace navigation remains usable alongside account navigation

- **Says:** search, categories, subtypes and account options stay accessible in a narrow viewport, without horizontal overflow or loss of the active account state.
- **Observed** (Particular and Store Owner, `/mi-cuenta/favoritos` at 390):
  - **Shell:** the root header with the account menu, the strip with 8 category buttons, the account switcher, one `<main>`, no overflow. No search on this page.
  - **Categories:** "Guitarras" opens its panel with "Ver todos" and the 3 canonical types; no overflow.
  - **Switcher:** it lists the role's sections with "Favoritos" marked current (Particular 8, Store Owner 10); the category panel is closed by then.
  - **Header account menu** (9 / 11 items): opening it closes the switcher, one menu at a time.
  - **Destination:** "Ver todos" reaches `/instrumentos/guitarras` with the panel closed.
  - **One interaction to note:** an open category panel lies over the page below the strip, the switcher included, so a person closes the panel (tap its category again, tap outside or Esc) before opening the switcher.
- **Gap:** search is not on phone account pages (UX-2 brief, N12 build side).
- **Option B wording:**
  - Requirement: "Mobile marketplace navigation remains usable alongside account navigation"
  - Expected: "Categories, subtypes and account options remain accessible in a narrow viewport without horizontal overflow or loss of active account state; the catalog search is reachable on browse pages and listings (UX-2 clarification)."
  - Steps: "Open Favorites at 390px; open a category and the account menus; inspect destinations, active state and page width."
- **Proposed evidence:** "UX-2 shell, automated local actual-browser re-run 2026-10-07 (scripts/ux-pub-rerun.cjs): Favorites at 390 for Particular and Store Owner: strip panel with Ver todos + canonical types, switcher with current section, header account menu one-at-a-time, Ver todos destination, no overflow; no search on account pages by design (UX-2 clarification) — <result>."

### PUB-011 — Open mega-menu contains only the selected major category taxonomy

- **Says:** the open panel shows the selected category's canonical instrument types and no other category's.
- **Observed** (anonymous and Particular, `/listados` at 1440): "Guitarras" opens one panel ("Ver todos", Guitarras eléctricas, Guitarras acústicas, Otro); "Baterías" then replaces it with one panel ("Ver todos", Baterías, Otro). Both match the canonical taxonomy exactly.
- **Gap:** none.
- **Proposed evidence:** "UX-2 shell, automated local actual-browser re-run 2026-10-07 (scripts/ux-pub-rerun.cjs): Guitarras then Baterías at 1440, anonymous and Particular: one panel at a time, each exactly its canonical types — <result>."

### PUB-012 — Mega-menu reuses the canonical listing and filter taxonomy

- **Says:** menu destinations use the same `category` and `instrument_type` values as listing creation and the catalog filters.
- **Observed** (1440): all 8 panels' links equal `categoryMenus` (built from `getInstrumentTypeOptions`, the listing form's source, and `categoryTypePath`); 0 mismatches. One type link per category followed: each lands on `/listados?category=<value>&instrument_type=<value>` with both filter selects showing those values (the catalog parsed them), the panel closed.
- **Gap:** none.
- **Proposed evidence:** "UX-2 shell, automated local actual-browser re-run 2026-10-07 (scripts/ux-pub-rerun.cjs): 8/8 panels equal the canonical taxonomy; one type link per category lands on /listados with category and instrument_type applied — <result>."

### PUB-013 — Mega-menu closes after destination selection and Next.js route change

- **Says:** no open panel persists after client navigation, including from another category.
- **Observed** (1440): after choosing "Guitarras eléctricas", the catalog loads with no panel open; a client navigation from there to a listing keeps it closed. With "Baterías" open, a client route change to `/instrumentos/baterias` closes it.
- **Gap:** none. Catalog links are full page loads by design (`ux-2-shell.md` § Amendment); category landings and listings are client navigations.
- **Proposed evidence:** "UX-2 shell, automated local actual-browser re-run 2026-10-07 (scripts/ux-pub-rerun.cjs): panel closed after a type link and after a client navigation; an open panel closes on a client route change — <result>."

### PUB-014 — Mega-menu closes on outside interaction and Escape

- **Says:** an outside press closes the panel; Escape closes it and returns focus to its trigger.
- **Observed** (1440 and 768): open → outside press → closed; reopened → Escape → closed, `aria-expanded="false"`, focus on the "Guitarras" button.
- **Gap:** none.
- **Proposed evidence:** "UX-2 shell, automated local actual-browser re-run 2026-10-07 (scripts/ux-pub-rerun.cjs): outside press closes; Escape closes with aria-expanded=false and focus on the category button, at 1440 and 768 — <result>."

### PUB-015 — Mobile category menu uses canonical taxonomy and closes after navigation

- **Says:** narrow navigation exposes category-specific **accordions** without overflow and collapses after a destination or closing.
- **Observed** (390): "Pedales" opens its panel as a stacked list (3 links, the canonical taxonomy), no overflow; following a type closes it; "Micrófonos" reopens a panel; tapping it again closes it; no overflow at any step.
- **Gap:** wording only: the phone form is one category panel under the strip, not an accordion (N12 build side).
- **Option B wording:**
  - Requirement: "Mobile category menu uses canonical taxonomy and closes after navigation"
  - Expected: "Narrow navigation opens one category-specific panel at a time without horizontal overflow and closes after selecting a destination or closing it."
  - Steps: unchanged.
- **Proposed evidence:** "UX-2 shell, automated local actual-browser re-run 2026-10-07 (scripts/ux-pub-rerun.cjs): at 390 a category opens one stacked panel with its canonical types, no overflow; closes after a destination and on its button — <result>."

### LEGAL-001 to LEGAL-006

Unchanged since 2 Oct (`ux-2-acceptance.md` § Spec and acceptance rows touched): the home's full footer links all four legal pages and states every limitation; the slim footer links three and states that Laria charges no commissions and processes no payments. No new run; the optional spec wording is in § 1.

## 3. How the evidence was produced

- Build: `next build` + `next start` of `ux/redesign` at `a689a1e` (N11 and the Admin accordion fix; `51e4ed4` adds only the script) on port 3100, against the shared local Supabase stack (127.0.0.1:54321); accounts from `scripts/ux-local-accounts.cjs`.
- Script: `scripts/ux-pub-rerun.cjs`, which follows each row's own steps and writes what it observes; it never decides a status.

```bash
LARIA_AGENT_BROWSER_BIN=<agent-browser> node --require ./tests/setup-alias.cjs scripts/ux-pub-rerun.cjs \
  --base http://localhost:3100 --label n12-rerun --db-container supabase_db_mkt_instrumentos
```

- Reports: `.ux-snapshots/n12-rerun/pub-rerun.json` (gitignored), with screenshots of the phone panels.
- Not covered: Safari/WebKit, a screen reader and real touch (N14: the owner's Mac pass), a deployment, hosted Supabase.
