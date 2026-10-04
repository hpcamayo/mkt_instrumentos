# Laria UX redesign — workspace

Durable memory for the UX/web-design engagement. Chat history is not memory; this folder is.
Read this file first, then only the file your task needs. **External reviewers: start at `review-guide.md`.**

## Status (2026-10-02)

| Sub-sprint | Name | State |
| --- | --- | --- |
| UX-0 | Investigation and plan | Done |
| UX-1 | Foundations: visual + content language, primitives, a11y baseline | **Accepted** (owner, 30 Sep): implemented on branch `ux/redesign` (9 Cowork commits + audit commits, not pushed); audited and corrected 30 Sep; evidence in `ux-1-acceptance.md` |
| UX-2 | Shell and navigation | **Ready for owner acceptance** (1 Oct): brief `ux-2-shell.md` (approved 30 Sep) implemented on `ux/redesign` (not pushed) and audited; evidence and the deviations to decide (N9–N12) in `ux-2-acceptance.md`; re-verified 2 Oct on a clean local stack for the external review (`review-guide.md`) |
| UX-3 | Discovery: home, catalog, category landings, cards, filters | Not started. Home decided: canvas page "Inicio · versión final", banner set in `art/rotation/` |
| UX-4 | Listing and store pages | Not started |
| UX-5 | Selling: create, edit, revise | Not started |
| UX-6 | Accounts: onboarding, Particular, Store Owner | Not started |
| UX-7 | Admin workbench | Not started |
| UX-8 | Coherence and hardening | Not started |

Repo: Sprint 9 is closed (owner, 30 Sep); its final head is `main` at `49a38e5`, which was `origin/main` when the branch was cut (`origin/main` has since gained one docs-only commit, `f04e909`). The repo's sprint docs don't record the closure yet: SEO-006, SEO-007, LEGAL-005 and LEGAL-006 still show Not Run in `acceptance/cases.tsv`. UX work lives on `ux/redesign`, branched from `49a38e5`. In the owner's repository it is a local branch checked out in the worktree `../mkt_instrumentos-ux` (imported from the Cowork bundle on 30 Sep), so the catalog work in the main checkout is never touched. Nothing is pushed or merged without the owner's go-ahead.

Every sub-sprint has two owner gates: approval before implementation, acceptance after.
Never start the next sub-sprint without explicit owner acceptance of the previous one.

## Files

