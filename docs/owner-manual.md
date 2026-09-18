# Founder / Operator Manual

This is the practical owner guide for Laria.

`docs/functional-spec.md` is canonical for the frozen V1 product contract. This manual describes operations and current implementation; it must not be used to override that contract.

Release boundary: Sprints 1–4 are **CLOSED / ACCEPTED**, including owner production acceptance dated 2026-09-17. Sprint 5 is deployed from `516bf4591512b99748f14795f384e594143d1268` with its migration applied and automated production verification completed on 2026-09-18. The Sprint 5 owner usability checklist below is now ready; this is not owner sign-off. See `docs/sprint-5-production-verification.md`.

## What Laria Is

Laria is a marketplace for buying and selling musical instruments and related gear in Peru.

The goal is to organize a fragmented market where instruments are currently sold through:
- Facebook Marketplace.
- WhatsApp groups.
- Informal networks.
- Small store inventories.
- Physical shops with limited online presence.

Laria is not trying to be MercadoLibre. It is a specialized marketplace for musicians and music stores.

## What Problem Laria Solves

For buyers:
- One place to browse.
- Relevant musical filters.
- Clear prices.
- Seller location.
- Trust signals.
- Easy WhatsApp contact.

For individual sellers:
- More visibility than Facebook posts.
- A cleaner way to present an instrument.
- Access to musicians already looking for gear.

For stores:
- A digital catalog.
- More visibility.
- A store page without building their own website.
- A way to show inventory beyond Instagram/Facebook.

## Business Model

Laria has two seller types.

### Particular

Individual seller, usually selling used gear.

Initial model:
- Free listings.
- Admin approval.
- Buyer contacts by WhatsApp.

Post-V1 monetization possibilities (not active in V1):
- Featured listings.
- Visibility boosts.
- Optional transaction commission only if payments/control are added later.

Important: commission from individuals is not the first monetization priority because WhatsApp transactions can bypass the platform.

### Tienda

Small store with multiple products.

Initial model:
- Free store onboarding.
- Store page.
- Products appear in general search.
- Basic admin approval makes the page public. Normal Tienda products require moderation; Tienda Verificada products can publish directly.
- All free stores have a 50-concurrent-listing V1 cap across pending and approved inventory.

Post-V1 monetization possibilities (not active in V1):
- Monthly plans: 20, 50, 100 listings.
- Featured store.
- Homepage placement.
- Category placement.
- Product photography.
- Catalog management.

Stores are likely the first real monetization engine.

## What the Site Currently Does

Laria currently supports:
- Browsing approved listings.
- Filtering listings.
- Sorting listings.
- Viewing product details.
- Contacting sellers by WhatsApp.
- Submitting individual listings.
- Registering stores.
- Public store pages.
- Admin approval of listings/stores.
- Image uploads.
- Advanced musician-specific filters.
- Compact listing cards.
- Result count.
- Filter chips.
- Clear filters.
- Loading skeletons.
- Empty state.
- Listing detail published time and view count.

## Main Pages

Homepage `/`:
- Introduces the marketplace.
- Routes users toward browsing, selling, and registering a store.

Listings page `/listados`:
- The most important buyer page.
- Lets musicians browse and filter gear.
- Uses core and advanced filters.

Listing detail page `/instrumentos/[slug]`:
- Shows one product in detail.
- Includes photos, price, product information, seller/store information, WhatsApp contact, safety notice, published time, view count, full specs, and recommendation sections.

Store page `/tiendas/[slug]`:
- Works like a mini-shop.
- Shows logo, banner, description, WhatsApp, verified badge, and approved store listings.

Sell page `/vender`:
- Requires a signed-in Particular account and sends anonymous users to `/login?next=%2Fvender`.
- Uses the current profile for seller identity and WhatsApp.
- Collects instrument type and supported labeled attributes.
- Requires 2–10 photos and supports reorder, replace, and removal while keeping at least two.
- Listing goes to admin review before public display.

