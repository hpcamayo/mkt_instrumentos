# Decision log

Newest first. Status: pending (owner question open), decided (owner answered), superseded.
Record who decided and when. A decided item changes only through a new entry.

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

## Raised at the UX-2 acceptance gate (1 Oct; N12 updated 3 Oct; answered 7 Oct)

Deviations from the approved brief, explained in `ux-2-acceptance.md` § Deviations. On 7 Oct the owner took Claude Code's recommendation on each open question ("go with your recommendations"); the options offered are in `ux-2-acceptance.md` § Owner answers (7 Oct).

| ID | Question | As built | Status |
| --- | --- | --- | --- |
| N9 | Header "Vender" border: N1 names #4B5563, which is 2.6:1 on the frame black, below the design system's 3:1 rule for control boundaries | The `onDark` variant's border (white at 40%, about 3.7:1) | decided 2026-10-07 by owner: keep the `onDark` border (white at 40%); supersedes N1's border colour, the rest of N1 stands |
| N10 | Footer "Registrar mi tienda": the brief names `/registro/tienda` | `/registrar-tienda`, the existing gate (signed out: create a store account or sign in; signed-in Particular: told a store needs its own account; store owner: their store) | decided 2026-10-07 by owner: keep `/registrar-tienda` |
| N11 | Phone breadcrumbs: the brief's rule (only a back link to the parent) also applies to the catalog and the category landings, where the Catalogo-390 concept shows none | Back link on the catalog ("‹ Inicio"), the category landings ("‹ Instrumentos") and listings | decided 2026-10-07 by owner: the back link only on listing pages; the catalog and the category landings show no breadcrumb on phones (the strip, on every page since N12, starts with "Instrumentos" and the logo leads home). Built 7 Oct (`Breadcrumbs` `phoneBackLink`) |
| N12 | The shell that UX-2 replaced (mega-menu, categories and search on account and Admin pages) is still what the canonical V1 record describes: functional-spec "Sprint 5 owner navigation clarification" and "Sprint 6 implementation clarification", rows PUB-008 and PUB-010 to PUB-015, and the legal pages "linked from the global footer" | **Preference decided 3 Oct by the owner:** restore the mega-menu's category and type access inside the UX-2 design. Built as the hybrid in `ux-2-shell.md` § Amendment: strip categories open "Ver todos" + canonical types, "Instrumentos" and "Tiendas verificadas" stay links, a compact panel on phones, the strip on account pages, "Explorar categorías" in the Admin navigation | **Preference: decided** (owner, 3 Oct). **Build side: decided 2026-10-07 by owner:** the build stays as it is (no search in Admin; on phones no search on account, legal or sign-in pages; the phone form is the compact panel, not an accordion); the canonical record is reworded instead. **Record side: decided 2026-10-07 by owner:** Claude Code drafts the wording and re-runs the rows on this build (`ux-2-reconciliation.md`); the owner records status and wording in `docs/functional-spec.md` and `acceptance/cases.tsv`. **Recording: pending (owner).** No Pass is inferred |
| N13 | When to rebase `ux/redesign` on `main` (the roadmap asks before each acceptance package; UX-2 was not rebased; `origin/main` is one docs-only commit ahead, no overlapping files) | Not rebased | decided 2026-10-07 by owner: rebase once, at merge time, so the commit IDs quoted in the acceptance docs stay valid until then |
| N14 | Checks only a person can do (Safari/WebKit, a screen reader, real touch, a deployment) | Chromium only | decided 2026-10-07 by owner: the owner runs a short Safari + VoiceOver pass on the Mac against the local build (steps on the UX-2 review page); real iPhone/Android checks wait for a preview deployment (pushing needs the owner's go-ahead) or UX-8 |

## Pending — product-behavior flags raised in UX-2

| ID | Question | Surfaces in |
| --- | --- | --- |
| F9 | Free-text search over brand, model and title (raised by N8). Today the search matches the brand only; widening it is a query change touching the catalog filters, search alerts and SEO | UX-3 |

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
