# Laria V1 go-live infrastructure checklist

This checklist records infrastructure work that must be complete before Laria opens the marketplace to real users. It does not change the frozen V1 product behavior in `docs/functional-spec.md`.

## Marketplace email worker — mandatory

Scheduled since launch audit A25: Laria is on Vercel Pro, and `vercel.json` has Vercel Cron call `GET /api/internal/email/process` every 5 minutes with `Authorization: Bearer ${CRON_SECRET}` (Vercel adds it from the project's `CRON_SECRET`). The claim cancels e-mails past their kind's maximum age, sends an account's own e-mails before reminders and alerts, and stays within a daily limit (80, `laria_private.set_email_daily_limit`) so the backlog queued while no worker ran is never sent at once. The push worker runs at the same cadence and the import cleanup daily (`docs/owner-manual.md`, "E-mail, push and import jobs").

1. ~~Provision a supported automatic scheduler for the existing protected worker route.~~ Vercel Cron.
2. ~~Start with an approximately 5–15 minute cadence.~~ Every 5 minutes.
3. ~~Verify the scheduler supplies `Authorization: Bearer ${CRON_SECRET}` and exposes no secret to browser code or logs.~~ Vercel Cron sends the project's `CRON_SECRET`; the routes compare it in constant time.
4. Run an empty protected scheduler smoke.
5. Verify a new Immediate alert is delivered automatically without manual invocation.
6. Verify retryable provider failure is picked up automatically without a duplicate logical send.
7. Verify completed `America/Lima` daily windows are prepared and sent once, with no empty digest.
8. Review Resend sending limits, bounce/complaint handling and current deliverability signals. On a paid Resend plan, raise the daily limit.
9. ~~Update architecture/operations documentation to remove the pre-go-live manual-worker limitation.~~ Done with A25.

Worker readiness (reviewed in Sprint 9): `GET /api/internal/email/process` is `force-dynamic`, `maxDuration = 60`, authorizes only `Authorization: Bearer ${CRON_SECRET}` with a timing-safe comparison, prepares completed Lima daily windows, and processes at most four claimed batches of 25 per invocation. Claims, retries and daily-window preparation are idempotent in Postgres. `ALERT-005` stays Blocked until the natural daily-window owner test produces real evidence.

## Public discovery and SEO — mandatory

1. Confirm production `VERCEL_ENV=production` so pages are indexable; previews must keep `robots.txt` = `Disallow: /`, empty sitemap and `X-Robots-Tag: noindex`.
2. Set `NEXT_PUBLIC_SITE_URL=https://laria.audio` (or leave unset for the same default) and redirect secondary domains (`www.laria.audio`, `laria.pro`, `www.laria.pro`, `*.vercel.app`) to the canonical host.
3. Before releasing, confirm no existing listing uses a reserved category slug (expected 0 rows): `select slug from public.listings where slug in ('guitarras','bajos','baterias','platillos','microfonos','pedales','amplificadores','interfaces-de-audio');`.
4. After release, fetch `/robots.txt` and `/sitemap.xml` in production, spot-check a category page, an approved listing, a sold listing (`noindex`) and `/mi-cuenta` (`X-Robots-Tag: noindex`).
5. Register `laria.audio` in Google Search Console and submit `https://laria.audio/sitemap.xml`.

## Legal and safety content — mandatory

1. `NEXT_PUBLIC_CONTACT_EMAIL=laria.audioperu@gmail.com` was configured in Vercel Production before the remediated build on 2026-09-27. The Terms and Privacy pages now render it; `NEXT_PUBLIC_*` values are inlined at build time.
2. Owner review of `/terminos`, `/privacidad`, `/articulos-prohibidos` and `/consejos-de-seguridad` against real operations (`LEGAL-005`, `LEGAL-006` are manual).
3. Recommended: review by a Peruvian lawyer, including operator identity (titular del banco de datos) and any registration duties under Ley N.° 29733 before collecting real-user data at scale. The pages make no regulatory certification claims.

## Sprint 9 release gate — failed, 2026-09-27

The candidate `bcf9e6142a1c86caa3feb8ee24cd23a126a3cc42` was withdrawn and production restored to exact application SHA `bb16e319540a9d6721e990bc1e9900825c7473ac`. Homepage OG metadata, Admin store runtime failure and a signup timeout need resolution/retest before another gate. No scheduler or migration changed. Official contact configuration, full production SEO smoke and owner/manual acceptance remain open; see `docs/sprint-9-production-release-gate.md`.

## Sprint 9 automated production re-gate — passed, 2026-09-27

The remediated application commit `bbb586bc0457941da92025766e266fc893ebf474` deployed READY after Production contact email configuration. Live SEO, Admin, signup timing, legal contact, account-navigation and POST logout checks passed; the release-gate report records the evidence and the data-dependent empty-category waiver. Hosted Supabase remained 19/19 synchronized, no scheduler was enabled, and disposable QA users were removed. At this re-gate, `SEO-005` still lacked enough live category inventory for pagination; a later disposable-inventory check closed it. Owner review of `SEO-006`, `SEO-007`, `LEGAL-005` and `LEGAL-006` is still required, and `ALERT-005` remains Blocked pending its natural daily test. Do not call V1 launch acceptance complete yet.

## Sprint 9 SEO-005 and category URLs — production follow-up, 2026-09-27

`SEO-005` is Pass on real `laria.audio` pagination and filter evidence: 21 marked temporary guitar listings raised the public category count from four to 25, the two rendered pages showed 24/1 distinct cards in stable order, and exact-ID/marker cleanup returned zero fixtures and restored the count to four. The canonical evidence is [SEO-005 in the acceptance registry](../acceptance/cases.tsv) and the [production run record](evidence/sprint-9-production-gate/seo-005-pagination.json). Acceptance was then **332 Pass / 70 Not Run / 1 Blocked / 403 total**.

The category URL follow-up at `49a38e5be7b6e195617a841fe1c572420769dab0` deployed READY as `dpl_6TwxfiFvinP8LYUgwrVM8UJ6pnGA`; `laria.audio` still pointed to that SHA on 2026-09-30. Global category links and whole-category single-type links use the existing Spanish landing pages. Narrower type and `other` links remain filtered catalog URLs. The catalog form and canonical/noindex rules did not change. `SEO-006`, `SEO-007`, `LEGAL-005` and `LEGAL-006` still need owner review; Search Console registration and the launch scheduler remain open.

## Release-gate acceptance run, 2026-10-27 (launch audit A14)

The Acceptance workflow (`.github/workflows/acceptance.yml`, [the full-stack acceptance run](acceptance/full-stack.md))
runs the release-gate cases end to end on a full local Supabase stack, on every pull request into `main` and every push
to it. Its run of 2026-10-27 (GitHub Actions run 40574393086) passed every check, so the 52 Automated cases A14 found
unrun are Pass. Still open: a person's review of the 14 Manual or Both cases (PUB-006, PUB-007, LIST-011, SEO-006,
SEO-007, LEGAL-005, LEGAL-006, SCOPE-001 to SCOPE-006 and SCOPE-008), the owner's call on LIST-008 and the natural
daily test of `ALERT-005`. Current acceptance is **384 Pass / 154 Not Run / 1 Blocked / 539 total**.

