# Effortless Laria: accounts, saving and alerts

Build write-up for the accounts batch of the Effortless Laria program (`/mnt/project-files/ux-ideas/build-plan.md`).
Ideas: fix-01, fix-08, big-04, save-01 to save-12, auth-01 to auth-03. Migration slot 20261103, acceptance range
EASE-200 to EASE-299 (proposed in `accounts-acceptance.tsv`, all Not Run).

## Fixes (PR `ux/effortless-accounts-fixes`)

### fix-01 WhatsApp numbers typed without +51

- **What changed.** `lib/phone.ts` holds the rule: digits only, a leading 00 dropped, and nine digits starting with 9
  get 51 in front. `normalizeProfilePhone` uses it and now accepts only numbers WhatsApp can open (10 to 15 digits
  with the country code). Migration `20261103120000_ux_phone_normalization.sql` applies the same rule in the database
  (`laria_private.normalize_pe_phone`) through BEFORE triggers on `profiles.phone`, `listings.whatsapp_phone` and
  `stores.whatsapp_phone`, so every writer (sign-up metadata, profile, sell form, store registration, Admin editors,
  imports) is covered, and corrects the numbers already stored once.
- **Phone input.** `components/ui/phone-input.tsx` shows a "+51" prefix (hidden when the person types their own
  "+country code"), the phone keypad, and under the field "Así te contactarán: +51 987 654 321 · Probar en WhatsApp".
  Used in the Particular sign-up, Mi perfil and the invitation profile form.
- **Price input.** `components/ui/price-input.tsx` (auth-03, shipped here for the other batches): "S/" in front,
  "1,250" while typing, numeric keypad. `parseWholeSolPrice` now reads "1,250" and "S/ 1,250" as 1250 (a decimal
  point or a misplaced comma stays invalid), so server routes accept the grouped text unchanged.
- **Files.** `lib/phone.ts`, `lib/auth/profile.ts`, `lib/price.ts`, `components/ui/phone-input.tsx`,
  `components/ui/price-input.tsx`, `components/seller-signup-form.tsx`, `components/profile-edit-form.tsx`,
  `components/invite-profile-setup-form.tsx` (smallest edit: the WhatsApp field), the migration,
  `tests/ux-accounts-phone.sql`, `tests/ux-effortless-accounts.test.cjs`.
- **How to test.** Sign up with WhatsApp "987 654 321": the line under the field reads "+51 987 654 321" and the link
  opens wa.me/51987654321; the profile row stores 51987654321. `tests/ux-accounts-phone.sql` covers the rule, sign-up,
  listing and store inserts, and an owner retyping the same number on an approved listing.
- **Defaults picked.** Stored format stays digits (the existing convention), now always with the country code. Nine
  digits that do not start with 9 are left alone (not a Peruvian mobile, so adding 51 would be a guess); the form
  rejects them as not reachable by WhatsApp.
- **Limitations.** The data fix runs when the migration is applied, which needs Henri's word; rows it changes get a new
  `updated_at`. The wa.me builders in `lib/listings.ts` and `lib/payment-methods.ts` belong to the listing and
  inventory batches; `buildWhatsAppHref` in `lib/phone.ts` is there for them, and the stored numbers are already
  correct after the migration.

### fix-08 Unconfirmed e-mail looks like a wrong password

- **What changed.** `/api/auth/login` answers `email_not_confirmed` (403) when Supabase reports it. Supabase checks the
  password first, so this does not reveal which addresses have unconfirmed accounts. The sign-in form then shows
  "Confirma tu correo" with "Reenviar enlace". The screen right after signing up shows the same button.
  `/api/auth/resend-confirmation` asks Supabase Auth to send the sign-up e-mail again, keeps the return path, and
  answers the same for every address; Supabase's own send limit returns "Espera unos minutos".
- **Files.** `app/api/auth/login/route.ts`, `app/api/auth/resend-confirmation/route.ts`, `lib/auth/confirmation.ts`,
  `components/auth/resend-confirmation.tsx`, `components/login-form.tsx`, `components/seller-signup-form.tsx`.
- **How to test.** Sign up, don't confirm, sign in with the right password: the notice reads "Confirma tu correo" and
  "Reenviar enlace" sends again, then counts down 60 s before it can be used again.
