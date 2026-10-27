# Acceptance run on a full local stack

Launch audit A14 found that 68 release-gate cases of `acceptance/cases.tsv` had never been run. This run checks them
end to end, on every pull request into `main`, every push to `main` and by hand (GitHub > Actions > Acceptance > Run
workflow). It never reads a secret, hosted Supabase or production.

## What runs

`.github/workflows/acceptance.yml` installs the Supabase CLI (2.98.2) and runs `scripts/acceptance/full-stack.sh`,
which:

1. Copies `scripts/acceptance/supabase-config.toml` to `supabase/config.toml` and starts a full local Supabase:
   Postgres 17 (as production), Auth, PostgREST and Storage. Every migration runs from scratch, then
   `supabase/seed.sql`. Auth is set like production where the cases depend on it: e-mail confirmation on, passwords
   of 8 characters or more, authenticator codes (Admin's pages and functions need them since A06 and A15).
2. Writes `.env.local` from `supabase status` with a new `CRON_SECRET`, builds the app and starts the production
   build on `http://localhost:3100`.
3. Runs the tests below one after another. The app's per-visitor limits start from zero for each file.
4. Lists every `PASS <case>` line in `cases.txt` and every `NOTE <case>` line (a case only the owner can settle) in
   `notes.txt`, both shown in the run's summary. The logs (each test, the build, the app) are kept as the
   `acceptance-logs` artifact for two weeks.

Every account, listing, store and upload a test makes is throwaway (`@example.invalid` addresses) and removed at the
end; the whole stack is discarded after the run anyway.

## The release-gate cases

`tests/acceptance-release-gate.integration.cjs` checks the cases that need accounts. Each request is the one the
app's own pages make: the same route, database function or table call, signed in as the account that would make it.

| Cases | What is checked |
|---|---|
| AUTH-002 | A second sign-up with a registered address creates no account and the form recognises it (`signUpFoundExistingAccount`). |
| AUTH-004, AUTH-013 | A used or invalid sign-up or reset link goes to `/login` with its message, sets no cookie, keeps an open session and leaves the password as it was. |
| AUTH-005, AUTH-006 | Password sign-in reaches `/mi-cuenta`; a wrong password and an unknown address get the same 401 and no cookie. |
| AUTH-008, AUTH-011 | A sign-in link or a reset for an unknown address creates no account; the reset answers alike for any address. |
| AUTH-009 | Signing out clears the session cookies, `/mi-cuenta` then goes to `/login`, and the old session can't be renewed. |
| AUTH-014, AUTH-015 | A password change takes effect; profile changes save and show; the account type can't be changed. |
| AUTH-016 | One Particular account saves a favorite and an alert, contacts a seller and has its own listings. |
| AUTH-019, AUTH-020 | An account page without a session goes to sign-in and back; outside return addresses land on `/mi-cuenta`. |
| LIST-001 to LIST-012, LIST-014, LIST-020 to LIST-022 | The publishing route: sign-in required, each required field, rules acceptance and price refused with its message and nothing kept; a tampered request (status, owner, store, timestamps) creates the account's own pending listing; retries don't duplicate or change it; forged or foreign capabilities are refused; characteristics show with their labels and never as raw keys. |
| LIST-015 to LIST-019 | An account's listing shows the profile's name and opens WhatsApp to the profile's number, also after a change; a listing without an account keeps its own contact and isn't claimed by a new account with the same number. |
| LIFE-001, LIFE-002 | Admin's approval publishes and sets the first publication time; a rejection keeps the listing hidden, shows the reason to the owner and queues the e-mail. |
| LIFE-007, LIFE-008, LIFE-010 to LIFE-012 | A sold listing leaves the catalog and can't be put back on sale; relisted copies go to review, except a Tienda Verificada's. |
| REV-001 to REV-004, REV-006 to REV-009 | Price, description, place and characteristics change at once; category, type, brand and model wait for review while the live version stays. |
| SDASH-002, SDASH-003 | A store owner changes its details, logo, banner, shop photos and links; Admin's fields and outside images are refused. |
| WA-008 to WA-010 | Only signed-in contacts make a buyer selectable when the listing is sold; others aren't; a buyer appears once. |
| SCOPE-001, SCOPE-003 to SCOPE-006, LEGAL-006 | The account pages (Particular and store) offer no checkout, shipping, commission, paid plan, chat or guarantee. |

LIST-008 prints a NOTE: since the marketplace categories (migration 20261022120000) every category has instrument
types plus "Otro", so a category without types no longer exists. The run shows that a pedal sent with "Otro" and no
characteristics is accepted; whether that settles the case is the owner's call.

`scripts/acceptance/public-pages.cjs` checks what any visitor reads, with GET requests and no session: PUB-006,
PUB-007, LEGAL-005, LEGAL-006, SCOPE-001 to SCOPE-006, SCOPE-008, SEO-006, SEO-007, LIST-001 and AUTH-019. It is
read-only, so it also runs against production:

```sh
node scripts/acceptance/public-pages.cjs https://laria.audio
```

The older integration tests run in the same job and prove the flows they were written for (submissions, the listing
lifecycle, photos, analytics, favorites, alerts, transactions and Admin's reports).

## Not covered here

- ALERT-005 needs the daily digest in a real inbox in production; it stays Blocked until then.
- The wording checks prove what the pages say, not that it is legally sufficient: the legal review of the Terms,
  Privacy and the line under the contact button is still pending.
- The run doesn't touch production. Repeating the write cases there needs disposable production accounts and the
  owner's approval.

## Running it on your machine

It needs Docker, the Supabase CLI and a clean worktree: it writes `supabase/config.toml` and `.env.local`, so it
refuses a folder that has either, and it removes both and stops its stack when it ends.

```sh
git worktree add ../mkt_instrumentos-acceptance origin/main
cd ../mkt_instrumentos-acceptance
pnpm install --frozen-lockfile
bash scripts/acceptance/full-stack.sh /tmp/laria-acceptance
```

Its stack uses the CLI's default ports (54321 and 54322), so stop another local Supabase first.
