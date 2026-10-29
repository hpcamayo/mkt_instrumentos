# Documentation status and source map

Snapshot: **2026-10-28, America/Lima**. This is a documentation reconciliation, not a deployment or acceptance report.

## Scope and source precedence

The owner explicitly requested updating V1 beyond its original scope, including PR #54. The functional specification now incorporates the approved extensions. Product scope, implementation, activation and acceptance are separate facts:

- **Approved scope:** an owner-approved product behavior included in the expanded V1 contract.
- **On main:** source exists on the inspected remote main; this alone does not prove every gate is enabled or every manual test passed.
- **PR #54:** built on `features/marketplace`, pending merge/release. It is approved scope even while production lacks it.
- **Gated:** an implementation also requires a deployment/database switch, store permission, credentials or operational approval.
- **Deferred:** explicitly postponed, catalog-dependent or still undecided. Approval of an idea does not bring its postponed parts into this release.

`functional-spec.md` defines behavior; `features.md` records capability/status; `design-system.md` defines visual behavior. The linked decisions and batch write-ups explain the accepted defaults. Historical sprint notes retain their dates and evidence, but their old “current” status and frozen-scope wording do not override these documents.

The working checkout's HEAD is `568b07af4229be3c52c379966cb897692909a81a`, older than remote main. Existing local application changes and untracked research were preserved. Documentation about newer source was reconciled from Git objects without updating or merging the checkout.

## Inspected source identities

