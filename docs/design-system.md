# Laria Design System

This is the canonical reference for Laria UI work. Read this before changing frontend visuals, layout, Tailwind classes, or reusable UI components.

## Brand Principles

Laria is a focused music-gear marketplace for Peru. The interface should feel commercial, clear, and premium without implying platform payments, checkout, delivery, or buyer protection that the product does not support. V1 ratings/reviews must appear only when backed by the verified-transaction workflow in `docs/functional-spec.md`.

Design should prioritize:
- Fast browsing and comparison.
- Clear listing information.
- Direct WhatsApp contact.
- Trust through honest available signals.
- Mobile-first usability with strong desktop layouts.

## Color Tokens and Usage

Core palette:

| Role | Hex | Usage |
| --- | --- | --- |
| Brand action/logo | `#F1EA16` | Laria logo, major CTAs, primary publish/sell actions |
| Interface accent | `#6BA6FF` | Selected states, links, verification marks, active filters, pagination, dashboard charts |
| Header/footer black | `#050608` | Site header, footer, dark admin/sidebar panels |
| Dark ink | `#101217` | Main text and dark buttons |
| Graphite panel | `#1A1D24` | Secondary dark surfaces |
| Page white | `#FFFFFF` | Cards, panels, main content surfaces |
| Light page background | `#F1F3F5` | Page canvas behind white cards |
| Fog border/background | `#E9EDF3` | Subtle borders, dividers, soft backgrounds |
| Steel border/icon tone | `#C8CDD6` | Input borders, secondary borders, muted icon structure |
| Muted text | `#9DA3AF` | Low-priority text only |
| Main dark text | `#101217` | Primary headings/body text |
| Soft dark text | `#4B5563` | Supporting body copy and metadata |

Usage rules:
- Use `#F1EA16` sparingly for major actions, not every badge.
- Use the blue accent for interface state and guidance, not large brand blocks.
- Keep page backgrounds white or very light gray.
- Keep borders subtle and shadows soft.

## Current Visual Direction

The current Laria UI is a light-background marketplace system:
- Header and footer use `#050608` or `#101217`.
- The logo uses `#F1EA16`.
- `#F1EA16` is the primary brand action color for main CTAs.
- `#6BA6FF` is the interface accent for selected states, links, verification marks, active filters, pagination, and dashboard charts.
- Main page backgrounds use `#FFFFFF` or `#F1F3F5`.
- Borders use `#E9EDF3` or `#C8CDD6`.
- Dark text uses `#101217`.
- Soft/muted text uses `#4B5563` or `#9DA3AF`.
- Cards are white, lightly bordered, softly shadowed only when necessary, and rounded but not bubbly.
- Product cards prioritize image, title, condition/location/seller metadata, and prominent price.
- Admin/user panels are utility-first, dense but readable, and use `#6BA6FF` for active/selected/chart states.
- `#F1EA16` should remain mostly reserved for the logo and major CTAs.

## Completed Visual Refresh Sprint

The visual redesign sprint refreshed:
- Homepage.
- Listings/catalog page.
- Listing detail page.
- User/seller panel at `/mi-cuenta`.
- Admin panel at `/admin`.

Sprint scope was UI-only:
- No new backend logic.
- No schema changes.
- No new Supabase queries.
- No new marketplace features.
- Unsupported visual elements remain placeholder-only.

## Header Rules

- Header stays black/dark.
- Laria logo stays yellow.
- Navigation links use white or light gray.
- Publishing/selling CTA can use yellow when present.
- Do not add cart or checkout. Favorites and search-alert behavior are frozen V1 requirements but must appear only when backed by their real implementation, not as decorative controls.

## Background Rules

- Public pages use a light canvas, usually `#FFFFFF` or `#F1F3F5`.
- Main content surfaces are white.
- Dark full-width areas are reserved for the global header/footer, homepage hero/CTA, and admin/dashboard navigation surfaces.

## CTA and Button Rules

- Primary CTA: yellow background with black text.
- Secondary CTA: white/light background with steel border and dark text.
- Blue buttons are acceptable for admin/status operations where yellow would overstate the action.
- Destructive or moderation actions must remain visually clear and should not be disguised as normal links.

## Link and Selected-State Rules

