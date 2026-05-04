# Founder / Operator Manual

This is the practical owner guide for Laria.

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

Future monetization:
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
- Admin approval.

Future monetization:
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
- Includes photos, price, product information, seller/store information, WhatsApp contact, safety notice, published time, and view count.

Store page `/tiendas/[slug]`:
- Works like a mini-shop.
- Shows logo, banner, description, WhatsApp, verified badge, and approved store listings.

Sell page `/vender`:
- Lets an individual submit a listing.
- Listing goes to admin review before public display.

Register store page `/registrar-tienda`:
- Lets a store request a store page.
- Store goes to admin review before public display.

Admin page `/admin`:
- Used to control quality.
- Admin can approve, reject, hide, or mark listings/stores.

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

Review `Tiendas pendientes`:
- Check name, location, WhatsApp, social links, and description.
- Decide whether to mark `Tienda verificada`.
- Click `Guardar` if anything changed.
- Click `Aprobar` to activate the store page.
- Click `Ocultar` if it should not be public.

Only `active` stores appear publicly.

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

Important current gap: the public sell form does not yet collect these advanced attributes. They exist in seed/admin-managed data and should be added to submission/admin flows later.

## Photos

For browsing speed, listing cards initially load only the first photo.

If a listing has more photos, the card shows arrows/dots. Extra photos are loaded only when someone clicks to view them.

Detail pages show all listing photos.

## Supabase Tasks

### Apply SQL Migrations

When code adds a new migration:
1. Open Supabase.
2. Go to SQL Editor.
3. Open the migration file from `supabase/migrations`.
4. Copy the SQL.
5. Paste it into Supabase SQL Editor.
6. Run it.
7. Deploy the code.

Vercel does not automatically run SQL migrations.

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

## What Not To Build Yet

Do not rush into:
- Payments.
- Checkout.
- Escrow.
- Delivery.
- Reviews.
- Internal chat.
- Full seller dashboards.
- Subscription billing.
- Commission logic.

These are valuable later, but too early they add complexity before proving marketplace liquidity.

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
