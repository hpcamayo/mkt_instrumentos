# Sub-sprint roadmap

Eight sub-sprints, grouped by UX system and journey, not by file. Each has an approval gate before implementation and an acceptance gate after. Nothing starts automatically.

| # | Sub-sprint | Goal | Major surfaces | Depends on | Owner decisions expected | Risk / size |
| --- | --- | --- | --- | --- | --- | --- |
| UX-1 | **Foundations** | One visual and content language, applied everywhere through shared primitives; contrast and focus fixed product-wide; public placeholders removed | Tokens (`globals.css`, `tailwind.config.ts`), font, primitives (Button, Field, Tag/Status, Chip, Notice, EmptyState, PageHeader, Price, VerifiedMark), glossary + status dictionary, orthography sweep, favicon/email colors, skip link, screenshot harness, `docs/design-system.md` rewrite | Sprint 9 accepted | Typeface, blue-as-text policy, derived tones, shape language, base size, uppercase, WhatsApp CTA, glossary, touchpoints | Medium-high: global, wide diff, no layout changes |
| UX-2 | **Shell and navigation** | Compact, fast frame on every device; search always reachable; categories as the main browse path | Header (phone/tablet/desktop), search entry and suggestions UI, category nav (strip + menu), account menu and badges, footer, breadcrumbs, page frames (public/account/Admin), 404/500 | UX-1 | Mobile nav pattern (compact header vs bottom bar), place of "Vender", sticky behavior, footer content | Medium |
| UX-3 | **Discovery** | Browsing and comparing gear fast | Home (marketplace-first), catalog/search results, category landings, filters (sidebar + sheet), applied chips, sort, pagination/"Ver más", the one listing card (grid + list), empty/no-results/loading | UX-1, UX-2 | Home composition (decided 30 Sep, H1–H11), card fields per category, live vs apply filters, load-more vs pages (keeping `?page=N`), photo aspect ratio | High: highest traffic, SEO-sensitive |
| UX-4 | **Listing and store pages** | Confident decision and trustworthy contact | Gallery + lightbox, identity/price/condition block, contact module + sticky phone bar, safety note, seller/store module, spec table, description, reviews display, related listings, sold/hidden/owner views, store page, report entry points | UX-3 (card) | Gallery layout, sticky bar, public view counter, one trust statement, store page content | Medium-high |
| UX-5 | **Selling** | A clear path to a complete, attractive listing | Sell entry (`/vender`), create flow (taxonomy, attributes, photos, price, location, contact), validation and error summary, submit and confirmation, edit and "cambios en revisión", relist | UX-1, UX-4 (what a listing shows) | One page vs steps, photo guidance, condition help text, draft behavior (a behavior change) | High: forms + photo handling |
| UX-6 | **Accounts** | Coherent workspaces for Particular and Store Owner; onboarding | Login/signup/store application/invites/password; account shell; Resumen as a to-do list; Mis publicaciones and Inventario (responsive list); Favoritos; Alertas; Notificaciones; Compras y ventas + reviews; Perfil y seguridad; Mi tienda; Estadísticas | UX-1, UX-2, UX-5 | Dashboard content, naming of transactions area, statistics scope | High; may split into 6a onboarding + Particular and 6b Store |
| UX-7 | **Admin workbench** | Moderation throughput and safety | Queue IA, split list/detail with inline photos and change diffs, dense tables, action hierarchy and confirmations, stores/users/reports/reviews/transactions/legacy linking, audit history | UX-1 (+ table/list primitives from UX-6) | Queue layout, confirmation policy, whether bulk actions are allowed (a behavior change) | Medium-high |
| UX-8 | **Coherence and hardening** | Nothing inconsistent, inaccessible or slow is left | Cross-product consistency sweep, final microcopy pass, keyboard/screen-reader/200–400% zoom audit, Core Web Vitals on key templates, harness baseline refresh, final docs, Codex handoff | All | Final acceptance | Medium |

Each sub-sprint also applies its items from `home-visual-audit.md` (table "By sub-sprint").

Sequencing: UX-1 → UX-2 → UX-3 → UX-4 → UX-5 → UX-6 → UX-7 → UX-8. Admin (UX-7) could move earlier if moderation volume requires it; that is an owner call.

## Repo setup (Sprint 9 closed, 30-09)

Sprint 9 is closed (owner, 30-09). Its final head is `main` at `49a38e5`, also on GitHub; the sprint docs in the repo don't record the closure yet (SEO-006, SEO-007, LEGAL-005 and LEGAL-006 still Not Run).

- `ux/redesign` branches from `49a38e5`. Its first commit adds this folder and the screenshot harness.
- The branch lives in a separate clone, never in the owner's checkout, which has the catalog branch (`catalog/canonical-catalog`) checked out with uncommitted parallel work. Never touch that branch. JEV is out of scope.
- Each sub-sprint branches from `ux/redesign` and is rebased on the current `main` before its acceptance package and before merge.
- Nothing is pushed, merged or deployed without the owner's go-ahead; production deploys keep their own release gate.

## Product-behavior flags (owner decisions, never silent)

| Flag | Where it surfaces | Note |
| --- | --- | --- |
| Relist slug growth (`-republicado-<hash>` per relist) | UX-4/UX-5 | URL/SEO behavior |
| Condition scale (3 grades) vs a gear-specific scale with definitions | UX-4/UX-5, later canonical DB | Data model change |
| Public "Visto N veces" | UX-4 | Hide below a threshold or show only to the owner |
| "Nuevo" condition limited to stores | UX-5 | Product rule |
| Safety step before the first WhatsApp contact | UX-4 | Adds a step to seller-contact semantics |
| Draft autosave in the sell flow | UX-5 | New behavior |
| Admin bulk actions | UX-7 | Authority/audit implications |
| "Load more" vs numbered pages | UX-3 | Keep crawlable `?page=N` either way |
