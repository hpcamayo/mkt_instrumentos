# Feature ideas: accounts batch

**Pilot update (2026-10-30):** the owner now limits two-step verification to Admin. This supersedes the original
optional-account/store-payment requirements below. Non-Admin enrollment and prompts are disabled during the pilot.
Wider enforcement is deferred until paying users and a new owner-approved release. Admin recovery explicitly
revokes all sessions; revoked JWTs are refused by the API and Storage. Apply
`20261210120800_feat_pilot_security_fixes.sql` with the other PR migrations at the coordinated release.


Ideas safe-08 (two-step sign-in and devices), safe-09 (e-mail change, your data and deleting the account), buy-11
(Google and Apple sign-in), safe-10 (help center), safe-02 (stolen-gear registry) and safe-05 (red flags at review
time, the photo-copy rule only). All six were marked Yes by Henri on 2026-10-26. Branch
`claude/project-thread-mt287t`, PR into `features/marketplace`.

Nothing here is applied to a hosted database. Proposed decisions are numbered FD-accounts-n; acceptance proposals are in
`accounts-acceptance.tsv` (GROW-001 to GROW-057, Not Run). Screenshots, the walk-through log and the accessibility
results are in `/mnt/project-files/feature-ideas/screens/accounts/`.

Henri's note on safe-08 sets its main rule: "i dont want the seller to be inputting their token everytime they open
their account. the 'keep me logged in' option must work 100%".

## Migrations (slot 20261201)

| File | What | Redefines |
| --- | --- | --- |
| `20261201120000_feat_account_security.sql` | Two-step requirement, devices, sessions, recovery codes; the batch's four e-mail types and context keys | none (e-mail checks extended in place, see below) |
| ~~`20261201120100_feat_anonymize_standin.sql`~~ | Removed at integration: A20 is on main (`20261114120000_launch_audit_privacy.sql`) | none |
| `20261201120200_feat_help_center.sql` | Help tickets | none |
| `20261201120300_feat_photo_red_flags.sql` | Photo hashes and red flags | none |
| `20261201120400_feat_stolen_gear.sql` | Stolen-gear reports, private serials, matches, the `stolen-gear-photos` bucket | none |
| `20261201120500_feat_account_data.sql` | Data export and self-service deletion | none |

The e-mail registry is shared: the first migration adds `account_new_device`, `account_two_step_reset`,
`help_ticket_answered` and `stolen_report_match` to `marketplace_email_deliveries_event_type_check` with
`laria_private.ux_extend_text_check`, and adds the context keys `device`, `signed_in_at`, `ticket_code`, `answer`,
`report_code` and `item` to `marketplace_email_context_check` by reading its live values first (the services batch
does the same afterwards, so both sets survive). `get_admin_moderation_queue` and `get_account_pendientes` are not
touched. Suite: `tests/feat-accounts.sql`.

Supabase Auth's own tables (`auth.mfa_factors`, `auth.sessions`) are read through dynamic SQL, so the migrations also
load where those tables are missing (the Docker-free test database), where every account reads as "no app, no
sessions".

## safe-08: two-step sign-in, remembered devices and signing out everywhere

**What changed.**

- **Verificación en dos pasos** in Mi cuenta › Seguridad, with an authenticator app (Google Authenticator, Microsoft
  Authenticator or any TOTP app): "Activar verificación en dos pasos" shows a QR code and the key to type by hand,
  then asks for the first code. Turning it on gives **ten recovery codes** (copy, download, shown once). The section
  then says "Activa", how many recovery codes are left (with a nudge at three or fewer), offers new codes and lets the
  person turn it off unless it is required.
- **When the code is asked.** Only after the password on a browser that is not signed in: a new device, or after
  signing out. The session then keeps its second-factor level for as long as it lasts, so the code is not asked again
  when the person closes the browser, comes back the next day or opens Mi cuenta. Pages under `/mi-cuenta`, `/vender`,
  `/mis-publicaciones` and `/admin` send a session that still owes its code to the code step (Seguridad and sign-out
  stay open); the code step returns to the page the person was going to.
