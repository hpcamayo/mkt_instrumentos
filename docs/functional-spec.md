# Laria V1 Functional Specification

This document defines the frozen Laria V1 launch functionality.

- `docs/functional-spec.md` is canonical for product behavior.
- `docs/design-system.md` is canonical for visual and UI behavior.
- Existing code and database schema describe the current implementation state. If older planning documentation conflicts with this functional specification, this document wins.
- Changes to the V1 contract require an explicit new product decision.

Status labels in this document distinguish the frozen requirement from the implementation that exists today. An approved V1 requirement is not necessarily implemented merely because it appears here.

## Product Model

Laria is a vertical marketplace for musical instruments and music gear in Peru. V1 is a discovery and lead-generation marketplace, not a transaction-processing platform. Public users can browse listings and stores, and transactions happen outside Laria, primarily through WhatsApp.

Laria V1 does not include:

- Payments or Laria-managed checkout.
- Escrow.
- Delivery or shipping management.
- Transaction commissions.
- Subscription billing.
- Internal chat.

Laria V1 does include buyer and seller identity, marketplace ownership, verified transaction confirmation, reviews, favorites, alerts, moderation, analytics, reports, and store verification. These features do not mean Laria processed or guaranteed a transaction.

## Account Types

### Particular

A Particular account can both buy and sell; a user must not need a second buyer account. It can browse, favorite listings, create search alerts, receive price-drop alerts, contact sellers, buy items, publish and manage owned listings, and participate in verified-transaction reviews.

The current database value `profiles.account_type='seller'` represents the Particular product role. That implementation name does not narrow the account to selling only.

### Store Owner

Store owners use accounts separate from Particular accounts. One effective owner account manages one store in V1. Although the current schema contains `store_members` and supports several membership roles, multiple employees or store staff management is outside V1.

### Admin

One admin role is sufficient. Admin authority continues to come from the secure current mechanism: Supabase Auth `app_metadata.role='admin'`. V1 does not require granular moderator or support roles.

## Buyer Accounts and Authentication

Browsing remains public. An account is required for favorites, search alerts, price-drop alerts, verified transaction participation, and reviews.

A Particular profile contains at least:

- Full name.
- Email and Supabase Auth identity.
- Password where password login is used.
- WhatsApp phone.
- City and region where appropriate.

V1 authentication includes signup, email confirmation, password login, magic-link login, logout, forgot password, password reset, profile editing, and password change. Email change and account deletion are post-V1.

Supabase Auth remains appropriate for confirmation, password recovery, invitations, and other authentication messages. Marketplace-generated emails use a centralized application email abstraction. The provider behind that abstraction is an implementation choice, not a product decision.

## Particular Listing Creation

A Particular must be authenticated to publish. The anonymous public listing path must be phased out when account-aware publication replaces it. Every new Particular listing requires admin moderation.

Creation supports:

- Title.
- Category.
- Instrument type where the category has meaningful subtypes.
- Brand and model.
- Condition.
- Price.
- City/location.
- Description.
- Dynamic instrument attributes.
- Photos.
- Acceptance of marketplace rules.

Instrument attributes are generally optional. Only selected important attributes become required when an explicit product rule says so.

Each listing requires 2–10 photos, with front and back views as the expected minimum coverage. The owner can reorder, replace, and remove photos, provided the listing continues to satisfy the two-photo minimum.

## Listing Lifecycle

The normal lifecycle is:

`draft -> pending -> approved`

An approved listing can later become `hidden` or `sold`. V1 provides no normal user hard-delete action. Existing `rejected` and `archived` states remain useful operational states, but they are not public active inventory.

### Hidden

An owner can hide or unpublish an approved listing. A hidden listing disappears from public browsing. It can be restored subject to normal publication requirements and, for stores, the concurrent-listing cap.

### Sold and relisting

A sold listing disappears from normal catalog and search but remains available at its direct URL with a clear `Vendido` state. The original sold record is immutable historical inventory and must never be reactivated.

`Relistar` creates a new listing copied from the sold listing. The old record stays intact. Copies belonging to a Particular or normal Tienda return require moderation. Copies belonging to a Tienda Verificada may publish directly when they meet publication requirements.

## Particular Dashboard and Dynamic Profile Data

