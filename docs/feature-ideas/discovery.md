# Feature ideas: discovery batch

Ideas buy-05 (gift finder), disc-02 (buying guides and try-out checklists), disc-03 (collections), disc-04 (Hecho en
Perú, maker stores, made to order and the eleventh category) and disc-05 (gear from verified Peruvian artists). All five
were marked Yes by Henri on 2026-10-26. Branch `claude/project-thread-mb33rz`, PR into `features/marketplace`.

Nothing here is applied to a hosted database. Proposed decisions are numbered FD-discovery-n; acceptance proposals are
in `discovery-acceptance.tsv` (GROW-600 to GROW-630, Not Run).

## Migrations (slot 20261207)

| File | What | Redefines |
| --- | --- | --- |
| `20261207120000_feat_discovery_taxonomy.sql` | The category `andean` and its type `andean_instrument` | `public.listing_taxonomy_is_valid` |
| `20261207120100_feat_discovery_attribute_keys.sql` | The attribute `andean_type` | `public.listing_attribute_keys_are_valid` |
| `20261207120200_feat_discovery_search_text.sql` | Search words for the category, reindex, new synonyms (siku, zampoña, tinya…) | `public.listing_search_text` |
| `20261207120300_feat_discovery_saved_search.sql` | Saved alerts accept `andean` and `andean_type` | none: patches the live `laria_private.normalize_saved_search` in place |
| `20261207120400_feat_discovery.sql` | Five tables, their RPCs, policies and six starter collections | none |

The saved-search function is owned by listing-details and store-floor rebuilds it, so this batch does not redefine it.
The patch reads the current definition (`pg_get_functiondef`), inserts `'andean'` into the category list and
`'andean_type'` into the attribute list, and raises if either anchor moved. Whichever batch merges later still gets
both changes, and a moved anchor fails loudly instead of silently dropping one.

`listing_search_text` gets a `reindex` of `listings_search_text_trgm_idx` because the function is immutable and an
indexed expression.

## disc-04: Andinos y tradicionales, the eleventh category

**What changed.** A category "Andinos y tradicionales" (`andean`, page `/instrumentos/andinos`, strip label "Andinos")
with one type, "Instrumento andino" (`andean_instrument`), and its attribute "Instrumento" (`andean_type`): charango,
ronroco, bandurria, arpa andina, quena, quenacho, zampoña o siku, antara, pinkillo, tinya, bombo andino, wankara and
chajchas. The cajón stays in Percusión (hand percussion); the Andinos landing links to it.

It is added everywhere a category lives: the category list, the menus and the home strip, the filters, the SQL checks,
the store import aliases (Andinos, Folklore, Instrumentos andinos…), the search phrases ("charango" now opens this
category instead of Cuerdas), the brand aggregate, the category landing copy, sell guidance (shot list and starters),
the card spec line, the "¿Qué tocas?" interest and the sitemap and SEO smoke lists.

**Files.** `lib/listings.ts`, `lib/listing-submission.ts`, `lib/instrument-filters.ts`, `lib/category-nav.ts`,
`lib/listing-specs.ts`, `lib/sell-guidance.ts`, `lib/shell.ts`, `lib/category-pages.ts`, `lib/catalog-query.ts`,
`lib/catalog-brands-aggregate.ts`, `lib/store-import/rows.ts`, `components/home/home-for-you.tsx`, the four one-function
migrations above.

**Existing listings.** None move. A charango already published under Cuerdas stays there; the seller or Admin can move
it. Old links keep working.

- **FD-discovery-1.** The eleventh category is "Andinos y tradicionales" with one type and an `andean_type` attribute
  (the thirteen values above), instead of one type per instrument. Fewer, clearer choices for sellers; the attribute
  still filters precisely.
- **FD-discovery-2.** The cajón stays in Percusión, and "charango" searches open the new category.

## disc-04: Hecho en Perú, maker stores and made to order

**What changed.**

- A store declares itself **Fabricante** (makes instruments or gear in Peru, in series) or **Taller** (a luthier, by
  hand) with the city where it makes them, an optional story and the year it started, from Mi tienda → "Fabricante o
  Taller" (`/mi-cuenta/tienda/taller`). Turning it off clears the marks on its listings.
- On a maker's listing edit page, the owner can mark "Hecho a mano" and "Se hace a pedido: N semanas" (1 to 26).
- The listing page shows "Hecho a mano en Ayacucho" (taller) or "Hecho en Lima" (fabricante) and "Se hace a pedido: 6
  semanas", with "Lo declara la tienda. Laria no verifica cómo ni dónde se hizo el instrumento."