Register store page `/registrar-tienda`:
- Requires a dedicated Store Owner account created at `/registro/tienda`; it never converts a logged-in Particular.
- Collects RUC, razón social, business email, phone, address/location, and contact person, with optional logo, banner, physical-store photos and supported social links.
- Lets the owner view/edit the application, see a rejection reason, and resubmit corrections.
- Store and inventory remain nonpublic until basic approval.

Login page `/login`:
- Lets existing users log in with email/password or request a magic link.
- Login magic links are for existing users and should not create new accounts.
- Links to `/recuperar-contrasena`; recovery finishes at `/restablecer-contrasena` through `/auth/callback`.

Seller signup page `/registro/vendedor`:
- Lets an individual seller create an account.
- Collects name, email, WhatsApp, city, region, password, and marketplace rules acceptance.
- Creates a complete Particular profile from the signup fields. In the database, Particular accounts use `profiles.account_type='seller'`.
- After confirmation, opens `/mi-cuenta?confirmed=1` with an explicit verified-email message. Authenticated users who revisit signup are returned to the dashboard.

Seller invite page `/registro/vendedor/invitacion`:
- Used after an admin seller invite redirects through `/auth/callback`.
- Requires an authenticated session.
- Completes missing seller profile fields and continues to `/vender`.

Store invite page `/registro/tienda/invitacion`:
- Used after an admin store-owner invite redirects through `/auth/callback`.
- Requires an authenticated session.
- Completes the store-owner contact profile and continues to `/registrar-tienda` for the store application.
- Does not approve the store automatically; admin review is still required.
- The invite and self-signup paths converge on the same owner-bound `/registrar-tienda` application.

Account page `/mi-cuenta`:
- Uses one protected account shell across summary, profile/security, publication, store, and inventory pages.
- Desktop keeps the role-appropriate sidebar visible; mobile exposes the same destinations through the `Cuenta` menu and identifies the active section.
- Particulars can open `/mi-cuenta/publicaciones` and `/mi-cuenta/publicar`. Store Owners use `/mi-cuenta/tienda`, `/mi-cuenta/tienda/inventario`, and `/mi-cuenta/tienda/publicar`.
- Store Owner summary shows the application/trust state, rejection reason, pending/approved capacity, and whether new inventory requires moderation or may publish directly.
- Owned inventory pages now show edit, owner hide/restore, mark-sold, and copied-relist actions according to each listing state. Moderation and administrative-hide reasons are visible to the owner.
- Rejected rows can be corrected in the editor and returned through `Enviar nuevamente`; Particular and normal Tienda rows return to moderation.
- Production Sprint 4 adds real Particular metrics and Store `Estadísticas`. Sprint 5 adds in production a working Favorites section to both account types and in-app price-drop notifications; saved-search/email alerts are not exposed as fake functionality.

Store statistics `/mi-cuenta/tienda/estadisticas` (production Sprint 4):
- Available only inside the authenticated Store Owner shell when the account owns a store.
- Offers `Todo el historial`, `7 días`, and `30 días`; the default is 30 days.
- Shows actual product impressions/views/WhatsApp contacts, store visits/contacts, current public active inventory, and seller-marked sold counts.
- Current active/sold counts are not sales or state changes occurring within the selected event period.
- CTR uses recorded product views divided by impressions. Contact rate uses recorded product contacts divided by recorded product views. `Sin datos` means no denominator; it is not an invented zero rate.
- Lifetime views retain historical `view_count`; older views have no synthetic event history and are not used in the recorded-event conversion denominator. Unavailable data is labelled unavailable, not replaced by estimated zero.
- Contact means intent to open WhatsApp, not a message, unique customer, guaranteed sale, or payment. There are no active favorite or revenue metrics.

Admin page `/admin`:
- Used to control quality.
- Admin can approve listings, reject/hide them with a required reason, restore eligible listings, and review pending moderated field/photo revisions through trusted database operations.
- Sprint 2 store actions include basic approval, required-reason rejection/hiding, verification, and revocation. Store application details and owner identity are visible to admin.
- The wider moderation hub still lacks global search/filtering, reports, reviews, transactions, lifecycle emails, and legacy ownership linking.

