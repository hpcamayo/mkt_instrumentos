# UX-2 — V1 reconciliation draft (N12)

Prepared by Claude Code on 7 Oct 2026 at the owner's request (`decisions.md` N12, record side). **8 Oct: the owner marked every draft Correct on the UX-2 review page (fine to record).** **9 Oct: refreshed for the shell as it ships after UX-3a and UX-3b, and re-run on the 3b build;** the texts below replace the 7 Oct drafts (those are in git history, `6fafbed`) and are on the UX-3b review page as group G, "N12: ready to record", one check per item. **Nothing here is recorded yet.** `docs/functional-spec.md` and `acceptance/cases.tsv` are unchanged, no status was set and no Pass is inferred: the owner reads each proposal and the evidence, decides, and records it (or asks Claude Code in the session to write exactly the texts marked Correct).

What changed since the 8 Oct approval:
- **The home** (3b): no category strip and no header search; the home header has its own "Categorías" menu ("Todos los instrumentos", every category with its types, "Tiendas verificadas"), and the search is the banner's. The spec paragraph says so, and the rows were re-run on it.
- **PUB-012**: the 7 Oct evidence cited the catalog's filter selects showing the chosen type; 3a removed them. The catalog now shows the chosen category and type as applied chips and, from 1024 px, as the current option in the filter column.
- **PUB-013**: the 7 Oct gap note said catalog links reload the page; since 3a they are client links (`ux-3-discovery.md` Q1 A).
- **The phone search sentence**: it was "a row on the home"; after 3b the home has the banner search instead.
- The re-run now covers 1440, 768 and 390 and all four visitors (signed out, Particular, Store Owner, Admin), including the home's "Categorías" menu.

The build side is decided (N12, 7 Oct): the UX-2 shell stays as built, with no search in Admin, no search on phone account, legal or sign-in pages, and the compact category panel on phones. So the canonical text is what changes.

## How to record

`acceptance/README.md` allows an authorized acceptance update to change a row's **status (column 5)** and **evidence (column 8)** and to preserve its requirement, expected result and steps. Two ways to reconcile, per row:

- **A. Keep the row's text and add evidence.** The new spec clarification (§ 1) says how the shell now meets the requirement, and the evidence entry points at it. Enough where the row's text still describes the build (PUB-009, PUB-011–PUB-014).
- **B. Reword the row** (columns 6, 7 and 12). This goes beyond the README's routine edit, so it needs the owner's explicit decision. Proposed text is given for the three rows whose words name the retired shell (PUB-008, PUB-010, PUB-015).

Whichever you choose, the evidence entry proposed below leaves the verdict to you: replace `<result>` with your status word. After editing, run `python3 -B acceptance/validate.py` and review `git diff -- acceptance/cases.tsv`.

## 1. functional-spec: proposed "UX-2 navigation clarification"

Where: a new paragraph after "Sprint 6 implementation clarification" (`docs/functional-spec.md` line 364). The Sprint 5 and Sprint 6 paragraphs stay as history; the new one says what it supersedes. The date is the owner's: the day it is recorded.

> UX-2 navigation clarification (owner, <date>): the redesigned site shell supersedes the presentation described in the Sprint 5 navigation and Sprint 6 implementation clarifications; destinations and the shared category/type source are unchanged. Public, authentication and account pages share one root shell: a header with the logo, the catalog brand search and the account controls, and a category strip with "Instrumentos", the eight canonical categories and "Tiendas verificadas". Each category opens one panel at a time with "Ver todos" (its category page) and its canonical instrument types; on phones the strip scrolls sideways and the panel is a stacked list under it. The home replaces the strip and the header search with its own header: a "Categorías" menu listing "Todos los instrumentos", every category (each opening its category page) with its canonical instrument types, and "Tiendas verificadas", stacked on phones, plus the brand search in the home banner. A panel or menu closes when a destination is chosen, on a route change, on an outside press and on Escape, which returns focus to its button. On phones the search is a row on the catalog, the category pages and store pages, sits behind a search icon on listing pages, and is the banner's search on the home; account, legal and authentication pages show no search on phones. Protected account pages keep their nested, role-appropriate account navigation (a rail on desktop, a switcher on phones). Admin pages use their own frame without the public header, search or footer; the Admin navigation offers "Explorar categorías" with the same categories, types and destinations. This changes presentation only: it adds no search engine, page, route or rule.

Optional, the legal pages (line 355, "linked from the global footer"): the home's full footer links all four legal pages; the slim footer on every other public and account page links Consejos de seguridad, Términos y reglas and Privacidad, and "Artículos prohibidos" is also linked from the publication rules (unchanged since 2 Oct; re-checked on the 3b build). If you want the line exact, replace "are linked from the global footer," with:

