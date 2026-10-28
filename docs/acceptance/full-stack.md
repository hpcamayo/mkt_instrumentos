# Acceptance run on a full local stack

Launch audit A14 found that 68 release-gate cases of `acceptance/cases.tsv` had never been run. This run checks them
end to end, on every pull request into `main`, every push to `main` and by hand (GitHub > Actions > Acceptance > Run
workflow). It never reads a repository secret, hosted Supabase or production: it only signs in to ghcr.io with the
run's own read-only token, to download the Supabase images. The same images are on Docker Hub, ghcr.io and
public.ecr.aws. The last two refused them from GitHub's shared runners on most runs (toomanyrequests, or ECR's data
limit for the address), so the workflow takes them from Docker Hub, which doesn't limit GitHub's own runners, and each
further try of the stack's start, up to six, from the next registry in turn. Each action the workflow uses is pinned to
a commit, the one its tag pointed to on 27 Oct 2026; to update one, check the new version's diff and change its commit
and comment together.

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
   `notes.txt`, both shown in the run's summary. The logs (the stack's start, each test, the build, the
   app) are kept as the `acceptance-logs` artifact for two weeks.

Every account, listing, store and upload a test makes is throwaway (`@example.invalid` addresses) and removed at the
end; the whole stack is discarded after the run anyway.

## The release-gate cases

`tests/acceptance-release-gate.integration.cjs` checks the cases that need accounts. Each request is the one the
app's own pages make: the same route, database function or table call, signed in as the account that would make it.

| Cases | What is checked |
|---|---|
| AUTH-002 | A second sign-up with a registered address creates no account and the form recognises it. The stack confirms neither addresses nor phone numbers on its own, like production (read on 27 Oct 2026), so Supabase answers with an account that has no identities; where Auth confirms either on its own, it answers with the error `user_already_exists` instead. Both forms read either answer as an existing account (`signUpFoundExistingAccount`, `signUpErrorFoundExistingAccount`). |
| AUTH-004, AUTH-013 | An expired, used or invalid sign-up or reset link goes to `/login` with its message, sets no cookie, keeps an open session, leaves the address unconfirmed and the password as it was. A link expires by moving its sent time two hours back, past `otp_expiry`. |
| AUTH-005, AUTH-006 | Password sign-in reaches `/mi-cuenta`; a wrong password and an unknown address get the same 401 and no cookie. |
| AUTH-008, AUTH-011 | A sign-in link for an unknown address is refused ("Signups not allowed for otp") and creates no account; a reset creates none either and answers alike for any address. |
| AUTH-009 | Signing out clears the session cookies, `/mi-cuenta` then goes to `/login`, and the old session can't be renewed. |
| AUTH-014, AUTH-015 | A password change takes effect; profile changes save and show; the account type can't be changed. |
| AUTH-016 | One Particular account saves a favorite and an alert, contacts a seller and has its own listings. |
| AUTH-019, AUTH-020 | An account page without a session goes to sign-in and back; outside return addresses land on `/mi-cuenta`. |
| LIST-001 to LIST-012, LIST-014, LIST-020 to LIST-022 | The publishing route: sign-in required, each required field, rules acceptance and price refused with its message and nothing kept; a tampered request (status, owner, store, timestamps) creates the account's own pending listing; retries, with the same or changed data or photos, don't duplicate or change it; forged or foreign capabilities are refused; characteristics show with their labels and never as raw keys. |
| LIST-015 to LIST-019 | An account's listing shows the profile's name and opens WhatsApp to the profile's number, also after a change; a listing without an account keeps its own contact and isn't claimed by a new account with the same number. |
| LIFE-001, LIFE-002 | Admin's approval publishes and sets the first publication time; a rejection keeps the listing hidden, shows the reason to the owner and queues the e-mail. |
| LIFE-007, LIFE-008, LIFE-010 to LIFE-012 | A sold listing leaves the catalog and can't be put back on sale; relisted copies go to review, except a Tienda Verificada's. |
| REV-001 to REV-004, REV-006 to REV-009 | Price, description, place and characteristics change at once; category, type, brand and model wait for review while the live version, its characteristics included, stays. A category or type change sends the new type's characteristics, as the edit page does. |
| SDASH-002, SDASH-003 | A store owner changes its details, logo, banner, shop photos and links, and removes them; Admin's fields and outside images are refused. |
| WA-008 to WA-010 | Only signed-in contacts make a buyer selectable when the listing is sold; others aren't; a buyer appears once. |
| SCOPE-001, SCOPE-003 to SCOPE-006, LEGAL-006 | The account pages (Particular and store) offer no checkout, shipping, commission, paid plan, chat or guarantee. |