## Daily Admin Workflow

### Check Pending Listings

Go to `/admin` and log in with a Supabase Auth user that has admin permissions.

Review `Listados pendientes`:
- Check title, category, brand, model, condition, price, city, seller name, WhatsApp, and description.
- Edit fields if needed.
- Click `Guardar` if anything changed.
- Click `Aprobar` to publish.
- Enter a reason before `Rechazar` or administratively `Ocultar`; the owner will see it.
- Use `Restaurar` only after the administrative issue is resolved and publication requirements still pass.

Only `approved` listings appear in public catalog/search. A sold listing remains available only at its existing direct URL with `Vendido` and no WhatsApp action.

### Check Pending Listing Revisions

Review `Revisiones pendientes`:
- Compare the current live title/category/type/brand/model/photos with the proposed values.
- `Aprobar cambios` applies only the proposed moderated fields and optional photo set; immediate owner edits that happened after submission are preserved.
- `Rechazar cambios` requires a reason visible to the owner.
- The current approved version remains public while the proposal waits. If the owner hides the listing, approving the proposal updates its content but does not make it public again.
- Never try to reactivate a sold source record; the owner must use `Relistar` to create a new copy.

### Check Pending Stores

Review `Solicitudes y tiendas`:
- Confirm RUC, razón social, business email, phone, address/location, contact person, and owner ID.
- `Aprobar como Tienda` requires a complete application and makes the store public without direct-publication privilege.
- `Rechazar con motivo` and `Ocultar con motivo` require text that the owner can see.
- `Verificar tienda` is available only for an active complete Tienda and atomically approves all valid pending inventory.
- `Revocar verificación` leaves the Tienda active and existing approved inventory public; future inventory returns to moderation.

Only `active` stores and their approved inventory appear publicly. Public labels are exactly `Tienda` and `Tienda Verificada`; verification does not promise payment, delivery, product condition, or transaction safety.

### Invite Sellers Or Store Owners

Go to `/admin`, log in as an admin, and use `Invitar usuario`.

Required fields:
- Email.
- Full name.
- WhatsApp.
- Account type: `Vendedor particular` or `Dueno de tienda`.

Optional fields:
- City.
- Region.
- Store name for store-owner invites.
- Internal notes for fieldwork follow-up.

The app sends the invite from a trusted server endpoint. It verifies admin access first, then uses `SUPABASE_SERVICE_ROLE_KEY` on the server only. Do not expose that key to browser code.

Invite destinations:
- Seller: `/auth/callback?next=/registro/vendedor/invitacion`
- Store owner: `/auth/callback?next=/registro/tienda/invitacion`

No temporary passwords are used. The invite email comes from Supabase Auth, and users finish setup after clicking the link.

Store-owner invites do not approve stores automatically. The owner still completes the store application, and an admin must approve it.

### Verify the Public Site

After approving content, check:
- `/listados`
- The listing detail page.
- If it is a store product, the store page at `/tiendas/[slug]`.

Use the WhatsApp button to confirm the link opens correctly.

## How Listings Should Look

A listing card should be compact.

Good example:

```text
[Tag: Guitarras]
Squier Stratocaster
Usado · Buen estado
S/ 950
Lima
Particular
```

Avoid:

```text
Guitarra electrica Squier Stratocaster usada
```

Reason:
- The title should be brand + model.
- Instrument type is a tag.
- Condition is metadata.
- Browsing becomes cleaner.

Cards should not show views or published date. Those belong on the listing detail page.

## How Filters Work

Laria uses advanced filters by instrument group.

Examples:
- Electric guitars can filter by body type, shape, strings, bridge, pickups, handedness, and frets.
- Drums can filter by type, pieces, material, kick size, hardware, and cymbals.
- Interfaces can filter by inputs, connection, phantom power, and MIDI.

This is powered by:

```text
instrument_type
attributes jsonb
```

