# Feature ideas: legal review packet

One place for every new legal text the feature-ideas build adds. The reviewer reads the Terms and the Privacy policy on
the integrated branch (`/terminos`, `/privacidad`), then the product lines listed below. Each batch's write-up has the
context (`docs/feature-ideas/<batch>.md`).

Status: **all of it is a draft pending legal review.** Nothing here is on main or in production. features/marketplace
should reach main only after this review, or with the drafts Henri chooses to hold back.

## What is on the pages now

| Page | Section | Source | Shown |
| --- | --- | --- | --- |
| Terms | 3 and 4: four lines on made to order, Fabricante or Taller, Artista verificado and gift exchanges | discovery, in `app/terminos/page.tsx` | always |
| Terms | 4 bis. Medios de pago… (piloto), plus one line on installments (store-floor buy-09) | PAY-1, `components/legal/assisted-commerce-legal.tsx` | only with the pilot switch on |
| Terms | 5 bis. Servicios para músicos | services, `components/legal/services-legal.tsx` | always |
| Terms | 5 ter. Seguridad, confianza y herramientas de venta | integrator, `components/legal/feature-ideas-legal.tsx` | always |
| Privacy | 4 bis. Medios de pago… (piloto) | PAY-1 | only with the pilot switch on |
| Privacy | 4 ter. Servicios para músicos | services | always |
| Privacy | 4 quáter. Seguridad, confianza y herramientas de venta | integrator | always |
| Privacy | 5. Cookies: three new lines (session length, `laria_dispositivo`, data kept only in the browser) | integrator | always |
| Privacy | 6. Proveedores: Google and Apple, OpenFreeMap, Mercado Libre, Nubefact, Meta and Google catalogs | integrator | always |
| Privacy | 8. Tus derechos: download and delete from Tus datos | integrator | always |

The integrator wrote 5 ter, 4 quáter and the lines in sections 5, 6 and 8. Their facts come from the batches'
write-ups and code: retention periods, who sees what, and the cookies. Every batch except services and discovery listed
privacy points without writing them.

## Numbering and the update date

- **Numbering.** The drafts use "bis", "ter" and "quáter" so the approved sections keep their numbers, the same way
  PAY-1's pilot sections do. Once the text is approved, renumbering both pages into a plain sequence reads better. Keep
  the `id` anchors (`#servicios`, `#herramientas`), because pages link to them.
- **`LEGAL_LAST_UPDATED`** (`lib/legal-pages.ts`, now "27 de septiembre de 2026") changes on the day the approved text
  reaches production, in the same PR. PAY-1 changes it again when the pilot goes live.

## Points for the reviewer's judgment

1. **Consumer law and the store's warranty** (store-floor): "Sin garantía adicional de la tienda" and "No acepta cambios
   ni devoluciones" sit next to the legal warranty, which applies anyway. Terms 5 ter says that a store's terms
   don't replace consumer-law rights. Check that this wording is enough.
2. **Campaign price claims** (store-reach): "Laria revisó que S/ X fue el precio más bajo de esta publicación en los 30
   días anteriores a la campaña". Also check the use of "Cyber Wow", which is an IAB Perú trademark.
3. **Stolen-gear reports** (accounts, integration): what Laria does with a report, and with the police. The reporter
   learns only that something matched, and serials in Mi equipo are compared too.
4. **Sharing a person's WhatsApp with a store** (selling-tools, store-floor): it happens on an explicit choice. The data
   is kept for 90 days after the request closes, or after the try-out date.
5. **The buyer card** (deal-trust): it shows the average rating sellers gave the buyer, which V1 kept private. It is
   opt-in and the comments stay private.
6. **Mercado Libre and Meta or Google** (store-reach): use of the Mercado Libre API under its developer terms. The
   catalog steps name Meta and Google, and Laria runs no ads.
7. **Minors in lessons** (services): "acompáñala… Laria no revisa antecedentes".
8. **Counter receipts** (store-locations): Laria keeps the customer's document, name, fiscal address and e-mail with
   each boleta or factura, and sends them to the store's Nubefact account. The draft says Laria processes them on the
   store's behalf. The retention period isn't set yet: the reviewer should say how long Laria keeps them, since the
   store holds the tax copy in Nubefact.
9. **Installments** (store-floor buy-09, pilot only): "o N cuotas sin intereses de S/ X" is shown without a TCEA,
   because only interest-free offers exist, and the store confirms that the buyer pays no interest or surcharge.

## Product lines to review, by batch

Each list is copied from the batch's own write-up.

### Accounts: two-step sign-in, Google and Apple, Tus datos, help center, stolen gear, photo copies

From `docs/feature-ideas/accounts.md`.

- The sign-in line under the Google and Apple buttons (consent to terms and privacy on first sign-in).
- The deletion list and confirmation on `/mi-cuenta/datos`, and the export's description.
- The stolen-gear form, its confirmation, the article "Si te robaron un instrumento" and the `stolen_report_match`
  e-mail (what Laria does with reports and with the police).
- The help articles "Cómo pagar y recibir el equipo de forma segura" and "Señales de una posible estafa".
- The privacy policy should mention the device cookie, the photo hashes, stolen-gear reports and help tickets.

### Deal trust: counter purchases, review photos, seller pages and levels, buyer card, safe meetups

From `docs/feature-ideas/deal-trust.md`.

- The meetup sheet: "Laria no revisa estos lugares ni a las personas, y no puede garantizar cómo resulta un encuentro."
  and the Punto seguro explanation ("La tienda no revisa el instrumento, no recibe pagos y no participa en el trato…").
