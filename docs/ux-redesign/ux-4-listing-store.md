# UX-4 · Listing and store pages — brief

**Status: provisionally approved (owner, 9 Oct 2026, evening):** before travelling the owner took every recommendation ("Yes, all recommendations"; § Owner answers). UX-4 is built on them while the owner is away (N17), and each answer is confirmed or reversed at the 4a and 4b reviews. The questions are on the review page https://claude.ai/artifact/T2pej3FqaGD3Nimwi5VGcY (§ Questions). Where this brief and the concept screenshots differ, this brief wins.

UX-4 helps a buyer decide with confidence and contact the seller in one obvious step:
- the listing page `/instrumentos/<publicación>`;
- the store page `/tiendas/<tienda>`.

It changes no schema, migration, RLS, auth, moderation, lifecycle, review, report or seller-contact rule. The only query changes are reads of existing public columns: the store's `created_at`, social links and `store_photos`, which STORE-012 already expects to "render when public". Anything that would need more is a flag (§ Questions).

UX-4 is the first sub-sprint under N15: it is audited and released on its own once the owner accepts it (§ Release).

**Visual references**
- `screenshots/page-concepts/`:
  - `Ficha-1440` (two columns, spec strip, Guardar/Compartir, seller card with stats, reviews with a star histogram, "Más baterías acústicas");
  - `Ficha-390` and `Ficha-390-resto` (gallery with thumbnails, compact seller row, contact bar at the bottom, related row);
  - `Tienda-1440` (compact header with stats, tabs, in-store search, chips and sort, five columns, reviews and "Sobre la tienda").
- Today: `screenshots/ux3-after/1440-public-publicacion`, `ux2-after/390-public-publicacion`, `ux3-after/1440-public-tienda` and `390-public-tienda`.
- The concepts predate several decisions; where they differ, the decisions win:
  - "Vender" is the outline button on dark (N1, N9);
  - the search placeholder is "Busca por marca: Yamaha, Fender…" (N8);
  - the category menus are restored (N12);
  - phones show a back link only on listing pages (N11).
- They also show things this brief does not build without an answer:
  - "11 ventas confirmadas" (F12, L20);
  - a star histogram (it needs a new query);
  - the store's street address and "Te atiende Lucía" (L18);
  - tabs, in-store search, chips and sort (L16);
  - "Compartir" (L8);
  - a shorter payment line that leaves out shipping and guarantees (L5).

## Decided inputs

| Source | What it fixes for UX-4 |
| --- | --- |
| D7 | Every contact button is the primary yellow button with the WhatsApp glyph and "Contactar por WhatsApp" |
| N3, N4 | Nothing in the shell is sticky; phones have no bottom bar in the shell. A contact bar on the listing page is a page element, so it is the owner's call (L4) |
| N7 | "Tiendas verificadas" opens the catalog filtered to verified stores; there is no stores directory |
| N11 | On phones only listing pages show a back link ("‹ Guitarras eléctricas") |
| N12 | The strip with its category menus stays on listing and store pages |
| N15 | Each sub-sprint is audited and released after the owner accepts it (§ Release) |
| H4 | The promise wording: "Solo se reseña después de una compra que comprador y vendedor confirmaron en Laria"; verified stores: "Laria revisa a mano su RUC, dirección y contacto" |
| UX-3 Q3–Q5, Q17 | The one card (square photo, two tab stops, spec and seller lines), the grid gutters 20 / 12 and radius 8, buttons 36 / 44 / 52 only |
| P1 | The store inventory and the recommendations show the one card in their old grids until UX-4 |
| P3 | `Skeleton` was kept for the listing page's streamed sections |
| Q18 (F12) | No store stats on the home; revisit with UX-4's store page (L20) |
| Home visual audit items 3, 4, 11, 12 | Related listings and store grids use the UX-3 card; store monograms stay white; the verified mark matches the size of the line icons beside it |

## Today (checked 9 Oct on `568b07a`)

**Listing** (`app/instrumentos/[slug]/page.tsx`, 881 lines; the category landings share the route):
- **One white panel on the right holds almost everything** (`:342–449`): seller badge, title, price, metadata, key specs, contact, a notice, report, then the seller box, reviews, description and specifications. The gallery sits alone on the left and is sticky from 1024 px (`:335`).
- **The favourite floats alone** above the grid, right-aligned (`:332`).
- **Two contact paths:**
  - two WhatsApp buttons, at `:382–389` (`source` detail) and in the seller box (`:690–698`, `source` seller_panel);
  - "Ver tienda" (`:390–397`) and "Ver página de la tienda" (`:700–707`).