> are linked from the site footer (all four from the home's full footer; Consejos de seguridad, Términos y reglas and Privacidad from the slim footer on other pages),

## 2. Rows

Observed on a production build of `ux/redesign` at `7806053` (the UX-3b home) on 9 Oct (§ 3). "Observed" lists what the script saw; it is evidence, not a verdict. Each "Evidence to record" is the exact text for column 8 (appended to the existing entries with "; "), with `<result>` left for the owner's status word. Status (column 5) is the owner's.

### PUB-008 — Shared marketplace header and categories span public/auth/account/admin routes

- **Says:** one root shell exposes logo/search/account controls and canonical categories on public, auth, account and Admin routes, while protected account navigation stays nested.
- **Observed** (signed out, Particular, Store Owner, Admin; 1440, 768 and 390; 51 page snapshots, one `<main>` and no sideways overflow on every one):
  - The catalog, a listing, a store page, `/registro/vendedor`, `/login` and the account pages: logo, the brand search in the bar, the account entry, the strip with its 8 category buttons, the slim footer. At 390 the search is a row on the catalog and the store page, an icon on the listing, and absent on sign-up, sign-in and account pages.
  - The home, for every visitor: the home header (logo, "Categorías"; "Tiendas verificadas" from 768 px; "Cómo funciona" from 1024 px), the banner search, no strip and no header search, the full footer.
  - Account pages: the nested account rail from 1024 px and the switcher below it.
  - Account menu at 1440: Particular 8 sections + "Cerrar sesión"; Store Owner 10 sections (Mi tienda, Inventario, Publicar, Estadísticas…) + "Cerrar sesión"; Admin the Particular sections + "Admin" + "Cerrar sesión".
  - `/admin` (1440, 768, 390): no public header, search, strip or footer; the Admin navigation with "Explorar categorías"; one `<main>`. On public pages the Admin gets the root shell with "Admin" in the account menu.
- **Gap:** by design (UX-2 brief, N12 build side, UX-3 Q14): Admin has its own frame with no root header or search; phones have no search on account, sign-up and sign-in pages; the home has its "Categorías" menu instead of the strip and the banner search instead of the header search.
- **Option A:** keep the row's words; record the evidence below (the spec clarification in § 1 describes the shell).
- **Option B wording:**
  - Requirement: "Shared marketplace shell spans public, auth and account routes; Admin keeps category access in its own frame"
  - Expected: "One root shell exposes logo, search, account controls and the canonical categories on public, auth and account pages (the category strip; on the home, its Categorías menu and the banner search; search on phones per the UX-2 clarification), protected account navigation stays nested, and Admin's own frame offers the same category destinations."
  - Steps: unchanged.
- **Evidence to record:** "UX shell after UX-3b, automated local actual-browser re-run 2026-10-09 (scripts/ux-pub-rerun.cjs; ux/redesign 7806053): at 1440/768/390, signed out and as Particular, Store Owner and Admin: logo, brand search, account controls and the 8-category strip on catalog, listing, store, signup, login and account routes; the home header with its Categorías menu and the banner search on the home; nested account rail/switcher; role menus; Admin own frame with Explorar categorías; one main, no overflow — <result>."

### PUB-009 — Global search uses canonical catalog parsing and existing search analytics exactly once

- **Says:** Enter submits the brand to `/listados` with one signed search receipt; rendering, focus and typing emit no searches.
- **Observed** (search events counted in the local `marketplace_events`): the header search on `/listados` at 1440, and the home's banner search at 1440 and 390: typing "MarcaInexistenteUX" without submitting: 0 events. Enter: `/listados?brand=MarcaInexistenteUX`, "0 resultados", **1** search event with `zero_results`. Focusing the search again (on the results page; for the banner, back on the home): 0 events.
- **Gap:** none. Since 3b the home's search is the banner's, the same GET form with the same placeholder; the catalog records the search.
- **Evidence to record:** "UX shell after UX-3b, automated local actual-browser re-run 2026-10-09 (scripts/ux-pub-rerun.cjs; ux/redesign 7806053): header search on /listados and the home banner search at 1440 and 390: typing 0 events, Enter → /listados?brand=… with exactly 1 search event and 0 results, refocus 0 events — <result>."

### PUB-010 — Mobile global marketplace navigation remains usable alongside account navigation

- **Says:** search, categories, subtypes and account options stay accessible in a narrow viewport, without horizontal overflow or loss of the active account state.
- **Observed** (Particular and Store Owner at 390):
  - **Favoritos:** the root header with the account menu, the strip with 8 category buttons, the account switcher, one `<main>`, no overflow; no search on this page.
  - **Categories:** "Guitarras" opens its panel with "Ver todos" and the 3 canonical types; no overflow. "Ver todos" reaches `/instrumentos/guitarras` with the panel closed.
  - **Switcher:** the role's sections with "Favoritos" marked current (Particular 8, Store Owner 10); the category panel is closed by then.
  - **Header account menu** (9 / 11 items): opening it closes the switcher, one menu at a time.
  - **The home:** "Categorías" opens its list (27 destinations, scrolling inside the panel, no overflow); opening the account menu closes it.
  - **One interaction to note:** an open strip panel lies over the page below the strip, the switcher included, so a person closes the panel (tap its category again, tap outside or Esc) before opening the switcher.
- **Gap:** search is not on phone account pages (UX-2 brief, N12 build side).
- **Option A:** keep the row's words; record the evidence below.
- **Option B wording:**
  - Requirement: "Mobile marketplace navigation remains usable alongside account navigation"
  - Expected: "Categories, subtypes and account options remain accessible in a narrow viewport without horizontal overflow or loss of active account state; the catalog search is reachable on browse pages, listings and the home (UX-2 clarification)."
  - Steps: "Open Favorites at 390px; open a category and the account menus; inspect destinations, active state and page width."
- **Evidence to record:** "UX shell after UX-3b, automated local actual-browser re-run 2026-10-09 (scripts/ux-pub-rerun.cjs; ux/redesign 7806053): Favorites at 390 for Particular and Store Owner: strip panel with Ver todos + canonical types, switcher with current section, header account menu one-at-a-time, Ver todos destination, no overflow; on the home the Categorías menu closes when the account menu opens; no search on account pages by design (UX-2 clarification) — <result>."

### PUB-011 — Open mega-menu contains only the selected major category taxonomy

- **Says:** the open panel shows the selected category's canonical instrument types and no other category's.
- **Observed** (signed out and Particular, `/listados` at 1440 and 768): "Guitarras" opens one panel ("Ver todos", Guitarras eléctricas, Guitarras acústicas, Otro); "Baterías" then replaces it with one panel ("Ver todos", Baterías, Otro). Both match the canonical taxonomy exactly. The home's "Categorías" menu lists every category at once, each with exactly its own canonical types (8 groups, same visitors and widths).
- **Gap:** none for the strip. The home's menu is not a per-category panel: it shows all categories, each with only its own types (`ux-2-shell.md` § Home header; the clarification in § 1 describes it).
- **Evidence to record:** "UX shell after UX-3b, automated local actual-browser re-run 2026-10-09 (scripts/ux-pub-rerun.cjs; ux/redesign 7806053): strip at 1440 and 768, signed out and Particular: Guitarras then Baterías, one panel at a time, each exactly its canonical types; the home's Categorías menu lists each category with only its own types — <result>."

### PUB-012 — Mega-menu reuses the canonical listing and filter taxonomy

- **Says:** menu destinations use the same `category` and `instrument_type` values as listing creation and the catalog filters.
- **Observed:**
  - The strip's 8 panels at 1440 equal `categoryMenus` (built from `getInstrumentTypeOptions`, the listing form's source, and `categoryTypePath`); 0 mismatches.
  - The home's "Categorías" menu: its 27 destinations equal the same source in order, for every visitor at 1440 and signed out at 768 and 390; 0 mismatches.
  - One type link per category followed from the strip (1440) and from the home's menu (1440 and 390), 24 in all: each lands on `/listados?category=<value>&instrument_type=<value>` (or the category page when the type is the category itself), with the applied chips "Categoría: <category>" and "Tipo: <type>", the guitars type marked current in the filter column at 1440, and no menu left open.