This means one listing can have flexible technical attributes without creating hundreds of database columns.

The Particular sell form and pending-listing admin editor now render these definitions as labeled controls. Raw JSON and snake_case keys are not exposed.

## Photos

For browsing speed, listing cards initially load only the first photo.

If a listing has more photos, the card shows arrows/dots. Extra photos are loaded only when someone clicks to view them.

Detail pages show all listing photos.

### Editing photos — production Sprint 4

The owner editor supports add, remove, replace, reorder, and primary-photo changes with 2–10 photos, JPEG/PNG/WebP, and 5 MB per file. New edit uploads are private; proposed photos become visible in the editor/admin comparison without replacing the approved public set before moderation.

If a revision already waits for review, another save updates that same proposal rather than creating a second one. `Restaurar fotos aprobadas` returns the approved order without discarding other pending title/type/etc. changes. Restoring every proposed difference cancels the empty proposal. Admin review must use the latest displayed version; stale decisions are refused.

After an uncertain final response, retry in the same open editor to reuse the signed attempt and existing uploads without duplicating revisions. Success/error notices receive accessible focus and scroll into view, and the account menu stays available. Do not reload a partly uploaded form expecting in-memory retry state to survive.

Cleanup is a trusted, owner-bound operation, not a manual browser Storage delete. It protects live, sold, relisted/shared, and retained moderation-history references; errors remain visible/retryable. Old public/legacy photo URLs are preserved. Closing a page mid-upload may still leave an unattached private object; this sprint does not add a scheduled orphan sweeper.

### Contact and event semantics — production Sprint 4

Only visible real browser activity records ordinary views/impressions; SSR, HEAD, and prefetch do not count. A card needs at least 50% viewport intersection. Views/impressions are deduplicated over a rolling 30-minute actor/session-and-target window, distinct from the random anonymous cookie's 24-hour lifetime. Owner/admin commercial activity is excluded.

Actual WhatsApp clicks may count separately, but retrying one event ID cannot count twice. Tracking failure must not strand contact navigation. The system stores click intent, target, source/time, and authenticated buyer identity when present, never draft/message content, raw IP or fingerprints. Analytics expose aggregates, not a buyer directory. Sprint 5 adds in production Favorites/in-app price drops; saved-search/email alerts, verified transactions and reviews remain later-sprint work.

## Listing Detail QA Checklist

When reviewing `/instrumentos/[slug]`, check these cases when test data is available:
- No photo: gallery shows `Foto pendiente`.
- One photo: gallery shows a single main image without thumbnail controls.
- Multiple photos: gallery shows previous/next controls and selectable thumbnails.
- No attributes: `Especificaciones completas` still shows base listing fields and hides empty attribute rows.
- Attributes present: technical values render as friendly Spanish labels, not raw JSON.
- Individual seller: page shows `Sobre el vendedor`, WhatsApp contact, location, and active listing count when queryable.
- Store listing: page shows `Sobre la tienda`, store description when available, store page link, and WhatsApp contact.
- Verified store: page shows `Tienda verificada`.
- No similar items: `Artículos similares` shows its empty state.
- No more items from seller/store: `Más de este vendedor` / `Más de esta tienda` is hidden.
- Desktop: gallery stays sticky while the right detail panel scrolls through seller/store info, description, and specs.
- Mobile: gallery appears first and is not sticky; description, specs, and recommendations remain readable.

## Supabase Tasks

### Apply SQL Migrations

When code adds a new migration:
1. Check migration state with `supabase migration list` when the CLI is logged in.
2. Prefer applying pending migrations with `supabase db push`.
3. If CLI access is unavailable, open Supabase SQL Editor, review the migration file from `supabase/migrations`, paste the SQL, and run it manually.
4. After any manual SQL run, document what was applied and verify migration history/state before the next schema ticket.
5. Deploy the code only after production Supabase has the required schema.

Vercel does not automatically run SQL migrations.

Important: early production schema changes existed before clean CLI migration history. Those baseline migration files should not be replayed blindly against production.

