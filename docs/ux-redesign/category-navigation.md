# Detailed category navigation (catalog-backed)

Branch `ux/catalog-category-nav-0ueck4`, built on `ux/redesign` on 10 Oct 2026 while the owner was away. Draft for
review; every choice below is provisional and listed in `decisions.md` (CN1–CN6).

Owner's ask (10 Oct): use the instrument catalog in production to make the category navigation much more detailed,
in the spirit of reverb.com's menus (Guitarras only offered "Guitarras eléctricas", "Guitarras acústicas" and "Otro").
`functional-spec.md` § "Category navigation enrichment" describes the long-term tree (subcategories, brands, product
lines and models, catalog Spanish labels); this is a first step towards it that only uses destinations the catalog
page can already filter.

## What a buyer sees

- **Strip panel, from 768 px** (`components/global-categories.tsx`): the category and "Ver todos", the "Tipos" list
  (unchanged destinations), one column of subtypes per instrument type (Strat, Tele, Les Paul, SG, Offset,
  Superstrat, Semihuecas, Huecas, Para zurdos; Clásicas, Acústicas, Electroacústicas, Dreadnought…; for single-type
  categories the column is called "Explora"), and a "Marcas" column with the category's eight leading catalog brands
  and "Ver todas las marcas".
- **Strip panel, phones**: the compact list as before plus the first five brands and "Ver todas las marcas"; the
  subtype columns are left out (CN3).
- **Category landing** (`components/category-landing.tsx`): a new "Explora <categoría>" section under the results,
  with every type's subtypes as chips and every catalog brand of the category, A–Z (`#marcas`).
- The home "Categorías" menu and the Admin "Explorar categorías" accordion are unchanged (types only).

Screenshots (local build; the brand lists in them are a fixture because this environment cannot reach the production
catalog): `screenshots/category-nav/`.

## Where the links go

Every link is an existing catalog URL; no route, query or rule is new.

- Subtype: `/listados?category=…&instrument_type=…&<attribute>=<value>`, the listing attribute filters the catalog
  sidebar already offers (`lib/category-nav.ts`, `subtypeValues`). A value the type's filters stop listing is dropped
  from the menu, so a link can never be a filter the catalog ignores (tested).
- Brand: `/listados?category=…&brand=<catalog brand name>`, the existing brand filter (`brand ILIKE '%name%'`).

## Where the brands come from

`lib/catalog-brands.ts` (server only) reads the public, read-only catalog tables with the anon key:
`catalog_categories` mapped to a listing category (`laria_category`), current model-level products that are not
quarantined (`superseded_at is null`, `entity_level = 'model'`), and `catalog_manufacturers`. Brands are ranked by
how many catalog models they have in the category (`lib/catalog-brands-aggregate.ts`). The result is cached for a day
(`unstable_cache`), each request gives up after 4 s, and any failure returns no brands: the menus then show subtypes
only. Nothing is written, no migration, RLS or type file changes. The root layout reads it for the strip; the
landing reads it for its brand list.

## Known limits

- Subtype links match only listings whose seller filled that attribute (attributes are optional today); catalog
  autofill should raise coverage.
- Brand links match the listing's brand text; a catalog spelling the seller wrote differently ("Electro Harmonix")
  does not match.
- Brand and subtype pages can be empty: they show the catalog's normal empty state with "Crear alerta" (CN2).
- Not verified against production data from this environment (no network access to the hosted project). First check
  after deploying a preview: open a strip panel and a landing and confirm the brand lists look right.
- Pages that were fully static (legal pages, sign-in…) now regenerate daily, since the shared shell reads the
  day-cached brand list.
