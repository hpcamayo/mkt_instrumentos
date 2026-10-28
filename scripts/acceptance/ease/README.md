# Effortless Laria acceptance run (EASE)

Browser checks for the 343 EASE cases in `acceptance/cases.tsv` (EASE-001 to EASE-766 and the maybes EASE-800 to
EASE-882). Each `checks-<group>.cjs` exports the cases of one group as `{ id, live?, server?, liveAccounts?, timeout?,
run }`; `run.cjs` runs them and writes one JSON line per case; `harness.cjs` holds the shared helpers (accounts,
stores, listings, e-mails, sign-in, axe-core).

| Group | Cases |
| --- | --- |
| a | EASE-001 to 028 (find), 100 to 119 (listing, WhatsApp) |
| b | EASE-160 to 179, 200 to 228, 700 to 727 (media, questions, accounts, speed) |
| c | EASE-300 to 320, 400 to 432 (selling, Mis publicaciones) |
| d | EASE-500 to 513, 520 to 532, 540 to 549, 600 to 627 (stores, legal, store operations) |
| e | EASE-750 to 766, 800 to 882 (integration, Reservado, Descubrir, AI helpers) |

## Local

A stack of `main` without Docker (`scripts/prototype/README.md`): Postgres on :54322, the gateway on :54321 and
`next start` on :3000; the payments-pilot cases (`server: "pilot"`) use a second build on :3200 with
`LARIA_ASSISTED_COMMERCE=1`, and the AI cases (`server: "ai"`) `next dev` on :3100 with `LARIA_AI_FAKE=1`.

```sh
node scripts/acceptance/ease/run.cjs scripts/acceptance/ease/checks-a.cjs --results=/tmp/results-a.jsonl [--only=EASE-001]
```

## Live (laria.audio)

Only from Henri's Mac and only under his approval line naming the run, Supabase project `hswkjandadscduodejig` and
`supabase db query --linked`. Needs playwright-core (`npm install --prefix /tmp/laria-pw playwright-core@1.48.2`,
then `NODE_PATH=/tmp/laria-pw/node_modules`), Google Chrome (or `CHROMIUM`), the project's packages for axe-core,
and for the accounts pass a checkout linked to the project (`SUPABASE_WORKDIR`).

```sh
echo "select json_build_array(1)::text as result" | scripts/acceptance/ease/live-db.sh     # prints [1]
scripts/acceptance/ease/live-run.sh accounts scripts/acceptance/ease/live-smoke.cjs     # the live mode's own check
scripts/acceptance/ease/live-run.sh both                                               # visitor, then accounts
node scripts/acceptance/ease/live.cjs --clean-up    # only after a run that could not finish its clean-up
```

- **visitor** (`LIVE=1`): the cases marked `live`, signed out. Every request that is not a GET or HEAD is refused
  before it leaves the browser, nothing signs in, page loads are three seconds apart and `/listados` stays under 20
  requests a minute (the firewall allows 30).
- **accounts** (`LIVE=1 LIVE_ACCOUNTS=1`): the other cases except the pilot and AI ones, with throwaway accounts
  `delivered+ease-<run>-<n>@resend.dev` (Resend's test inbox) made straight in Auth with a password made for the run.
  `live.cjs` keeps the run to its own data: a write that names someone else's listing, store, account or question is
  refused in the browser (view counters and analytics about them are dropped quietly), no Libro de Reclamaciones
  entry is ever made, a test listing a real buyer's saved-search alert would match is never published, the run's
  queued e-mails and push notices are cancelled every ten seconds, each case's listings and stores are deleted when
  it ends, and the accounts with everything they made when the run ends, after which what is left is counted (it must
  be all zero, in `accounts-cleanup.json`). Sign-ins stay under 20 per 5 minutes. A case that needs the demo
  accounts, the job secret or an Admin sign-in stops as Not Run.

## Results

Each group's `final-<group>.json` (`{ id, status, evidence, live, bug? }`) goes into `acceptance/cases.tsv` with the
registry's own codec (status and evidence only); a live Pass adds its evidence and a live Fail makes the case Fail.