- **The code guards the data, not only the pages** (integration, `20261210120700_feat_two_step_requests.sql`). Until
  the code is entered, the session's token is refused by the API itself (`TWO_STEP_REQUIRED`): every PostgREST request
  (PostgREST's pre-request check, `public.check_two_step_request`) and every Storage request (a restrictive policy),
  except the four calls of signing in and the code step (`my_two_step_owed`, `my_two_step_requirement`,
  `record_sign_in_device`, `use_my_recovery_code`). Routes that use the service role ask `public.my_two_step_owed()`
  first, the two AI routes of the five maybes before any AI call (`lib/auth/complete-session.ts`; `tests/feat-two-step-requests.test.cjs` lists every use of the service role
  and why it is safe). Without this, someone with the password alone could skip the code step and use the account
  through the API. Public pages still open; the header shows the session as signed out until the code.
- **"Mantener sesión iniciada".** A checkbox on the sign-in page, ticked by default, with "Desmárcalo en una
  computadora compartida: la sesión se cerrará al cerrar el navegador." Ticked, the session cookies last 400 days and
  refresh themselves (Supabase's default). Unticked, a `laria_recordar=0` marker makes the middleware, the server
  routes and the browser client write the session cookies without an expiry, so they end with the browser. It works
  for password, e-mail link and Google or Apple sign-in alike.
- **No phone.** "No tengo mi teléfono: usar un código de recuperación" takes one of the ten codes (five tries per 15
  minutes). A good code removes the authenticator app, closes every session of the account, sends the
  `account_two_step_reset` e-mail, and the person signs in with the password and sets the app up again.
- **Required for some accounts.** A store owner whose store has an approved payment method needs the code to open
  Mi tienda, and the database refuses changes to the store's contact details or payment methods from a session
  without it (`TWO_STEP_REQUIRED`). Admin accounts are sent to set it up before any Admin page (the database side of
  the Admin requirement is the launch audit's A15). Both see why: "Tu tienda tiene medios de pago aprobados…" /
  "Las cuentas de Admin necesitan la verificación en dos pasos."
- **Dispositivos con sesión iniciada.** Each session with its browser ("Chrome en Android"), last activity and "(este
  dispositivo)"; "Cerrar sesión" per device and "Cerrar sesión en todos los dispositivos", which ends every session,
  this one included, and returns to the sign-in page.
- **New-device e-mail.** The first sign-in from a browser the account has not used before sends "Nuevo ingreso a tu
  cuenta de Laria" with the browser and the Lima time, linking to the device list. The account's first browser is the
  baseline and sends none; at most ten such e-mails a day per account. Browsers are recognised by a random httpOnly
  cookie (`laria_dispositivo`); the database stores only its SHA-256 hash.

**Files.** `lib/auth/two-step.ts` (pure helpers, safe for middleware: `getAssurance`, `twoStepPath`),
`lib/auth/mfa.ts` (re-exports them and adds `requireAal2`), `lib/auth/two-step-gate.ts`, `lib/auth/remember.ts`,
`lib/auth/devices.ts`, `lib/auth/login-reason.ts`, `components/auth/two-step-setup.tsx`,
`components/account/device-sessions.tsx`, `components/login-form.tsx`, `app/mi-cuenta/seguridad/page.tsx`,
`app/api/auth/login/route.ts`, `app/auth/callback/route.ts`, `app/api/account/sessions/route.ts`,
`app/api/account/sessions/everywhere/route.ts`, `app/api/account/two-step/recovery/route.ts`, `middleware.ts`,
`lib/supabase/{browser,server}-client.ts`, the first migration.

**How to test.** Sign in with a local Admin account, turn the app on in Seguridad (the local stand-in shows "QR local";
type the key into an authenticator app or use `scripts/prototype/two-step.cjs`), close the browser and come back: no
code. Sign in from a second browser: the code is asked once. Close that browser's session from the first one and
reload the second: it is signed out. Untick "Mantener sesión iniciada" and check that the `sb-…-auth-token` cookies
have no expiry. Sign in as `demo-tienda@laria.test` and open Mi tienda: it opens without a code or enrollment prompt during the pilot.

- **FD-accounts-1.** The code is asked only on a new device or after signing out, and a session keeps its
  second-factor level for its whole life (Henri's requirement). "Mantener sesión iniciada" is ticked by default because
  it keeps today's behaviour and Henri asked for it to work every time; it is not a consent, and unticking it is one
  tap with the reason next to it.
- **FD-accounts-2.** Two-step is optional for everyone, and required only for store owners with an approved payment
  method (Mi tienda, store contact details and payment methods) and for Admin. A Particular is never forced.
- **FD-accounts-3.** Authenticator apps only, no SMS codes (cost per message, and SIM-swap fraud). Ten one-time
  recovery codes, stored as bcrypt hashes; using one removes the app instead of skipping it once, so a stolen code
  cannot be used quietly.
- **FD-accounts-4.** One new-device e-mail per new browser, the first browser excluded, ten a day at most. It is a
  transactional e-mail (about the person's own account), so it has no unsubscribe link.
- **FD-accounts-5.** Supabase project settings must keep sessions alive: Sessions › "Time-box user sessions" and
  "Inactivity timeout" off, or at least 30 days; MFA › TOTP enabled (Supabase's default). Henri sets this in the
  Supabase dashboard; nothing in the code can override a shorter time-box.

**Limitations.** The local prototype's QR is a placeholder (the stand-in has no QR library; Supabase returns a real
one). Sessions created before this ships have no device label until their next sign-in and show the Supabase user
agent instead. A session closed from another device can no longer refresh; a page already open there may keep its
current access token until it expires (one hour by default), as with any Supabase sign-out.

## safe-09: e-mail change, your data and deleting the account

**What changed.**

- **Correo de acceso** in Seguridad: "Ingresas con …", a "Nuevo correo" field and "Cambiar correo". Supabase sends the
  confirmation link (to both addresses when "Secure email change" is on, its default); until it is opened the page
  says "Falta confirmar …" and the person keeps signing in with the current address. The link returns to Seguridad with
  "Listo: desde ahora ingresas con …". Accounts with the app need a session that passed the code.
- **Tus datos** (`/mi-cuenta/datos`, tab "Datos" next to Perfil, Seguridad and Correos):
  - "Descargar mis datos" downloads `laria-mis-datos-YYYY-MM-DD.json` at once: account, listings, drafts, favorites,
    follows, alerts, reviews written and received (once public), purchases and sales, public questions, help tickets,
    stolen-gear reports, devices and e-mail preferences. No e-mail, no waiting.
  - "Eliminar mi cuenta" lists what happens (listings stop showing, name, WhatsApp, city, favorites, alerts, drafts
    and notices are erased, confirmed purchases or sales stay as «Cuenta eliminada», it cannot be undone, download
    first), asks for the password (or the account's e-mail typed out when it only uses Google or Apple) and one
    confirmation. The server re-checks the password, runs `service_delete_account` (A20's anonymiser, which clears
    the branch's tables through `laria_private.anonymize_account_feature_data` and queues the stolen-gear photos for
    the daily uploads sweep), signs out and soft-deletes the Supabase user, then lands on the sign-in page with
    "Eliminamos tu cuenta".
  - Admin accounts and accounts that run a store see why they cannot delete here and a link to write to the team.

**Files.** `app/mi-cuenta/datos/page.tsx`, `components/account/{email-change-form,account-deletion}.tsx`,
`app/api/account/{email,data,delete}/route.ts`, `lib/account/route-helpers.ts`, `lib/account-navigation.ts` (marked
tab), `app/mi-cuenta/seguridad/page.tsx`, migrations `…120500` and the integration's `20261210120400_feat_account_privacy.sql`.

**How to test.** As `comprador@laria.test`: change the e-mail and see the pending notice; download the file and open
it. As a throwaway account: delete it, check that signing in again fails and that `auth.users` has `deleted_at` and no
password, and the profile reads «Cuenta eliminada».

- **FD-accounts-6.** E-mail change lives in Seguridad (how you sign in), not in Perfil.
- **FD-accounts-7.** The export is one JSON file downloaded on the spot. It holds only the person's own data (another
  person's name appears only where it is already public, such as a review's author).
- **FD-accounts-8.** Self-service deletion anonymises instead of erasing rows that other people rely on: verified
  transactions and their reviews stay under «Cuenta eliminada»; unsold listings are archived, sold ones kept as
  history. Store-owner and Admin accounts are closed with the team (a store has listings, stock and payment methods
  that need a decision).
- **FD-accounts-9.** The A20 stand-in is created only when A20's `laria_private.anonymize_account(uuid, text)` does
  not exist; the integrator removes `20261201120100_feat_anonymize_standin.sql` once A20 is merged. This batch's own
  tables are cleaned by `laria_private.anonymize_account_feature_data(uuid)`. *Integrated 2026-10-27:* the stand-in is
  gone, and the hook (now in `20261210120400_feat_account_privacy.sql`) covers every branch table and runs for Admin's
  anonymising too.

**Limitations.** Deletion is immediate (no grace period); the page says so before asking. Data in e-mail provider logs and
backups follows their own retention. A person with an open store must ask the team.

## buy-11: sign in with Google or Apple

**What changed.** "Continuar con Google" and "Continuar con Apple" on the sign-in page and at the top of the
Particular sign-up page ("O crea tu cuenta con tu correo" below), with the line "Si es tu primera vez, se crea una
cuenta Particular con tu nombre y correo, y aceptas los términos y reglas y la política de privacidad." A first
sign-in creates the same name-only Particular profile as the sign-up form (WhatsApp and city are asked at the first
publication). "Mantener sesión iniciada" and the two-step code apply as with a password. Store sign-up keeps its own
form.

**Files.** `components/auth/oauth-buttons.tsx`, `components/login-form.tsx`, `components/seller-signup-form.tsx`,
`app/auth/callback/route.ts`.

- **FD-accounts-10.** The buttons stay hidden until Henri turns each provider on: `NEXT_PUBLIC_AUTH_GOOGLE=1` and
  `NEXT_PUBLIC_AUTH_APPLE=1`, after setting up the provider in Supabase Auth (client IDs and secrets live in Supabase,
  not in Laria's environment). Fails closed: with the flag off, nothing renders.

**Limitations.** Not tried against the real providers (no credentials; tests never call them). Apple may hide the
e-mail (a relay address); that account works but its e-mail is the relay. Linking a Google identity to an existing
password account follows Supabase's automatic linking by verified e-mail.

## safe-10: help center

**What changed.**

- `/ayuda`: a search box (accent-insensitive, as you type, with a plain GET fallback), four topics (Comprar con
  seguridad, Vender, Tiendas, Tu cuenta) and 20 short articles at `/ayuda/<slug>`, each with steps, links to the
  page that does it and related articles. Written for Laria's real rules (no payments, no shipping, WhatsApp contact,
  review times, the listing allowance).
- **"¿No encontraste tu respuesta?"** A form (name, e-mail, topic, question) that returns a code (`AY-…`). Signed-in
  people get the name and e-mail filled in and see their questions and answers at `/ayuda/mis-consultas`; an answer
  also arrives by e-mail (`help_ticket_answered`). Limits: five per e-mail and per account a day, ten per browser an
  hour (the browser is an HMAC of the client address, never stored in clear).
- Laria's **WhatsApp support line** appears only when both `NEXT_PUBLIC_SUPPORT_WHATSAPP` and
  `NEXT_PUBLIC_SUPPORT_HOURS` are set, with the hours next to it.
- **Admin › Ayuda** (`/admin/ayuda`): open, answered and closed tickets; "Responder", "Responder y cerrar", "Cerrar sin
  responder", "Reabrir". Tickets sent without an account show a "Responder por correo" link that opens Admin's own
  mail program.
- The footer links "Centro de ayuda" (slim footer: "Ayuda").

**Files.** `lib/help/{articles,support}.ts`, `components/help/{help-search,help-ticket-form}.tsx`,
`app/ayuda/{page,help-contact}.tsx`, `app/ayuda/[slug]/page.tsx`, `app/ayuda/mis-consultas/page.tsx`,
`app/api/help/tickets/route.ts`, `app/admin/ayuda/page.tsx`, `components/admin-feature/admin-help-ticket.tsx`,
`app/api/admin/help-tickets/route.ts`, `components/site-footer.tsx` (marked), migration `…120200`.

- **FD-accounts-11.** Articles live in code (`lib/help/articles.ts`), reviewed like any copy; no CMS.
- **FD-accounts-12.** Laria sends e-mail only to addresses that belong to an account. A ticket sent without an
  account is answered from Admin's own mailbox, so the form cannot be used to make Laria e-mail strangers.

**Limitations.** Articles are not yet in the sitemap (the sitemap file belongs to the discovery and listing batches;
a one-line follow-up). No attachments on tickets.

## safe-02: stolen-gear registry and private serial numbers

**What changed.**

- **Reportar un robo** (`/reportar-robo`, signed in): brand, model, serial number, description, up to six photos
  (private bucket `stolen-gear-photos`, under the person's own folder), date, place and the police report number
  (required), police station. Five reports a day. The person gets a code (`RB-…`) and sees their reports at
  `/reportar-robo/mis-reportes`, where they can mark one "Lo recuperé" or "Retirar reporte".
- **Private serials.** "Número de serie" (optional, "Privado: no aparece en la publicación…") on the listing edit form,
  on the sell form's success screen and, for stores, "Números de serie" (one per line) on each inventory SKU. Never
  shown on a public page; compared without spaces, dashes or case.
- **Matching.** A serial equal to an active report's, or a listing photo within 5 of 64 bits of a report photo,
  creates a match for Admin with the reason. It runs when a serial is saved, when a report arrives, and when listing
  photos are hashed (safe-05). A reporter's own listings never match their report. Nothing changes on the listing.
- **Admin › Equipos reportados** (`/admin/equipos-reportados`): matches with both sides side by side (report photos
  through 10-minute signed links), "Coincide: avisar a quien reportó" or "No coincide" with an optional note; reports
  by status. Only a confirmed match e-mails the reporter (`stolen_report_match`), without naming the listing or the
  seller. The help article explains what a report does and does not do.

**Files.** `components/stolen-gear/*`, `app/reportar-robo/{page,mis-reportes/page}.tsx`,
`app/api/stolen-gear/{reports,status}/route.ts`, `app/admin/equipos-reportados/page.tsx`,
`app/api/admin/stolen-gear/route.ts`, migration `…120400`; one-line marked imports in `components/listing-edit-form.tsx`,
`components/sell-listing-form.tsx` and `app/mi-cuenta/tienda/inventario/[itemId]/page.tsx`.

- **FD-accounts-13.** A match is a lead for Admin, never a public mark. Copy says "coincide con un reporte", never
  "robado"; the reporter learns only that something matched, and is pointed to the police.
- **FD-accounts-14.** A police report number is required to file a report, to keep the registry for real thefts.
- **FD-accounts-15.** `laria_private.flag_serial_against_stolen_reports(serial, source, ref, owner default null)` is
  the one entry point for serials held elsewhere; selling-tools' "Mi equipo" calls it with source `gear`.

**Limitations.** A new report is checked against listing and SKU serials and hashed listing photos; serials saved in
Mi equipo are checked when they are saved, and a report filed later scans Mi equipo too (integration, migrations
`20261210120000`–`20261210120200`). Serials typed
before this ships are not there to match.

## safe-05: red flags at review time (photo copies)

**What changed.** Each listing photo gets a 64-bit difference hash, computed on Laria's server with `sharp` (no outside
service). When two listings of different sellers (accounts, stores, or a legacy listing on its own) have photos within
5 of 64 bits, the newer listing gets a flag "Foto parecida a la de otro vendedor" naming the other listing and the
photos. Near-flat images never count. Admin sees the flags above the listing in the review queue ("Ver todas") and in
**Admin › Fotos repetidas** (`/admin/fotos-repetidas`), with both photos, "Es una copia" or "No es copia" and a note.
Nothing is rejected or hidden automatically. Flags also show stolen-gear matches ("Coincide con un reporte (RB-…)").

Photos are hashed by a daily job (`/api/internal/jobs/photo-fingerprints`, `CRON_SECRET`, 45-second budget, pending
listings first, a listing only when its photo set changed) and when Admin opens a listing whose photos were not hashed
yet.

**Files.** `lib/photo-fingerprint.ts`, `app/api/internal/jobs/photo-fingerprints/route.ts`,
`app/api/admin/{listing-flags,red-flags}/route.ts`, `components/admin-feature/{listing-red-flags,admin-review-actions,admin-photo}.tsx`,
`app/admin/fotos-repetidas/page.tsx`, migration `…120300`; a one-line marked import in `components/admin-workbench.tsx`.

- **FD-accounts-16.** Photos are hashed off the upload path (daily, and when Admin opens the listing) rather than in
  `app/api/listing-images`, so uploads stay as fast as today and the upload route is unchanged; review is where the
  flag is needed.
- **FD-accounts-17.** A flag goes on the newer listing and never blocks it; a catalog photo used by two stores is
  legitimate, so Admin decides.

**Limitations.** Photos hosted outside Laria's Storage (legacy links) are not fetched. Strong crops or mirrored copies
can escape a difference hash. The price rule of safe-05 waits for typical prices (`deferred.md`).

## Admin navigation

Three entries in a marked block of `components/admin-navigation.tsx`: Ayuda, Fotos repetidas, Equipos reportados.

## Environment variables, settings and schedules

| Name | Where | What |
| --- | --- | --- |
| `NEXT_PUBLIC_AUTH_GOOGLE` | Vercel | `1` shows "Continuar con Google" (after the provider is set up in Supabase Auth) |
| `NEXT_PUBLIC_AUTH_APPLE` | Vercel | `1` shows "Continuar con Apple" (same) |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` | Vercel | Laria's support WhatsApp, digits with country code; shown only with the hours |
| `NEXT_PUBLIC_SUPPORT_HOURS` | Vercel | e.g. "lunes a viernes, de 9:00 a 18:00" |
| `SUPABASE_SERVICE_ROLE_KEY` | existing | deletion, recovery codes, photo hashes, the ticket browser hash |
| `CRON_SECRET` | existing | the photo-hash job |
| Supabase Auth › Sessions | dashboard | time-box and inactivity timeout off, or at least 30 days (FD-accounts-5) |
| Supabase Auth › MFA | dashboard | TOTP enabled (default) |
| Supabase Auth › Email | dashboard | "Secure email change" on (default) |

Schedule: `GET /api/internal/jobs/photo-fingerprints` once a day (any hour; for example 06:00 UTC).

## Copy for legal review

- The sign-in line under the Google and Apple buttons (consent to terms and privacy on first sign-in).
- The deletion list and confirmation on `/mi-cuenta/datos`, and the export's description.
- The stolen-gear form, its confirmation, the article "Si te robaron un instrumento" and the `stolen_report_match`
  e-mail (what Laria does with reports and with the police).
- The help articles "Cómo pagar y recibir el equipo de forma segura" and "Señales de una posible estafa".
- The privacy policy should mention the device cookie, the photo hashes, stolen-gear reports and help tickets.

## Changes to files other batches own

- `middleware.ts`, `lib/supabase/{browser,server}-client.ts`: the remember choice and the two-step gate.
- `lib/supabase/database.types.ts`: a marked block with the new tables and functions.
- `tests/pay-1.sql`: its `as_user` helper now sets `aal2`, since store payment-method changes need the code.
- `tests/ux-shell.test.cjs`: the slim footer's expected links start with "Ayuda".
- `components/admin-workbench.tsx`, `components/admin-navigation.tsx`, `components/site-footer.tsx`,
  `components/sell-listing-form.tsx`, `components/listing-edit-form.tsx`,
  `app/mi-cuenta/tienda/inventario/[itemId]/page.tsx`: one marked import or entry each.
- `lib/account-navigation.ts`, `lib/email/templates.ts`: marked entries in the shared registries.
- `scripts/prototype/local-gateway.cjs` (sessions, factors, Admin user calls, signed URLs),
  `scripts/prototype/a11y-audit.cjs` and `a11y-states.cjs` (answer the code step via the new
  `scripts/prototype/two-step.cjs`; the demo store now needs the code for Mi tienda).
- `package.json`: `sharp` as a direct dependency (it was already installed through Next.js).
