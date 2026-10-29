# EASE regression fixes — 29 October 2026

All 27 failures from the [previous report](../ease-2026-10-29/README.md) have passing candidate evidence. The final runtime matches code revision `bac6e3d` across 592 files. The full run used `0063533`; comparison/privacy and draft changes received scoped reruns on later builds. Source hashes and the exact lineage are in [verification.json](verification.json).

The live run exercised **laria.audio at `12e1d73`**, independently verified at its start and end. That production revision predates these fixes. Its remaining failures are retained in the canonical registry; local candidate success does not establish production acceptance.

## Results

| Evidence | Outcome |
| --- | --- |
| Local browser checks | 218 Pass, 0 Fail, 4 Not Run across 222 cases |
| Candidate coverage, including dedicated supporting checks/audits | 268 Pass, 75 Not Run across 343 EASE cases |
| Node unit tests | 887 passed |
| SQL suites | 18 passed; all 105 migrations applied, including the legacy-phone backfill probe |
| Migration replay | All migrations apply in one session; no temporary helpers remain; scratch database removed |
| Accessibility | 116 pages and 27 open states, four roles at 390/1366 px: zero WCAG violations; comparison also checked at both sizes |
| Registry tests | 13 tests, zero failures; two dormant XLSX tests skipped |
| Live checks | 139 Pass, 13 Fail, 57 Not Run across 209 eligible cases |
| Canonical EASE registry after reconciliation | 255 Pass, 13 Fail, 75 Not Run |

The four local Not Run cases are native sharing/WhatsApp Status, the OS print dialog and legal sign-off (EASE-164/166/546/549). EASE-710 remains Not Run because the complete focus sweep still needs comparison-tray, alert-prompt and Undo scenarios. Seventy IDs have no dedicated recovered evidence; no manual/owner acceptance or workbook freeze was inferred. Only the original 27 rows’ status/evidence fields changed; every other row, requirement and ID is unchanged. The complete registry remains 882 cases: 640 Pass, 13 Fail, 228 Not Run and one pre-existing Blocked.

## Original failures

“Local” includes the page/state audits for EASE-711/713. Live failures below describe the older production release.

| Case | Resolution or observation correction | Local | Live |
| --- | --- | --- | --- |
| EASE-013 | Filter menu and landing types using current listing counts. | Pass | Fail |
| EASE-027 | Wait for the actual browser cache variant to contain the controlled publication before checking the previous visit. | Pass | Pass |
| EASE-028 | Read a common anonymous public snapshot; match history locally and put comparison choices in URL fragments. | Pass | Fail |
| EASE-111 | Poll for a nonempty persisted notification result instead of stopping on an empty array. | Pass | Pass |
| EASE-160 | Wait for the current image dimensions before measuring zoom bounds. | Pass | Pass |
| EASE-161 | Keep the original pointer anchor through a wheel/trackpad gesture, including intermediate clamping. | Pass | Pass |
| EASE-168 | Provide category-specific image routes and explicit Open Graph/Twitter image metadata. | Pass | Fail |
| EASE-305 | Wait for account-draft restoration before editing; a failed resume preserves the draft and offers retry. | Pass | Fail |
| EASE-526 | Expose working sort links when JavaScript is disabled, on desktop and phones. | Pass | Fail |
| EASE-601 | Keep settled searches in browser history and restore the input when navigating Back. | Pass | Fail |
| EASE-607 | Keep the inventory client mounted after the last matching row disappears, preserving Undo. | Pass | Fail |
| EASE-617 | Confirm all variant rows and stock; the diagnostic rerun passed without an API failure. | Pass | Pass |
| EASE-618 | Name skipped SKU in the bulk result, grouped with their reason. | Pass | Fail |
| EASE-711 | Place bulk actions above the table in document flow and keep row targets large enough. | Pass | — |
| EASE-713 | Use ink text for metadata inside selected chips; rerun all pages and open states. | Pass | — |
| EASE-752 | Use the purchase safety sheet’s actual continuation label and wait for contact persistence. | Pass | — |
| EASE-755 | Pass owner state to the store header and hide self-follow controls. | Pass | Not Run |
| EASE-756 | Use the shared availability label “Vendido” in both recent-view renderers. | Pass | Fail |
| EASE-757 | Create the alert before the matching publications so its count can be compared with the shared visit. | Pass | Pass |
| EASE-763 | Read the RUC from its form input while proving owner reads and anonymous denial. | Pass | — |
| EASE-764 | Drop the temporary migration rewrite helper after its final use. | Pass | — |
| EASE-829 | Restore focus after the dialog is removed. | Pass | Fail |
| EASE-845 | Return the feed viewport to the restored listing when Undo is pressed. | Pass | Fail |
| EASE-850 | Restore WhatsApp focus after dismissing the safety dialog. | Pass | Fail |
| EASE-854 | Move focus to the newly selected heading when using the feed bar. | Pass | Fail |
| EASE-867 | Inspect filtered table rows separately from the recent-movement summary. | Pass | — |
| EASE-880 | Place 26 filler listings inside the seven-day window before the older reserved listing. | Pass | Pass |

