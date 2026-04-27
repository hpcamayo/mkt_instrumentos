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

Do not build these features in the MVP unless explicitly requested:

- Payments
- Checkout
- Delivery or shipping flows
- Escrow
- Reviews or ratings
- Commissions
- Subscriptions
- In-app chat

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

## Expected Seller And Listing Behavior

- Individual seller listings represent used gear.
- Store listings represent products from a small store.
- General search should include both individual listings and store products.
- Store pages should show store identity and that store's products.
- Avoid marketplace mechanics that imply the platform handles payment, delivery, guarantees, disputes, or buyer/seller reputation.

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
- When making product decisions, choose the simpler MVP path that respects the rules above.
