# PAY-1: assisted commerce, Pilot A

Status: implemented on branch `store-ops/pay-1-pilot-a` (from `store-ops/store-1a-inventory-core`), local tests green,
**not applied to production, not accepted, and switched off by default**. The design is [`design.md`](design.md) §11.1,
§11.2 and §11.4 with owner decisions D-2, D-6 and D-7 at their accepted defaults. Built without intermediate owner
checks, as the owner asked on 2026-10-15; every default taken is listed below for the final review.

## What it adds

Verified stores declare which payment methods they accept, an Admin reviews each one against the store's RUC and razón
social, and buyers see the approved methods on the store page and on that store's listing pages, with "Solicitar
compra" opening WhatsApp with a prefilled message. Laria still processes no payment: no payment links on Laria, no
amounts, no paid state, no reservation, no order, no stock change.

One migration, `supabase/migrations/20261028120000_pay_1_store_payment_methods.sql`, purely additive:

| Object | Purpose |
| --- | --- |
| `store_payment_method` enum | `efectivo_al_recoger`, `yape_plin`, `pos_tarjeta_al_recoger`, `link_de_pago` (design §11.1). |
| `store_payment_methods` | One row per store and method: `status`, `holder_name` (Admin only), `provider_label` (public), `owner_note`, review fields. RLS: the owner and Admin read; nobody writes directly. |
| `store_payment_method_changes` | Append-only history of proposals, withdrawals, Admin decisions and automatic re-reviews. |
| `stores_review_payment_methods_on_business_change` | A change of `ruc` or `razon_social` sends approved methods back to review. |
| `laria_private.record_marketplace_event_service` | Same function as before, plus one accepted metadata value: `{"intent":"purchase"}` on `whatsapp_contact`. |

Functions (all `security definer`):

| Function | Who | What |
| --- | --- | --- |
| `set_store_payment_method(method, holder, provider, note)` | Owner of an active, verified store | Proposes or changes a method; any change goes (back) to `pending_review`. Holder required except for cash. Rejects digit runs of 6+, links and e-mails in every text field. |
| `withdraw_store_payment_method(method)` | Owner (verified or not) | Stops offering it at once. |
| `admin_review_store_payment_method(store, method, decision, reason, expected_updated_at)` | Admin | `approve` / `reject` a pending method, `disable` an approved one. Reason required; refuses if the method changed since the Admin loaded it; approval requires the store to be active and verified at that moment. Audited in `admin_audit_actions` and the history. |
| `get_admin_store_payment_methods(status, page, size)` | Admin | Review list with the store's razón social, RUC and verification. |
| `get_store_payment_methods(store)` | Anyone | Approved methods only, and only while the store is `active` and `is_verified`, checked at read time. Never returns the holder. |
| `get_listing_purchase_request(listing)` | Anyone | `{methods, sku}` when the listing is public, a store listing, not `out_of_stock`, and its store shows at least one method; otherwise `null`. `sku` is the linked inventory item's merchant SKU or `null`. No stock figure (D-14). |

Application:

- Pilot switch `LARIA_ASSISTED_COMMERCE=1` (server environment). Off by default, so merging changes nothing for buyers or
  stores until the owner turns it on. While off: no methods or "Solicitar compra" on public pages, the owner page and its
  route return 404, the Terms and Privacy drafts do not render. The Admin page works either way, so a pilot can be
  prepared before it is switched on.
- Listing page (`app/instrumentos/[slug]/page.tsx`): when `get_listing_purchase_request` returns a value, the one contact
  button reads "Solicitar compra" and opens WhatsApp with the purchase message, and a "Medios de pago que acepta la
  tienda" block with the disclaimer sits above the trust note. Otherwise the page is exactly as on STORE-1a (including the
  out-of-stock restock question).