The source changes include the [saved-draft form](../../../components/sell-listing-form.tsx), [inventory table](../../../components/inventory/inventory-table.tsx), [comparison view](../../../components/compare-listings.tsx), [public snapshot loader](../../../lib/public-listing-snapshot.ts), media/feed controls, category metadata and acceptance helpers.

Two additional observation corrections were verified: upload labels and progress bars are sampled coherently (EASE-303), and the slow-network image check visits the initially cached adjacent photos in both directions (EASE-163). A second forward step on a four-photo listing can reach a photo whose background fetch has just started; the probe does not claim that every unseen image is already cached. Comparison differences and taste checks now use controlled local fixtures. The draft check injects a failed resume followed by a delayed successful response and proves that photos and fields survive.

## Live safeguards and cleanup

Only synthetic `delivered+ease-…@resend.dev` accounts were used. WhatsApp was intercepted, public writes were guarded by owned IDs, publication that could match a real buyer alert was rolled back, queued synthetic email/push work was fenced, and business data/uploads were removed after each case. Global jobs, final publication/import writes, complaint submissions and paid AI calls were not exercised live.

The two account batches removed **145 test accounts**. Each batch verified zero remaining accounts, profiles, listings, stores, storage objects, queued emails, stock movements and inventory changes. The independent final recovery check also verified zero remaining synthetic accounts/data. No outside-recipient notifications or emails were observed. The first independent attempt timed out during unrelated CLI telemetry; the completed batch already showed zero leftovers, and the final independent check passed with telemetry disabled. Full counts are preserved in verification.json.

## Release requirements and limits

Production release remains pending. Apply `20261121110000_recently_viewed_privacy.sql` and `20261121120000_ease_public_card_routes.sql` before deploying the application, then rerun the 13 still-failing live cases against that deployed revision. The first migration is an anonymous, bounded public projection, with the same visibility as existing public cards; it adds no table writes. The second extends the error-monitor route allowlist.

The device reads every public snapshot page and filters locally, so requests reveal neither the private selection nor where it matched. This trades bandwidth for privacy; a shared compressed snapshot may be needed as the catalog grows. Comparison requires JavaScript; its no-JavaScript notice is explicit. Pilot flows and AI were exercised only locally, using the existing pilot flag and local AI fake. Device/owner gates and the uncovered IDs above remain open.

## Reproduction

Follow the [harness setup](../../../scripts/acceptance/ease/README.md) for a real isolated local Supabase/Auth/Storage stack, demo data, Playwright and the app/pilot/AI bases. The local PostgreSQL wrapper must stream temporary `-f` SQL files into Docker. No production credentials belong in committed artifacts.

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
python3 -B acceptance/validate.py
python3 -B -m unittest discover -s acceptance -p 'test*.py'
node scripts/acceptance/ease/sql-suites.cjs /tmp/ease-sql.json
node scripts/acceptance/ease/run.cjs scripts/acceptance/ease/checks-{a,b,c,d,e}.cjs --results=/tmp/ease/local/results-all.jsonl
```

Set the documented local runtime variables before browser commands. Both accessibility scripts run against the local pilot build; fake AI remains local. Reconciliation supports `--registry-only` for a focused update and records candidate/live revisions separately. Raw logs and screenshots remain in `/tmp/laria-ease/fixes` on the testing Mac; [results.json](results.json) retains assertion-level evidence without credentials.
