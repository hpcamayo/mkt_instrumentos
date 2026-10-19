# Effortless Laria: listing page and WhatsApp (batch "listing")

Build plan: `/mnt/project-files/ux-ideas/build-plan.md`. Ideas: `/mnt/project-files/ux-ideas/ideas.json`. Henri marked
every idea in this batch "yes" on 2026-10-19, with no notes. Migration slot 20261102, acceptance range EASE-100 to
EASE-199 (proposed in `listing-acceptance.tsv`). Screenshots: `/mnt/project-files/ux-ideas/screens/listing/`.

## Fixes (branch `ux/effortless-listing-fixes`)

### fix-03 A store's new WhatsApp number reaches its listings

- **What changed.** A store listing's WhatsApp button now opens the store's current number (page, contact route and
  "Solicitar compra"), the way account-owned Particular listings already follow the profile. A trigger also copies a
  store's new number to its unsold listings, and a one-time update fixes listings that had already drifted, so admin
  screens and every other reader agree. Sold listings keep their number (immutable history).
- **Files.** `lib/seller-contact.ts` (`resolveContactPhone`), `lib/listings.ts`, `app/api/contact/route.ts`,
  `app/instrumentos/[slug]/page.tsx`, `supabase/migrations/20261102120000_ux_store_listing_contact.sql`,
  `tests/ux-listing-contact.sql`, `tests/ux-effortless-listing.test.cjs`.
- **How to test.** Local DB: `tests/ux-listing-contact.sql`. In the prototype, change the demo store's number in Mi
  tienda, then open `/instrumentos/demo-boss-ds-1`: the button's `wa.me` link uses the new number.
- **Defaults.** Only `whatsapp_phone` follows the store; `contact_name` stays as created (nothing public reads it for
  store listings).

### WhatsApp numbers wa.me can open (shared with accounts' fix-01)

- **What changed.** Every `wa.me` link (listing, store, "Solicitar compra") goes through `whatsAppNumber`: a 9-digit
  Peruvian mobile stored without the country code gets `51`, `0051…` loses its international prefix, anything else is
  kept as typed. This is the defensive half; the accounts batch owns storing numbers with +51 (fix-01).
- **Files.** `lib/seller-contact.ts` (`whatsAppNumber`, `whatsAppUrl`), `lib/listings.ts`, and one line in
  `lib/payment-methods.ts` (owned by inventory): `buildPurchaseWhatsAppUrl` now calls `whatsAppUrl`.

### fix-09 (part) "Ver publicaciones similares" never lands on nothing

