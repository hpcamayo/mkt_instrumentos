# Effortless Laria: my listings, sales and reviews

Batch `my-listings` of the Effortless Laria build (`/mnt/project-files/ux-ideas/build-plan.md`). Owner verdict: yes, no
notes, on every idea below. Branches: fixes `ux/effortless-my-listings-fixes` (PR #15, fix-09), batch
`ux/effortless-my-listings`. Acceptance proposals: `my-listings-acceptance.tsv` (EASE-400 onward, Not Run).

Nothing here is applied to a hosted database, deployed, or sends real e-mail or WhatsApp. The reminders job is a local
pg_cron schedule; e-mails go to the existing delivery queue.

## Proposed decisions

| ID | Decision | Why |
| --- | --- | --- |
| UXD-my-listings-1 | The account home opens on Pendientes, not metrics; metrics move to Estadísticas. Supersedes U16 ("Resumen is not turned into a to-do list"). | Henri approved big-09; the reads it needed now exist in one RPC. |
| UXD-my-listings-2 | A buyer's "Sí, lo compré" from a check-in plus the seller's one-tap confirmation is a verified transaction, with no second buyer confirmation. | Both sides already said yes; asking again is the chore big-08 removes. |
| UXD-my-listings-3 | Check-ins (purchase and availability) are skipped for stock-managed store listings; their sales go through Inventario. | Stock decides sold-out there (D-15); marking sold would contradict it. |
| UXD-my-listings-4 | "Sí, sigue disponible" records the date and resets the 30-day clock; the first-publication date never changes, and the listing shows "Quien vende confirmó que sigue disponible el …" for 30 days. | Keeps "Primera publicación" honest while giving buyers the fresh signal mine-08 asks for. |
| UXD-my-listings-5 | "Lo vendí, retirar" archives a pending, draft or rejected listing with a sold date; it never becomes public. | A listing that was never published can't go public unmoderated just to be marked sold. |
| UXD-my-listings-6 | Republicar and Duplicar create a draft opened in the edit form; it is sent with the usual submission. Replaces the direct relist copy. | mine-10 and shop-08: a chance to adjust before it goes to review. |
| UXD-my-listings-7 | Vacation mode is all-or-nothing per account, tomorrow to 90 days; listings stay public with "Vuelve el …" and contact off; it ends by itself. | mine-12; hiding would lose favorites and links. |
| UXD-my-listings-8 | Ten fixed rejection reasons, plus an optional note (required when no reason is picked). Stored as codes and as readable text. | mine-03; old free-text reasons keep working. |
| UXD-my-listings-9 | Particular statistics offer 7, 30 and 90 days (lifetime totals stay below); tips are at most two per listing, plain and rule-based. | mine-11; 90 days covers slow-moving instruments. |
| UXD-my-listings-10 | Reminders are sent at most once per key (dedupe table) by one daily job at 14:00 UTC (09:00 Lima); no reminder for anything the person already answered. | trust-01; real news only, no nagging. |
| UXD-my-listings-11 | No buyer is pre-selected when a seller attributes a sale. | Guardrail: no pre-ticked choices. |
| UXD-my-listings-12 | The closing panel reads "Que lo disfrutes" without exclamation marks. | Copy rule bans them; the warmth stays. |
| UXD-my-listings-13 | The store checklist shows until every step is done, then disappears; "Medios de pago" is a step only while the payments pilot is on. | shop-02; Pilot A stays off by default. |

## Ideas

### big-09 Pendientes and stock-01 Hoy en tu tienda
- **What changed.** `/mi-cuenta` reads `get_account_pendientes()` once and shows one ordered list (`lib/pendientes.ts`
  `buildPendientes`). Inline answers: `¿Compraste…?` (Sí / No), a buyer's report (Sí, me lo compró / No fue así),
  `¿Sigue disponible?` (Sí / Lo vendí / Bajar precio). Everything else links to where it's done. Stores get the list as
  "Hoy en tu tienda" with today's purchase requests (→ `/mi-cuenta/tienda/solicitudes`, built by the inventory batch),
  saved out-of-stock SKUs, low stock, an unfinished import and SKUs without a listing. A failed read shows a notice, not
  an empty list. Metrics left the home (the store header keeps status and the listing allowance).
- **Files.** `app/mi-cuenta/page.tsx`, `components/pendientes-list.tsx`, `lib/pendientes.ts`,
  `supabase/migrations/20261105120200_ux_my_listings_pendientes.sql`.
- **Test.** Sign in as a demo seller with a rejected listing and a draft; the home lists them first with "Corregir" and
  "Continuar". As a buyer who opened WhatsApp 3+ days ago, answer "Sí, lo compré".
- **Limitations.** The list is not paginated (each source is capped in SQL). Alert matches count the last 7 days.

### shop-02 Store checklist
- Steps tick from the store row and counts (`storeChecklist`); hidden once done. Files: `app/mi-cuenta/page.tsx`,
  `lib/pendientes.ts`.

### big-08 Buyer-side purchase check and trust-01 reminders
- **What changed.** `purchase_checkins` table and RPCs; Pendientes card; `components/purchase-checkin.tsx` on the
  listing page ("¿Cómo te fue?", only for a signed-in buyer who opened WhatsApp in the last 60 days); daily job
  `run_my_listings_reminders()` for purchase checks (3–30 days after contact, at most 3 per buyer per run), claim
  reminders (day 2 and 7) and review reminders (3 days and 1 day left). E-mail templates and notification labels for the
  five new types.
- **Files.** `supabase/migrations/20261105120100_ux_my_listings_reminders.sql`, `components/purchase-checkin.tsx`,
  `app/instrumentos/[slug]/page.tsx` (one line plus the select; listing batch file), `lib/email/templates.ts` (marked
  block), `components/notifications-list.tsx` (labels and destinations; accounts batch file).
- **Test.** `tests/ux-my-listings.sql` runs the job twice and checks nothing is sent twice.
- **Limitations.** No real e-mail is sent; deliveries queue as for every other type.

### mine-08 ¿Sigue disponible?
- Asked after 30 days without a confirmation or after 5 contacts, not more than every 14 days, never for paused or
  stock-managed listings. "Bajar precio" saves the price and confirms availability in one step.

### mine-01, mine-02 Edit form
- **What changed.** Reasons at the top as a checklist (owner's own ticks, never submitted), affected fields tagged
  "Revisar", one "Guardar y enviar a revisión" button for rejected listings and drafts ("Guardar y publicar" for a
  Tienda verificada), per-field "Se publica al instante" / "Pasa por revisión" on published listings with a live note,
  and the sell-form order. Rejection e-mails open `/mi-cuenta/publicaciones/editar/<slug>`, which redirects the owner to
  the form.
- **Files.** `components/listing-edit-form.tsx`, `app/mi-cuenta/publicaciones/[id]/editar/page.tsx`,
  `app/mi-cuenta/publicaciones/editar/[slug]/page.tsx`, `lib/rejection-reasons.ts`, `lib/email/templates.ts`.
- **Limitations.** If saving works but sending fails, the message says so and the button sends again.

### mine-03 Reasons as a checklist (Admin)
- Checkboxes in the listing and revision reject forms of `components/admin-workbench.tsx`; `p_reason_codes` in
  `review_listing` and `review_listing_revision`.

### mine-04, mine-06, mine-07, mine-10, mine-13, shop-08 Mis publicaciones
- See "Mis publicaciones" below.

### mine-12 Vacation mode
- `components/vacation-mode.tsx` on the home ("Pausar publicaciones", "Ya volví", "Cambiar fecha");
  `set_owned_listings_pause`. The listing page swaps the contact module for "Vuelve el …".
- **Limitations.** A listing created during a pause is not paused. Catalog cards don't show the pause; the listing page
  does.

### mine-09 Buyer cards, trust-02 stars, trust-04 closing panel
- **What changed.** Radio cards with name, contact date, "WhatsApp terminado en ···321" and "Dice que te lo compró";
  no buyer pre-selected. Five tappable star radios with "4 de 5" text and the comment below. After the buyer confirms,
  a "Que lo disfrutes" panel opens the review; a seller's first verified sale shows a milestone notice once. The
  transaction center shows "Tu reseña vence en N días" with a "Reseñar" button.
- **Files.** `components/transaction-detail.tsx`, `components/transaction-center.tsx`, `lib/transactions.ts`,
  `components/transactions/star-rating.tsx`, `components/transactions/buyer-choice.tsx`.

### mine-11, shop-07 Statistics
- **What changed.** `/mi-cuenta/estadisticas` for Particulares (7/30/90 days, per-listing numbers and up to two tips
  linking to the edit form, lifetime totals below) and an "Estadísticas" menu item. The store page adds a 12-week trend
  (two single-line SVG charts with a data table), top 5 by views, contacts and purchase requests, and contacts without a
  sale in 30 days; the header link that sent owners to Inventario is fixed.
- **Files.** `lib/account-analytics.ts` (additions), `app/mi-cuenta/estadisticas/page.tsx`,
  `app/mi-cuenta/tienda/estadisticas/page.tsx`, `components/statistics/*`, `lib/account-navigation.ts` (one item).
- **Defaults.** With the store period "Todo el historial", the new sections use 30 days. Purchase-request rankings show
  only with the pilot on or at least one request.

## Mis publicaciones

mine-04, mine-06, mine-07, mine-10, mine-13 and shop-08.

- **What changed.**
  - **mine-04:** each row has a thumbnail. Status tabs with counts (`?vista=`): Todas, Requieren acción, Activas,
    En revisión, Ocultas, Borradores, Vendidas. Tabs with nothing in them hide, except Todas and the current one. There
    is a title search (`?q=`, ignores case and accents), a sort (`?orden=` recientes, vistas, contactos, precio) and
    pages of 50. "Cambiar precio" edits the price inline (route action `price`). You can tick several listings and
    hide or restore them together; the page reports how many changed and how many couldn't.
  - **mine-13:** hide, restore, price changes and bulk changes apply at once and show "Deshacer" for 10 seconds. The
    timer pauses while the pointer or focus is on the notice, which never takes focus. "Marcar vendida", "Ya lo
    vendí" and "Lo vendí, retirar" keep a confirmation.
  - **mine-07:** "Ya lo vendí" on listings you hid yourself. "Lo vendí, retirar" on listings in review, drafts and
    rejected listings.
  - **mine-10, shop-08:** "Republicar" on sold listings and "Duplicar" on editable ones call `copy_owned_listing` and
    open the new draft's edit form.
  - **mine-06:** private preview at `/mi-cuenta/publicaciones/<id>/vista-previa`. Owner only, noindex, and it shows
    changes waiting in review.
  - **mine-12:** paused listings show "Pausada hasta el …".
- **Files.** `components/listing-management-table.tsx`, `components/undo-toast.tsx`, `lib/my-listings.ts`,
  `app/mi-cuenta/publicaciones/page.tsx`, `app/mi-cuenta/publicaciones/[id]/vista-previa/page.tsx`,
  `app/api/listings/[id]/manage/route.ts` (actions `price`, `withdraw_sold`, `duplicate`; `relist` now drafts).
- **Defaults.**
  - Tab counts follow the search.
  - Price sorts low to high, with listings without a price last.
  - Duplicar and Republicar ask for no confirmation, because they only create a draft.
  - Stock-managed store rows never get sold actions or the inline price.
- **Test.** As `particular@laria.test`, hide a listing and press Deshacer. Use Republicar on a sold listing and check
  that a draft opens. Filter with `?vista=accion`.
- **Limitations.**
  - Filtering is in memory after loading all of the owner's listings, as before.
  - The store's Publicaciones tab gets the new actions, but not the thumbnails or the paused tag, because the inventory
    page (inventory batch) doesn't load them. There were no edits to that page.
  - There is no way to delete a draft made by mistake.
  - The integration tests that expected `relist` to create a pending copy now expect a draft
    (`tests/listing-lifecycle.integration.cjs`, `tests/sprint-3-1.integration.cjs`).

## Shared files touched (smallest edits)

- `lib/supabase/database.types.ts`: new columns, table and RPCs.
- `lib/email/templates.ts`: rejection CTAs and the revision reason; five new templates in a marked block.
- `components/notifications-list.tsx`: labels and destinations for the new types.
- `components/admin-workbench.tsx`: reason checkboxes for listing and revision rejections.
- `app/instrumentos/[slug]/page.tsx` and `lib/listings.ts`: `paused_until`, `availability_confirmed_at`, the check-in
  component and the paused note.
- `lib/account-navigation.ts`: "Estadísticas" for Particulares.
- `docs/functional-spec.md`, `docs/database.md`: marked blocks.
- `tests/listing-lifecycle.integration.cjs`, `tests/sprint-3-1.integration.cjs`: relist now drafts.
- `scripts/prototype/ux-my-listings-seed.sql` (new): demo data for these screens, loaded after `demo-seed.sql`.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (513 pass), `pnpm build`, all SQL suites including `tests/ux-my-listings.sql`
and the concurrency races. Screens at 390 and 1366 px: `/mnt/project-files/ux-ideas/screens/my-listings/`.