- **Four limitation texts on one page:** the info notice (`:401–408`), the seller box's grey note (`:710–714`), the reviews' "No implica garantía…" (`components/reputation-summary.tsx:16`) and the slim footer.
- **Key specs repeat the base fields** (`getKeyListingSpecs`, `lib/listing-specs.ts:42–52`): condition, category, brand, model, city, seller, then three attributes, up to eight.
- **The full table repeats them again,** with "Publicado", "Ciudad" and "Vendedor" (`getFullListingSpecs`, `:84`).
- **The condition is shown raw** ("Usado - buen estado", `:110`), while cards, filters and chips say "Usado · buen estado".
- **"Visto 184 veces" is public** (`components/listing-detail-metadata.tsx:47, 65`; F3).
- **Gallery** (`components/listing-detail-gallery.tsx`):
  - 4:3, photo contained;
  - two arrows and a counter;
  - 64 px thumbnails under `aria-label="Miniaturas de fotos"`;
  - no lightbox and no swipe.
- **Related listings:**
  - "Publicaciones similares" shows an empty state when there are none (`:792`), which is how today's capture ends;
  - the grid is one column below 460 px (`:786`).
- **Reviews** (`ReputationSummary`):
  - a client component only because of its report buttons;
  - when the reputation call fails it says "Aún no tiene reseñas verificadas visibles." (the parser returns an empty result);
  - it prints the buyer's full profile name (`get_reputation` reads `profiles.full_name`).
- **No current item in the strip** (`currentStripKey` reads only the URL).
- **No `loading.tsx` or `error.tsx` for the route.** A route-level `loading.tsx` must not come back: the category landings share the route, and `tests/ux-shell.test.cjs:118` pins its absence since the stall fix (UX-3 Q1). Errors fall to the shared 500 page, which already renders inside the frame.
- **First-load JS 208 kB** (route shared with the landings). About 62 kB of it (gzip) is the Supabase browser client:
  - chunks `e3e101b0…` (12 kB) and `6687…` (50 kB) in the 9 Oct build;
  - on this page only `components/content-report.tsx` imports it, for the report form.

**Store** (`app/tiendas/[slug]/page.tsx`, 333 lines):
- **A large cover:** a 160 / 224 px banner, or the store name on black, with the logo or monogram overlapping it (`:198–233`). Then the name, place and description; the WhatsApp button and "Reportar tienda" on the right.
- **It reads only some store fields** (`:55–77`). `created_at`, the social links (Instagram, Facebook, TikTok, web) and `store_photos` are never shown, though anonymous visitors can read them for active stores and STORE-012 expects optional socials and assets to "render when public".
- **A second limitation text** (`:250–254`) plus the reviews' one.
- **Grid:** one column below 640 px, two, then three (`:297`).
- **No breadcrumb, and no current item in the strip.**
- **First-load JS 195 kB,** with the same 62 kB Supabase client from the report form.

## First task: React #418 on fresh listing pages

A listing page for a freshly created listing with two Storage photos logs React error #418 (a hydration mismatch) in production builds.
- **Where it was seen:**
  - 4 of 4 sessions on the UX-2 build;
  - 3 of 4 on the pre-UX-2 build `645d51e`.
- **Where it was not seen:**
  - in `next dev`;
  - on the seed listings (16 sessions).
- **What it blocks:** the strict favorites browser smoke (it passes when only that error is tolerated).

The cause is not known. Ruled out by reading the code:
- the account provider's initial state, which is deterministic;
- the favourite's first render;
- the gallery's image markup.

Still open:
- the relative date computed from `Date.now()` during render in `ListingDetailMetadata`;
- anything that differs between Storage and placeholder photos;
- the streamed `Suspense` inside the seller box's `<p>`.

**Method:**
1. A local fixture: a fresh listing with two Storage photos, as the smoke creates it.
2. A scratch production build with minification off, reading the component stack from React's recoverable-error report.
3. Bisect by fixture difference (photos, owner profile, freshness).

**Done when:**
- 10 fresh-listing sessions on the production build log no #418;
- the strict favorites smoke passes;
- a regression test pins the cause.

If the cause sits outside UX-4's files, it is fixed anyway and reported.

## Split and release (L1)

