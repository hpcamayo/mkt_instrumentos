# Effortless Laria: speed, install and push

Build write-up for the speed batch of the Effortless Laria program (`/mnt/project-files/ux-ideas/build-plan.md`), built
by the integrator in the Quality-of-life features thread. Ideas: fast-01 (the loading states and the navigation bar),
fast-03, fast-04, big-12, and the fix-09 part in `app/error.tsx`. Migration slot 20261108, acceptance range EASE-700 to
EASE-749 (proposed in `speed-acceptance.tsv`, all Not Run); EASE-750 to EASE-799 hold the integration checks
(`integration.md`).

The other parts of fast-01 belong to other batches: the listing page reads its data in parallel (listing), hearts and
saves answer at once (accounts), uploads show their progress (selling).

## fix-09 "Reintentar" on the error page

- **What changed.** The 500 page inside the site shell has "Reintentar". It asks the server for the page again and
  re-renders the failed part in one transition (`router.refresh()` and `reset()`), so a passing failure clears in
  place and the address stays. `reset()` alone would replay the failed server answer.
- **Files.** `app/error.tsx`, `tests/ux-effortless-speed.test.cjs`.

## fast-01 Instant feedback on every tap

- **What changed.** A tap on a link or a GET form (search, filters) that changes Laria's page starts the feedback:
  - a thin bar at the top of the screen appears after 100 ms and finishes when the new address commits, so anything
    faster reads as instant and shows nothing;
  - after a second, screen readers hear "Cargando la página…", and a listing, a store page or the account (arriving
    from outside it) shows its skeleton over the old page, below the header when the header is on screen;
  - the old page is covered, never removed or scrolled, so its history entry keeps its place for "Atrás";
  - inside the account, its frame (the rail and the section switcher) stays on screen, so there is no skeleton there;
  - a heart or another control inside a card's link is not a page change, and neither are other sites, new tabs,
    downloads, files, API routes or a #section on the same page;
  - a change that never commits (a failed request becomes a full page load) lets the bar go after 15 s.
- **No loading.tsx.** Henri's Q1 A (2026-10-08) removed `app/listados/loading.tsx` because with it some catalog
  transitions never committed in Next 15.5. The skeletons are drawn by the client from the same `Skeleton` primitive,
  so the owner decision stands and no route gets a loading file.
- **Files.** `lib/navigation-feedback.ts` (which taps count and which pages get a skeleton),
  `components/navigation-feedback.tsx`, `components/navigation-skeletons.tsx`, `app/layout.tsx`, `app/globals.css`,
  `tests/ux-effortless-speed.test.cjs`.
- **How to test.** On a phone-sized window with the network throttled to "Slow 4G", open a listing from the catalog:
  the bar shows at once and, past a second, the listing skeleton. On a fast connection nothing flashes.
- **Defaults picked.** 100 ms for the bar and 1 s for the skeleton (Doherty threshold and NN/g's advice that a
  skeleton flashing on a fast load feels slower than none). The bar is 3 px of the accent color (the system highlight
  in forced colors), and under reduced motion it fills without gliding.

## fast-03 Respect prepaid data

- **What changed.** When the phone asks to save data (Save-Data) or the browser measures a slow connection (3G or
  slower), Laria asks for smaller images and loads nothing ahead of time:
  - an image that appears after the page has loaded (the next page, a gallery, more results) asks for about 1.5 device
    pixels per CSS pixel instead of the screen's full density, from the same `srcset`, so the smaller files are ones
    Next already serves to other screens; on the 2x and 3x screens most phones have, that is a third to a half of the
    bytes;
  - the choice is fixed at the image's first render, so an image the server already sent never downloads twice;
  - listing cards stop loading the listing page ahead of time (the first row's prefetch and the hover or focus
    prefetch).
- **Files.** `lib/data-saver.ts`, `components/marketplace-image.tsx`, `components/listing-card.tsx`,
  `tests/ux-effortless-speed.test.cjs`.
