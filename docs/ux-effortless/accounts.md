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
