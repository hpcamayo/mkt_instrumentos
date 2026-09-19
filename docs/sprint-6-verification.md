# Sprint 6 — local implementation and verification

Verification completed: **2026-09-19**. Sprint 6 is implemented and verified locally only. Migration `20260918120000_sprint_6_transactions_reviews.sql` is pending production release. No hosted migration, production deployment, production data/configuration change, or Sprint 7 work was performed.

## Scope delivered

- The shared global category navigation now uses the canonical listing category/type definitions for an accessible desktop mega-menu and mobile accordion. Route changes, outside interaction, Escape, and explicit close actions clear the open state.
- A sold listing can be attributed to an authenticated buyer only when that buyer has a trusted WhatsApp contact event for the exact listing at or before `sold_at`. The seller can instead record an external sale, cancel before confirmation, or select another still-eligible buyer after cancellation/decline.
- Database locks, partial unique indexes, immutable history, and idempotent RPCs enforce one active claim and one verified transaction per sold listing under races. Verification occurs only after the selected buyer confirms.
- A verified transaction unlocks one immutable review in each direction. Reviews are double-blind until both sides submit or the database-owned ten-day deadline is reached. Store reviews bind to the store; Particular reviews bind to the seller user; seller-to-buyer reviews remain private reputation history rather than a public buyer profile.
- Revealed reviews can be reported. The minimal Sprint 6 admin compatibility surface can inspect transactions/reviews and hide or restore a review with a mandatory reason without rewriting its content. General report resolution/dismissal and the full Admin Hub remain Sprint 8 work.
- Verified-transaction and review events extend the existing private analytics pipeline. Seller/store analytics add precisely labelled buyer-confirmed transaction totals and contact-to-confirmed rates without revenue, payment, delivery, message-content, or buyer-directory claims.
- Event/contact failures now carry a bounded correlation ID and structured category/code logging without PII; WhatsApp navigation remains available when telemetry fails.

## Database and security verification

A clean local Supabase reset applied all **17** forward migrations and the seed, including `20260918120000_sprint_6_transactions_reviews.sql`.

The following rollback-safe SQL suites passed against the reset database:

1. `tests/marketplace-performance.sql`
2. `tests/particular-ownership.sql`
3. `tests/store-sprint-2.sql`
4. `tests/listing-sprint-3.sql`
5. `tests/sprint-3-1.sql`
6. `tests/sprint-4-photos.sql`
7. `tests/sprint-4-analytics.sql`
8. `tests/sprint-5-favorites.sql`
9. `tests/sprint-6-transactions-reviews.sql`

Sprint 6 coverage includes exact-listing/pre-sale authenticated contact eligibility; anonymous, cross-listing, late, self, forged, and declined-candidate exclusion; external sales; participant/admin RLS; single-active/single-verified constraints; confirmation/cancellation/idempotency races; immutable relist history; both review directions; rating/comment bounds; exact database-time boundaries; double-blind non-leakage; immutable reviews; store/Particular/buyer reputation identity; report validation; admin hide/restore audit; and ordinary-user denial of moderation queues.

Raw transaction, review, report, and moderation tables have no browser table grants. Public guarded RPCs derive authority from Supabase Auth; trusted implementations and visibility helpers live in the revoked `laria_private` schema. Explicit anonymous guards also avoid a local Postgres 17/PostgREST failure mode observed when invoking a revoked function that has omitted default arguments; this is a defensive authorization shape, not a production configuration change.

## Integration, race, and browser verification

Local integration suites passed for submissions/store application and cap/RUC races, listing lifecycle, Sprint 3.1 amendments, photos, analytics/events, favorites/price drops, and Sprint 6 transactions/reviews. The Sprint 6 integration suite proved competing buyer claims, identical retries, confirm-versus-cancel behavior, duplicate directional review races, double-blind reveal, and exact fixture cleanup.

