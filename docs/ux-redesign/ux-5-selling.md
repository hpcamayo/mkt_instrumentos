# UX-5 · Selling — brief

**Status: provisional (written and built overnight, 10 Oct 2026, under N17).** The owner was away: every question below takes its recommendation as a provisional answer, every product-behaviour flag takes its no-change option, and the owner confirms or reverses each answer at the UX-5 review (`ux-5-acceptance.md`). Where this brief and the concept screenshots differ, this brief wins.

UX-5 helps a seller get from "Vender" to a complete, attractive listing without guessing, and tells them what happens next:
- `/vender` (account-type gate, unchanged redirect);
- `/mi-cuenta/publicar` (Particular) and `/mi-cuenta/tienda/publicar` (store, the 50-listing cap notice);
- `/mi-cuenta/publicaciones/[id]/editar` (edit and "Cambios en revisión").

It changes no schema, migration, RLS, auth, moderation, lifecycle or submission rule. The submission still goes through `createPublicSubmission` → `/api/submissions` (`start`, `complete`, `cleanup`, the idempotency token and the retry rules); the edit still goes through `start_edit`/`edit` with the immediate/moderated split. The only change to `lib/public-submission.ts` is an optional progress callback that reports which photo is uploading.

**Visual reference:** `screenshots/page-concepts/Publicar-390` (photos first, type chips, condition radio cards with definitions, grouped sections, an error summary).

## Today (checked 10 Oct on `942131f`)

- **One long panel of fields** (`components/sell-listing-form.tsx`): title first, then a two-column grid of selects (category, type, brand, model, condition, price, city, region), attributes, description, photos last, the rules checkbox and "Publicar".
- **Errors:** native `required` stops the submit with the browser's English-or-Spanish bubble for empty fields; anything else (region not in the list, description under 40, photos, rules) is one sentence in a top `PageNotice`. `Field` supports `error` but no form passes one, so no control is ever `aria-invalid`.
- **After a successful submit the form resets** and a notice says "Publicación enviada…" above an empty form. Nothing says an email follows.
- **No upload progress** on create (the edit form has one); the button just reads "Enviando...".
- **Per-photo controls are unnamed on create** ("Anterior", "Siguiente", "Quitar" for every photo); edit names them ("Mover foto 2 antes", "Quitar foto 2").
- **Condition is a select** with the stored values ("Usado - buen estado"), with no definition of the grades.
- **Some attribute labels are English** where Spanish is what Peruvian musicians say ("Solid body", "Distortion", "Compressor", "Tuner", "Cabinet", "Lavalier", "Shotgun").
- **The type is a select that is disabled until a category is chosen.**

## Questions (provisional answers in bold)

| # | Question | Options | Recommendation (taken provisionally) |
| --- | --- | --- | --- |
| S1 | One page or steps | A one page with numbered sections · B a stepper | **A.** One page keeps every field reviewable before "Publicar", works without client routing and keeps the submission token flow untouched. Sections: 1 Fotos, 2 El instrumento, 3 Condición y precio, 4 Ubicación, 5 Descripción, 6 Características (opcionales), 7 Publicar |
| S2 | Photo guidance | A a short checklist under "Fotos" · B none | **A.** "Frente y reverso completos · Detalles y desgaste de cerca · Accesorios incluidos · Luz natural, sin filtros". Photos come first (the concept) |
| S3 | Condition help | A radio cards with a one-line definition · B select as today | **A.** The three stored values are unchanged (F2 stays separate); the cards show "Nuevo", "Usado · buen estado", "Usado · con detalles" with provisional definitions |
| S4 | Type selection | A radio chips under the category · B select | **A.** A radio group styled as chips (one tab stop, arrow keys); a category with one type selects it as today |
| S5 | Errors | A per-field errors + an error summary that takes focus · B one notice | **A.** The form validates itself (`noValidate`); the summary ("Revisa N datos antes de publicar") lists each error as a link that focuses its field; each field shows its error and is `aria-invalid`. An error clears when its field changes. Server errors stay in the `PageNotice` |
| S6 | After submit | A a confirmation view in place of the form · B reset the form as today | **A.** The `PageNotice` states what happens next, including the email for listings that go to review (decisions § Email notices in context), with "Ver mis publicaciones" / "Ver inventario", "Publicar otro instrumento" and "Volver al resumen" |
| S7 | Upload progress | A "Subiendo foto N de M…" as edit does · B none | **A.** Via the optional progress callback; then "Enviando la publicación…" |
| S8 | One verb | A "Publicar" for the action everywhere in the flow · B mixed | **A.** The button says "Publicar"; what happens next is said once, near it ("Un administrador la revisará antes de mostrarla" or, for an active verified store, "Aparecerá en el catálogo al publicarla") |
| S9 | Attribute labels | A Spanish where it is what musicians say, keep established gear names · B translate everything · C as today | **A.** Values unchanged. Spanish: Cuerpo sólido, Semihueca, Hueca, Distorsión, Compresor, Afinador, Multiefectos, Gabinete, De cinta, Corbatero, Cañón. Kept as gear names: Single coil, Humbucker, P90, Overdrive, Fuzz, Delay, Reverb, Chorus, Wah, Floyd Rose, Strat, Tele… |
| S10 | Per-photo names on create | A the same names as edit · B as today | **A.** "Mover foto N antes/después", "Reemplazar foto N", "Quitar foto N"; alt "Foto N"; a "Foto N de M · Principal" line instead of the file name |
| S11 | Edit page | A condition cards and Spanish labels shared with create; validation unchanged · B full rework | **A**, narrowed: condition cards and the Spanish labels only. The edit page's photo controls, save flow and the "Cambios en revisión" note are unchanged (they are pinned by `photo-editor.test.cjs` and the lifecycle tests). Per-field errors on edit are left for UX-8 (pending item U10) |