Recommended: **4a**, the listing page (with #418 first and L15), then **4b**, the store page. Each gets its own build, evidence, acceptance package and review page under this one brief; 4b starts when the owner accepts 4a.

Under N15, UX-4 is released once, after 4b is accepted:
1. Codex runs a blind audit of the whole UX-4 diff.
2. The owner pushes.
3. A read-only production smoke follows.

The alternative is to release 4a on its own first: earlier production use, two audits.

## Proposed design

### Listing page (4a)

**Desktop (1024 px and up)**, white page in `PageContainer`:
- **The breadcrumb** (unchanged, UX-2), then two columns with a 32 px gap:
  - left, 7 of 12 columns: the gallery, "Especificaciones", "Descripción" and the reviews;
  - right, 5 of 12: the decision column.
  - Nothing sticky (L2).
- **The decision column**, in order:
  - **Identity:**
    - a sold listing first shows the `StatusTag` "Vendida";
    - the `h1` (`t-page`);
    - "Marca · Modelo" (`t-ui`, `ink-2`; not uppercase, since model names run past three words);
    - the price (`Price size="detail"`);
    - one line: the condition as a `Tag` ("Usado · buen estado", `getConditionLabel`), then `t-meta` "Miraflores, Lima · Publicado hace 3 días";
    - no view count (L6).
  - **The key-spec strip** (L9): up to four of the type's attributes, starting with the card's two, in bordered cells (`t-meta` label, `t-ui` 600 value). None when the listing has no attributes.
  - **The contact module** (L4):
    - "Contactar por WhatsApp" (primary, 52 px, full width, the glyph);
    - under it, "Guardar" (the favourite with a visible label, secondary 44 px; "Guardada" when saved, `aria-pressed`);
    - "Compartir" only if L8 says so.
  - **The trust statement** (L5): a 16 px shield line icon, the text in `t-meta`, "Consejos de seguridad" as a link.
  - **The seller card** (L10, L20):
    - a bordered panel, `id="vendedor"`;
    - a 40 px square: the store's logo or white initials on `frame-2`, or the Particular's initials on `canvas`;
    - the name (16 px / 600);
    - "Particular", "Tienda" or `VerifiedMark` ("Tienda verificada");
    - the place;
    - a row of real figures, each left out when it has no value or its query fails: "4.8 ★ · 9 reseñas" (only with at least one visible review), "N publicaciones" (active ones, today's count), "En Laria desde jul. 2026" (America/Lima);
    - for a store, "Ver la tienda" (secondary 36 px). A Particular has no page; "Más de este vendedor" below shows their other listings.
  - **"Reportar publicación":** a quiet link with an 18 px flag icon. The form opens in place as today (REP-001–005), loaded only when pressed (L15).
- **The left column under the gallery:**
  - **"Especificaciones"** (L9): Tipo (the instrument type, or the category when there is none), Marca, Modelo, Condición, then every attribute with its label (LIST-011).
    - Rows with no value are left out (no "No indicada").
    - Two columns of rows from 1024 px, one on phones; 44 px rows, label `ink-2` left, value ink 600 right, `line-deco` separators.
  - **"Descripción":** `t-body`, line breaks kept, 68 characters a line; empty: "Esta publicación aún no tiene descripción."
  - **"Reseñas de <vendedor>"** (L11):
    - the average and the count, then the five latest reviews as today;
    - each review: the reviewer's name per L11, "5 de 5" (words, not only stars), the month ("set. 2026", America/Lima), the comment, "Reportar reseña" (REVW-015);
    - with more than five: "Mostrando las 5 más recientes de 9";
    - none yet: "Aún no tiene reseñas.";
    - one line closes the section: "Solo se reseña después de una compra que comprador y vendedor confirmaron en Laria. Laria no procesó el pago ni la entrega." (REVW-020; H4 promise 5);
    - if the reputation call fails, the section is left out instead of claiming there are no reviews.
- **Full width under both columns** (L12):
  - **"Publicaciones similares"** (today's query) and **"Más de esta tienda"** / **"Más de este vendedor"**:
    - four cards each, in the UX-3 grid (two columns on phones, three from 768 px, four from 1024 px; gaps 12 / 20 px);
    - title links at the right: "Ver todo" (the type's landing, or the category's) and "Ver la tienda";
    - a section with no listings is left out.
  - While they stream, `Skeleton` cards hold their place (P3), so nothing shifts.

**Phones and tablets (below 1024 px)**, one column:
- The back link (N11).
- **The gallery**, full width inside the gutters.
- **Identity:** title, brand · model, price, the condition line.
- **A compact seller row:** name, type words and rating when there is one, linking to `#vendedor`.
- The key-spec strip (three cells a row).
- The full trust statement.
- Especificaciones, Descripción, the seller card, the reviews, "Reportar publicación", then the related sections.
- **The contact module becomes a bar** at the bottom of the screen (L4 A):
  - white, a 1 px `line-deco` top border;
  - the favourite (44 px square, secondary), "Contactar por WhatsApp" (primary, 52 px);
  - one `t-meta` line under them: "Laria no procesa pagos ni envíos · Consejos de seguridad";
  - the safe-area inset below.
- **How the bar behaves:**
  - It is the same element as the desktop module, so the page has one WhatsApp button (`source` detail), and Tab reaches it right after the price, as on desktop.
  - The page gets bottom padding and a matching `scroll-padding-bottom`, so the bar never hides a focused element.
  - When the viewport is shorter than 560 px (landscape, or 200% zoom), the bar is not fixed: the module sits in the page after the identity block (reflow).
  - No bar on sold listings.

**Gallery and lightbox** (L3 A; `ListingGallery`, `Lightbox`):
- **The main frame:** 4:3, photo contained on white, 1 px `subtle` border, radius 8.
  - The counter "1 / 8" (white 13 px / 600 on `frame` at 75%) bottom right.
  - From 1024 px two 44 px round arrows ("Foto anterior", "Foto siguiente").
  - On phones the photos sit in a sideways scroll-snap track (swipe; the counter follows), without arrows.
- **The first photo is the page's LCP:** eager, with high fetch priority; the others lazy.
- **Thumbnails**, still under `aria-label="Miniaturas de fotos"` (PHOTO-017):
  - square, cover, radius 6; 72 px with `sizes="72px"` from 1024 px, 56 px on phones;
  - the chosen one has a 2 px ink ring and `aria-current`;
  - at most six (four on phones), then a "+N" tile that opens the lightbox at the next photo.
- **The main photo is a button** ("Ampliar foto 1 de 8") that opens the lightbox:
  - a native modal `<dialog>` over frame black at 95%;
  - the photo fitted to the viewport, loaded at full width only when opened;
  - the counter, 44 px arrows, "Cerrar" (44 px);
  - Esc, the arrow keys and swipe work;
  - focus is trapped and returns to the button that opened it; nothing animates under reduced motion.
- No photo: today's "Sin foto" frame.

**The sold view:**
- the `StatusTag` "Vendida";
- no favourite, contact module or bar;
- in the module's place, today's text "Este instrumento fue marcado como vendido y ya no está disponible para consultas de compra." and a "Ver publicaciones similares" link to that section;
- the seller card without contact, and the historical line "Este registro se conserva como historial. Laria no procesó ni garantizó la transacción.";
- no view counted (`trackView={!isSold}`), `noindex` and SoldOut as today (LIFE-006, SEO).

**The strip** (L13 A): the listing's category is the strip's current item. The page tells the shell through a small client part after load; no layout shift, since the underline is an inset shadow.

**States:**
- 404 is unchanged: hidden, pending, rejected and unknown listings.
- No route `loading.tsx` (the stall rule). Slow sections stream with `Skeleton`.
- A failed related query leaves its section out; a failed count leaves its figure out; a failed reputation call leaves the reviews out; a crash falls to the shared 500 page.

### Store page (4b)

**Header** (L17 A), on a `canvas` band under the strip, inside `PageContainer`:
- The breadcrumb from 768 px (L19).
- **When the store uploaded a banner:** a 120 px strip (96 px on phones), radius 8, cover, `alt=""` (STORE-012). No banner: no cover; today's black placeholder band goes.
- **The identity row:**
  - the logo or white initials on `frame-2`, 96 px (64 px on phones), radius 8 (item 11);
  - the `h1` (`t-page`), then `VerifiedMark` or the `Tag` "Tienda";
  - the place ("Cercado de Lima, Lima");
  - the description (`t-body`, `ink-2`, 68 characters a line).
- **The figures** (L20): "4.8 ★ · 9 reseñas" (only with reviews), "N publicaciones" (today's exact count), "En Laria desde jul. 2026" (the store's `created_at`, America/Lima).
- **At the right:** "Contactar por WhatsApp" (primary, 52 px, `source` store), with one `t-meta` line under it: "Coordinas el pago y la entrega directamente con la tienda. Laria no procesa pagos ni envíos. Consejos de seguridad". On phones it goes full width after the figures. No bar on the store page.

**Section links** (L16 A): `nav aria-label="Secciones de la tienda"` under the header, with "Publicaciones 24", "Reseñas 9" and "Sobre la tienda" as links to the sections. They are not tabs: every section is on the page. 44 px on phones.

**"Publicaciones":**
- the `h2` with the count;
- the one card in the catalog grid without a sidebar: two columns on phones, three from 768 px, four from 1024 px, five from 1280 px;
- numbered pages, 24 per page (REL-002); the empty state and the error notice as today;
- no in-store search, chips or sort (L16 A: a store has at most 50 listings at a time, so three pages).

**"Reseñas"** (the listing's section, shared) on the left half from 1024 px; **"Sobre la tienda"** (L18 A) on the right half:
- Ubicación (district, city, region);
- Redes: Instagram, Facebook, TikTok and Sitio web, only those the store gave and only `http(s)` URLs, opening outside with `rel="noopener noreferrer nofollow"`;
- Fotos del local: up to five thumbnails that open the same lightbox;
- Verificación:
  - for a verified store: "Laria revisó a mano su RUC, razón social y contacto. No es una garantía sobre sus productos ni sus ventas.";
  - for a Tienda: "Laria aprobó esta tienda. Cada publicación suya se revisa antes de mostrarse.";
- "Reportar tienda" (REP-002), loaded on press (L15).

**Breadcrumb and strip** (L19, L13): "Inicio / Tiendas verificadas / Casa Musical Grau" for a verified store (the middle item is N7's filtered catalog), "Inicio / Casa Musical Grau" for a Tienda; none on phones (N11). The strip marks "Tiendas verificadas" on a verified store's page.

Unchanged: `StoreVisitTelemetry` (AN-007), metadata and JSON-LD, "Tienda" / "Tienda verificada" (VERIFY-001/012), the store hidden before approval (STORE-015).

### Components

New, beside `components/home/`:
- `components/listing/`: `ListingGallery`, `Lightbox`, `ContactModule`, `TrustNote` (every limitation text, one place), `SellerCard`, `ReputationSection` (a server component; the report buttons stay small client parts), `SpecTable`, `RelatedListings`.
- `components/store/`: `StoreHeader`, `StoreSections`.

`ContentReport` keeps its labels and flow. Its form, and the Supabase client with it, loads on the first press (L15 A); signed out, it stays the sign-in link.

`listing-detail-gallery.tsx` and `reputation-summary.tsx` are replaced. `ListingDetailMetadata` keeps its view registration (AN-002) and renders only the date line (L6 A).

## Behaviour and accessibility

- **Per page:** one `<main>` and one `h1`; Tab order follows the visual order (the bar after the price); the skip link first.
- **Gallery and lightbox:**
  - the lightbox is a modal dialog with a focus trap, Esc and focus return;
  - the counter is announced politely;
  - thumbnails are buttons named "Ver foto N de M";
  - swipe never replaces the buttons from 1024 px.
- **The bar:** never covers a focused element; not fixed on short viewports; 44 px targets; the safe area respected.
- **Figures and ratings carry words:** "4.8 de 5", "9 reseñas", "Tienda verificada".
- **Targets:** 44 px on phones, 36 px compact desktop controls, nothing below 24 px.
- **Layout:** no horizontal page scroll at 390 px (only the phone gallery track and the thumbnails scroll inside themselves); 200% zoom holds; no layout shift from the gallery, the streamed sections or the bar.
- **Motion:** 120 ms colour and opacity changes; the lightbox fades in 120 ms; nothing moves under reduced motion.

## Product rules it must not change

- **Contact:**
  - `wa.me` with the prefilled message, through `WhatsAppContactLink` and `/api/contact` (WA-001–007);
  - anonymous contact allowed;
  - no message content recorded;
  - the `seller_panel` source stays valid in the API even though no button uses it any more.
- **Counting:**
  - detail views (AN-002, `trackView={!isSold}`, the 3a seed-id fix);
  - store visits (AN-007);
  - impressions on related and store cards (AN-001, sources `recommendations` and `store`).
- **Reputation** only from verified transactions (`get_public_reputation`); never imply that Laria handled payment, delivery, guarantees or disputes (REVW-020, LEGAL-005/006, SCOPE-001–006).
- **Reports:** listing, store and review targets, the fixed reasons, optional detail (REP-001–005, REVW-015).
- **Status pages:**
  - a sold listing stays reachable with "Vendida", `noindex` and SoldOut (LIFE-006);
  - a hidden listing is a 404;
  - a store is hidden before approval (STORE-015).
- **Labels:** "Tienda" and "Tienda verificada" only (VERIFY-001/012); "Reportar publicación", "Reportar tienda", "Reportar reseña".
- **Seller identity:** account-owned Particular listings show the current profile name, WhatsApp and place (LIST-015–017); legacy listings keep their listing-level contact (LIST-018).
- **Photos:** responsive and lazy thumbnails (PHOTO-017).
- **SEO:** listing and store metadata, canonical URLs, JSON-LD, the route's dispatch (category slugs first, SEO-001).
- **Data:** no schema, migration, RLS, auth, moderation or lifecycle change.

## Out of scope

- An owner's view of their own listing, and any view of a hidden listing (L14).
- Relist URLs (F1) and the condition scale (F2), L21.
- A public confirmed-sales count (F12) unless L20 B; a star histogram (it needs a new query).
- In-store search, chips and sort unless L16 B; a stores directory (N7).
- The lighter card for every grid (P10, UX-8).
- English attribute labels (UX-5, one change for the form, filters, cards and table).
- The category landing's "Compra con cuidado" (accepted in UX-3).
- Admin, account pages, the sell flow.

## Questions

Asked on the review page https://claude.ai/artifact/T2pej3FqaGD3Nimwi5VGcY (private; answers saved in its db collection `answers`, one document per question). Logged in `decisions.md` as pending.

| ID | Question | Options | Recommendation |
| --- | --- | --- | --- |
| L1 | Split and release | A 4a (listing, with #418) then 4b (store), one release after 4b · B one pass · C release 4a on its own, then 4b | **A** |
| L2 | Listing layout | A two columns: gallery, specifications, description and reviews on the left; title, price, contact, trust line, seller card and report on the right (concept) · B today's order restyled (everything in the right column) | **A** |
| L3 | Gallery | A thumbnails with "+N", swipe on phones, a full-screen lightbox · B A without the lightbox · C today's gallery restyled | **A** |
| L4 | Contact on phones | A one contact module that becomes a bar at the bottom of the screen below 1024 px (favourite + WhatsApp + one line) · B one in-page button after the price, nothing fixed | **A** |
| L5 | The one trust statement | A the full limitation (texts in § Proposed design; per surface) · B the concept's shorter line ("Pagas directo a la tienda; Laria no cobra ni retiene pagos. Revisa el equipo antes de pagar."), which leaves out shipping and guarantees | **A** |
| L6 (F3) | Public "Visto N veces" | A hide it; views are still counted and the owner sees them in Mi cuenta · B show it from 50 views · C keep it | **A** |
| L7 (F5) | A safety step before the first WhatsApp contact | A no step; the trust statement sits by the button · B a one-time sheet with three tips and "Continuar a WhatsApp" | **A** |
| L8 | "Compartir" (new behaviour, no data stored) | A "Guardar" only · B "Guardar" and "Compartir" (the phone's share sheet; on desktop, copy the link) | **A** |
| L9 | Spec strip and table | A strip: up to four of the type's attributes; table: type, brand, model, condition and every attribute, empty rows left out · B today's eight key specs and full table, restyled | **A** |
| L10 | Seller card | A name, type words, place, real figures (rating when there are reviews, active listings, "En Laria desde"), "Ver la tienda" for stores; no second WhatsApp button · B today's three boxes, second WhatsApp button and "Ver página de la tienda", restyled | **A** |
| L11 | Reviewer's name on public reviews | A the full profile name (today) · B first name and initial ("Rodrigo C.") · C "Comprador de Laria" for everyone | **B** |
| L12 | Related listings | A two sections ("Publicaciones similares", "Más de esta tienda / este vendedor"), four cards each in the catalog grid, left out when empty · B one sideways row on phones (concept) | **A** |
| L13 | Current item in the strip | A the listing's category on listing pages; "Tiendas verificadas" on a verified store's page · B none (the breadcrumb names it) | **A** |
| L14 | An owner's view of their own listing (flag candidate) | A not now · B a notice for the signed-in owner: "Es tu publicación · Editar · Ver estadísticas" | **A** |
| L15 | Lighter listing and store pages | A load the report form (and its 62 kB Supabase client) only when "Reportar" is pressed · B as today | **A** |
| L16 | Store sections and tools | A section links, every section on the page; no in-store search, chips or sort · B A plus category chips and sort (a store-scoped query) · C real tabs | **A** |
| L17 | Store header | A compact identity header on `canvas` with figures; the banner as a 120 px strip only when uploaded · B today's large banner header, restyled | **A** |
| L18 | "Sobre la tienda" | A place, social links, store photos, the verification line, report; no street address or contact person · B A plus the street address and the contact person | **A** |
| L19 | Store breadcrumb | A "Inicio / Tiendas verificadas / <tienda>" for verified stores, "Inicio / <tienda>" for the others, none on phones · B "Inicio / Instrumentos / <tienda>" for all | **A** |
| L20 (F12) | A public confirmed-sales count ("11 ventas confirmadas") | A not now · B add it (a new public database function: a migration and its own production release) | **A** |
| L21 (F1, F2) | Relist URL growth and the condition scale | A defer: F1 to UX-5 (where relisting lives), F2 after V1 · B decide now | **A** |

## Owner answers (9 Oct, provisional)

Given in the session before the owner travelled: "Yes, all recommendations". Recorded in `decisions.md` and on the review page; to confirm at the 4a and 4b reviews.

| ID | Decision |
| --- | --- |
| L1 | A: 4a then 4b, one release after 4b |
| L2 | A: two columns as in the concept |
| L3 | A: thumbnails with "+N", swipe on phones, a lightbox |
| L4 | A: one contact module, a bar at the bottom below 1024 px |
| L5 | A: the full limitation, worded per surface |
| L6 | A: no public view count (F3) |
| L7 | A: no safety step (F5) |
| L8 | A: "Guardar" only |
| L9 | A: the type's attributes in the strip; a table without repeats |
| L10 | A: identity and real figures; no second WhatsApp button |
| L11 | B: first name and initial |
| L12 | A: two related sections in the catalog grid, left out when empty |
| L13 | A: the strip marks the listing's category and "Tiendas verificadas" on verified store pages |
| L14 | A: no owner's view now |
| L15 | A: the report form loads on demand |
| L16 | A: section links; no in-store search, chips or sort |
| L17 | A: compact store header; banner strip only when uploaded |
| L18 | A: no street address or contact person |
| L19 | A: store breadcrumb by store type, none on phones |
| L20 | A: no confirmed-sales count (F12) |
| L21 | A: F1 to UX-5, F2 after V1 |

## Acceptance criteria

**4a**
1. **#418 is gone:** 10 fresh-listing sessions on the production build log none; the strict favorites smoke passes; a regression test pins the cause.
2. **Matches the brief:** the listing page matches this brief and the owner's answers at 390 / 768 / 1280 / 1440, signed out and as a Particular, for:
   - a Particular listing;
   - a verified store's listing;
   - a sold listing;
   - listings with no photo, one photo and eight photos;
   - with and without reviews.
3. **One contact button and one trust statement per page;** sold pages have neither (the sold line instead).
4. **Product rules hold:** the rows below, re-run on the build, behave as before (observations only).
5. **Audit:**
   - axe 0 violations, also with the lightbox open;
   - focus visible and Tab order;
   - the lightbox's trap, Esc and focus return;
   - the bar never hides focus and reflows on short viewports;
   - no overflow at 390;
   - 200% zoom holds;
   - no layout shift.
6. **First-load JS** reported per route: with L15 A, the listing route at or below 160 kB (208 today). LCP on the listing's first photo reported.
7. **SEO smokes pass;** tests updated, never weakened; lint, typecheck, test and build pass.

**4b**
1. **Matches the brief:** the store page matches at the four widths, for a verified store with banner, socials, photos and reviews, and a plain Tienda with none.
2. **Product rules hold:** 4a's criteria 4, 5 and 7 hold for the store page.
3. **First-load JS:** the store route at or below 145 kB with L15 A (195 today).

**Both:** `docs/design-system.md` gains a "Listing and store pages (UX-4)" section; `ux-4a-acceptance.md` and `ux-4b-acceptance.md`, each with its review page; `roadmap.md`, `README.md`, `decisions.md` and `review-guide.md` updated.

## Evidence plan

All on production builds (`next build` + `next start`, stopped by port) against local Supabase only.
- **Checks:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- **Fixtures (local-only scripts that refuse non-local URLs, like `scripts/ux-local-photos.cjs`):**
  - a listing with eight photos;
  - a fresh listing with two Storage photos (#418);
  - a store with banner, socials and store photos;
  - verified transactions with visible reviews for one store and one Particular;
  - a sold listing.
  Each has `--remove`.
- **#418 trials:** 10 fresh-listing sessions before and after the fix.
- **Captures:** `scripts/ux-snapshots.cjs` before and after, with selected WebP frames in `screenshots/ux4-before|after/`:
  - the listing page in each fixture state;
  - the lightbox and the phone bar;
  - the store page in both store states.
- **Audit:** `scripts/ux-audit.cjs` extended with the lightbox (dialog, trap, Esc, focus return), the phone bar (focus not obscured, the short-viewport reflow), the gallery track, the section links.
- **Performance:**
  - first-load JS per route against today (listing 208 kB, store 195 kB);
  - the browser's cold-load JavaScript, as in 3b;
  - the listing's LCP on the first photo.
- **Acceptance rows** re-run as observations (no status written):
  - PUB-003, PUB-004, PUB-007 (Not Run);
  - LIFE-005, LIFE-006;
  - PHOTO-017;
  - LIST-009, LIST-011, LIST-015–018 (Not Run);
  - WA-001–007;
  - FAV-006;
  - AN-001 (sources `recommendations`, `store`), AN-002, AN-007;
  - SANA-001;
  - REP-001–005;
  - REVW-015, REVW-018–020;
  - REL-002;
  - STORE-011, STORE-012, STORE-015;
  - VERIFY-001, VERIFY-012;
  - LEGAL-005/006 and SCOPE-001–006 (Not Run; copy).

## Tests expected to change (update, never weaken)

| Test | Today | After |
| --- | --- | --- |
| `ux-copy.test.cjs:129–138` | Exactly three `WhatsAppContactLink` bodies across the listing and store page files, each the glyph + "Contactar por WhatsApp" | The contact components' files; exactly one per page (two in all); same label and glyph; plus: no button uses `seller_panel` |
| `ux-copy.test.cjs:153` | The store page calls `storeInitials(store.name)` | The store header and the seller card do |
| `sprint-9.test.cjs:348–357` | The trust surfaces include the two page files; the listing page links `/consejos-de-seguridad` | The new component files join the forbidden-wording list (more files, same rule); `TrustNote` holds the link and both pages render it |
| `sprint-9.test.cjs:376`, `ux-shell.test.cjs:326` | The listing's exact `<Breadcrumbs … phoneBackLink />` | Unchanged |
| `sprint-3-1.test.cjs:47–51` | The listing `h1` renders `{displayTitle}` | Unchanged |
| `listing-lifecycle.test.cjs:43–52` | Sold copy, `trackView={!isSold}`, the published-count rule in the page | Unchanged wording and rules (they stay in the page or the test follows them to their component) |
| `listing-lifecycle.integration.cjs:114` | No WhatsApp link on a sold page | Unchanged (and no bar) |
| `sprint-8.test.cjs:370–395` | Report labels on the two pages and in `reputation-summary.tsx` | Same labels and targets in `ReputationSection` and the store sections |
| `marketplace-tracking.test.cjs:329–355` | `ListingDetailMetadata` renders "Visto 8 veces" and updates from the event | With L6 A: the view is registered when visible and on `visibilitychange`, never when sold, and no count is rendered |
| `analytics-browser-smoke.cjs:178–193` | Main image eager with `100vw` in its `sizes`; thumbnails `sizes="64px"`, lazy | The same checks on the new gallery (eager first photo with high priority; thumbnails 72 / 56 px, lazy) |
| `analytics-browser-smoke.cjs:199–206` | Clicks the first `wa.me` link | Unchanged (it is the only one) |
| `favorites-browser-smoke.cjs:23–26` | The listing's favourite (signed-out link, saved state) | Unchanged names; strict mode again once #418 is fixed |
| `ux-primitives.test.cjs` | `Skeleton` exempt as unused | Exemption removed |
| `ux-shell.test.cjs:118` | No `loading.tsx` for `app/instrumentos/[slug]` | Unchanged |
| New | — | #418 regression; gallery (thumbnails, "+N", counter, lightbox open/close/focus return); the module rendered once with the phone bar rule; trust texts per surface; seller figures left out when empty or failed; reviewer name (L11); spec table omissions and the condition label; related sections left out when empty; store socials only with `http(s)` URLs; store breadcrumb and strip item per store type; the report form not in the pages' first load (L15) |
