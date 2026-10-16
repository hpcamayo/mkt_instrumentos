# Store Operations: combined prototype review package

Branch `store-ops/prototype` merges every sub-sprint built for this program into one branch on top of `main`. Nothing
here is merged, deployed, applied to a hosted database or enabled for a store. Everything below was run on a local
Postgres in a cloud container. Owner choices are collected on the decisions page linked from the project thread; this
file is the written record.

## What was built

| Sub-sprint | What it adds | Draft PR | Write-up |
| --- | --- | --- | --- |
| STORE-1a inventory core | SKUs, append-only stock ledger, idempotent stock functions, listing link, `stock_state` and "Agotado", sold guard, Admin enablement | [#6](https://github.com/hpcamayo/mkt_instrumentos/pull/6) | [store-1a.md](store-1a.md) |
| STORE-1b inventory screens | Inventario (tiles, filters, table, stock sheet), SKU page, Publicaciones tab, bulk threshold/hide, CSV and Excel export | [#8](https://github.com/hpcamayo/mkt_instrumentos/pull/8) | [store-1b.md](store-1b.md) |
| STORE-2 spreadsheet import | Importar desde Excel: upload, columns, review, confirm, result; leased steps; XLSX/CSV reader; report; 30-day purge | [#9](https://github.com/hpcamayo/mkt_instrumentos/pull/9) | [store-2.md](store-2.md) |
| STORE-3a import photos | Fotos step: browser upload, server checks, matching by file name / column / list, manual placement | [#10](https://github.com/hpcamayo/mkt_instrumentos/pull/10) | [store-3a.md](store-3a.md) |
| STORE-3b publish from import | "Publicar en Laria" on the import result, per-store listing allowance (Admin form), shared `insert_store_listing` | [#11](https://github.com/hpcamayo/mkt_instrumentos/pull/11) | [store-3b.md](store-3b.md) |
| PAY-1 accepted payment methods | Store payment methods with Admin review, methods block and "Solicitar compra" on listings, behind `LARIA_ASSISTED_COMMERCE` (off by default) | [#7](https://github.com/hpcamayo/mkt_instrumentos/pull/7) | [pay-1.md](pay-1.md) |

The sub-sprint PRs stay open as the per-area diffs; the combined PR is the one that would reach `main`.

### What the combined branch adds on top

- **Wiring.** Inventario's "Importar desde Excel" opens the STORE-2 wizard; the "Errores de importación" tile shows the
  last applied import's errors and links to it; the Publicaciones tab, Publicar gate and account summary read the
  STORE-3b allowance instead of the literal 50.
- **One CSV writer.** `lib/spreadsheet/csv-write.ts` (formula guard, quoting, BOM, CRLF) replaces the two copies in
  the inventory export and the import report. One XLSX writer was already shared.
- **Status dictionary.** `lib/ui/status.ts` carries both the inventory (1b) and payment (PAY-1) domains.
- **Shared docs.** `docs/database.md`, `docs/functional-spec.md` ("Planned After V1: Store Operations and Assisted
  Commerce") and `docs/decisions.md` now describe every sub-sprint. `acceptance/*` is untouched.
- **Local prototype kit** in `scripts/prototype/`: Docker-free stand-in Supabase API, demo seed, demo import file and
  photos, benchmark scripts, README.

## Checks run on the combined branch

- 51 migrations replay from zero; every SQL suite in `tests/*.sql` passes, plus the STORE-1a concurrency harness and the
  STORE-3a race test.
- 423 of 423 unit tests, `tsc --noEmit`, ESLint and `next build` pass.
- Browser runs against a production build with the demo seed: inventory, SKU page, stock sheet, export, the full
  import (file with deliberate errors, 6 photos matched to 3 SKUs, confirm, publish one ready SKU), Admin allowance,
  Admin and owner payment methods, store page, listing with "Solicitar compra", "Agotado" listing, phone width.
- Screenshots: `/mnt/project-files/store-operations/prototype/screens/` (19 images; names say the flow and step).

## Indicative benchmarks (design §14.5)

Local Postgres 16, single client, warm cache; not the STORE-4 production-tier runs. Full tables in
`/mnt/project-files/store-operations/prototype/bench-inventory.md`.

- 5,000 SKUs and 20,000 movements: every Inventario page variant p95 ≤ 16 ms (p99 ≤ 32 ms), summary p95 6 ms, stock
  movement p95 3 ms, public catalog query with the stock predicate p95 23 ms through PostgREST.
- 2,000-row XLSX through the real wizard: upload and parse 1.4 s, review ready 1.9 s, commit 5.4 s.

## Defaults the threads took (for your choice)

Each was taken without asking you, per your instruction; the decisions page lists them with accept / change.

1. **Unused import photos** are kept until the import is purged (30 days), not deleted at confirmation, so the store
   can photograph after importing stock (3a; design §8.5 said delete at confirm).
2. **Import changes inventory only**; listing text and photos change through the listing editor and moderation
   (STORE-2). Price write-through to a linked listing still applies.
3. **Every imported row must meet the sell form's requirements to publish**, including Tiendas whose rows go to
   review (3b).
4. **Listing allowance**: default 50, Admin range 1–2000 with reason and audit; lowering hides nothing (3b).
5. **One shared insert path** for the sell form and import publication (`insert_store_listing`); ordinary
   submissions behave as before and their suites pass unchanged (3b).
6. **Publication lives on the import result page**, reachable until the purge, not a seventh wizard step (3b).
7. **"Solicitar compra" replaces the label** of the one WhatsApp button on eligible listings when the pilot is on;
   it needs the UX owner's sign-off as the one exception to "Contactar por WhatsApp" (PAY-1).
8. **A purchase request is a WhatsApp contact** with `intent = purchase`, so the buyer can still be named in a sale
   and review (PAY-1).
9. **Any owner edit, or a RUC / razón social change, sends an approved method back to review**; methods hidden by a
   revoked verification reappear without a new review if the store is verified again (PAY-1).
10. **Pilot switch** is one deployment setting, `LARIA_ASSISTED_COMMERCE`, off by default (PAY-1).
11. **Bulk actions apply to the current page of 50**; bulk hide skips SKUs without an approved publication and says
    which (1b).
12. **Import file cleanup**: the database part runs daily on `pg_cron`; the route that deletes stored files has no
    schedule yet, because the Hobby release must not add `vercel.json` (STORE-2).
13. **XLSX reader** is `fflate` plus an own tokenizer (bounded decompression), no SheetJS/ExcelJS (STORE-2).

Smaller defaults are in each write-up's "Defaults taken" section.

## Independent review guide (design §17)

Codex runs only on your Mac. Each item is self-contained; the file names the questions to ask.

| §17 item | Area | Where the guide is |
| --- | --- | --- |
| 1 Stock concurrency | `record_stock_movement`, bulk operations, item/listing lock order, concurrency harness; plus 1b's bulk threshold/hide | [store-1a.md](store-1a.md) "Independent review", [store-1b.md](store-1b.md) item 2 |
| 2 Schema and listing invariants | Composite FK, `stock_state` protection, sold guard, alert and price-drop changes; Particular listings unchanged | [store-1a.md](store-1a.md) "Independent review" |
| 3 Import security | XLSX reader and decompression bounds, CSV parsing, formula handling, export sanitization (now `csv-write.ts`), step lease and idempotency | [store-2.md](store-2.md) "Independent review", [store-1b.md](store-1b.md) item 1 |
| 4 Photo pipeline | Storage policies for `store-imports` / `store-import-photos`, server validation, proxy mapping, cleanup claims | [store-3a.md](store-3a.md) "Independent review" |
| 5 Quota and publication | Allowance read inside the advisory lock, Admin function and audit, `publish_store_import_rows`, shared insert path | [store-3b.md](store-3b.md) "Independent review" |
| 6 Payment boundary | Method eligibility tied to live verification, no money state, public read function, Terms/Privacy diff | [pay-1.md](pay-1.md) "Independent review" |

Added by the combined branch, worth a look under item 3: `lib/spreadsheet/csv-write.ts` and its two callers.

## Proposed acceptance cases

[acceptance-proposal.tsv](acceptance-proposal.tsv): 136 proposals, numbered contiguously per family and checked
against `acceptance/cases.tsv` for clashes. Nothing is in the canonical registry until you approve the IDs.

| Family | IDs | Sub-sprints |
| --- | --- | --- |
| INV | INV-001 … INV-049 | 1a (001–018), 1b (019–039), 3b allowance (040–049) |
| IMP | IMP-001 … IMP-049 | STORE-2 (001–029), 3b publication (030–049) |
| IPH | IPH-001 … IPH-019 | 3a |
| PAY | PAY-001 … PAY-019 | PAY-1 |

## Not in this build, and why

- **STORE-3c, catalog autofill in import**: the autofill code exists only on the prototype branch
  `proto/catalog-autofill-jev-bvvvxm`, not on `main`; the design forbids copying it. `store_import_rows.catalog` is
  reserved for it.
- **STORE-4, pilot rollout**: needs real pilot stores and the production database tier for the binding benchmarks.
- **SYNC-1, external stock sync**: contract only until a merchant's own system is known.

## Known limitations

- `lib/supabase/database.types.ts` is not regenerated; new code uses untyped clients for the new tables. Regenerate
  once against the migrated database before merge.
- Unpublished SKUs in Inventario don't link back to an import's publish section; publishing from Inventario uses the
  normal Publicar flow.
- Benchmarks are indicative (local, no network between app and database, no Vercel limits).
- The local stand-in for Supabase covers password sign-in, PostgREST and Storage only; e-mail, OTP and sign-up were
  not exercised.
- Vercel preview builds of these branches may point at an unknown database; they were not used as evidence.

## Production steps, only after your approval

Status 2026-10-16: Henri accepted the sub-sprints, kept every default and approved the acceptance IDs (now in
`acceptance/cases.tsv` as `Not Run`, domain Store Operations, non-blocking). The six Codex reviews were run; every
finding is fixed in PR #13 (security, concurrency, data) and Henri's screen changes are in PR #14, both merged into
this branch. See `review-fixes.md`.

1. Legal review of the PAY-1 Terms and Privacy drafts (consumer protection, Ley 29733, e-invoicing); update the text
   and `LEGAL_LAST_UPDATED`.
2. Regenerate `database.types.ts`, merge the combined PR to `main`.
3. Apply the migrations in order (`20261023…` to `20261030…`, eleven files) to production.
4. Schedule the import-file cleanup route with whatever scheduler runs the e-mail worker.
5. Enable inventory for two or three pilot stores from Admin; set allowances where needed.
6. Payments pilot, only after step 1 and the first approved methods: set `LARIA_ASSISTED_COMMERCE=1` and, as the
   database owner, run `select laria_private.set_assisted_commerce_pilot(true, '<reason>');`.
7. STORE-4: pilot with real stores and the production-tier benchmarks.

## How to run it

`scripts/prototype/README.md`: on your Mac with `supabase start`, `supabase db reset` and the demo seed, or without
Docker. Demo accounts use `@laria.test` and password `laria-demo-2026`; the README lists what to look at with each.