### Create an Admin User

In Supabase:
1. Go to Authentication.
2. Create or invite a user.
3. Open the user.
4. Set app metadata so it includes:

```json
{
  "role": "admin"
}
```

The admin panel checks this metadata through the `is_admin()` function.

## Deployment Workflow

Current intended workflow:
1. Make code changes locally.
2. Commit to GitHub.
3. Push to the main branch.
4. Vercel builds and deploys the project.

Before pushing changes that depend on database changes:
1. Apply the SQL migration in Supabase.
2. Confirm it ran successfully.
3. Push the code to GitHub.
4. Check the Vercel deployment.

Environment variables required in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for server-only admin invite/account actions. Never expose it with a `NEXT_PUBLIC_` prefix.

## Account Auth Setup

Detailed Supabase Auth email subjects and HTML bodies live in `docs/auth-email-templates.md`.

Supabase email/password authentication must be enabled if `/login` and `/registro/vendedor` should support password login/signup. If email confirmation is enabled, seller signup waits for the user to confirm by email and `/auth/callback` completes the profile from stored metadata.

Supabase Auth redirect URLs should include:
- Local callback: `http://localhost:3000/auth/callback`
- Production callback: `https://laria.audio/auth/callback` or the active production domain.
- Current Vercel production callback if testing before the custom domain is fixed: `https://mkt-instrumentos.vercel.app/auth/callback`
- Vercel preview callback pattern if preview magic-link testing is needed.

Magic-link, signup confirmation, recovery, and invite flows should redirect through `/auth/callback?next=...`. The three owner-facing email templates must use the `token_hash` links in `docs/auth-email-templates.md`; the callback also retains PKCE-code compatibility. Current signup confirmation lands on `/mi-cuenta?confirmed=1`; `/confirmacion-correo` remains a legacy success page. Supabase still only needs the callback URL allowlisted.

Supported invite next paths:
- `/registro/vendedor/invitacion`
- `/registro/tienda/invitacion`

Admin invite metadata should include `account_type='seller'` for seller invites and `account_type='store_owner'` for store-owner invites. Invite pages use that metadata when available. If the metadata/profile type is missing or mismatched, the app shows a recovery panel instead of changing account type silently.

Invite flows do not use temporary passwords. Users activate through Supabase invite/magic-link style links and finish setup after the callback.

Supabase may expose only one built-in `Invite user` template. In that case, use one generic invite email and rely on invite metadata plus the post-click onboarding pages for seller/store-specific behavior.

