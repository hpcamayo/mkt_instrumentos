# Baseline UX audit — 2026-09-27

## Method

- Live site laria.audio, anonymous, captured in the Claude desktop browser pane at 390, 768 and 1280 px (and 1280 full-page). Screenshots: `screenshots/baseline-2026-09-27/`.
- Sprint 9 was committed to `main` during the audit (`bcf9e61`, 11:45 Lima) and production served both the Sprint 8 and Sprint 9 builds while captures ran. The home captures show the Sprint 8 footer ("MVP"); Sprint 9 changed the footer, legal pages, category landings and account settings tabs. Everything else in the captures is unchanged by Sprint 9.
- Signed-in surfaces (selling, account, store, Admin, auth) were reconstructed from source code, file:line referenced. They still need live captures (UX-1 adds a screenshot harness).
- Code scans over `app/`, `components/`, `components_v0/`; WCAG 2.2 contrast computed from the tokens; one LCP measurement on the mobile home.
- Side effect: audit browsing added a few anonymous impressions, a store view, catalog searches and listing views to production analytics on 27-09 between 16:28 and 16:56 UTC.

## Diagnosis

Laria's product logic is ahead of its presentation. Eight sprints produced moderation with revisions, verified transactions, review reveal, alerts, price-drop notifications, a full Admin workbench, analytics and SEO. The interface on top of that reads as a competent template, not a specialist marketplace.

It is three layers with no shared system:

1. A v0-generated marketing home (`components_v0/*`): stock-photo hero, slogan headline, gradient tiles, duplicated trust strips, visible placeholders.
2. A generic white-card marketplace layer (catalog, listing, store): pills, blue caps eyebrows, weight 900 everywhere, duplicated CTAs and disclaimers.
3. Utility signed-in screens: dense and mostly complete, but on two token systems, with nine field implementations, jargon and desktop-only tables.

The specialist substance exists in the data — `lib/instrument-filters.ts` defines body type, shape, bridge, pickups, pieces, kick size, polar pattern and more per instrument type — but the UI barely shows it. The palette is strong and ownable; it is misused (blue and grey are used as text 176 times, mostly on light surfaces where both fail contrast). There is no typographic identity: the site renders in each OS's system font.

## Maturity by area

| Area | Maturity | Main issue |
| --- | --- | --- |
| Brand assets (logo, palette) | High | Palette usage, not palette |
| Typography | Low | System font stack, 5 weights with 900 dominant |
| Home | Low | Marketing template, 8 listings, placeholders |
| Catalog and filters | Medium-low | Form-style filters, noisy cards, 1 column on phones |
| Listing detail | Medium-low | Small gallery, duplication, no sticky contact on phones |
| Store page | Low | Placeholders shown to buyers, thin store info |
| Selling (code) | Medium-low | No field-level errors, one long form |
| Account and store (code) | Medium | Two systems, jargon, tables on phones |
| Admin (code) | Medium | Throughput: photos as links, UUIDs, identical actions |
| Accessibility | Low-medium | Contrast systemic; good disclosure/focus-return patterns in newer code |
| Performance (as designed) | Medium | Decorative LCP image; otherwise SSR and CLS 0 |

## Strengths to keep or evolve

1. Brand: yellow LARIA wordmark on the black band is distinctive. Keep the black frame.
2. Honesty as a product rule: no fake metrics, reviews only from verified transactions, explicit "Laria no procesa pagos". Turn repeated disclaimers into one trust system.
3. Specialist data model: category-aware attributes and advanced filters (`lib/instrument-filters.ts`, ~560 lines).
4. WhatsApp contact with a pre-filled message (`wa.me` with listing or store context).
5. Newer accessibility patterns: `GlobalCategories` disclosure with `aria-expanded`, Escape and focus return; `PageNotice` focus management; `min-h-11` targets; alt text on all images; named icon buttons.
6. SSR, image proxy, pagination, category landings, JSON-LD and sitemap (Sprint 9). Preserve all of it.
7. Good raw patterns: mobile "Filtrar / Ordenar" split; filter sheet; saved-search Alerts page; Admin inline reason forms with autofocus.

## Ranked problems

