# UX-8 · Coherence and hardening — brief, cloud part and V1 record reconciliation

**Status: provisional (written overnight, 10 Oct 2026, under N17).** Most of UX-8 needs real browsers, devices, screen readers, a preview deployment or the owner (`roadmap.md` § UX-8). The cloud session did the code-level part and prepared the rest; everything else is listed below as **pending on the Mac** with its command, never as a result.

## Questions (provisional answers in bold)

| # | Question | Options | Recommendation (taken provisionally) |
| --- | --- | --- | --- |
| C1 | What the cloud session sweeps | A mechanical, test-backed consistency fixes only · B a visual sweep from screenshots | **A.** Without the local stack and real devices a visual sweep would be guesswork |
| C2 | Button heights in Admin (40 px hand-rolled buttons) | A `buttonClasses` sm (36 px), the Q17 scale · B leave | **A** |
| C3 | Loading labels ("Guardando...", three dots) | A one ellipsis character everywhere · B leave | **A** |
| C4 | Preview deployment for N14 (devices) | — | **Owner's go-ahead** (pushing `ux/redesign` may create a Vercel preview; nothing is deployed on purpose) |
| C5 | Release order | A one release per sub-sprint after each review (N15) · B one release for UX-4–UX-7 | **A**, unchanged; N16 (how a release proves write flows) is still the owner's and blocks UX-5 to UX-7 releases |

## Done in the cloud

- Admin: every hand-rolled 40 px button (`admin-workbench.tsx`, `admin-record-editors.tsx`) now uses `buttonClasses` sm (C2); the expanded confirm button follows the decision's tone (UX-7 W2).
- Loading labels use "…" in the profile, sign-in, sign-up, store application, password and invitation forms (C3).
- `tests/ux-coherence.test.cjs` pins both, and that no `window.confirm` returns (UX-6).
- Cross-sub-sprint consistency already enforced by tests: the glossary and status dictionary (`ux-copy`), contrast roles (`ux-contrast`), primitives with consumers (`ux-primitives`), one WhatsApp component per contact surface (UX-4), one error summary pattern (UX-5), one confirmation pattern (UX-6).

## Pending on the Mac (owner)

| Item | Command or step |
| --- | --- |
| Harness baseline refresh (`screenshots/`) | `node scripts/ux-snapshots.cjs --label ux8-baseline` on the local stack, all four visitors |
| Accessibility audit, keyboard, 200–400% zoom | `node scripts/ux-audit.cjs --axe <axe.min.js>`; manual keyboard pass per acceptance package |
| Real screen readers (VoiceOver, TalkBack, NVDA) | Manual, per `review-guide.md` |
| Real browsers and devices (N14) | Needs a preview deployment: owner's go-ahead (C4) |
| Core Web Vitals | On that preview; first-load budgets already met in the build table (listing 146 kB, store 132 kB) |
| External review | `review-guide.md` § 1 (UX-1's still pending) |
| G2 legal wording | Owner or legal |
| Releases | N15 per sub-sprint; N16 decides how UX-5–UX-7 write flows are proven |

## V1 record reconciliation (drafts for the owner; nothing recorded)

`acceptance/cases.tsv` and `docs/functional-spec.md` were not edited. This is the list of rows and spec lines the redesign touched since UX-3, for the owner to re-run and record as in N12 (`ux-2-reconciliation.md` shows the method).

**Rows to re-run, by sub-sprint** (all **pending on the Mac**; none changes behaviour on purpose):

| Sub-sprint | Rows | Why |
| --- | --- | --- |
| UX-4 | PUB-003, PUB-004, PUB-007; LIFE-005, LIFE-006; PHOTO-017; LIST-009, LIST-011, LIST-015–018; WA-001–007; FAV-006; AN-001, AN-002, AN-007; SANA-001; REP-001–005; REVW-015, REVW-018–020; REL-002; STORE-011, STORE-012, STORE-015; VERIFY-001, VERIFY-012; LEGAL-005/006; SCOPE-001–006 | New listing and store pages (`ux-4a-acceptance.md`) |
| UX-5 | LIST-001–023, PHOTO-001–031, REV-001–019, LIFE-001–014, CAP-001–011, LEGAL links | New sell form; edit condition cards |
| UX-6 | AUTH, STORE-001–019, DASH-001–008, SDASH-001–010, SANA-001–010, FAV-001–010, ALERT-*, PDA-001–009, NOTIF-001–003, TX-001–018, REVW-001–020 | Confirmations, inventory on phones |
| UX-7 | ADMIN-001–030, REP-001–014, VERIFY-001–013 | Queue photos, decision styles, verify/revoke confirmation |

**Spec lines and wording to reconcile** (draft notes; the owner decides):

- **Listing view count** (UX-4 L6, F3): the listing page no longer shows "Visto N veces"; the spec lists views among the owner's per-listing analytics (§ Listing management, "Per-listing analytics include views…"), which are unchanged. If a row expects a public count, it needs the owner's word.
- **"Compras y ventas" vs "Compras"** (functional-spec Sprint 7 note and TX-018): the interface keeps "Compras y ventas" (UX-1 glossary); a wording reconciliation like N12.
- **Attribute labels** (UX-5 U9): rows that quote an English label ("Solid body", "Distortion"…) need their expected text updated; values and URLs are unchanged.
- **Confirmations** (UX-6): rows that say "the browser asks" or quote the old one-sentence questions should read the dialog's title and button (`ux-6-accounts.md`, U14).
- **Admin verify/revoke** (UX-7 W3): one extra confirmation step before `set_store_verification`; VERIFY rows that count clicks need the step.
- **Photos guidance** (UX-5 S2): "Frente y reverso completos" matches the spec's "front and back views as the expected minimum coverage" (§ Listings); no change needed.

After the owner records anything: `python3 -B acceptance/validate.py` and review `git diff -- acceptance/cases.tsv`.
