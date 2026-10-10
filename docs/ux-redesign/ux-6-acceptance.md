# UX-6 · Accounts — acceptance package

**State: built in the cloud session of 10 Oct (N17), waiting for the owner's review.** Answers A1–A9 provisional (`ux-6-accounts.md`); flags G3, "artículo" and "Compras y ventas" unchanged; build choices U14–U17 in `decisions.md`.

## What was built

- **6a** `components/ui/confirm-dialog.tsx` (`ConfirmDialog`, `useConfirm`) and `.confirm-dialog` in `app/globals.css`; the five confirmations in `transaction-detail.tsx`, `listing-management-table.tsx` and `saved-search-alerts.tsx` use it. `listing-management-table.tsx` restyles as cards below 768 px (`data-label` per cell).
- **6b** `app/mi-cuenta/tienda/inventario/page.tsx` and `estadisticas/page.tsx`: "Mi tienda" eyebrow, the store name in the summary line.

## Criteria

| # | Criterion | State |
| --- | --- | --- |
| 1 | Confirmations | Source and render tests; cloud check on a throwaway preview route (removed): the dialog opens with "Cancelar" focused, Esc closes it and focus returns to "Ocultar", at 390 and 1280. Each real action **pending on the Mac** |
| 2 | Review form read before asking | Source test |
| 3 | Inventory on phones | Render test (eight cells, labels); cloud check at 390: cards, no overflow; 1280 table |
| 4 | Store eyebrows | Source test |
| 5 | lint, typecheck, tests, build | Pass in the cloud: **333 tests** |

Rows (owner, on the Mac): AUTH, STORE-001–019, DASH-001–008, SDASH-001–010, SANA-001–010, FAV-001–010, ALERT-*, PDA-001–009, NOTIF-001–003, TX-001–018, REVW-001–020. **All pending on the Mac.** Nothing was marked in `acceptance/cases.tsv`.

## Pending on the Mac (commands)

```sh
cd ../mkt_instrumentos-ux && git pull && pnpm install
pnpm build && pnpm start -p 3100                       # .env.local → 127.0.0.1:54321
node scripts/ux-local-accounts.cjs
node tests/run-local.cjs node tests/analytics.integration.cjs http://localhost:3100   # runs analytics-browser-smoke (table cells)
node tests/run-local.cjs node tests/alerts.integration.cjs http://localhost:3100
node tests/run-local.cjs node tests/transactions.integration.cjs http://localhost:3100
node scripts/ux-snapshots.cjs --label ux6-after
node scripts/ux-audit.cjs --axe <axe.min.js>             # add: open each confirmation, check focus and Esc
```

## Known limitations

- Onboarding forms keep their single top notice (U15, pending).
- After confirming, the action's own button shows "Procesando…" and is disabled, so focus returns to the page; the result notice then takes focus (`PageNotice`).
- Favoritos keeps its own card (U17).