- **Gap:** none.
- **Evidence to record:** "UX shell after UX-3b, automated local actual-browser re-run 2026-10-09 (scripts/ux-pub-rerun.cjs; ux/redesign 7806053): 8/8 strip panels and the home's Categorías menu (27 destinations, all visitors, 1440/768/390) equal the canonical taxonomy; one type link per category from the strip and from the home menu lands on /listados with category and instrument_type applied (applied chips; type marked in the filter column) — <result>."

### PUB-013 — Mega-menu closes after destination selection and Next.js route change

- **Says:** no open panel persists after client navigation, including from another category.
- **Observed:**
  - Strip (1440): after choosing "Guitarras eléctricas", the catalog loads with no panel open; a client navigation from there to a listing keeps it closed. With "Baterías" open, a client route change to `/instrumentos/baterias` closes it.
  - The home's "Categorías" (signed out and Admin, 1440 and 390): after "Guitarras eléctricas" the catalog loads by client navigation with no menu open; with the menu open, a client route change to `/instrumentos/baterias` leaves nothing open, and back on the home the menu is closed.
- **Gap:** none. Catalog links are client links again since UX-3a (`ux-3-discovery.md` Q1 A); the 7 Oct note about full page loads no longer applies.
- **Evidence to record:** "UX shell after UX-3b, automated local actual-browser re-run 2026-10-09 (scripts/ux-pub-rerun.cjs; ux/redesign 7806053): strip panel closed after a type link and after a client navigation, and closed by a client route change; the home's Categorías menu closed after a type link and by a client route change, at 1440 and 390 — <result>."

