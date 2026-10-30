# PR #86 production acceptance — 30 October 2026

**PR #86 is merged and deployed to https://laria.audio.** Migration `20261121130000_ease_transaction_confirmation.sql` is installed. **EASE-428 passes in production**, including buyer confirmation from a claim link, the review form, the first seller milestone, and suppression after reload and on another device.

| Release | Verified result |
| --- | --- |
| Target | Production, Next.js, https://laria.audio |
| Merge / tested application | `80730ea73cfeff8d611224de959c610bb0e7dc49` |
| Deployment | `dpl_HTKPXeSf8ybZ6YN54x2y68E6hLXH`, READY; domain assignment verified before and after live checks |
| Database | `hswkjandadscduodejig`; exactly the requested migration applied through the standard linked migration workflow |
| Live acceptance | **40 Pass / 7 Not Run / 0 Fail / 0 Blocked**, across 47 unique eligible cases from the remaining-75 suite |
| Cleanup | **61 disposable accounts removed** in two batches; all leftover counters zero, plus an independent final sweep that removed zero |
| Health / runtime | `/api/health` returns `{"status":"ok"}` before and after checks; exact-deployment error-level log scan over the last hour returned zero records |

The initial 36-account batch, focused offline rerun and 11 signed-out cases produced **48 observations**. [results.json](results.json) selects the latest observation for each case. [attempts.jsonl](attempts.jsonl) and the three logs retain the initial failed offline setup; it has not been erased.

## Corrected workflows

| Case | Production observation |
| --- | --- |
| EASE-425 | A warmed public listing shows the vacation return date immediately, disables contact, and restores contact after **Ya volví**. |
| EASE-428 | The buyer sees **Que lo disfrutes** and can review after confirming through a claim-ID URL. The seller's milestone RPC returns true on first visit, then false after reload and from another browser/device. |
| EASE-627 | The second offline sale is demonstrably persisted before reconnect. Reconnect records waiting stock once; a refused sale retains its SKU and reason within the original 20-second deadline and after reload. No negative or duplicate stock. |
| EASE-710 | Actual Tab traversal at 390 and 1366 px clears the bulk bar, alert prompt, Undo, comparison tray and listing contact. The phone footer also clears its contact bar. |
| EASE-609 | The release contains its empty-list Undo fix. It remains **local pilot Pass / production Not Run** because assisted commerce is disabled. No pilot flag changed. |

Only the five fixes' canonical status/evidence cells changed. **EASE-428 moves from Blocked to Pass**; the other four retain Pass with current release provenance. EASE totals are now **333 Pass / 10 Not Run**. All 882 registry cases total **718 Pass / 163 Not Run / 1 previously Blocked**. Unrelated statuses, requirements, IDs and ownership are preserved. See [registry-change.json](registry-change.json).

## Offline test setup correction

The first production EASE-627 attempt reconnected immediately after clicking its second sale. Playwright's asynchronous ownership routing had not yet delivered the offline rejection to the browser. That submission consequently received a **direct online stock refusal**, with its cart intact; it never reached the queued-refusal scenario. The [initial screenshot](screens/EASE-627-error-0.png) shows that state.

The corrected test snapshots the previous queue keys and waits for the second sale's new key to be persisted while still offline before reconnecting. This adds an explicit precondition assertion. The **20-second refusal deadline stays unchanged**. The rerun passes and its [reloaded refusal](screens/EASE-627-refusal-survives-reload.png) remains visible.

The separate local `offline-reconnect-race.cjs` regression deliberately retains rejection **after** reconnect, using `offlineRejectionAfterReconnect` to select that ordering. Both the normal queue flow and this regression pass locally. **17 targeted unit tests and lint pass** for the harness correction. Application behavior, migrations and production flags were unchanged by this test correction; `results.json` records the harness revision and file hashes separately from the deployed application revision.

## Migration and verification

The [dry run](migration-dry-run.log) listed exactly one migration; the [apply log](migration-apply.log) confirms it was applied. [migration.json](migration.json) verifies its history entry, milestone RPC, private table/index, RLS, authenticated execution, denied anonymous execution and absence of browser table grants. The table cascades with its seller and transaction, so owned test rows are removed with their fixtures.

[ci.json](ci.json) records successful CI and full-stack acceptance on the merged application: **898 unit tests**, types, lint, build, **50 SQL suites** and database integration checks. The prior fix report retains the separate 18-suite/106-migration acceptance companion. [verification.json](verification.json) also records the focused local browser and harness regressions, production health, bounded runtime scan and existing monitoring configuration. No Vercel drains are configured; monitoring settings were unchanged.

Live account mode kept its ownership guard, notification fence and per-case cleanup. Signed-out checks used the read-only guard; WhatsApp opens were intercepted. [cleanup.json](cleanup.json) records both account batches and the independent sweep. The prior follow-up's 21 accounts are historical and are not counted again in this release's 61.

Mostrador's pre-existing React hydration error #418, intentional offline errors and stock-refusal HTTP 400s remain in raw browser records. Passing workflow assertions do not establish a clean browser console.

## Remaining manual and live preconditions

The seven live Not Run results are EASE-164 and 166 (native share sheets/WhatsApp status), 703 (spoken screen-reader output), 714 (Android install and shortcuts), 716 (native gallery share target), 719 (native push delivery), and 701 (fast-navigation precondition). The slow-navigation branch of EASE-701 passes; the observed cached click took **124.1 ms**, above its under-100-ms precondition. Its prior local Pass remains valid and no new live fast-branch Pass is inferred.

The canonical [ten-case owner checklist](../ease-2026-10-30/manual-testing.md) remains unchanged: **EASE-164, 166, 512, 546, 549, 703, 712, 714, 716 and 719**. Admin flows, background jobs, legal submissions, final imports and disabled pilots stay local or separately gated. Product inventory Excel/CSV exports were checked; the acceptance XLSX was neither read nor generated.

## Reproduce

Use the [documented live credentials and safety setup](../../../scripts/acceptance/ease/README.md), one catalog runner at a time:

```sh
scripts/acceptance/ease/live-run.sh accounts scripts/acceptance/ease/remaining.cjs --only=EASE-428,EASE-425,EASE-627,EASE-710
scripts/acceptance/ease/live-run.sh both scripts/acceptance/ease/remaining.cjs
```

Use the isolated local stack for the rejection-after-reconnect regression:

```sh
node scripts/acceptance/ease/run.cjs scripts/acceptance/ease/offline-reconnect-race.cjs --results=/tmp/ease/offline-race.jsonl
python3 -B acceptance/validate.py
python3 -B -m unittest discover -s acceptance -p 'test_*.py'
```
