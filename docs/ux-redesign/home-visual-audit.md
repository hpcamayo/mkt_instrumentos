# Home visual audit — "Inicio · versión final"

A graphic-design review of the decided home: proportions, symmetry, color, type and white space (30 Sep 2026). Each sub-sprint applies its items, listed below. The UX-2 items were approved with UX-2 on 30 Sep. The other items are confirmed at the approval gate of their sub-sprint and reach Claude Code through that sub-sprint's brief.

Source: the Laria Page Concepts canvas, page "Inicio · versión final" (boards R-Inicio-1440, R-Inicio-390, R-Rotacion), rendered with Archivo and measured in the browser. The redline sheet (`inicio-final-redlines.jpg`, same numbers as this list) and the logo-size sheet (`inicio-logo-sizes.png`) were delivered in the Cowork chat on 30 Sep.

Verdict: the structure holds. The issues are calibration (sizes and gaps off the design system), one near-collision (headline and banner art) and card prices that don't line up.

## By sub-sprint

| Sub-sprint | Items | What it applies |
| --- | --- | --- |
| UX-2 Shell and navigation (approved 30 Sep) | 1, 1b, 5, 10, 14, 17 | Header logo 36 / 32 px, footer logo 28 / 24 px; hairline removed from the logo file; "Vender" as the outline button on dark; header ends on the gutter; text-wrap rule; one search placeholder |
| UX-3 Discovery | 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 15, 16, 17 | Banner headline 40/44 with the art centred; the one listing card (two title lines reserved, title 600, price 750, radius 8, gutters 20 / 12); "Explorar" 52 px in a 64 px search; section spacing; eight type sizes; grey sell block; white monograms; verified mark 18 px; phone banner band (item 13, owner question); vitrina "Ver todo"; one catalogue link per section; the same placeholder in the banner |
| UX-4 Listing and store | 3, 4, 11, 12 | Related listings and store grids use the UX-3 card; store monograms stay white; the verified mark matches the size of the line icons beside it |
| UX-5 Selling | 6, 14 | Buttons 36 / 44 / 52 px only; text-wrap on help text |
| UX-6 Accounts | 3, 4, 7 | Favoritos and inventory grids use the one card; the section spacing tokens |
| UX-7 Admin | 6 | Buttons 36 / 44 / 52 px only |
| UX-8 Coherence | all | Product-wide sweep: type scale, spacing, button sizes, card rules, logo sizes, text-wrap |

## UX-2 · Shell and navigation (approved 30 Sep)

