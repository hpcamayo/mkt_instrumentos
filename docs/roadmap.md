# Roadmap

This roadmap is intentionally phased to avoid feature creep.

Current strategic goal:

```text
Make browsing useful enough for musicians that Laria feels serious before adding transactional complexity.
```

Do not add payments, checkout, escrow, delivery, reviews, commissions, subscriptions, internal chat, or complex dashboards until the product direction explicitly changes.

## Phase 1: Advanced Listings Experience

Status: mostly implemented in the current codebase.

Goal: make the listings page feel like a real musician-focused marketplace.

Implemented or in progress:
- Core filters: Condicion, Marca, Precio, Ubicacion.
- Seller type filter: Particular, Tienda, Tienda verificada.
- Sorting: Mas recientes, Menor precio, Mayor precio.
- Advanced filters by instrument group.
- Result count.
- Active filter chips.
- Clear filters.
- Sticky desktop sidebar.
- Mobile filter/sort controls.
- Compact listing cards.
- 4-column large desktop grid.
- Smaller margins and wider layout.
- Efficient first-photo loading.
- On-demand extra photo fetch.
- Skeleton loaders.
- Empty state.
- Published time and view count on detail page.

Remaining quality work:
- Add `instrument_type` and `attributes` fields to public seller submission flow.
- Add admin editing for `instrument_type` and `attributes`.
- Run full build/type/lint in a local environment with dependencies.
- Browser-test mobile and desktop layouts.

## Phase 2: Seller Accounts, Light Version

Goal: allow sellers to track their own listings without full marketplace complexity.

Potential features:
- Supabase Auth for sellers.
- User registration/login.
- Link listings to user/account.
- `Mis publicaciones`.
- View listing status: Pendiente, Aprobado, Rechazado, Vendido.
- Seller can mark as sold.
- Seller can request edit.
- Admin approval remains.

Avoid for now:
- Complex seller dashboards.
- Internal messaging.
- Payments.

## Phase 3: Store Owner Tools

Goal: reduce manual work for store inventory management.

Potential features:
- Store owner login.
- Store owner profile.
- Manage store info.
- Add store listings.
- View store listings.
- Track listing limits.
- Basic listing plan display.

Do not add billing automatically yet.

## Phase 4: Trust Layer

Goal: increase buyer confidence.

Potential features:
- Tienda verificada badge.
- Vendedor verificado badge.
- Listing reviewed badge: `Revisado por Laria`.
- Report listing button.
- Stronger safety tips.
- Better seller/store profile trust signals.
- Required minimum photo count.
- Optional store location map.

## Phase 5: Monetization Experiments

Goal: start earning revenue without heavy infrastructure.

Potential features:
- Featured listings.
- Featured stores.
- Homepage placement.
- Category placement.
- Manual store plans:
  - Starter 20
  - Growth 50
  - Pro 100
- Catalog management service.

Billing can initially be handled manually/off-platform while software tracks plan type and listing limits.

## Phase 6: Marketplace Growth UX

Goal: make the platform feel bigger and stickier.

Potential features:
- Favorites.
- Recently viewed.
- Saved searches.
- Search suggestions.
- Brand pages.
- Category landing pages.
- SEO landing pages:
  - `/instrumentos/guitarras`
  - `/instrumentos/baterias`
  - `/instrumentos/microfonos`
- Store directory.
- Similar listings.

## Phase 7: Transactional Marketplace, Later

Only after traction.

Potential features:
- Payments.
- Escrow.
- Delivery integrations.
- Reviews.
- In-platform messaging.
- Commission enforcement.
- Dispute flow.

Do not implement this early.

## Phase 8: Multi-Vertical Playbook

If Laria proves the model, repeat the same platform logic under separate brands for other niches.

Possible future verticals:
- Audiovisual/camera equipment.
- DJ/event equipment.
- Professional tools.
- Creator/studio equipment.
- Bikes or niche sports gear.

Decision: future verticals should likely have separate names/domains/identities, not be forced under Laria.

## Commercial Priorities

The next real business task is not only more code. It is supply and trust.

Priorities:
1. Get 50-100 quality listings.
2. Onboard the first stores.
3. Make listings look trustworthy.
4. Track WhatsApp interest.
5. Learn what buyers search for.
6. Learn what stores are willing to pay for.