## Catalog schema and reduced catalog — production release, 2026-10-09 (passed)

Candidate `main`: `f04e909` plus the 25 catalog migrations and these docs, with no application change. The owner
confirmed the database prerequisites on 2026-10-09: Postgres `17.11.0.003` with supautils `3.4.4`, all 25 catalog
migrations applied (44 recorded), and the reduced catalog loaded. The `catalog_products` comment identifies the
production profile, 170 brands with products, 20,386 products, and checksum prefix `2e0bd5efd20ed753`.

The release gate passed: `a377bce06673400d66664b70534fdcfbb6761eda` was pushed to `main` and deployed READY
as `dpl_9qxJS8KgYDfXR66yUV8i3Wis9ybX` on `laria.audio`. The public and auth-page audit, seven exact anon catalog
counts, catalog lookup/Jev probes, and anon Admin-RPC refusal/recovery passed. Authenticated Admin pages were Not Run
because no Admin session was provided for this gate. See [the catalog production release report](catalog-production-release-gate.md)
for evidence and limits. This catalog release does not close the separate V1 launch dependencies above.

## Release history

- 2026-10-09 — UX-1–UX-3 redesign: application/audit SHA `50963fb` deployed READY as `dpl_57FCmnsw4EyQxCB4XwKkeZniKMfx`; read-only production SEO and 390/1440 px browser smoke passed with documented data/session waivers; see [the UX production release gate](ux-production-release-gate.md).
