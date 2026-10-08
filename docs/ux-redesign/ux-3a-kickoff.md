# UX-3a kickoff prompt

Paste the block below into a new Claude Code session opened in `/Users/henricamayoguillermo/code/mkt_instrumentos-ux`. Written 8 Oct 2026, after the owner approved the UX-3 brief with the answers Q1–Q20. The plan it points to is `ux-3-discovery.md`.

```text
Start the Laria UX redesign sub-sprint UX-3a (Discovery, part 1) in /Users/henricamayoguillermo/code/mkt_instrumentos-ux, branch ux/redesign. Don't touch the main checkout (../mkt_instrumentos), the catalog worktree (../mkt_instrumentos-catalog) or their branches. Don't push, merge or deploy without my OK.

State: I approved the UX-3 brief on 8 Oct, docs/ux-redesign/ux-3-discovery.md, with my answers Q1–Q20 (its § Owner answers (8 Oct) and decisions.md).

3a builds:
- the stall fix;
- the one listing card;
- the catalog;
- the filters (desktop sidebar and phone sheet, with F11: condition and location take several values);
- applied chips, sort and numbered pagination;
- the category landings;
- their empty, no-results, loading and error states.

3b (the home) starts only after I accept 3a. 3a ends with an acceptance package and one review page.

Read first, in order:
1. AGENTS.md
2. docs/ux-redesign/README.md
3. docs/ux-redesign/ux-3-discovery.md, all of it: § The catalog transition stall, § Proposed design (3a parts), the amended § Filters (F11), § Owner answers, the acceptance criteria, the evidence plan and the tests expected to change
4. docs/ux-redesign/decisions.md: Q1–Q20 and F9–F12
5. docs/ux-redesign/roadmap.md: "How every sub-sprint runs"
6. docs/design-system.md
7. docs/functional-spec.md for the catalog, favorites, search alerts, category pages and analytics (canonical behaviour)
8. The code the brief names:
   - the catalog route: app/listados/ (page.tsx, loading.tsx);
   - the components: components/listing-card.tsx, listing-filters.tsx, pagination.tsx, category-landing.tsx, shell-link.tsx, components/ui/chip.tsx and field.tsx;
   - the libraries: lib/catalog.ts, lib/listings.ts (parseListingFilters), lib/search-alerts.ts, lib/marketplace-event-payload.ts, lib/seo.ts, lib/shell.ts;
   - the landing branch of app/instrumentos/[slug]/page.tsx.

Order of work:
1. The stall fix, first and in its own commit (Q1 A).
   - Write scripts/ux-transition-trials.cjs from the method in the brief's appendix: a production build, a scratch copy with the page size lowered, at least 10 window.next.router.push trials per move, 6 s each.
   - Run it on the current build and record the stalls.
   - Delete app/listados/loading.tsx and add the in-page pending state: results dimmed after 200 ms, aria-busy, "Cargando resultados…".
   - Run it again: 0 stalls for every move in acceptance criterion 2.
   - Retire the native-link workaround for catalog URLs (ShellLink/isCatalogHref, AppliedChip's plain link). Update the tests without weakening them, and update docs/architecture.md.
2. The one card (the grid variant; the showcase tile waits for 3b), adopted by the catalog and the landings.
3. The catalog page and the filters:
   - desktop options as live links;
   - the phone sheet with Chip, Radio and Checkbox;
   - F11: repeated condition and location parameters, "any of" with `in`, one-value URLs byte-for-byte unchanged, the alert entry hidden on multi-value searches with its line. No migration; saved alerts untouched;
   - chips, sort, numbered pagination, the landings and the states.
4. Tests per the brief's table (update, never weaken; Chip and Radio leave the unused list), then docs/design-system.md.
5. Evidence and the acceptance package:
   - lint, typecheck, test, build;
   - scripts/ux-snapshots.cjs before and after (screenshots/ux3-before|after/);
   - scripts/ux-audit.cjs extended for the sheet, the sort menu and card tab stops;
   - the transition trials;
   - first-load JS against today (catalog 135 kB);
   - the SEO smokes;
   - the acceptance rows re-run as observations;
   - then ux-3a-acceptance.md and one review page (Correct/Wrong per check with screenshots, answers in its db).

Rules:
- No schema, migration, RLS, auth, moderation or lifecycle change. The only query change is F11's, as decided.
- Never edit acceptance/cases.tsv or docs/functional-spec.md, and never infer a PASS. Recording N12 is still mine.
- React #418 on fresh listing pages is UX-4's.
- Spanish copy from the glossary.

Environment notes:
- Build only against local Supabase: the worktree's .env.local points at 127.0.0.1:54321; the main checkout's .env.local is production.
- Run next start detached (nohup … &) and stop it by port: lsof -tiTCP:<port> -sTCP:LISTEN | xargs kill.
- Scratch builds: git archive into the scratchpad, symlink node_modules, copy .env.local, ./node_modules/.bin/next build (not pnpm build).
- agent-browser is at ~/.npm/_npx/6de2aa2fded2970c/node_modules/.bin/agent-browser (LARIA_AGENT_BROWSER_BIN). It blanks its tab a few seconds after repeated Esc/Enter/Tab presses, so run keyboard checks in their own sessions; screenshots need absolute paths.
- The axe-core file used for the audit is at ~/Documents/backus-visitas/node_modules/axe-core/axe.min.js.
- Local accounts: .ux-accounts.local.json (scripts/ux-local-accounts.cjs); never print the passwords.
- window.next.router.push is available in production builds. The router state can be read through self.webpackChunk_N_E and the module exporting getCurrentAppRouterState (the brief's appendix).
- Tailwind display classes override the hidden attribute: check that closed things are invisible, not only aria-expanded.
- typecheck reads .next/types: delete .next after removing a route or a route file such as loading.tsx.

Every task ends with lint, typecheck, test (275 before 3a; report the new total), build, and the docs updated.
```