- **Defaults picked.** 60 seconds between sends in the form.
- **Limitations.** The Docker-free prototype has no e-mail confirmation (its stand-in Auth confirms at once), so the
  screen is covered by unit tests and a screenshot of the state, not an end-to-end e-mail.

## Proposed decisions

- **UXD-accounts-1** WhatsApp numbers are stored as digits with the country code; nine-digit Peruvian mobiles get 51
  added on every write, and stored numbers are corrected once (fix-01).
- **UXD-accounts-2** Signing in with a correct password before confirming the e-mail says so and offers to resend the
  link, with 60 seconds between sends (fix-08).

## Batch (PR `ux/effortless-accounts`)

Migration `supabase/migrations/20261103130000_ux_accounts_saving.sql`, SQL suite `tests/ux-accounts-saving.sql`, unit
tests in `tests/ux-effortless-accounts.test.cjs`, screens in `/mnt/project-files/ux-ideas/screens/accounts/`.

### big-04 Save without an account, and on every device
- The heart works signed out: it saves on this device (`lib/device-saves.ts`, up to 100) and the first save says
  "Guardado en este dispositivo. Con una cuenta lo verás también en otros dispositivos." with a link to `/favoritos`.
- `/favoritos` shows device favorites, "Vistos recientemente" (last 30 opened on this device), what an account adds,
  and "Borrar lo guardado en este dispositivo". A signed-in visitor is sent to `/mi-cuenta/favoritos`.
- At sign-in, `merge_device_favorites` adds the device favorites to the account (Henri's note) and the toast says
  "Guardamos N favoritos de este dispositivo en tu cuenta."; the device list is then cleared. From then on they are the
  account's favorites, on every device.
- The header shows a heart linking to `/favoritos` once a visitor has saved something.

### save-01 Finish what you started after signing in
- "Crear alerta" signed out saves the intent (one hour, used once) and returns with `?motivo=alerta`; on return the
  alert is created (daily) and a toast says so. "Reportar" does the same and opens the form on return.
- The heart needs no sign-in any more (big-04), so there is nothing to resume for it.

### save-02 Never lose the way back
- "Ingresar" in the header carries `next` (the current page); "Crear cuenta" on the sign-in page carries it; sign-up
  and its confirmation e-mail go back to it; a protected page keeps its query string.

### save-03 A sign-in page that says why
- `/login?next=/instrumentos/<slug>&motivo=…` shows the listing's photo and "Ingresa para guardar «Fender
  Stratocaster»" (`lib/auth/login-reason.ts`); "Crear cuenta" is a full-width button next to "Ingresar".

### save-04 New since your last visit
- A first-party cookie keeps the previous visit (a visit starts after 30 minutes away). Favoritos shows "Nuevo desde
  tu última visita: 2 en Guitarras" chips for the categories of the person's favorites, and Alertas tags "N nuevas".

### save-05 Alerts you can change
- Rename, switch between "Resumen diario" (offered first) and "Al instante", see "Última coincidencia hace 2 días · 7
  en total", and save searches with several cities or conditions (stored as lists, matched in the database).

### save-06 Offer the alert at the right time
- On the second occasion of the same search (10 minutes apart, or after another search), a card asks "¿Te avisamos
  cuando aparezca otro?" with "Sí, avísame" and "No, gracias". Declined once, it never asks again for that search.

### save-07 E-mail that is easy to calm down
- Alerts, price drops and the weekly digest say why they arrived and carry a one-click link ("Pausar esta alerta",
  "No más bajas de precio", "No más resumen semanal"), a link to "Correos", and `List-Unsubscribe` with
  `List-Unsubscribe-Post` (RFC 8058). Links are HMAC-signed (`lib/email/links.ts`, 180 days) and work without signing in;
  a GET never changes anything (scanners open links), `/correos/baja` asks for one tap.
- Alert and price-drop e-mails show the photo (https only) and the price, with the earlier price struck through.
- New page `/mi-cuenta/correos` (tab next to Perfil and Seguridad): price-drop e-mails (on), weekly digest (off),
  "Pausar todas" the alerts, and what the person follows. Transactional e-mails are not optional and say so.

### save-08 Price drops worth hearing about
- A drop alerts favorites only when it is 5% or more (Henri: "5% is good"), at most once a day per listing. Favoritos
  shows "Antes S/ 4,799 → S/ 3,999, desde que lo guardaste" against the price when it was saved.

### save-09 Favorites that do something
- An available favorite offers "Contactar por WhatsApp"; a sold one offers "Ver similares disponibles" and "Crear
  alerta parecida" (category, type and brand).

### save-10 Notifications, tidied
- "Marcar todo como leído", pages of 50 instead of a 100-item cap, the listing's name on price drops (new and old
  notices), and an in-app notice for each alert match ("Nueva coincidencia de tu alerta", opening the listing).