### PUB-014 — Mega-menu closes on outside interaction and Escape

- **Says:** an outside press closes the panel; Escape closes it and returns focus to its trigger.
- **Observed:** strip at 1440 and 768: open → outside press → closed; reopened → Escape → closed, `aria-expanded="false"`, focus on the "Guitarras" button. The home's "Categorías" at 1440 (signed out and Particular), 768 and 390: the same, with focus back on "Categorías".
- **Gap:** none.
- **Evidence to record:** "UX shell after UX-3b, automated local actual-browser re-run 2026-10-09 (scripts/ux-pub-rerun.cjs; ux/redesign 7806053): outside press closes; Escape closes with aria-expanded=false and focus on the trigger, for the strip at 1440 and 768 and the home's Categorías menu at 1440, 768 and 390 — <result>."

### PUB-015 — Mobile category menu uses canonical taxonomy and closes after navigation

- **Says:** narrow navigation exposes category-specific **accordions** without overflow and collapses after a destination or closing.
- **Observed** (390, signed out and Store Owner):
  - Strip: "Pedales" opens its panel as a stacked list (3 links, the canonical taxonomy), no overflow; following a type closes it; "Micrófonos" reopens a panel; tapping it again closes it; no overflow at any step.
  - The home's "Categorías": one stacked list with the 27 canonical destinations, 44 px rows, scrolling inside the panel, no overflow; "Otro" under Pedales lands on `/listados?category=pedals&instrument_type=other` with the menu closed; reopened, a tap on "Categorías" closes it.
- **Gap:** wording only: the phone form is one category panel under the strip (and, on the home, one stacked list), not an accordion (N12 build side).
- **Option A:** keep the row's words; record the evidence below.
- **Option B wording:**
  - Requirement: "Mobile category menu uses canonical taxonomy and closes after navigation"
  - Expected: "Narrow navigation opens one category panel at a time (on the home, one stacked Categorías list) with the canonical types, without horizontal overflow, and closes after selecting a destination or closing it."
  - Steps: unchanged.
- **Evidence to record:** "UX shell after UX-3b, automated local actual-browser re-run 2026-10-09 (scripts/ux-pub-rerun.cjs; ux/redesign 7806053): at 390 a strip category opens one stacked panel with its canonical types and the home's Categorías opens one stacked list (scrolling inside) with every category and type, no overflow; both close after a destination and on their button — <result>."

### LEGAL-001 to LEGAL-006

Unchanged since 2 Oct (`ux-2-acceptance.md` § Spec and acceptance rows touched): the home's full footer links all four legal pages and states every limitation; the slim footer links three and states that Laria charges no commissions and processes no payments. No new run; the optional spec wording is in § 1.

## 3. How the evidence was produced

- Build: `next build` + `next start` of `ux/redesign` at `7806053` (the UX-3b home; the commits after it change only scripts and docs) on port 3300, against the shared local Supabase stack (127.0.0.1:54321) with the photo fixture (`scripts/ux-local-photos.cjs`); accounts from `scripts/ux-local-accounts.cjs`.
- Script: `scripts/ux-pub-rerun.cjs`, updated for the 3b shell (the home header and its "Categorías" panel, the banner search, applied chips instead of the old filter selects; 1440, 768 and 390; all four visitors). It follows each row's own steps and writes what it observes; it never decides a status.

```bash
LARIA_AGENT_BROWSER_BIN=<agent-browser> node --require ./tests/setup-alias.cjs scripts/ux-pub-rerun.cjs \
  --base http://localhost:3300 --label n12-rerun-3b --db-container supabase_db_mkt_instrumentos
```

- Reports: `.ux-snapshots/n12-rerun-3b/pub-rerun.json` (PUB-008, PUB-010–PUB-015) and `.ux-snapshots/n12-rerun-3b-pub009/pub-rerun.json` (PUB-009, run alone so no other session's searches are counted), with screenshots of the phone panels and the home's menu (gitignored).
- Not covered: Safari/WebKit, a screen reader and real touch (N14: the owner's Mac pass), a deployment, hosted Supabase.