To test locally:
1. Start the app with `npm run dev`.
2. Open `http://localhost:3000/login`.
3. Test password login with an existing user.
4. Test magic link with an existing user; the email should redirect through `/auth/callback` and then to the safe `next` path.
5. Open `http://localhost:3000/registro/vendedor` and create a Particular seller account.
6. If email confirmation is enabled, open the local Supabase/Mailpit email if using local Supabase, or the real inbox if using production Supabase env vars.
7. Confirm the new user lands on `/mi-cuenta?confirmed=1`, sees `Correo confirmado`, remains authenticated, and has a complete `profiles` row with `account_type='seller'`.
8. Confirm `/mi-cuenta` redirects anonymous users to `/login?next=/mi-cuenta`.
9. Test a seller invite with `redirectTo` ending in `/auth/callback?next=/registro/vendedor/invitacion`; confirm the setup page completes the profile and continues to `/vender`.
10. Test a store-owner invite with `redirectTo` ending in `/auth/callback?next=/registro/tienda/invitacion`; confirm the setup page completes the profile and continues to `/registrar-tienda`.
11. Test an invite with missing or wrong `account_type` metadata; confirm the recovery panel appears instead of changing account type silently.
12. In `/admin`, send a seller invite and confirm the success panel shows the email, type, and destination for follow-up.
13. In `/admin`, send a store-owner invite and confirm the destination is `/registro/tienda/invitacion`.
14. Try signing up with an existing email; the form should show `Este correo ya está registrado. Ingresa con tu cuenta o usa otro correo.` and a login link.
15. Try invalid region text in seller signup, invite setup, store registration, and admin invite. The form should reject it.
16. Open `/vender` while signed out and confirm the login return path points back to `/vender`.
17. As a Particular, submit valid listings with 2 photos and 10 photos; confirm each is `pending`, owned by the current Auth user, and appears in the admin queue.
18. Confirm 1 and 11 photos are rejected, and test reorder, replace, and removal controls.
19. Change the Particular profile name/WhatsApp/location and confirm an approved owned listing displays the new seller details; confirm a legacy unowned listing still uses its stored contact.
20. Request password recovery, follow the email through `/auth/callback`, set a new password, and then test `/mi-cuenta/seguridad`.
21. Create a new account at `/registro/tienda`; confirm the email link reaches `/mi-cuenta?confirmed=1` and clearly identifies the Store Owner experience.
22. While logged in as a Particular, open `/registrar-tienda`; confirm it explains account separation and offers sign-out without changing the profile type.
23. As a Store Owner, submit all required application fields once with no optional assets, and once with logo, banner, physical-store photos and supported links.
24. Confirm a pending store slug returns not found publicly and an approved listing belonging to it does not appear in catalog/detail/photo reads.
25. In `/admin`, inspect the complete application, reject it with a reason, and confirm that reason appears in the owner's account/application area.
26. Correct and resubmit the rejected application, approve it, and confirm the public page label is exactly `Tienda` while new inventory remains pending.
27. Verify the active store and confirm the label becomes `Tienda Verificada`, the UI makes no transaction guarantee, and all valid pending inventory becomes public together.
28. Submit valid new inventory as the verified owner and confirm it becomes public directly; revoke verification and confirm the next submission returns to pending while prior approved inventory stays public.
29. Visually confirm the 50/50 dashboard state prevents a new form entry and the database cap error is clear if a stale form attempts submission.
30. Check the application, dashboard, admin store controls, public badge, and inventory form on a narrow mobile viewport and keyboard navigation.
31. As a Particular with an approved listing, change price/description plus title and condition in one save. Confirm the immediate values update now, title and condition become a pending revision, and the old public title and condition stay visible.
32. While that revision remains pending, change the proposed title/condition again and add/reorder photos. Confirm the editor loads the current proposal, the save succeeds, and there is still exactly one pending proposal containing the latest changes.
33. Open the proposal as admin, amend it once more as owner in another browser, then attempt the stale admin decision. Confirm it is refused and the refreshed comparison shows the latest fields/photos. Approve the latest version and confirm only proposed fields/photos change while later immediate values remain intact.
34. Reject another revision with a reason and confirm the owner sees the reason while the public listing remains unchanged.
35. Hide an approved listing as owner and restore it. Then hide it as admin with a reason and confirm the owner cannot restore it.
36. Mark a listing sold. Confirm it disappears from catalog/search, its direct URL shows `Vendido` without WhatsApp, and the source cannot be edited or restored.
37. Relist the sold item. Confirm a new slug/record is created, the old sold URL remains unchanged, and moderation follows Particular/normal-Tienda/Tienda-Verificada rules.
38. For a normal Tienda, confirm approved edits use revision moderation. Verify the store and confirm later valid edits apply directly; revoke verification and confirm subsequent moderated edits return to review.
39. At the store cap, attempt owner restore and relist transitions that would consume capacity; confirm they fail without exceeding 50.
40. Exercise photo add/reorder/replace/remove in the edit form, including a failed upload, and confirm the 2–10 rule, visible focus/error feedback, preserved public photos before approval, and no unexpected orphan object.
41. Submit and edit a whole-sol price of exactly S/ 1,200; confirm the stored/API value and catalog/detail display remain exactly S/ 1,200.
42. Trigger listing/revision/store moderation decisions and confirm the owner sees only their own newest-first notices in `Notificaciones`, can mark them read, and can follow rejection notices to the reason.
43. Trigger a duplicate-RUC application error and confirm the UI says the RUC is already registered without identifying the other store owner.