## Product-behaviour flags (no-change option taken)

| Flag | No-change answer for V1 UX |
| --- | --- |
| F6 Draft autosave | Not built. Leaving the page loses what was typed, as today |
| F4 "Nuevo" limited to stores | Not built. Every seller can choose any of the three conditions, as today |
| F2 A gear-specific condition scale | Not built. Three grades; only their help text is new |
| F1 Relist slug growth | Relist is not touched |
| "producto" in database strings (`LISTING_FIELD_REQUIRED`) | No migration. The manage route keeps mapping it to generic copy |

## Product rules it must not change

- Submission: `submit_listing_for_publication`, `complete_public_submission`, submission tokens, cleanup and retry (`lib/public-submission.ts`).
- Edits: the immediate fields (price, description, city, region, attributes) and the moderated fields (`listing-edit-form.tsx`, pinned by `listing-lifecycle`); `start_edit`/`edit`; reference-checked photo cleanup.
- Photos: 2–10, JPEG/PNG/WebP, 5 MB (`lib/listing-submission.ts`).
- Stores: the 50-listing cap; verified active stores publish directly, every other listing goes to review.
- Description minimum 40 characters; prices in whole soles (`parseWholeSolPrice`, `inputMode="numeric"`); region normalized with `normalizePeruRegion`.
- The rules checkbox links `/terminos` before `/articulos-prohibidos` and keeps the payments/shipping/guarantees limitation.

## Acceptance criteria

1. The create form shows the seven sections in order, photos first, with the photo checklist.
2. Submitting an incomplete form sends nothing; the error summary takes focus, lists every error in field order, and each link focuses its field; each field shows its error and is `aria-invalid="true"`.
3. Type is a radio group of chips; condition is a radio group of three cards with definitions; stored values are unchanged.
4. While sending, the status line reads "Subiendo foto N de M…" then "Enviando la publicación…".
5. After success the form is replaced by the confirmation; for review it states the approval/rejection email; "Publicar otro instrumento" returns an empty form.
6. Per-photo controls on create have the same accessible names as on edit.
7. The listed attribute labels read in Spanish everywhere they appear (form, filters, card spec line, spec table); values and URLs are unchanged.
8. Edit shows the condition cards and Spanish labels; its save flow, photo editor and notes are unchanged.
9. No horizontal overflow at 320–390 px; every control 44 px tall or more.
10. Lint, typecheck, tests and build pass.

## Evidence plan

- Automated: `tests/ux-selling.test.cjs` (validation, progress callback, rendered form structure and names) plus the existing pinned tests unchanged in intent.
- On the Mac (pending, not run in the cloud — no local Supabase there): browser walk-through of create (Particular, pending store, verified store) and edit; acceptance rows LIST-001–023, PHOTO-001–031, REV-001–019, CAP-001–011 re-run by the owner. Commands in `ux-5-acceptance.md`.

## Tests expected to change (update, never weaken)

- `tests/sprint-7.test.cjs`, `tests/sprint-8.test.cjs`, `tests/ux-discovery.test.cjs`: only where they read a real attribute label that S9 translates (fixtures with their own labels stay).
- No change expected to `photo-editor.test.cjs`, `account-shell`, `sprint-3-1`, `sprint-9` or `listing-lifecycle`.
