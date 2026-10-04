# UX-2 external review — 3 Oct 2026

Scope: `ux/redesign` through `15e689f`, with UX-2 code and tests reviewed from `3da7afa..15e689f` and particular attention to the four commits `37d441b..15e689f`. The approved UX-2 brief, owner decisions, design system, acceptance package, selected before/after captures, and V1 functional specification were used as the review contract.

**Verdict after fixes (3 Oct):** UX2-R01 and UX2-R03 are resolved and verified on the local production build. The owner still needs to resolve N12 before the existing V1 acceptance claims describe this shell accurately. N9–N11 remain open owner decisions.

## UX2-R01 — Deeper Admin 404 loses both shells

- **Severity:** major
- **Area:** Admin frame, 404, hydration
- **Where:** `components/site-shell.tsx:11-30`; `app/admin/not-found.tsx:10-13`; `app/not-found.tsx:11-16`; `tests/ux-shell.test.cjs:230-240`; `/admin/no-existe/de-verdad` at desktop width
- **Expected:** The UX-2 brief's Page frames and 404 sections (`docs/ux-redesign/ux-2-shell.md:67-76,87-96`) require navigable error pages and an Admin frame for Admin paths. The design system says Admin errors render inside that frame (`docs/design-system.md:143-147`).
- **Actual:** A fresh request to `/admin/no-existe/de-verdad` returns HTTP 404 with the **public header, category strip and slim footer** in the server HTML. After hydration, the browser accessibility tree contains only the skip link, error heading, search field and two links: there is **no public header/footer and no Admin sidebar/bar**. The root not-found page handles this unmatched deeper route, while `SiteShell` suppresses the public shell for `/admin...`; `FallbackMain` restores `<main>` but no navigation. The internal unit test and audit check one `<main>`/`<h1>` here, so they miss the missing frame. The shallow `/admin/no-existe` route did not exhibit the same anonymous response; it redirected to login in this check.
- **Kind:** defect, **resolved 3 Oct**. `app/admin/[section]/[...rest]/page.tsx` sends unmatched deeper Admin URLs to `notFound()` inside the Admin layout. The browser audit now asserts a visible Admin navigation frame and no public header/footer at both widths. The root `FallbackMain` still covers a failure in the Admin layout itself; that failure path was not induced in this pass.

## UX2-R02 — Canonical V1 navigation acceptance still describes the retired shell

- **Severity:** major for the acceptance gate
- **Area:** specification and acceptance traceability
- **Where:** `docs/functional-spec.md:362-364`; `acceptance/cases.tsv` test IDs `PUB-008`, `PUB-011`–`PUB-015`; `docs/ux-redesign/ux-2-acceptance.md:93-102`; `docs/ux-redesign/decisions.md` N12
- **Expected:** `docs/functional-spec.md` remains canonical for V1 behavior, and `acceptance/cases.tsv` is the canonical acceptance record. Pass criteria and evidence should describe the behavior being accepted.
- **Actual:** The spec still requires shared marketplace category/subtype navigation on Admin and account pages, a desktop mega-menu, and a mobile accordion. The `PUB-008` and `PUB-011`–`PUB-015` rows still say `Pass` for those behaviors, although UX-2 deliberately replaces them with a public-only category strip and an Admin frame without the public header. The mismatch is candidly listed as open N12; this review makes no acceptance-status inference or registry edit.
- **Kind:** already-listed deviation (N12). Resolve N12 and reconcile the canonical wording/evidence through the owner's acceptance process before treating the prior Pass rows as proof of UX-2 behavior.

## UX2-R03 — Phone strip test does not exercise sideways access

