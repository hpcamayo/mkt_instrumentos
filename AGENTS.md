# AGENTS.md

## Project Context

This repo is for an MVP marketplace for musical instruments in Peru, similar in spirit to Reverb but intentionally much simpler.

The product should help buyers discover musical gear and contact sellers directly through WhatsApp. Keep the MVP focused, practical, and easy to ship.

## Product Rules

- Support two seller models: individual sellers and small stores.
- Individual sellers publish used gear listings.
- Stores have public store pages.
- Store products must also appear in general search.
- Buyers contact sellers by WhatsApp.
- All UI copy must be in Spanish.
- Design mobile-first.
- Keep features simple and working.

The frozen V1 scope is defined in `docs/functional-spec.md`. V1 does not include:

- Payments
- Checkout
- Delivery or shipping flows
- Escrow
- Commissions
- Subscriptions
- In-app chat

V1 does include the account, ownership, favorites, alerts, verified-transaction review, reporting, moderation, analytics, and store-verification behavior specified in `docs/functional-spec.md`.

## Canonical Product Instructions

- For any feature, product, backend, or frontend behavior work, read `docs/functional-spec.md` first and treat it as canonical for Laria V1 product behavior.
- For visual or UI work, also read `docs/design-system.md` and treat it as canonical for visual behavior.
- Do not invent new product behavior when the functional specification is explicit.
- Do not move post-V1 functionality into V1 without explicit instruction.
- When implementing a V1 feature, preserve already-working behavior unless the functional specification requires changing it.
- Update relevant documentation when implementation state changes.

## Engineering Stack

Use:

- Next.js
- TypeScript
- Tailwind CSS
- Supabase

## Engineering Guidelines

- Keep the folder structure clear and predictable.
- Prefer straightforward implementations over clever abstractions.
- Do not over-engineer generic systems before the MVP needs them.
- Keep database migrations readable and easy to review.
- Use Supabase patterns that are understandable to a small team.
- Keep UI components focused on real product workflows.
- Optimize for mobile screens first, then improve larger breakpoints.
- Use Spanish for user-facing labels, buttons, empty states, validation messages, and page copy.
- Keep WhatsApp contact flows simple and obvious.

## UI And Visual Work

- For any UI/design/frontend visual work, read `docs/design-system.md` before editing.
- Follow the current Laria visual system.
- UI work must not add features unless explicitly requested.
- Do not change Supabase schema, migrations, auth, authorization, listing approval, store approval, or business logic for visual tasks.
- Prefer reusable components and tokens over huge one-off Tailwind class strings.
- If using Tailwind, keep class names readable and consistent.
- Do not paste large v0-style CSS blocks blindly.
- Use existing project conventions.
- Do not rewrite unrelated components.
- Placeholder-only UI must be commented and must not fake working behavior.

## Expected Seller And Listing Behavior

- Individual seller listings represent used gear.
- Store listings represent products from a small store.
- General search should include both individual listings and store products.
- Store pages should show store identity and that store's products.
- Reviews and ratings are permitted only through the verified-transaction flow in `docs/functional-spec.md`; never imply that Laria handled payment, delivery, guarantees, or disputes.

## Task Completion Requirements

Every task must end with a short summary that includes:

- Changed files
- How to test
- Known limitations

If tests or verification could not be run, state that clearly.

## Agent Working Style

- Read the existing code before changing it.
- Follow local patterns when they exist.
- Keep changes scoped to the task.
- Avoid unrelated refactors.
- Prefer readable code and clear naming.
- Add comments only when they clarify non-obvious logic.
- Do not make a new product decision where the frozen V1 functional specification already defines the behavior.
