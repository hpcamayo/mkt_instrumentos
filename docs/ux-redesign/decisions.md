# Decision log

Newest first. Status: pending (owner question open), decided (owner answered), superseded.
Record who decided and when. A decided item changes only through a new entry.

## UX-5 brief: provisional answers and build choices (cloud session, 10 Oct; for the UX-5 review)

Brief `ux-5-selling.md`. Under N17 every question S1–S11 takes its recommendation (S1–S11 A) as a provisional answer; every product flag takes no change: F6 (draft autosave) not built, F4 ("Nuevo" only for stores) not built, F2 (condition scale) unchanged, F1 (relist) not touched, the "producto" database string not migrated.

| ID | Choice | Why | Status |
| --- | --- | --- | --- |
| U9 | Spanish attribute labels: Cuerpo sólido, Semihueca, Hueca, Distorsión, Compresor, Afinador, Multiefectos, Gabinete, De cinta, Corbatero, Cañón. Kept: Single coil, Humbucker, P90, Overdrive, Fuzz, Delay, Reverb, Chorus, Wah, True bypass, Phantom power, Shell pack, Dark and the shape names | S9 A; the design system welcomes musician vocabulary ("cuerpo sólido"), and the kept names are what Peruvian musicians search. Values and URLs unchanged; the labels change wherever they show (filters, chips, cards, spec table) | provisional (Claude Code) |
| U10 | The edit page gets the condition cards and Spanish labels only; per-field errors and the error summary on edit wait for UX-8 | The edit form's save flow and photo editor are pinned by `photo-editor.test.cjs` (a hook-level harness); reworking its validation overnight risks the edit rules | pending (owner: keep for UX-8 or drop) |
| U11 | Type chips appear once a category with more than one type is chosen; a single-type category selects its type silently, as today | No one-chip question to answer | provisional (Claude Code) |
| U12 | The description's label is visually hidden under the "Descripción" section heading; the hint carries a live count "N de 40 caracteres mínimos" | One visible name per field; the count answers "why won't it send" before the summary does | provisional (Claude Code) |
| U13 | After sending, the confirmation offers "Ver mis publicaciones" / "Ver inventario", "Publicar otro instrumento" and "Volver al resumen" | S6 A; the old links kept, plus a way to start again | provisional (Claude Code) |

## Raised during the UX-4 build (cloud session, 10 Oct; provisional, for the 4a/4b reviews)

Built on L1–L21 as answered (N17). Where the brief left a detail open or a rule forced a change, Claude Code chose; each choice is reversible at the review.

