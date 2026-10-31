# Running the Store Operations prototype locally

Everything here is local. Nothing reads hosted Supabase settings, sends e-mail or WhatsApp messages, or touches
production. Branch: `store-ops/prototype`.

## On a Mac with local Supabase (Docker)

The usual Laria setup (`docs/ux-redesign/review-guide.md`): Docker Desktop and the Supabase CLI.

`supabase/config.toml` is not tracked in this repository; use the one from your existing local setup. To keep a review
stack apart from your own, work in a separate worktree and give its `config.toml` another `project_id` and ports (for
example API 56421, DB 56422), then use those ports below.

```sh
git fetch origin store-ops/prototype && git switch store-ops/prototype
pnpm install
supabase start                       # local stack on 127.0.0.1:54321 (API) and :54322 (Postgres)
supabase db reset                    # every migration, then supabase/seed.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f scripts/prototype/demo-seed.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f scripts/prototype/ux-my-listings-seed.sql
```

The second file adds the Effortless Laria account home's data (Pendientes, check-ins, drafts).

`.env.local` (values from `supabase status`):

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
MARKETPLACE_EMAIL_PROVIDER=log
LARIA_ASSISTED_COMMERCE=1            # shows the PAY-1 pilot; leave it out to see the default (off)
```

Then `pnpm dev` and open http://localhost:3000.

## Without Docker (Linux x64, as the cloud build sessions do)

1. Postgres 16 with the migrations: `bash /mnt/project-files/store-operations/local-db-setup/setup-local-db.sh setup`
   (or `reset` for a clean replay), from the repository root, as root.
2. `bash scripts/prototype/start-docker-free.sh seed` loads `supabase/seed.sql` and the demo seed, downloads PostgREST
   12.2.3 if needed, starts it on :3001 and `local-gateway.cjs` on :54321, and writes `.env.local` if missing.
3. `pnpm dev`.

`local-gateway.cjs` stands in for the Supabase API with the parts Laria uses: `/rest/v1` (PostgREST), password
sign-in, refresh, `getUser` and logout against `auth.users`, and Storage on the local disk. There is no e-mail, OTP,
sign-up or invite; use the seeded accounts.

## Demo accounts and data

Password for all: `laria-demo-2026`.

| Account | What to look at |
| --- | --- |
| `demo-tienda@laria.test` | Owner of "Laria Demo Música" (verified, inventory enabled). Mi tienda → Inventario, a SKU page, Importar desde Excel, Medios de pago. |
| `admin@laria.test` | Admin → Medios de pago (one method waiting for review), Tiendas. |
| `comprador@laria.test` | Buyer with two favorites. |
| `particular@laria.test` | Particular seller with listings, drafts and Pendientes on the account home (Effortless Laria); Store Operations changes nothing for them. |

Public pages: `/tiendas/laria-demo-musica`, `/instrumentos/demo-boss-ds-1` ("Solicitar compra" with the pilot on),
`/instrumentos/demo-boss-tu-3` (Agotado).

The demo store has 12 SKUs (8 linked to approved listings, one at zero stock, one low), a few days of movements and
four payment methods (three approved). `scripts/prototype/demo-import.csv` is a semicolon-separated file with
merchant-style headings, two updates, three new SKUs and four rows that fail validation on purpose.

## Effortless Laria

The `ux/effortless` build (`docs/ux-effortless/integration.md`) runs on the same stack and demo data. A few parts need
more than the stack:

- **Push notices** (`docs/ux-effortless/speed.md` § big-12) show their switch in Mi cuenta > Notificaciones only with
  a key pair: `node scripts/generate-vapid-keys.mjs` prints `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` for
  `.env.local`. The service worker registers in production builds only (`pnpm build && pnpm start`). Nothing runs
  the worker on a schedule; send pending notices with
  `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/push/process`. Without keys the
  worker only logs.
- **Installing and sharing photos into Laria** need HTTPS and a phone, so they are checked on a preview deployment,
  not here.
- **E-mails** (alerts, price drops, reminders) are logged, as before (`MARKETPLACE_EMAIL_PROVIDER=log`); the e-mail
  worker is started the same way, at `/api/internal/email/process`.

## Servicios para músicos (feature ideas, bet-02)

`scripts/prototype/services-seed.sql` (loaded by `start-docker-free.sh seed`, or by hand after `demo-seed.sql`) adds
five services and two accounts, `estudio@laria.test` and `sonido@laria.test`. Look at `/servicios`, a service page,
Mi cuenta › Servicios as `particular@laria.test` (a lesson with a review) or `comprador@laria.test` (a confirmation to
answer and a review to write), and Admin › Servicios as `admin@laria.test` (one new service, one with changes, one
report). Details: `docs/feature-ideas/services.md`.

## Deal-trust (feature ideas)

`scripts/prototype/deal-trust-seed.sql` (`docs/feature-ideas/deal-trust.md`) gives the demo accounts five verified
sales of `particular@laria.test` (their seller page and «Vendedor destacado»), reviews with one approved photo, a
resale by `comprador@laria.test` linked to its purchase («Historial en Laria»), comprador's buyer card at
`/comprador/a1b2c3d4e5f60718293a4b5c`, and the demo store as a «Punto seguro Laria». Load it after the demo seed, then
copy the review photo's file into the local Storage folder:

```sh
psql "postgresql://postgres@127.0.0.1:54322/postgres" -f scripts/prototype/deal-trust-seed.sql
install -D scripts/prototype/demo-photos/FEN-MUSTLT25__01.jpg \
  /tmp/laria-prototype/storage/review-photos/d0000000-0000-4000-8000-000000000003/d8200000-0000-4000-8000-000000000003/d8400000-0000-4000-8000-000000000001.jpg
