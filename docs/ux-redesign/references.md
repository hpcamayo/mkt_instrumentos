# References and evidence base

Learn the reason a pattern works; never copy the pattern wholesale. "[verified]" = read from the source during the audit; "[gk]" = well-established knowledge, spot-check before quoting.

## Marketplaces

| Reference | Learn | Avoid |
| --- | --- | --- |
| **Reverb** | Condition grades ordered by function first, each with gear examples; "Brand New" and "B-Stock" limited to authorized dealers [verified: help.reverb.com/hc/en-us/articles/360013525833]. Card order: photo → title (brand, model, year, finish) → condition → price, with struck-through old price after a drop [gk]. Model pages that gather all listings of one model [gk]. | Make an Offer, shipping lines, buyer protection, behavior badges Laria cannot measure. |
| **Discogs** | Canonical identity (Master → Release) separate from listings; dense comparison rows where only condition, seller trust, location and price vary [gk]. Direct model for the future instrument database and model pages. | A community-edited database at launch. |
| **Sweetwater** | Fixed spec keys per category driving filters, cards and comparisons [gk]; photos of the actual unit for used gear [gk]; Gear Exchange autofills specs from a product finder and reviews each new user's first listing [verified: sweetwater.com/used/how-it-works]. | Platform-backed warranties and inspections. |
| **Thomann** | Image tiles at category entry; 3–5 key specs visible in list rows [gk]; B-Stock defined operationally (returned or demo, fully functional, cosmetic traces) [verified: thomannmusic.com FAQ]. | A deep category tree for a small inventory. |
| **Mercado Libre Perú** | What Peruvian buyers are trained on: full-screen "Filtrar" panel, removable applied chips, separate sort, seller reputation in plain language [gk]. | "Envío gratis", "FULL", cuotas, "Compra protegida", the color thermometer — buyers read them as ML guarantees. |
| **Classifieds** (Facebook Marketplace, Wallapop, Kleinanzeigen, OLX, Neoauto/Urbania) | Location first on every card; private vs professional seller shown up front; pre-filled first message; "member since"; safety tips at the moment of contact [gk]. | Chat-only contact or lead forms before contact (against the WhatsApp habit). Paid tiers that look like verification. |
| **Chrono24** | Public, checkable criteria behind the dealer badge [verified: update.chrono24.com/trusted-seller-badge]; reference numbers as model identity; structured "scope of delivery" [gk]. | Escrow checkout; EU compliance criteria (use RUC/SUNAT equivalents). |
| **Vinted** | Photo-first mobile listing flow, finishable in minutes [gk]. | — |

Cross-cutting lessons: model identity before listings; condition = grade + what is included; badge only what Laria can see; honest price signals (a real price drop is the one deal signal Laria can back); density by context; seller type everywhere; design the WhatsApp handoff (pre-filled message, safety note, report link, later confirmation).

## Peru / LatAm context

- Osiptel ERESTEL 2025 (reported June 2026): 68.6% use messaging platforms; 98.6% of those use WhatsApp. 62.3% use digital wallets (Yape 96.8% of those). Only 12.4% use online buy/sell services. [verified via larepublica.pe, 2026-06-02]
- DataReportal Digital 2026 Peru: 28.4 M internet users (82.0%); 37.5 M mobile connections (108%); median mobile download 34.7 Mbps. [verified: datareportal.com/reports/digital-2026-peru]
- INEI: 91.3% of internet users aged 6+ go online by mobile phone (headline only). [partially verified]
- StatCounter shows 73% desktop page views for Peru (Aug 2026), which contradicts INEI. It is likely skewed; do not use it to deprioritise mobile.
- Used gear trades today in Facebook Marketplace city hubs and buy/sell groups (channels observed; no usage data).

Implication: design the WhatsApp handoff as a first-class flow and name Yape and Plin in safety guidance. Treat 390 px as the primary canvas. Assume mid-range connections: fast enough for photos, not for decorative heroes.

## Evidence base (UX guidance)