| ID | Choice | Why | Status |
| --- | --- | --- | --- |
| U1 | The listing's trust statement reads "Coordinas el pago y la entrega directamente con quien vende. Laria no procesa pagos, no retiene dinero, no gestiona envíos ni garantiza el equipo o la transacción." + "Consejos de seguridad" | The brief worded the store and bar lines only; this keeps the full LEGAL-005/006 content of the old notice (L5 A) | provisional (Claude Code) |
| U2 | The verified-store line says "…No es una garantía sobre su equipo ni sus ventas." (brief: "sus productos") | The glossary rejects "producto" (`ux-copy.test.cjs`) | provisional (Claude Code) |
| U3 | Phone bar: WhatsApp on the left, the 44 px favourite on the right (brief: favourite first) | DOM order = visual order = Tab order (WhatsApp right after the identity block) | provisional (Claude Code) |
| U4 | Phones: "Reportar publicación" follows the seller card, before the reviews (brief: after the reviews) | Keeps Tab order equal to the visual order without duplicating the control | provisional (Claude Code) |
| U5 | "Publicado hoy" on the publication day (was "Publicado hace 0 días"); the date line is composed on the server | Reads naturally; a server string cannot mismatch on hydration (the #418 lesson) | provisional (Claude Code) |
| U6 | Store grid photos stay lazy (no eager first row) | `analytics-browser-smoke` reads the first store card's lazy image; the header is the store page's LCP | provisional (Claude Code) |
| U7 | When the store's reputation call fails, the "Reseñas" section link, the reviews and the rating figure are all left out | The brief's failure rule, applied to the section links too | provisional (Claude Code) |
| U8 | Spec strip and table values keep the card's units ("6 cuerdas", "22\"") | One label per value across card, strip and table | provisional (Claude Code) |

## UX-4 brief: provisional answers (owner, 2026-10-09)

The brief `ux-4-listing-store.md` asks L1–L21 on its review page https://claude.ai/artifact/T2pej3FqaGD3Nimwi5VGcY (answers in the page's db collection `answers`, one document per question). Options and context are in the brief. **Provisional:** before travelling on the evening of 9 Oct the owner answered in the session "Yes, all recommendations", so every question takes its recommendation (L11 B, all others A). They were built while the owner was away and are confirmed or reversed at the 4a and 4b reviews (N17). The same answers were written to the review page's `answers` collection, each with a note saying so.

| ID | Question | Recommendation | Status |
| --- | --- | --- | --- |
| L1 | Split and release: 4a (listing, with #418) then 4b (store), one release after 4b | A | provisional 2026-10-09 (owner: all recommendations) |
| L2 | Listing layout: two columns as in the concept | A | provisional 2026-10-09 (owner: all recommendations) |
| L3 | Gallery: thumbnails with "+N", swipe on phones, a lightbox | A | provisional 2026-10-09 (owner: all recommendations) |
| L4 | Contact on phones: one module that becomes a bar at the bottom below 1024 px | A | provisional 2026-10-09 (owner: all recommendations) |
| L5 | The one trust statement: the full limitation per surface | A | provisional 2026-10-09 (owner: all recommendations) |
| L6 | F3: hide the public view counter (views still counted) | A | provisional 2026-10-09 (owner: all recommendations) |
| L7 | F5: no safety step before WhatsApp | A | provisional 2026-10-09 (owner: all recommendations) |
| L8 | "Compartir": not added ("Guardar" only) | A | provisional 2026-10-09 (owner: all recommendations) |
| L9 | Spec strip (type attributes) and a table without repeated fields | A | provisional 2026-10-09 (owner: all recommendations) |
| L10 | Seller card with real figures; no second WhatsApp button | A | provisional 2026-10-09 (owner: all recommendations) |
| L11 | Reviewer's name: first name and initial | B | provisional 2026-10-09 (owner: all recommendations) |
| L12 | Related listings: two sections, four cards, left out when empty | A | provisional 2026-10-09 (owner: all recommendations) |
| L13 | Current strip item on listing and verified store pages | A | provisional 2026-10-09 (owner: all recommendations) |
| L14 | Owner's view of their own listing: not now | A | provisional 2026-10-09 (owner: all recommendations) |
| L15 | Load the report form (and the Supabase client) only when pressed | A | provisional 2026-10-09 (owner: all recommendations) |
| L16 | Store: section links; no in-store search, chips or sort | A | provisional 2026-10-09 (owner: all recommendations) |
| L17 | Store: compact header; banner strip only when uploaded | A | provisional 2026-10-09 (owner: all recommendations) |
| L18 | "Sobre la tienda" without street address or contact person | A | provisional 2026-10-09 (owner: all recommendations) |
| L19 | Store breadcrumb by store type, none on phones | A | provisional 2026-10-09 (owner: all recommendations) |
| L20 | F12: no public confirmed-sales count (it needs a migration) | A | provisional 2026-10-09 (owner: all recommendations) |
| L21 | F1 to UX-5, F2 after V1 | A | provisional 2026-10-09 (owner: all recommendations) |

## Release cadence (owner, 2026-10-09)

UX-1 to UX-3 reached production together on 9 Oct (`50963fb`, deployment `dpl_57FCmnsw4EyQxCB4XwKkeZniKMfx`; `docs/ux-production-release-gate.md`, `reviews/ux-release-audit.md`).

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| N15 | When the redesign reaches production. N13 kept one rebase and one merge for the end of UX-8 | Each sub-sprint is audited and released once the owner accepts it: Codex's blind audit of that sub-sprint's diff, the owner's push (a fast-forward of `main`), a read-only production smoke and a release record. `ux/redesign` is fast-forwarded to `origin/main` before each sub-sprint starts (done 9 Oct to `568b07a`). Supersedes N13's "rebase once, at merge time" from UX-4 on; the commit IDs in the UX-1 to UX-3 docs stay mapped in `commit-ids.md` | decided 2026-10-09 by owner |
| N17 | Work while the owner travels (night of 9 to 10 Oct, no internet) | The session moves to a Claude Code cloud session and keeps working: UX-4 built on the recommendations (L1–L21 provisional), then UX-5 onward briefed and built on Claude Code's own recommendations, each sub-sprint in its own commits, every answer marked provisional for the owner's review. `ux/redesign` is pushed to GitHub as a backup (owner's go-ahead for a possible Vercel preview, the N14 condition); `main` and production are never touched (production stays at UX-3). No migrations, schema, RLS, auth, moderation or product-rule changes; flags take their no-change options. Evidence that needs the local Supabase stack (browser captures, audits, row re-runs) is prepared and run on the owner's Mac afterwards if the cloud has no database | decided 2026-10-09 by owner (session answers) |
| N16 | How a release proves write flows. A read-only production smoke cannot exercise publishing, account changes or moderation, which UX-5 to UX-7 redesign | A: a scripted production smoke with a dedicated test account, cleaned up afterwards · B: local evidence only, as for UX-1 to UX-3 | pending (owner; needed before UX-5 ships) |

## UX-3b accepted (owner, 2026-10-09)

The owner accepted UX-3b (the home) through its review page (https://claude.ai/artifact/EYTr4nHqS4u1GHLZeoaAM1): 37 of 37 checks Correct (`ux-3b-acceptance.md` § Owner acceptance (9 Oct)). P6–P10 below are decided as built. N12's refreshed texts (group G) were all marked Correct, option A for PUB-008, PUB-010 and PUB-015; on the owner's request the same day they were recorded with status Pass (N12 below).

## Raised during the UX-3b build (9 Oct)

Choices the brief did not settle for the home, built as below and asked on the 3b review page (https://claude.ai/artifact/EYTr4nHqS4u1GHLZeoaAM1, checks F01–F05; `ux-3b-acceptance.md` § Deviations and choices).

| ID | Question | As built | Status |
| --- | --- | --- | --- |
| P6 | The brief puts the vitrina's five tiles in one row from 768 px and the stores' four tiles likewise; at 768 px a vitrina tile is 128 px wide and its category, title and city truncate to almost nothing | The vitrina and the stores scroll sideways inside their sections below 1024 px (160 px vitrina tiles on phones, 192 px on tablets; 256 px store tiles); five and four columns from 1024 px | decided 2026-10-09 by owner: as built (review page F01 Correct) |
| P7 | The showcase tile's layout: "a bordered 8 px box with the photo and the caption inside, 12 px padding", and one seller line | The photo fills the top of the box edge to edge, as in the concept, and the caption has the 12 px padding; below 1280 px the city takes its own line above "Tienda verificada ✓" (the words and the mark alone fill a 160–203 px tile, so one line cut the city to a letter) | decided 2026-10-09 by owner: as built (review page F02 Correct) |
| P8 | Fallbacks the brief does not spell out | When the vitrina holds every listing, "Recién publicados" is left out (its empty state is for a marketplace with nothing published); when the counts fail, the links read "Ver todo el catálogo" and the tiles show no count; one listing reads "1 publicación" and "Ver la publicación" | decided 2026-10-09 by owner: as built (review page F03 Correct) |
| P9 | Where the banner files live, and the phone lead's colour | The 54 image files moved from `art/rotation/` to `public/banners/` (a git rename, not a copy; the manifest, rules, rotation sheet and generators stay in `art/rotation/`). The phone lead uses `line-deco` (#C8CDD6) as on desktop, not the manifest's #D5D9E2, which is not a token | decided 2026-10-09 by owner: as built (review page F04 Correct) |
| P10 | The home's first-load JS in the build table rose from 114 to 127 kB, while a cold load of the home downloads 3.6 kB more JavaScript than before | Accepted as is: the page now imports the card's modules (tailwind-merge through `Price` and `VerifiedMark`, the type labels for the spec line), which the layout already loaded, so the table counts them twice. A lighter card (its static parts rendered on the server, the favourite and the impression as small client parts) would lower every grid page; proposed for UX-8, not done here | decided 2026-10-09 by owner: as built (review page F05 Correct) |

## UX-3a accepted (owner, 2026-10-09)

The owner accepted UX-3a through its review page (https://claude.ai/artifact/NpxKr4FfUSLH65RZooTwdB): 31 of 31 checks Correct, no notes (`ux-3a-acceptance.md` § Owner acceptance (9 Oct)). P1–P4 below are decided as built. 3b (the home) may start.

| ID | Question | Status |
| --- | --- | --- |
| P5 | The seed-id fix for events, contacts and views (`4057065`): production has the same seed ids, so ship it sooner as a hotfix from `main`, or with the redesign | decided 2026-10-09 by owner: ship it with the UX-3 push; no separate hotfix |

## Raised during the UX-3a build (8 Oct)

Choices the brief did not settle, built as below and asked on the 3a review page (`ux-3a-acceptance.md` § Deviations and choices).

| ID | Question | As built | Status |
| --- | --- | --- | --- |
| P1 | The one card reaches the store inventory and the listing recommendations now (and the shared pagination the store page) | They show the new card in their existing grids until UX-4; the alternative is the catalog's four-column grid on the store page now | decided 2026-10-09 by owner: as built (review page I01 Correct) |
| P2 | Q19's "one value per filter" and multiselect attributes (pickups, microphone use), which had several values before 3a and which saved alerts accept | The alert is hidden only for several conditions or locations (F11) | decided 2026-10-09 by owner: as built (review page I02 Correct) |
| P3 | `Skeleton` without a consumer; `/api/listings/[id]/photos` without a caller | Both kept (Skeleton for UX-4's streamed sections; an API removal is not a visual task) | decided 2026-10-09 by owner: as built (review page I03 Correct) |
| P4 | Small calls: "Todos/Todas" radio rows, chips that clear when pressed again, a reversed price range read as meant, the verified mark after the words on the card, no in-page pending state for shell links, no prefetch of catalog links | As listed | decided 2026-10-09 by owner: as built (review page I04 Correct) |

## Decided — UX-3 brief (owner, 2026-10-08)

The UX-3 brief `ux-3-discovery.md` was **approved by the owner on 8 Oct**.
- **How it was answered:** all 18 questions on the review page https://claude.ai/artifact/7DCnPzHDMrXRSfBx7mueG4 (answers in its db collection `answers`, no notes), then Q19 and Q20 in the session.
- **The result:** every recommendation except Q8, where the owner chose multi-choice facets. Q19 and Q20 shape that choice.
- **What changed in the brief:** the decisions are in its § Owner answers (8 Oct), and § Filters is amended for F11.
- **Next:** 3a is built first (Q2), starting with the stall fix (Q1).

| ID | Question | Options offered | Recommendation | Status |
| --- | --- | --- | --- | --- |
| Q1 | How to fix the catalog transition stall: Next.js 15.5's aliased-prefetch navigation, first seen in UX-1's `444ac25`; brief § The catalog transition stall | A remove `app/listados/loading.tsx`, a pending state in the page instead, catalog links back to client links · B an in-page `<Suspense>` keyed by the query · C prefetch before every catalog navigation · D upgrade Next.js | A | decided 2026-10-08 by owner: A |
| Q2 | Split UX-3 | A 3a (card, catalog, filters, landings, states, the fix) then 3b (home), each with its own acceptance · B one pass | A | decided 2026-10-08 by owner: A |
| Q3 | Card fields | A condition + up to two key attributes per type + city · seller type · B condition + city · seller type · C A plus brand/model | A | decided 2026-10-08 by owner: A |
| Q4 | Card photo aspect ratio | A 1:1 cover · B 4:3 cover (today) · C 1:1 contain on white | A | decided 2026-10-08 by owner: A |
| Q5 | Photo browsing on cards | A first photo and "N fotos", no arrows or dots · B keep arrows and dots, enlarged | A | decided 2026-10-08 by owner: A |
| Q6 | Grid or list | A grid only · B grid with a list toggle | A | decided 2026-10-08 by owner: A |
| Q7 | Live filters or an apply button | A desktop live (options are links), the phone sheet applies once · B apply everywhere · C live everywhere | A | decided 2026-10-08 by owner: A |
| Q8 | Single- or multi-choice facets (flag F11) | A single choice (today's query and alerts) · B multi-choice for condition, location, seller | A | **decided 2026-10-08 by owner: B**, shaped by Q19 and Q20 |
| Q9 | Pagination | A numbered pages · B "Ver más" · C both; crawlable `?page=N` either way | A | decided 2026-10-08 by owner: A |
| Q10 | Counts (flag F10) | A none · B home only (total + per category) · C B plus facet counts and a live "Ver N resultados" | B | decided 2026-10-08 by owner: B |
| Q11 | Alert entry | A title-row button when a filter or category is set + end-of-results tile + no-results · B end tile and no-results only · C a panel above the results (today) | A | decided 2026-10-08 by owner: A (hidden on multi-value searches, Q19) |
| Q12 | `photo_count` on the home for H2 | A read `listing_photo_count` · B drop the 3-photo condition · C any listing with a photo | A | decided 2026-10-08 by owner: A |
| Q13 | F9 free-text search | A leave for later · B decide now (its own change after UX-3) | A | decided 2026-10-08 by owner: A (left for later) |
| Q14 | Categories in the phone home header | A "Categorías" in the phone bar, no strip on the home · B keep the strip on the phone home | A | decided 2026-10-08 by owner: A |
| Q15 | Home visual audit item 4: "Recién publicados" density | A as decided (four cards + end tile) · B six per row | B | decided 2026-10-08 by owner: B |
| Q16 | Home visual audit item 13: the phone banner | A frame black block + 40 px CSS fade · B each piece's own ground colour · C frame black, hard edge | A | decided 2026-10-08 by owner: A |
| Q17 | Design-system confirmations (home visual audit) | `t-card-title` 600; buttons 36/44/52 only; gutters 20/12, radius 8; section spacing 32→48 / 24→32; white monograms | Confirm all | decided 2026-10-08 by owner: all five confirmed |
| Q18 | Store tile stats on the home (flag F12) | A name, place, "Tienda verificada" · B + "N publicaciones" · C + "N ventas confirmadas" | A (revisit with UX-4) | decided 2026-10-08 by owner: A |
| Q19 | Q8 = B, but saved alerts accept one value per filter, enforced in the database (`normalize_saved_search`, `listing_matches_saved_search`, Sprint 7 migration) | Hide the alert entry on searches with several values in one filter (no migration) · migrate alerts to accept several values (production database deploy) · back to single choice | Hide it | decided 2026-10-08 by owner: hide the alert entry there, with "Para crear una alerta, elige un solo valor en cada filtro."; no migration |
| Q20 | Seller type's options overlap (a verified store is also a store) | Seller type stays single choice · seller multi-choice too (likely needs a database view or column) | Single choice | decided 2026-10-08 by owner: single choice; condition and location are the multi-choice facets |

Product-behavior flags from the brief:

| ID | Question | Status |
| --- | --- | --- |
| F10 | New read-only count queries: facet counts, a live "Ver N resultados" in the phone sheet, the home's total and per-category counts | decided 2026-10-08 by owner (Q10 B): only the home's total and per-category counts; no facet counts, no live sheet count |
| F11 | Multi-choice facets | decided 2026-10-08 by owner (Q8 B, Q19, Q20): condition and location accept several values in the catalog (repeated parameters, `in` filters; one-value URLs unchanged). Seller type stays single. Saved alerts and their database functions are unchanged, and the alert entry is hidden on multi-value searches. No migration. A later change could teach alerts several values (a migration and a production deploy) |
| F12 | Store stats on the home's store tiles | decided 2026-10-08 by owner (Q18 A): not shown; revisit with UX-4's store page |

## Pending — product-behavior flags (not needed for UX-1)

| ID | Question | Surfaces in |
| --- | --- | --- |
| F1 | Relist slug growth (`-republicado-<hash>` per relist) | UX-4/UX-5 |
| F2 | Condition scale: keep 3 grades or add a gear-specific scale with definitions | UX-4/UX-5 |
| F3 | Public "Visto N veces" | UX-4 |
| F4 | "Nuevo" condition limited to stores | UX-5 |
| F5 | Safety step before the first WhatsApp contact | UX-4 |
| F6 | Draft autosave in the sell flow | UX-5 |
| F7 | Admin bulk actions | UX-7 |
| F8 | Admin-picked home vitrina (only if H2 = Admin) | closed 2026-09-30: H2 = A (automatic), nothing to build |

## Raised during UX-1 implementation (30 Sep)

| ID | Question | Proposal | Status |
| --- | --- | --- | --- |
| G1 | Name of the catalog page `/listados`: header, footer, breadcrumb and SEO title still say "Listados" | The glossary retires "listado". Proposal: "Instrumentos", which matches the page title "Instrumentos disponibles" and the `/instrumentos/…` URLs. It also changes the SEO title and the breadcrumb structured data, so it moves with the UX-2 navigation work | decided 2026-09-30 by owner: "Instrumentos" in the header, footer, breadcrumbs and SEO title; the `/listados` URL stays (applied in UX-2) |
| G2 | Legal pages (Términos, Privacidad, Artículos prohibidos, Consejos de seguridad) keep "anuncios" and the defined term "Tienda Verificada" | Align them with the glossary only after a legal read; UX-1 fixed nothing there | pending (owner or legal) |
| G3 | Password minimum is 6 characters at sign-up and 8 when resetting or changing it | Product rule, so not changed in UX-1. One number everywhere; 8 recommended | pending (owner) |

## Decided — UX-2 shell and navigation (owner, 2026-09-30)

UX-1 was accepted by the owner on 30 Sep (`ux-1-acceptance.md`). The UX-2 brief (`ux-2-shell.md`) was approved the same day with these decisions; the UX-2 items of `home-visual-audit.md` (1, 1b, 5, 10, 14, 17) were approved with it.

| ID | Decision | Status |
| --- | --- | --- |
| N1 | Header "Vender" is the `onDark` outline button (white text, 1 px #4B5563 border, 36 px). Yellow stays for each page's own action (audit item 5) | decided 2026-09-30 by owner |
| N2 | Remove the stray hairline (the first `<path>`, a 1-unit stroked line at the artboard's left edge) from `app/logo-clear.svg`; the mark does not change. Check `app/icon.svg` and `app/apple-icon.png` for the same line (audit item 1b) | decided 2026-09-30 by owner |
| N3 | Nothing sticky: the header scrolls with the page on every device | decided 2026-09-30 by owner |
| N4 | Phone: compact header, no bottom bar (as in the concepts) | decided 2026-09-30 by owner |
| N5 | Footer: full on the home; slim on every other public and account page; none in Admin | decided 2026-09-30 by owner |
| G1 | The catalog page is called "Instrumentos" (header, footer, breadcrumbs, SEO title); `/listados` stays; the copy test's "Listados" exception goes | decided 2026-09-30 by owner |
| N6 | Header data for the bell, the account menu and the avatar: the header's state endpoint (`/api/account-navigation`) also reads the user's name, the existing `is_admin` check and the two counts the account rail already reads (unread notifications, pending buyer confirmations). Same RLS client; no schema or rule change | decided 2026-09-30 by owner (asked during UX-2 implementation) |
| N7 | "Tiendas verificadas" in the category strip and the footer: no stores directory exists, so it opens the catalog filtered to verified stores (`/listados?seller_type=verified_store`, the existing filter). A stores page would be new (UX-3/UX-4) | decided 2026-09-30 by owner (asked during UX-2 implementation) |
| N8 | Search placeholder. The header search matches the brand only (`brand ILIKE '%text%'`), so audit item 17's "Marca, modelo o instrumento" would promise model and instrument search that returns nothing. One honest placeholder instead, "Busca por marca: Yamaha, Fender…", in the header now and the home banner in UX-3; brand-only search stays as it is | decided 2026-09-30 by owner (asked during UX-2 implementation); supersedes the placeholder text of audit item 17 |

## UX-2 accepted (owner, 2026-10-08)

The owner accepted UX-2 (shell and navigation) as amended on 3 Oct and answered on 7 Oct, through the review page (22 of 22 checks Correct, no notes; `ux-2-acceptance.md` § Owner acceptance (8 Oct)). With it the owner confirmed:
- the frameless 500 page shown when the Admin layout itself fails (check A10);
- the N12 drafts in `ux-2-reconciliation.md` as fine to record (B01–B06); recording them in the canonical files stays the owner's step;
- the Safari + VoiceOver pass on the Mac (N14, C1–C4).

UX-3 may now start with its brief (approval gate first).

## Raised at the UX-2 acceptance gate (1 Oct; N12 updated 3 Oct; answered 7 Oct)

Deviations from the approved brief, explained in `ux-2-acceptance.md` § Deviations. On 7 Oct the owner took Claude Code's recommendation on each open question ("go with your recommendations"); the options offered are in `ux-2-acceptance.md` § Owner answers (7 Oct).

| ID | Question | As built | Status |
| --- | --- | --- | --- |
| N9 | Header "Vender" border: N1 names #4B5563, which is 2.6:1 on the frame black, below the design system's 3:1 rule for control boundaries | The `onDark` variant's border (white at 40%, about 3.7:1) | decided 2026-10-07 by owner: keep the `onDark` border (white at 40%); supersedes N1's border colour, the rest of N1 stands |
| N10 | Footer "Registrar mi tienda": the brief names `/registro/tienda` | `/registrar-tienda`, the existing gate (signed out: create a store account or sign in; signed-in Particular: told a store needs its own account; store owner: their store) | decided 2026-10-07 by owner: keep `/registrar-tienda` |
| N11 | Phone breadcrumbs: the brief's rule (only a back link to the parent) also applies to the catalog and the category landings, where the Catalogo-390 concept shows none | Back link on the catalog ("‹ Inicio"), the category landings ("‹ Instrumentos") and listings | decided 2026-10-07 by owner: the back link only on listing pages; the catalog and the category landings show no breadcrumb on phones (the strip, on every page since N12, starts with "Instrumentos" and the logo leads home). Built 7 Oct (`Breadcrumbs` `phoneBackLink`) |
| N12 | The shell that UX-2 replaced (mega-menu, categories and search on account and Admin pages) is still what the canonical V1 record describes: functional-spec "Sprint 5 owner navigation clarification" and "Sprint 6 implementation clarification", rows PUB-008 and PUB-010 to PUB-015, and the legal pages "linked from the global footer" | **Preference decided 3 Oct by the owner:** restore the mega-menu's category and type access inside the UX-2 design. Built as the hybrid in `ux-2-shell.md` § Amendment: strip categories open "Ver todos" + canonical types, "Instrumentos" and "Tiendas verificadas" stay links, a compact panel on phones, the strip on account pages, "Explorar categorías" in the Admin navigation | **Preference: decided** (owner, 3 Oct). **Build side: decided 2026-10-07 by owner:** the build stays as it is (no search in Admin; on phones no search on account, legal or sign-in pages; the phone form is the compact panel, not an accordion); the canonical record is reworded instead. **Record side: decided 2026-10-07 by owner:** Claude Code drafts the wording and re-runs the rows on this build (`ux-2-reconciliation.md`); the owner records status and wording in `docs/functional-spec.md` and `acceptance/cases.tsv`. **Drafts approved by the owner on 8 Oct (review page B01–B06); refreshed 9 Oct for the shell after 3b and approved again on the 3b review page (https://claude.ai/artifact/EYTr4nHqS4u1GHLZeoaAM1, G01–G10 Correct; option A for PUB-008, PUB-010 and PUB-015). Recorded 2026-10-09 at the owner's request (status Pass, the owner's word):** the clarification paragraph and the legal-pages line in `docs/functional-spec.md`; the evidence for PUB-008–PUB-015 in `acceptance/cases.tsv` (option A, rows' words unchanged) |
| N13 | When to rebase `ux/redesign` on `main` (the roadmap asks before each acceptance package; UX-2 was not rebased; `origin/main` is one docs-only commit ahead, no overlapping files) | Not rebased | decided 2026-10-07 by owner: rebase once, at merge time, so the commit IDs quoted in the acceptance docs stay valid until then; **rebased 2026-10-09 onto `origin/main` `313fb7e` before the production push** (`commit-ids.md` maps the IDs). Superseded from UX-4 on by N15 (a release per sub-sprint) |
| N14 | Checks only a person can do (Safari/WebKit, a screen reader, real touch, a deployment) | Chromium only | decided 2026-10-07 by owner: the owner runs a short Safari + VoiceOver pass on the Mac against the local build (steps on the UX-2 review page); real iPhone/Android checks wait for a preview deployment (pushing needs the owner's go-ahead) or UX-8. **Mac pass done 8 Oct by the owner: all Correct** |

## Product-behavior flags raised in UX-2

| ID | Question | Surfaces in |
| --- | --- | --- |
| F9 | Free-text search over brand, model and title (raised by N8). Today the search matches the brand only; widening it is a query change touching the catalog filters, search alerts and SEO. Asked in the UX-3 brief as Q13: **decided 2026-10-08 by owner: left for later**; brand-only search and the N8 placeholder stay | later |

## Decided — UX-1 foundations (asked 2026-09-27)

UX-1 accepted by the owner on 30 Sep 2026. Owner, 30 Sep: "the foundations were also all approved except for the homepage, which we closed now with the banners." All twelve are approved as recommended in `ux-1-foundations.md`; the homepage exception is the H series below, now closed.

| ID | Question | Recommendation | Status |
| --- | --- | --- | --- |
| D1 | Typeface: A Archivo / B Barlow / C IBM Plex Sans | A Archivo | decided by owner: approved as recommended |
| D2 | Blue as text on light surfaces | No; blue as fill, mark and underline; text only on black | decided by owner: approved as recommended |
| D3 | Derived functional tones (#E3DC22 hover, #E6F0FF, #7D8694, #6B7280, #B42318, #FDECEA, #FBF8CC) | Yes, documented as non-brand | decided by owner: approved as recommended |
| D4 | Shape language | 4/6/8 px, flat cards, no pill badges | decided by owner: approved as recommended |
| D5 | Base size | 16 px body and inputs | decided by owner: approved as recommended |
| D6 | Uppercase | Micro labels of ≤3 words only | decided by owner: approved as recommended |
| D7 | WhatsApp CTA style | Laria yellow + WhatsApp glyph, "Contactar por WhatsApp" | decided by owner: approved as recommended |
| D8 | Glossary and status labels | As in `ux-1-foundations.md` | decided by owner: approved as recommended |
| D9 | Brand touchpoints | Favicon from wordmark; emails on palette; #F1EA16 canonical UI yellow | decided by owner: approved as recommended |
| D10 | Screenshot harness tooling | Existing agent-browser, no new dependency | decided by owner: approved as recommended |
| D11 | Credibility fixes inside UX-1 | Yes | decided by owner: approved as recommended |
| D12 | Dark mode | Out of scope | decided by owner: approved as recommended |

## Decided — homepage (asked 2026-09-27, all answered by 2026-09-30)

Owner feedback on the page concepts: every page accepted except the home, which does not say what Laria is at first glance. Four directions were on the "Inicio · opciones" page of the Laria Page Concepts canvas (renders in `screenshots/home-options/`); the rest of the home stays as in the concept.
All eleven questions are answered. The home with every decision applied is the canvas page "Inicio · versión final" (renders in `screenshots/home-final/`); the banner files are in `art/rotation/`.

| ID | Question | Recommendation | Status |
| --- | --- | --- | --- |
| H1 | First screen: A Buscador / B Vitrina / C Afiche / D Dos puertas | B Vitrina (C as the bold alternative) | decided 2026-09-27 by owner: develop B |
| H2 | How listings enter the vitrina — A automatic or B picked by Admin (new Admin control = product change under the V1 freeze, flag F8). Proposals on the canvas page "Inicio · decisiones" (30 Sep) | A: the newest approved listing of each category with 3 photos or more; each tile names its category; refreshes by itself | decided 2026-09-30 by owner: A (automatic); no Admin control, so F8 is closed |
| H3 | Price on the vitrina tiles: A yellow tag (exception to P5), B ink tag, C price in the caption. Proposals on "Inicio · decisiones" (30 Sep) | B ink tag (changed 30 Sep from "yellow, home only": with the art banner above, yellow tags would compete with the single yellow action) | decided 2026-09-30 by owner: B ink tag (#101217 fill, white text, 1.5 px white edge) |
| H4 | Promises on the home ("Cómo funciona Laria", the sell block and the footer): 1 "Publicar es gratis", 2 "Laria no cobra comisión", 3 "Cada publicación la revisa Laria o viene de una tienda verificada", 4 "Laria revisa a mano su RUC, dirección y contacto", 5 "Solo se reseña después de una compra que comprador y vendedor confirmaron en Laria", 6 "Te avisamos por correo cuando está visible" | Checked against docs/functional-spec.md on 30 Sep (table on "Inicio · decisiones"): 3, 4 and 5 match the spec. 1 and 2 are true in V1; paid plans and commission enforcement are post-V1 in the spec, so the owner decides whether they are permanent. 6 holds once the automatic email sender is on (go-live checklist) | decided 2026-09-30 by owner: agrees with the proposals except 6, which leaves the home: an email notice is stated once the person acts (publishing a listing, buying, etc.; see "Email notices in context" below). 1–5 stay as written; 1 and 2 change together with any future paid plan or commission. Sell block now: "Publicar es gratis. Revisamos tu publicación antes de mostrarla." |
| H5 | Band content | Headline, search and vitrina only; guarantees move to "Cómo funciona Laria" after the first listings | decided 2026-09-27 by owner ("not in this section, lower in the page") |
| H6 | Headline: 1 "El mercado de instrumentos del Perú" / 2 "De músico a músico" / 3 "Tu próximo instrumento, a un WhatsApp de distancia". Shown on the rotation banner on "Inicio · decisiones" (30 Sep) | 1 (one line on desktop, says what Laria sells; already on all nine banners) | decided 2026-09-30 by owner: 1 "El mercado de instrumentos del Perú" |
| H7 | Banner art, centred headline + search. Owner standouts (27 Sep): Glitch and Grabado; from the off-palette batch the owner liked Chicha, Cimática, Espectrograma and Aire. Round 5: Constelación / Khipu / Biofonía / Nazca / Fuego / Ferrofluido / Cianotipo / Glissandi. Round 6: Chavín / Vasijas / Madera / Lentejuelas / Rayos X / Batidos / Marinera / Escala infinita. Round 7 (maximalist): Cartel chicha / La paradita / Retablo / Estuche / Bordado / Espejo cusqueño / Modular / Selva. Round 8 (29 Sep, from the owner's street-band reference): Pasacalle / Castillo / Yunza / Sikuris / Arpillera / Tabla de Sarhua / Mate burilado / La vuelta a la plaza. Round 9 (29 Sep, final 8, no asset or motif shared between pieces; a fiesta in eight moments): Rumbo a la fiesta / Clarines / Sombras / Comparsa / Diablada / Sombreros al aire / Reflejo / La mañana siguiente. Owner, 30 Sep: Diablada 10/10, goes into the banner rotation. Round 10 (30 Sep, Diablada's style applied to the instruments): Trompeta y tuba / Bombo y platillos / Trombón y saxo / Tarola y clarinetes / Waqrapuku y tinya / Siku y quena / Charango y cajón / Guitarra y amplificador | Build the rotation from Diablada's family. Cautions: Rayos X could suggest that Laria inspects gear physically; Cartel chicha must be redrawn if the categories change; craft homages (Retablo, Bordado, Cartel, Arpillera, Sarhua, Mate) are best commissioned from real artisans if chosen; Diablada: the dance is also claimed by Oruro (Bolivia), so present it as Puno's Candelaria, and its toy-like 3D may divide opinion | decided 2026-09-30 by owner: the rotation is Diablada plus all eight round-10 pieces ("these are PERFECT, we'll use them all in rotation"); files in `art/rotation/` |
| H8 | Sellers' listing photos as banner art | Superseded 27 Sep: the owner asked for original art instead | superseded |
| H9 | Banner text and search centred over full-width art | Yes (owner direction, 27 Sep) | decided 2026-09-27 by owner |
| H10 | Banner art may use palettes outside the brand colours; the interface keeps the brand palette | Yes (owner, 27 Sep) | decided 2026-09-27 by owner |
| H11 | How the banner rotates | One piece per visit, chosen at page load; no auto-advancing carousel and no motion. Keep every piece in the rotation on a dark ground with white text (like the Diablada family) so the headline and search never change; each piece ships as desktop 2880×600 and phone 780×300, decorative (empty alt) | decided 2026-09-30 by owner: one per visit |

Correction logged: the concept's "Cada publicación pasa por revisión" was inaccurate (Tienda Verificada publishes without listing-by-listing moderation, functional-spec §Store Approval and Verification). Now "Cada publicación la revisa Laria o viene de una tienda verificada".

### Email notices in context (from H4, for UX-5 and UX-6)

The home makes no email promise. An email notice is stated right after the action that triggers it, and only for emails the spec sends (functional-spec § Email Notifications): sending a listing for review (approval or rejection), applying as a store (approval or rejection, later verification changes), a seller marking a sale (the buyer is asked by email to confirm the purchase), the review workflow that follows, creating a search alert, and saving a favorite (an email if its price drops). Until the automatic sender is on (go-live checklist, "Marketplace email worker — mandatory"), the emails go out when the worker is run by hand, so this copy promises the email, never how fast it arrives.
