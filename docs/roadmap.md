# Laria roadmap

Updated 2026-10-28. [functional-spec.md](functional-spec.md) defines the expanded V1 contract. [features.md](features.md) inventories implementation; [documentation-status.md](documentation-status.md) records exact sources and release gates. This roadmap replaces the original Sprint 1–9 build sequence as the forward-looking plan.

## Foundation and extensions already on main

The original public marketplace, owned Particular/store accounts, moderated publication and revisions, store approval/verification, lifecycle, favorites, analytics, verified purchases/reviews, reports, Admin hub, email, SEO and legal pages have implementations. Their dated production/owner evidence remains in the sprint and release records.

Main has also incorporated the UX redesign and ten-category taxonomy, store inventory/imports/Mostrador, the gated assisted-commerce pilot, Effortless Laria discovery/account/selling improvements, and launch-audit security/privacy/performance/operations fixes. The five Effortless maybes are now on main: reservations and release watches, WhatsApp offers, Descubrir and the two gated AI helpers. These are no longer unstarted roadmap suggestions.

“On main” does not mean every pilot is enabled or every acceptance case passed. This update does not close the launch gate. Do not use historical September totals or Hobby/manual-worker notes as current deployment facts.

## Next release: approved feature ideas, PR #54

[PR #54](https://github.com/hpcamayo/mkt_instrumentos/pull/54) is open and draft at this checkpoint. Of 60 approved ideas, 44 are built; 13 were explicitly postponed and 3 await catalog dependencies. The nine batch areas are:

1. Accounts, data controls, help and safety.
2. Listing conditions, terms, combos and map.
3. Deal trust, seller/buyer identity, reviews and counter-purchase QR.
4. Mi equipo, store offers, consignment, part payment and price tools.
5. Store reach: imports, feeds, dealers, campaigns and demand reporting.
6. Store floor: arrivals, warranty, labels, try-outs and installments.
7. Discovery: Andean category, makers, artists, guides, gifts and collections.
8. Services for musicians, separate from item discovery.
9. Sedes and merchant electronic receipts, with Nubefact activation explicitly deferred.

## Release work remaining

- Integrate later main follow-ups into the reviewed feature branch and keep application, generated types and all migrations compatible.
- Finish legal review of the new Terms/Privacy text and set its approved publication date. Do not enable the assisted-commerce pilot merely because the code is merged.
- Apply the 61 additional feature migrations in their approved coordinated release window immediately before merge/release. The condition migration breaks older application assumptions; do not apply it early as a standalone schema update.
- Verify application, SQL, Auth/PostgREST/Storage two-step enforcement, background jobs, indexing, mobile layouts and the affected end-to-end flows on the compatible candidate.
- Complete or consciously retain disabled provider-dependent features. Google setup is recorded; Apple is deferred; Mercado Libre client credentials are incomplete. Nubefact remains off until separately resumed and demo-tested. Google Shopping remains off; a product feed does not solve its checkout-eligibility mismatch.
- Record the required owner/manual acceptance in the canonical registry. Proposed GROW cases and passing local automation do not imply manual Pass.
- Verify actual Vercel/pg_cron job execution, delivery and failure handling after release. Pro scheduling replaces the early manual Hobby QA assumption.

The exact source and setup evidence is in [documentation-status.md](documentation-status.md). This roadmap grants no new deployment, migration or provider-activation authorization.

## Catalog and Jev workstream

The canonical instrument catalog already supplies a production data foundation, category/brand navigation and brand suggestions. Catalog-backed listing autofill, Jev moderation authority and a complete model/variant tree are separate work. The photo AI helper does not replace them. Research or a benchmark run does not establish a production release.

Dependencies still block the three catalog-dependent ideas (market price comparison, price guides and compatibility) and parts of Mi equipo/red flags (valuation and price-anomaly rules). Decisions about Jev's approval powers and thresholds remain explicit; current moderation rules continue.

## Explicitly deferred work

The 13 approved ideas marked later remain outside this release:

- Staff accounts; protected payments; managed shipping.
- Listing video; pedalboard planner; auctions; rentals/rent-to-own.
- Donations; store events/clinics; linked live demos; institutional quotes.
- Paid store plans and paid featured placement.

Separate feature-ideas maybes remain undecided/deferred: identity checks/fees, technician inspections, Ask Laria, photo search, WhatsApp alerts, custom store domains and WhatsApp publication. Partial limitations of built ideas remain in the [deferred register linked from the source map](documentation-status.md#pr-54-sources), including map bounds/geocoding, advanced installments, and additional receipt/document workflows.

## Marketplace priorities

Keep building supply and onboarding stores while verifying quality, Spanish copy, accessibility, safety guidance, contact conversion, email delivery and useful retention. Use observed searches, contacts, merchant activity and confirmed purchases to guide later decisions. Never present demand counts as predicted sales, verified relationships as payment processing, or merchant declarations as Laria guarantees. No charging in the current pilot.
