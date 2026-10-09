# Sub-sprint roadmap

Eight sub-sprints, grouped by UX system and journey, not by file. Each has an approval gate before implementation and an acceptance gate after. Nothing starts automatically.

| # | Sub-sprint | Goal | Major surfaces | Depends on | Owner decisions expected | Risk / size | State (8 Oct) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UX-1 | **Foundations** | One visual and content language, applied everywhere through shared primitives; contrast and focus fixed product-wide; public placeholders removed | Tokens (`globals.css`, `tailwind.config.ts`), font, primitives (Button, Field, Tag/Status, Chip, Notice, EmptyState, PageHeader, Price, VerifiedMark), glossary + status dictionary, orthography sweep, favicon/email colors, skip link, screenshot harness, `docs/design-system.md` rewrite | Sprint 9 accepted | Typeface, blue-as-text policy, derived tones, shape language, base size, uppercase, WhatsApp CTA, glossary, touchpoints | Medium-high: global, wide diff, no layout changes | Accepted 30 Sep |
| UX-2 | **Shell and navigation** | Compact, fast frame on every device; search always reachable; categories as the main browse path | Header (phone/tablet/desktop), search entry, category nav (strip + menus), account menu and badges, footer, breadcrumbs, page frames (public/account/Admin), 404/500 | UX-1 | *Decided 30 Sep–7 Oct: N1–N14, G1* | Medium | Accepted 8 Oct; N12 recording open (owner) |
| UX-3 | **Discovery** | Browsing and comparing gear fast | Home (marketplace-first), catalog/search results, category landings, filters (sidebar + sheet), applied chips, sort, pagination/"Ver más", the one listing card, empty/no-results/loading | UX-1, UX-2 | § UX-3 | High: highest traffic, SEO-sensitive | Brief approved 8 Oct (`ux-3-discovery.md`, answers Q1–Q20); 3a and 3b accepted 9 Oct (`ux-3a-acceptance.md`, `ux-3b-acceptance.md`); UX-4 next |
| UX-4 | **Listing and store pages** | Confident decision and trustworthy contact | Gallery + lightbox, identity/price/condition block, contact module, safety note, seller/store module, spec table, description, reviews display, related listings, sold view, store page, report entry points | UX-3 (card) | § UX-4 | Medium-high | Not started |
| UX-5 | **Selling** | A clear path to a complete, attractive listing | Sell entry (`/vender`), create flow (taxonomy, attributes, photos, price, location, contact), validation and error summary, submit and confirmation, edit and "Cambios en revisión", relist | UX-1, UX-4 (what a listing shows) | § UX-5 | High: forms + photo handling | Not started |
| UX-6 | **Accounts** | Coherent workspaces for Particular and Store Owner; onboarding | Sign-in, sign-up, store application, invitations, password; Resumen; Mis publicaciones and Inventario; Favoritos; Alertas; Notificaciones; Compras y ventas + reviews; Perfil y seguridad; Mi tienda; Estadísticas | UX-1, UX-2, UX-5 | § UX-6 | High; may split into 6a onboarding + Particular and 6b Store | Not started |
| UX-7 | **Admin workbench** | Moderation throughput and safety | Queue layout, list/detail with inline photos and change diffs, dense tables, action hierarchy and confirmations, stores/users/reports/reviews/transactions/legacy linking, audit history | UX-1 (+ list primitives from UX-6) | § UX-7 | Medium-high | Not started |
| UX-8 | **Coherence and hardening** | Nothing inconsistent, inaccessible or slow is left | Cross-product sweep, final microcopy, keyboard/screen-reader/zoom audit, real browsers and devices, Core Web Vitals, harness baseline refresh, final docs, rebase and merge preparation | All | § UX-8 | Medium | Not started |

Each sub-sprint also applies its items from `home-visual-audit.md` (table "By sub-sprint").

Sequencing: UX-1 → UX-2 → UX-3 → UX-4 → UX-5 → UX-6 → UX-7 → UX-8. Admin (UX-7) could move earlier if moderation volume requires it; that is an owner call.

The sections below are the starting point for each sub-sprint's brief, not the brief itself. They were checked against the code on 7 Oct (file:line references are as of `ux/redesign` after the UX-2 answers). Each brief re-checks them, proposes the design, and asks the owner the listed questions.

## How every sub-sprint runs