| File | Use it for |
| --- | --- |
| `audit.md` | Evidence: what is wrong today, ranked, with screenshots and file:line references |
| `principles.md` | The 11 design principles every decision is checked against |
| `references.md` | What Laria learns from Reverb, Discogs, Sweetwater, Thomann, Mercado Libre, classifieds, Chrono24; evidence base |
| `roadmap.md` | Sub-sprint sequence, dependencies, owner decisions, parallel-work rules, product-behavior flags |
| `ux-1-foundations.md` | UX-1 approval package and the proposed foundation spec |
| `ux-1-acceptance.md` | UX-1 acceptance package: commits, criteria with evidence, performance, changed labels, open items |
| `ux-2-shell.md` | UX-2 brief (approved 30 Sep): header, category strip, account menu, breadcrumbs, page frames, footers, 404/500, decisions N1–N5 and G1, acceptance criteria |
| `review-guide.md` | For an independent external review: scope and commit ranges, reading order, local setup (Supabase, test accounts), checks, how to reproduce every piece of evidence, traceability from the brief to code and tests, decided vs open, risk areas, report format |
| `ux-2-acceptance.md` | UX-2 acceptance package: commits, criteria with evidence, measurements, layout shift, deviations for the owner, spec and acceptance rows affected, changed tests |
| `home-visual-audit.md` | Graphic-design review of the decided home (30 Sep): the numbered items each sub-sprint applies (table "By sub-sprint") and the owner questions still open |
| `decisions.md` | Decision log (pending and decided). Update it whenever the owner decides |
| `screenshots/baseline-2026-09-27/` | Live-site baseline captured during the audit |
| `screenshots/page-concepts/` | Renders of the page-concept canvas (direction only) |
| `screenshots/home-options/` | Renders of the four homepage first-screen options (A–D) |
| `screenshots/home-b/` | Renders of option B developed and its three headline options |
| `screenshots/home-banner/` | Renders of the small-banner treatments and the full page |
| `screenshots/home-arte/` | Renders of the illustrated banners and the full page |
| `screenshots/home-arte-libre/` | Renders of the nine art styles (round 3) |
| `screenshots/home-arte-color/` | Renders of the off-palette batch (round 4) |
| `screenshots/home-arte-sentido/` | Renders of the eight pieces that encode something (round 5) |
| `screenshots/home-arte-final/` | Renders of the last batch (round 6) |
| `screenshots/home-arte-maximal/` | Renders of the maximalist batch (round 7) |
| `screenshots/home-arte-fiesta/` | Renders of the fiesta batch (round 8) |
| `screenshots/home-arte-ocho/` | Renders of the final eight (round 9) |
| `screenshots/home-arte-diablada/` | Renders of the instruments in Diablada style (round 10) |
| `art/rotation/` | The decided home banner set (9 pieces, WebP/JPEG at 1x and 2x, manifest, rules) |
| `screenshots/home-decisiones-h/` | The options for home decisions H6, H2, H3, H4 and the H4 promise table (decided 30 Sep) |
| `screenshots/home-final/` | The home with every decision applied (1440, 390) and the nine rotation banners: the reference for UX-3 |
| `screenshots/ux1-before/` | Harness captures of the product before UX-1 (selected frames) |
| `screenshots/ux1-after/` | The same frames after UX-1 (same file names; taken before the 30 Sep audit fixes) |
| `screenshots/ux2-before/` | Harness captures before UX-2 (selected frames, `<width>-<group>-<route>.webp`) |
| `screenshots/ux2-after/` | The same frames after UX-2, plus the new 500 page |
| `screenshots/ux1-audit/` | Concept vs build, side by side (16 pairs) after the audit fixes; `index.html` lists the layout differences per pair |
| `../../scripts/ux-snapshots.cjs` | The screenshot harness (D10): fixed route list at 390 / 768 / 1280 / 1440, anonymous and signed in (each signed-in group also on the catalog); output in the gitignored `.ux-snapshots/` |
| `../../scripts/ux-local-accounts.cjs` | Creates the local Particular, Store Owner (with a store) and Admin test accounts; local Supabase only; writes the gitignored `.ux-accounts.local.json` |
| `../../scripts/ux-audit.cjs` | Accessibility and shell audit: axe-core WCAG 2.1 A/AA, focus sweep, skip link, shell Tab order, one `<main>`/`<h1>`, public/Admin frame, strip sideways access and destination at 390 / 768, overflow and 200% zoom, menus open, layout shift; output `.ux-snapshots/<label>/audit.json` |
| `art/` | Original banner art: SVG (round 2), raster generators and images (`wild/`, `round5/` … `round10/`) |

In the repo, `screenshots/` keeps only the baseline, the page and UX-1 concepts, the final home and the harness captures (UX-1, UX-2), as WebP. The banner explorations (rounds 1–10 and their renders) stay on the Laria Page Concepts canvas; `art/rotation/src/` keeps the generators of the nine decided pieces.