### Sprint 4 production owner retest — CLOSED / ACCEPTED

Historical checklist below was completed by the owner: all eight cases PASS — 2026-09-17. No additional Sprint 4 owner retest is requested.

The owner already accepted `STORE-018`, `DASH-008`, `NOTIF-001`, `NOTIF-002`, `LIST-013`, `REV-011`, and `REV-012` in production on **2026-09-16**. Do not treat them as new unsigned acceptance or overwrite that evidence. The eight Sprint 4 cases below were owner-accepted on 2026-09-17; their archived instructions are not outstanding manual retests.

Required owner/manual checks, using real owned listings/stores:
- `REV-014`: on an approved Particular or normal-Tienda listing, create a pending title/condition proposal, then add and save a photo. Amend/reorder/remove/replace photos and save repeatedly. Confirm exactly one evolving proposal retains text changes; public old photos remain until moderation. As admin, inspect the latest proposal and approve it; confirm the exact latest order/primary is promoted.
- `PHOTO-015`: close the browser during upload, before finalization, then inspect the public catalog/listing state. PASS requires no finalized/public invalid listing. The exact row permits an orphan-storage limitation; do not invent a requirement for guaranteed background orphan cleanup.
- `SANA-010`: visually inspect Particular summary/publications and Store `Estadísticas`, including empty activity. Confirm no fabricated revenue or GMV is displayed; off-platform contacts or seller-marked sold listings are not verified paid sales.
- `AUTH-023`: request a real recovery email and use its link. Submit the current password and expect `La nueva contraseña debe ser diferente de tu contraseña actual.` Then reset to a different valid password and verify login. Automated production recovery used a generated QA token, not real-inbox delivery.
- `WA-001`, `WA-002`, `WA-003`, `WA-004`: confirm the actual WhatsApp app/web destination launches anonymously and while authenticated, for Particular and store contact. Automated production checks proved canonical URLs, attribution and failure-safe navigation, but intercepted external launch rather than claiming a real conversation.

Full-inventory metrics, Store lifetime/7/30 real/zero ratios, null denominators, desktop/mobile active menus, focused photo feedback, optimized decoded cards/detail images and lazy thumbnails already passed deterministic production browser checks. Do not repeat those checks or SQL/RLS/cap stress merely to duplicate automated proof. Optional owner usability feedback is welcome but not represented as a new manual PASS.

Use only the exact existing registry IDs when recording results in `acceptance/cases.tsv`, and run `python3 -B acceptance/validate.py`. Never mark a manual production case Pass from automated release checks; do not read/regenerate XLSX during active sprints.

Exact completed owner/manual IDs: `REV-014`, `PHOTO-015`, `SANA-010`, `AUTH-023`, `WA-001`, `WA-002`, `WA-003`, `WA-004`.

Production entry points: `/mi-cuenta`, `/mi-cuenta/publicaciones`, `/mi-cuenta/publicaciones/{id}/editar`, `/mi-cuenta/tienda/inventario`, `/mi-cuenta/tienda/estadisticas?periodo=0|7|30`, `/recuperar-contrasena`, `/mi-cuenta/seguridad`, and `/admin`. Compare public `/listados`, `/instrumentos/{slug}` and `/tiendas/{slug}` in a separate anonymous browser. Use your own IDs/slugs; temporary release QA accounts and content have been deleted.

Do not repeat deterministic SQL/RLS attacks, raw-event authorization or cap races as manual QA. Sprint 5 completes in production favorite-dependent `SDASH-008` aggregates. `LIFE-013` remains blocked for the verified-transaction/review sprint.

Valid region values are fixed to Peru regions. City fields show suggestions but can be typed manually when the city is not in the list.

## Frozen V1 Gaps and Post-V1 Exclusions