Actual local browser verification covered the canonical category/type links, selected-category isolation, desktop category switching, outside/Escape close behavior, route-close behavior, and the mobile `390×844` category accordion/close path. Browser console inspection found no relevant error. Authenticated transaction/review usability still requires owner validation after the production release; no production/manual PASS is claimed here.

All integration harnesses reported zero owned temporary users, stores, listings, photos/assets, claims, transactions, reviews, reports, notifications, and attributable test events after cleanup. An independent final database/storage audit also returned zero for `@example.invalid` Auth users, QA-named stores/listings/assets, claims, verified transactions, reviews, reports, and moderation actions.

## Standard regression gate

| Gate | Result |
| --- | --- |
| `npm test` | PASS — 131/131 |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — Next.js production build completed; 39 static-generation entries completed |
| `python3 -B acceptance/validate.py` | PASS — 384 unique cases |
| Acceptance tooling unit tests | PASS — 7 run, 2 dormant XLSX tests skipped |
| `git diff --check` | PASS |

The production-mode build reports shared first-load JavaScript of 101 kB, with `/mi-cuenta/transacciones` at 105 kB and `/mi-cuenta/transacciones/[id]` at 173 kB. These are build observations, not latency or load-test claims.

## Acceptance registry

Sprint 5 owner evidence was recorded on the exact 21 requested existing rows, and Sprint 5 is **CLOSED / ACCEPTED**. `PDA-009` remains deferred to Sprint 7 centralized email delivery.

Sprint 6 local results:

- **PASS (51):** `LIFE-013`; `AN-010`, `AN-011`; `TX-001`–`TX-012`, `TX-014`–`TX-017`; `REVW-001`–`REVW-019`; `REP-003`–`REP-007`, `REP-010`; `ADMIN-007`, `ADMIN-008`; `PUB-011`–`PUB-015`.
- **BLOCKED (2):** `TX-013`, `REVW-020` require owner production manual wording acceptance after release.
- **DEFERRED (3 Sprint 6-relevant rows):** `REP-008`, `REP-009`, `ADMIN-006` remain part of the Sprint 8 general reports/Admin Hub. Registry-wide deferred cases also include the unchanged Sprint 7 `PDA-009`.
- **FAIL:** none.

Final registry totals are **384 cases: 265 Pass, 2 Blocked, 4 Deferred, 113 Not Run; 0 Fail**. Six genuinely uncovered cases were added without renumbering existing IDs: `PUB-011`–`PUB-015` and `TX-017`. No XLSX was read or generated.

## Owner QA after the release

Use real production accounts/listings only after the coordinated Sprint 6 migration and application release:

- Mega-menu: `PUB-011`, `PUB-013`, `PUB-014`, `PUB-015` — selected taxonomy, navigation close, outside/Escape and mobile behavior.
- Seller attribution: `TX-001`, `TX-003`, `TX-004`, `TX-005`, `TX-017` — mark sold, candidate privacy, external sale, eligible buyer request, cancel/reselect.
- Buyer confirmation: `TX-006`, `TX-007`, `TX-008`, `TX-013` — correct context, confirm, decline, and honest off-platform wording.
- Reviews/reputation: `REVW-001`, `REVW-002`, `REVW-008`, `REVW-009`, `REVW-010`, `REVW-015`–`REVW-020` — both directions, double-blind/reveal presentation, deadline presentation, report/hide UI, store/Particular reputation, and no payment/delivery guarantee implication.

Do not ask the owner to repeat database authorization attacks, clock-boundary manipulation, concurrency races, forged identities, or relist-isolation checks.

## Known limitations and sprint boundary

- No email delivery was added; centralized marketplace email remains Sprint 7.
- Review reports support report creation and review hide/restore only. General listing/store/user reports, report resolve/dismiss state, and the full Admin Hub remain Sprint 8.
- No historical buyer inference or speculative backfill is performed. Existing sold listings enter attribution only through the intended seller flow.
- No public buyer profile was introduced.
- No production load benchmark or new SLO is claimed.

**Production remains untouched. Sprint 7 was not started.**