LIST-008 asks for a category without instrument types. Since the marketplace categories (migration 20261022120000)
every category has instrument types plus "Otro", so the case runs as the closest thing: a pedal sent with "Otro" and
no characteristics is accepted. The owner accepted that as the case on 28 Oct 2026; until then the run printed it as a
NOTE for the owner.

`scripts/acceptance/public-pages.cjs` checks what any visitor reads, with GET requests and no session: PUB-006,
PUB-007, LEGAL-005, LEGAL-006, SCOPE-001 to SCOPE-006, SCOPE-008, SEO-006, SEO-007, LIST-001 and AUTH-019. It is
read-only, so it also runs against production. A sentence that mentions payments or escrow passes when it denies them,
or when it warns that whoever claims them is attempting a scam (the safety tips and the Terms do both):

```sh
node scripts/acceptance/public-pages.cjs https://laria.audio
```

The older integration tests run in the same job and prove the flows they were written for (submissions, the listing
lifecycle, photos, analytics, favorites, alerts, transactions and Admin's reports). The public pages are cached since
A19, so a test that changes what they show outside the app's own routes (Admin's approval, for one) runs the page
refresh job, as production's cron does every minute (`tests/support/page-refresh.cjs`). The favorites test follows
Effortless Laria's price alert rule (save-08): a listing alerts at most once in 24 hours, and only for a drop of 5% or
more.

## What `cases.tsv` records

The run of 27 Oct 2026 (GitHub Actions run 40574393086, commit 30e9c1f) passed every check. The 52 Automated cases
among the 68 are Pass, with the run as evidence. The 14 Manual or Both ones (PUB-006, PUB-007, LIST-011, SEO-006,
SEO-007, LEGAL-005, LEGAL-006, SCOPE-001 to SCOPE-006 and SCOPE-008) keep Not Run with the run added to their evidence,
because a person still reviews them. LIST-008 waited for the owner's call (above), and ALERT-005 stays Blocked (below).
The registry then counted 384 Pass, 154 Not Run and 1 Blocked among its 539 cases. With LIST-008 accepted on 28 Oct
2026 it counts 385 Pass and 153 Not Run. The 343 Effortless Laria cases joined the same day as Not Run, which makes
882 cases with 496 Not Run.

After the review, the checks of AUTH-004, AUTH-008, AUTH-013, LIST-022 and SDASH-003 grew to the whole of each case
(expired links, Supabase's own refusal, a retry with other photos, removing assets and links). They passed in run
40587182089 (commit 675fb6a), which those five cases' evidence adds.

## Not covered here

- ALERT-005 needs the daily digest in a real inbox in production; it stays Blocked until then.
- The wording checks prove what the pages say, not that it is legally sufficient: the legal review of the Terms,
  Privacy and the line under the contact button is still pending.
- The run doesn't touch production. Repeating the write cases there needs disposable production accounts and the
  owner's approval.

## Running it on your machine

It needs Docker, the Supabase CLI and a clean worktree: it writes `supabase/config.toml` and `.env.local`, so it
refuses a folder that has either, or `.env`, `.env.production` or `.env.production.local` (the build would read them
too), and it removes both and stops its stack when it ends.

```sh
git worktree add ../mkt_instrumentos-acceptance origin/main
cd ../mkt_instrumentos-acceptance
pnpm install --frozen-lockfile
bash scripts/acceptance/full-stack.sh /tmp/laria-acceptance
```

Its stack is a project of its own, `laria_acceptance`, on its own ports (55321 for the API, 55322 for the database,
55324 for the e-mail viewer). The CLI names containers and data volumes after the project, so the run never reuses,
stops or wipes another local Supabase, and can run beside one. It refuses to start when one of those ports is taken or a
`laria_acceptance` stack is already there, even just its data volumes, which it would otherwise reuse;
`supabase stop --no-backup --project-id laria_acceptance` removes what a killed run left. It takes the images from the
registry `SUPABASE_INTERNAL_IMAGE_REGISTRY` names, or from the CLI's default, public.ecr.aws, and tries the other two in
turn if that one refuses them.
