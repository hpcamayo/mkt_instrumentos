# Requests about personal data (ARCO)

Launch audit A20. Ley N.° 29733, Ley de Protección de Datos Personales, and its regulation give every person the
rights of información, acceso, rectificación, cancelación and oposición, and portabilidad since the 2024 regulation.
This is how Laria answers them.

**Pending legal review.** The deadlines and steps below follow the regulation as read on 27 Oct 2026. A lawyer should
confirm them before launch, together with sections 7 and 8 of the privacy page (`app/privacidad/page.tsx`).

## Receiving a request

- Any message to the privacy contact on `/privacidad` (`NEXT_PUBLIC_CONTACT_EMAIL`) that asks for one of these rights
  is a request, whatever words it uses ("borren mi cuenta", "quiero saber qué datos tienen").
- Log it the day it arrives: date, who wrote, which right, the account (e-mail or profile id) and the due date from the
  table below. Keep the log outside Laria's database, so that anonymising the account doesn't erase it.
- Identity: the request must come from the account's e-mail address, or the person shows they hold the account (for
  example, signing in and writing from the address the account uses, or a DNI whose name matches the account's).
  Someone acting for the person needs a written authorization.
- Incomplete request: within 5 business days, tell the person what is missing. They have 5 business days to complete
  it; otherwise it is closed and they can file it again.

## Deadlines

Business days in Peru, from the day after the request arrives complete.

| Right | Answer within |
| --- | --- |
| Información (what data, for what, with whom) | 8 |
| Acceso (a copy of their data) | 20 |
| Portabilidad (their data in a reusable format) | 20 |
| Rectificación | 10 |
| Cancelación | 10 |
| Oposición | 10 |

When a case justifies it, a deadline can be extended once, by the same length, telling the person why before it runs
out. The Libro de Reclamaciones is separate: a complaint is answered within 15 business days, with no extension.

## Doing it

- **Información.** Answer with sections 1 to 7 of `/privacidad`, adapted to what the person asked.
- **Acceso and portabilidad.** In the Supabase SQL editor, read the person's rows: `profiles`, `listings` (and their
  photos), `stores`, `favorites`, `saved_search_alerts`, `listing_drafts`, `reports` they filed, `verified_transactions`
  and `transaction_reviews` they are part of, and their `notifications`. Send them as a CSV or JSON file. Never include
  other people's data (a buyer's name in a sale, a reporter's identity).
- **Rectificación.** Name, WhatsApp, city and region: the person changes them in `/mi-cuenta/perfil`, or Admin does.
  A wrong e-mail: change it in Supabase (Authentication, Users).
- **Cancelación.** Admin, Usuarios: find the account and use "Anonimizar cuenta". The reason names the request, for
  example "Solicitud de cancelación por correo del titular, 27/10/2026". It needs the authenticator code like every
  Admin action.
  - It refuses the owner of an active store: hide the store first (Admin, Tiendas, "Ocultar tienda", with the same
    reason). It refuses an Admin account: remove the Admin role first.
  - What it clears and what stays: `docs/database.md`, "Launch audit: privacy". Sales, reviews and reports stay
    without the person's data; Libro de Reclamaciones entries stay with the data the law requires, for the period it
    requires.
  - The account's history, with the reason, is at `/admin/auditoria/account/<id>` ("Ver auditoría" on its card).
- **Oposición.** Stop the processing the person objects to: e-mails (their e-mail preferences, or the unsubscribe link
  in every e-mail), browser notices (they turn them off in Mi cuenta, or delete their rows of
  `laria_private.push_subscriptions`). Objecting to everything Laria does with their data amounts to cancelación.

## Answering

Answer in writing, in Spanish, from the privacy address, within the deadline: what was asked, what was done and when,
and for cancelación what Laria keeps and why. For example:

> Hola, Ana: el 27 de octubre de 2026 anonimizamos tu cuenta de Laria, como pediste. Borramos tu nombre, teléfono,
> correo, contraseña, favoritos, alertas y borradores, y archivamos tus publicaciones no vendidas sin tus datos de
> contacto. Conservamos, sin tus datos, las ventas confirmadas, las reseñas y los reportes, porque también son
> registros de otras personas. Si tienes alguna duda, responde a este correo.

If a request is refused (identity not shown, or a legal duty to keep the data), say so and why, and that the person
can complain to the Autoridad Nacional de Protección de Datos Personales.

## Retention that runs on its own

- Files nobody uses: removed after 48 hours by the daily sweep (`/api/internal/uploads/sweep`, 09:30 UTC).
- Analytics events: the account, session and identity are removed after 90 days for browsing events and after 365
  days for the rest (pg_cron `marketplace-event-retention`, 09:45 UTC).
