# Laria design principles

Check every proposal against these. Evidence class in brackets: [research] usability studies or measurement, [standard] WCAG or platform rule, [convention] common practice, [taste] aesthetic judgement. Sources are in `references.md`.

1. **Gear owns the first screen.**
   - On every public page, search, category entry points and listings come before anything promotional.
   - A marketing sentence can accompany inventory; it cannot replace it.
   - Why: attention concentrates on the first screen (57% of viewing time above the fold) [research]. Buyers arrive to compare gear, not to read slogans.

2. **One reading order for every listing: identity → price → condition → place → seller.**
   - The same order on cards, rows and the detail page, so buyers learn it once.
   - Brand and model lead the identity when known. Nothing (pills, carousels) sits between the title and the price.
   - Why: consistent list-item attributes drive comparison; 64% of sites fail at it [research].

3. **Specialist vocabulary is content.**
   - Show category-aware specs where they decide a purchase: pickups and body on guitars, pieces and kick size on drums, polar pattern on microphones.
   - This covers the card (one line at most), filters, and a grouped spec table on the detail page.
   - Why: category-specific filters and scannable spec sheets are research-backed [research]. Musicians judge competence by the vocabulary [taste].

4. **Trust is structural, stated once and verifiable.**
   - Verification, confirmed sales, time on Laria and reviews with counts come from real data, and each explains itself on tap.
   - "Laria no procesa pagos" appears once, at the moment of contact.
   - No placeholder ever reaches a buyer. Omission beats a fake or pending state.
   - Why: badges work when checkable [research]; repeated disclaimers read as anxiety [taste].

5. **The palette works by role.**
   - Black frames (header, footer, Admin chrome). Yellow acts (one primary action per view, and the logo). Blue indicates (selection, verification, underline accents; text only on black).
   - Ink and neutrals carry content. Every text pair reaches 4.5:1 and every control boundary 3:1 [standard].

6. **Type makes the hierarchy; decoration does not.**
   - One variable family, three weights, a fixed scale. Semi-condensed width for model names and prices, normal width for reading.
   - Uppercase only for labels of three words or fewer. Tabular figures wherever prices align.
   - No slogans or giant headlines in product UI [taste, grounded in readability research].

7. **Density is a feature when it is aligned.**
   - 2 columns on phones, 3 on tablets, 4 beside filters on desktop. Rows for data-heavy tools (seller inventory, Admin, later model pages).
   - Whitespace separates groups; it does not pad single items.
   - Why: comparison needs several items in view [research]; column counts are [convention].

8. **Design at 390 px first; every breakpoint has a job.**
   - Phones get a compact header with visible search, sheets for filters with live result counts, and a slim sticky contact bar on listings.
   - Tablets get their own layout, not a stretched phone. Tables become lists on phones.
   - Why: Peru browses on phones; 91% of internet users go online by mobile (INEI) [research].

9. **One component, one meaning, one name.**
   - One card, one button set, one status dictionary, one notice, one field.
   - A concept has one Spanish name everywhere: publicación, Particular, Tienda, Condición, Contactar por WhatsApp.
   - Why: consistency lowers learning cost [convention with strong support].

10. **Plain, correct Peruvian Spanish.**
    - Tildes and ¿¡ always. Tú, short sentences, no exclamation marks, no system jargon.
    - Specialist terms welcome (pastillas, cuerpo sólido, shell pack, interfaz de audio). Formats: S/ 1,200 · 27 set. 2026 · Miraflores, Lima.

11. **Speed is part of the design.**
    - SSR first. Reserve image space (no CLS). One self-hosted variable font. No decorative image or video as the LCP. Motion only for state changes (120–200 ms, none under reduced motion).
    - Targets: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75 [standard].