- Consejos de seguridad: the new section "Si se encuentran en persona" and the paragraph on «Vendedor destacado»,
  «Tienda destacada» and review photo moderation.
- The counter purchase notice: "La tienda registró esta venta en su mostrador y tú la confirmaste con el código de la
  tienda. No verifica pago, garantía, autenticidad ni condición." and the Mostrador note.
- The buyer card consent and the card itself (it shows the average rating sellers gave, FD-deal-trust-12).
- The seller page's closing line and the level's "¿Por qué?" text.
- "Laria las revisa antes de mostrarlas. Evita que se vean rostros, documentos o placas." (review photos).

### Discovery: guides, gifts, makers, made to order, verified artists, Andean category

From `docs/feature-ideas/discovery.md`.

- The four lines in `app/terminos/page.tsx` (made to order; Fabricante/Taller; Artista verificado; gift exchanges).
- The three disclaimers in `lib/discovery/makers.ts`.
- The artist e-mail invitation on `/artistas`.

### Listing details: condition scale, sale terms, combos, map

From `docs/feature-ideas/listing-details.md`.

- "Lo indica quien vende. Laria no gestiona envíos, pagos ni cambios." (listing page, under the terms)
- "Es tu oferta: el precio final lo acuerdan ustedes." (Descuento por combo)
- "Junta varias publicaciones de este vendedor y escríbele una sola vez. Se guarda solo en este dispositivo." (combo)
- "Zona aproximada. El lugar exacto lo acuerdas con quien vende." and "Tu app de mapas te muestra cómo llegar." (map)

### Selling tools: Mi equipo, store offers, consignment, price steps, private offers, reminders, part payment

From `docs/feature-ideas/selling-tools.md`.

- sell-02: "Laria no compra ni paga: la tienda revisa el equipo, confirma el precio final y te paga directamente."
  run-04: "Laria no compra ni cobra: la tienda revisa el equipo, confirma su valor y lo descuenta de tu compra."
  "Al elegirla, <Tienda> verá tu nombre y tu WhatsApp, tú verás su dirección…" The privacy policy should mention that the
  person's WhatsApp goes to the store they choose, and that request photos are kept until 90 days after the request
  closes.
- sell-03: "La comisión y el pago los acuerdan ustedes; Laria no interviene." and the consignment accept screen.
- sell-05: "Oferta para ti … el precio publicado sigue en …" (a private price is not a public discount).
- buy-06: stores named in reminders ("Las tienen: …") are listed by region, not endorsed.

### Services for musicians

From `docs/feature-ideas/services.md`.

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

### Store floor: arrivals, warranty and exchanges, labels, try-outs, installments

From `docs/feature-ideas/store-floor.md`.

- "Sin garantía adicional de la tienda" and "No acepta cambios ni devoluciones": the legal warranty under Peru's
  consumer code applies regardless; the Garantía page tells the store so, but the buyer-facing wording should be
  checked.
- "Lo ofrece {tienda}, no Laria. Confirma las condiciones y pide tu boleta al comprar." under every warranty line.
- "Cambios hasta N días después de la compra: {nota}" as the store's exchange promise.
- Cuotas: "o N cuotas sin intereses de S/ X" without a TCEA (only interest-free offers exist), the store's line "Las
  cobra el proveedor de tarjetas de la tienda", and the owner's confirmation "Confirmo que el comprador no paga
  intereses ni recargos por pagar en cuotas".
- The buyer's WhatsApp number shared with the store for a try-out ("Solo lo ve la tienda, para coordinar la prueba")
  and kept for 90 days after the date.

### Store reach: Mercado Libre import, social catalog, dealers, campaigns, demand report

From `docs/feature-ideas/store-reach.md`.

- Campaign pages and marks: "Laria revisó que S/ X fue el precio más bajo de esta publicación en los 30 días anteriores
  a la campaña", the "Cómo revisa Laria el precio «Antes»" rules, and the use of "Cyber Wow" (IAB Perú trademark).
- Dealer mark: "Qué revisó Laria" and the warranty line.
- Mercado Libre page: "Qué hace Laria con tu cuenta", and Laria's use of the Mercado Libre API under its developer terms.
- Catálogo para redes: the steps naming Meta and Google, and the line that Laria does not run ads.
- Lo que buscan en Laria: "Qué no te dice este reporte" and "Cómo se cuenta" (also for the privacy policy: aggregated
  search counts shown to stores).

### Store locations: sedes and the counter boleta

From `docs/feature-ideas/store-locations.md`.

- Comprobantes: "La cuenta, sus series y su costo son de tu tienda; Laria solo le envía las ventas que registras en el
  Mostrador." and "Lo emite tu tienda con su cuenta de Nubefact."
- The customer data kept with each receipt (document, name, address, e-mail) and for how long; the Privacy draft
  should say stores keep it for their tax records and Laria processes it on their behalf.
- Listing: "Lo agregamos a tu mensaje de WhatsApp. La tienda confirma la disponibilidad."
- Anular: "La anulación se comunica a SUNAT por Nubefact. No cambia el stock."
- Terms (`components/legal/feature-ideas-legal.tsx`): "La tienda es quien emite el comprobante y responde por él ante
  SUNAT; Laria no emite comprobantes ni los revisa: solo envía a esa cuenta las ventas que la tienda registra."
  Reworded on 2026-10-27 to say plainly that Laria issues and checks none; main's public-page check (SCOPE-008) asks
  every sentence that names SUNAT to deny an automatic check.

### Integration

- Admin's stolen-gear queue: "En «Mi equipo» de una cuenta de Particular (privado)" and "Está a la venta: abrir en
  gestión" (`app/admin/equipos-reportados/page.tsx`). Admin sees the item, never its owner.
