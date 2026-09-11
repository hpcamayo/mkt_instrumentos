# Founder / Operator Manual

This is the practical owner guide for Laria.

`docs/functional-spec.md` is canonical for the frozen V1 product contract. This manual describes operations and current implementation; it must not be used to override that contract.

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
- Protected account foundation with real profile information.
- Store Owner accounts see real application/trust state, rejection reason, pending/approved capacity, and store inventory entry points.
- Links to `/mi-cuenta/perfil` for name, WhatsApp, city, and region changes.
- Links to `/mi-cuenta/seguridad` for authenticated password changes.
- Publication-management and analytics areas remain clearly marked for later sprints.

Admin page `/admin`:
- Used to control quality.
- Admin can currently approve, reject, hide, or mark listings sold; Sprint 2 store actions include basic approval, required-reason rejection/hiding, verification, and revocation through trusted database operations.
- Store application details and owner identity are visible to admin. The wider moderation hub and listing-level reasons remain scheduled for later sprints.

## Daily Admin Workflow

### Check Pending Listings

Go to `/admin` and log in with a Supabase Auth user that has admin permissions.

Review `Listados pendientes`:
- Check title, category, brand, model, condition, price, city, seller name, WhatsApp, and description.
- Edit fields if needed.
- Click `Guardar` if anything changed.
- Click `Aprobar` to publish.
- Click `Rechazar` if it should not be published.
- Click `Ocultar` if it should not be public.
- Click `Marcar vendido` if the item is no longer available.

Only `approved` listings appear publicly.

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

Valid region values are fixed to Peru regions. City fields show suggestions but can be typed manually when the city is not in the list.

## Frozen V1 Gaps and Post-V1 Exclusions

The current application does not yet implement several required V1 areas, including full seller/store listing lifecycle management, favorites, alerts, analytics beyond view count, contact tracking, verified transactions, reviews, reports, and the full moderation hub. See the status matrix in `docs/functional-spec.md`.

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