`Mi cuenta` for a Particular seller supports:

- Creating a listing.
- Viewing every owned listing and opening it.
- Editing a listing.
- Marking it sold.
- Hiding or unpublishing it.
- Viewing moderation status and rejection reason.
- Relisting a sold listing.
- Editing the profile and changing the password.
- Viewing listing analytics.

Per-listing analytics include views, favorites, WhatsApp contacts, status, publication date, and sold state. The account summary includes active listings, total views, favorites, WhatsApp contacts, and sold listings. Revenue must not be invented or displayed because transactions occur off-platform.

Account-owned Particular listings resolve seller identity and contact information from the current profile where appropriate. Updating name, WhatsApp, city, or region should update the display of current account-owned listings without unnecessary duplication. Legacy listings may continue to use historical listing-level contact fields until an admin manually assigns ownership.

## Editing Approved Listings

Approved listings have two edit classes.

Immediate edits apply without renewed moderation:

- Price.
- Description.
- Location.
- Detailed instrument attributes.

Moderated edits require admin review for a Particular and normal Tienda:

- Title.
- Category.
- Instrument type.
- Brand.
- Model.
- Photos.

The old approved version must remain public while a moderated revision waits for approval. This is a revision or pending-edit workflow; it must not mutate or remove the approved public version prematurely. A Tienda Verificada can apply edits to an approved listing directly without moderation.

## Store Account and Application

The V1 flow is:

1. The owner creates a separate store-owner account, associated with one store.
2. The account/store receives the basic product identity `Tienda`.
3. The owner submits business information for approval and verification.
4. The owner may submit listings immediately.
5. Before basic admin approval, the public store page is not visible and its listings follow normal moderation.
6. Admin approval makes the store a public `Tienda`; its products still require listing moderation.
7. Admin may separately verify the business, making it a `Tienda Verificada`.
8. A Tienda Verificada can publish qualifying inventory and listing edits without listing-by-listing moderation.

The application requires RUC, razón social/business identity, email, phone, physical address, geographic location, and contact person. Physical-store photos, logo, banner, Instagram, Facebook, TikTok, website, and other social links are optional.

RUC is unique across stores. Duplicate RUC submissions must not silently create multiple stores; admin may resolve exceptional cases manually.

## Store Approval and Verification

There are exactly two public store trust labels in V1:

- `Tienda`: the store passed basic admin approval, its page may be public, and its products still require moderation.
- `Tienda Verificada`: Laria manually verified the business identity, and the store can directly publish qualifying inventory and apply listing edits.

Verification is manual and admin-only. At minimum, admin evaluates unique RUC, razón social, business email, phone, address, location, and contact person. Store photos may help. Automatic SUNAT verification is not required.

When a store becomes verified, all its current `pending` listings automatically become `approved`. Rejected, hidden, and sold listings keep their states, and historical moderation records remain intact. Revoking verification removes direct-publication privileges but does not automatically hide already-approved listings.

## Store Listing Cap

Every free store has a maximum of 50 concurrent inventory listings. `pending` and `approved` count toward the cap. `sold`, `rejected`, `archived`, and `hidden` do not. This is a concurrent cap, not a lifetime quota.

Restoring a hidden listing must fail gracefully if it would exceed the cap. No paid plans are active in V1, even though legacy schema enum values may name possible plans.

## Store Dashboard

The store-owner dashboard supports editing the store profile and allowed business/contact data; managing logo, banner, optional store photos, and social links; creating and editing inventory; viewing status and moderation reasons; marking sold; hiding/unpublishing; relisting; and aggregate analytics.

Commercial analytics include listing impressions, listing views, favorites, WhatsApp contacts, sold listings, and meaningful conversion-oriented ratios. They must not show revenue without actual transaction data. These metrics should remain suitable for evaluating later paid store packages without activating such packages in V1.

## Favorites and Alerts

### Favorites

Authenticated users can favorite and unfavorite approved listings. Favorites are accessible from the account area, and the state appears on supported listing cards and detail pages. A sold or hidden favorite may remain in history but must display its current availability clearly.

### Price-drop alerts

Price-drop alerts apply to favorited approved listings. When the public price decreases, eligible users may receive an email. The same unchanged price must not trigger repeated alerts. Pending, rejected, or hidden inventory must not generate price-drop alerts.

