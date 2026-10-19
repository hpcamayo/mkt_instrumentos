# Effortless Laria: listing page and WhatsApp (batch "listing")

Build plan: `/mnt/project-files/ux-ideas/build-plan.md`. Ideas: `/mnt/project-files/ux-ideas/ideas.json`. Henri marked
every idea in this batch "yes" on 2026-10-19, with no notes. Migration slot 20261102, acceptance range EASE-100 to
EASE-199 (proposed in `listing-acceptance.tsv`). Screenshots: `/mnt/project-files/ux-ideas/screens/listing/`.

## Fixes (branch `ux/effortless-listing-fixes`)

### fix-03 A store's new WhatsApp number reaches its listings

- **What changed.** A store listing's WhatsApp button now opens the store's current number (page, contact route and
  "Solicitar compra"), the way account-owned Particular listings already follow the profile. A trigger also copies a
  store's new number to its unsold listings, and a one-time update fixes listings that had already drifted, so admin
  screens and every other reader agree. Sold listings keep their number (immutable history).
- **Files.** `lib/seller-contact.ts` (`resolveContactPhone`), `lib/listings.ts`, `app/api/contact/route.ts`,
  `app/instrumentos/[slug]/page.tsx`, `supabase/migrations/20261102120000_ux_store_listing_contact.sql`,
  `tests/ux-listing-contact.sql`, `tests/ux-effortless-listing.test.cjs`.
- **How to test.** Local DB: `tests/ux-listing-contact.sql`. In the prototype, change the demo store's number in Mi
  tienda, then open `/instrumentos/demo-boss-ds-1`: the button's `wa.me` link uses the new number.
- **Defaults.** Only `whatsapp_phone` follows the store; `contact_name` stays as created (nothing public reads it for
  store listings).

### WhatsApp numbers wa.me can open (shared with accounts' fix-01)

- **What changed.** Every `wa.me` link (listing, store, "Solicitar compra") goes through `whatsAppNumber`: a 9-digit
  Peruvian mobile stored without the country code gets `51`, `0051…` loses its international prefix, anything else is
  kept as typed. This is the defensive half; the accounts batch owns storing numbers with +51 (fix-01).
- **Files.** `lib/seller-contact.ts` (`whatsAppNumber`, `whatsAppUrl`), `lib/listings.ts`, and one line in
  `lib/payment-methods.ts` (owned by inventory): `buildPurchaseWhatsAppUrl` now calls `whatsAppUrl`.

### fix-09 (part) "Ver publicaciones similares" never lands on nothing

- **What changed.** On a sold listing the "Publicaciones similares" section stays even when nothing similar is public,
  as one line: "Ahora no hay otras publicaciones de este tipo. Explorar el catálogo" (the type's catalog page). On
  live listings an empty section is still left out (UX-4 L12).
- **Files.** `components/listing/related-listings.tsx` (`emptyText`), `app/instrumentos/[slug]/page.tsx`.

## Proposed decisions

| ID | Decision |
| --- | --- |
| UXD-listing-1 | Store listings take their WhatsApp contact from the store's current number; unsold listings' stored copy follows the store, sold ones keep theirs. wa.me links add 51 to 9-digit mobiles. |
| UXD-listing-2 | A sold listing's "Publicaciones similares" stays as a one-line pointer to the catalog when nothing similar is public. |