Sprint 5 implements Favorites and in-app price drops in production; owner usability acceptance remains pending. V1 gaps remain saved-search alerts, price-drop/lifecycle email delivery, verified transactions, reviews, reports and the remaining full moderation hub. Listing lifecycle, revisions, notifications, private photo editing and contact/event-backed analytics remain implemented; Sprints 1–4 are accepted. See `docs/functional-spec.md`.

## Sprint 5 owner usability acceptance — production retest ready

Use your own accounts/listings on production now; local and production automated PASS is not a manual owner sign-off. Temporary release fixtures have been removed. Do not repeat database/RLS/concurrency attacks.

- `STORE-019`: submit a duplicate RUC, correct only RUC without reload, and confirm other business fields/logo remain, success is focused/visible and the account shows one existing application.
- `PUB-008`, `PUB-009`, `PUB-010`: browse home, catalog, detail, store, login and account routes on desktop/narrow mobile. Check logo/search/account layout, category/subtype access, persistent account menu and no horizontal overflow. Enter a known brand and an unknown brand; verify canonical catalog results and filter behavior.
- `FAV-001`, `FAV-002`, `FAV-003`, `FAV-005`, `FAV-006`, `FAV-007`: save/remove another seller's listing from cards/detail; confirm saved state in account Favorites. Anonymous favorite should lead to login with a safe return path. Store Owners may also save other sellers' gear.
- `FAV-008`, `FAV-009`: using seller and buyer accounts, mark a saved item sold or hide it. Confirm buyer history says Vendido or generic unavailability without exposing private content.
- `PDA-001`, `PDA-002`, `PDA-004`, `PDA-005`, `NOTIF-003`: favorite an approved item, lower its live price as owner, then open the buyer's in-app notice. Confirm useful price copy/current destination, no duplicate for unchanged price, and a later drop can notify again. No email is promised in Sprint 5; `PDA-009` is deferred to Sprint 7.
- `SANA-002`, `SANA-007`, `AN-014`, `SDASH-008`: visually check real current favorites versus period actions/rate in Particular/Store analytics. No buyer directory, revenue or guaranteed transaction is shown.

Production routes: `https://laria.audio/`, `/listados`, `/login`, `/mi-cuenta/favoritos`, `/mi-cuenta/notificaciones`, `/mi-cuenta/publicaciones`, `/mi-cuenta/tienda`, `/mi-cuenta/tienda/inventario`, `/mi-cuenta/tienda/estadisticas`. Use your actual public `/instrumentos/{slug}` and `/tiendas/{slug}`. See `docs/sprint-5-production-verification.md` for the exact release/evidence boundary.

Do not build these post-V1 areas without a new product decision:
- Payments.
- Checkout.
- Escrow.
- Delivery.
- Internal chat.
- Subscription billing.
- Commission logic.
- Paid listing boosts.

Required V1 reviews are limited to the verified-transaction workflow. Required dashboards must not invent revenue or other off-platform transaction data.

## Commercial Priorities

The next real business task is supply and trust.

Priorities:
1. Get 50-100 quality listings.
2. Onboard the first stores.
3. Make listings look trustworthy.
4. Track WhatsApp interest.
5. Learn what buyers search for.
6. Learn what stores are willing to pay for.

The real asset is not only the code. It is the ability to organize a fragmented musical gear market.

## Strategic Direction

The immediate product direction is:

```text
Make Laria the best place in Peru to discover musical instruments and gear.
```

Do this before adding complex transactions. Laria wins by having:
- Better supply.
- Better music-specific filters.
- Better trust and curation.
- Better store onboarding.
- Easier WhatsApp conversion.

Future vertical marketplaces should probably use separate brands or sites instead of turning Laria into a generic classifieds platform.

## Working With Codex

Treat Codex like a junior developer with strong code-reading ability: give it small, specific tasks and ask it to read `/docs` first.

Good prompt:

```text
Add a Mis publicaciones page for logged-in users. Show only listings owned by the current user. Do not modify admin workflows.
```

Bad prompt:

```text
Make the marketplace better.
```

After every major feature, update `/docs` so future Codex sessions do not depend on old conversation context.