### Search alerts

Authenticated users can save the exact state of a marketplace search, including query, category, supported filters and instrument attributes, location, price filters, and other supported search state.

Frequency options are `immediate` and `daily digest`. Immediate alerts notify shortly after a new matching listing becomes public. Daily alerts bundle matching new listings. Only newly public matches qualify; the same user/alert/listing combination must not be notified repeatedly; empty emails are forbidden. Users can pause or delete alerts, and emails link directly to listings or matching search results.

## Category SEO Pages

V1 includes useful, indexable category browsing pages such as `/instrumentos/guitarras`, `/instrumentos/baterias`, and `/instrumentos/microfonos`. They use the real listing and filter system and must not be fake-content SEO doorway pages. Exact routing may follow the existing Next.js conventions; implementation must also avoid ambiguity with current listing-detail slugs.

## WhatsApp Contact Tracking

Laria records buyer intent when a user initiates WhatsApp contact. It never records WhatsApp message content.

The event associates the listing, authenticated buyer when present, seller or store, timestamp, and useful source/context. It supports conversion analytics and determines which authenticated buyers are eligible for transaction confirmation when a seller marks that listing sold. Anonymous contact remains possible, but an anonymous buyer cannot later participate in the verified Laria transaction or review workflow for that contact.

## Marketplace Analytics

The primary funnel is:

`impression -> listing open -> favorite -> WhatsApp contact -> sold -> verified transaction`

Useful events include listing impression and detail view; favorite added/removed; WhatsApp click; store page view; search, zero-result search, and filter applied; alert creation and alert clicks; listing creation start, submission, approval, rejection, and sold state; store application start, submission, approval, and verification; transaction verification; and review submission.

Derived metrics include listing click-through, contact, and favorite rates; sell-through proxy; zero-result search rate; alert click/conversion rate; seller submission conversion; and store funnel conversion.

Laria must not track WhatsApp message content or use invasive fingerprinting. Use authenticated IDs where appropriate and privacy-conscious anonymous or session identifiers otherwise.

## Sold and Verified Transaction Workflow

When a seller marks a listing sold:

1. The listing becomes sold.
2. Laria asks whether the buyer was found through Laria.
3. The seller may select a buyer only from authenticated users who previously generated a WhatsApp-contact event for that listing. The seller cannot search or browse the user directory.
4. The seller may instead choose `Vendido fuera de Laria / comprador sin cuenta`.
5. Without a selected Laria buyer, the listing remains sold, but no verified transaction exists and reviews stay locked.
6. With a selected buyer, Laria sends that buyer a confirmation request.
7. If the buyer answers `Sí, lo compré`, the relationship becomes a verified Laria transaction.
8. If the buyer declines or never confirms, the listing remains sold without a verified transaction or review relationship.

This confirmation verifies only that both parties identify the sale as a Laria-originated transaction. It does not verify payment amount, delivery, or item condition.

## Reviews

Reviews are available only for verified Laria transactions and are two-way: seller/store reviews buyer, and buyer reviews seller/store. Each review requires 1–5 stars, permits an optional text comment, and is limited to one review per side per transaction.

For a Particular sale, the seller-side identity is the Particular account. For a store sale, the buyer's seller-side review belongs to the store, not the individual owner account.

Reviews use double-blind publication. The review window is 10 days after buyer confirmation. Neither party sees the other's review while both may still submit. If both submit, both may be revealed immediately; otherwise a submitted review is revealed when the window ends.

Published reviews cannot be freely edited or deleted. Users can report them. Admins can hide abusive or inappropriate reviews but must never rewrite review content. Ratings and reviews must not imply that Laria processed payment. The data model should remain compatible with possible future on-platform payments.

## Reports

Users can report a listing, store, or review. A report has a fixed reason category, optional written detail, timestamp, reporter identity where applicable, and moderation status. Reports enter the admin moderation hub, where admin can resolve or dismiss them. V1 does not need a complex ticketing or support system.

## Admin Moderation Hub

`/admin` is the operational moderation hub, not only a pending queue. Admin can search, filter, and manage all listings, stores, user accounts, pending listing revisions, reports, reviews, verified transactions, store verification state, and legacy ownership links.

