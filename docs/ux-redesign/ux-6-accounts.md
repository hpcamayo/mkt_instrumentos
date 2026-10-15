# UX-6 · Accounts — brief

**Owner update, 14 Oct 2026:** Henri authorized U10/U15 ("Implementar ambos ahora") and U18 ("Implementar U18 ahora"). Listing edit and onboarding now have field errors and focused summaries; Admin now has a master-detail queue, a local review guide and a decision bar. These additions shipped in `7a50f06` on 14 Oct with explicit publication approval; authenticated/write proof is local only and formal owner acceptance remains pending; current evidence is in `ux-4-8-closure-review.md`. The dated overnight scope below is history.

**Status: provisional (written and built overnight, 10 Oct 2026, under N17).** The owner was away: every question takes its recommendation as a provisional answer, every product-behaviour flag takes its no-change option, and the owner confirms or reverses each answer at the UX-6 review (`ux-6-acceptance.md`).

UX-6 makes the account areas consistent for Particular and Tienda. It changes no auth, invitation, store-application, favourites, alerts, notification, transaction or review rule, and no query.

## Today (checked 10 Oct on `ae772fb`)

- **Five `window.confirm` calls**: `transaction-detail.tsx` (external sale, cancel a claim, send a final review), `listing-management-table.tsx` (hide, mark sold, relist), `saved-search-alerts.tsx` (delete). The browser's box: unstyled, English buttons on some systems, no context.
- **The inventory table has eight columns** and scrolls sideways on phones (`listing-management-table.tsx`), used by Mis publicaciones and Inventario.
- **Store names as uppercase eyebrows** on Inventario and Estadísticas (D6: uppercase only for micro labels of three words or fewer).
- Sign-in, sign-up and the store application validate with a single top notice; password minimum 6 at sign-up and 8 at reset (G3).
- Favoritos uses its own card (image, title, price, the favourite button), not the catalog card.

## Split (6a / 6b)

The roadmap recommended 6a (onboarding + Particular) and 6b (Store). Overnight the scope below is small enough for one review, but it is still committed as two steps: **6a** the shared account pieces (confirmations, the inventory table) and **6b** the store pages (eyebrows). The original overnight build left onboarding unchanged (A6); the 14 Oct U15 follow-up implements its errors locally.

## Questions (provisional answers in bold)

| # | Question | Options | Recommendation (taken provisionally) |
| --- | --- | --- | --- |
| A1 | 6a/6b split | A as the roadmap · B one sub-sprint | **A**, as two commits with one review (above) |
| A2 | Resumen as a to-do list | A only what today's data gives · B new aggregates (pending reviews, claims, rejections) | **A, no change now.** A real to-do list needs new reads across transactions and reviews; logged for the owner (U16) |
| A3 | Confirmations | A an in-page modal (`ConfirmDialog`) with the same question, a body and a verb on the button · B inline confirm rows | **A.** Same semantics: nothing runs unless the person confirms; Cancel is focused first; Esc and the backdrop cancel; focus returns to the control. Danger tone for deleting an alert and cancelling a claim |
| A4 | Inventory on phones | A the same table restyled as cards below 768 px (each cell labelled) · B a separate list | **A.** One DOM, the cells keep their order (the analytics smoke reads them), no sideways scroll |
| A5 | Store-name eyebrows | A "Mi tienda" as the eyebrow, the store name in the summary line · B sentence-case store name | **A** |
| A6 | Onboarding forms (per-field errors, error summary) | A leave for UX-8 · B now | **Superseded 14 Oct:** owner chose implementation now (U15). Shared field errors and summaries preserve existing auth calls, role separation and password minimums |
| A7 | Favoritos with the catalog card | A keep its card · B the catalog card | **A** for now: a favourite can be sold or unavailable, which the catalog card does not show (U17, pending) |
| A8 | Statistics scope | A real counts only, as today | **A** (no change) |
| A9 | SDASH-002/003 (editing store fields and media) | A no new UI | **A** (no change; Admin edits them) |

## Product-behaviour flags (no-change option taken)

| Flag | Answer |
| --- | --- |
| G3 Password minimum (6 vs 8) | No change |
| "artículo" in the purchase-confirmation notification | No migration |
| "Compras y ventas" vs "Compras" (functional-spec Sprint 7, TX-018) | No change; wording reconciliation stays with the owner |

## Product rules it must not change

Auth and invitations; the store application (RUC, address, contact, duplicate RUC, retry); favourites, alerts (pause, resume, delete), price-drop alerts, notifications; `create_transaction_claim`, `respond_transaction_claim`, `cancel_transaction_claim`, `record_external_sale`; double-blind reviews with the 10-day window; seller analytics with real counts; listing actions through `/api/listings/[id]/manage`.

## Acceptance criteria

1. No `window.confirm` remains; each former confirmation shows its question in `ConfirmDialog`, runs nothing on Cancel/Esc/backdrop, and returns focus to the control.
2. Sending a review reads the form before asking (the review is the one the person filled).
3. Mis publicaciones and Inventario show one card per listing below 768 px with labelled values and no sideways scroll; from 768 px the table is unchanged.
4. Inventario and Estadísticas show "Mi tienda" as the eyebrow and the store name in sentence case.
5. lint, typecheck, tests, build pass.

## Evidence plan

Automated in `tests/ux-accounts.test.cjs`. On the Mac (pending): the analytics browser smoke (table cells), a walk-through of each confirmation (hide, mark sold, relist, delete alert, external sale, cancel claim, send review), AUTH/DASH/SDASH/FAV/ALERT/TX/REVW rows.