1. **Brief and approval.** A fresh session writes `ux-N-<name>.md`: scope, the concept renders it follows, the decided inputs, the questions (each with options and a recommendation), the product rules it must not change, its acceptance criteria and the evidence it will produce. Nothing is built before the owner approves it. Questions that change product behaviour are flags (§ Product-behavior flags), never silent.
2. **Build** on `ux/redesign` (N13: no per-sub-sprint branch so far; one rebase on `main` at merge). Read the existing code first, keep to `components/ui/` and the tokens, Spanish copy from the glossary, no schema, auth, authorization, moderation or business-logic change. Tests that pin old markup are updated deliberately, never weakened; a test whose assertion goes away is replaced by an equal or stronger one.
3. **Evidence**, on a production build (`next build` + `next start`, stopped by port) against local Supabase only (the worktree's `.env.local`, 127.0.0.1:54321; never the main checkout's, which is production):
   - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`;
   - `scripts/ux-snapshots.cjs` before/after (selected WebP frames in `screenshots/ux<N>-before|after/`);
   - `scripts/ux-audit.cjs` (axe WCAG 2.1 A/AA, focus rings, Tab order, one `<main>`/`<h1>`, frames, overflow, 200% zoom, layout shift), extended with the sub-sprint's own checks;
   - first-load JS per route against the previous numbers;
   - the acceptance rows the sub-sprint touches, re-run on the build with `scripts/ux-pub-rerun.cjs`-style scripts, observations only (as for N12 in `ux-2-reconciliation.md`).
4. **Acceptance package** `ux-N-acceptance.md` (commits, criteria with evidence, deviations, rows touched, tests changed, known limitations, what still needs the owner) and **one review page** for the owner: a private checklist with Correct/Wrong per check and screenshots (the owner's preferred format). Docs updated in the same pass: this roadmap, `README.md`, `decisions.md`, `docs/design-system.md`, `review-guide.md` when the review scope changes.
5. **Acceptance records.** `acceptance/cases.tsv` and `docs/functional-spec.md` are the owner's: Claude Code drafts wording and evidence and never sets a status or infers a Pass.

Tools and traps (also in the review guide): agent-browser blanks its tab a few seconds after a run of Esc/Enter/Tab presses, so keyboard checks run in their own sessions; the axe-core file is at `~/Documents/backus-visitas/node_modules/axe-core/axe.min.js`; `typecheck` reads `.next/types`, so delete `.next` after removing a route; the Supabase CLI rewrites `supabase/.temp/cli-latest` (restore it with `git checkout`).

## UX-3 Discovery

**Goal.** A visitor finds and compares gear fast: a marketplace home, a catalog that works like a discovery tool, category landings that share it, and one listing card everywhere.

**Starts when** the owner accepts UX-2 (accepted 8 Oct). The session prompt is `ux-3-kickoff.md`.

**State (8 Oct).** The brief `ux-3-discovery.md` is **approved by the owner**.
- **The answers:** Q1–Q18 on the review page https://claude.ai/artifact/7DCnPzHDMrXRSfBx7mueG4, then Q19 and Q20 in the session (`decisions.md`). Every recommendation was taken except Q8: condition and location become multi-choice (F11), with no alert or database change.
- **3a accepted (owner, 9 Oct**; review page 31 of 31 Correct): `ux-3a-acceptance.md`. Commits `5f4bdd1` (the stall fix), `4ddf8cc` (the one card), `6651815` (the catalog, filters with F11, chips, sort, numbered pages, landings and states), `58bae38` (evidence and docs), `4057065` (seed-id fix for events, contacts and views, found in the row re-runs; production has the same ids; ships with the UX-3 push, owner 9 Oct).
- **3b accepted (owner, 9 Oct**; review page 37 of 37 Correct, P6–P10 as built): `ux-3b-acceptance.md` and its review page, which also carries N12 refreshed for recording. Commits `eeeb7ad` (the local photo fixture), `7806053` (the home: home header and "Categorías", the banner, the showcase tile and "En vitrina", the sections, states, tests), then the evidence and docs commit. Choices P6–P10 pending in `decisions.md`.
- **Next:** UX-4 starts with its brief (§ UX-4), in a fresh session. N12's refreshed texts were approved on the 3b review page (option A for PUB-008, PUB-010, PUB-015); recording them is the owner's (or Claude Code's on the owner's explicit request, with the owner's status words).
- The plan below is the input the brief was written from. Where they differ, the brief and its answers win.

**Scope and current code**
- **Home `/`**: `app/page.tsx` (154 lines) and the six `components_v0/*` sections, which go. Build the decided "Inicio · versión final" (`screenshots/home-final/`):
  - the **home header** with its own "Categorías" menu and the banner search (`ux-2-shell.md` § Home header). The home then leaves the category strip (`getShellLayout("/")` in `lib/shell.ts`); its search row on phones moves into the banner;
  - the **banner**: one of the nine pieces in `art/rotation/` per visit, chosen at page load, no motion (H7, H9–H11); headline H6; the N8 placeholder;
  - **"En vitrina"**: automatic (H2: the newest approved listing per category with at least 3 photos, each tile naming its category) with ink price tags (H3). The home query has no `photo_count` today (`app/page.tsx:45–75`; the catalog reads `listing_photo_count`, `lib/catalog.ts:38`);
  - **"Recién publicados"**: it skips the vitrina listings. Then compact categories, "Cómo funciona Laria" with promises 1–5 (H4), the sell block ("Publicar es gratis. Revisamos tu publicación antes de mostrarla.") and the full footer.
  - The home has no `loading.tsx` or `error.tsx` of its own.
- **Catalog `/listados`**: `app/listados/page.tsx` (384 lines), `loading.tsx`, `components/listing-filters.tsx` (463), `lib/instrument-filters.ts` (565), `lib/catalog.ts`. The concept (Catalogo-1440/390) has:
  - a compact title with the count, an inline alert entry and sort;
  - facets with applied chips;
  - a phone filter sheet with a sticky "Ver N resultados";
  - two columns on phones.

  Today:
  - eight native selects and "Aplicar filtros" (`listing-filters.tsx:269–314`);
  - sort twice (`:119`, `:243`);
  - the alert promo above the results even with no filter (`listados:138`, landing `:108`);
  - one column below 460 px (`listados:151`).
- **Category landings** (`components/category-landing.tsx`, 170 lines, rendered from `app/instrumentos/[slug]/page.tsx:261`): the same card, filters entry and type chips; their SEO stays (canonical, ItemList JSON-LD, `noindex` while empty, 24 per page).
- **The one listing card**: `components/listing-card.tsx` (309 lines) and the home's second card (`components_v0/featured-listings.tsx:74`) become one component.
  - **Today:** up to 10 tab stops per card (`:161–239`): two carousel arrows (28 px), up to five dots (6 px, below the 24 px target minimum, UX-1 open item), the favourite, the title and the store.
  - **Decided values** (home visual audit): two reserved title lines, title 600, price 750, radius 8, gutters 20 / 12.
  - **Data available without schema change:** the photo count, the attributes per type (`getKeyListingSpecs`, `lib/listing-specs.ts:38`) and the condition. Ratings are not on cards; showing them would need a new query.
- **States**: empty, no results ("No encontramos resultados", pinned by the favorites smoke), loading and error for the home, the catalog and the landings.
- **Primitives waiting for a consumer:** `Chip` (toggle) and `Radio` (`tests/ux-primitives.test.cjs:28`). The filter sheet is their first.

**First task: the catalog transition stall.** Done 8 Oct; details and measurements in `ux-3-discovery.md` § The catalog transition stall.
- **Found:**
  - The bisect of UX-1's twelve commits names `444ac25` (class migration) as the first stalling build: 6 of 10 trials, against 0 of 12 on `6525abb`.
  - The cause is a race in Next.js 15.5's aliased-prefetch navigation. With no prefetch for the exact URL, the router reuses the entry seeded for `/listados` because the route has a `loading.tsx`, renders the page without data, lazily fetches it and patches its state. In stalled trials the router state holds the new page, and React never renders it.
  - `main` takes the same path and wins the race. `444ac25` changed the render work enough to lose it: neither half of the commit alone stalls.
  - It is not specific to `?seller_type=verified_store`. On head, `?condition=Nuevo` stalls 10 of 10, `?category=guitars` 5 of 10, `?page=2` 1 of 10.
- **Fix decided** (Q1 A, owner, 8 Oct; first task of 3a): remove `app/listados/loading.tsx` (0 of 42 stalls on a scratch build of head) and show navigation feedback in the page. Then the catalog links stop being native.
- **Built in 3a (`5f4bdd1`):** `loading.tsx` removed, the pending state moved into the page, catalog links client links again. Trials before / after the fix / on the finished 3a build: 32, 0 and 0 stalls in 120 (`ux-3a-acceptance.md` § Transition trials).

**Decided inputs.** H1–H11 and the home's final canvas; N7 ("Tiendas verificadas" opens the filtered catalog; there is no stores directory); N8 (brand-only placeholder); G1; the N12 hybrid (the home header's "Categorías" menu replaces the strip on the home); the home visual audit's UX-3 items 2, 3, 6, 7, 8, 9, 11, 12, 15, 16 and 17.

**Questions for the brief**
- Home visual audit item 4 (a denser "Recién publicados", 6 per row) and item 13 (fading the nine phone banners into the frame black: art files).
- The design-system confirmations listed in `home-visual-audit.md`: `t-card-title` 600, button heights 36/44/52 only, one gutter per breakpoint (20/12) and one card radius (8), section spacing, white store monograms.
- Card fields per category (which attributes; seller type; location), photo aspect ratio, grid only or a list view too.
- Filters that apply live or with a button; "Ver más" or numbered pages (crawlable `?page=N` either way).
- Facet counts and the sheet's "Ver N resultados" need count queries per change: a read-only query change, so a flag.
- Where the alert entry goes.
- Reading `photo_count` on the home for H2 (a read of an existing computed column).
- F9 free-text search (brand, model, title): a product flag, decided on its own or left for later; the banner keeps the N8 placeholder until then.
- Whether to split: **3a** the card, catalog, landings, filters and states (with the stall fix), then **3b** the home. Recommended, since the home's tiles build on the card.

**Product rules it must not change**
- The catalog query (`lib/catalog.ts`): approved and visible listings only, deterministic order (REL-004), 24 per page (REL-001), filters kept across pages (REL-003).
- URL-driven filters with the canonical `category`/`instrument_type` values.
- One search event per real search (PUB-009, AN-004) and filter events (AN-006); impressions (AN-001); favourites (FAV-003/007); alert creation (ALERT-001/002).
- Category slugs, canonical URLs, JSON-LD, `noindex` rules and the sitemap (SEO-001–005).

**Acceptance rows to re-run** (observations for the owner): PUB-001, PUB-002, PUB-005, PUB-006 (Not Run), PUB-009, PUB-011–015 (the home header's menu), SEO-001–007 (SEO-006/007 Not Run), REL-001, REL-003, REL-004, PHOTO-010, PHOTO-016, FAV-003, FAV-007, ALERT-001, ALERT-002, AN-001, AN-004, AN-006, LIFE-007 (Not Run).

**Tests that pin today's markup** (update deliberately):
- `sprint-9` SEO-002–005: `<ListingFilters filters={filters} />`, the exact `<Pagination …/>`, `<ListingCard key… />`, `<SearchTelemetry`.
- `sprint-9` `:356`: the home's category links and hero.
- `sprint-9-gate:173`: `CategoriesSection` hrefs.
- `sprint-3-1:44`: the card's `{displayTitle}`.
- `marketplace-tracking:300`: an AST check of the catalog's search receipt.
- `ux-copy:141`: the featured card's condition.
- `ux-shell`: the home's frame, which loses the strip with the home header.
- Smokes and SEO tests:
  - `favorites-browser-smoke` (`main article`, the card as the `article` with the detail link, no overflow at 390, "No encontramos resultados");
  - `seo-smoke.test.cjs` and `seo-rendered-metadata-smoke.cjs` (`?page=2`, ItemList).

**Evidence specific to UX-3.** LCP on the home with the art banner (WebP 1x/2x; decorative; the old hero photo was the LCP at 1.67 s), first-load JS (home 113 kB, catalog 135 kB today), the SEO smokes, the audit with the filter sheet open, two-column phone grids without overflow.

**Size.** High. Split recommended (above).

## UX-4 Listing and store pages

**Goal.** A buyer decides with confidence and contacts the seller in one obvious step.

**Starts when** UX-3 is accepted (it reuses the card for related listings and store grids).

**Scope and current code**
- **Listing** `app/instrumentos/[slug]/page.tsx` (881 lines) with `listing-detail-gallery.tsx` (142), `listing-detail-metadata.tsx` (67), `whatsapp-contact-link.tsx`, `reputation-summary.tsx`, `content-report.tsx` (154, inline form), `favorite-button.tsx`, `lib/listing-specs.ts`.
  - Concept (Ficha-390): thumbnails, a spec strip, Guardar/Compartir, a seller card with ratings, a contact bar on phones.
  - Sold view (`:326–379`, `:689–711`; `noindex`, SoldOut).
  - Hidden listings are 404 (`:169–190`); there is no owner view.
- **Store** `app/tiendas/[slug]/page.tsx` (333 lines).
  - Concept (Tienda-1440): a compact identity header with stats, tabs, in-store search and chips, five columns.
  - It reads only some store fields (`:55–77`). The table also has description, city/district/region, address, socials and `store_photos`.
  - Store grids are one column below 640 px (`:297`).

**Carried in**
- **React #418** on a freshly created listing with two Storage photos, in production builds (pre-existing, also on `645d51e`). Fix it first: it keeps the strict favorites browser smoke from passing.
- **Two WhatsApp buttons** in one phone screen (`:382–389` and `:690–698`); "Ver tienda" twice (`:391`, `:701`). `ux-copy:129` pins exactly three contact buttons across listing and store.
- **Public "Visto N veces"** (`listing-detail-metadata.tsx:47,65`; F3).
- **The payment disclaimer repeated:** listing twice plus `reputation-summary`, store `:250–254`, landing `:158–163`. One trust statement instead, keeping the LEGAL-005/006 content.
- **Related listings** in one column on phones (`:786`).
- **Store pages** have no breadcrumb.
- **The strip marks no current category** on listing and store pages (the shell does not know a listing's category).
- **No `loading.tsx` or `error.tsx`** for listings and stores.
- Home visual audit items 3, 4, 11, 12.

**Decided inputs.** D7 (yellow WhatsApp CTA with the glyph, "Contactar por WhatsApp"), N3 (nothing sticky in the shell), H4 wording for promises, the UX-3 card.

**Questions for the brief**
- Gallery layout and a lightbox.
- A contact bar on phones: a page element, so not ruled out by N3, but the owner decides.
- F3, the public view counter (hide below a threshold, or show it only to the owner).
- F5, a safety step before the first WhatsApp contact: a product flag.
- One trust statement: its wording and place.
- Store page content: which stats are real (no fake metrics), tabs, in-store search and chips (a store-scoped catalog query: a flag).
- Spec table content (`getFullListingSpecs`).
- An owner's view of their own listing (new behaviour: a flag).
- F1 relist slug growth (URL behaviour).
- F2 condition scale (data model: likely post-V1).

**Product rules it must not change**
- Contact launch and tracking: `wa.me` with the prefilled message (WA-001–007).
- Counting: views (AN-002, `trackView={!isSold}`) and store visits (AN-007).
- Reputation only from verified transactions: `get_public_reputation` (`lib/transactions.ts:69,120`). Never imply Laria handled payment, delivery, guarantees or disputes.
- Report flows (REP-001–005, REVW-015).
- Status pages: a sold listing stays reachable with "Vendida", `noindex` and SoldOut; a hidden listing is a 404; a store is hidden before approval.
- Labels: "Tienda" and "Tienda verificada" only (VERIFY-001/012).

**Acceptance rows to re-run:**
- PUB-003, PUB-004, PUB-007 (Not Run)
- LIFE-005, LIFE-006
- PHOTO-017
- LIST-009, LIST-011, LIST-015–018 (Not Run)
- WA-001–007
- FAV-006
- AN-002, AN-007
- SANA-001
- REP-001–005
- REVW-015, REVW-018–020
- REL-002
- STORE-011, STORE-012, STORE-015
- VERIFY-001, VERIFY-012
- LEGAL-005/006 and SCOPE-001–006 (Not Run; copy)

**Tests that pin today's markup:**
- `ux-copy`:
  - `:129` (three WhatsApp buttons);
  - `:141` (store initials).
- `sprint-9`:
  - `:333` (forbidden wording per file; the safety link on the listing);
  - `:420` (metadata order).
- `sprint-3-1:44` (the listing `<h1>`).
- `listing-lifecycle:43` (sold copy).
- `sprint-8:368` (report labels).
- `marketplace-tracking:323,347` ("Visto 8 veces").
- `analytics-browser-smoke`:
  - `[aria-label="Miniaturas de fotos"]`, eager main image, lazy thumbnails;
  - the first `wa.me` link;
  - store `article` images.
- `favorites-browser-smoke` (the listing's favourite controls).
- The SEO smokes (SoldOut, JSON-LD).

**Size.** Medium-high.

## UX-5 Selling

**Goal.** A seller gets from "Vender" to a complete, attractive listing without guessing, and knows what happens next.

**Scope and current code**
- **Routes:**
  - `/vender` (account-type gate);
  - `/publicar` (redirect);
  - `/mi-cuenta/publicar` (Particular; profile gate);
  - `/mi-cuenta/tienda/publicar` (store; the 50-listing cap notice);
  - `/mi-cuenta/publicaciones/[id]/editar` (edit and "Cambios en revisión").
- **Components and code:** `components/sell-listing-form.tsx` (375), `listing-edit-form.tsx` (456), `location-fields.tsx`, `page-notice.tsx`, and `lib/listing-submission.ts`, `public-submission.ts`, `submission-token.ts`.
- **Concept (Publicar-390):** photos first, type chips, condition radio cards with definitions, grouped sections, an error summary.

**Carried in**
- **Field errors:** `Field` supports `error` (`components/ui/field.tsx:39–44`) but no form passes one, so there is no `aria-invalid`/`aria-describedby` in practice. There is no error summary, only a top `PageNotice` (sell `:238–242`, edit `:344–348`).
- **About seven verbs for "publish"** in the sell form (`:100–311`).
- **English attribute option labels** (`lib/instrument-filters.ts:64–66, 112–113, 386, 474–483, 515`). The labels are copy; the values stay.
- **On success the create form resets** (`:221–225`), and create shows no upload progress (edit does); per-photo `aria-label`s exist only on edit.
- **Database string "producto"** (`LISTING_FIELD_REQUIRED`), mapped to generic copy by the manage route: a migration, owner approval (UX-1 open item).
- **Email notices in context** (`decisions.md` § Email notices in context): sending a listing for review states the approval/rejection email.
- **Primitives:** `Chip` toggle and `Radio` (type chips, condition cards).
- Home visual audit items 6, 14.

**Questions for the brief**
- One page or steps.
- Photo guidance.
- Condition help text (the three grades; F2 is separate).
- F6 draft autosave (new behaviour).
- F4 "Nuevo" limited to stores (product rule).
- After submit: a confirmation view or a reset form.
- The "producto" migration.
- F1 if relist is touched.

**Product rules it must not change**
- **Submission:** `submit_listing_for_publication`, `complete_public_submission`, submission tokens and retry.
- **Edits:** the split between immediate fields (price, description, city, region, attributes) and moderated fields (`listing-edit-form.tsx:244–245`, pinned by `listing-lifecycle`); `update_owned_listing` / `apply_owned_listing_edit`; `review_listing_revision` with `p_expected_version`.
- **Photos:** 2–10, JPEG/PNG/WebP, size limit (`lib/listing-submission.ts`); `listing_photo_set_is_valid`; the reference-checked photo cleanup.
- **Stores:** the 50-listing cap (`enforce_store_inventory_cap`).
- **Lifecycle:** `set_owned_listing_lifecycle`; `relist_sold_listing` (its slug suffix is F1).

**Acceptance rows to re-run:**
- LIST-001–023 (most Not Run)
- PHOTO-001–031 (PHOTO-030: mobile editor without overflow, focused notice)
- REV-001–019
- LIFE-001–014
- CAP-001–011
- The legal links in the rules (LEGAL)

**Tests that pin today's markup:**
- `photo-editor.test.cjs` (14 tests): finds controls by "Mover foto N antes/después", "Reemplazar foto N", "Quitar foto N"; alt "Foto N"; `sizes`.
- `photo-browser-smoke.cjs`: `edit-photo-heading`, "Guardar cambios", `form[aria-busy]`.
- `sprint-3-1`: `inputMode="numeric"`.
- `account-shell`: `PageNotice` focus.
- `listing-lifecycle`: the field arrays.
- `sprint-9`: the order of the `/terminos` and `/articulos-prohibidos` links.
- `submissions.integration.cjs`.

**Size.** High.

## UX-6 Accounts

**Goal.** Particular and Store Owner each get a coherent workspace, and onboarding (sign-up, store application, invitations, passwords) reads as one product.

**Scope and current code**
- **Auth pages:** `/login`, `/registro/vendedor`, `/registro/tienda` and their `/invitacion` pages, `/registrar-tienda` (the gate N10 kept), `/recuperar-contrasena`, `/restablecer-contrasena`, `/confirmacion-correo`.
- **Account pages:** all 14 `/mi-cuenta/*` pages inside the UX-2 frame (rail and phone switcher).
- **Components:**
  - auth and onboarding forms: `login-form`, `seller-signup-form`, `store-owner-signup-form`, `store-registration-form`, the invitation forms;
  - account areas: `listing-management-table`, `saved-search-alerts`, `notifications-list`, `transaction-center`, `transaction-detail`, `account-analytics`, `profile-edit-form`, `password-form`.
- **Concepts:** Cuenta-1440/390.

**Carried in**
- **Five `window.confirm`** calls (`transaction-detail.tsx:68, 87, 213`, `listing-management-table.tsx:46`, `saved-search-alerts.tsx:19`). Replace them with in-page confirmations that keep the same semantics and copy rules; `sprint-6` pins the review-final wording.
- **The eight-column listing table** scrolls sideways on phones (`listing-management-table.tsx:87–99`) and needs a responsive list. `analytics-browser-smoke` and `account-analytics.test` assume a `<table>`.
- **Store names as uppercase eyebrows** (`inventario/page.tsx:44`, `estadisticas/page.tsx:21`; D6).
- **The database string "artículo"** in the purchase-confirmation notification (`notifications-list.tsx:74` renders it): a migration, owner approval.
- **G3:** password minimum 6 at sign-up, 8 when resetting.
- **Email notices in context** (alerts, favourites, the sale-confirmation flow).
- **The "Compras y ventas" label** (UX-1 glossary) while functional-spec Sprint 7 and TX-018 say "Compras": a wording reconciliation for the owner, like N12.
- Home visual audit items 3, 4, 7 (Favoritos and inventory grids use the card).

**Questions for the brief**
- Resumen as a to-do list: what it lists.
- Statistics scope (no fake metrics).
- SDASH-002/003, editing business fields and media (Not Run): is a UI needed?
- 6a/6b split (recommended: 6a onboarding + Particular, 6b Store).
- G3.
- The "artículo" migration.

**Product rules it must not change**
- Auth and invitation flows.
- Store application (RUC, address, contact; duplicate-RUC message; retry).
- Favourites, alerts (pause/resume/delete; the daily digest), price-drop alerts, notifications.
- Transactions: `create_transaction_claim`, `respond_transaction_claim`, `cancel_transaction_claim`, `record_external_sale`.
- Reviews: double-blind with a 10-day window (`submit_transaction_review`, `review_is_visible`).
- Seller analytics: real counts only.

**Acceptance rows to re-run:** AUTH (many Not Run), STORE-001–019, DASH-001–008, SDASH-001–010, SANA-001–010, FAV-001–010, ALERT-*, PDA-001–009, NOTIF-001–003, TX-001–018, REVW-001–020.

**Tests that pin today's markup:**
- `sprint-6`: "Sí, lo compré", "No, no fui yo", "Atribuir venta", the review-final copy.
- `sprint-7`.
- `sprint-9`: account IA; `noindex` on private and auth pages.
- `ux-copy`: the status dictionary.
- `account-shell`.
- `analytics-browser-smoke`: table cells, `nav[aria-label="Periodo de estadísticas"]`.
- `favorites-browser-smoke`: login labels.
- `alerts.integration.cjs`: "Marca: Fender", "Menú de cuenta móvil".

**Size.** High; split recommended.

## UX-7 Admin workbench

**Goal.** Moderators work through the queues quickly and safely.

**Scope and current code**
- **Routes:** `app/admin/*`, the layout, the workbench page, `[section]` and the audit page.
- **Components:** `admin-workbench.tsx` (723), `admin-domain-view.tsx` (553), `admin-record-editors.tsx` (561), `admin-invite-user.tsx`.
- **The frame stays as UX-2 built it:** sidebar, phone "Menú", "Explorar categorías", own `<main>`, 404/500 inside the frame.
- **Concept (Admin-1440):** a master-detail queue, a review checklist, a decision bar.

**Carried in**
- **Photos:** queue cards show photos only as links (`admin-workbench.tsx:559–566`); revisions do show thumbnails.
- **Raw UUIDs and slugs** (`admin-workbench.tsx:332, 516, 540`; `admin-domain-view.tsx:239, 246–247, 373, 381`; the audit page `:90, 104`).
- **One style for approve and reject** (`admin-workbench.tsx:335`).
- **Verify and revoke in one click** (`admin-domain-view.tsx:175`; `admin-workbench.tsx:414–418`).
- **Audit times in the server timezone** (audit page `:10–13`; `adminDate` is already fixed).
- **Hand-rolled radios** for legacy linking, pinned by `sprint-8`.
- **UX-2 deviation 9:** only "Moderación" carries a count.
- Home visual audit item 6.

**Questions for the brief**
- The queue layout.
- The confirmation policy: which actions confirm, and how.
- F7 bulk actions (authority and audit implications: a flag).
- America/Lima display everywhere.
- Per-section counts.
- Whether UX-7 moves earlier (moderation volume).

**Product rules it must not change**
- **Access:** `requireAdmin` / `is_admin` on every route and inside privileged functions.
- **Moderation actions:** `review_listing`, `review_listing_revision` (`p_expected_version`), `review_store_application`, `set_store_verification`, `moderate_report`, `moderate_review`, `link_legacy_listing_owner` (explicit, one-time).
- **Records:** the record editors' allowlist; the invite flow.
- **Queues:** every queue always shown, with truthful zero states (spec Sprint 8 clarification).

**Acceptance rows to re-run:** ADMIN-001–030, REP-001–014, VERIFY-001–013.

**Tests that pin today's markup:**
- `sprint-8`: 23 tests and about 170 source assertions (href templates, `p_page_size`, the mark-sold confirmation text, the radios).
- `listing-lifecycle`: ">Actual<", ">Propuesto<", "Fotos propuestas", "Ver auditoría".
- `sprint-6`: review moderation.
- `logout-navigation`: the timezone fixture.
- `sprint-9-gate`: the Admin cards.
- `seo-smoke`: Admin record pages.

**Size.** Medium-high.

## UX-8 Coherence and hardening

**Goal.** Nothing inconsistent, inaccessible or slow is left, and the branch is ready for the owner's merge decision.

**Scope**
- **A product-wide sweep** (home visual audit, "all"): type scale, spacing, button sizes, card rules, logo sizes, text-wrap. Then a final microcopy pass, and G2 (legal-page wording, with a legal read).
- **Accessibility:** keyboard, 200–400% zoom, real screen readers (VoiceOver, TalkBack, NVDA).
- **Real browsers and devices** (N14): Safari/WebKit and Firefox, real iPhone and Android with touch, on a preview deployment. Pushing a preview needs the owner's go-ahead.
- **Performance:** Core Web Vitals on the key templates on that deployment; first-load JS budgets.
- **Tooling:** refresh the harness baseline (`screenshots/`); keep `scripts/ux-*.cjs` working or retire them deliberately.
- **External review:** UX-1's is still pending (`review-guide.md` § 1); review later sub-sprints as the owner wishes.
- **The V1 record:** collect every row and spec line the redesign touched (N12 and the per-sub-sprint lists above) into one reconciliation for the owner.
- **Merge preparation:** one rebase on `main` (N13), the full suite, a final audit, the docs; the merge and the production release gate stay the owner's.

**Size.** Medium.

## Repo setup (Sprint 9 closed, 30-09)

Sprint 9 is closed (owner, 30-09). Its final head is `main` at `49a38e5`, also on GitHub; the sprint docs in the repo don't record the closure yet (SEO-006, SEO-007, LEGAL-005 and LEGAL-006 still Not Run).

- `ux/redesign` branches from `49a38e5` and lives in the worktree `../mkt_instrumentos-ux`. The main checkout (`../mkt_instrumentos`) and the catalog worktree (`../mkt_instrumentos-catalog`, `catalog/canonical-catalog`) are never touched. JEV is out of scope.
- So far every sub-sprint is committed on `ux/redesign` itself. It is rebased on `main` once, at merge time (N13, 7 Oct; `origin/main` was one docs-only commit ahead with no overlapping files).
- Nothing is pushed, merged or deployed without the owner's go-ahead; production deploys keep their own release gate.

## Product-behavior flags (owner decisions, never silent)

Logged in `decisions.md` with their IDs; candidates get an ID when a brief asks them.

| Flag | Where it surfaces | Note |
| --- | --- | --- |
| F1 Relist slug growth (`-republicado-<hash>` per relist) | UX-4/UX-5 | URL/SEO behavior |
| F2 Condition scale (3 grades) vs a gear-specific scale with definitions | UX-4/UX-5, later canonical DB | Data model change |
| F3 Public "Visto N veces" | UX-4 | Hide below a threshold or show only to the owner |
| F4 "Nuevo" condition limited to stores | UX-5 | Product rule |
| F5 Safety step before the first WhatsApp contact | UX-4 | Adds a step to seller-contact semantics |
| F6 Draft autosave in the sell flow | UX-5 | New behavior |
| F7 Admin bulk actions | UX-7 | Authority/audit implications |
| "Load more" vs numbered pages | UX-3 | Decided 8 Oct (Q9 A): numbered pages, crawlable `?page=N` |
| F9 Free-text search (brand, model, title) | later | Query change: catalog filters, search alerts, SEO. Decided 8 Oct (Q13 A): left for later |
| F10 Counts: facet counts, a live "Ver N resultados", the home's total and per-category counts | UX-3b | Decided 8 Oct (Q10 B): only the home's total and per-category counts |
| F11 Multi-choice facets | UX-3a | Decided 8 Oct (Q8 B, Q19, Q20): condition and location take several values in the catalog; seller type single; alerts unchanged and hidden on multi-value searches; no migration |
| F12 Store stats on the home's store tiles (listing count, confirmed sales) | UX-4 | Decided 8 Oct (Q18 A): not on the home; revisit with UX-4's store page |
| Candidate: in-store search and chips on store pages | UX-4 | A store-scoped catalog query |
| Candidate: an owner's view of their own listing | UX-4 | New view of existing data |
| Candidate: database strings "artículo" / "producto" | UX-5/UX-6 | Migration (UX-1 open item) |
| G3 Password minimum (6 vs 8) | UX-6 | Product rule |
