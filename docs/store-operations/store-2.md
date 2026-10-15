# STORE-2: spreadsheet import

Status: implemented on branch `store-ops/store-2-import` (from `store-ops/store-1a-inventory-core`), local tests and a
browser run on the local prototype green, **not applied to production and not accepted yet**. Acceptance, the
proposed `IMP-` cases and the independent review (design §17 item 3) wait for the final review of the combined
prototype. The design is [`design.md`](design.md) §7 and §13.4; owner decisions D-1…D-15 are at their accepted
defaults (D-3: 5 MB, 2,000 rows, 80 columns).

## What it adds

**Migration** `supabase/migrations/20261025120000_store_inventory_import.sql`, purely additive:

| Object | Purpose |
| --- | --- |
| `store_import_sessions` | One import: status, file path/size/hash, headers, proposed and confirmed column mapping, counts, result summary, lease (`lock_token`, `locked_until`), `version` for stale-screen checks. One open import per store (partial unique index). |
| `store_import_rows` | One staged row: raw cells (≤ 32 KB), parsed values, issues, planned action and field-by-field changes, target item and version, owner decision, commit status and what it applied. |
| `store_stock_movements.import_session_id` | FK to the session, plus a check that import movements carry their row number. |
| `store_operation_settings.import_mapping_default` | The store's saved column mapping (header → field). |
| `laria_private.store_import_file_deletions` | Queue of source files to delete through the Storage API. |
| Bucket `store-imports` | Private, 5 MB, `text/csv` and `.xlsx` only. The owner may insert exactly `{uid}/{session}/source.{format}` while the session awaits its file, and read it; no update or delete. |