```

The Mostrador code (Mi tienda > Inventario > Mostrador, then "Mostrar código al cliente" after a sale) can be confirmed
by `comprador@laria.test` or `particular@laria.test`, once per store a day each. `scripts/prototype/a11y-deal-trust.cjs`
runs axe-core on the new pages and sheets (same setup as below). The levels and reminders run with
`curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/jobs/deal-trust`.

## Feature ideas, all batches together

`start-docker-free.sh seed` loads every batch seed after the demo seed (services, discovery, deal-trust,
selling-tools, store-floor, store-reach and store-locations), copies deal-trust's review photo into the local Storage
folder, and writes a local-only `LARIA_EINVOICE_KEY` into a new `.env.local` (the key store-locations' seed sealed the
demo Nubefact token with). With an older `.env.local`, add that line by hand or delete the file before seeding.
`demo-tienda@laria.test` and `admin@laria.test` must turn on two-step sign-in; `two-step.cjs` does it for scripts.

`feature-ideas-tour.cjs` takes one screenshot of every new or changed screen of the program, as the role that sees
it, at 390 px (and 1366 px where the layout changes), and writes JPEGs plus `manifest.json`
(`docs/feature-ideas/build-plan.md` lists the ideas):

```sh
node scripts/prototype/feature-ideas-tour.cjs /tmp/laria-prototype/feature-ideas-tour
```

## Accessibility checks

Two Playwright scripts run axe-core (WCAG 2.0 to 2.2, A and AA) against the running prototype at 390 px and 1366 px,
with the demo accounts (`docs/ux-effortless/speed.md` § fast-04): every page each role reaches, and the states a tap
opens, with a pass that tabs through each page and reports any focused element a bottom bar covers. They need
playwright-core, which is not a project dependency, and a Chromium.

```sh
npm install --prefix /tmp/laria-pw playwright-core@1.48.2
NODE_PATH=/tmp/laria-pw/node_modules node scripts/prototype/a11y-audit.cjs /tmp/laria-prototype/a11y.json
NODE_PATH=/tmp/laria-pw/node_modules node scripts/prototype/a11y-states.cjs /tmp/laria-prototype/a11y-states.json
```

`CHROMIUM` (default `/opt/pw-browsers/chromium`), `BASE` (default `http://localhost:3000`) and `AXE` (default: the
axe-core in `node_modules/.pnpm`) can be set. Each prints one line per page or state and writes the details as JSON.

## Benchmarks (indicative)

```sh
node scripts/prototype/bench-inventory.cjs                       # 5,000 items, 20,000 movements, page/summary timings
node --experimental-strip-types scripts/prototype/make-bench-import.mjs /tmp/bench-import.xlsx 2000
```

The second command writes a 2,000-row XLSX to run through the import wizard. Both create data you should reset
afterwards. Results from the build session are in the review package.