| Source | Identity and use |
| --- | --- |
| Remote main | [`728a85209494c581dec68e624332f7920411445d`](https://github.com/hpcamayo/mkt_instrumentos/tree/728a85209494c581dec68e624332f7920411445d): current source baseline, including Effortless Laria, store operations, launch-audit fixes, the five maybes, and follow-ups through PR #80. |
| PR #54 | [Feature ideas: the approved ideas, built for review](https://github.com/hpcamayo/mkt_instrumentos/pull/54), GitHub metadata checked during this update: **open, draft, unmerged**. Head [`a64bb9ceb78406b901317998e4c3e374989779ba`](https://github.com/hpcamayo/mkt_instrumentos/tree/a64bb9ceb78406b901317998e4c3e374989779ba), base `4ee00e4914104e9dbcf5632f1889d1c3e963b3f7`. Later main follow-ups still need integration before release. |
| Approved feature decisions | [PR-head decisions](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/decisions.md): 162 defaults retained by the owner on October 28, as recorded in PR #54. Some source headings still say “proposed”; that label predates the recorded decision. |
| Store operations and import design | [Main store-operations design](https://github.com/hpcamayo/mkt_instrumentos/blob/728a85209494c581dec68e624332f7920411445d/docs/store-operations/design.md) and [assisted-commerce pilot](https://github.com/hpcamayo/mkt_instrumentos/blob/728a85209494c581dec68e624332f7920411445d/docs/store-operations/pay-1.md); earlier prototype status sentences are historical, not current branch state. |
| Main functional source | [Main specification](https://github.com/hpcamayo/mkt_instrumentos/blob/728a85209494c581dec68e624332f7920411445d/docs/functional-spec.md); its stale freeze and planning labels are reconciled in this update. |
| Effortless Laria decisions | [Main decisions](https://github.com/hpcamayo/mkt_instrumentos/blob/728a85209494c581dec68e624332f7920411445d/docs/decisions.md): accepted UX changes, superseded earlier design decisions and the five maybes. |

Pinned GitHub links are intentional: many source files are not present in this older working checkout. No branch-only implementation files were copied into the application.

## PR #54 sources

All links below refer to the inspected PR head, rather than assuming a future merge.

| Area | Detailed source |
| --- | --- |
| Approved ideas and batch scope | [Build plan](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/build-plan.md) |
| Authentication, data, help and safety | [Accounts](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/accounts.md) |
| Conditions, delivery terms, trades, combos and map | [Listing details](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/listing-details.md) |
| Seller identity, reviews, meetups and counter purchases | [Deal trust](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/deal-trust.md) |
| Mi equipo, store offers, consignment and price tools | [Selling tools](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/selling-tools.md) |
| Import, feeds, dealers, campaigns and demand | [Store reach](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/store-reach.md) |
| Arrivals, warranty, labels, try-outs and installments | [Store floor](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/store-floor.md) |
| Gifts, guides, collections, makers and artists | [Discovery](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/discovery.md) |
| Separate services marketplace | [Services](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/services.md) |
| Sedes and Nubefact | [Store locations](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/store-locations.md) |
| Outside configuration and jobs | [Setup](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/setup.md) |
| Legal release requirements | [Legal review](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/legal-review.md) |
| Deferred and partial ideas | [Deferred register](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/docs/feature-ideas/deferred.md) |

The deferred register's final Effortless “still open” paragraph is superseded for the five maybes by their merge on main in PR #74. Catalog-dependent work remains deferred. The build plan's original Hobby/manual-scheduling assumptions are superseded by the updated setup plan and hosted setup evidence.

## Release and activation

PR #54 records **60 approved ideas: 44 built, 13 explicitly later, 3 waiting for catalog dependencies**. Some built ideas also have postponed parts. Its **61 additional migrations** have not run in production at this checkpoint. A compiled preview without that schema is not a working feature demo.

The recorded release plan requires the migrations from the owner's Mac, in order, immediately before the coordinated merge/release, never as an early standalone deployment. The condition relabel makes the older application incompatible with the migrated database. Reconcile later main changes first; regenerate database types after application of the migrations. This documentation update executes none of these actions.

Release gates include the legal review of the new Terms/Privacy text, the approved-text date, provider setup where a feature requires it, schema/application compatibility, and release verification. Owner decisions are recorded as complete in PR #54; owner acceptance and test results remain separate.

The local October 28 setup notes refine the PR's generic setup checklist:

- Google Auth is enabled in Supabase and its public flag saved for a future Production build. Apple remains deferred.
- Support WhatsApp/hours and a Mercado Libre encryption key are saved for future Production builds. Mercado Libre client credentials are still missing, so its import remains unavailable.
- Nubefact is explicitly deferred; its activation key was removed. Do not enable Comprobantes as part of the general release. It needs a fresh key, the store's provider setup and a successful demo boleta/factura check before use.
- Google Shopping activation remains off. A feed implementation does not establish eligibility for a WhatsApp inquiry marketplace; the separate eligibility assessment does not authorize adding checkout.
- Vercel Pro scheduling replaces the old Hobby/manual-worker assumption. Main's configured jobs include page refresh, email, push and cleanup. PR #54 adds six Vercel feature jobs; its two additional pg_cron jobs begin with their migrations. Configuration is not proof of a successful run.

These observations are in the existing local research files `docs/feature-ideas/setup-status-2026-10-28.md`, `merchant-center-eligibility-2026-10-28.md` and `meetup-places-audit-2026-10-28.md`. They were untracked before this update and are not modified by it. Include/review those files separately when preparing a documentation commit; the statements above preserve the material release constraints without depending on their inclusion.

## Verification

For the checkout under test, run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`. The newer source includes local SQL and full-stack harnesses:

- [Local database instructions on main](https://github.com/hpcamayo/mkt_instrumentos/blob/728a85209494c581dec68e624332f7920411445d/scripts/local-db/README.md).
- [Full-stack acceptance instructions](https://github.com/hpcamayo/mkt_instrumentos/blob/728a85209494c581dec68e624332f7920411445d/docs/acceptance/full-stack.md).
- [Feature browser tour](https://github.com/hpcamayo/mkt_instrumentos/blob/a64bb9ceb78406b901317998e4c3e374989779ba/scripts/prototype/feature-ideas-tour.cjs) and the per-batch SQL/test instructions linked above.

PR #54 reports passing application/SQL checks, CI and local browser evidence at named commits. Those reports are source evidence, not tests rerun by this documentation task and not production acceptance. Production API/Storage two-step enforcement needs verification after its migration, including anonymous access and both authentication assurance levels.

`acceptance/cases.tsv` remains the sole canonical registry in each checkout. The newer main imported Effortless acceptance cases as Not Run in PR #78. The 366 proposed GROW cases on PR #54 are not automatically accepted or passed by this refresh. No acceptance TSV or XLSX is changed here; no stale aggregate acceptance count is promoted into a current result.

## Checks performed for this refresh

Documentation checks completed on 2026-10-29: all 70 Markdown links in the seven updated/new documentation files resolved to existing local destinations/anchors or inspected Git source paths, and all nine PR #54 batch sections have explicit pending-release labels. `git diff --check` passed. `python3 -B acceptance/validate.py` passed for the unchanged local registry (403 cases); that validates its format, not new feature acceptance.

Application, SQL integration, provider and production tests were not rerun for this documentation-only change. No runtime code, migration, acceptance case or XLSX was changed by this task. Existing unrelated working-tree changes remain outside this update.