### save-11 Share a list
- "Crear enlace para compartir" makes a private link (`/favoritos/compartida/<token>`, noindex) with the first name,
  the public favorites and the notes; "Enviar por WhatsApp", "Copiar enlace" and "Dejar de compartir" (revokes it).
- Notes up to 280 characters on each favorite, visible only to the person and on the shared list.

### save-12 Follow a store or a brand
- "Seguir" on store pages and on the catalog when browsing a brand. The state reads "Siguiendo", not only a color.
- New arrivals of the last 30 days appear as "Nuevo de lo que sigues" on Favoritos, each with "Porque sigues Fender";
  `components/following/followed-arrivals.tsx` is ready for the home page's "Para ti" (find batch). The weekly digest
  is off until chosen and is sent on Mondays only when there is something new.

### auth-01 Passwords without guesswork
- `components/ui/password-input.tsx` adds a 40 px "Mostrar contraseña" eye to every password field; one minimum of 8
  characters everywhere (sign-up was 6); after a failed password, "¿Prefieres un enlace? Te lo enviamos a …" sends the
  magic link to the address already typed.

### auth-02 Ask for details only when they are needed
- Sign-up asks for name, e-mail, password and the rules. WhatsApp and city are asked at the first publication (the
  publish page already sends to the profile with `next=/mi-cuenta/publicar`, where they are required). On the profile
  page they are optional otherwise. The store sign-up is unchanged.

### auth-03 Inputs that fit the keyboard
- `PhoneInput` and `PriceInput` shipped in the fixes PR. Adoption in other batches' forms is listed in the PR.

## Proposed decisions (batch)

- **UXD-accounts-3** Visitors save favorites on the device; signing in merges them into the account (big-04).
- **UXD-accounts-4** An action interrupted by sign-in is finished on return, for one hour, once (save-01).
- **UXD-accounts-5** `next` survives sign-in, sign-up and the confirmation e-mail; the header's "Ingresar" sets it (save-02).
- **UXD-accounts-6** "New since your last visit" uses a first-party cookie and a 30-minute visit gap (save-04).
- **UXD-accounts-7** Alerts can be renamed, switch frequency and hold several values per filter; daily is the default
  (save-05).
- **UXD-accounts-8** The repeat-search prompt appears from the second occasion and never again once declined (save-06).
- **UXD-accounts-9** Optional e-mails carry signed one-click links and RFC 8058 headers; GET never changes state
  (save-07).
- **UXD-accounts-10** Favorites are alerted on drops of 5% or more, once a day per listing (save-08).
- **UXD-accounts-11** Shared lists are revocable unguessable links showing only public listings and the first name
  (save-11).
- **UXD-accounts-12** Follows cover stores and brands; the weekly digest is opt-in (save-12).
- **UXD-accounts-13** One password minimum of 8 and a show/hide eye on every field (auth-01).
- **UXD-accounts-14** A Particular account needs only name, e-mail and password; contact details come at publishing
  (auth-02).

## Notes for other batches
- **find**: place `FollowedArrivals` (data: `get_followed_arrivals`) and the device "Vistos recientemente" on the home
  page; the brand "Seguir" sits under the catalog title (a two-line edit in `catalog-view.tsx`).
- **stores**: `store-header.tsx` has a one-line `FollowButton`; `store-owner-signup-form.tsx` minimum moved to 8.
- **my-listings**: the "Completa tu perfil Particular" notice on `/mi-cuenta` now shows to every new account; it should
  appear only when the person starts publishing (auth-02).
- **sell / inventory**: adopt `PriceInput`, `PhoneInput`, `autoCorrect="off"` on brand and model, and `inputMode="numeric"`
  for stock (auth-03).

## Limitations
- The prototype cannot send e-mail; the e-mail screens are rendered from the templates with the prototype's data.
- Device saves live in this browser only, as stated on the page; clearing site data removes them.