- **How to test.** In Chrome's device toolbar choose "3G" (or turn on the phone's data saver), open the catalog and
  scroll: new images request a smaller `w=` width, and opening a card's page was not loaded beforehand.
- **Limitations.** The Network Information API exists in Chromium browsers only (most phones in Peru run Android);
  Safari and Firefox always get the full images. The first page's images come with the server's HTML, which cannot see
  the connection, so they are the usual size.

## fast-04 Accessible by design

- **What changed.** The approved ideas brought swipes, drags, sticky bars and live updates. At integration every page
  was checked against WCAG 2.2 AA and the gaps closed:
  - **Every gesture has a button.** The gallery's swipe has its thumbnails and arrows, the lightbox's swipe and pinch
    have "Foto anterior", "Foto siguiente", "Acercar" and "Alejar" (and the keys), and dragging a photo to reorder it
    has "Mover foto … antes" and "… después".
  - **Sticky bars never cover a focused field.** Every bar fixed to the bottom of the screen carries `data-bottom-bar`
    and measures itself (`BarHeight` sets `--bottom-bar-height`), and the page's scroll padding keeps a focused field
    above it: the bulk actions bar in Inventario, the comparison tray, the alert prompt and the "Deshacer" notice. On
    the listing page on phones, the contact bar pads the page by its own measured height, so the footer and the last
    fields end above it.
  - **Touch targets of at least 24 px.** The inventory table's row links (the SKU, "Ver", "Publicar", the exports) are
    24 px tall. On phones the table's "select all" checkbox, hidden with the header row, has its own visible
    "Seleccionar todos" control above the list.
  - **Announced to screen readers.** "Guardado" on favorites, the photo summary while uploading, the catalog's result
    count and the page-change "Cargando la página…" are status regions, read as they change without moving focus.
- **How it was checked.** Two Playwright scripts run axe-core 4.11 (WCAG 2.0, 2.1 and 2.2, A and AA, which includes
  target size) at 390 px and 1366 px:
  - every page a visitor, a buyer, a Particular seller and a store owner reaches with the demo accounts (58 pages),
    with the HTTP status, console errors and page errors, so it doubles as a smoke crawl;
  - the states a tap opens: the category menu, the filter and sort sheets, the lightbox, the safety sheet, sharing,
    the bulk bar, "Ajustar stock", the counter's cart, the sell form and favorites. A focus pass tabs through each page
    and records any focused element a bottom bar covers.
