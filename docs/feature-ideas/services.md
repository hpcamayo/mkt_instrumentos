# Feature ideas: services batch

Idea bet-02, "Lessons, repairs and studios", shown as «Servicios para músicos». Henri marked it Yes on 2026-10-26 with
the note "love this. we shouldnt mix service listings with items though." Branch `features/services`, draft PR into
`features/marketplace`.

Nothing here is applied to a hosted database. Proposed decisions are numbered FD-services-n; acceptance proposals are
in `services-acceptance.tsv` (GROW-700 to GROW-735, Not Run).

## Migration (slot 20261208)

| File | What | Redefines |
| --- | --- | --- |
| `20261208120000_feat_services.sql` | Five tables, the `service-photos` bucket and its policies, the RPCs, and additive entries in the shared notice, e-mail and audit registries | none |

Every function in the migration is new (`public.*service*`, `laria_private.*service*`). Shared lists are extended in
place with the existing helpers, never rewritten:

- `notifications_event_type_check` through `laria_private.ux_extend_text_check` (seven `service_*` types).
- `notifications_target_check` gets an appended branch, `or (event_type like 'service\_%' and service_id is not null)`,
  so it works whatever the other batches add, in any merge order.
- `marketplace_email_deliveries` types and the `marketplace_email_context_check` keys (`service_title`,
  `service_path`), rebuilt from `laria_private.check_constraint_values` plus the new values.
- The Admin audit target types get `service`, `service_review` and `service_report`.

No migration touches `listings`, `favorites`, `saved_searches` or any listing table, and no catalog function reads the
new tables. `tests/services.test.cjs` checks both directions.

## bet-02: Servicios para músicos

### What changed

**A separate section, `/servicios`.** Five kinds, each with its own page:

| Kind | Page | Priced per | Where | Skills (filter "Qué enseña" / "Qué repara") |
| --- | --- | --- | --- | --- |
| Clases de música | `/servicios/clases` | clase, hora, mes | En su local, A domicilio, En línea | guitarra, bajo, batería, piano, canto, cuerdas, vientos, andinos, ukelele, producción, teoría |
| Luthería y reparaciones | `/servicios/reparaciones` | trabajo, hora | En su taller, A domicilio | guitarra, bajo, batería, piano, cuerdas, vientos, andinos, ukelele, amplificadores, pedales, audio |
| Salas de ensayo | `/servicios/salas-de-ensayo` | hora, sesión | En su local | none |
| Estudios de grabación | `/servicios/estudios-de-grabacion` | hora, sesión, canción | En su local, En línea | none |
| Sonido para eventos | `/servicios/sonido-para-eventos` | evento, hora, día | En tu evento | none |

