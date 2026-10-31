# Feature ideas: setup for Henri

**Pilot update (2026-10-30):** the owner now limits two-step verification to Admin. This supersedes the original
optional-account/store-payment requirements below. Non-Admin enrollment and prompts are disabled during the pilot.
Wider enforcement is deferred until paying users and a new owner-approved release. Admin recovery explicitly
revokes all sessions; revoked JWTs are refused by the API and Storage. Apply
`20261210120800_feat_pilot_security_fixes.sql` with the other PR migrations at the coordinated release.


What the feature-ideas build needs outside the code, collected from every batch's write-up. Nothing here is set
anywhere yet, and nothing has to be set before the merge to main: each feature without its setting stays off or says
so on its page.

## Environment variables (Vercel)

| Name | Batch | What it does | Without it |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_AUTH_GOOGLE` | accounts | `1` shows "Continuar con Google", once the provider is set up in Supabase Auth | No Google button |
| `NEXT_PUBLIC_AUTH_APPLE` | accounts | `1` shows "Continuar con Apple", once the provider is set up in Supabase Auth | No Apple button |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` | accounts | Laria's support WhatsApp, digits with the country code (51…) | No WhatsApp line in the help center |
| `NEXT_PUBLIC_SUPPORT_HOURS` | accounts | The hours shown with that number, for example "lunes a viernes, de 9:00 a 18:00" | Same: the line needs both |
| `MERCADOLIBRE_CLIENT_ID` | store-reach | Laria's Mercado Libre app (digits) | Mercado Libre import off; the page says so and links to the Excel import |
| `MERCADOLIBRE_CLIENT_SECRET` | store-reach | Same app | Same |
| `MERCADOLIBRE_TOKEN_KEY` | store-reach | 32 random bytes (hex or base64) that encrypt the stores' tokens. Never change it without disconnecting every store first | Same |
| `MERCADOLIBRE_REDIRECT_URI` | store-reach | Optional. Default `https://<site>/api/store/mercado-libre/callback`, which must be registered in the app | The default is used |
| `LARIA_GOOGLE_SHOPPING_ACTIVE` | store-reach | `true` once Laria's Google Merchant Center account reads `/api/feeds/laria` | The social catalog page says Google isn't active yet |
| `LARIA_EINVOICE_KEY` | store-locations | 32 random bytes (`openssl rand -base64 32`) that encrypt each store's Nubefact token. Never change it without reconnecting every store | Comprobantes off: the receipts route answers 503 `EINVOICE_OFF` |
| `CRON_SECRET` | all jobs | Already used on main. Protects every route below | The job routes answer 401 |
| `SUPABASE_SERVICE_ROLE_KEY` | several | Already used on main | Deletion, recovery codes, photo hashes and job routes fail closed |

## Supabase dashboard

| Setting | Batch | Value |
| --- | --- | --- |
| Auth › Providers › Google, Apple | accounts | Client IDs and secrets live in Supabase, not in Vercel. Then set the two `NEXT_PUBLIC_AUTH_*` flags |
| Auth › Sessions | accounts | Time-box and inactivity timeout off, or at least 30 days (FD-accounts-5), so "Mantener sesión iniciada" lasts |
| Auth › Multi-factor › TOTP | accounts | Enabled (Supabase's default) |
| Auth › Email › Secure email change | accounts | On (Supabase's default) |

Nothing to set for the API's second-step check: `20261210120700_feat_two_step_requests.sql` sets PostgREST's
pre-request function on the `authenticator` role itself and tells PostgREST to reload. After the migrations, a request
with the anon key should still answer (for example the catalog), and an account with the authenticator app on should
get "Escribe tu código" after its password, then everything after the code. To undo it in an emergency:
`alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`.

## Scheduled jobs

Each route is `GET` with `Authorization: Bearer $CRON_SECRET`. All of them can safely run twice. The account is on
Vercel Pro since 26 Oct 2026, so `vercel.json` schedules the six Vercel jobs below next to main's page refresh: they
start on the first deploy of this branch, which comes after its migrations. Vercel sends
`Authorization: Bearer $CRON_SECRET` on cron calls; main's page refresh job already needs `CRON_SECRET`.

| Route | Batch | What it does | Schedule (UTC) |
| --- | --- | --- | --- |
| `/api/internal/jobs/photo-fingerprints` | accounts | Hashes listing photos for copy and stolen-gear checks | daily, 06:00 |
| `/api/internal/jobs/deal-trust` | deal-trust | Seller levels, counter-purchase review reminders, unused review photos | daily, 07:30 (02:30 Lima) |
| `/api/internal/jobs/store-floor` | store-floor | Passed arrival dates, try-out expiry, reminders and purge | daily, 13:00 (08:00 Lima) |
| `/api/internal/jobs/price-steps` | selling-tools | Due price steps | daily, 14:00 (09:00 Lima) |
| `/api/internal/jobs/gear-reminders` | selling-tools | Due string, reed and drumhead reminders | daily, 15:00 (10:00 Lima) |
| `/api/internal/jobs/trade-offers` | selling-tools | Expires unanswered store requests, closes stale ones, removes unused photos | daily, any hour (hourly is fine) |
| `/api/internal/jobs/demand-report` | store-reach | Manual run only: pg_cron `demand-report-monthly` (`30 10 * * *`) runs it | none in Vercel |
| `/api/internal/jobs/campaigns` | store-reach | Manual run only: pg_cron `laria-campaigns` (`*/10 * * * *`) runs it | none in Vercel |

The two pg_cron jobs start by themselves when their migrations are applied, like the ones already on main.

Main's own jobs (e-mail queue, push, import cleanup) are not part of this list. The launch audit (A25) owns their
schedule.

## Outside accounts

| Account | Batch | Needed for |
| --- | --- | --- |
| Google Cloud OAuth client, Apple Services ID | accounts | Sign-in with Google or Apple |
| A WhatsApp number for support | accounts | The help center's WhatsApp line |
| Mercado Libre developer app (read-only scopes) | store-reach | Import from Mercado Libre |
| Google Merchant Center, Meta Commerce Manager | store-reach | Laria's own product feed; stores connect their own Meta catalog |
| Partner stores for Punto seguro, and a check of the meetup places per city | deal-trust | `lib/safe-meetup-places.ts` (FD-deal-trust-17) |
| A Nubefact demo account | store-locations | One test boleta and factura before any store uses Comprobantes: the payload follows Nubefact's JSON API v1 but has never been sent to the real service (the "clientes varios" document type and the IGV rounding per line especially). Each store then uses its own Nubefact account |

## No setup

listing-details (the map uses OpenFreeMap's public tiles, no key), discovery, services, store-locations' sedes, and
store-floor's installments (they follow the payments pilot switch, which stays off until legal review).
