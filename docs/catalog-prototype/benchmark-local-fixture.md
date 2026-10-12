# Prototype benchmark: LOCAL FIXTURE catalog, Jev MOCK provider

Run 2026-10-10T05:54:52.303Z on 33 labeled cases (scripts/catalog-prototype/evaluation-cases.json), demo thresholds (uncalibrated).
Fixture rows, not the production catalog: these figures check the code paths and say nothing about real recall.
Jev answers come from the mock provider's fixed rules: outcome figures are NOT Jev accuracy.

| Case | Lookup kind | Outcome | Transition | Checks |
| --- | --- | --- | --- | --- |
| exact-sm57 | exact | AUTO_APPROVE | mock_provider | pass |
| spelling-sm-57 | exact | AUTO_APPROVE | mock_provider | pass |
| alias-ds1 | exact | REVIEW | not_auto_approve | pass |
| ambiguous-squier-kept | ambiguous | REVIEW | not_auto_approve | pass |
| ambiguous-squier-chosen | ambiguous | AUTO_APPROVE | mock_provider | pass |
| family-player-strat | family | INSUFFICIENT | not_auto_approve | pass |
| variant-hss-left | exact | AUTO_APPROVE | mock_provider | pass |
| variant-hss-none | exact | AUTO_APPROVE | mock_provider | pass |
| untrusted-omitted | exact | AUTO_APPROVE | mock_provider | pass |
| edited-attribute | exact | AUTO_APPROVE | mock_provider | pass |
| edited-identity | exact | REVIEW | not_auto_approve | pass |
| rejected-match | exact | REVIEW | not_auto_approve | pass |
| conflict-fender-squier | conflicting | CONFLICTING | not_auto_approve | pass |
| wrong-brand | conflicting | CONFLICTING | not_auto_approve | pass |
| unknown-product | unknown | INSUFFICIENT | not_auto_approve | pass |
| incomplete-listing | exact | INSUFFICIENT | not_auto_approve | pass |
| jev-timeout | exact | SYSTEM_FAILURE | not_auto_approve | pass |
| jev-error | exact | SYSTEM_FAILURE | not_auto_approve | pass |
| jev-invalid | exact | SYSTEM_FAILURE | not_auto_approve | pass |
| prompt-injection | exact | REVIEW | not_auto_approve | pass |
| contact-in-description | exact | REVIEW | not_auto_approve | pass |
| verified-store | exact | REVIEW | not_auto_approve | pass |
| revision | exact | REVIEW | not_auto_approve | pass |
| audit-copy-replica | exact | REVIEW | not_auto_approve | pass |
| audit-copy-clon | exact | REVIEW | not_auto_approve | pass |
| audit-category-drums | exact | REVIEW | not_auto_approve | pass |
| audit-category-amplifier | exact | REVIEW | not_auto_approve | pass |
| control-sm58-typed | exact | AUTO_APPROVE | mock_provider | pass |
| audit-two-products | exact | REVIEW | not_auto_approve | pass |
| audit-two-products-brand | exact | REVIEW | not_auto_approve | pass |
| audit-missing-generation | exact | REVIEW | not_auto_approve | pass |
| control-generation-named | exact | AUTO_APPROVE | mock_provider | pass |
| control-cymbal-size | exact | AUTO_APPROVE | mock_provider | pass |

| Metric | Value |
| --- | --- |
| Retrieval Recall@1 / @3 / @5 | 30/30 (100.0%) / 30/30 (100.0%) / 30/30 (100.0%) |
| Lookup kind as labeled (exact / family / ambiguous / conflicting / unknown) | 33/33 (100.0%) |
| Unknown products left unmatched | 1/1 (100.0%) |
| Policy outcome as labeled | 33/33 (100.0%) |
| Autoapproval precision (shadow) | 10/10 (100.0%) |
| Autoapproval coverage | 10/10 (100.0%) |
| Human-review rate | 23/33 (69.7%) |
| Conflict detection precision / recall | 2/2 (100.0%) / 2/2 (100.0%) |
| SYSTEM_FAILURE outcomes (forced scenarios) | 3 |
| Transitions that would publish | 0 |
| Catalog lookup latency p50 / max (ms, match + lookup) | 147 / 176 |
| Jev latency and cost | not measured (mock) |