Visual workspaces (private claude.ai artifacts, owner account; exploratory, not specs):
- **Laria Redesign** canvas: pages "UX-1 Fundamentos" (type, color, components, scale, language) and "Línea base 27-09" (annotated live-site captures).
- **Laria Page Concepts** canvas: home, catalog + filter sheet, listing detail, store, Mis publicaciones, Publicar and Admin moderation at 1440 and 390, applying principles P1–P11 and recommendations D1–D12. Example data only; each page is still decided in its own sub-sprint (UX-2 to UX-7). Page "Inicio · opciones": four first-screen directions for the home (A Buscador, B Vitrina, C Afiche, D Dos puertas), owner decision H1–H6 in `decisions.md`. Page "Inicio · B": option B developed as a full page (1440 and 390) plus three headline options; references in `references.md` § Homepage first screen. Page "Inicio · banner": a small intro banner (Foto, Duotono, Recortes) with search and "Explorar" above a vitrina row, plus the full page with the Foto banner. Page "Inicio · arte": three original full-width illustrations (Escenario, Mástil, Cable) integrating the headline and search, and the full page with Escenario (H7). Page "Inicio · arte libre": nine art styles (Neón, Grabado, Glitch, Pixel, Luz, Spray, La señal, Cordillera, Collage) with centred text and search, and the full page with Neón (H7, H9). Page "Inicio · arte sin paleta": eight off-palette styles plus Glitch and Grabado as full pages (H7, H10). Page "Inicio · arte con significado": eight pieces that each encode something (a charango-shaped dark cloud in the Milky Way, a melody written in khipu notation, the Amazon dawn chorus as a spectrogram, a charango geoglyph, a Rubens' tube, ferrofluid, a cyanotype, Xenakis-style glissandi) (H7). Page "Inicio · arte, última tanda": the last batch (a pututu's sound simulated in Chavín-style galleries, vessels turned from waveforms, tonewoods under a polarising microscope, Candelaria sequins encoding a siku melody, an X-ray of a guitar and a pedal, tuning beats, a marinera long exposure, the Shepard scale) (H7). Page "Inicio · arte maximalista": a maximalist batch (a chicha sign naming the real categories, a flea-market blanket with price tags, an Ayacucho-style retablo of musicians, a sticker-covered guitar case, Colca-style embroidery, a gilded Cusco-style mirror, a patched modular synth, a jungle where instruments grow) (H7). Page "Inicio · arte fiesta": eight treatments of the owner's street-band reference (a brass band and the dancing town): collage, night fireworks, risograph yunza, linocut sikuris, arpillera, Sarhua board, engraved gourd and a drone view of the plaza (H7). Page "Inicio · la fiesta en ocho momentos": the final eight, one fiesta in eight moments with no motif shared between pieces: the band's truck (naive painting), Cajamarca clarines (gouache), the pasacalle's shadow on an adobe wall, the dancing crowd (watercolour), Candelaria devil masks (3D), hats in the air (3D), the fiesta reflected in a sousaphone bell (ray-traced brass) and the morning after (oil-painted still life) (H7). Page "Inicio · instrumentos Diablada": Diablada's style (owner: 10/10, into the rotation) applied to eight pairs of instruments facing each other across the headline: trumpet and tuba, bombo and cymbals, trombone and sax, snare and clarinets, waqrapuku and tinya, siku and quena, charango and cajón, electric guitar and amp (H7, H11). Decided 30 Sep: the home banner rotates one piece per visit among Diablada and these eight (`art/rotation/`). Page "Inicio · decisiones": the options for H6 (headline), H2 (vitrina: automatic vs Admin-picked, with the Admin control B would need), H3 (price tag: yellow, ink, in the caption) and H4 (each promise checked against the functional spec); decided 30 Sep: headline 1, automatic vitrina, ink tags, promises without the email notice. Page "Inicio · versión final": the home with every decision applied (1440 and 390) and the nine rotation banners; "Recién publicados" skips the listings already in the vitrina. Art sources: `art/` (rounds 5–10 in `art/round5/` … `art/round10/`).

## How the harness captures were made

`screenshots/ux1-before/` and `screenshots/ux1-after/` come from `scripts/ux-snapshots.cjs` run on production builds of `main` at `49a38e5` and of `ux/redesign`, against a local Postgres 16 with the repo migrations, `supabase/seed.sql` and extra UX data (a Particular, a Store Owner and an Admin account, listings with photos), served through a local stand-in for the Supabase REST, Auth and Storage APIs. No hosted data is involved. Two differences from a Mac: before UX-1 the text used the Linux fallback font (the site had no web font; after UX-1 it is Archivo everywhere), and the home hero photo (Unsplash) does not load offline.

### UX-2 evidence

`screenshots/ux2-before/` and `ux2-after/` come from `scripts/ux-snapshots.cjs` run on production builds (`next start`) of `645d51e` (before the UX-2 code) and of the UX-2 code, on the owner's Mac, against a local Supabase stack, signed out and as a local Particular, Store Owner and Admin. That database also carried 17 later migrations from the catalog branch, which UX-2 does not read; on 2 Oct the build was re-checked on a clean stack built only from this branch's migrations and seed, with accounts from `scripts/ux-local-accounts.cjs` (`review-guide.md` § 6.4). The accessibility numbers and layout shift come from the checks now in `scripts/ux-audit.cjs`. On 3 Oct, the external-review fixes passed a new isolated production-build audit (28 routes, zero frame or strip failures); see `ux-2-acceptance.md` § External-review fixes.

## Working rules for any session

- Palette, logo, name and positioning are immutable. Usage of the palette is not.
- Do not change product rules (lifecycle, moderation, verification, reviews, favorites, alerts, authority, RLS, seller contact). If a UX idea needs a rule change, log it in `decisions.md` as an owner question.
- `docs/functional-spec.md` stays canonical for behavior. `docs/design-system.md` (rewritten in UX-1) is canonical for visuals.
- Git in the Cowork device shell: never run plain `git status` (it leaves `.git/index.lock` because the sandbox cannot unlink). Use `GIT_OPTIONAL_LOCKS=0 git --no-optional-locks …` for reads.
- Tests pin navigation labels and copy (`tests/*.test.cjs`, `acceptance/cases.tsv`). Terminology changes update those deliberately; never weaken an assertion.
- Run targeted tests per change; the full suite once per integration point. Keep output summaries short.
- Use a fresh session per sub-sprint. Before ending a session, update this README's status table and `decisions.md`.
