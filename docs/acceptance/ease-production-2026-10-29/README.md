# EASE production acceptance — 29 October 2026

[PR #83](https://github.com/hpcamayo/mkt_instrumentos/pull/83) is merged and deployed to **https://laria.audio**. The release was verified at source `e78fff1a5e64431f136797bb81d109f0c6be7415`, deployment `dpl_7qWP1u5DKu1R9wgxMZnpakZNoW5p`, before and after the live rerun. The production build was READY and the alias pointed to this deployment throughout the observations. The merged commit's CI and acceptance workflows passed.

Before merging, the linked Supabase project `hswkjandadscduodejig` received exactly `20261121110000_recently_viewed_privacy.sql` and `20261121120000_ease_public_card_routes.sql`, in order. The dry run listed only these two files. Verification found all 105 migrations recorded, the public-card function executable by anon/authenticated, no private contact fields in its first returned page, and all ten category image routes in the client-error allowlist. Checksums and database observations are in [results.json](results.json).

## Targeted live results

Only the 13 previously failing live cases were selected. Their latest outcomes are **12 Pass, 0 Fail and 1 guarded Not Run**. The prior [candidate evidence](../ease-fixes-2026-10-29/README.md) remains the source for local checks; no new full local run is claimed.

| Case | Production outcome |
| --- | --- |
| EASE-013 | Pass — menu, home and landing links have matching listings. |
| EASE-028 | Pass — taste, comparison and recently viewed choices stay on the device; requests do not carry them. |
| EASE-168 | Pass — shared and category-specific image metadata resolves to 1200×630 PNGs. |
| EASE-305 | Not Run after five passing draft-save/restore assertions; final publication was refused by the existing live guard. |
| EASE-526 | Pass after correcting the public brand fixture, with/without JavaScript and on phones. |
| EASE-601 | Pass — browser Back restores the preceding inventory search. |
| EASE-607 | Pass — all bulk-action Undo checks, including the last matching row. |
| EASE-618 | Pass — selection/export of 55 SKU, 54 archived, skipped SKU named with its reason, all 54 restored by Undo. |
| EASE-756 | Pass — recently viewed order, current price and Vendido label across all checked renderers. |
| EASE-829 | Pass — offer-sheet focus restoration and keyboard containment at both widths. |
| EASE-845 | Pass — hiding a feed item and Undo restore it in view. |
| EASE-850 | Pass — safety-sheet focus restoration and per-browser continuation behavior. |
| EASE-854 | Pass — feed navigation moves focus to the active heading and announces it. |

EASE-305 restored both photos, brand and model in a second browser. Its final publication and removal of the saved draft remain covered by the prior isolated local pass. The canonical registry combines observed local/live evidence conservatively, so the 13 rows change from Fail to Pass while the live guard remains explicit. This does not represent an observed production publish.

The first EASE-526 attempt guessed brand `bateria` from the title `bateria mapex`, whose actual public brand is `mapex`; it also counted an empty-state heading as a product. The probe now reads the anonymous public snapshot and checks actual product links against their public brand/store fields. Both attempts and the corrected probe's hash are retained. The product's brand filtering required no further change.

The production [generic share card](og-home.png) and [guitar share card](og-guitarras.png) were visually inspected: their Spanish text is legible and unclipped. Image hashes and assertion-level results are retained in results.json.

## Cleanup and acceptance state

The account batch removed **9 synthetic test accounts**. Its final checks found zero accounts, profiles, listings, stores, Storage objects, queued emails, stock movements and inventory changes remaining. An independent cleanup check then removed zero additional accounts and again found zero remaining synthetic accounts/data. Per-case outside-recipient checks found no notifications or emails sent to other users. WhatsApp was intercepted; global jobs, final publication/import and paid AI were not exercised live.

Only the 13 selected rows' status/evidence fields changed in `acceptance/cases.tsv`; unrelated rows, IDs, requirements and ownership remain unchanged. EASE now has **268 Pass / 75 Not Run**. The complete registry has **653 Pass / 228 Not Run / 1 pre-existing Blocked**, across 882 cases, with no Fail. The prior manual/device/owner and coverage gaps remain open. No XLSX was read or generated.

A bounded error-level runtime-log query for the released deployment returned zero records. The connector's build-log endpoint lacked team access; the CLI fallback verified the explicit project/team and completed successfully. This observation does not establish unmeasured production reliability or close unrelated release gates.

## Reproduction and limits

Use the [live harness instructions](../../../scripts/acceptance/ease/README.md), the verified production project and explicit live-run authorization. Run the six visitor IDs and seven account IDs above separately, with `--only`, and require every cleanup `left` count to be zero. Keep credentials and raw authenticated traces out of committed artifacts. This Mac retains raw logs/screenshots under `/tmp/laria-ease/release-83-2026-10-29`.

```sh
python3 -B acceptance/validate.py
python3 -B -m unittest discover -s acceptance -p 'test_*.py'
node --check scripts/acceptance/ease/checks-d.cjs
pnpm exec eslint scripts/acceptance/ease/checks-d.cjs
git diff --check
```

The prior local report's checks and revision lineage are referenced directly in results.json. Native share/WhatsApp Status, OS printing, legal sign-off, the incomplete focus sweep and 70 uncovered IDs remain Not Run. The live draft guard remains in place.
