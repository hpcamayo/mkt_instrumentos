# Laria working context

Updated 2026-10-28. This is a short entry point for future work; the contract is [functional-spec.md](functional-spec.md), the implementation inventory is [features.md](features.md), and source/release evidence is [documentation-status.md](documentation-status.md).

## Product

Laria is a Spanish-language, mobile-first marketplace for instruments and music gear in Peru. Particular accounts buy and sell used gear; separate store-owner accounts operate one store. Store products appear in general instrument search. WhatsApp carries private contact and commercial coordination.

V1 has grown beyond the initial frozen MVP. The approved scope includes the original marketplace plus store operations, Effortless Laria and the approved PR #54 feature extensions. Read their status separately: approval, implementation on main, implementation on a draft branch, activation and owner acceptance are different facts.

Laria processes no payment, holds no funds, provides no escrow, manages no shipping and guarantees neither authenticity nor transactions. Store payment-method declarations, installment offers, inventory sales and merchant Nubefact receipts do not change that role. There is no platform commission, subscription billing or paid promotion in the pilot. Public questions are permitted; private in-app chat is not.

## Source checkpoint

The working checkout is older than remote main and contains existing local work. The October 28 documentation refresh read remote main at `728a85209494c581dec68e624332f7920411445d` and PR #54 at `a64bb9ceb78406b901317998e4c3e374989779ba`, without merging either into this checkout. Do not infer that a feature documented on newer source exists in an old local route tree.

Main contains the account/listing/store/retention/reputation/Admin foundation, redesign, ten categories, inventory/imports/Mostrador, gated assisted commerce, Effortless Laria, launch-audit fixes and the five maybes. PR #54 is open/draft with 44 built ideas and 61 unreleased feature migrations. Its scope includes safety/accounts, listing terms/map/combos, trust, Mi equipo/selling tools, store floor/reach/sedes, editorial discovery and a separate services marketplace. Nubefact activation is deferred. Full catalog autofill/Jev and price-dependent ideas remain separate work.

The exact refs, pinned batch designs, setup observations and release constraints are in [documentation-status.md](documentation-status.md). Historical sprint notes describe their own checkpoints; old “local only”, “frozen”, “Hobby” and “not yet implemented” statements must be checked against the current source map.

## Engineering and invariants

Next.js App Router, React, TypeScript, Tailwind CSS and Supabase Auth/Postgres/Storage; Vercel deploys the application. Follow local patterns and keep changes scoped. Read [design-system.md](design-system.md) for UI work and the relevant accepted owner decisions. All user-facing copy is Spanish.

- New Particular publications require ownership and moderation. Normal-store moderated edits preserve the approved live version in one versioned proposal; qualifying verified stores can publish directly.
- Sold listing history is immutable. Republicar starts a new draft, without inherited favorites or transaction relationships.
- Stores require basic approval before public visibility; verification is a distinct manual business-identity action. The default publication allowance is 50, with reasoned Admin overrides; stock/SKUs do not consume it.
- Inventory changes are recorded, serialized and idempotent. Zero stock changes availability, not moderation state. Public unit counts stay hidden.
- Listing-based transaction verification requires the eligible contact/participant confirmation flow. PR #54 adds a separate counter-purchase customer-code confirmation. A stock movement alone never creates verified reputation.
- Instrument reviews use one review per side, a ten-day window and double-blind publication. Services have their own confirmation/client-review workflow and never enter item search, favorites, alerts or publication counts.
- Contact analytics record intent, never WhatsApp contents. Raw actor/reporter data is private; owners receive bounded aggregates, never a general buyer directory. Never invent revenue from contacts or verification.
- Server/database authorization, service-only secrets, required moderation reasons and privileged audit history remain mandatory. Account anonymization preserves shared historical relationships without personal identity.
- Application deployment does not apply SQL migrations. Feature schema/application compatibility and provider/pilot activation have separate release gates; do not execute them as part of documentation work.

## Verification and acceptance

Use `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` for applicable code changes, plus relevant SQL/integration/browser checks on the correct local schema. Newer-main harnesses and feature test instructions are pinned in the source map. Never use a production seed/reset as local setup.

`acceptance/cases.tsv` is the sole canonical acceptance registry, with selective retrieval via `acceptance/sprints.tsv`. Preserve unrelated IDs/status/evidence, do not infer manual Pass from code, and validate any TSV change with `python3 -B acceptance/validate.py`. Proposed cases require their acceptance process. Do not read or regenerate XLSX before the final freeze gate.