**P1. The mobile first screen is spent on chrome, not gear.**
- Header ≈225 px (logo row, search row, three links, "Crear cuenta" wrapped to its own row) plus a ≈63 px "Explorar categorías" bar: ≈290 of 844 px (34%) before any content (`home-390-fold.webp`).
- Catalog: first listing starts ≈865 px, below the first screen (`catalog-390.webp`): header + category bar + page-intro card + Filtrar/Ordenar + alert promo.
- Listing: price ≈985 px, WhatsApp button ≈1,380 px, no sticky contact (`listing-390.webp`).
- Tablet (768) gets the phone layout with the same wrapped header (`catalog-768.webp`).

**P2. The listing card — the core unit — is noisy and hard to compare.**
- Up to 11 elements: category pill, photo counter, 2 arrows, dots, heart, title, seller-type pill, subtitle, condition, price, location, seller (`catalog-1280.webp`).
- The seller-type pill squeezes titles to ~6 characters per line ("bajo / test"); titles truncate.
- Condition, a key attribute, is the least legible text (#9DA3AF, 2.53:1).
- 7 tab stops per card (147 for 21 results): 4 carousel controls, favorite, title, seller (`components/listing-card.tsx:170-182`).
- Phones get 1 column, ≈480 px per card, ≈1.7 listings per screen; a heart floats alone in an empty band.
- Two card implementations (`components_v0/featured-listings.tsx` vs `components/listing-card.tsx`); grids vary 4 / 3 / 1 columns between catalog, store and related items.

**P3. Palette misuse causes systemic contrast failures.**
- `text-laria-blue` (#6BA6FF) as text: 146 uses, mostly on white or light grey, where it measures 2.46:1 / 2.21:1 (links, eyebrows, labels, ratings). On black it passes (8.23:1).
- `text-laria-muted` (#9DA3AF): 30 uses; 2.53:1 on white. Placeholders ≈2.5:1.
- Yellow as text: 24 uses; where it sits on a light surface it is 1.27:1 ("CUENTA LARIA" on login, `login-390.webp`).
- Input borders #C8CDD6: 1.60:1 (needs 3:1). Focus rings `ring-laria-blue/20` and `ring-brass/20` ≈1.2:1; the solid blue ring is 2.46:1.
- Badges: blue text on 12% blue, 2.23:1.

**P4. The home page is a marketing template, not a marketplace home.**
- Desktop: ≈1,000 px of dark stock-photo hero ("TU ESCENARIO. TU SONIDO. TU LARIA."); the first listing starts ≈1,500 px down (`home-1280-full.webp`).
- Mobile LCP is that decorative Unsplash crowd photo (`components_v0/hero-section.tsx:17`, 1.67 s on a fast connection).
- 8 listings total. Two search boxes (header and hero).
- Gradient category tiles with blur blobs; Baterías and Platillos share one drum icon (`components_v0/categories-section.tsx:23-24`); redundant sublabels ("Platillos / Platillos").
- A hard-coded "NUEVO" badge on every card, including listings titled "usado" (`components_v0/featured-listings.tsx:154`).
- "Destacados para ti" is not personalised (`:77`).
- Visible placeholder: "Bloque visual temporal. Laria aun no tiene una seccion real de comunidad o blog." (`components_v0/verified-stores.tsx:109`).
- Two trust strips repeat the same four claims.
- "COMPRAR AHORA" implies checkout, which Laria does not have.

**P5. No typographic system.**
- `font-sans` system stack: Laria looks different on iOS, Android, Windows and Mac.
- `font-black` (900) is the most-used weight (234 uses) vs 137 bold. When everything shouts, nothing leads.
- 70 uppercase strings, many with 0.15–0.26em tracking; `text-[11px]` in 9 places; 14 bespoke shadows.
- Prices at 18 px/900 with proportional figures.

**P6. The listing detail page does not support a confident decision.**
- Gallery ≈40% of desktop width, smaller than the info column; a lone heart floats above (`listing-1280-top.webp`).
- "Visto 0 veces" is public negative social proof (`components/listing-detail-metadata.tsx:70`).
- Two WhatsApp CTAs with different labels ("Preguntar por WhatsApp" `app/instrumentos/[slug]/page.tsx:383`, "Escribir por WhatsApp" `:746`).
- The payments disclaimer appears twice (`:397`, `:762`); "Tienda Verificada" three times.
- "Especificaciones completas" repeats the attribute grid (listing metadata) instead of instrument specs (`listing-1280-lower.webp`).

**P7. Catalog filtering behaves like a form, not a discovery tool.**
- 8 native selects plus "Aplicar filtros"; no value counts; no applied-filter chips.
- Sort lives inside the filter form.
- An alert promo takes the slot above results; a page-intro card with an explanatory paragraph pushes results down.
- Mobile sheet: the apply button is below the fold and shows no result count (`catalog-390-filters.webp`).
- Category attribute filters exist but appear only after picking a type in a select.

**P8. Trust is a stack of disclaimers, not a system.**
- "Laria no procesa pagos…" appears on the listing (2×), store, category landing, legal page, signup and emails.
- Verification is a blue pill on the listing and a green pill on the store.
- The store contact button is WhatsApp green; elsewhere it is yellow.
- The store page shows "Banner pendiente" / "Logo pendiente" to buyers (`app/tiendas/[slug]/page.tsx:205,223`) and heads inventory "Listados aprobados" (moderation jargon).

**P9. Selling is one long form with weak validation (code).**
- Generic top-of-form errors mixed with native browser bubbles; no `aria-invalid` / `aria-describedby` anywhere.
- Photo errors pull focus to the top of the form; no character counter.
- Taxonomy is two dependent selects where the second step is usually "X or Otro". Some attribute options are in English ("Solid body").
- Photo buttons ≈28 px without labels; no upload progress on create.
- Success resets the form and shows a banner. The only uppercase submit in the app. Nine different verbs for "publish" (`components/sell-listing-form.tsx`).

**P10. Signed-in areas lack a shared system (code).**
- Two token systems (legacy brass/ink/slate vs `laria-*`); 9 field implementations; ~15 hand-built page headers; statuses spread over 6 dictionaries.
- "Compras" contains Ventas.
- An 8-column listing table scrolls sideways on phones; destructive actions look like safe ones; `window.confirm` in 5 places.
- Admin: photos only as "open photo" links, raw UUIDs and slugs, identical approve/reject buttons, one-click verify/revoke, duplicated queue/section IA, audit times in server timezone.

**P11. Copy undermines credibility.**
- Missing tildes and ¿ on public pages: musicos, pequenas, Baterias, Microfonos, "Que instrumento estas buscando?", CATEGORIA, acusticas, percusion, grabacion, Contrasena, Minimo.
- 16 concepts carry two or more names; e.g. publicación, listado, aviso, producto, artículo and registro all mean one listing.
- System jargon reaches users: V1, legacy, Store Owner, CTR, metadata, "base de datos", "doble ciego", "historial inmutable".

**P12. States, and some brand touchpoints, are not designed.**
- Only `app/listados/loading.tsx` exists; no `error.tsx`.
- Query errors render as false empty states ("Aún no tienes publicaciones").
- Favicon `app/icon.svg` is a generic slate guitar icon, not the brand.
- Email templates use #ffd43b yellow and #175cd3 blue.
- The logo file's yellow is #E3DC22, while the UI yellow is #F1EA16.

## Accessibility snapshot

- Contrast: see P3. Dark-surface pairs pass: blue on black 8.23:1, #9DA3AF on black 8.00:1, yellow on black 15.95:1.
- No skip link. Nested `<main>` in Admin (`app/admin/layout.tsx:16` inside the root `<main>`). No `aria-invalid` or `aria-describedby` anywhere; `window.confirm` in 5 places.
- Good: alt text on all catalog images, named buttons and links, disclosure pattern in the category menu.

## Performance note

- Mobile home: LCP 1.67 s on a fast connection; the LCP element is the decorative hero photo requested at w=2400. CLS 0.
- No custom fonts today. UX-1 adds one variable font (≈87 KB latin).

## Product-behavior observations (owner decisions, not UX-only)

- Relisting appends `-republicado-<hash>` to the slug on every relist. One live URL carries four suffixes.
- The condition scale has three grades (Nuevo / Usado - buen estado / Usado - con detalles). A richer, gear-specific scale would be a product change.
- The public view counter ("Visto N veces") is shown from zero.

## Screenshot index

`home-390-fold.webp`, `home-390-categories.webp`, `home-390-cards.webp`, `home-1280-top.webp`, `home-1280-full.webp` (Sprint 8 build), `catalog-390.webp`, `catalog-390-filters.webp`, `catalog-768.webp`, `catalog-1280.webp`, `listing-390.webp`, `listing-1280-top.webp`, `listing-1280-lower.webp`, `store-1280.webp`, `login-390.webp`. The 1280 captures are downscaled to 0.625; the 390 captures are 2×.