Listing actions include approve, reject, hide, mark sold where appropriate, inspect revision history, and restore/manage lifecycle where appropriate. Store actions include basic approval, rejection, hiding, verification, and verification revocation.

Rejection and administrative hiding require a reason visible to the owner. Approval, rejection, relevant store-status changes, and other important lifecycle changes generate marketplace emails. Admin assigns legacy listing ownership manually; ownership must never be auto-claimed only from a matching WhatsApp number or email.

## Email Notifications

Centralized application email infrastructure sends listing approval/rejection, store approval/rejection, useful verification-status changes, buyer transaction-confirmation requests, review workflow notifications, search alerts, and price-drop alerts. Product logic must not depend on a particular email provider.

Supabase Auth may continue sending authentication-related messages.

## Legal and Safety

V1 has dedicated content or pages for Terms/marketplace rules, Privacy Policy, prohibited-item rules, and marketplace safety guidance.

The interface clearly says Laria currently does not process payments, provide escrow, manage shipping/delivery, or guarantee transactions. Trust copy must not imply otherwise.

## Functionally Out of V1

The following remain post-V1 unless an explicit new product decision changes the contract:

- Laria-managed checkout, payments, escrow, or shipping/delivery integration.
- Transaction commission enforcement.
- Paid subscriptions, packages, or listing boosts.
- Internal messaging or chat.
- Multiple store employee accounts.
- Automatic SUNAT verification.
- Account deletion or account email-change workflows.
- Sophisticated fraud scoring.
- Arbitrary new social or community functionality.

## V1 Freeze Rule

Once this specification is implemented, tested, and documented, Laria V1 is functionally frozen. Work then shifts to QA, reliability, visual polish, marketplace supply, store onboarding, real-user testing, analytics, and observing marketplace behavior.

Do not add features merely because they seem useful. Post-freeze features require actual marketplace evidence, a commercial need, or an explicit product decision.

## Implemented Reliability Baseline

The September 2026 reliability work is complete and must be preserved:

- 24-item catalog and store pagination.
- Stable pagination with deterministic ordering and filter preservation.
- Database-computed photo counts.
- Responsive image delivery.
- Streamed listing recommendations.
- Reduced authentication overhead on public routes.
- Targeted email lookup.
- First-publication timestamps.
- Signed, idempotent public-submission retries and atomic finalization.
- Partial-upload cleanup attempts and retry recovery.
- Regression tests covering pagination and submission reliability.

See `docs/performance.md` for the implemented behavior and verification details.

## Implementation Status

Status is based strictly on the repository and the Sprint 2 production release completed on 2026-09-11. Sprint 1 is **CLOSED / ACCEPTED** following the owner's production retest of the final AUTH cases. Sprint 2 automated production verification is complete; owner-manual `VERIFY-012` and `VERIFY-013` remain blocked until sign-off.

- **DONE**: the functional area is materially implemented for its V1 requirement.
- **MODIFY**: a related implementation exists, but it must change or expand to meet V1.
- **BUILD**: the functional workflow is absent beyond incidental schema/UI foundations.