- **1 · Logo too small.** Desktop 57×30 px: its "L" is 12.5 px tall against the menu's 10.5 px capitals, and the Vender button beside it has 3.7× its yellow area. Phone 49×26 px beside a 71×36 px button. → 36 px tall on desktop, 32 px on the phone (about 56% of the 64 / 56 px bars). The footer stays 28 / 24 px, now a clear step down instead of a near miss.
- **1b · Hairline in the logo file.** A stray 1-unit stroked path from the vector export (the first `<path>` in `app/logo-clear.svg`, same in the canvas copy) draws a faint vertical line left of the "L" in header and footer. → Decided 30 Sep (N2): remove that path; the mark does not change.
- **5 · Two yellow buttons in the first screen.** Header "Vender" and "Explorar" sit about 180 px apart, against the rule of one yellow action per view; on listing pages Vender would sit beside the yellow WhatsApp button. → Decided 30 Sep (N1): "Vender" becomes the outline button on dark (white text, #4B5563 border).
- **10 · Header margins.** The logo sits on the 32 px gutter; "Ingresar" ends 42 px from the right edge because of its link padding. → pull the last item's padding out so both ends sit on the gutter.
- **14 · Widows.** Phone: "…de todo el / país.", "…confirmaron en / Laria."; desktop: "…de una tienda / verificada." → global rule: `text-wrap: balance` on headings and leads, `text-wrap: pretty` on paragraphs.
- **17 · Two search placeholders.** Desktop "Busca marca, modelo o instrumento", phone "Instrumento, marca o modelo". → "Marca, modelo o instrumento" in the header search (UX-2) and the banner (UX-3). *Superseded 30 Sep by decision N8 (`decisions.md`): the search matches the brand only, so the one placeholder is "Busca por marca: Yamaha, Fender…", in the header (UX-2) and the banner (UX-3).*

## UX-3 · Discovery (home)

- **2 · Headline crowds the banner art.** At 46 px the headline is 698 px wide: about 33 px from the left mask and about 15 px from the right mask's tentacle. → 40/44 (`t-display`): about 78 and 60 px of air, and the 640 px search becomes the widest element. Build note: the board anchors the art `right center`; rendered at 1280 the right mask runs into "Perú", at 1024 it sits under "del Perú". Use `object-fit: cover; object-position: center`.
- **3 · Card prices don't line up.** A two-line title drops the price 19 px, so the price row zigzags. → reserve two title lines (min-height 38 px). Title (15 px, 700) and price (18 px, 750) are both bold semi-condensed and compete → title 600, price stays 750.
- **4 · Two card designs at nearly the same size.** Vitrina tiles 262 px, 16 px gaps, 8 px radius; "Recién publicados" cards 259 px, 20 px gaps, 6 px radius; the columns drift up to 3 px between the rows. → one gutter per breakpoint (20 desktop, 12 phone) and one card radius (8). Optional: a denser feed (6 per row, about 213 px) so the vitrina and the feed have clearly different roles. **Owner question** (changes the approved layout).
- **6 · "Explorar" is 48 px**, not on the button scale (36 / 44 / 52). → 52 inside a 64 px search (same 6 px inset), so "Explorar" and "Vender mi equipo" share one size.
- **7 · Section spacing has no rhythm.** Desktop 30 / 36 / 40 / 56 / 56 / 48 / 56 px; phone 18 / 44 / 28 / 32 / 32 / 28 / 32 px. → desktop 32 under the banner, then 48; phone 24, then 32.
- **8 · Twelve type sizes on the desktop page** (46, 30, 22, 20, 18, 17, 16, 15, 14, 13, 12, 11); five are off the scale. → 46 to 40 (item 2); "Cómo funciona" title 30 to 20 like the other section titles (22 to 20 on the phone); "262 publicaciones" 22 to 20; guarantee titles 17 to 16; 11 px labels ("GUITARRAS", "5 fotos") to 12. That leaves 8 sizes.
- **9 · Sell block.** About 740 px of empty white between the copy and the button, in a box with a barely visible border; the weakest of the three call-out boxes. → the grey `canvas` fill without border, like "Cómo funciona" and "¿Tienes una tienda?".
- **11 · Store monograms.** The concept's yellow initials look like small Laria logos and add yellow that is not an action. The build already uses white (`components_v0/verified-stores.tsx`). → keep white.
- **12 · Verified mark in "Cómo funciona".** A filled 22 px disc beside line icons that draw at about 18 px; it is the heaviest of the four. → draw it at 18 px.
- **13 · Phone banner band.** The text sits on #0B0A1C (not the frame black), and the art ends in a hard cut through the masks' teeth. The other eight phone pieces end on maroon, teal or indigo grounds, so one fixed band color seams on most of them. → frame black #050608 behind the text on all nine, plus a fade of about 40 px to it at the bottom of each phone file. **Owner question** (art files).
- **15 · Vitrina "Ver todo" on the phone** sits on the subtitle line, 14 px after it; the other section headers align the link with the title. → align it with the title.
- **16 · The catalogue link three times.** Desktop: "Ver las 262 publicaciones" in two section headers plus the end tile; phone: two "Ver todo" plus the button. → drop the link from the "Recién publicados" header.

## Keep (already right)

- The banner text is centred on the page axis and sits 13 px above the banner's middle, the right optical lift.
- Header items share one centre line.
- Below the banner the interface stays neutral and the color comes from the product photos; blue only for links and the verified mark; the ink price tags do not compete with the yellow.
- Card overlays (heart, photo count, price tag) share one inset of about 9 px.

## Owner questions

| Item | Question | Status |
| --- | --- | --- |
| 1b | Remove the stray hairline path from the logo file | Decided 30 Sep: remove (N2) |
| 5 | Header "Vender" as an outline button | Decided 30 Sep: outline (N1) |
| 4 | Denser "Recién publicados" feed (6 per row) | Open, UX-3 gate |
| 13 | Fade the bottom of the nine phone banners into the frame black | Open, UX-3 gate |

## Design-system changes

Approved with UX-2 (30 Sep):
- Header logo 36 / 32 px; footer logo 28 / 24 px.
- Header "Vender" uses the outline button on dark.
- `text-wrap: balance` for headings and leads, `pretty` for paragraphs.

To confirm at the UX-3 gate:
- `t-card-title` weight 700 to 600; prices stay 750.
- Button heights stay 36 / 44 / 52 (no 48).
- One card gutter per breakpoint (20 / 12) and one card radius (8).
- Section spacing: 32 under a banner, then 48 on desktop; 24, then 32 on the phone.
- Store monograms: white initials on the frame.
