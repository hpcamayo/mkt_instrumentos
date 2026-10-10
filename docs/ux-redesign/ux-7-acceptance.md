# UX-7 · Admin workbench — acceptance package

**State: built in the cloud session of 10 Oct (N17), waiting for the owner's review.** Answers W1–W9 provisional (`ux-7-admin.md`); F7 not built; build choice U18 (pending) in `decisions.md`.

## What was built

- `components/admin-workbench.tsx`: `QueuePhoto` (inline thumbnails, W1); `isNegativeMutation` drives the danger/secondary style of every `AdminMutationControl` (W2); `verificationConfirmation` on the "Verificación" queue (W3); the identifier moved to an "Identificador" line (W5).
- `components/admin-domain-view.tsx`: the store record's verify/revoke asks first (W3).
- `app/admin/auditoria/[targetType]/[targetId]/page.tsx`: Lima time (W4); "Identificador:" in the summary (W5).

## Criteria

| # | Criterion | State |
| --- | --- | --- |
| 1 | Inline photos | Source test; rendering with real queue items **pending on the Mac** |
| 2 | Decision styles | Unit test of every mutation kind |
| 3 | Verify/revoke confirmation | Source test (both places; the call unchanged); clicking through **pending on the Mac** |
| 4 | Lima time | Source test |
| 5 | Identifiers | Source test |
| 6 | lint, typecheck, tests, build | Pass in the cloud: **337 tests** |

Rows (owner, on the Mac): ADMIN-001–030, REP-001–014, VERIFY-001–013. **All pending on the Mac.** Nothing was marked in `acceptance/cases.tsv`.

## Pending on the Mac (commands)

```sh
cd ../mkt_instrumentos-ux && git pull && pnpm install
pnpm build && pnpm start -p 3100                       # .env.local → 127.0.0.1:54321
node scripts/ux-local-accounts.cjs && node scripts/ux-local-photos.cjs
node tests/run-local.cjs node tests/sprint-8-admin-reports.integration.cjs http://localhost:3100
node scripts/ux-snapshots.cjs --label ux7-after        # Admin queues signed in as the local Admin
node scripts/ux-audit.cjs --axe <axe.min.js>
```

## Known limitations

- The queue keeps its card list (W6); the concept's master-detail and decision bar are pending (U18).
- Thumbnails load through the image optimizer except private previews (`/api/listing-images/`), as revisions already did.
