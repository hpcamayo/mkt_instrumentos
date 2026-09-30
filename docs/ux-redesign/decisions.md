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

## Pending — raised during UX-1 implementation (30 Sep)

| ID | Question | Proposal | Status |
| --- | --- | --- | --- |
| G1 | Name of the catalog page `/listados`: header, footer, breadcrumb and SEO title still say "Listados" | The glossary retires "listado". Proposal: "Instrumentos", which matches the page title "Instrumentos disponibles" and the `/instrumentos/…` URLs. It also changes the SEO title and the breadcrumb structured data, so it moves with the UX-2 navigation work | pending (owner, with UX-2) |
| G2 | Legal pages (Términos, Privacidad, Artículos prohibidos, Consejos de seguridad) keep "anuncios" and the defined term "Tienda Verificada" | Align them with the glossary only after a legal read; UX-1 fixed nothing there | pending (owner or legal) |
| G3 | Password minimum is 6 characters at sign-up and 8 when resetting or changing it | Product rule, so not changed in UX-1. One number everywhere; 8 recommended | pending (owner) |

## Decided — UX-1 foundations (asked 2026-09-27)

Owner, 30 Sep: "the foundations were also all approved except for the homepage, which we closed now with the banners." All twelve are approved as recommended in `ux-1-foundations.md`; the homepage exception is the H series below, now closed.

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
