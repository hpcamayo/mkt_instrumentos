# UX-5 · Selling — acceptance package

**State: built in the cloud session of 10 Oct (N17), waiting for the owner's review.** Answers S1–S11 provisional (`ux-5-selling.md`); product flags F1, F2, F4, F6 and the "producto" string unchanged; build choices U9–U13 in `decisions.md` (U10 pending).

## What was built

- `components/sell-listing-form.tsx`: seven numbered sections (Fotos, El instrumento, Condición y precio, Ubicación, Descripción, Características when the type has attributes, Publicar); the photo checklist; type chips; condition cards with definitions; the form checks itself (`noValidate`) and shows per-field errors plus an error summary that takes focus; "Subiendo foto N de M…" / "Enviando la publicación…" while sending; a confirmation in place of the form; per-photo names as on edit; one live description count.
- `lib/sell-form.ts`: the checks (today's rules, in page order), the condition definitions, the photo checklist and the confirmation copy (the review email, never a speed).
- `components/ui/error-summary.tsx`: a reusable summary (links focus their field). `components/selling/choice-fields.tsx`: `TypeChips`, `ConditionCards`, `FormSection`.
- `components/location-fields.tsx`: optional `idPrefix`, `cityError`, `regionError` (other callers unchanged).
- `lib/public-submission.ts`: optional `onProgress` callback; tokens, cleanup and retry unchanged.
- `components/listing-edit-form.tsx`: condition cards (same name `condition`, same stored values); nothing else.
- `lib/instrument-filters.ts`: eleven option labels in Spanish (U9); values unchanged.

## Criteria (brief § Acceptance criteria)

| # | Criterion | State |
| --- | --- | --- |
| 1 | Seven sections, photos first, checklist | Rendered-markup test (`tests/ux-selling.test.cjs`); cloud check at 390 and 1280 on a throwaway preview route (removed before commit) |
| 2 | Incomplete submit sends nothing; summary focused, ordered, links focus fields; fields `aria-invalid` | Unit tests for order and messages; cloud check: focus on the summary, 9 errors listed, 13 invalid controls (each radio of a group counts), the second link focused the type group. Screen reader **pending on the Mac** |
| 3 | Type chips, condition cards, stored values unchanged | Tests |
| 4 | Upload progress | Callback tested with a fake storage client; real upload **pending on the Mac** |
| 5 | Confirmation with the email copy; "Publicar otro instrumento" | Copy tested; the real submit **pending on the Mac** (needs local Supabase) |
| 6 | Per-photo names match edit | Test |
| 7 | Spanish labels everywhere they show | Test on the definitions; filters/cards read the same labels |
| 8 | Edit: condition cards; flow unchanged | `photo-editor.test.cjs` (14) unchanged and passing; lifecycle tests passing |
| 9 | No overflow 320–390; controls ≥ 44 px | No overflow at 390 (cloud); 320 and zoom **pending on the Mac** |
| 10 | lint, typecheck, tests, build | Pass in the cloud: **329 tests** |

Acceptance rows to re-run (owner, on the Mac): LIST-001–023, PHOTO-001–031, REV-001–019, LIFE-001–014, CAP-001–011, LEGAL links. **All pending on the Mac.** Nothing was marked in `acceptance/cases.tsv`.

## Pending on the Mac (commands)

```sh
cd ../mkt_instrumentos-ux && git pull && pnpm install
pnpm build && pnpm start -p 3100                       # .env.local → 127.0.0.1:54321
node scripts/ux-local-accounts.cjs                     # Particular, verified store, Admin
# Walk through /vender as the Particular (review path) and the verified store (direct path): empty submit,
# fix each error, add 3 photos, reorder, send; check the confirmation and "Publicar otro instrumento".
node tests/run-local.cjs node tests/submissions.integration.cjs http://localhost:3100
node tests/run-local.cjs node tests/photos.integration.cjs http://localhost:3100
node tests/run-local.cjs node tests/listing-lifecycle.integration.cjs http://localhost:3100
node tests/photo-browser-smoke.cjs http://localhost:3100   # edit page: edit-photo-heading, "Guardar cambios", form[aria-busy]
node scripts/ux-snapshots.cjs --label ux5-after
node scripts/ux-audit.cjs --axe <axe.min.js>
```

## Known limitations

- Edit keeps its single top notice for validation (U10, pending).
- Leaving the page loses the draft (F6 not built).
- The photo and rules errors have no icon (they are not `Field`s); the summary still lists them.