- Store page (`app/tiendas/[slug]/page.tsx`): the same block under "Sobre la tienda" when the verified store shows methods.
- `/api/contact` accepts `intent: "purchase"`. It re-checks eligibility with `get_listing_purchase_request`, returns the
  purchase message and records `whatsapp_contact` with `{"intent":"purchase"}`; if the listing no longer qualifies it
  falls back to the ordinary contact message and event, so a stale page never strands a buyer.
- Owner page `/mi-cuenta/tienda/medios-de-pago` (linked from Mi tienda): one card per method with status, review reason,
  holder, provider and note. Unverified stores see a notice and can only withdraw.
- Admin page `/admin/medios-de-pago` (in the Admin menu): filter by status, holder next to razón social and RUC, decision
  with a reason.
- Status dictionary domain `payment` in `lib/ui/status.ts`: En revisión, Aprobado, Rechazado, Desactivado por Laria, Retirado
  por la tienda.
- Draft legal text in `components/legal/assisted-commerce-legal.tsx`, rendered as "4 bis" sections of `/terminos` and
  `/privacidad` only while the switch is on. **Pending legal review** (see Legal below).

Purchase message (quantity starts at 1; the buyer edits it in WhatsApp):

```
Hola, quiero comprar "<título>" que vi en Laria.
SKU: <SKU de la tienda>            (only when the listing is linked to an inventory item)
Cantidad: 1
https://laria.audio/instrumentos/<slug>
¿Me confirmas la disponibilidad y cómo coordinamos el pago y la entrega?
```

## Defaults taken (for the final review)

| Open point | Default taken | Why |
| --- | --- | --- |
| Purchase request event: `whatsapp_contact` + `metadata.intent='purchase'` or a new `purchase_request_started` type (§5.5, §11.1) | `whatsapp_contact` with `{"intent":"purchase"}` | It is a WhatsApp contact. Sprint 6 uses `whatsapp_contact` to decide who can be named as buyer in a sale claim; a new type would have made purchase-request buyers ineligible. Contact counts and analytics stay comparable. Purchase requests are `metadata->>'intent' = 'purchase'`. |
| Where "Solicitar compra" appears | Replaces the label of the one contact button on eligible listings | UX-4 L10 keeps one WhatsApp button per page; a second button would compete with it. Needs the UX owner's sign-off because the design system says every contact button reads "Contactar por WhatsApp" (the copy test now allows this one exception). |
| Quantity | Fixed "Cantidad: 1" in the message | A selector needs a public stock ceiling, which D-14 rules out; the buyer edits the number in WhatsApp. |
| Out-of-stock listings | No "Solicitar compra" and no methods block; the STORE-1a restock question stays | Asking to buy something with zero units contradicts "Agotado". |
| Holder name | Required for every method except cash; Admin only | The Admin needs it to compare with the razón social (§11.2); buyers do not. |
| What may be stored | No digit runs of 6+, links or e-mails in holder, provider or note | Enforces "no Yape numbers, account numbers, card data" (§11.2) and "no links on Laria" (D-7) in the database. |
| Owner edits after approval | Back to `pending_review` and hidden until re-approved | Otherwise a store could swap the holder after review. |
| RUC or razón social change | Approved methods go back to `pending_review` | The approval was a comparison with those fields. |
| Verification revoked, store hidden | Hidden at read time, rows kept; they reappear if the store is verified again | Design §11.2 ("without touching the rows"). See review question 3. |
| Statuses | Adds `rejected` and `withdrawn` to the design's three | Distinguishes "Laria said no" (with a reason) from "Laria withdrew it" and from "the store stopped". |
| Pilot gate | One deployment switch, `LARIA_ASSISTED_COMMERCE` | The legal review must precede the public pilot (§11.4); a per-store gate is already the Admin's approval. |
| Event route | `/api/contact` gains `intent`; response shape unchanged | Keeps the Sprint 6 telemetry contract. |

## How to test

Local only. With the Docker-free database (`/mnt/project-files/store-operations/local-db-setup/`) or local Supabase:

