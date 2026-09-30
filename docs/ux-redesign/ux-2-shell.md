# UX-2 · Shell and navigation — brief

Approved by the owner on 30 Sep 2026, after UX-1 was accepted. Claude Code implements and audits it on `ux/redesign`. No product rule, route or query changes. Where this brief and the concept screenshots differ, this brief wins.

Visual reference (page concepts accepted 27 Sep), in `screenshots/page-concepts/`:
- `Catalogo-1440`, `Catalogo-390`: public header, category strip, breadcrumbs, slim footer.
- `Ficha-390`: phone header on a listing page.
- `Cuenta-1440`, `Cuenta-390`: signed-in header and the account frame.
- `Publicar-390`: header while publishing.
- `Admin-1440`: the Admin frame.
- Home header and full footer: `screenshots/home-final/R-Inicio-1440` and `R-Inicio-390`.

## Decisions (owner, 30 Sep)

| ID | Decision |
| --- | --- |
| N1 | Header "Vender" is the `onDark` outline button (white text, 1 px #4B5563 border, 36 px). Yellow stays for each page's own action. Audit item 5 |
| N2 | Remove the stray hairline from `app/logo-clear.svg`: its first `<path>`, a 1-unit stroked line at the artboard's left edge. The drawing, color and proportions of the mark don't change. Check `app/icon.svg` and `app/apple-icon.png` for the same line. Audit item 1b |
| N3 | Nothing sticky: the header scrolls with the page on every device |
| N4 | Phone: compact header, no bottom bar (as in the concepts) |
| N5 | Footer: full footer on the home; slim footer on every other public and account page; none in Admin (as in the concepts) |
| G1 | The catalog page is called "Instrumentos" in the header, footer, breadcrumbs and SEO title. The `/listados` URL stays. The copy test's "Listados" exception goes |

## Header

**Desktop (1024 px and up).** Black bar, 64 px tall, page gutters (32 px at 1440).
- Logo 36 px tall (68 px wide), linking to the home. Audit item 1.
- Search field 44 px tall, up to 680 px wide, 28 px after the logo. Placeholder "Marca, modelo o instrumento" (audit item 17). Submit button 36 px with the search icon. It submits to the catalog as today; no suggestions (that would be new behavior).
- Right side, 8 px apart: "Vender" (N1), then the account entry.
  - "Vender" keeps today's destinations and store-owner labels ("Publicar", "Solicitud de tienda").
  - Signed out: "Ingresar" (icon + text).
  - Signed in: a bell linking to Notificaciones, with `CountBadge` only if an unread count already exists; then the avatar with initials + "Mi cuenta", which opens the account menu.
- "Para tiendas" leaves the header (the D8 glossary retires it as a sell entry). Stores reach `/registro/tienda` from `/vender` and from the footer.
- The last item's visible edge sits on the 32 px gutter, like the logo on the left: pull its 10 px padding out. Audit item 10.

**Category strip** (public pages except the home, 1024 px and up).
- White, 48 px, 1 px `line` bottom border.
- "Instrumentos" (all listings) first, then the top-level categories in taxonomy order, "Tiendas verificadas" at the right.
- 14 px / 600, 26 px apart. Current item: 3 px blue underline + `aria-current`.
- Not on account or Admin pages.

**Tablet (768–1023 px).** Same bar; the search shrinks first. Below 900 px, "Ingresar" and "Mi cuenta" become icons with accessible names. The strip scrolls sideways.

**Phone (below 768 px).** Black bar, 56 px, 16 px gutter.
- Logo 32 px tall (61 px wide). Audit item 1.
- Right: "Vender" (N1) and the account icon, 44 px targets. Signed in: "Vender", bell, avatar.
- Browse pages (catalog, categories, search results, stores): a search row under the bar (44 px field, same placeholder), then the category strip (44 px, sideways scroll, 20 px apart, 14 px / 600, current item in ink with the blue underline).
- Listing page: no search row; a search icon in the bar opens it. A back link to the parent category replaces the breadcrumb ("‹ Baterías acústicas").
- While publishing: logo and account icon only.

**Account menu** (desktop "Mi cuenta", phone avatar).
- A disclosure menu with the same sections, order and counts as the account rail (from `lib/account-navigation.ts`), plus "Admin" for admins, then a divider and "Cerrar sesión".
- `shadow-level-1`, 8 px radius, 44 px rows on phones.

**Home header** (ships with UX-3, together with the banner search).
- Logo, then "Categorías" (a disclosure menu with "Todos los instrumentos" and the categories), "Tiendas verificadas" and "Cómo funciona"; then "Vender" and the account entry.
- Until UX-3 ships, the home keeps the standard header so search is never missing.

## Breadcrumbs

- **Desktop and tablet**, under the strip: "Inicio / Instrumentos / Baterías / Acústicas / <title>".
  - 13 px. Links in `ink-2` with a `line-deco` underline; the current page in `ink`, not a link.
  - 12 px above the page title.
- **Phone:** only the back link to the parent.
- Structured data keeps its shape; only the "Instrumentos" name changes.

## Page frames

- **Public:** `PageContainer` from UX-1 (1440 px max, 16 / 24 / 32 px gutters).
- **Account, desktop:** a 248 px rail, 40 px gap, content on the right. Page content itself is UX-6.
  - The rail holds the name, "role · city", the sections, a divider and "Cerrar sesión".
  - Sections carry `aria-current`; the active row sits on `canvas` with a 3 px blue bar; counts use `CountBadge`.
- **Account, phone:** a switcher row under the header ("Mi cuenta · <section>") that opens the same list.
- **Admin:** a 240 px black sidebar, content on `canvas`. Workbench content is UX-7.
  - The sidebar holds the logo at 28 px with an "ADMIN" micro label, the sections with counts, and the admin's name and role at the bottom.
  - Below 1024 px the sidebar becomes a black bar with a menu button.

## Footer

- **Full (home):** four columns as on `R-Inicio-1440` (brand + promise, Explora, Vende, Ayuda y legal).
  - Logo 28 px, column headings as micro labels, 14 px links.
  - Base row: "© 2026 Laria" / "Hecho en Perú".
  - Phone as on `R-Inicio-390`: logo 24 px, links in two columns, the promise line.
  - Link only to pages that exist; "Listados" becomes "Instrumentos".
- **Slim (every other public and account page):** one row with "© 2026 Laria · No cobramos comisiones ni procesamos pagos." and "Consejos de seguridad · Términos y reglas · Privacidad". Two lines on phones.

## 404 and 500

- Standard header and slim footer.
- A centred 560 px column holding:
  - a `t-page` title: "No encontramos esta página" / "Algo salió mal";
  - one line: "Puede que la dirección esté mal o que la publicación ya no esté disponible." / "Vuelve a intentarlo en unos minutos.";
  - the search field;
  - two links: "Ir al inicio" · "Ver instrumentos".
- No illustration.
- The 500 page is new (`app/error.tsx`); the 404 page restyles `app/not-found.tsx`.

## Global rule

Headings and lead paragraphs use `text-wrap: balance`; body paragraphs use `text-wrap: pretty`, as a progressive enhancement. Audit item 14.

## Behavior and accessibility

- Menus are disclosure buttons (`aria-expanded`). Enter and Space open them; Esc closes and returns focus. One menu open at a time.
- The skip link stays first. Tab order follows the visual order. Focus is visible on dark and light surfaces.
- `aria-current` on the current strip item, rail item and breadcrumb.
- Menus open with at most a 120 ms opacity change; nothing moves under `prefers-reduced-motion`.
- No horizontal page scroll at 390 px (only the strip scrolls). 200% zoom holds. The shell adds no layout shift.

## Out of scope

- Home content (UX-3).
- Search suggestions (new behavior).
- Filters and sort (UX-3).
- Listing and store content (UX-4).
- Account page content (UX-6).
- The Admin workbench (UX-7).
- Any URL change.

## Acceptance criteria

1. Header, strip, menus, breadcrumbs, frames, footers, 404 and 500 match this brief at 390 / 768 / 1280 / 1440, signed out and as Particular, Store Owner and Admin.
2. N1–N5 and G1 applied; visual audit items 1, 1b, 5, 10, 14 and 17 applied with the values above.
3. "Listados" no longer appears in the interface, and "Para tiendas" is gone from the header. Tests are updated without weakening them.
4. The keyboard walk and axe on the 8 harness templates show no regressions against UX-1.
5. Before/after captures with `scripts/ux-snapshots.cjs`; selected frames in `screenshots/ux2-before/` and `screenshots/ux2-after/`.
6. `pnpm lint`, `typecheck`, `test` and `build` pass.
7. `docs/design-system.md` is updated (logo sizes, header button rule, category strip, breadcrumbs, frames, footers, text-wrap rule) and `ux-2-acceptance.md` is written.

## Doc updates (first commit)

- This file and `home-visual-audit.md` are already in `docs/ux-redesign/`: commit them.
- `README.md`: UX-1 accepted (owner, 30 Sep); UX-2 in implementation; add rows for both files.
- `ux-1-acceptance.md`: status "Accepted by the owner, 30 Sep".
- `decisions.md`: UX-1 accepted on 30 Sep; N1–N5 decided; G1 decided ("Instrumentos", `/listados` URL unchanged).
- `roadmap.md`: under the table, add "Each sub-sprint also applies its items from `home-visual-audit.md` (table "By sub-sprint")."
