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

## Checks

- `npm test`: pagination/filter preservation, signed-token verification, partial upload cleanup, lost-success retries, and changed-input protection.
- `npm run lint`, `npm run typecheck`, `npm run build`.
- `tests/marketplace-performance.sql`: run inside a transaction and roll back; checks idempotent submissions, approval timestamps, restricted RPC access, and counting more than 1,000 photos.
- `tests/store-sprint-2.sql`: rollback-only ownership, application, RUC, RLS, visibility, approval, verification/revocation, state-preservation, and cap-boundary checks.
- `tests/submissions.integration.cjs`: temporary-user local API flow plus two simultaneous cap-consuming requests from 49 inventory rows.
- Browser QA: mobile/desktop catalog, image optimization, pagination, product streaming, homepage visibility, anonymous account redirect, and failure/retry behavior.

## Verification results

Production build: homepage first-load JavaScript decreased from 158 kB to 110 kB. Unit tests, TypeScript, lint, and the rollback-only database tests passed. Listing and store uploads were tested through the API against temporary pending records, including repeated completion and cleanup protection; all QA records and images were removed.

Run the explicit API integration test with `node tests/submissions.integration.cjs http://localhost:3100`; it requires local Supabase environment credentials and creates then removes pending QA records. It is intentionally excluded from `npm test`.
