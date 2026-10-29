# EASE acceptance evidence — 28–29 October 2026

Recovered checkout: `ux/ease-acceptance-run`. Local application revision: `ba05b79842eb81178926425ab79a012659d4a797`.
Live target: https://laria.audio. Vercel showed production commit `22332d5c7c50e7ce7840c9c2749600742366b8a6` during the run; recorded attempts may span deployments. This is a QA evidence PR; failed acceptance checks remain open.

## Outcomes

| EASE status | Cases |
| --- | ---: |
| Pass | 241 |
| Fail | 27 |
| Blocked | 0 |
| Not Run | 75 |

All 222 implemented browser cases were executed locally; 209 IDs were attempted live. The recovered harness implements 222 of the 343 registered IDs, with 121 missing dedicated cases. Explicit supporting unit/SQL mappings cover 48 additional automated IDs, and accessibility audits cover three more IDs (including a partial focus sweep).

70 IDs still have no dedicated evidence in this run. Manual/owner acceptance was not inferred from source assertions. Not Run also includes incomplete workflows and unavailable device/data prerequisites.

Full assertion-level outcomes: [results.json](results.json). Tooling, SQL suite hashes, coverage gaps and cleanup proof: [verification.json](verification.json).

## Verification

- 872 unit tests passed on the recovered checkout; all 887 passed in a disposable copy combining its source with main (`12e1d73`). Lint, TypeScript and the production build passed.
- 18 isolated SQL suites passed, including real authorization/RLS denials and the phone backfill over legacy fixtures.
- All 103 migrations applied in one session. EASE-764 failed because `pg_temp.find_fix` remained; the disposable cluster was removed.
- Accessibility: 116 page checks and 27 open-state checks. `/tiendas` has color-contrast violations at 390 and 1366 px. The desktop inventory bulk bar partly covers an Editar target. EASE-711 and EASE-713 fail; EASE-710 remains Not Run because the focus sweep was partial.
- Registry codec/reconciliation tests passed (two dormant XLSX tests skipped); TSV validation passed. Only EASE status/evidence fields changed. No workbook was generated.

## Live safeguards and cleanup

Only synthetic `delivered+ease-…@resend.dev` accounts were created. WhatsApp opens were intercepted. No complaint-book entries were submitted. Background jobs, final publication/import writes, demo/Admin sign-in and paid AI calls were not exercised live. Fixture email/push work was cancelled and run-owned data was removed after each case. Cleanup failures halted the affected batches and were recovered before resuming.

The final batch and the independent recovery check both report zero remaining accounts, profiles, listings, stores, uploads and queued emails. Batch cleanup also verified zero owned stock movements and inventory changes. No outside-recipient notifications or emails were observed in recorded checks.

## Harness corrections

Real GoTrue fixtures now include identities and empty token fields. Upload setup can run without permitting publication; resized image bytes are inspected only after ownership verification. Storage deletion uses the API and is checked against actual objects. Cleanup handles revision-photo and notification dependencies plus append-only owned inventory ledgers. Safety exceptions remain inconclusive rather than false business-rule failures.

Selectors and required photo counts were corrected. The checks now honor the canonical 30-day Descubrir fallback for sparse weeks, and missing live inventory prerequisites are explicit. Clipboard behavior in EASE-317 is simulated; the OS clipboard and native share sheet are not accepted from that simulation.

## Failed checks to triage

These are observed check failures, including possible environment/data or harness limitations, rather than a claim that every item is a confirmed product defect. Assertion details and errors are retained per environment in results.json.

| ID | Requirement | Failed environment(s) |
| --- | --- | --- |
| EASE-013 | No brand or type link leads to an empty page | local |
| EASE-027 | "Nuevo desde tu última visita" | live |
| EASE-028 | Personal signals stay on the device | local |
| EASE-111 | Back-in-stock alert fires once | live |
| EASE-160 | Pinch and double tap zoom the lightbox photo | live |
| EASE-161 | Every zoom gesture has a button and a key | local |
| EASE-168 | Every page and category link has a Laria preview | local |
| EASE-305 | A saved draft opens on another device | live |
| EASE-526 | A store page searches by brand and sorts | local, live |
| EASE-601 | The table follows the search box as the owner types | local, live |
| EASE-607 | Bulk threshold, category, archive and reactivate batches can be undone | local, live |
| EASE-617 | Duplicar SKU, Crear y agregar otro and variants create SKUs without retyping | live |
| EASE-618 | Every SKU that matches a view can be selected and changed at once, up to 2,000 | local, live |
| EASE-711 | Touch targets are at least 24 px | accessibility audit |
| EASE-713 | Every page passes WCAG 2.2 AA checks | accessibility audit |
| EASE-752 | Solicitar compra with a quantity opens WhatsApp at once | local |
| EASE-755 | Small meetings between batches | local |
| EASE-756 | One Vistos recientemente | local, live |
| EASE-757 | One last visit | local, live |
| EASE-763 | Store details stay private and the store pages still work | local |
| EASE-764 | Every migration applies over one connection | local |
| EASE-829 | The offer sheet works on a phone and with a keyboard | local, live |
| EASE-845 | No me interesa hides a listing in Descubrir on this device | local, live |
| EASE-850 | The safety sheet comes first for S/ 1,000 or more | local, live |
| EASE-854 | Focus and announcements follow the screen | local, live |
| EASE-867 | A store question opens existing Inventario filters | local |
| EASE-880 | Descubrir says Reservado | live |

## Limits and reproduction

The live catalog is small; some similarity, search, city-filter, media and feed cases require fixtures unavailable in production. Final submission/import flows and mail/push workers were verified locally. Pilot behavior was tested only on the local pilot app; AI behavior used the local fake. HEIC, installation, hardware scanners, native sharing/push and remaining manual workflows require separate device or owner acceptance. Native sharing/WhatsApp Status (EASE-164/166), print dialogs (EASE-546), legal sign-off (EASE-549), and the partial focus sweep (EASE-710) remain Not Run. The full registry is not ready for a freeze based on this run.

See [the harness README](../../../scripts/acceptance/ease/README.md) for setup, group commands, targeted reruns, SQL/a11y checks and conservative TSV reconciliation. Raw logs and screenshots remain under `/tmp/laria-ease` on the testing Mac and are not published with credentials.

IDs without dedicated evidence: EASE-203, EASE-204, EASE-205, EASE-206, EASE-207, EASE-208, EASE-210, EASE-211, EASE-212, EASE-216, EASE-220, EASE-222, EASE-223, EASE-227, EASE-228, EASE-307, EASE-311, EASE-400, EASE-401, EASE-402, EASE-403, EASE-404, EASE-406, EASE-408, EASE-409, EASE-410, EASE-411, EASE-413, EASE-414, EASE-415, EASE-418, EASE-419, EASE-420, EASE-421, EASE-423, EASE-424, EASE-425, EASE-426, EASE-427, EASE-428, EASE-430, EASE-431, EASE-500, EASE-501, EASE-502, EASE-506, EASE-511, EASE-512, EASE-608, EASE-609, EASE-611, EASE-614, EASE-615, EASE-616, EASE-619, EASE-620, EASE-625, EASE-626, EASE-627, EASE-701, EASE-702, EASE-703, EASE-706, EASE-707, EASE-709, EASE-712, EASE-714, EASE-715, EASE-716, EASE-719.
