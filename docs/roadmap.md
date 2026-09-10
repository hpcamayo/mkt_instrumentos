# Roadmap

`docs/functional-spec.md` is the canonical, frozen Laria V1 product contract. This roadmap orders implementation; it does not make V1 features optional or redefine their behavior.

The current strategic goal remains to make Laria the best place in Peru to discover musical instruments and gear without adding transaction-processing complexity. Payments, checkout, escrow, delivery, commissions, subscriptions, paid boosts, and internal chat remain post-V1.

## Completed Foundation

### Public marketplace

- Public homepage, approved-listing catalog, listing detail, and active store pages.
- URL-driven musician-focused filters, sorting, result counts, chips, responsive layouts, loading and empty states.
- Instrument-type and JSONB attribute filtering/display foundations.
- Store identity and Tienda Verificada badge display.
- Direct WhatsApp contact.

### Reliability and performance

- Stable 24-item catalog and store pagination.
- Database photo counts and on-demand additional card photos.
- Responsive images and streamed recommendation sections.
- Reduced public authentication overhead and targeted email lookup.
- First-publication timestamps.
- Signed, idempotent public submission retries, atomic finalization, partial-upload cleanup attempts, and regression tests.

See `docs/performance.md`; this work is completed and must be preserved.

### Account and ownership foundation

- Supabase Auth signup, email confirmation callback, password login, magic-link login, and logout.
- Particular profiles and store-owner invitation setup.
- Nullable listing/store ownership fields, store membership helpers, owner-aware RLS, and protected admin fields.
- Protected `/mi-cuenta` shell.

These foundations are incomplete product flows, not completion of the V1 account/dashboard requirements.

## V1 Implementation Sequence

The sequence below is an implementation recommendation only. Every item remains required by the frozen specification.

### 1. Account-owned publication and lifecycle

- Make one Particular account capable of buying and selling.
- Require authentication for new Particular listings and attach ownership.
- Resolve account-owned seller identity/contact data dynamically from the profile.
- Add instrument type, dynamic attributes, marketplace-rules acceptance, and 2–10 photo management.
- Implement owner listing management, immediate edits, moderated revisions that preserve the live version, hide/restore, sold direct URLs, and copied relisting.
- Add profile editing, forgot/reset password, and password change.

### 2. Store-owner operation and verification

- Bind the application to a separate store-owner account and one store.
- Collect required business identity fields and enforce unique RUC.
- Separate basic store approval (`Tienda`) from manual verification (`Tienda Verificada`).
- Require moderation for normal Tienda inventory; allow qualifying Tienda Verificada inventory and edits to publish directly.
- Approve pending inventory when verification is granted and preserve non-pending states.
- Enforce the free 50-concurrent-listing cap.
- Build store profile, inventory, lifecycle, and analytics tools.

### 3. Buyer retention and marketplace measurement

- Favorites and availability history.
- Exact-state search alerts with immediate and daily frequencies and deduplication.
- Price-drop alerts for eligible favorites with price deduplication.
- Privacy-conscious marketplace event collection, including WhatsApp intent without message content.
- Particular and store funnel analytics without revenue claims.

### 4. Verified transactions, reviews, and reports

- Sold-item buyer selection limited to authenticated listing-specific WhatsApp contacts.
- Buyer confirmation and verified Laria transaction records.
- Two-way, one-per-side, double-blind reviews with a 10-day window.
- Listing, store, and review reporting.
- Clear disclaimers that Laria did not verify payment, delivery, or condition.

### 5. Operational moderation and communications

- Expand `/admin` from pending queues into the complete searchable moderation hub.
- Add owner-visible required reasons, revision/history inspection, reports, reviews, verified transactions, user administration, store verification/revocation, and manual legacy ownership linking.
- Add centralized marketplace email infrastructure for lifecycle, transaction, review, search-alert, and price-drop notifications.

### 6. Discovery, legal, and launch completion

- Real category SEO browsing pages using the catalog/filter system.
- Terms/marketplace rules, Privacy Policy, prohibited-item rules, and marketplace safety guidance.
- End-to-end QA, reliability, accessibility, Spanish copy, mobile/desktop polish, analytics validation, marketplace supply, and store onboarding.

## V1 Freeze and Post-V1

After all requirements are implemented, tested, and documented, freeze V1 and focus on quality and observed marketplace behavior. New features require an explicit product decision supported by usage or commercial evidence.

Post-V1 candidates, not current commitments, include payments, escrow, shipping integrations, commission enforcement, paid subscriptions/packages, paid boosts, internal messaging, multiple store employees, automatic SUNAT verification, email change, account deletion, sophisticated fraud scoring, and expansion into separately branded verticals.

## Commercial Priorities

Product development does not replace marketplace operations:

1. Build a base of quality listings.
2. Onboard initial stores.
3. Make listings and safety guidance trustworthy without false guarantees.
4. Track WhatsApp interest and search demand.
5. Learn what buyers seek and what stores value.
6. Use real marketplace evidence for post-V1 monetization decisions.
