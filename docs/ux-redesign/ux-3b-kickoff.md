# UX-3b kickoff prompt

Paste the block below into a new Claude Code session opened in `/Users/henricamayoguillermo/code/mkt_instrumentos-ux`. Written 9 Oct 2026, after the owner accepted UX-3a (review page 31 of 31 Correct); N12's refresh added the same day at the owner's request. The plan it points to is `ux-3-discovery.md` (approved 8 Oct with the answers Q1–Q20); 3b is its home.

```text
Start the Laria UX redesign sub-sprint UX-3b (Discovery, part 2: the home) in /Users/henricamayoguillermo/code/mkt_instrumentos-ux, branch ux/redesign. Don't touch the main checkout (../mkt_instrumentos), the catalog worktree (../mkt_instrumentos-catalog) or their branches. Don't push, merge or deploy without my OK.

State: I approved the UX-3 brief on 8 Oct (docs/ux-redesign/ux-3-discovery.md, answers Q1–Q20) and accepted 3a on 9 Oct (docs/ux-redesign/ux-3a-acceptance.md, 31 of 31 Correct). 3b builds the home on top of 3a's card, grid and catalog. It ends with an acceptance package (ux-3b-acceptance.md) and one review page. That review page also carries N12, refreshed for the shell as it will ship (step 9). The seed-id fix for events, contacts and views (4057065) ships with the UX-3 push; local impressions and contacts record since that fix.

Read first, in order:
1. AGENTS.md
2. docs/ux-redesign/README.md
3. docs/ux-redesign/ux-3-discovery.md: § Decided inputs, § The one listing card (the showcase tile), § Home `/` (3b), § States (the home column), § Owner answers, the 3b acceptance criteria, the evidence plan, the tests expected to change
4. docs/ux-redesign/ux-3a-acceptance.md (what 3a built, its deviations P1–P4 as decided, known limitations)
5. docs/ux-redesign/decisions.md: H1–H11, N1, N5, N7, N8, N9, N12, Q10, Q12, Q14–Q18, P1–P5
6. docs/ux-redesign/ux-2-reconciliation.md (the N12 drafts I approved on 8 Oct, not yet recorded) and scripts/ux-pub-rerun.cjs
7. docs/ux-redesign/home-visual-audit.md (items 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 15, 16, 17) and docs/ux-redesign/ux-2-shell.md § Home header
8. docs/ux-redesign/roadmap.md: "How every sub-sprint runs"
9. docs/design-system.md (§ Discovery is 3a's)
10. docs/functional-spec.md for the home, verified stores and analytics (canonical behaviour), and its Sprint 5 and Sprint 6 navigation clarifications (what N12 rewords)
11. The code: app/page.tsx and components_v0/* (they go), lib/shell.ts (getShellLayout, categoryMenus), components/site-header.tsx, components/global-categories.tsx, components/site-footer.tsx, components/listing-card.tsx, lib/ui/listing-grid.ts, lib/seo.ts (buildHomeMetadata, Organization JSON-LD), docs/ux-redesign/art/rotation/ (the nine pieces, manifest, README)
12. The visual references: screenshots/home-final/R-Inicio-1440, R-Inicio-390, R-Rotacion

Order of work:
1. The local fixture first: a local-only script (like scripts/ux-local-accounts.cjs; refuses non-local URLs) that gives approved listings 3 or more photos in at least five categories, so the vitrina is not empty locally. Today every local listing has one photo.
2. The home header (ux-2-shell.md § Home header, N12, Q14): getShellLayout("/") gains a home header, no strip, no phone search row, full footer; the "Categorías" disclosure panel with "Todos los instrumentos", every category and its types (categoryMenus) and "Tiendas verificadas", shell menu rules, rendered only while open.
3. The banner (H6, H7, H9–H11, N8, Q16): one of the nine pieces chosen on the server per request, only its image preloaded, <picture> WebP 1x/2x with JPEG fallback, alt=""; desktop 300 px band, centred h1 and lead, the 640 px search with "Explorar"; phones the 390×150 strip, then the frame-black text block with the 40 px CSS fade; fixed heights (no layout shift). The search is the header search's GET form (brand), with no event of its own.
4. The showcase tile (the card's second variant: bordered box, square photo, ink price tag H3, category micro label, one-line title, seller line, no favourite) and "En vitrina" (H2, Q12: the newest approved listing per category with listing_photo_count ≥ 3, the five most recent; phones scroll sideways inside the section; hidden when empty).
5. "Explora por categoría" with counts (Q10 B: total and per category, count exact head), "Recién publicados" (grid cards h3, six per row on desktop, eleven cards and the end tile, Q15 B; skips the vitrina's listings; phones six cards and "Ver las N publicaciones"), "Cómo funciona Laria" (H4 promises 1–5, id="como-funciona"), "Tiendas verificadas" (up to three, no stats, Q18 A; the "¿Tienes una tienda?" tile), the sell block, the full footer. Remove components_v0 and today's home query; keep buildHomeMetadata and the Organization JSON-LD.
6. States: the listing sections are left out when their query fails (logged on the server); empty feed shows the EmptyState; empty vitrina and no verified stores hide their sections.
7. Tests per the brief's table (update, never weaken): sprint-9.test.cjs:369–370 and sprint-9-gate.test.cjs:185–189 move to the new category tiles and banner; ux-copy.test.cjs:144–146 moves to the one card; ux-shell.test.cjs:63 gets the home header, no strip, no phone row, full footer, plus the "Categorías" checks and the hidden-panel rule; new tests for the banner pick (one of nine, one preload, alt=""), the vitrina selection and the feed exclusion. Then docs/design-system.md (banner, home sections, the showcase tile, the home header row of the shell table).
8. Evidence and the acceptance package: lint, typecheck, test (291 before 3b; report the new total), build; scripts/ux-snapshots.cjs before/after (screenshots/ux3b-before|after/, the home and its "Categorías" menu at the four widths); scripts/ux-audit.cjs extended for the home "Categorías" menu (the shell menu checks) and banner layout shift; home LCP with the banner; first-load JS against 3a (home 114 kB); the SEO smokes; the rows re-run as observations (PUB-001, PUB-006, SEO-002 home category links, AN-001 home impressions with source home; PUB-008 to PUB-015 in step 9).
9. N12, refreshed for recording. The drafts in docs/ux-redesign/ux-2-reconciliation.md predate 3a and 3b:
   - PUB-012's evidence cites the filter dropdowns showing the chosen type; 3a removed them (the filter column marks the type).
   - PUB-013's gap note says catalog links reload the page; since 3a they are client links.
   - The spec paragraph says the phone search is "a row on the home"; after 3b the home has the banner search and its own "Categorías" menu instead of the strip.
   Update scripts/ux-pub-rerun.cjs for the 3b shell (the home header and its "Categorías" panel; no select-based checks) and re-run PUB-008 to PUB-015 on the final 3b build, signed out, as the Particular, the Store Owner and the Admin, at 1440, 768 and 390, including the home's "Categorías" menu. Then update ux-2-reconciliation.md: the observations, the proposed spec paragraph (with the date left for me), the evidence sentences (each with <result> for my verdict) and the option A/B choice per row. Then write ux-3b-acceptance.md and the one review page (Correct/Wrong per check with screenshots, answers in its db collection checks). N12 is its own group there, "N12: ready to record", one check per item: the spec paragraph, the optional legal-pages line, and each row PUB-008 to PUB-015, showing the exact text to write, the observation and, for PUB-008, PUB-010 and PUB-015, options A and B. Correct means "record exactly this"; for those three rows the note says A or B.
10. After I mark the page: either I record N12 myself, or, only if I tell you explicitly in the session, you write exactly the texts I marked Correct into docs/functional-spec.md and acceptance/cases.tsv (status column 5 with my verdicts only, evidence column 8, and the reworded columns 6, 7 and 12 only for the rows where I chose B), run python3 -B acceptance/validate.py, show me git diff -- acceptance/cases.tsv docs/functional-spec.md, and commit only after I confirm.

Rules:
- No schema, migration, RLS, auth, moderation or lifecycle change. The only new queries are the read-only ones the owner approved: the vitrina's per-category queries with listing_photo_count (Q12) and the home counts (Q10 B).
- Never edit acceptance/cases.tsv or docs/functional-spec.md, and never infer a PASS, except for the N12 recording in step 10 when I ask for it explicitly in the session.
- No email promise on the home (H4). No stores directory (N7). Spanish copy from the glossary.
- React #418 on fresh listing pages is UX-4's.

Environment notes:
- Build only against local Supabase: the worktree's .env.local points at 127.0.0.1:54321; the main checkout's .env.local is production.
- Run next start detached (nohup … &) and stop it by port: lsof -tiTCP:<port> -sTCP:LISTEN | xargs kill.
- Scratch builds: git archive into the scratchpad, symlink node_modules, copy .env.local, ./node_modules/.bin/next build (not pnpm build).
- agent-browser is at ~/.npm/_npx/6de2aa2fded2970c/node_modules/.bin/agent-browser (LARIA_AGENT_BROWSER_BIN); screenshots need absolute paths; keyboard checks in their own sessions; `network requests --filter` shows request bodies.
- The axe-core file is at ~/Documents/backus-visitas/node_modules/axe-core/axe.min.js. WebP and crops: sharp from node_modules/.pnpm/sharp@*/node_modules/sharp.
- Local accounts: .ux-accounts.local.json (scripts/ux-local-accounts.cjs); never print the passwords.
- Anything other than a component exported from a "use client" module reaches server code as a client reference: keep shared strings and constants in plain lib modules (3a: lib/ui/listing-grid.ts, lib/catalog-filters.ts).
- Tailwind display classes override the hidden attribute: check that closed things are invisible, not only aria-expanded.
- typecheck reads .next/types: delete .next after removing a route or a route file.
- zsh does not word-split unquoted variables; write loops as bash scripts.

Every task ends with lint, typecheck, test, build, and the docs updated.
```