The directory shows every approved service (a store's only while the store is active) as cards with
the kind, title, provider and badge (Particular, Tienda, Tienda verificada), "Desde S/ N por …", place, where it
happens and the rating. Filters are chips: kind (with counts), Ciudad (the cities with services, once there is more than one), Dónde, the skill
(inside a kind) and Orden (Más recientes, Mejor valorados, Menor precio). 24 per page with numbered pages. Unknown
filter values are dropped, filtered pages are `noindex, follow`, and a page past the last redirects to the last.

**A service page** (`/servicios/<kind>/<slug>`): photos (up to six), Detalles (where, price, skills, zones, city),
the description, reviews with the star breakdown (five shown, "Ver más reseñas" loads the rest), the provider card
(avatar or store logo, badge, "En Laria desde"), "Contactar por WhatsApp" with a prefilled message naming the service
and its page, the limitation line, "¿Contrataste este servicio?" and "Reportar servicio". The owner and Admin see a
preview of a service that is not public, with a notice; everyone else gets a 404.

**Offering a service** (Mi cuenta › Servicios › Ofrecer un servicio): pick the kind, then one form: title, name shown
(a store's services always use the store name), description, starting price and unit, where, skills, city, region,
district, zones (up to twelve), WhatsApp (prefilled from the profile) and photos. One service per kind per account.
Nothing is pre-chosen except where a kind allows one place only. Contact details in the text are refused, as on
listings. Photos are redrawn in the browser (no GPS data) and uploaded into the account's own folder.

**Moderation.** A new service waits in Admin › Servicios › Por aprobar. Admin approves or rejects with a reason the
owner sees. Changes to an approved service apply at once; when the title, description, name or photos change, it also
lands in "Cambios por revisar" while it stays public, and Admin marks it fine or hides it with a reason. A hidden or
rejected service goes back to Por aprobar when the owner saves it again. Reports on services and on their reviews have
their own queue; closing a report never moderates by itself. Every decision is audited, applies only to the version
Admin saw, and notifies the owner in the app (and by e-mail for approval, rejection and hiding).

**Mi cuenta › Servicios.** The account's services with their state, Admin's reason, views and WhatsApp contacts in the
last 30 days and the rating; Ver página or Vista previa, Editar, Confirmar un cliente, Pausar or Reanudar, Eliminar.
A service with confirmed clients or reviews can be paused but not deleted, so reviews are never wiped. Contrataciones
lists both sides of every confirmation.

**Reviews after a confirmed booking.** Either side starts it:

- The client, on the service page, presses "Sí, lo contraté". They must have written through Laria's WhatsApp button
  with their account in the last 180 days.
- The provider, in "Confirmar un cliente", picks one of the people who wrote that way (first name and initial, date of
  the last contact, last three digits of their number). Nobody is preselected.

The other side answers yes or no; a request lapses after 30 days. A confirmed client has 30 days to leave one review
(1 to 5 stars, optional comment), shown with their first name and initial. Reviews are never edited; Admin can hide one
with a reason.

**Not mixed with instruments.** Separate tables, RPCs, pages, cards and Admin queue. Services never appear in the
catalog, the instrument search, listing counts, saved alerts, favorites or the store's listing allowance.

**Entry points from the instrument side** (follow-up PR). They link to the section and never show a service among
instruments:

- The home header's Categorías menu (the same panel is the phone menu) ends with "Servicios para músicos", after
  "Tiendas verificadas".
- The home, under the category chips: one bordered row with "Servicios para músicos", up to four kinds that have
  services (most first) with their counts, and "Ver servicios". Left out while no service is public.
- A listing marked Bueno, Regular or Para reparar (worn or broken gear) and still for sale shows one quiet line after
  the description: "¿Necesita un ajuste o una reparación?" (or "¿Lo vas a reparar?") "Ver luthiers y talleres", only
  while someone offers repairs.
- The counts come from `lib/services-counts.ts`, shared for five minutes, so neither the home nor a listing page adds
  a query per view.

**Wiring.** Footer (Explora: Servicios para músicos; Vende: Ofrecer un servicio; the phone grid's eighth cell), the
account menu ("Servicios", after Estadísticas, for Particulars and for store owners with a store), Admin navigation,
in-app notices and e-mails, the shared report form, the sitemap (the section, five kinds and every public service, up
to 5,000), Terms, Privacy and Artículos prohibidos.

### Files

- Database: `supabase/migrations/20261208120000_feat_services.sql`, `tests/feat-services.sql`.
- Library: `lib/services.ts` (vocabulary, URLs, filters, form checks, readers, errors), `lib/services-db.ts`,
  `lib/services-metadata.ts`.
- Pages: `app/servicios/page.tsx`, `app/servicios/[categoria]/page.tsx`, `app/servicios/[categoria]/[slug]/page.tsx`,
  `app/mi-cuenta/servicios/page.tsx`, `app/mi-cuenta/servicios/nuevo/page.tsx`,
  `app/mi-cuenta/servicios/[id]/editar/page.tsx`, `app/admin/servicios/page.tsx`, `app/api/services/events/route.ts`.
- Components: `components/services/*` (card, directory, contact and view recording, hire panel, review form, reviews,
  my services, bookings, form, Admin queue, entry points), `components/legal/services-legal.tsx`; `lib/services-counts.ts`.
- Shared files, small marked edits ("feature-ideas services (bet-02)"): `lib/ui/status.ts`,
  `lib/account-navigation.ts`, `components/admin-navigation.tsx`, `lib/notifications.ts`, `lib/email/templates.ts`,
  `components/content-report.tsx`, `components/content-report-form.tsx`, `components/site-footer.tsx`,
  `app/sitemap.ts`, `app/terminos/page.tsx`, `app/privacidad/page.tsx`, `app/articulos-prohibidos/page.tsx`,
  `scripts/prototype/start-docker-free.sh`, `scripts/prototype/README.md`; follow-up: `components/site-header.tsx`
  (one menu row), `app/page.tsx` (the teaser), `app/instrumentos/[slug]/page.tsx` (the repair line),
  `tests/ux-shell.test.cjs` (the pinned menu) and `tests/ux-home.test.cjs` (a mock for the counts).
- Tests pinned to shared navigation, updated for the new "Servicios" entry: `tests/account-shell.test.cjs`,
  `tests/sprint-9.test.cjs`, `tests/store-ops-review-ux.test.cjs`, `tests/ux-shell.test.cjs`; the report target type in
  `tests/sprint-8.test.cjs`. New: `tests/services.test.cjs`.
- Prototype: `scripts/prototype/services-seed.sql`, `scripts/prototype/services-screens.cjs`.

### How to test

1. Local database: `bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh reset`, then
   `... test` (runs `tests/feat-services.sql` with the other suites).
2. `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
3. Prototype: `bash scripts/prototype/start-docker-free.sh seed` (loads `services-seed.sql`), `pnpm dev`, then:
   - `/servicios` and each kind; filter by city, place and skill; sort by rating and price.
   - A service page signed out (contact button, "Ingresa para reportar"), as `comprador@laria.test` (a confirmed lesson
     to review; a request from the store to answer in Mi cuenta › Servicios › Contrataciones) and as
     `particular@laria.test` (the owner: Confirmar un cliente, Pausar, Editar).
   - `admin@laria.test`: Admin › Servicios, approve the sound service, mark the studio's changes fine, close the report.
4. Screenshots and axe: `node scripts/prototype/services-screens.cjs <out-dir>` (48 checks at 390 and 1366 px). The
   build session's run is in `/mnt/project-files/feature-ideas/screens/services/` with `results.json`: no axe
   violations and no page errors.

### Decisions (proposed)

- **FD-services-1. Five kinds, fixed vocabularies.** Kinds, units, places and skills are fixed lists, kept in step
  between `lib/services.ts` and the migration (a unit test compares them). Adding a kind needs a migration.
- **FD-services-2. One service per kind per account.** A studio that rents rooms and records has two services. Keeps
  the directory honest and the moderation queue small.
- **FD-services-3. Stores offer services as the store.** A store owner needs a store request first; the service shows
  the store's name, logo and verification and links to it. A Particular names themselves or their project.
- **FD-services-4. Moderation before publication; post-moderation of edits.** New services wait for Admin. Edits to
  title, description, name or photos stay public and go to "Cambios por revisar"; price, places, skills, zones and
  WhatsApp edits apply without review. Saving a rejected or hidden service sends it back to Por aprobar.
- **FD-services-5. "Desde" price in whole soles, 1 to 100,000, with a unit.** It is a reference, said so on the page;
  the parties agree the final price.
- **FD-services-6. Contact through WhatsApp only, recorded like listing contacts.** A view counts once per person or
  session per 30 minutes; every press is a contact, at most 20 per person and service a day. The owner's and Admin's
  own visits never count. The figures shown to the owner are aggregate.
- **FD-services-7. Confirmed booking from either side, 180-day contact window, 30-day answer, 30-day review.**
  Mirrors the listing transaction flow (Sprint 6). At most 30 confirmation requests per account a day. A declined pair
  is not offered again to the provider.
- **FD-services-8. Reviews are permanent; deletion is not.** A service with confirmed clients or reviews cannot be
  deleted, only paused.
- **FD-services-9. Separate section, never mixed.** Services have their own tables and pages and never appear in
  instrument search, listing counts, alerts, favorites or the store's listing allowance (Henri's note).
- **FD-services-10. Entry points.** Footer, account menu, Admin menu and sitemap; then (follow-up PR, agreed with the
  integrator) the home header's Categorías menu, which is also the phone menu, a home teaser and one repair line on
  worn gear. Never the category strip, so services do not read as items.
- **FD-services-11. Photos.** Public bucket `service-photos`, 5 MB, JPEG/PNG/WebP, uploaded into the owner's folder;
  the owner can remove only photos no service uses, so a photo still on a service (even a hidden one) stays.

### Limitations and follow-ups

- **Not in the category strip** on purpose (FD-services-10), so pages other than the home reach services through the
  footer, the account menu and the repair line.
- **No line on results pages.** A line among instrument results read as mixing; only the listing page has one.
- **No provider reply to reviews**, unlike store reviews; a later step.
- **No booking calendar, quotes or availability.** By design: Laria does not schedule or charge.
- **No full-text search inside services**; the filters cover kind, city, place, skill and order.
- **Admin sees no diff for "Cambios por revisar"**, only the current version and when it changed.
- **No services badge in the account menu** for confirmations waiting; the in-app notice and e-mail cover it.
- **Photos removed by an edit** are deleted by the browser right after saving (best effort). A cleanup job for photos
  uploaded to a form that was never saved is not built (same gap as abandoned listing drafts).
- A React hydration warning (#418) appeared twice during the first screenshot runs of the production build (signed
  in, on a service page) and could not be reproduced afterwards: not in development, not in about 100 later signed-in
  loads of the service page, a listing, Mi cuenta and the catalog. Noted, not fixed.

### Environment and schedules

None. No new environment variables, no scheduled jobs (pending confirmations lapse lazily), no outside services. The
e-mails use the existing queue and `MARKETPLACE_EMAIL_PROVIDER`.

### Copy for legal review

Draft, to be settled before launch, together with the section numbers and `LEGAL_LAST_UPDATED` in
`lib/legal-pages.ts`:

- Terms § "5 bis. Servicios para músicos" (`components/legal/services-legal.tsx`): what the section is; moderation; the
  provider's responsibility (permits, licences, titles, receipts, the work); Laria does not verify, schedule, charge or
  take part; the "desde" price is a reference; confirmed booking and 30-day reviews; minors in lessons ("acompáñala…
  Laria no revisa antecedentes"); what is not allowed.
- Privacy § "4 ter. Servicios para músicos": what is stored and public, contact records, what the provider sees of a
  person who wrote (first name and initial, date, last three digits of the number, for 180 days), reviews, reports, and
  deletion.
- Artículos prohibidos: the services line now points to Servicios para músicos ("no como publicaciones").
- On the service page: "Acuerda el precio, el horario y el pago directamente con quien ofrece el servicio. Laria no
  cobra, no recibe pagos y no verifica títulos, experiencia ni la calidad del trabajo."
- The hire panel and Mi cuenta: "Confirmar habilita la reseña; Laria no verifica el pago, la calidad del trabajo ni los
  títulos de quien ofrece el servicio."