- **Severity:** minor
- **Area:** tests, mobile navigation
- **Where:** `tests/favorites-browser-smoke.cjs:29`; `scripts/ux-audit.cjs:75,109-120,136-143`
- **Expected:** The UX-2 brief says the phone and tablet category strip scrolls sideways and keeps the page from scrolling horizontally (`docs/ux-redesign/ux-2-shell.md:42-48,108`). Acceptance criterion 3 says updated tests should not lose strength (`:124`).
- **Actual:** The revised browser smoke at 390 px checks that the document does not overflow and that a Guitarras link exists. The audit also checks document overflow. Neither proves that the strip itself scrolls, that its last item is reachable, or that selecting a category works on a phone. The browser smoke is documented as not run for UX-2.
- **Kind:** verification gap, **resolved 3 Oct**. `scripts/ux-audit.cjs` now checks strip overflow, horizontal movement, visibility of the final link, page overflow and its verified-store destination at 390 and 768 px. The check exposed a stalled client transition from unfiltered `/listados`; the verified-store item now uses a native anchor and reaches its destination at both widths.

## Checks and limits

- On an isolated archive of `15e689f`, direct ESLint, Node test, TypeScript and Next build commands passed: **271/271 tests**, no lint/type errors, production build successful. `pnpm` wrappers could not run in the isolated archive because pnpm attempted a registry metadata fetch and then a module purge; the underlying project commands completed.
- Compared selected UX-2 before/after captures for catalog, listing, account and Admin at phone/tablet widths. No additional visual defect was established from those frames.
- Started the isolated production build on localhost. Browser observation confirmed UX2-R01 after hydration and a normal public 404 with its full public shell. The local Supabase stack was unavailable, so this review did not rerun the seeded accessibility harness, authenticated route walk, integration scripts or browser smoke. It also did not test Safari, Firefox, screen readers or physical touch.
- No product code, V1 acceptance TSV or functional specification was changed by this review.

## Fix verification — 3 Oct 2026

- Work was done on `ux/redesign` at `15e689f`, in `/Users/henricamayoguillermo/code/mkt_instrumentos-ux`; the `mkt_instrumentos_release` checkout was not changed. The production build and browser audit ran from an isolated copy on port 3105 against the local Supabase stack and the existing local UX accounts. These fixes are uncommitted and have not been pushed or merged.
- The production build, ESLint and TypeScript passed; the configured Node test command passed **271/271**. The anonymous deeper Admin URL now returns a 307 to the Admin login gate. Signed-in browser checks show the Admin frame on both shallow and deeper 404s at 390 and 1440 px.
- `.ux-snapshots/ux2-fix-final/audit.json` in the isolated verification copy: **28 template runs**, **0** axe violations (also with five menus open), **0/840** focusables without a 2 px ring, **0** Tab-order and skip-link failures, **0** pages with horizontal overflow or wrong `<main>`/`<h1>` counts, **0** frame failures, **0** strip failures and maximum layout shift **0.0016**. The 390 and 768 px strip checks both passed. This pass did not inject the temporary 500 route; its earlier evidence remains in `ux-2-acceptance.md`.
- **Still open:** UX2-R02 / N12 is an owner decision about canonical V1 wording and acceptance evidence. No `acceptance/cases.tsv` status, owner decision or `docs/functional-spec.md` text was changed. Safari, Firefox, screen readers, physical touch and the integration/browser-smoke scripts were not run.

## Follow-up — 3 Oct 2026 (Claude Code)

Added after this review, for traceability; the findings above are unchanged.

- **UX2-R03, related instance.** The client transition that stalled on "Tiendas verificadas" also stalled on "Instrumentos" from a filtered catalog (`/listados?seller_type=verified_store` → `/listados`). Every shell link into `/listados` is now a native link (`components/shell-link.tsx`); the "Tiendas verificadas" destination is unchanged. The root cause (a `/listados` → `/listados?…` transition that fetches the page data but never commits) is not identified; the catalog's pagination may share it (UX-3).
- **UX2-R02 / N12.** The owner decided the preference on 3 Oct: the mega-menu's category and type access returns inside the UX-2 design (`ux-2-shell.md` § Amendment, `decisions.md` N12). The canonical reconciliation this finding asks for is still the owner's: `ux-2-acceptance.md` § What still needs owner acceptance lists each row and spec line with its gap. `acceptance/cases.tsv` and `docs/functional-spec.md` remain unchanged.

