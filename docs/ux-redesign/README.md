# Laria UX redesign — workspace

Durable memory for the UX/web-design engagement. Chat history is not memory; this folder is.
Read this file first, then only the file your task needs. **External reviewers: start at `review-guide.md`.**

## Status (2026-10-09)

| Sub-sprint | Name | State |
| --- | --- | --- |
| UX-0 | Investigation and plan | Done |
| UX-1 | Foundations: visual + content language, primitives, a11y baseline | **Live in production** (9 Oct; accepted by owner 30 Sep): implemented on branch `ux/redesign` (9 Cowork commits + audit commits); audited and corrected 30 Sep; evidence in `ux-1-acceptance.md` |
| UX-2 | Shell and navigation | **Live in production** (9 Oct; accepted by owner 8 Oct, review page: 22 of 22 checks Correct): brief `ux-2-shell.md` (approved 30 Sep), the hybrid category menus (N12, 3 Oct), the owner's answers N9–N14 (7 Oct); implemented on `ux/redesign`, audited, externally reviewed 3 Oct. Evidence in `ux-2-acceptance.md`. N12 recorded 9 Oct (status Pass; `ux-2-reconciliation.md`) |
| UX-3 | Discovery: home, catalog, category landings, cards, filters | **Live in production** (9 Oct; brief approved by owner 8 Oct): `ux-3-discovery.md`, answers Q1–Q20 in `decisions.md`.<br>• **3a accepted** (owner, 9 Oct; review page https://claude.ai/artifact/NpxKr4FfUSLH65RZooTwdB, 31 of 31 Correct): the stall fix (`5f4bdd1`: 32 of 120 trials stalled before, 0 of 120 after), the one card (`4ddf8cc`), the catalog, filters with F11, chips, sort, numbered pages, the category landings and their states (`6651815`), evidence `58bae38`, and the seed-id fix for events, contacts and views (`4057065`, also needed in production; included in the UX-3 release, owner 9 Oct). Package: `ux-3a-acceptance.md`.<br>• **3b accepted** (owner, 9 Oct; 37 of 37 Correct; P6–P10 as built): the local photo fixture (`eeeb7ad`), the home (`7806053`: the home header with "Categorías", the banner, "En vitrina" with the showcase tile, categories with counts, "Recién publicados", "Cómo funciona Laria", verified stores, the sell block), then evidence and docs. Package: `ux-3b-acceptance.md`; review page https://claude.ai/artifact/EYTr4nHqS4u1GHLZeoaAM1. N12's refreshed texts approved there (option A for PUB-008, PUB-010, PUB-015) and recorded the same day, status Pass.<br>• **Released 9 Oct** with UX-1 and UX-2: Codex's independent audit (`reviews/ux-release-audit.md`), then the owner's push and a read-only production smoke (`../ux-production-release-gate.md`) |
| UX-4 | Listing and store pages | **Built, waiting for the owner's review** (cloud session, 10 Oct; N17): brief `ux-4-listing-store.md` (L1–L21 provisional), build choices U1–U8 in `decisions.md`. React #418 fixed (`0dda0ec`); 4a the listing page and 4b the store page (`ux-4a-acceptance.md`, `ux-4b-acceptance.md`, checklist `ux-4-review-checklist.md`). First load: listing 208 → 146 kB, store 195 → 132 kB. Browser evidence (captures, audit, #418 trials, rows) pending on the Mac. One release after the review (N15) |
| UX-5 | Selling: create, edit, revise | **Built, waiting for the owner's review** (cloud session, 10 Oct; N17): brief `ux-5-selling.md` (S1–S11 provisional, flags no change), build choices U9–U13 in `decisions.md`, acceptance `ux-5-acceptance.md`. Browser walk-through and rows pending on the Mac |
| UX-6 | Accounts | **Built, waiting for the owner's review** (cloud session, 10 Oct; N17): brief `ux-6-accounts.md` (A1–A9 provisional, flags no change), choices U14–U17 in `decisions.md`, acceptance `ux-6-acceptance.md`: in-page confirmations, the inventory as cards on phones, store eyebrows. Onboarding forms not changed (U15). Rows pending on the Mac |
| UX-7 | Admin workbench | **Built, waiting for the owner's review** (cloud session, 10 Oct; N17): brief `ux-7-admin.md` (W1–W9 provisional, F7 not built), choices U18–U19, acceptance `ux-7-acceptance.md`: inline queue photos, distinct approve/reject styles, verify/revoke confirmation, Lima time in the audit, identifiers off title lines. Master-detail layout pending (U18). Rows pending on the Mac |
| UX-8 | Coherence and hardening | **Cloud part done, rest pending on the Mac** (10 Oct; N17): `ux-8-coherence.md` (C1–C5 provisional): Admin buttons on the 36/44/52 scale, one ellipsis in loading labels, coherence tests; device, screen-reader, CWV, baseline and release work listed with commands; the V1 record reconciliation drafted for the owner |

Repo: Sprint 9 is closed (owner, 30 Sep). Its owner/manual acceptance rows remain as recorded in `acceptance/cases.tsv`. The UX work was built on `ux/redesign`, rebased onto the catalog production base `313fb7e` on 9 Oct (N13), then independently audited at `d993f5d`. Henri authorized the release; `main` was fast-forwarded to `50963fb` and Vercel deployed it READY to `laria.audio` on 9 Oct. See [the production release gate](../ux-production-release-gate.md). Earlier commit IDs cited in this workspace are mapped in `commit-ids.md`. The `ux/redesign` branch remains checked out in `../mkt_instrumentos-ux`; the catalog worktree was not changed by this release.

Every sub-sprint has two owner gates: approval before implementation, acceptance after.
Never start the next sub-sprint without explicit owner acceptance of the previous one.

## Files

| File | Use it for |
| --- | --- |
| `audit.md` | Evidence: what is wrong today, ranked, with screenshots and file:line references |
| `principles.md` | The 11 design principles every decision is checked against |
| `references.md` | What Laria learns from Reverb, Discogs, Sweetwater, Thomann, Mercado Libre, classifieds, Chrono24; evidence base |
| `roadmap.md` | Sub-sprint sequence and state; how every sub-sprint runs (gates, evidence, review page, acceptance records); a detailed plan for each of UX-3 to UX-8 (scope with file references, decided inputs, carried-in issues, questions for its brief, product rules not to change, acceptance rows to re-run, tests that pin today's markup); product-behavior flags |
| `ux-1-foundations.md` | UX-1 approval package and the proposed foundation spec |
| `ux-1-acceptance.md` | UX-1 acceptance package: commits, criteria with evidence, performance, changed labels, open items |
| `ux-2-shell.md` | UX-2 brief (approved 30 Sep): header, category strip, account menu, breadcrumbs, page frames, footers, 404/500, decisions N1–N5 and G1, acceptance criteria |
| `reviews/ux-2-external-review.md` | The independent review of UX-2 (3 Oct): findings UX2-R01–R03, fixes and their verification |
| `review-guide.md` | For an independent external review: scope and commit ranges, reading order, local setup (Supabase, test accounts), checks, how to reproduce every piece of evidence, traceability from the brief to code and tests, decided vs open, risk areas, report format |
| `ux-2-acceptance.md` | UX-2 acceptance package: commits, criteria with evidence, measurements, layout shift, deviations for the owner, spec and acceptance rows affected, changed tests, the owner's 7 Oct answers and what they changed |
| `ux-8-coherence.md` | UX-8 (10 Oct, provisional): cloud sweep, the Mac checklist, and the V1 record reconciliation for UX-4–UX-7 |
| `ux-7-admin.md` | UX-7 brief (10 Oct, provisional): questions W1–W9 |
| `ux-7-acceptance.md` | UX-7 acceptance package |
| `ux-6-accounts.md` | UX-6 brief (10 Oct, provisional): questions A1–A9, flags, rules, criteria |
| `ux-6-acceptance.md` | UX-6 acceptance package |
| `ux-5-selling.md` | UX-5 brief (10 Oct, provisional): today's sell and edit forms, questions S1–S11 with the answers taken, flags, product rules, criteria, evidence plan |
| `ux-5-acceptance.md` | UX-5 acceptance package: what was built, criteria and their state, Mac commands, limitations |
| `ux-4-listing-store.md` | UX-4 brief (draft, 9 Oct): today's listing and store pages with file references, the React #418 first task, the 4a/4b split and release, the design per surface, product rules, questions L1–L21, acceptance criteria, evidence plan, tests that change |
| `reviews/ux-release-audit.md` | Codex's independent audit of the UX-1–UX-3 release (9 Oct): method, gates, findings, limits; the model for each later release audit (N15) |
| `ux-3-kickoff.md` | The prompt that starts the UX-3 session: reading order, state, the brief to write, the first investigation, questions, rules, environment, checks |
| `ux-3a-kickoff.md` | The prompt that starts the UX-3a build session (fix, card, catalog, filters, landings, states) |
| `ux-3b-kickoff.md` | The prompt that starts the UX-3b build session (the home) |
| `ux-3b-acceptance.md` | UX-3b acceptance package (the home): commits, criteria with evidence, audit and home checks, banner and LCP, first-load JS, rows re-run (observations), N12 (approved and recorded), deviations and choices P6–P10, changed tests |
| `ux-3a-acceptance.md` | UX-3a acceptance package (accepted 9 Oct): commits, criteria with evidence, transition trials before/after, audit, first-load JS, acceptance rows re-run (observations), deviations and choices for the owner, changed tests |
| `ux-3-discovery.md` | UX-3 brief (approved by the owner 8 Oct, with § Owner answers): the catalog transition stall (bisect, cause, proposed fix, measurements), the 3a/3b split, the design per surface (card, catalog, filters and sheet, chips, sort, pagination, landings, states, home), product rules, questions Q1–Q18, acceptance criteria, evidence plan, tests expected to change |
| `ux-2-reconciliation.md` | N12: the functional-spec clarification and, for PUB-008–PUB-015, what the build was observed to do, the gap, wording options and evidence; refreshed 9 Oct for the shell after 3b and recorded that day (status Pass) |
| `home-visual-audit.md` | Graphic-design review of the decided home (30 Sep): the numbered items each sub-sprint applies (table "By sub-sprint") and the owner questions still open |
| `commit-ids.md` | The redesign's commit IDs before and after the 9 Oct rebase onto `main` (the docs quote the old ones) |
| `decisions.md` | Decision log (pending and decided). Update it whenever the owner decides |
| `overnight-2026-10-10.md` | The night of 9–10 Oct (N17): the owner's rules for the night, what was built per sub-sprint, provisional decisions, what is pending on the Mac with its commands. Start here on return |
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
| `art/rotation/` | The decided home banner set: manifest, rules, rotation sheet and generators; the image files (9 pieces, WebP/JPEG at 1x and 2x) are served from `public/banners/` since 3b |
| `screenshots/home-decisiones-h/` | The options for home decisions H6, H2, H3, H4 and the H4 promise table (decided 30 Sep) |
| `screenshots/home-final/` | The home with every decision applied (1440, 390) and the nine rotation banners: the reference for UX-3 |
| `screenshots/ux1-before/` | Harness captures of the product before UX-1 (selected frames) |
| `screenshots/ux1-after/` | The same frames after UX-1 (same file names; taken before the 30 Sep audit fixes) |
| `screenshots/ux2-before/` | Harness captures before UX-2 (selected frames, `<width>-<group>-<route>.webp`) |
| `screenshots/ux2-after/` | The same frames after UX-2, plus the new 500 page; refreshed 7 Oct to the build as amended (hybrid menus, N11, the Admin accordion fix) |
| `screenshots/ux3-before/` | Harness captures before UX-3a (`375a213`): catalog, filtered and multi-value catalog, no results, the old filter sheet, landings, store page (`<width>-<group>-<route>.webp`) |
| `screenshots/ux3b-before/`, `screenshots/ux3b-after/` | Harness captures of the home before 3b (`d08a135`) and after (`7806053`) at 390 / 768 / 1280 / 1440, signed out and as the Particular; after also with the home's "Categorías" menu open (`<width>-<group>-<route>.webp`) |
| `screenshots/ux3-after/` | The same frames after UX-3a, plus the sort menu and sheet, the location row of the filter sheet, the pending state, pagination (a scratch build with 2 per page) and the error and empty states (a scratch build that forces them) |
| `screenshots/ux1-audit/` | Concept vs build, side by side (16 pairs) after the audit fixes; `index.html` lists the layout differences per pair |
| `../../scripts/ux-snapshots.cjs` | The screenshot harness (D10): fixed route list at 390 / 768 / 1280 / 1440, anonymous and signed in (each signed-in group also on the catalog); output in the gitignored `.ux-snapshots/` |
| `../../scripts/ux-local-accounts.cjs` | Creates the local Particular, Store Owner (with a store) and Admin test accounts; local Supabase only; writes the gitignored `.ux-accounts.local.json` |
| `../../scripts/ux-pub-rerun.cjs` | Re-runs PUB-008 to PUB-015 on a local build following each row's steps (since 3b: the home header and its "Categorías" panel, the banner search, applied chips instead of the old filter selects; 1440 / 768 / 390, all four visitors); observations only, never a status; output `.ux-snapshots/<label>/pub-rerun.json` |
| `../../scripts/ux-transition-trials.cjs` | The catalog transition trials (UX-3 brief appendix): fresh-session `window.next.router.push` trials per move, 6 s each, reading `location` and the router's own state; output `.ux-snapshots/<label>/transitions.json` |
| `../../scripts/ux-local-photos.cjs` | Gives ten local seed listings 2 to 5 photos so the home's vitrina has data (local Supabase only; `--remove` undoes it) |
| `../../scripts/ux-home-rerun.cjs` | Re-runs the rows UX-3b touches (PUB-001, PUB-006, SEO-002, AN-001, PUB-009 for the banner search) and recomputes the vitrina and the feed in SQL as the anon role to compare with the page; observations only; output `.ux-snapshots/<label>/rows.json` |
| `../../scripts/ux-discovery-rerun.cjs` | Re-runs the acceptance rows UX-3a touches (PUB, SEO, REL, PHOTO, LIFE, FAV, ALERT, AN) on a local build, observations only; removes the favourite and alert it creates; output `.ux-snapshots/<label>/rows.json` |
| `../../scripts/ux-audit.cjs` | Accessibility and shell audit: axe-core WCAG 2.1 A/AA, focus sweep, skip link, shell Tab order, one `<main>`/`<h1>`, public/Admin frame, strip sideways access and destination at 390 / 768, overflow and 200% zoom, menus open, layout shift; since 3b the home's "Categorías" menu, the banner (one file, fixed height, layout shift) and LCP; output `.ux-snapshots/<label>/audit.json` |
| `art/` | Original banner art: SVG (round 2), raster generators and images (`wild/`, `round5/` … `round10/`) |

In the repo, `screenshots/` keeps only the baseline, the page and UX-1 concepts, the final home and the harness captures (UX-1, UX-2), as WebP. The banner explorations (rounds 1–10 and their renders) stay on the Laria Page Concepts canvas; `art/rotation/src/` keeps the generators of the nine decided pieces.

Visual workspaces (private claude.ai artifacts, owner account; exploratory, not specs):
- **Laria Redesign** canvas: pages "UX-1 Fundamentos" (type, color, components, scale, language) and "Línea base 27-09" (annotated live-site captures).
- **Laria Page Concepts** canvas: home, catalog + filter sheet, listing detail, store, Mis publicaciones, Publicar and Admin moderation at 1440 and 390, applying principles P1–P11 and recommendations D1–D12. Example data only; each page is still decided in its own sub-sprint (UX-2 to UX-7). Page "Inicio · opciones": four first-screen directions for the home (A Buscador, B Vitrina, C Afiche, D Dos puertas), owner decision H1–H6 in `decisions.md`. Page "Inicio · B": option B developed as a full page (1440 and 390) plus three headline options; references in `references.md` § Homepage first screen. Page "Inicio · banner": a small intro banner (Foto, Duotono, Recortes) with search and "Explorar" above a vitrina row, plus the full page with the Foto banner. Page "Inicio · arte": three original full-width illustrations (Escenario, Mástil, Cable) integrating the headline and search, and the full page with Escenario (H7). Page "Inicio · arte libre": nine art styles (Neón, Grabado, Glitch, Pixel, Luz, Spray, La señal, Cordillera, Collage) with centred text and search, and the full page with Neón (H7, H9). Page "Inicio · arte sin paleta": eight off-palette styles plus Glitch and Grabado as full pages (H7, H10). Page "Inicio · arte con significado": eight pieces that each encode something (a charango-shaped dark cloud in the Milky Way, a melody written in khipu notation, the Amazon dawn chorus as a spectrogram, a charango geoglyph, a Rubens' tube, ferrofluid, a cyanotype, Xenakis-style glissandi) (H7). Page "Inicio · arte, última tanda": the last batch (a pututu's sound simulated in Chavín-style galleries, vessels turned from waveforms, tonewoods under a polarising microscope, Candelaria sequins encoding a siku melody, an X-ray of a guitar and a pedal, tuning beats, a marinera long exposure, the Shepard scale) (H7). Page "Inicio · arte maximalista": a maximalist batch (a chicha sign naming the real categories, a flea-market blanket with price tags, an Ayacucho-style retablo of musicians, a sticker-covered guitar case, Colca-style embroidery, a gilded Cusco-style mirror, a patched modular synth, a jungle where instruments grow) (H7). Page "Inicio · arte fiesta": eight treatments of the owner's street-band reference (a brass band and the dancing town): collage, night fireworks, risograph yunza, linocut sikuris, arpillera, Sarhua board, engraved gourd and a drone view of the plaza (H7). Page "Inicio · la fiesta en ocho momentos": the final eight, one fiesta in eight moments with no motif shared between pieces: the band's truck (naive painting), Cajamarca clarines (gouache), the pasacalle's shadow on an adobe wall, the dancing crowd (watercolour), Candelaria devil masks (3D), hats in the air (3D), the fiesta reflected in a sousaphone bell (ray-traced brass) and the morning after (oil-painted still life) (H7). Page "Inicio · instrumentos Diablada": Diablada's style (owner: 10/10, into the rotation) applied to eight pairs of instruments facing each other across the headline: trumpet and tuba, bombo and cymbals, trombone and sax, snare and clarinets, waqrapuku and tinya, siku and quena, charango and cajón, electric guitar and amp (H7, H11). Decided 30 Sep: the home banner rotates one piece per visit among Diablada and these eight (`art/rotation/`). Page "Inicio · decisiones": the options for H6 (headline), H2 (vitrina: automatic vs Admin-picked, with the Admin control B would need), H3 (price tag: yellow, ink, in the caption) and H4 (each promise checked against the functional spec); decided 30 Sep: headline 1, automatic vitrina, ink tags, promises without the email notice. Page "Inicio · versión final": the home with every decision applied (1440 and 390) and the nine rotation banners; "Recién publicados" skips the listings already in the vitrina. Art sources: `art/` (rounds 5–10 in `art/round5/` … `art/round10/`).

## How the harness captures were made

`screenshots/ux1-before/` and `screenshots/ux1-after/` come from `scripts/ux-snapshots.cjs` run on production builds of `main` at `49a38e5` and of `ux/redesign`, against a local Postgres 16 with the repo migrations, `supabase/seed.sql` and extra UX data (a Particular, a Store Owner and an Admin account, listings with photos), served through a local stand-in for the Supabase REST, Auth and Storage APIs. No hosted data is involved. Two differences from a Mac: before UX-1 the text used the Linux fallback font (the site had no web font; after UX-1 it is Archivo everywhere), and the home hero photo (Unsplash) does not load offline.

### UX-2 evidence

`screenshots/ux2-before/` and `ux2-after/` come from `scripts/ux-snapshots.cjs` run on production builds (`next start`) of `645d51e` (before the UX-2 code) and of the UX-2 code, on the owner's Mac, against a local Supabase stack, signed out and as a local Particular, Store Owner and Admin. That database also carried 17 later migrations from the catalog branch, which UX-2 does not read; on 2 Oct the build was re-checked on a clean stack built only from this branch's migrations and seed, with accounts from `scripts/ux-local-accounts.cjs` (`review-guide.md` § 6.4). The accessibility numbers and layout shift come from the checks now in `scripts/ux-audit.cjs`. On 3 Oct, the external-review fixes passed a new isolated production-build audit (28 routes, zero frame or strip failures); see `ux-2-acceptance.md` § External-review fixes. On 7 Oct `ux2-after/` was recaptured from the build with the hybrid menus, N11 and the Admin accordion fix (the 500 frames from a scratch copy with the temporary error route); the audit of that build is in `ux-2-acceptance.md` § Owner answers (7 Oct).

## Working rules for any session

- Palette, logo, name and positioning are immutable. Usage of the palette is not.
- Do not change product rules (lifecycle, moderation, verification, reviews, favorites, alerts, authority, RLS, seller contact). If a UX idea needs a rule change, log it in `decisions.md` as an owner question.
- `docs/functional-spec.md` stays canonical for behavior. `docs/design-system.md` (rewritten in UX-1) is canonical for visuals.
- Git in the Cowork device shell: never run plain `git status` (it leaves `.git/index.lock` because the sandbox cannot unlink). Use `GIT_OPTIONAL_LOCKS=0 git --no-optional-locks …` for reads.
- Tests pin navigation labels and copy (`tests/*.test.cjs`, `acceptance/cases.tsv`). Terminology changes update those deliberately; never weaken an assertion.
- Run targeted tests per change; the full suite once per integration point. Keep output summaries short.
- Use a fresh session per sub-sprint. Before ending a session, update this README's status table and `decisions.md`.
- Each accepted sub-sprint is released on its own (N15): Codex audits, the owner pushes, a read-only production smoke follows. Claude Code never pushes. Before a sub-sprint starts, fast-forward `ux/redesign` to `origin/main`.
