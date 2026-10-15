# Running the Store Operations prototype locally

Everything here is local. Nothing reads hosted Supabase settings, sends e-mail or WhatsApp messages, or touches
production. Branch: `store-ops/prototype`.

## On a Mac with local Supabase (Docker)

The usual Laria setup (`docs/ux-redesign/review-guide.md`): Docker Desktop and the Supabase CLI.

```sh
git fetch origin store-ops/prototype && git switch store-ops/prototype
pnpm install
supabase start                       # local stack on 127.0.0.1:54321 (API) and :54322 (Postgres)
supabase db reset                    # every migration, then supabase/seed.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f scripts/prototype/demo-seed.sql
```

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
| `particular@laria.test` | Particular seller, for comparison (nothing changes for them). |

Public pages: `/tiendas/laria-demo-musica`, `/instrumentos/demo-boss-ds-1` ("Solicitar compra" with the pilot on),
`/instrumentos/demo-boss-tu-3` (Agotado).

The demo store has 12 SKUs (8 linked to approved listings, one at zero stock, one low), a few days of movements and
four payment methods (three approved). `scripts/prototype/demo-import.csv` is a semicolon-separated file with
merchant-style headings, two updates, three new SKUs and four rows that fail validation on purpose.

## Benchmarks (indicative)

```sh
node scripts/prototype/bench-inventory.cjs                       # 5,000 items, 20,000 movements, page/summary timings
node --experimental-strip-types scripts/prototype/make-bench-import.mjs /tmp/bench-import.xlsx 2000
```

The second command writes a 2,000-row XLSX to run through the import wizard. Both create data you should reset
afterwards. Results from the build session are in the review package.