| Topic | Guidance | Class | Source |
| --- | --- | --- | --- |
| Filters | Desktop sidebar unless ≤6–8 filter types; applied chips + "Limpiar todo"; 5–10 category-specific attributes; multi-select with counts | research | baymard.com/blog/horizontal-filtering-sorting-design · /product-listing-page-plp-ux · /ecommerce-filter-ui |
| Mobile filter sheet | Sticky "Ver N resultados"; apply at once; restore scroll on close and Back | research | Baymard (same) |
| Loading lists | "Load more" + crawlable `?page=N` beats infinite scroll for products | research + standard | baymard.com/blog/number-of-items-loaded-by-default · Google Search pagination docs |
| Search | Visible field on mobile; brand/model/number variants (DD-8 = dd8); synonyms (bajo/bass); category queries go to category pages | research | baymard.com/blog/ecommerce-search-query-types · /autocomplete-design |
| Cards | Same attributes on every card; distinct styling per information type; rating count beside stars | research | baymard.com/blog/list-item-design-ecommerce · /user-perception-of-product-ratings |
| Gallery | Thumbnails or "3/9" counter with peek, never dots alone; signal hidden thumbnails | research | baymard.com/blog/truncating-product-gallery-thumbnails |
| Specs | Grouped label/value tables with units; key specs near the top | research | baymard.com/blog/spec-sheet-scannability |
| Sticky CTA | Only after the main CTA scrolls away; one slim row; respect 2.4.11 | convention | vendor data only |
| Navigation | Hidden nav lowers discoverability (NN/g); keep ≤4 top items visible on mobile; mega menus as disclosure buttons | research + standard | nngroup.com/articles/hamburger-menus · /mega-menus-work-well · WAI-ARIA APG disclosure |
| Contrast and focus | 4.5:1 text, 3:1 UI boundaries and focus; focus not obscured by sticky bars | standard | WCAG 2.2: 1.4.3, 1.4.11, 2.4.7, 2.4.11, 2.4.13 |
| Targets | ≥24×24 px (2.5.8); design main controls at 44 px | standard + research | WCAG 2.2 · nngroup.com/articles/touch-target-size |
| Inputs | ≥16 px text so iOS does not zoom; never disable zoom | convention (platform behavior) | css-tricks.com (iOS zoom) |
| Forms | Single column; labels above; no placeholder-as-label; validate format on blur, completeness on submit; error summary linked to fields | research + standard | Baymard inline validation (2024) · GOV.UK validation and error summary |
| Loading | No indicator under 1 s; skeleton for 2–10 s; progress beyond 10 s | research | nngroup.com/articles/skeleton-screens |
| Empty states | Say why it is empty and offer the next step; name the filter to remove | research | nngroup.com/articles/empty-state-interface-design |
| Performance | LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 (p75); LCP image as a server-rendered `<img>` with high priority; reserve space | standard | web.dev/articles/vitals · /optimize-lcp · /optimize-cls |
| Fonts | Self-host WOFF2 via next/font; one family, ≤3 weights or one variable file; metric-matched fallback | research + convention | web.dev/articles/font-best-practices |
| Tables | Sticky header, readable first column, density toggle, bulk actions with clear scope | research | nngroup.com/articles/data-tables |
| Ratings | Distribution bars when >5 ratings; rank by count-aware score; "Compra verificada" | research | baymard.com/blog/user-ratings-distribution-summary |

Weakly supported or context-dependent (do not over-apply): infinite scroll for products; "never use a hamburger"; validate while typing; "sticky CTA always converts"; "skeletons always feel faster".

## Homepage first screen (checked 2026-09-27)

Asked by the owner after choosing option B (Vitrina). Live pages fetched on 27 Sep 2026; wording quoted as found.

| Site | First screen | Headline / claim | Where reassurance sits |
| --- | --- | --- | --- |
| Reverb (reverb.com) | Trending gear, promos | "Explore what's trending this week." Title: "Musical Instruments For Sale - New & Used Music Gear" | Not on the first screen |
| Sweetwater | Promo banner, deep category menu, phone number | "Find Your Next Musical Instrument at Sweetwater" | Header strip (Sales Engineers, support) |
| Chicago Music Exchange | Guitar carousel, no headline | — | Meta and lower page ("straight answers, expertise") |
| Discogs | Best-selling records with prices | Tagline lower: "Millions of Records. Thousands of Shops. All In One App" | Lower on the page |
| Guitar Center Used | Product grid first | "Used Gear" | Meta only |
| Thomann ES | Promo banners | "Bienvenido a Thomann" | Short strip under the hero: "3 años de garantía", "30 días Money-Back", "Envío gratis desde 99 €" |
| Back Market ES | Search with suggested searches, products | "Donde el mundo compra tecnología reacondicionada" / "Tecnología en la que puedes confiar, más barata que nueva…" | Four 2–4 word guarantees under the headline; reviews mid-page |
| Chrono24 | Headline, brands, ratings | "Find your dream watch on the leading marketplace for luxury watches." | Stats near the top; Buyer Protection as its own section lower |
| Vestiaire Collective | Search, promo | "Buy and Sell pre-loved fashion." | Meta: "Expert authentication, trusted by millions" |
| todocoleccion (ES) | Promo carousel, search | "Compra, vende y subasta online antigüedades y objetos de colección" / "Descubre nuestro mercado de…" | Short phrases through the page ("Pago seguro") |
| ReverbChile | Category menu, product grid, no hero | Title: "Marketplace de Instrumentos Musicales y audio" | "Publica fácilmente", "Vende con tranquilidad", Google rating |
| Latin Music (Perú) | Search, WhatsApp number in the header | Title: "Instrumentos Musicales y Audio Profesional" | Benefit cards: "Envíos rápidos a todo el país", "Productos con garantía y originales" |

What Laria takes from it:
- Specialty stores lead with gear; reassurance is either a strip of 2–4 word phrases or its own section lower down. Laria moves its guarantees to "Cómo funciona Laria", after the first listings (Chrono24 pattern).
- Headlines that name the category are short and confident ("the leading marketplace for…", "tu mercado de…", "Donde el mundo compra…").
- Search with suggested queries sits next to the headline (Back Market, Vestiaire).
- Peruvian retail vocabulary is "instrumentos musicales y audio profesional"; WhatsApp is a primary contact channel.
