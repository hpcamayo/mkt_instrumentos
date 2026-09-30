# Home banner rotation (decided 30 Sep 2026)

Owner decisions H7 and H11 in `../../decisions.md`: the home banner shows one of these nine pieces per visit.
Everything here is ready for UX-3 (Discovery: home). Nothing is implemented yet.

## The set

| # | id | Title | Phone background |
| --- | --- | --- | --- |
| 01 | diablada | Diablada | #0B0A1C |
| 02 | trompeta-tuba | Trompeta y tuba | #170A1C |
| 03 | bombo-platillos | Bombo y platillos | #1E0710 |
| 04 | trombon-saxo | Trombón y saxo | #06191A |
| 05 | tarola-clarinetes | Tarola y clarinetes | #070B1F |
| 06 | waqrapuku-tinya | Waqrapuku y tinya | #130A24 |
| 07 | siku-quena | Siku y quena | #06170D |
| 08 | charango-cajon | Charango y cajón | #1E0C06 |
| 09 | guitarra-amplificador | Guitarra y amplificador | #100A26 |

`manifest.json` lists the same data with file names. `rotation-sheet.jpg` shows all nine (desktop and phone strip).

## Rules

- One banner per visit, picked at random when the page loads. No carousel, no auto-advance, no motion.
- Pick it where the page is rendered (server side), so the chosen image is in the first HTML: no flash of a different banner, and only that one image loads. Preload that image; never load the other eight.
- P11 says no decorative image should be the LCP; the owner-approved art banner (H7, H9) is the exception, so keep it fast: the chosen image is preloaded, 1x WebP ~32 KB and 2x ~95 KB, fixed 300 px height (no layout shift).
- The images are decorative: `alt=""`. The headline and search carry the meaning.
- Text is the same for all nine: headline #FFFFFF; lead #C8CDD6 on desktop and #D5D9E2 on phone; search box as specified in the page concept. No per-banner colour switching.
- Desktop: the art fills the 1440×300 banner behind the centred headline and search (`object-fit: cover`, centred). The centre of every piece is kept dark and calm for the text.
- Phone: a 390×150 art strip above the text block; the text block uses the banner's phone background colour.

## Files

Each banner comes as `NN-id-desktop.webp` (1440×300), `NN-id-desktop@2x.webp` (2880×600), `NN-id-phone.webp` (390×150), `NN-id-phone@2x.webp` (780×300), plus JPEG fallbacks at 2x.
Average weight: desktop@2x WebP ~95 KB, desktop 1x WebP ~32 KB, phone@2x WebP ~29 KB.

Sources: `../round9/diablada.py` and `../round10/` (all generated in code; no photos, no image-generation models).