Owner RPCs (`security definer`, bound to `auth.uid()`, gated by STORE-1a's `require_inventory_write`):
`create_store_import_session`, `claim_store_import_step` / `release_store_import_step` (90 s lease),
`begin_store_import_parse`, `stage_store_import_rows` (≤ 1,000), `finish_store_import_parse`, `fail_store_import`,
`confirm_store_import_mapping`, `plan_store_import_rows` (≤ 100), `finish_store_import_validation`,
`set_store_import_rows_decision`, `start_store_import_commit`, `commit_store_import_chunk` (≤ 50, one transaction),
`finish_store_import_commit`, `reopen_store_import`, `cancel_store_import`. Retention:
`laria_private.run_store_import_retention()` on `pg_cron` daily at 09:15 UTC, and service-role-only
`claim_store_import_file_deletions` / `complete_store_import_file_deletions` for the cleanup route.

**Application**

- `lib/store-import/`: `csv.ts` (decoding, delimiter detection, RFC 4180), `xlsx-read.ts` (bounded XLSX reader),
  `sheet.ts` (format sniffing, header row detection, limits), `mapping.ts` (fields, synonyms, proposals),
  `rows.ts` (row validation), `template.ts`, `report.ts` (formula-safe result CSV), `server.ts` (step runner and
  actions), `route-helpers.ts`, `labels.ts`, `limits.ts`.
- `lib/spreadsheet/xlsx-write.ts`: a minimal XLSX writer (inline strings, text-formatted identifier columns) used by
  the template; STORE-1b can use it for the export.
- Routes: `POST /api/store/imports`, `GET|POST /api/store/imports/[id]`, `POST /api/store/imports/[id]/step`,
  `GET /api/store/imports/[id]/rows`, `GET /api/store/imports/[id]/report`, `GET /api/store/imports/template`,
  `GET /api/internal/store-imports/cleanup` (CRON_SECRET).
- Pages: `/mi-cuenta/tienda/inventario/importar` (upload, template, unfinished import, history) and
  `/mi-cuenta/tienda/inventario/importar/[sessionId]` (the wizard: Subir archivo → Columnas → Revisar → Confirmar →
  Resultado). STORE-3a adds Fotos by adding an entry to `IMPORT_WIZARD_STEPS` in
  `components/store-import/import-wizard.tsx`.
- Dependency: `fflate` 0.8.2 (no other spreadsheet library).

### How an import runs

1. The page creates a session, then uploads the file straight to the private bucket with the owner's session.
2. While the page is open it calls `/step` in a loop. Each call takes the lease, does bounded units of work for up to
   20 s (parse and stage 500 rows per call; plan 100 rows per unit; commit 50 rows per unit), checkpoints and releases
   the lease. Closing the page stops at the last checkpoint; reopening continues. A second tab gets "busy" and waits.
3. Parsing proposes a column mapping (saved store mapping first, then synonyms); the owner confirms it.
4. Validation parses every row in Node (`rows.ts`) and plans it in SQL (`plan_import_row`): create, update,
   adopt a listing, unchanged or error, with each change shown as current → new (stock 12 → 9 shows −3).
5. The owner reviews, can exclude rows, and confirms. Commit runs chunk by chunk; each row re-plans against current
   values, so a row whose SKU changed since the preview becomes a conflict instead of overwriting a sale.
6. The result shows applied, conflict, failed, error, excluded and unchanged rows, a CSV report, and "Revisar filas no
   aplicadas", which re-plans conflict and failed rows with current values for another confirm.

## Defaults taken (no owner question asked)

| Question | Default | Why |
| --- | --- | --- |
| XLSX library (§7.4) | `fflate` streaming inflate plus an own tokenizer; no SheetJS/ExcelJS | Only this bounds decompression per part and in total before bytes are inflated. |
| Upload target | RLS-scoped direct upload to the one allowed path, not a signed URL | The policy binds path, owner and session state; no service role on the upload path. |
| Header row | Detected automatically (first of the first 20 rows with ≥ 2 text cells); no picker | Covers a title row above the headings; the page says which row was used. |
| Sheet | First visible sheet only; a warning if there are more | D-3 says one sheet per import. |
| Blank cells | Never change the current value | Brief: a blank is not an instruction. Clearing a field is a manual edit. |
| New SKU | Needs a name and a stock value | An item without stock or a name cannot be created by STORE-1a's rules. |
| Blank SKU | Generated `LAR-…` code, with a warning that re-importing the same file would create duplicates | Same rule as manual creation. |
| Archived SKU in the file | Row error ("Restaura el SKU…") | Silent unarchive would surprise the owner. |
| Adoption price | Row price, else the listing price, else the item price | The file is the owner's latest word; otherwise keep the published price. |
| Duplicates in a file | Every involved row is an error (SKU, listing id or matched item) | Which one is right is the owner's call. |
| Numeric identifiers | Number → warning (leading zeros); scientific notation, a date, or a number past 15 digits → error | Excel already lost the original value in the error cases. |
| Prices | Whole soles; `1.500` / `1,500` refused as ambiguous; decimals other than `.00` refused | Same rules as the listing form; never guessed. |
| "Actualizar también las publicaciones" | Not offered; the import changes inventory fields only (a price write-through still reaches a linked listing) | Listing content goes through moderation, which STORE-3b owns with publication. |
| Catalog autofill | Not run; `store_import_rows.catalog` reserved | Autofill code is not on `main` (STORE-3c). |
| Photos column | Parsed and kept; no assignment | STORE-3a. |
| Template CSV | Comma-separated with a BOM | Opens with accents in Excel; semicolon files are still read. |
| Remembered mapping | Saved when "Recordar estas columnas" is ticked (default on) | Most stores reuse one file layout. |
| Cleanup schedule | `pg_cron` daily for the database part; the file-deleting route has **no** schedule | The pre-go-live Hobby release must not add `vercel.json` (sprint-7 test); the scheduler that will call the email worker calls this route too. Until then queued files wait. |

## Where it differs from the design, and why

| Design | Implemented | Why |
| --- | --- | --- |
| Status `uploaded` | `awaiting_upload` until the file is read | The session exists before the file does. |
| `raw` ≤ 8 KB | ≤ 32 KB, cells cut at 2,000 characters and flagged | 80 columns with long descriptions exceed 8 KB legitimately. |
| `planned_action` includes `excluded` | Exclusion is `owner_decision`; the plan stays visible | Including a row again does not need a re-plan. |
| Unique `(session_id, sku_normalized)` | Duplicate detection marks rows as errors | A unique index would reject the second row at staging instead of explaining both. |
| Parse ≤ 1,000 rows per step | Stage 500 rows per call; the whole file is re-read per step | The file is ≤ 5 MB and reading it is fast; staging is the part worth bounding. |
| Confirm button text "Crear 120, actualizar 34…" | A short list of what will happen above "Confirmar importación" | Long counts read better as lines on a phone. |
| Preview groups for catalog matches, photo problems, listing allowance | Not shown | STORE-3c, STORE-3a, STORE-3b. Rows missing publication data are counted ("N SKU necesitan más datos para publicarse"). |
| `ErrorSummary` for the whole wizard | Used for start, column and step errors; row problems are listed on each row | Row problems are data, not form errors. |

`lib/supabase/database.types.ts` is not regenerated: the import code casts to an untyped client, so the combined
prototype regenerates types once. `tests/ux-copy.test.cjs` skips `lib/spreadsheet/xlsx-write.ts` (OOXML markup such
as `version=` and `Extension=` reads as Spanish words to the scan).

## How to test

```bash
pnpm test                                   # includes tests/store-ops-2.test.cjs (20 parsing cases)
npx tsc --noEmit && pnpm lint && pnpm build
bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh reset
bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh test   # includes tests/store-ops-2.sql
```

`tests/store-ops-2.sql` (rolled back) covers anonymous denial, the pilot gate, storage policies, lease and busy,
parse and fail, first import (create, generated SKU, invalid values, duplicates, adoption, other store's listing,
sold listing, mismatch), commit, reimport as snapshot (7 → 5 is −2 `import_reconciliation`), zero stock, conflicts and
retry, failed rows and reopen, isolation between owners, hidden store read-only, Admin read, retention and the
service-role cleanup claims.

Browser run (local prototype from `store-ops/prototype`, not committed here): as `demo-tienda@laria.test`, a 9-row
XLSX with a title row, Spanish headings (`Código`, `Cant.`, `P. Venta`…), an update, an unchanged row, three new SKUs,
a duplicate pair, a bad stock and an ambiguous price went through every step on desktop and at 390 px; the ledger got
one `import_reconciliation` (−1) and three `opening_balance` movements with channel `importacion`, and the report CSV
matched the screen. The run found and fixed two things: supabase-js sends a `File` as a multipart form (the page now
uploads the raw bytes), and `Cant.` was not a stock synonym. The prototype gateway's storage insert also failed
("inconsistent types deduced for parameter $3"); patched locally only, reported to the prototype thread.

## Rollback

Imports only add rows; nothing changes until an owner confirms. To stop imports, revoke `execute` on
`create_store_import_session` from `authenticated` (open sessions can still be cancelled). Applied rows are ordinary
ledger movements and change-log entries with `import_session_id`, so they stay; undoing an import is a stock count
per SKU, as for any other movement. `select cron.unschedule('store-import-retention');` removes the job. Dropping the
tables is not planned: the ledger FK points at sessions.

## Independent review (design §17, item 3: import security)

Codex (or another independent reviewer) should check these before the code merges.

1. **XLSX reader and decompression bounds** — `lib/store-import/xlsx-read.ts`: `extractXlsxParts` (allowlisted parts
   only, entry count, 16 KB input slices into `fflate`'s streaming `Unzip`, running 40 MB total budget, 100:1 per part
   after the first 1 MB, abort on exceed), `readXlsx` (macro and `.xls` refusal, DTD/entity refusal, first visible
   sheet, cell types, cached formula values flagged `f`, column bound before allocating). Questions: can any input
   inflate more than the budget before the check fires (stored vs deflated entries, data descriptors, a lying central
   directory); can a crafted `sharedStrings.xml` or sheet make the tokenizer quadratic; is any external link, embedded
   object or macro ever read? Tests: `tests/store-ops-2.test.cjs` ("hostile files", "ZIP bombs").
2. **CSV parsing** — `lib/store-import/csv.ts`: encoding fallback, delimiter detection, quote handling, cell and row
   bounds. Question: can a single quote or line ending make the parser hold more than one cell's worth beyond the
   limit, or loop?
3. **Formula handling** — imports never evaluate formulas (cached values only, warning per row); the result report
   (`lib/store-import/report.ts`, `csvSafeCell`) prefixes `= + - @ tab CR` with `'`. Export sanitization proper is
   STORE-1b's `lib` export; the same rule should be checked there. Question: is any merchant text written to a
   spreadsheet anywhere without that prefix?
4. **Lease and idempotency of the step model** — migration: `claim_store_import_step`, `import_session_with_lease`,
   `release_store_import_step`, `stage_store_import_rows` (idempotent re-staging), `commit_store_import_chunk`
   (`import:{session}:{row}` key, row re-plan inside the chunk, savepoint per row, 40001/40P01 re-raised so the
   chunk applies nothing), `finish_store_import_commit`, `reopen_store_import`, `cancel_store_import`. Questions: can
   two steps ever run for one session at once; can a retried chunk apply a row twice; can a stale preview overwrite a
   sale made after it; does lock order stay listings → items (STORE-1a §4.3)?
5. **Access** — storage policies on `store-imports` (exact path, owner, session state, no update/delete), RLS on both
   tables, `import_session_json` dropping `lock_token`, every RPC's `revoke … grant execute`, the cleanup route's
   `CRON_SECRET` check and service-role-only claim functions.

## Acceptance proposal (not in `acceptance/cases.tsv`)

Proposed `IMP-` cases for Henri's review; added to `acceptance/cases.tsv` only after it. Photo, publication and
catalog cases belong to STORE-3a/3b/3c (`IPH-` and later `IMP-` numbers).

| Proposed ID | Requirement | Expected | Automated evidence |
| --- | --- | --- | --- |
| IMP-001 | Only an enabled store's owner can import | Disabled store, other owners, Particulares and anonymous visitors are refused | `store-ops-2.sql` gate, anon |
| IMP-002 | The file stays private | Upload only to the session's own path while it waits for the file; no update, delete or cross-owner read | `store-ops-2.sql` storage block |
| IMP-003 | XLSX and CSV up to 5 MB, 2,000 rows, 80 columns | Over the limits: clear Spanish message, nothing staged | `store-ops-2.test.cjs` limits |
| IMP-004 | `.xls`, macro workbooks and non-spreadsheets are refused | `IMPORT_XLS_UNSUPPORTED`, `IMPORT_XLSX_MACROS`, `IMPORT_FILE_INVALID` | `store-ops-2.test.cjs` hostile files |
| IMP-005 | Compressed bombs are stopped before inflating | 40 MB total and 100:1 per part budgets | `store-ops-2.test.cjs` ZIP bombs |
| IMP-006 | Formulas are never evaluated | Cached value used, row warned | `store-ops-2.test.cjs` |
| IMP-007 | CSV in UTF-8, UTF-16 or Windows-1252, with `,`, `;` or tab | Accents and delimiter right | `store-ops-2.test.cjs` CSV |
| IMP-008 | Headings are recognized in Spanish or English and confirmed once | Proposal per column; saved mapping reused next time | `store-ops-2.test.cjs` mapping; browser run |
| IMP-009 | Stock and SKU (or name) columns are required | Column step lists what is missing | `store-ops-2.test.cjs` mapping; `store-ops-2.sql` confirm |
| IMP-010 | Excel-mangled identifiers are caught | Scientific notation, dates and >15-digit numbers are errors; numeric SKUs warn | `store-ops-2.test.cjs` |
| IMP-011 | Prices are whole soles and never guessed | `1.500`, `1,500`, cents, other currencies refused | `store-ops-2.test.cjs` prices |
| IMP-012 | Stock is a whole number 0–100,000 | Decimals, negatives, text, booleans and dates refused | `store-ops-2.test.cjs` |
| IMP-013 | A SKU appears once per file | All involved rows are errors, case-insensitively | `store-ops-2.sql` first import |
| IMP-014 | Nothing changes until the owner confirms | Preview shows counts and current → new per field | `store-ops-2.sql`; browser run |
| IMP-015 | The owner can exclude and include rows | Excluded rows are not applied; counts follow | `store-ops-2.sql` decisions |
| IMP-016 | Stock in the file is the counted total | 7 → 5 records −2 `import_reconciliation` with session and row | `store-ops-2.sql` reimport |
| IMP-017 | New SKUs start with an opening balance | `opening_balance` movement, channel `importacion` | `store-ops-2.sql` commit |
| IMP-018 | SKUs missing from a later file are untouched | Not zeroed, not archived | `store-ops-2.sql` reimport |
| IMP-019 | Blank cells keep current values | No change recorded | `store-ops-2.sql` unchanged |
| IMP-020 | A listing id adopts the store's own listing | Linked with the chosen price; other store's or sold listing refused | `store-ops-2.sql` adoption |
| IMP-021 | Price changes reach linked listings and favorites | Write-through and one price-drop notice | `store-ops-2.sql` reimport |
| IMP-022 | Zero stock marks the listing "Agotado" without changing its status | `stock_state` `out_of_stock`, still approved | `store-ops-2.sql` zero stock |
| IMP-023 | A sale during an import is never overwritten | Changed SKU becomes a conflict; re-planned on review | `store-ops-2.sql` conflicts |
| IMP-024 | A retried step never applies a row twice | Same row key; applied rows skipped | `store-ops-2.sql` retry chunk |
| IMP-025 | Two tabs cannot process one import | Second gets busy; an expired lease is taken over | `store-ops-2.sql` lease |
| IMP-026 | Closing the page pauses the import | Reopening continues from the checkpoint | Step model and lease tests in `store-ops-2.sql`; not yet run as a browser reload |
| IMP-027 | The result is downloadable and spreadsheet-safe | Report CSV with formula prefix | `store-ops-2.test.cjs` report; browser run |
| IMP-028 | One open import per store; cancel keeps applied rows | `IMPORT_ALREADY_OPEN`; cancel leaves ledger intact | `store-ops-2.sql` |
| IMP-029 | Abandoned imports expire and files are deleted | 7 days idle → expired; rows purged and files queued 30 days after close | `store-ops-2.sql` retention |

## Known limitations

- The Inventario page has no "Importar" button here; STORE-1b adds it (the start page is at
  `/mi-cuenta/tienda/inventario/importar`).
- The file cleanup route is not scheduled before go-live (see defaults); queued files wait.
- No photos, publication, catalog matching or listing-content updates (STORE-3a/3b/3c).
- `database.types.ts` lacks the import objects (untyped client casts).
- Large-file timing (2,000 rows × 80 columns) is measured only in the SQL suite and a 9-row browser run; the §14.5
  benchmarks are STORE-4 work.
- Copy on these screens is provisional until the combined D-13 copy review; "Importar desde Excel" is the page title
  proposed in §13.5.
