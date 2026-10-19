# Effortless Laria, batch "find": search, browse and the home

Write-up of the find batch of the Effortless Laria program (build plan `/mnt/project-files/ux-ideas/build-plan.md`,
ideas in `/mnt/project-files/ux-ideas/ideas.json`, Henri's verdicts of 2026-10-19). Proposed decisions are numbered
UXD-find-n; the integrator moves them into `docs/decisions.md`. Proposed acceptance cases are in
`docs/ux-effortless/find-acceptance.tsv` (EASE-001 to EASE-099, all Not Run).

## FIX 07: choosing a filter keeps your place

- **What changed.** Every catalog navigation (filter rows and chips, applied chips, sort, the phone sheet, the price and
  brand forms, pagination) runs `router.push(href, { scroll: false })` inside the existing transition. Once the next page
  commits, the results come into view only when they are entirely off-screen (a much shorter result list), and a page
  link brings the first row back up when it is above the screen. Focus handling is unchanged.
- **Files.** `components/catalog-navigation.tsx` (`resultsScrollTarget`, `RESULTS_REGION_ID`), `components/pagination.tsx`
  (`resultsScroll="start"`), `tests/ux-effortless-find.test.cjs`, `tests/ux-shell.test.cjs` (the results region now has
  `id="resultados"`), `docs/design-system.md` § Navigation and states.
- **How to test.** On `/listados` at 1366 px, scroll down to "Ubicación" and tick "Lima": the page stays where it was
  (checked in Chromium: 883 px before, 939 px after, the difference being the applied-chip row that appears above).
  On a phone, apply the sheet: the results stay in view. Page 2 from the bottom of the grid shows its first row.
- **Defaults picked.** A store page's pagination is outside the catalog provider and keeps the browser's normal jump to
  the top.
- **Limitations.** None known.
