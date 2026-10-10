# UX-7 · Admin workbench — brief

**Status: provisional (written and built overnight, 10 Oct 2026, under N17).** Every question takes its recommendation as a provisional answer and every product flag its no-change option; the owner confirms or reverses them at the UX-7 review (`ux-7-acceptance.md`).

UX-7 makes moderation faster to read and safer to act on. It changes no access rule (`requireAdmin`, `is_admin`), no moderation function or argument (`review_listing`, `review_listing_revision` with `p_expected_version`, `review_store_application`, `set_store_verification`, `moderate_report`, `moderate_review`, `link_legacy_listing_owner`), no record-editor allowlist, no invite flow and no queue query; every queue still shows a truthful zero state.

## Today (checked 10 Oct on `01ddd91`)

- **Queue photos are links** ("Abrir foto principal", "Abrir logo", "Foto de tienda N"); only revisions show thumbnails.
- **Approve and reject share one style** (`AdminMutationControl`: a white outlined button for every decision).
- **Verifying or revoking a store is one click** (queue "Verificación" and the store record), although it changes how every new listing of that store publishes.
- **Audit times use the server's timezone** (the audit page's formatter has no `timeZone`; the workbench's `adminDate` is already Lima time).
- **Raw identifiers in title lines**: "En espera desde … · 3f2a…" on every queue card; the audit page's summary is the bare id.
- Hand-rolled radios for legacy linking (pinned by `sprint-8`); only "Moderación" carries a count (UX-2 deviation 9).

## Questions (provisional answers in bold)

| # | Question | Options | Recommendation (taken provisionally) |
| --- | --- | --- | --- |
| W1 | Queue photos | A thumbnails inline, each still opening full size · B links as today | **A.** A 4:3 thumbnail grid (two columns on phones, four from 640 px), lazy, labelled "Abrir foto principal"… |
| W2 | Decision styles | A reject-like decisions (reject, hide, dismiss, revoke, hide review) as the danger button, the rest secondary · B one style | **A.** No yellow in the queue: several cards share a view (one yellow action per view) |
| W3 | Confirmation policy | A confirm only what changes more than one record or is hard to see undone: verify/revoke (new); reasons stay required for reject, hide, resolve, dismiss; the mark-sold confirmation stays · B confirm everything | **A.** Approvals stay one click: they are the queue's main job and are reversible from the record |
| W4 | Time zone | A Lima time everywhere in Admin | **A.** The audit page joins `adminDate` |
| W5 | Identifiers | A out of title lines, kept in a labelled "Identificador" line (support needs them) · B hide | **A** |
| W6 | Queue layout (master-detail, checklist, decision bar from the concept) | A keep the card list this sprint · B master-detail now | **A.** `sprint-8` pins about 170 source assertions on today's markup; a master-detail rework is better done with the owner reviewing moderation volume (pending, U18) |
| W7 | Per-section counts | A only "Moderación" as today · B counts per section | **A** (no new queries; UX-2 deviation 9 stays) |
| W8 | F7 bulk actions | — | **Not built** (authority and audit implications; flag) |
| W9 | Move UX-7 earlier | — | Moot overnight (built in order) |

## Acceptance criteria

1. Queue cards show listing, logo, banner and store photos inline; each opens full size in a new tab.
2. Reject-like decisions render as the danger button, approve-like ones as the secondary button; labels and calls unchanged.
3. Verifying and revoking show a confirmation with the consequence before calling `set_store_verification`.
4. Audit times are in America/Lima.
5. Queue card title lines carry no identifier; the identifier is on its own labelled line.
6. lint, typecheck, tests (`sprint-8`, `listing-lifecycle`, `sprint-6`, `logout-navigation` unchanged and passing), build.

## Evidence plan

`tests/ux-admin.test.cjs`. On the Mac (pending): ADMIN-001–030, REP-001–014, VERIFY-001–013 and a walk-through of each queue with fixtures.