| Functional area | Status | Repository evidence or required change |
| --- | --- | --- |
| Public browsing | DONE | Public homepage, approved-listing catalog, approved listing detail, and active store pages exist. |
| Catalog pagination | DONE | Catalog and store inventory use stable 24-item pagination with filter preservation. |
| Listing detail | MODIFY | Approved detail pages work, but sold listings are filtered out and therefore do not remain available by direct URL with `Vendido`. |
| WhatsApp contact | MODIFY | Listing/store WhatsApp links work; the click does not yet create the required intent event. |
| Seller authentication | DONE | Particular signup, confirmation callback, password and magic-link login, logout, forgot/reset password, authenticated password change, and profile editing are implemented. |
| Buyer/Particular account model | MODIFY | A `profiles` foundation and Particular signup exist, but the UI and flows still treat the account mainly as a seller and lack buyer features. |
| Account-required listing publication | DONE | `/vender` requires authentication, preserves the login return path, binds signed retries to the current user, and atomically creates owned `pending` Particular listings. |
| Seller listing ownership | DONE | New Particular listings set `owner_user_id`; owner/public/admin boundaries remain enforced by RLS, while legacy nullable ownership remains supported. |
| Seller dashboard | MODIFY | `/mi-cuenta` renders real profile data and links to working profile/password forms, but publication management, actions, and analytics remain for later sprints. |
| Seller analytics | BUILD | Dashboard metrics/charts are explicitly placeholders; only raw listing `view_count` exists. |
| Instrument type/attributes submission | DONE | Seller creation and admin moderation reuse the canonical instrument filter definitions; supported attributes use labeled controls rather than raw JSON. |
| 2–10 photo handling | DONE | Client/server/RPC validation enforces 2–10 photos; creation supports ordering, replacement, and removal while preserving the minimum. |
| Revision moderation | BUILD | There is no separate pending revision model that keeps the approved version public. |
| Sold/relist flow | MODIFY | The status and admin `Marcar vendido` action exist, but seller sold flow, immutable history, sold direct URL, and copied relisting do not. |
| WhatsApp contact event tracking | BUILD | No contact-event table or tracking endpoint exists. |
| Verified transactions | BUILD | No transaction-confirmation model or workflow exists. |
| Two-way reviews | BUILD | No review schema or workflow exists. |
| Favorites | BUILD | No favorites schema, account page, or controls exist. |
| Search alerts | BUILD | No saved-search/alert schema, scheduler, or UI exists. |
| Price-drop alerts | BUILD | No favorite price history, deduplication, or notification workflow exists. |
| Store-owner ownership | DONE | Dedicated Store Owner signup/profile repair, one-owner/one-store uniqueness, owner-bound signed submissions, and owner-only RLS are implemented without converting Particular accounts. |
| Store application | DONE | The authenticated application collects all required business/contact/location fields and supports optional logo, banner, physical-store photos, TikTok, website, and social links. Owners can edit allowed fields and resubmit rejected applications. |
| RUC uniqueness | DONE | RUC is normalized to 11 digits and protected by a database unique index; migration preflight refuses unsafe historical duplicates. |
| Store public approval | DONE | Pending/rejected/hidden stores and their inventory are nonpublic. The trusted admin review RPC requires complete data for approval and a reason for rejection/hiding. |
| Tienda Verificada direct publication | MODIFY | Verified stores directly publish qualifying new inventory; normal Tienda inventory remains moderated. Direct editing of already-approved inventory remains deferred to the Sprint 3 revision architecture. |
| Automatic approval after verification | DONE | The admin-only verification RPC atomically verifies an active eligible store and approves all valid pending inventory while preserving rejected/hidden/sold rows. |
| 50 concurrent listing cap | DONE | A serialized database trigger counts only pending/approved store inventory, permits the 50th row, blocks the 51st and guards future counted-state restoration. |
| Store dashboard | MODIFY | The owner has a real application/status/trust/inventory-cap area and can submit inventory; full Sprint 3 lifecycle actions and later analytics remain absent. |
| Store analytics | BUILD | There is no aggregate store analytics implementation. |
| Full admin moderation hub | MODIFY | Secure pending listing/store queues and invites exist, but all-record search/filtering and the required users, revisions, reports, reviews, transactions, ownership, and lifecycle views do not. |
| Reports | BUILD | No report schema, user flow, or admin queue exists. |
| Moderation reasons | MODIFY | Stores have `rejection_reason`, but listing reasons are absent and admin actions do not require/display reasons consistently. |
| Application emails | BUILD | Supabase Auth email flows and templates exist, but no centralized marketplace email abstraction or lifecycle/alert emails exist. |
| Password reset | DONE | Forgot-password, recovery callback, reset, and authenticated password-change flows use Supabase Auth. |
| Category SEO pages | BUILD | `/instrumentos/[slug]` is currently a listing-detail route; no real category landing flow exists. |
| Legal/safety pages | BUILD | No dedicated Terms, Privacy, prohibited-item, or marketplace-safety pages exist. |
| Legacy ownership linking | BUILD | Nullable ownership supports later linkage, but admin has no manual ownership-assignment interface/workflow. |

Summary after the Sprint 2 production release: **14 DONE**, **9 MODIFY**, and **14 BUILD** areas. The matrix is an implementation snapshot, not a priority change and not evidence that missing V1 features are optional.
