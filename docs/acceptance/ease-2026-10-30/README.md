# Remaining 75 EASE cases — 30 October 2026

Historical snapshot. The [five-case fix follow-up](../ease-remaining-fixes-2026-10-30/README.md) records later local/preview verification and the remaining hosted migration gate.

**60 Pass · 5 Fail · 10 Not Run (owner/manual).** All 75 received local checks or an explicit manual gate; live portions ran for 44: 34 Pass, 3 Fail and 7 Not Run. The canonical acceptance source remains [acceptance/cases.tsv](../../../acceptance/cases.tsv). This directory stores the evidence snapshot.

Only the original 75 rows’ status and evidence changed. EASE totals are now **328 Pass / 5 Fail / 10 Not Run**. Overall registry totals are **713 Pass / 5 Fail / 163 Not Run / 1 previously Blocked**. No unrelated acceptance state changed.

[Manual testing checklist](manual-testing.md) lists the exact ten owner/device/legal checks, steps and required evidence.

## Failures requiring engineering work

| ID | Observed result | Boundary / next fix |
| --- | --- | --- |
| EASE-425 | **Ya volví** clears paused_until in the database, but the public listing still says **Vuelve el…** and disables contact after reloads for over 45 seconds, locally and live. | VacationMode.save refreshes the account route without invalidating the public listing’s cached data. Refresh affected public pages on both pause and resume. |
| EASE-428 | Confirming a purchase through its claim-ID URL reaches **Compra confirmada**, with no **Que lo disfrutes** panel or review form, locally and live. | get_transaction_detail loads the verified transaction for transaction-ID and listing-ID references, but does not load it after finding a claim by claim-ID. Resolve the transaction by claim_id before returning detail; verify the closing panel and review form, then the one-time seller milestone. |
| EASE-609 | Selling the last waiting request records the sale but removes **Deshacer** when the waiting list becomes empty. | PurchaseRequestList returns its empty state before UndoNotice. Render the undo notice with the empty state. Local pilot check; production pilot remains off. |
| EASE-627 | Local passed. Live reconnect records stock once, but a later refused offline sale does not retain its reason within the 20-second observation window. | Investigate live queue persistence and concurrent flush completion; server returned 400, with no negative or duplicate stock. Root cause is not established. |
| EASE-710 | Actual Tab traversal leaves controls behind the repeated-search prompt at 390 and 1366 px and behind the desktop comparison tray. | Ensure keyboard focus scrolls clear of each overlay. Inventory bulk, Undo, listing contact and the phone footer passed. Earlier footer/setup failures in raw attempts were corrected and are superseded. |

Selected screenshots are in [screens/](screens/). The focus report identifies each covered control; EASE-609 includes the empty waiting list. The pause screenshot is the latest retained failed capture from the earlier current-source attempt. Screenshot filenames are reused by the harness; they are latest captures, not immutable historical images for every attempt.

## Evidence and provenance

- [results.json](results.json): newest local/live result for every scoped ID, concrete assertions and manual gates.
- [attempts.jsonl](attempts.jsonl): all 209 observations in timestamp order, including superseded fixture/selector/timing errors. Auth URL tokens and JWTs are redacted.
- [verification.json](verification.json): **889 unit tests passed**, **18 SQL suites passed against 105 migrations**, and clean lint for the changed harness files.
- [sql.json](sql.json): suite names and hashes.
- [cleanup.json](cleanup.json): three guarded account batches removed **61 accounts**. All eight per-batch leftover counts are zero; an independent final cleanup found zero accounts, profiles, listings, stores, uploads or queued emails.
- [registry-change.json](registry-change.json): exact changed IDs, permitted columns and resulting registry totals.

Every final local observation used source **e0a659fb48ef0d0db0256ae9aee27a0a14b0a7be**. Earlier attempts used 17bc39f and are identified individually. The 25 observations made before the source update were rerun successfully on e0a659f. SQL schema did not change between those revisions.

The Vercel alias and provider deployment were verified at the start and end: **laria.audio → dpl_GfoVXt7QB6xy4FSHhA4FEv1QDUkj**, READY production, commit **e0a659f**. This task changed no application behavior, schema, migrations, production flags or deployment.

Local checks used an isolated Supabase project, real Auth/Storage and the current production build at localhost:3300. Pilot-only purchase-request checks used a second local process at localhost:3302. Tests exercised real UI and database results. Imports committed through the same authenticated public RPCs after real upload/mapping/review UI; this is stated in their results. Reminder jobs and read-failure injection ran only locally.

Live visitors used the read-only guard. Live account checks used disposable accounts, owned-data guards, fenced queued notifications and per-case cleanup. WhatsApp opens were intercepted; no messages were sent. Admin moderation, background jobs, auth inbox actions, final publication/imports, complaint submissions and inactive pilot flows stayed local.

For EASE-701 the fast branch passed locally at **17.2 ms**. The measured live cached navigation took **121.6 ms**, so that branch did not meet the under-100-ms precondition and remains live Not Run; the live slow-navigation bar passed. The earlier assertion that assumed every cached click was fast is retained as superseded evidence.

## Reproduce

See [harness setup and safety](../../../scripts/acceptance/ease/README.md). The scoped entry point is:

    node scripts/acceptance/ease/run.cjs scripts/acceptance/ease/remaining.cjs --results=/tmp/ease/remaining-local.jsonl

Supply the isolated local BASE/PGURL/Auth/Storage fixtures and PILOT_BASE. Seed fixtures/catalog-brands.sql before starting the app, so a previously cached empty reference catalog does not mask the brand suggestions. The HEIC fixture is a real container generated from the repository’s own icon with macOS sips.

For an authorized guarded live run with the documented credentials available in the environment:

    scripts/acceptance/ease/live-run.sh both scripts/acceptance/ease/remaining.cjs

Run one live catalog runner at a time. The runner excludes local-only and pilot definitions. Physical camera/scanner hardware, native OS share/install/push behavior and spoken screen-reader output are not established by emulation. EASE-626 passed through typed barcode input, an allowed alternative in that case.

After registry edits:

    python3 -B acceptance/validate.py
    python3 -B -m unittest discover -s acceptance -p 'test_*.py'
    git diff --check

Product inventory Excel/CSV exports were tested. The canonical acceptance workbook was neither read nor generated.