- **Results.** Below, in [Audit results](#audit-results).
- **Files.** `components/ui/bar-height.tsx`, `app/globals.css`, `components/listing/contact-module.tsx`,
  `app/instrumentos/[slug]/page.tsx`, `components/ui/data-table.tsx`, `components/inventory/inventory-table.tsx`,
  `components/catalog-compare.tsx`, `components/create-search-alert.tsx`, `components/undo-toast.tsx`,
  `tests/ux-listing.test.cjs`, `tests/store-ops-1b.test.cjs`.

### Audit results

Final run on the combined build with fresh demo data (2026-10-19), `scripts/prototype/a11y-audit.cjs` and
`scripts/prototype/a11y-states.cjs` (how to run them: `scripts/prototype/README.md`).

- **Pages.** 116 checks (58 pages at two widths, four roles): no violations. Every page answered 200 except the two
  404 checks, which are the not-found page on purpose. No page errors, and no "permission denied" in the server log.
  The console errors are all the sandbox's network: placeholder photos from placehold.co cannot be reached here, and
  Next's image optimizer answers 500 for them on the seller's pages.
- **States.** 27 states at two widths: no violations, the safety sheet included (opened from "Solicitar compra"),
  except one positional finding: at 1366 px, with the bulk bar open, axe counts a row's "Editar" link that sits half
  under the sticky bar at the bottom of the window as a target smaller than 24 px. Scrolling or tabbing moves it clear;
  the focus pass found no focused element under any bar.
- **Found and fixed at integration.** Empty "Vistos recientemente" tiles with no link text (UXD-integration-9); the
  footer under the phone contact bar; focused inventory rows under the bulk bar on phones; the inventory's row links
  under 24 px; no visible "select all" on phones.

## big-12 Laria on the home screen, sharing into Laria

### The installable app

- **What changed.** A web app manifest (`app/manifest.ts`): name, icons (192 and 512 px, and a maskable one), Laria's
  frame black, `display: standalone`, Spanish, and two shortcuts on the icon ("Vender un instrumento", "Mis
  favoritos"). Added to the home screen, Laria opens without the browser's bar, on Android and on iPhone
  (`appleWebApp` in `app/layout.tsx`).
- **No install banner of our own.** Chrome offers the install itself; Laria never interrupts a visit to ask.

### Sharing photos into Laria

- **What changed.** The manifest's share target puts Laria in the phone's share sheet for photos (JPEG, PNG, WebP,
  HEIC). Sharing up to 10 photos from the gallery opens the listing form with them, as if they had been picked:
  - the service worker (`public/sw.js`) answers the share on the phone and keeps the files in the browser's Cache
    Storage; nothing reaches Laria until the form uploads them;
  - `/compartir` counts them and opens the form for the account: the Particular form, or the store's for a store
    owner; signed out, it asks to sign in first and the photos wait;
  - the form takes them once, in the order they were shared, and deletes the device copy as it reads it; a share
    older than a day is dropped, so an abandoned one never resurfaces in a later listing;
  - `/compartir` is never indexed.
- **The service worker does nothing else.** It is registered with the scope `/compartir/`, in production builds only,
  after the page has loaded. Pages, images and data always come from the network, as without it: no offline mode, no
  stale page after a deploy.
- **Files.** `app/manifest.ts`, `public/sw.js`, `public/icons/*`, `components/service-worker-registration.tsx`,
  `app/compartir/page.tsx`, `app/compartir/recibir/route.ts`, `components/share-receiver.tsx`, `lib/share-target.ts`,
  `components/sell-listing-form.tsx` (`?compartido=1`), `tests/ux-effortless-speed.test.cjs`.
- **How to test.** Needs HTTPS on a real Android phone (a preview deployment): install Laria from Chrome's menu, share
  two photos from the gallery to Laria, and the form opens on its photo step with both.
- **Limitations.** iPhone has no share target for web apps, so there the photos are picked in the form as before.
  The first share right after installing can arrive before the worker is active; `/compartir` then says nothing
  arrived and offers the form.

### Push notices

- **What changed.** "Avisos en este teléfono" (or "en este navegador") in Mi cuenta > Notificaciones turns Laria's
  notices on for that device. They are the same notices as the list on that page, a lighter companion to e-mail,
  never a replacement:
  - asked only when the person presses "Activar avisos", never on a first visit; once on, the phone shows a sample
    ("Avisos activados") so the person sees what one looks like;
  - a push reads and opens like its row in Notificaciones, with the listing's name (`lib/notifications.ts`, shared
    with the list, UXD-integration-8); several pending notices go out as one ("3 avisos nuevos en Laria"), and the
    phone shows one Laria notice at a time, the newest;
  - nothing from 10 p. m. to 8 a. m. Lima time: those wait and go out together in the morning;
  - notices already read in Laria, or older than three days, are skipped;
  - when the browser blocks notices, the switch says where to allow them, including inside the installed app (Ajustes
    on an iPhone, the app's information on Android); in Safari on an iPhone it explains that notices need Laria on
    the home screen, and how to add it.
- **Devices.** Each device is turned on by the signed-in person and belongs to whoever turned it on last (a shared
  phone). A person keeps ten devices at most, the newest. Signing out turns that device off before the session ends.
  A device the push service no longer knows, or one that failed five times in a row, is forgotten.
- **Delivery.** Migration `20261108120000_ux_push_notifications.sql`: `laria_private.push_subscriptions` and
  `push_deliveries`, a trigger that queues one delivery per new notification for people with a device on, the
  person's own functions (`save_push_subscription`, `get_push_subscription`, `delete_push_subscription`) and the
  worker's (`claim_push_deliveries`, `finish_push_deliveries`, service role only). Endpoints must belong to a
  browser's push service (Google, Mozilla, Apple, Microsoft), so the worker posts nowhere else whatever a browser hands
  over, and keys must be real P-256 keys. `lib/push/web-push.ts` encrypts each message as RFC 8291 describes and signs
  it with VAPID (RFC 8292) using `node:crypto`; there is no new dependency. A failed send is retried after 5 minutes,
  30 minutes, 2 hours and 8 hours, five attempts in all; a worker that stops mid-batch gives its claim back after 15
  minutes.
- **The worker.** `app/api/internal/push/process` (`CRON_SECRET`, like the e-mail worker) sends up to four batches of
  50 people per run. Without `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` it only logs what it would send,
  and the switch in Notificaciones does not show.
  `scripts/generate-vapid-keys.mjs` prints a key pair for an environment, and `.env.example` lists the settings.
- **Files.** The migration, `lib/push/{device,notice,push-worker,web-push}.ts`, `components/push-settings.tsx`,
  `app/mi-cuenta/notificaciones/page.tsx`, `app/logout/route.ts`, `app/api/internal/push/process/route.ts`,
  `scripts/generate-vapid-keys.mjs`, `.env.example`, `tests/ux-effortless-push.test.cjs`,
  `tests/ux-effortless-push.sql`, `tests/logout-navigation.test.cjs`.
- **How to test.** Locally with a generated key pair: turn notices on in Notificaciones, create a notice (a question
  on one of your listings), call the worker with the cron secret, and the notice appears on the device. The SQL suite
  covers who reaches devices, the allowlist, shared phones, the cap, grouping, retries, skips and stale claims.
- **Limitations.**
  - Nothing runs the worker on a schedule yet, as with the e-mail worker; a scheduler (Vercel Cron or Supabase
    pg_cron) is a production step that needs Henri's word.
  - Push on an iPhone works only inside Laria added to the home screen (iOS 16.4 and later), as Apple allows.
  - The prototype has no push service to reach, so local runs use log mode or a test sender.

## Proposed decisions

- **UXD-speed-1** No `loading.tsx` anywhere (owner decision Q1 A stands): a bar after 100 ms and a skeleton after
  1 s cover the old page while the next one loads (fast-01).
- **UXD-speed-2** Data saving changes only images that appear after the page loads, asking for about 1.5 device pixels
  per CSS pixel from the same `srcset`, and turns off loading pages ahead of time (fast-03).
- **UXD-speed-3** The service worker is scoped to `/compartir/` and caches nothing but shared photos: no offline mode
  (big-12).
- **UXD-speed-4** No install banner of Laria's own; the browser offers the install (big-12).
- **UXD-speed-5** Push is a per-device companion to e-mail, asked for only from the switch in Notificaciones, never on
  a first visit (big-12).
- **UXD-speed-6** No push from 22:00 to 08:00 Lima; those notices go out together in the morning (big-12).
- **UXD-speed-7** Several pending notices go out as one message, and the phone shows one Laria notice at a time
  (big-12).
- **UXD-speed-8** Notices read in Laria or older than three days are not pushed (big-12).
- **UXD-speed-9** Pushes go only to browsers' push services, and only with real keys (big-12).
- **UXD-speed-10** Ten devices per person at most; a shared phone belongs to whoever turned notices on last, and
  signing out turns the device off (big-12).
- **UXD-speed-11** Shared photos wait on the device, up to 10 and for one day, and reach Laria only when the form
  uploads them (big-12).
- **UXD-speed-12** The push worker is started by hand until a scheduler exists, and without VAPID keys it only logs
  (big-12).
- **UXD-speed-13** Every bar fixed to the bottom of the screen carries `data-bottom-bar` and measures itself, so focus
  scrolls clear of it, and the phone contact bar pads the listing page by its height (fast-04).