- The store page shows the maker's story. `/hecho-en-peru` lists the makers (verified stores first) with their newest
  handmade listings in stock, and links the Andinos category.
- Admin → "Fabricantes y talleres" lists every profile and can hide one with a reason (audited on the store); a hidden
  profile disappears from the page, the store page and every mark, and the owner cannot edit it until Admin restores it.

**Files.** `supabase/migrations/20261207120400_feat_discovery.sql` (tables `store_maker_profiles`,
`listing_maker_details`), `lib/discovery/makers.ts`, `components/discovery/store-maker-form.tsx`,
`listing-maker-fields.tsx`, `listing-maker-form.tsx`, `listing-marks.tsx`, `store-discovery-section.tsx`,
`admin-discovery-rows.tsx`, `app/hecho-en-peru/page.tsx`, `app/mi-cuenta/tienda/taller/page.tsx`,
`app/admin/fabricantes/page.tsx`, `app/api/discovery/*`, `app/api/admin/discovery/route.ts`.

- **FD-discovery-3.** Maker status is self-declared, shown with whose word it is, and Admin can hide it. Laria never
  certifies provenance.
- **FD-discovery-4.** Made to order is a listing of a concrete instrument with its price and photos plus a lead time.
  Deposits, delays and refunds are agreed outside Laria (terms line, pending legal review).
- **FD-discovery-5.** Particulars cannot be makers; only stores (a luthier opens a store, which is free).
- **FD-discovery-6.** The marks live in their own table, set from the edit page through `set_listing_maker_details`,
  not through the submission functions. They are not moderated: they are short fixed labels, Admin can hide the
  maker, and the listing itself is still reviewed.

## disc-05: gear from verified Peruvian artists

**What changed.** Admin → "Artistas verificados" records an artist on an existing account (by its e-mail) after
checking who they are: artistic name, page link (`/artistas`), optional story and https link, and a required note on
how the identity was checked, which goes to the audit only. The artist's listings may carry a short note on how the
gear was used ("Usada en la gira 2024", 3 to 140 characters), set from the edit page. The listing shows "Artista
verificado: Nombre" with the note and "Laria comprobó la identidad del artista. Lo que cuenta sobre el uso del equipo
es palabra de quien vende." `/artistas` lists the artists and their newest listings. Revoking removes the name, the
note and the page entry at once. Artists who want to be listed write to the legal contact address shown on the page.

**Files.** Table `artist_profiles`, `app/artistas/page.tsx`, `app/admin/artistas/page.tsx`, the shared discovery
components above.

- **FD-discovery-7.** "Verificado" means only that Laria checked the identity. The use story is the seller's word.
- **FD-discovery-8.** Artists apply by e-mail for now; there is no self-service form (it would need identity
  documents, which this batch does not collect).

## disc-02: buying guides and try-out checklists

**What changed.** `/guias` with nine guides: how to choose a first guitar and a first keyboard, and what to check in a
used guitar (also for basses), keyboard, drum kit, amplifier, pedal and microphone, plus "Cómo elegir un charango o una
quena". Each "what to check" guide is a checklist the buyer can tick on the phone while trying the instrument (kept in
the page only; nothing saved). A listing that is not sold links its guides under "Antes de ir a verlo" above the
questions. Guides are static pages, in the sitemap, with a share button.

**Files.** `lib/discovery/buying-guides.ts`, `components/discovery/tryout-checklist.tsx`, `listing-guide-link.tsx`,
`app/guias/page.tsx`, `app/guias/[slug]/page.tsx`.

- **FD-discovery-9.** Guides are code, not Admin content: they change rarely and need review. deal-trust's safe meetup
  sheet can link `/guias/<slug>` through `guidesForListing` in `lib/discovery/buying-guides.ts`.

**Needs review.** The guide text was written from general practice and should be read by a musician or luthier
before launch.

## buy-05: gift finder

**What changed.** `/regalos` asks for whom (niño o niña, principiante, guitarrista, bajista, baterista, tecladista,
cantante, productor o productora, música andina) and the budget (five bands up to "Más de S/ 2,500"), and shows real
listings for two or three sets per recipient (for example accessories and pedals for a guitarist), each with "Ver
todo" in the catalog, a tip and the questions to ask before buying. `/regalos/navidad`, `/dia-de-la-madre`,
`/dia-del-padre` and `/cumpleanos` are the same finder with occasion copy; there are no countdowns or "last days".
Stores can say they accept gift exchanges and for how many days (3 to 60) with a condition, from the same Mi tienda
page; `/regalos` lists those stores with "El cambio lo ofrece cada tienda, con sus propias condiciones. Confírmalo con
ella antes de comprar." The home row shows a "Para regalar" card.

