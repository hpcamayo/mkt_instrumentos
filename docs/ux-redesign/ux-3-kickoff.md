# UX-3 kickoff prompt

Paste the block below into a new Claude Code session opened in `/Users/henricamayoguillermo/code/mkt_instrumentos-ux`. Written 8 Oct 2026, after UX-2 was accepted; the plan it points to is `roadmap.md` § UX-3.

```text
Start the Laria UX redesign sub-sprint UX-3 (Discovery) in /Users/henricamayoguillermo/code/mkt_instrumentos-ux, branch ux/redesign. Don't touch the main checkout (../mkt_instrumentos), the catalog worktree (../mkt_instrumentos-catalog) or their branches. Don't push, merge or deploy without my OK.

State: UX-1 accepted 30 Sep; UX-2 (shell and navigation) accepted 8 Oct through its review page, 22 of 22 checks Correct. UX-3 has two owner gates: a brief I approve before anything is built, then an acceptance package with a review page after. This session writes the brief. Don't change product code before I approve it.

Read first, in order:
1. AGENTS.md
2. docs/ux-redesign/README.md
3. docs/ux-redesign/roadmap.md: "How every sub-sprint runs" and § UX-3 (scope with file references, decided inputs, carried-in issues, questions, rules not to change, acceptance rows to re-run, tests that pin today's markup)
4. docs/ux-redesign/decisions.md: H1–H11, N7, N8, N12, F9, G1
5. docs/ux-redesign/home-visual-audit.md: the UX-3 items, owner questions 4 and 13, the design-system confirmations
6. docs/ux-redesign/ux-2-shell.md (§ Home header, § Amendment) and docs/design-system.md
7. The concepts: docs/ux-redesign/screenshots/home-final/ (the decided home), screenshots/page-concepts/ Inicio-1440/390, Catalogo-1440/390 and Filtros-390, and art/rotation/ (the nine banners, manifest and rules)
8. docs/functional-spec.md for catalog, filters, category pages, search, alerts and favorites (canonical behaviour)

Deliverables:
1. Find the catalog transition stall (roadmap § UX-3, "First task"). The client move /listados → /listados?seller_type=verified_store fetches its data (HTTP 200) and never commits in most trials since UX-1: 14 of 18 on this branch, 3 of 7 on 645d51e, 0 of 16 on main 49a38e5; ?page=2 and ?category= always complete. Bisect UX-1's commits (49a38e5..3da7afa): scratch builds in the scratchpad (git archive, symlink node_modules, copy .env.local, lower LISTINGS_PAGE_SIZE so pagination shows with the 14 local listings, ./node_modules/.bin/next build), at least 10 window.next.router.push trials per build, 6 s each. Name the cause and propose the fix in the brief; don't commit the fix before approval.
2. Write the brief, docs/ux-redesign/ux-3-discovery.md, the way ux-2-shell.md was written:
   - scope and the concepts it follows;
   - the decided inputs;
   - the proposed design per surface: the home header with its "Categorías" menu and the banner search, the banner rotation, "En vitrina", "Recién publicados", the catalog, filters and the phone sheet, applied chips, sort, pagination, category landings, the one listing card, and the empty, no-results, loading and error states;
   - the product rules it must not change;
   - acceptance criteria, the evidence plan, and the tests expected to change (update, never weaken);
   - the stall finding.
3. Ask me, each with options and a recommendation:
   - home visual audit item 4 (a denser "Recién publicados") and item 13 (phone banner fade);
   - the design-system confirmations in home-visual-audit.md;
   - card fields per category, photo aspect ratio, and grid only or a list view too;
   - live filters or an apply button; "Ver más" or numbered pages (crawlable ?page=N either way);
   - facet counts and a live "Ver N resultados" (new count queries: a flag);
   - where the alert entry goes;
   - reading photo_count on the home for H2;
   - F9 free-text search (decide now or leave for later);
   - the 3a/3b split (3a: card, catalog, landings, filters, states and the stall fix; 3b: the home).
   If a choice is visual, render the options and give me one review page with them.
4. Update README.md, roadmap.md (UX-3 state) and decisions.md (the new questions with IDs, pending).

Still open, not this session's: recording N12 is mine (never edit acceptance/cases.tsv or docs/functional-spec.md, never infer a PASS); React #418 on fresh listing pages is UX-4's.

Environment notes:
- Build only against local Supabase: the worktree's .env.local points at 127.0.0.1:54321; the main checkout's .env.local is production.
- Run next start detached (nohup … &) and stop it by port: lsof -tiTCP:<port> -sTCP:LISTEN | xargs kill.
- agent-browser is at ~/.npm/_npx/6de2aa2fded2970c/node_modules/.bin/agent-browser (LARIA_AGENT_BROWSER_BIN). It blanks its tab a few seconds after repeated Esc/Enter/Tab presses, so run keyboard checks in their own sessions; screenshots need absolute paths.
- The axe-core file used for the audit is at ~/Documents/backus-visitas/node_modules/axe-core/axe.min.js.
- Local accounts: .ux-accounts.local.json (scripts/ux-local-accounts.cjs); never print the passwords.
- window.next.router.push is available in production builds (for transition tests).
- Tailwind display classes override the hidden attribute: check that closed things are invisible, not only aria-expanded.
- typecheck reads .next/types: delete .next after removing a route.

Every task ends with lint, typecheck, test (expect 275/275), build, and the docs updated.
```
