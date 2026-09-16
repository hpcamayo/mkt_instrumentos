# Marketplace performance and reliability

Implemented September 2026, preserving the public pending-submission and admin-approval model.

## Browsing

- Catalog and store inventories show 24 listings per page. Pagination preserves repeated filter parameters. Sort orders include an ID tie-breaker.
- `listing_photo_count(listings)` is a stable, security-invoker Postgres computed field. Each listing query obtains its photo count without downloading all photo rows or a second HTTP request. Photo RLS still applies.
- Listing detail renders its product information first. Similar listings, seller recommendations, and inventory counts stream through Suspense. React request caching shares the seller query between its two consumers.
- Product photos, thumbnails, store assets, and the homepage background use Next Image with responsive sizes. Approved storage hosts are configured in `next.config.ts`; originals remain available in Storage. Thumbnails load lazily.
- Homepage sections render on the server, without animation-only client code or initially invisible content. Existing hover styles remain.
- Public pages still read fresh marketplace data on each request so moderation changes are immediately reflected. No shared authenticated-content cache was added.

## Authentication and publication

- Middleware runs only on account/admin surfaces and uses validated claims. Public browsing, photo reads, and view increments do not revalidate user sessions. Protected page handlers continue their own checks; admin APIs retain authorization.
- Duplicate-email checks use a service-role-only `auth_email_exists(text)` lookup against the normalized Auth email and its existing index. They no longer download the user directory. Database failures produce an error, never an availability claim.
- A database trigger sets `published_at` on first approval and preserves it when reapproved. Existing approved rows without a date use their creation timestamp because their historical approval time is unknown.

## Submission recovery

- Images upload directly from the browser to Storage, avoiding server request-size limits.
- `/api/submissions` issues a signed capability for a random submission ID. Particular listing capabilities are bound to the authenticated user and upload under that user's storage folder. The server validates all fields and verifies uploaded paths before finalizing. Neither service-role credentials nor arbitrary object-deletion access is exposed to the browser.
- `complete_public_submission` atomically inserts an owned pending Particular listing, an owner-bound store application, or owner-bound store inventory. Listing submissions retain the 2–10 photo rule. It is callable only by the service role, and repeated finalization with the same ID does not overwrite or duplicate records.
- Upload failures attempt to remove partial uploads. If cleanup fails, the retry token is retained so another attempt can reuse/clean the folder.
- If the final response is lost, retry uses the same token without uploading again. Keep the form open and retry with the same values/files. Tokens are held in form memory; closing the page discards the attempt. Browser abandonment can still leave unreferenced storage objects; automatic orphan retention/cleanup is not configured.
- Legacy anonymous listing rows remain compatible, while new Particular, store-application, and store-inventory capabilities are bound to their authenticated account and owner-folder paths.

## Store concurrency and visibility

- Store inventory has a database-enforced 50-row concurrent cap across `pending` and `approved`. A per-store transaction advisory lock serializes capacity-consuming inserts/restores, so simultaneous requests at 49 cannot produce 51.
- Store listings are publicly readable only when both the listing is approved and the parent store is active. Photo RLS follows the same predicate.
- Store verification locks the store, validates every pending listing, flips trust state, and approves the pending set in one transaction. Any malformed pending row aborts the whole operation.
- Verification revocation removes future direct-publication authority without changing already-approved inventory.

## Listing lifecycle and revision reliability

- Owner edit, hide/restore, sold, relist, listing review, and revision review operations lock the target row and execute as single Postgres transactions. Direct client status/authority writes remain blocked.
- Approved Particular/normal-Tienda moderated edits are isolated in one pending revision; the live row and photos stay readable until approval. The pending unique index prevents competing proposals. The listing row lock serializes proposal amendment, merges the latest field/photo state, increments a revision version, and cancels an empty proposal.
- Admin revision decisions compare the submitted expected version with the locked latest row. A stale approval/rejection aborts instead of resolving an older proposal snapshot.
- Owner/admin hide state is orthogonal to revision review: approving a proposal never republishes a hidden listing. Store verification leaves existing proposals pending, while a later verified direct moderated edit atomically cancels any superseded proposal before applying the new live values.
- Sold rows are immutable history. Relisting inserts a new linked row with a new slug and reuses photo records without rewriting or deleting the source objects.
- Store restores and relists still pass through the existing serialized 50-item trigger. Concurrent attempts at the final slot cannot create a 51st pending/approved row.
- Listing edit uploads use fresh owner-scoped paths. Browser storage policies no longer permit overwriting or deleting historical listing-photo objects; failed-attempt cleanup remains service-controlled, with a client cleanup attempt for failures before finalization.
- The database accepts a proposed photo URL only when it is already attached to the edited listing or maps to an existing owner-scoped edit object with the supported media type and size. This preserves the API validation boundary for direct authenticated RPC calls.
- Authenticated owner updates and live-photo row mutations are denied at the generic table-policy layer; lifecycle and edit changes enter through the validated, row-locked RPCs so direct clients cannot bypass taxonomy, revision, history, or photo-set invariants.
- Listing/store lifecycle notifications are created in the same moderation transaction. RLS-scoped indexes support newest-first and unread-count reads, while the mark-read RPC cannot mutate event ownership or targets.

## Checks

- `npm test`: pagination/filter preservation, signed-token verification, partial upload cleanup, lost-success retries, and changed-input protection.
- `npm run lint`, `npm run typecheck`, `npm run build`.
- `tests/marketplace-performance.sql`: run inside a transaction and roll back; checks idempotent submissions, approval timestamps, restricted RPC access, and counting more than 1,000 photos.
- `tests/store-sprint-2.sql`: rollback-only ownership, application, RUC, RLS, visibility, approval, verification/revocation, state-preservation, and cap-boundary checks.
- `tests/listing-sprint-3.sql`: rollback-only lifecycle, revision isolation/patch approval, sold immutability, relisting, cross-owner RLS, verified-store behavior, and cap-safe restoration checks.
- `tests/sprint-3-1.sql`: rollback-only amend-in-place, photo preservation/promotion, mixed immediate/moderated edits, empty-proposal cancellation, stale-admin denial, exact price/title behavior, notification events, RLS, and read-state checks.
- `tests/submissions.integration.cjs`: temporary-user local API flow plus two simultaneous cap-consuming requests from 49 inventory rows.
- `tests/listing-lifecycle.integration.cjs`: temporary-user local API lifecycle/revision flow plus two simultaneous relists competing for the final store-cap slot.
- `tests/sprint-3-1.integration.cjs`: explicitly targeted local/production API smoke for exact prices, canonical titles, proposal amendments, stale decisions, notifications, duplicate-RUC messaging, store privileges, and lifecycle behavior; removes and verifies its temporary records and objects.
- Browser QA: mobile/desktop catalog, image optimization, pagination, product streaming, homepage visibility, anonymous account redirect, and failure/retry behavior.

## Verification results

Production build: homepage first-load JavaScript decreased from 158 kB to 110 kB. Unit tests, TypeScript, lint, and the rollback-only database tests passed. Listing and store uploads were tested through the API against temporary pending records, including repeated completion and cleanup protection; all QA records and images were removed.

Run the explicit API integration test with `node tests/submissions.integration.cjs http://localhost:3100`; it requires local Supabase environment credentials and creates then removes pending QA records. It is intentionally excluded from `npm test`.