**Files.** `lib/discovery/gift-finder.ts`, `components/discovery/gift-finder.tsx`, table `store_gift_policies`,
`app/regalos/*`.

- **FD-discovery-10.** The finder uses the catalog filters only; it does not rank or recommend beyond them.
- **FD-discovery-11.** The gift exchange is a store-level setting owned by this batch. If store-floor's returns
  policy covers it, the integrator can fold it in (see Overlaps).

## disc-03: collections

**What changed.** Admin → "Colecciones" saves a title, a short text (20 to 400 characters), optional start and end
dates, and one to four groups, each a name and a catalog link pasted from `/listados` (the query is stored and
re-validated). The home shows up to three current collections, then the "Para regalar" card; `/colecciones` lists all
current ones and `/colecciones/<slug>` shows each group's newest listings with "Ver las N". A collection is public only
while published and inside its dates (Lima's calendar). Six starter collections are seeded: Criollo y afroperuano,
Música andina, Banda escolar (1 Feb to 31 Jul 2027), Alabanza, Home studio and "Empieza con S/ 500".

**Files.** Table `collections`, `lib/discovery/collections.ts`, `components/discovery/collections-strip.tsx`,
`admin-collection-editor.tsx`, `app/colecciones/*`, `app/admin/colecciones/page.tsx`, `app/page.tsx`.

- **FD-discovery-12.** A collection is saved catalog filters, never a hand-picked list of listings, so it never shows a
  sold or hidden listing and needs no upkeep.
- **FD-discovery-13.** The home row has no feed and no "trending": up to three collections and the gift finder.

## Changes to other batches' and shared files

Each is one import or a few marked lines:

- `app/page.tsx`: the collections row after the price drops.
- `app/instrumentos/[slug]/page.tsx`: `ListingMarks` after the spec line and `ListingGuideLink` before the questions.
- `app/mi-cuenta/publicaciones/[id]/editar/page.tsx`: `ListingMakerFields` below the form. listing-details places it in
  the sell form later.
- `app/mi-cuenta/tienda/page.tsx`: `StoreDiscoveryLink` in a marked block.
- `app/tiendas/[slug]/page.tsx`: `StoreDiscoverySection` after the about section.
- `components/admin-navigation.tsx`: three links. `components/site-footer.tsx`: three links.
- `app/sitemap.ts`: guides, gift pages, makers, artists and current collections.
- `app/terminos/page.tsx`: four lines, all pending legal review.

## Overlaps for other batches

- **listing-details.** Made to order should become a writer in `laria_private.listing_detail_writers` once that
  registry is on `features/marketplace`; until then it is its own table and RPC, with no change to
  `complete_public_submission` or `update_owned_listing`. listing-details places `ListingMakerFields` in the sell form.
- **store-floor.** The gift exchange may overlap its returns policy. Mi tienda's discovery block is one link.
- **deal-trust.** Link the try-out checklists from the safe meetup sheet (`guidesForListing`).
- The saved-search patch must run after listing-details' and store-floor's rebuilds of `normalize_saved_search`. Its
  slot (20261207) is after both; if either rebuilds later, it must keep `'andean'` and `'andean_type'`.

## How to test

1. `bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh reset`, then `… test` (all suites,
   including `tests/feat-discovery.sql`).
2. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
3. On the prototype (after `demo-seed.sql`, load `scripts/prototype/discovery-seed.sql`: Taller Wayra, `taller@laria.test`,
   three andean listings, gift policies and Lucía Demo as an artist): open `/regalos`, `/guias`, `/colecciones`, `/hecho-en-peru`, `/artistas`; as a store owner, open
   Mi tienda → Fabricante o Taller, declare a taller, then mark a listing "Hecho a mano"; as Admin, hide the maker, edit
   a collection, verify an artist.

Screenshots at 390 and 1366 px: `/mnt/project-files/feature-ideas/screens/discovery/`.

## Limitations

- Existing charangos and quenas stay in their old category until moved.
- Guides and gift sets are written in code and need a musician's review.
- Gift exchanges and maker marks are the store's word; Laria shows whose word it is and nothing more.
- Collections show the newest listings of each group; they do not rank by relevance.

## Copy that needs legal review

- The four lines in `app/terminos/page.tsx` (made to order; Fabricante/Taller; Artista verificado; gift exchanges).
- The three disclaimers in `lib/discovery/makers.ts`.
- The artist e-mail invitation on `/artistas`.
