# Five EASE workflow fixes — 30 October 2026

All five corrected workflows pass locally. The full remaining-75 local run is **65 Pass / 10 Not Run**, followed by focused offline-replay reruns on the final code. Hosted preview results are **3 Pass / 1 Blocked / 1 Not Run**. The canonical five-case outcome is **4 Pass / 1 Blocked**: EASE-428 retains its hosted migration gate. This is branch verification; production rollout is pending.

| Case | Corrected behavior and observed verification | Hosted result |
| --- | --- | --- |
| EASE-425 | Pausing and **Ya volví** invalidate the authenticated owner's public listing pages. A listing warmed before pausing immediately shows its return date, disables contact, then restores contact on resume. | Protected preview Pass. |
| EASE-428 | Claim-ID links resolve the verified transaction, so the buyer sees **Que lo disfrutes** and the review form. A private atomic claim shows the seller milestone once across reloads and another device. Local UI plus participant/stranger/anonymous SQL checks pass. | **Blocked**: the shared database lacks `20261121130000_ease_transaction_confirmation.sql`. Local Pass does not accept the hosted flow. |
| EASE-609 | **Deshacer** stays available when the last waiting request is sold and the list becomes empty. UI and database checks confirm quantity, WhatsApp / Laria channel, sold state, stock restoration and return to waiting. | Not Run: assisted-commerce pilot remains disabled. Local pilot Pass. |
| EASE-627 | One replay worker updates the latest persistent queue, preserves refusal reasons and idempotency keys, drains new arrivals and retains reconnect signals. If rejection arrives after reconnect, enqueue immediately wakes replay. Refusal remains visible with its SKU after reload; no negative or duplicate stock. | Final protected preview Pass with the original 20-second refusal threshold. |
| EASE-710 | Shared bottom-bar measurement reserves space and scrolls overlapping focused controls clear of the bar. Actual Tab traversal passes at 390 and 1366 px for inventory bulk, repeated-search prompt, comparison tray, Undo and listing contact. Phone footer also clears contact. | Protected preview Pass. |

[Results and assertions](results.json), [all recorded attempts](attempts.jsonl), [verification](verification.json), [cleanup](cleanup.json), [deployment provenance](deployment.json), and [exact registry changes](registry-change.json) retain the environment and revision boundaries. Only the five IDs' status/evidence cells changed. EASE totals are **332 Pass / 1 Blocked / 10 Not Run**; all 882 cases are **717 Pass / 163 Not Run / 2 Blocked**, including the previously blocked unrelated case.

## Replay diagnosis

The original production probe returned the correct stock-refusal response, but its queue was then empty: concurrent snapshot writes could erase a later refusal. Serializing replay and updating the latest queue fixed that loss, but preview timing still exposed a delay. The [timing probe](reconnect-probe.log) and assertion notes show a second network failure settling **one millisecond after** the online event. That event found no queued sale; insertion happened afterward and waited for the 30-second retry timer. The instrumented probe happened to pass within 20 seconds because the timer was already close; the preceding uninstrumented preview failed. Both observations are preserved.

The local [delayed-rejection regression](../../../scripts/acceptance/ease/offline-reconnect-race.cjs) holds the second offline failure until 100 ms after reconnect. It failed before the enqueue wake-up fix and passes afterward, along with the ordinary unmodified offline scenario. The final live rerun uses no artificial fetch delay. Earlier failed previews, the interrupted run and its cleanup recovery remain recorded; a later Pass does not erase them.

## Validation and remaining gates

- **898 unit tests pass**, along with types, lint, production build and CI release-gate checks. CI replays migrations and passes **50 SQL suites** plus database integration/concurrency checks. The local acceptance SQL companion also passes **18 suites against 106 migrations**. The new private foreign key has an index, verified by the database index audit.
- The full local remaining-75 run used the tree incorporated in `78cac8d`; final replay and deterministic-race reruns use `009eefb1a597c068284d585a1d70696990b97851`. Vacation/focus preview checks use `78cac8d`; final replay uses `009eefb` at `dpl_Cv7gBP9quvdrv5hiY8qZxEm7npth`. Later commits only record evidence unless stated otherwise.
- Production `laria.audio` still points to the original `e0a659f` deployment. No hosted schema, production flags or deployment changed. Apply the new migration before deploying this branch, then rerun EASE-428 on the hosted claim/review/milestone flow and the production smoke checks. EASE-609's production pilot remains gated separately.
- Guarded live runs use only disposable accounts and owned fixtures, fence queued notifications and intercept WhatsApp opens. Scoped Vercel OIDC authenticates only the verified preview origin after the ownership guard; offline routing cannot send writes through that transport. No share URL or protection-setting change was made. [Cleanup proof](cleanup.json) lists every batch and the independent final zero-residue check.
- Mostrador still logs the pre-existing React hydration error #418 seen in the original production/local evidence. These passing workflow assertions do not establish a clean browser console. Offline failures, deliberate HTTP 400 stock refusals, incidental analytics guard blocks and preview prefetch/CSP messages remain in raw records.
- The [ten owner/device/legal checks](../ease-2026-10-30/manual-testing.md) remain Not Run: EASE-164, 166, 512, 546, 549, 703, 712, 714, 716 and 719. No manual acceptance was inferred. No acceptance XLSX was read or generated.

## Reproduce

Use the [documented isolated local setup and live safeguards](../../../scripts/acceptance/ease/README.md), with the new migration installed locally and a separate pilot process for EASE-609:

```sh
node scripts/acceptance/ease/run.cjs scripts/acceptance/ease/remaining.cjs --only=EASE-425,EASE-428,EASE-609,EASE-627,EASE-710 --results=/tmp/ease/five-local.jsonl
node scripts/acceptance/ease/run.cjs scripts/acceptance/ease/offline-reconnect-race.cjs --results=/tmp/ease/reconnect-race.jsonl
npm test
npm run typecheck
npm run lint
npm run build
python3 -B acceptance/validate.py
python3 -B -m unittest discover -s acceptance -p 'test_*.py'
```

A protected-preview run requires the verified URL, scoped development OIDC in memory and the same disposable-account guards. Check the hosted migration prerequisite before attempting EASE-428. Do not enable a production pilot to run a local-only case.
