# Auth Email Templates

This document is the owner-facing setup reference for Supabase Auth email copy during Phase 2 seller/store accounts.

## Current Approach

Laria uses Supabase Auth invite links and magic links. There is no external email provider in this sprint.

Password recovery also uses Supabase Auth. The app calls `resetPasswordForEmail` with `/auth/callback?next=/restablecer-contrasena`; after token verification, the user sets a new password in the authenticated recovery session. Marketplace email infrastructure is not involved.

All browser auth emails must send their token hash through Laria's callback. The callback verifies that token server-side and writes the session cookies on the redirect response. Do not use the default confirmation URL in these three templates: its implicit URL fragment cannot establish the server-readable session required by protected Next.js routes.

Type-specific invite behavior is handled by the invite metadata and redirect URL:
- Seller invite metadata: `account_type='seller'`
- Store owner invite metadata: `account_type='store_owner'`
- Seller invite redirect path: `/registro/vendedor/invitacion`
- Store invite redirect path: `/registro/tienda/invitacion`
- Magic links redirect through `/auth/callback?next=...`

Supabase may expose only one built-in `Invite user` email template in the Dashboard. If that is the case, use one generic invite template in Supabase and rely on the `redirectTo` URL plus onboarding pages for seller/store-specific messaging. Truly separate seller/store invite email bodies may require a custom email provider or custom server-side email flow later.

## Required Redirect URLs

Configure these in Supabase Auth URL settings:
- `http://localhost:3000/auth/callback`
- `https://laria.audio/auth/callback`
- `https://laria.pro/auth/callback`
- `https://*.vercel.app/auth/callback` if preview invite/magic-link testing is needed

## Seller Invite

Use when inviting an individual seller.

Invite metadata:

```json
{
  "account_type": "seller"
}
```

Redirect target:

```text
/auth/callback?next=/registro/vendedor/invitacion
```

Subject:

```text
Activa tu cuenta de vendedor en Laria
```

Body:

```html
<h2>Te invitamos a vender en Laria</h2>

<p>Hola,</p>

<p>Te hemos creado una invitación para administrar tus publicaciones en Laria, el marketplace de instrumentos y equipos musicales en Perú.</p>

<p>Desde tu cuenta podrás publicar instrumentos, subir fotos, editar tus publicaciones, marcarlas como vendidas o retirarlas cuando ya no estén disponibles.</p>

<p>
  <a href="{{ .ConfirmationURL }}">Activar mi cuenta de vendedor</a>
</p>

<p>Si no esperabas esta invitación, puedes ignorar este correo.</p>

<p>Equipo Laria</p>
```

## Store Owner Invite

Use when inviting a store owner.

Invite metadata:

```json
{
  "account_type": "store_owner"
}
```

Redirect target:

```text
/auth/callback?next=/registro/tienda/invitacion
```

Subject:

```text
Activa la cuenta de tu tienda en Laria
```

Body:

```html
<h2>Te invitamos a registrar tu tienda en Laria</h2>

<p>Hola,</p>

<p>Te hemos creado una invitación para iniciar el registro de tu tienda en Laria, el marketplace de instrumentos y equipos musicales en Perú.</p>

<p>Después de activar tu cuenta, podrás completar los datos de tu tienda. El equipo de Laria revisará la solicitud y, una vez aprobada, podrás publicar productos desde tu cuenta.</p>

<p>
  <a href="{{ .ConfirmationURL }}">Activar cuenta de tienda</a>
</p>

<p>Si no esperabas esta invitación, puedes ignorar este correo.</p>

<p>Equipo Laria</p>
```

## Magic Link

Use for normal login links from `/login`.

Default redirect target:

```text
/auth/callback?next=/mi-cuenta
```

Subject:

```text
Tu enlace de acceso a Laria
```

Body:

```html
<h2>Accede a tu cuenta de Laria</h2>

<p>Hola,</p>

<p>Usa este enlace para ingresar a tu cuenta de Laria:</p>

<p>
  <a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=magiclink">Ingresar a Laria</a>
</p>

<p>Este enlace es personal. Si no solicitaste iniciar sesión, puedes ignorar este correo.</p>

<p>Equipo Laria</p>
```

## Password Recovery

Use Supabase's built-in `Reset Password` template. Its link must retain the redirect configured by the app so the browser returns through `/auth/callback?next=/restablecer-contrasena`:

```html
<h2>Restablece tu contraseña de Laria</h2>

<p>Usa este enlace para elegir una contraseña nueva:</p>

<p>
  <a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">Restablecer contraseña</a>
</p>

<p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
```

The callback forces recovery tokens to `/restablecer-contrasena`, regardless of an injected `next` value. Invalid or expired tokens return safely to login without creating a session.

## Particular Signup Confirmation

Use the `Confirm signup` template with the token-hash callback link:

```html
<h2>Confirma tu cuenta Particular en Laria</h2>

<p>Confirma tu correo para comprar y vender instrumentos en Laria:</p>

<p>
  <a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">Confirmar mi correo</a>
</p>

<p>Si no creaste esta cuenta, puedes ignorar este correo.</p>
```

The signup redirect includes the encoded destination `/mi-cuenta?confirmed=1`, so successful confirmation opens the dashboard with an explicit verified-email message.

## Manual Supabase Setup

In Supabase Dashboard:
1. Open the Laria project.
2. Go to Authentication settings.
3. Confirm the redirect URLs listed above are allowed.
4. Go to Email Templates.
5. Set the `Confirm signup`, `Magic Link`, and `Reset Password` links to the token-hash versions in this document.
6. Set the `Invite user` template. If Supabase allows only one invite template, use the store-neutral or most common version and keep type-specific messaging on the post-click onboarding pages.
7. Test a real Particular confirmation and confirm it ends at `/mi-cuenta?confirmed=1` with an authenticated session.
8. Test a magic link and a recovery link. Confirm protected navigation remains authenticated and recovery always opens `/restablecer-contrasena`.
9. Test a seller invite with `redirectTo=/auth/callback?next=/registro/vendedor/invitacion`.
10. Test a store owner invite with `redirectTo=/auth/callback?next=/registro/tienda/invitacion`.

Keep this document limited to Supabase Auth messages. Payments, checkout, chat, delivery, commissions, and subscriptions remain post-V1; required verified-transaction review notifications belong to the future centralized marketplace email flow, not to account setup templates.
