# Overnight work, 9–10 Oct 2026 (N17): handoff and log

The owner is travelling without internet and asked Claude Code to keep building the remaining UX sub-sprints on the
recommendations (N17, `decisions.md`). The first cloud session crashed before committing anything. A session on the
owner's Mac then fixed React #418 (below) before the Mac was switched off; **all remaining work continues in a Claude
Code cloud session.** This file is the cloud session's starting point and the owner's morning summary; keep it updated
and commit it with each sub-sprint.

## Rules for the night (from the owner, binding)

- Work only on `ux/redesign`. Push it to `origin` as a backup after each meaningful commit (approved; it may create a
  Vercel preview). **Never push, merge or rebase onto `main`:** `main` deploys laria.audio, which stays at UX-3.
- No production Supabase credentials and no hosted writes of any kind. Never create a `.env.local` that points at a
  hosted project. In the cloud, build with placeholder local values, for example
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, dummy `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
- Read first: `AGENTS.md`, `README.md` (this folder), `roadmap.md` ("How every sub-sprint runs" and §§ UX-5 to UX-8),
  `ux-4-listing-store.md`, `decisions.md` (N15, N17, L1–L21), `../design-system.md`, `../functional-spec.md`.
- UX-4 takes every recommendation (L11 B, the rest A), provisional until the owner's review. After UX-4: write each
  later brief (UX-5, UX-6 split 6a/6b, UX-7, UX-8) with questions, options and a recommendation, take the
  recommendation as a provisional answer, then build. Every product-behaviour flag takes its no-change option.
- No migrations, schema, RLS, auth, authorization, moderation, lifecycle, contact, review or report rule changes.
  `acceptance/cases.tsv` and `docs/functional-spec.md` are the owner's: never edit statuses or spec text, never write
  a Pass anywhere. Tests are updated deliberately, never weakened. Spanish UI copy per the glossary.
- Checks per sub-sprint: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Browser captures, the audit,
  first-load measurements in the browser and acceptance-row re-runs need the local Supabase stack on the Mac: record
  each as "pending: run on the Mac" with the exact command, never as a result.
- Docs per sub-sprint: its brief, an acceptance package (`ux-Na-acceptance.md` style) that says plainly what was
  verified and what is pending, and `decisions.md`, `roadmap.md`, `README.md` status. Review checklists as markdown
  (Correct/Wrong items) in this folder if Artifact pages cannot be published from the cloud.
- Anything needing a real product decision beyond the recommendations: log it in `decisions.md` as pending, move on.

## Done so far

| Commit | What |
| --- | --- |
| `d8ef099` | UX-4 brief with provisional answers (previous session) |
| `0dda0ec` | **React #418 fixed** (4a's first task); regression test |
| (this commit) | `scripts/ux-hydration-trials.cjs` and this handoff |

### React #418 (4a, first task): cause and fix

- **Reproduced** on a production build of `d8ef099` against local Supabase, with a fresh approved listing with two
  Storage photos (inserted as `tests/favorites.integration.cjs` does): 3 of 4, then 6 of 6 sessions logged
  `Minified React error #418 … args[]=HTML` (an element mismatch, not text). It is not specific to fresh listings:
  a seed listing with related cards (`guitarra-acustica-yamaha-f310-casa-musical-grau`) logged it 4 of 4; a listing
  page without related cards (`bateria-pearl-export-usada-arequipa`) 0 of 4; `/listados`, `/` and the store page 0 of 3.
- **Cause:** the listing page streams "Publicaciones similares" and "Más de …" (`Suspense`) after the shell. The
  account provider's first check (`/api/account-navigation`) often finishes before those sections hydrate; React then
  hydrated their cards' `FavoriteButton` with the live state (`ready`, signed out), which renders a sign-in `<a>` where
  the server had sent the disabled `<span><button>`. Aborting `/api/account-navigation` alone removed the error
  (0 of 6); blocking `/_next/image` only changed the timing (2 of 6).
- **Fix** (`components/marketplace-account-provider.tsx`): `useMarketplaceAccount()` returns the provider's initial
  state while the calling component hydrates (`useSyncExternalStore` server snapshot), then the live state. It covers
  every consumer (favourite, report, alert entry, header). Client navigations are unaffected (no server snapshot).
- **After:** 0 of 10 fresh-listing sessions, 0 of 5 on the seed listing, 0 of 4 signed in as the local Particular.
  Regression test: `tests/favorites.test.cjs` "account state while hydrating equals the server render (React #418)"
  (fails on the old provider). Lint, typecheck, 306 tests and the build passed.
- **Still pending on the Mac:** the strict favorites browser smoke (it stopped on #418 before):
  `node tests/run-local.cjs node tests/favorites.integration.cjs http://localhost:3100` with
  `LARIA_FAVORITES_BROWSER=1` and `LARIA_AGENT_BROWSER_BIN=…` against a production build on port 3100.
- The #418 trials re-run: `node scripts/ux-hydration-trials.cjs http://localhost:3100/instrumentos/<slug> 10`.

### Facts found on the way (for 4a)

- Build table on `d8ef099`: `/instrumentos/[slug]` 4.47 kB / **208 kB** first load; `/tiendas/[slug]` 5.87 kB /
  **195 kB**; shared 101 kB.
- On the shared local database the seed store listings of "Ritmo Sur Music" answer 404 (the store is not active), so
  use the Casa Musical Grau, Andes Sonido or Particular seed listings for captures.
- The fresh-listing fixture (for the brief's fixture script, `--remove` must undo it): an `approved` row in `listings`
  owned by the local Particular (`seller_type individual`, `created_by_source admin`, `marketplace_rules_accepted_at`
  set), two PNGs uploaded to the `listing-photos` bucket at `<owner>/<listing>/<n>.png`, one `listing_photos` row each
  with the public URL; removal deletes the objects, the photo rows, the listing's `marketplace_events` and the listing.

## Next (cloud session), in order

1. **4a, L15:** load the report form (and the Supabase browser client it imports, ~62 kB gz of the listing and store
   first load) only when "Reportar …" is pressed: keep `ContentReport`'s trigger and sign-in link light and move the
   form into a component loaded with `next/dynamic` / `import()` on press. Keep labels and flow (REP-001–005,
   REVW-015). Note the #418 lesson: account-dependent markup must keep using `useMarketplaceAccount`.
2. **4a, the listing page** per `ux-4-listing-store.md` § Listing page: `components/listing/` (`ListingGallery`,
   `Lightbox`, `ContactModule`, `TrustNote`, `SellerCard`, `ReputationSection`, `SpecTable`, `RelatedListings`). Keep
   `app/instrumentos/[slug]` without `loading.tsx` (`tests/ux-shell.test.cjs`, the stall rule) and the tests listed in
   the brief's § Tests expected to change.
3. **4b, the store page** (`components/store/`), then the UX-4 acceptance packages (4a, 4b) with "pending: run on the
   Mac" for captures, audit, browser first-load and rows.
4. **UX-5, UX-6 (6a/6b), UX-7, UX-8:** brief → provisional answers → build, each in its own commits, as far as the
   night allows.
5. Before stopping: update this file (commits per sub-sprint, what is built, provisional decisions, what is pending
   with the Mac commands, anything skipped and why), commit, push `ux/redesign`.

## Pending on the Mac (owner's return)

- `git pull` in `../mkt_instrumentos-ux` (branch `ux/redesign`), then read this file.
- Production build on the worktree's local `.env.local` (127.0.0.1:54321), `next start -p 3100`, then the strict
  favorites smoke and the hydration trials above, then each sub-sprint's captures, audit and row re-runs as its
  acceptance package lists them.