- Links, selected filters, active nav states, selected thumbnails, verification labels, and pagination active states use the blue accent.
- Keep selected states obvious with a combination of color, border, and background.
- Avoid using yellow for minor badges or selected filters.

## Card Rules

- Cards are white with thin fog/steel borders.
- Shadows should be soft and minimal.
- Corners are rounded but not bubbly; prefer `rounded-md` or `rounded-lg`.
- Do not nest decorative cards inside other cards unless the inner card is a real repeated item, table, or form group.

## Product Card Rules

Product cards prioritize:
- Image or honest missing-photo placeholder.
- Title, preferably brand + model when data supports it.
- Condition.
- Price.
- Seller type/store and location when available.
- Small category/status badge.

Cards should match the catalog style: white card, subtle border, soft shadow, blue hover/active details, prominent dark price.

## Listing/Catalog Page Rules

- Use a light page background.
- Keep the left filter sidebar white, bordered, and readable.
- Use blue for selected filters, focus states, and active controls.
- Keep the product grid spacious enough for browsing.
- Do not change filter logic, query params, or listing fetch behavior during visual-only tasks.

## Listing Detail Page Rules

- Use a two-column desktop layout: gallery on the left, listing information on the right.
- Gallery remains sticky on desktop and non-sticky on mobile.
- Selected thumbnails use the blue accent.
- Price is large, dark, and high contrast.
- WhatsApp contact remains the primary path and uses the yellow CTA.
- Seller/store trust, description, full specs, similar items, and more-from-seller/store sections use clean white panels.
- Do not add payments, checkout, shipping, or fake trust metrics. Favorites and verified-transaction ratings/reviews may be added only with their real V1 data and behavior.

## User/Seller Panel Rules

- Use a light workspace with white dashboard cards.
- Sidebar or dashboard navigation should be clean and use blue active states.
- Use yellow only for the main action: publish a new listing.
- Placeholder metrics/charts are allowed only when clearly commented and must not imply working analytics.
- Do not change auth/session logic or add seller calculations during visual-only work.

## Admin Panel Rules

- Keep admin UI operational, dense, and readable.
- A dark sidebar/header is appropriate when it helps orientation.
- Main workspace should remain light.
- Use blue for active navigation, selected rows, links, and chart placeholders.
- Status badges should be subtle.
- Do not change moderation, approval, rejection, invite, or authorization behavior during visual-only work.

## Placeholder Policy

Placeholders are acceptable for unsupported visual areas only when they do not fake product behavior.

Rules:
- Add a code comment such as `// UI placeholder only; replace with real data when feature is implemented.`
- Do not show fake ratings, fake sales counts, fake revenue, fake reviews, or fake guarantees.
- Prefer omission over misleading placeholders.
- Placeholder charts are allowed for layout only and must not drive product decisions.

## Tailwind and Component Style Guidance

- Prefer existing tokens, utilities, and reusable components over one-off class walls.
- Use `components/page-container.tsx` for public page width.
- Reuse `ListingCard`, `ListingFilters`, `ListingDetailGallery`, and existing form components where possible.
- Keep Tailwind class strings readable and grouped by purpose.
- Do not paste large v0-style CSS blocks blindly.
- Do not replace working Supabase or business logic while integrating visual changes.

## Accessibility Basics

- Keep semantic HTML: links for navigation, buttons for actions, tables for tabular data.
- Maintain visible focus states.
- Ensure color is not the only state indicator.
- Use descriptive labels in Spanish.
- Preserve alt text and honest fallback text for listing images.
- Ensure mobile layouts do not overflow horizontally.

## Future UI Work Checklist

Before editing:
- Read this file and the relevant page/component code.
- Confirm whether the ticket is visual-only or includes product behavior.
- Identify existing data, queries, and actions that must be preserved.

While editing:
- Keep Spanish UI copy.
- Use yellow only for major CTAs.
- Use blue for interface state.
- Keep cards white with subtle borders/shadows.
- Comment placeholder-only UI.
- Do not add unsupported marketplace features.

Before finishing:
- Run `npm run lint`, `npm run typecheck`, and `npm run build` for code changes.
- Manually check mobile and desktop layouts when practical.
- Report changed files, checks run, how to test, and known limitations.