- **What changed.** On a sold listing the "Publicaciones similares" section stays even when nothing similar is public,
  as one line: "Ahora no hay otras publicaciones de este tipo. Explorar el catálogo" (the type's catalog page). On
  live listings an empty section is still left out (UX-4 L12).
- **Files.** `components/listing/related-listings.tsx` (`emptyText`), `app/instrumentos/[slug]/page.tsx`.

## Listing page and contact (branch `ux/effortless-listing`)

Migrations `20261102120500_ux_listing_registry.sql` (shared type registries), `20261102130000_ux_listing_questions.sql`
(big-11) and `20261102140000_ux_listing_page.sql` (price drops, seller facts, review pages, restock alerts). The page
is `app/instrumentos/[slug]/page.tsx`. Tests: `tests/ux-listing-page.sql`, `tests/ux-listing-questions.sql`,
`tests/ux-effortless-listing-page.test.cjs`, `tests/ux-listing-questions.test.cjs`, `tests/ux-listing-media.test.cjs`,
plus updates to `tests/marketplace-tracking.test.cjs`, `tests/ux-listing.test.cjs`, `tests/ux-copy.test.cjs`,
`tests/sprint-8.test.cjs` and `tests/sprint-9.test.cjs` where the old behaviour was asserted.

### list-02 Say "Laria no procesa pagos" once, clearly

- **What changed.** The listing page's one limitation statement is the line under the contact button on every width,
  "Laria no procesa pagos ni envíos · Cómo comprar seguro"; the link opens the safety sheet (talk-04) in place. The
  separate TrustNote block under the seller card is gone from the listing page, and the reviews note is shortened to
  "Solo se reseña después de una compra que comprador y vendedor confirmaron en Laria."
- **Files.** `components/listing/contact-extras.tsx` (`SafetyLine`), `components/listing/contact-module.tsx`,
  `components/listing/trust-note.tsx`.
- **Legal.** The shortened wording must pass the legal review before production (it is the line buyers read most).
  PAY-1's "Medios de pago" box (inventory-owned) still repeats its own statement; it is left as is.

### list-03 Key specs in one line

- **What changed.** Under the title, up to five key specs in one line ("SSS, Single coil · 6 cuerdas · Cuerpo
  sólido"). A yes/no attribute reads as its label when yes and is left out when no. It replaces the spec chips.
- **Files.** `lib/listing-page.ts` (`keySpecLine`), `lib/listing-specs.ts` (`getSpecStrip` takes a limit).

### list-04 Dates that read like people talk

- **What changed.** "Publicado hoy / ayer / hace 5 días / hace 2 semanas / hace 3 meses / hace 1 año", plus
  "Actualizado hace 3 días" when the seller changed the price, text or details at least a day after publishing
  (`listings.content_changed_at`, kept by the database; view counts never move it). A listing published over 90 days
  ago and untouched for 60 adds "Esta publicación tiene un tiempo: consulta si sigue disponible."
- **Files.** `lib/listing-page.ts` (`timeAgo`, `formatUpdatedAgo`, `isQuietListing`), migration 140000
  (`track_listing_content_change`).

### list-05 Show when a price dropped

- **What changed.** "S/ 808 Antes ~~S/ 950~~" on the listing and on catalog cards for 30 days after a real drop. The
  database records a drop only for an approved listing, at least 5% below a price that had been in effect for 7 days;
  a further drop within 30 days keeps the original "Antes", and any increase clears it. Sold listings never show it.
- **Files.** Migration 140000 (`previous_price_pen`, `price_dropped_at`, `price_changed_at`), `lib/listing-page.ts`
  (`visiblePreviousPrice`), `components/ui/price.tsx`, `components/listing-card.tsx` and `lib/catalog.ts` (find-owned,
  one prop and two select columns).
- **Limitation.** The home and store pages' card queries (other batches) do not select the two columns yet, so their
  cards show no "Antes" until they add them.

### list-06 All the reviews, not just five

- **What changed.** The reviews section shows the count per star and, when there are more than five, "Ver las N
  reseñas" loads the rest 20 at a time in place.
- **Files.** Migration 140000 (`get_public_review_page`), `app/api/listing-reviews/route.ts`,
  `components/listing/review-list.tsx`, `components/listing/reputation-section.tsx`.
- **Screenshot note.** The demo seed has no published reviews, so `list-06-reviews-*.png` shows the empty state; the
  breakdown and "Ver las N reseñas" are covered by `tests/ux-effortless-listing-page.test.cjs`.

### list-07 Better "Similares"

- **What changed.** Up to 8 similar listings in a horizontal row (snap scrolling; arrow buttons from 768 px), ranked
  without the catalog: same brand first, then a price within 30%, then the same city, newest among equals. Candidates
  are the same type (or category) plus the same brand in the category.
- **Files.** `lib/listing-page.ts` (`rankSimilarListings`), `components/listing/scroll-row.tsx`,
  `components/listing/related-listings.tsx` (`layout="row"`), the page's `getSimilarListings`.

### list-10 The seller at a glance and trust-03 Badges that explain themselves

- **What changed.** The seller card leads with facts Laria records when the seller has fewer than 10 reviews:
  "Activo hoy / esta semana / este mes" (coarse, from the last sign-in), "N ventas confirmadas en Laria", "Nuevo en
  Laria" under 60 days (else "En Laria desde …"), and "Correo confirmado" for Particulares. WhatsApp reply time is
  left out (Laria does not record it). "Tienda verificada" opens to say what Laria checked by hand and since when: RUC,
  razón social, address and that a contact phone is on file, plus what verification does not mean.
- **Files.** Migration 140000 (`get_public_seller_facts`), `lib/listing-page.ts` (`readSellerFacts`),
  `components/listing/seller-card.tsx`, `components/listing/verified-explainer.tsx` (reusable on the store page).

### list-11 "Avísame" on sold and out-of-stock listings

- **What changed.** An out-of-stock listing offers "Avísame cuando vuelva" to signed-in buyers: when its stock comes
  back, they get one in-app notice ("Volvió a estar disponible") and one e-mail, and the watch ends. A sold listing
  offers "Avísame si aparece otro", which creates an immediate search alert for its category, type and brand (a
  duplicate counts as already created).
- **Files.** Migration 140000 (`listing_stock_watches`, `set_listing_stock_watch`, `get_listing_stock_watch`,
  `listings_notify_stock_watchers`), `app/api/listing-viewer/route.ts`, `components/listing/listing-viewer.tsx`
  (`RestockAlert`, `SimilarAlert`), `components/notifications-list.tsx` and `lib/email/templates.ts` (accounts-owned,
  one entry each).

### talk-01 A WhatsApp message that already says everything

- **What changed.** "Hola, vi tu Boss DS-1 en Laria a S/ 299: https://laria.audio/instrumentos/boss-ds-1 ¿Sigue
  disponible?" ("su" for stores; no price when it is "a consultar"; an out-of-stock variant asks if it will come back).
- **Files.** `lib/contact-message.ts`, `lib/listings.ts`, `app/api/contact/route.ts`.

### talk-02 Quick questions before opening WhatsApp

- **What changed.** Four optional chips above the button ("¿Puedo probarlo?", "¿Haces envíos a provincia?",
  "¿Incluye estuche o funda?", "¿El precio es negociable?"; store wording differs). None is preselected; the chosen
  ones are added to the message when the button is pressed. Hidden on "Solicitar compra", whose message is fixed.
- **Files.** `lib/contact-message.ts` (`quickQuestions`, `withQuestions`), `components/listing/contact-extras.tsx`,
  `components/listing/contact-state.ts`.

### talk-03 Straight into WhatsApp

- **What changed.** The contact button is a plain link that opens WhatsApp immediately. The contact is recorded in
  the background with `keepalive`; nothing waits for the route and a failed record never blocks the buyer.
- **Files.** `components/whatsapp-contact-link.tsx`, `tests/marketplace-tracking.test.cjs`.

### talk-04 A safety tip at the moment it matters

- **What changed.** Before the first contact about something from S/ 1,000, or before any "Solicitar compra", a sheet
  shows three tips (test before paying, never pay ahead to strangers, confirm Yape/Plin in your own app and ask for
  Yape's 3-digit code) and "Continuar". It appears once per browser.
- **Files.** `components/listing/safety-sheet.tsx`, `components/listing/contact-state.ts`, `lib/contact-message.ts`
  (`needsSafetySheet`).
- **Legal.** The tips need the same legal review as list-02.

### talk-05 "Ingresa antes de escribir", gently

- **What changed.** Visitors see one quiet line above the button: "Ingresa antes de escribir para luego confirmar la
  compra y dejar una reseña." Nothing blocks contacting without an account.
- **Files.** `components/listing/contact-extras.tsx` (`SignInHint`).

### mine-05 Owner shortcuts on your own listing

- **What changed.** On their own listing, the seller sees "Es tu publicación" with Editar, Bajar precio (opens the
  edit form at the price) and Marcar vendida (asks first, then goes to the sale's confirmation), or "Ver en
  Inventario" for stock-managed store listings.
- **Files.** `app/api/listing-viewer/route.ts`, `components/listing/listing-viewer.tsx` (`OwnerBar`).
- **Also.** `/instrumentos/<listing id>` (used by notification links) now redirects to the listing's slug.

### big-11 Public questions on listings

#### What changed

Buyers can ask a short public question on a published listing ("Preguntas", `#preguntas`), and the seller answers it
once; the answer stays for every later visitor, so the same question is not asked over WhatsApp again and again.

- **Asking**: signed in, not on your own listing, only on a published listing (`listing_is_public`). The question
  shows at once (no pre-moderation). 5–300 characters. The PAY-1 contact-detail filter applies: no run of 6+ digits
  (spaces, dots and dashes ignored), no links, no e-mails, with the message "No escribas números de teléfono, enlaces
  ni correos…". The form checks the same rules before sending (`lib/listing-questions.ts`), so most mistakes never
  reach the server.
- **Limits**: 3 unanswered questions per buyer per listing; 20 questions per buyer in any 24 hours.
- **Answering**: the listing owner, or the store owner for a store listing; once; 2–600 characters; same filter. No
  edits for either side; the seller cannot delete.
- **Notifications**: a new question gives the seller an in-app notification ("Te hicieron una pregunta", with the
  question's first 120 characters) and an e-mail ("Te hicieron una pregunta en Laria", button "Responder" to
  `/instrumentos/<slug>#preguntas`). An answer gives the asker an in-app notification only ("Respondieron tu
  pregunta"). Both open `/instrumentos/<listing id>#preguntas`.
- **Moderation**: "Reportar pregunta" (signed in, not your own question) files a report with target `question` through
  `submit_content_report`. An admin sees "Ocultar" / "Mostrar" under each question, with a required reason; hidden
  questions disappear for everyone else and stay visible to admins tagged "Oculta" with the reason. Both actions go to
  the admin audit.
- **Sold listings**: existing Q&A stays visible read-only with a note; no new questions or answers. A sold listing
  without questions shows no section.

#### Files

- `supabase/migrations/20261102130000_ux_listing_questions.sql`: table, RPCs, report target, audit target.
- `lib/listing-questions.ts`: limits, contact-detail check, RPC parser, error mapping.
- `app/api/listing-questions/route.ts`: `GET ?listingId=`; `POST {action: "ask" | "answer" | "hide" | "restore",
  listingId, body | questionId + answer | questionId + reason}`, same-origin checked; returns the refreshed state.
- `components/listing/listing-questions.tsx`: `ListingQuestions({ listingId, sold, loginHref, initialState? })`.
- `components/content-report.tsx`: `ReportTarget` gains `"question"`.
- `components/notifications-list.tsx`: labels and links for the two notification types.
- `lib/email/templates.ts`: `listing_question_asked` template.
- Tests: `tests/ux-listing-questions.sql`, `tests/ux-listing-questions.test.cjs`. Docs: `docs/database.md`
  (`ux-effortless:listing questions`), acceptance rows EASE-170–179 (`listing-acceptance.tsv`).

#### How to test

1. Apply the migration: `psql -h 127.0.0.1 -p 54322 -U postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261102130000_ux_listing_questions.sql`.
2. `psql … -v ON_ERROR_STOP=1 -q -o /dev/null -f tests/ux-listing-questions.sql` and
   `node --require ./tests/setup-alias.cjs --test tests/ux-listing-questions.test.cjs`.
3. In the app: open a published listing signed out (empty state, "Ingresa para preguntar"); sign in as a buyer and ask
   ("Hola" and a phone number are refused in place); sign in as the seller, check Notificaciones and answer; sign in as
   an admin and hide, then show the question.

#### Defaults picked

- "Per day" is a rolling 24 hours, counting every question the buyer asked (hidden ones included). The per-listing
  limit counts unanswered visible questions only, so a hidden question does not block the asker.
- Whitespace is folded to single spaces (no line breaks in questions or answers).
- Up to 100 questions are returned per listing, newest first; no pagination.
- Asker names are "Nombre I." built in the database; the full name never leaves it. A missing name reads "Usuario de Laria".
- Answers are refused once the listing is no longer published (sold, paused, hidden), matching "read-only" on sold.
- Signed-out visitors do not see "Reportar pregunta" (it would repeat a sign-in link under every question).
- The section loads its data on the client after the account check; the server renders "Cargando preguntas…".
- Questions show at once, before any answer, for everyone (coordinator default).

#### Limitations

- Admin report pages (`get_admin_reports_page`, the moderation queue) do not know the `question` target yet: a
  question report is listed, but its title and status columns fall back to the review wording and the type filter
  does not offer "question". Admins act from the listing page ("Ocultar").
- The seller is not told when a question is hidden; the asker is not told when their question is hidden.
- The e-mail does not quote the question (the e-mail context only carries a few fixed keys); the in-app notification does.
- If `laria_private.enqueue_notification_marketplace_email` ever starts handling `listing_question_asked`, the seller
  would get a second e-mail under a different dedupe key; the type is queued from `ask_listing_question` on purpose.

### list-01 Zoom into photos

- **What changed.** The lightbox photo can be zoomed up to 4x: pinch with two fingers, double tap or double click
  (1x ↔ 2.5x at the tapped point), the mouse wheel or a trackpad pinch, the "Acercar" / "Alejar" 44 px buttons, and the
  keys `+`, `-` and `0` (back to 1x). While zoomed, one finger or the mouse drags the photo, and it stops at the photo's
  edges. A sideways swipe changes photo only at 1x. Changing photo (arrows, swipe, buttons) resets the zoom. Buttons,
  keys and double taps glide for 160 ms, or move instantly under reduced motion. A polite screen-reader line says
  "Foto ampliada al 300 %". Once a photo is zoomed, it is requested again at that many viewport widths so it stays sharp.
  The next and previous photos load hidden behind the current one so moving between them is instant. On the page
  gallery, the second photo now loads eagerly.
- **Fix found on the way.** Before this change, closing the lightbox did not return focus to the button that opened
  it, because `focus()` ran while the modal was still open and the page was inert. Focus now returns after the
  lightbox unmounts (`preventScroll`, so the track stays on the last photo shown).
- **Files.** `lib/photo-zoom.ts` (pure math: clamp, zoom at a point, pinch, pan, step, wheel),
  `components/listing/lightbox.tsx`, `components/listing/listing-gallery.tsx`, `app/globals.css` (`.lightbox-stage`,
  `.lightbox-photo`), `tests/ux-listing-media.test.cjs`, `tests/ux-listing.test.cjs` (second photo eager; focus return).
- **How to test.** Open any listing and tap the photo. On a phone: pinch, double tap, then drag; swipe sideways while
  zoomed (it pans, and the photo does not change), press "Alejar" until 1x, then swipe (the photo changes). On a desktop:
  use the wheel over a detail, `+` / `-` / `0`, drag, double click, the arrow keys and Esc (focus is back on the photo).
- **Defaults.** Max 4x; double tap 2.5x; buttons step by whole levels (1x, 2x, 3x, 4x; from an in-between zoom they snap
  to the next whole level). "Alejar" is `aria-disabled` at 1x and "Acercar" at 4x, so focus is never lost.
- **Limitations.** The wheel always zooms (a trackpad's two-finger scroll zooms too, but does not pan). Photos served
  unoptimized (the demo's placehold.co images) cannot be requested sharper. Arrow keys change photo even while zoomed.

### list-08 Share in one tap

- **What changed.** `ShareListing` (`components/listing/share-button.tsx`). Where the browser has a share sheet (phones,
  Safari, Edge), "Compartir" opens it in one tap with the title, "<título> a <precio> en Laria" and the link. Elsewhere,
  it opens a small menu (shell-menu rules via `useDisclosure`: Esc, outside press, one menu at a time) with
  "Copiar enlace" (a polite "Enlace copiado"), "WhatsApp" (`wa.me/?text=`) and "Descargar imagen para estados" (downloads
  the story PNG as `laria-<slug>.png`). On touch devices that can share files, the module variant adds a quiet
  "Compartir imagen" button, which shares the story PNG as a file together with the text and link. The PNG starts loading
  on touch, so the share sheet still opens from the same tap. If a browser refuses the late share, the message says the
  image is ready and asks the person to tap again.
- **Props.** `{ url: string (absolute), title: string, priceLabel: string | null, storyImageUrl: string,
  variant?: "module" | "icon", className?: string }`. Also exported: `ShareOptions` (the menu), `shareText`,
  `whatsAppShareUrl` and `storyFileName`.
- **Variants.** `module`: a full-width secondary button, 44 px, plus "Compartir imagen" on phones. `icon`: a 44 px
  icon button with `aria-label="Compartir"`, which opens the share sheet or the menu; it has no image option.
- **How to test.** Use desktop Chrome on Linux or Windows (no share sheet) to see the menu: copy, WhatsApp, download.
  On Android Chrome or iOS Safari, the sheet opens; "Compartir imagen" shares the PNG to WhatsApp Status.
- **Limitations.** Detection of share support runs after hydration, so the first paint always shows the menu form, which
  looks identical. No analytics event is recorded.

### list-09 Links that look good in WhatsApp (and the story image)

- **What changed.** Share images drawn with `next/og` (bundled with Next, no new dependency) in its built-in Noto Sans,
  which covers every Spanish accent. All drawing code and data loading live in `lib/share-image.tsx`.
  - `app/opengraph-image.tsx`: a 1200x630 generic Laria card (frame black, "Laria" in action yellow, "El mercado de
    instrumentos del Perú", laria.audio).
  - `app/instrumentos/[slug]/opengraph-image.tsx`: for a category landing, its name "en Laria". For a listing (public
    exactly as its page: approved and `listing_is_public`, or sold with an active store), it shows the first photo on
    white, the title, price, condition, "Tienda verificada", and "Vendido" or "Agotado". Any failure falls back to the
    generic card.
  - `app/instrumentos/[slug]/historia/route.tsx`: a 1080x1920 PNG for WhatsApp Status (photo large, title, price,
    condition, badges, "Encuéntralo en laria.audio"). It returns 404 for non-public listings and sends
    `Cache-Control: public, max-age=300`.
  - Photos: satori cannot read WebP, so the photo is requested from Next's image optimizer as JPEG at 1080 px, then
    directly (PNG, JPEG, GIF and SVG are accepted). The total budget is 3 s, and the card is drawn without the photo if
    none arrives. Listing images are cached `max-age=300, s-maxage=3600, stale-while-revalidate=86400`, so a new price
    or "Vendido" reaches previews within the hour.
- **Wiring (owned files).** Next applies a file-based image only when that segment's own `openGraph` has no `images`
  key, and a child's `openGraph` replaces the parent's whole object. Today's `lib/seo.ts` sets `openGraph.images` on
  listings, and `/listados` plus the legal pages set `openGraph` without images, so they lose the root card. This batch made edit 1 below; edits 2 and 3 touch other batches' files and are left to the integrator.
- **How to test.** `curl -I localhost:3000/instrumentos/<slug>/opengraph-image` and `/historia` return PNG 200. Check
  `<meta property="og:image">` on `/`, `/instrumentos/guitarras` and a listing. Paste a production listing link in
  WhatsApp.
- **Limitations.** No bold weight (Noto Sans regular only; satori cannot read the repo's WOFF2 Archivo). `og:image:alt`
  is the listing title on listings; other pages keep a fixed string. The demo's placehold.co photos
  cannot be reached from this sandbox, so the live demo cards show no photo; the photo layout was rendered from a local
  JPEG (`list-09-og-listing-photo.png`, `list-08-story-photo.png`).

#### Edits to owned files (1 made here; 2 and 3 for the integrator)

1. `lib/seo.ts`, `buildListingMetadata`: replace the `images` spread with
   `images: [{ url: \`/instrumentos/${listing.slug}/opengraph-image\`, width: 1200, height: 630, type: "image/png", alt: listing.title }]`,
   and set `twitter: { card: "summary_large_image", title, description }`. Keep `listingImages` for JSON-LD.
2. `lib/seo.ts`, so pages that set `openGraph` keep the Laria card: export
   `const DEFAULT_OG_IMAGES = [{ url: "/opengraph-image", width: 1200, height: 630, type: "image/png", alt: "Laria, el mercado de instrumentos del Perú" }]`
   and add `images: DEFAULT_OG_IMAGES` in `buildCatalogMetadata` (`pageMetadata`) and in `buildStoreMetadata` when there
   is no logo. The legal pages (`/terminos`, `/privacidad`, `/articulos-prohibidos`, `/consejos-de-seguridad`) need the
   same line in their own `openGraph`. `buildCategoryMetadata` and `buildHomeMetadata` need nothing.
3. `app/layout.tsx`: `twitter.card: "summary_large_image"` (optional), so X shows the large card everywhere.

## Proposed decisions

| ID | Decision |
| --- | --- |
| UXD-listing-1 | Store listings take their WhatsApp contact from the store's current number; unsold listings' stored copy follows the store, sold ones keep theirs. wa.me links add 51 to 9-digit mobiles. |
| UXD-listing-2 | A sold listing's "Publicaciones similares" stays as a one-line pointer to the catalog when nothing similar is public. |
| UXD-listing-3 | The listing page states the payment limitation once, as the line under the contact button with "Cómo comprar seguro"; TrustNote leaves the listing page. |
| UXD-listing-4 | A price drop is public ("Antes") for 30 days only when the listing is approved, the drop is at least 5% and the old price had stood 7 days. |
| UXD-listing-5 | The seller card shows only facts Laria records (activity bucket, confirmed sales, member age, confirmed e-mail; verified stores' checked RUC, razón social and address). No reply-time claims. |
| UXD-listing-6 | The WhatsApp opening message carries title, price and link; quick questions are optional, never preselected. |
| UXD-listing-7 | Contact opens WhatsApp at once; recording is fire-and-forget. A one-time safety sheet precedes contacts from S/ 1,000 and every purchase request. |
| UXD-listing-8 | Public Q&A on listings (big-11) is allowed in V1: public, one answer, contact details filtered, reportable and hideable by Admin. It is not private messaging. |
| UXD-listing-9 | Back-in-stock alerts are opt-in per listing, fire once and end; sold listings offer a similar-listings search alert instead. |
| UXD-listing-10 | The listing page offers "Compartir" again (reverses UX-4 L8), with generated link previews and a story image for public listings only. |
