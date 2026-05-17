# Auth Email Templates

This document is the owner-facing setup reference for Supabase Auth email copy during Phase 2 seller/store accounts.

## Current Approach

Laria uses Supabase Auth invite links and magic links. There is no external email provider in this sprint.

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
  <a href="{{ .ConfirmationURL }}">Ingresar a Laria</a>
</p>

<p>Este enlace es personal. Si no solicitaste iniciar sesión, puedes ignorar este correo.</p>

<p>Equipo Laria</p>
```

## Manual Supabase Setup

In Supabase Dashboard:
1. Open the Laria project.
2. Go to Authentication settings.
3. Confirm the redirect URLs listed above are allowed.
4. Go to Email Templates.
5. Set the `Magic Link` subject/body from this document.
6. Set the `Invite user` template. If Supabase allows only one invite template, use the store-neutral or most common version and keep type-specific messaging on the post-click onboarding pages.
7. Test a seller invite with `redirectTo=/auth/callback?next=/registro/vendedor/invitacion`.
8. Test a store owner invite with `redirectTo=/auth/callback?next=/registro/tienda/invitacion`.

Do not add payments, checkout, chat, reviews, delivery, commissions, or subscriptions as part of account email setup.