```sh
bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh reset   # replays every migration, including PAY-1
psql -h 127.0.0.1 -p 54322 -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null -f tests/pay-1.sql
bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh test    # every tests/*.sql + STORE-1a concurrency
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

`tests/pay-1.sql` (rolled back) covers: browser-role boundaries; non-verified and Particular callers refused; holder,
length and sensitive-data rules; idempotent resubmission; owner RLS isolation; Admin approve/reject/disable with reason,
stale version and unverified-store refusals, audit and history; public reads (exact approved list, no holder, Particular,
unverified, pending and unknown listings excluded); live verification and store-status checks; owner change and RUC/razón
social change sending methods back to review; SKU of a linked item; out-of-stock and restock; the purchase-intent event
(accepted only on an eligible listing, exact metadata, other types still refuse metadata, seller's own click not counted,
browser roles refused); no stock or listing side effects; withdrawal, disable, and the append-only history.

`tests/pay-1.test.cjs` covers the switch, the row readers, the purchase message, error mapping, and the boundaries the
pages and routes keep (eligibility only through the database functions, no holder on public surfaces, owner screens
behind the switch, legal drafts gated and marked).

Browser check with the prototype's stand-in API (`scripts/prototype/` on `store-ops/prototype`, not committed here) and
`LARIA_ASSISTED_COMMERCE=1`: see Evidence.

## Evidence

2026-10-15, cloud build session, Docker-free Postgres 16 with every migration replayed (47, including this one):

- `tests/pay-1.sql` and all 12 other SQL suites pass; the STORE-1a concurrency suite passes (all 7 cases, 200 last-unit
  rounds). Two mutants were caught by `pay-1.sql`: dropping `s.is_verified` from `laria_private.public_payment_methods`
  ("methods shown after verification was revoked") and a sensitive-data filter that accepts everything.
- `pnpm test` 367/367 (359 existing + 8 in `tests/pay-1.test.cjs`), `pnpm typecheck`, `pnpm lint` and `pnpm build` pass.
- Browser check (Playwright, Chromium) against `pnpm start` with `LARIA_ASSISTED_COMMERCE=1`, the prototype's stand-in
  Supabase API (PostgREST + local gateway from `store-ops/prototype`, not committed here) and its demo seed: before
  approval the Boss DS-1 page shows "Contactar por WhatsApp" and no methods; the owner page refuses a holder containing a
  phone number with the Spanish message, saves Yape o Plin and cash as "En revisión"; the listing stays unchanged while
  pending; the Admin page shows holder, razón social and RUC and approves both (two audit rows); the listing then shows
  "Solicitar compra" with the message `Hola, quiero comprar "Pedal Boss DS-1 Distortion" que vi en Laria. / SKU: BOSS-DS1 /
  Cantidad: 1 / <link> / ¿Me confirmas…`, the methods block and the disclaimer; clicking it calls `/api/contact` (200,
  recorded) and stores one `whatsapp_contact` with `{"intent":"purchase"}`; the out-of-stock Boss TU-3 keeps "Contactar
  por WhatsApp" and no block; the store page shows the block under "Sobre la tienda"; `/terminos` shows the "4 bis" draft.
  Screenshots: `/mnt/project-files/store-operations/pay-1-screens/` (project files, not in the repository).
- Not run: hosted Supabase, a real WhatsApp send, or any production data.

## Independent review (design §17, item 6: payment boundary)

Codex (or another independent reviewer) should check these before the code merges. Everything is in the migration unless
noted.

1. **Eligibility tied to live verification.** `laria_private.public_payment_methods` joins `stores` and requires
   `m.status = 'approved' and s.status = 'active' and s.is_verified` at read time; `get_store_payment_methods` and
   `get_listing_purchase_request` both go through it. Question: is there any read path (RLS on `store_payment_methods`,
   the Admin list, the event function, PostgREST embedding from `stores`) that shows a method for a store that is not
   active and verified, or shows `holder_name` to anyone but the owner and Admin?
2. **Owner and Admin writes.** `set_store_payment_method`, `withdraw_store_payment_method`,
   `admin_review_store_payment_method`, `laria_private.payment_caller_store` (owner binding, store row lock),
   `laria_private.payment_method_text` (the sensitive-data filter). Questions: can an owner end with an `approved` row
   whose holder, provider or note the Admin never saw; can an Admin approve a version other than the one shown (the
   `p_expected_updated_at` check, given `set_updated_at()` uses `now()` and two updates in one transaction share it); can
   any text slip a phone, account number or link past the filter (spaced or dotted digits, `wa.me`, punycode)?
3. **Re-verification.** Methods hidden by a revoked verification reappear if the store is verified again, without a new
   review; a RUC/razón social change does force one. Is that acceptable, or should un-verifying also reset approvals?
4. **No money state.** Confirm no column, function or event stores an amount, a paid flag, a payment URL, a reservation
   or an order, and that a purchase request cannot change stock, `listings.status`, `stock_state`, a transaction claim or
   a review (`tests/pay-1.sql` "no money state" block).
5. **Event change.** Diff `laria_private.record_marketplace_event_service` against
   `20260916200000_sprint_4_events.sql` (moved in Sprint 6): the only changes are the `whatsapp_contact` metadata branch
   and `whatsapp_contact` added to the metadata exception list. Question: can any caller other than the service role
   reach it, and can the metadata be anything but exactly `{"intent":"purchase"}`?
6. **Application boundary.** `app/api/contact/route.ts` (intent only for listings, upgrade only through the database
   check, fallback to the ordinary contact), `app/api/store/payment-methods/route.ts` and
   `app/api/admin/payment-methods/route.ts` (same-origin, allow-listed keys, errors mapped without leaking internals),
   and the switch in `lib/payment-methods.ts`.
7. **Terms/Privacy diff.** `components/legal/assisted-commerce-legal.tsx` against design §11.4 and brief §22.

## Legal (human step, not code)

The Terms and Privacy additions are drafts **pending the brief §22 compliance review**: consumer protection (Código de
Protección y Defensa del Consumidor, Libro de Reclamaciones), Ley 29733 personal data (the purchase-intent record and the
holder name), electronic invoicing responsibility (the store issues boleta/factura), and any provider referral terms.
After that review and before switching the pilot on: adjust the text in `components/legal/assisted-commerce-legal.tsx`,
update `LEGAL_LAST_UPDATED` in `lib/legal-pages.ts`, and have an Admin check each real store's account holder against
its RUC and razón social when approving.

## Acceptance proposal (not in `acceptance/cases.tsv`)

Proposed `PAY-` cases for Pilot A, for the owner's review. They are added to `acceptance/cases.tsv` only after that
review; no existing ID changes.

| Proposed ID | Requirement | Expected | Automated evidence |
| --- | --- | --- | --- |
| PAY-001 | Nothing changes for buyers or stores while the pilot switch is off | No methods, no "Solicitar compra", owner page 404, legal drafts hidden | `pay-1.test.cjs` |
| PAY-002 | Only an active, verified store can declare methods | Unverified, hidden and Particular callers refused | `pay-1.sql` |
| PAY-003 | Every method except cash names the account holder; the holder is visible only to the owner and Admin | Holder required; never in public reads | `pay-1.sql` public reads |
| PAY-004 | No phone, account or card numbers, links or e-mails are stored | `PAYMENT_METHOD_SENSITIVE_DATA` | `pay-1.sql` |
| PAY-005 | A declared or changed method is hidden until an Admin approves it | `pending_review`; owner edit after approval re-hides it | `pay-1.sql` |
| PAY-006 | The Admin approves only the version they saw, with a reason, for a verified store | Stale version, missing reason and unverified store refused; audited | `pay-1.sql` Admin review |
| PAY-007 | An Admin can reject a proposal or disable an approved method, with a reason the store sees | Status and reason on the owner page; hidden from buyers | `pay-1.sql`; manual page check |
| PAY-008 | The owner can stop offering a method at any time | `withdrawn`, hidden at once | `pay-1.sql` |
| PAY-009 | Revoking verification or hiding the store hides its methods immediately | Public reads empty; rows kept | `pay-1.sql` |
| PAY-010 | A RUC or razón social change sends approved methods back to review | `business_data_changed` in history | `pay-1.sql` |
| PAY-011 | The store page lists approved methods with the "pay the store directly" statement | Block under "Sobre la tienda" | browser check |
| PAY-012 | An eligible listing shows "Solicitar compra" and the methods; Particular, unverified-store and out-of-stock listings do not | Button label and block | `pay-1.sql`, browser check |
| PAY-013 | "Solicitar compra" opens WhatsApp with title, SKU (when linked), quantity 1 and the listing link | Prefilled message; no amount, no payment link | `pay-1.test.cjs`, browser check |
| PAY-014 | A purchase request is recorded as a WhatsApp contact with the purchase intent, only when eligible | Exact metadata; otherwise the ordinary contact | `pay-1.sql` events, `pay-1.test.cjs` |
| PAY-015 | A purchase request never changes stock, listing status, reservations, claims or reviews | No side effects; no money columns | `pay-1.sql` |
| PAY-016 | The seller's own purchase-request click is not counted | `recorded = false` | `pay-1.sql` |
| PAY-017 | Every proposal, withdrawal and decision is in an append-only history | History cannot be edited or deleted | `pay-1.sql` |
| PAY-018 | Terms and Privacy describe Pilot A after legal review | Approved text live with the switch | manual (legal) |
| PAY-019 | Existing contact, analytics and transaction-claim behavior is unchanged | Existing suites pass unchanged | `sprint-4-analytics.sql`, `sprint-6-transactions-reviews.sql`, `sprint-6.test.cjs` |

## Rollback

Switch off `LARIA_ASSISTED_COMMERCE`: every buyer-facing surface returns to the STORE-1a behavior on the next request,
and the owner page disappears; rows and history stay. If the application code itself must be rolled back, the older
code ignores the new tables; purchase-request events remain ordinary `whatsapp_contact` rows with one metadata key,
which older analytics count as contacts. To stop all public display at the database level without a deploy:

```sql
begin;
insert into public.store_payment_method_changes(store_id, method, change_type, actor_kind, after, reason)
select store_id, method, 'disabled', 'system', jsonb_build_object('status', 'disabled'), 'Rollback del piloto'
from public.store_payment_methods where status = 'approved';
update public.store_payment_methods
set status = 'disabled', reviewed_by = '00000000-0000-0000-0000-000000000000', reviewed_at = now(), review_reason = 'Rollback del piloto'
where status = 'approved';
commit;
```

Schema rollback is not planned: dropping the tables would lose the review history. Reverting
`record_marketplace_event_service` to its Sprint 4 body is safe once no caller sends the purchase intent.

## Known limitations

- No payment links, amounts, paid state, reservations or orders (Pilot A by design; Pilot B in §11.3 needs its own
  design).
- Quantity in the message is always 1; the buyer edits it in WhatsApp.
- The Admin list shows the first 24 rows of a status with no page links (pilot scale).
- `set_updated_at()` uses transaction time, so the stale-version check distinguishes versions written in different
  transactions only; owner and Admin writes always are.
- No e-mail or in-app notice to the store when a method is approved, rejected or disabled; the owner page shows the
  status and reason.
- "Solicitar compra" as the contact label, the method labels and the disclaimers are provisional copy for the UX review
  (D-13 style sign-off).
- `docs/database.md`, `docs/functional-spec.md`, `docs/decisions.md` and `acceptance/*` are left to the combined
  prototype thread.
