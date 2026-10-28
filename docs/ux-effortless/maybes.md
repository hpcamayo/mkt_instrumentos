# Effortless Laria: the five maybes

Five ideas of the Effortless Laria program were marked "maybe" on the approval page and left for a talk. On 2026-10-27
Henri said "go ahead", read as yes to all five. They were built on three branches and combined on
`ux/effortless-maybes`, one draft PR to main. Each has its own write-up; this page records what they share and what
changed when they met. Proposed decisions are numbered UXD-maybes-n, like the write-ups' own.

| Idea | What a person sees | Write-up |
| --- | --- | --- |
| talk-06 "Reservado" | A Particular holds a published listing for a buyer for 1, 2, 3 or 5 days; buyers see "Reservado" and can ask "Avísame si se libera"; at the end the seller is asked "¿Se vendió?". | [maybes-reservado.md](maybes-reservado.md) |
| talk-07 "Hacer una oferta" | On a Particular's listing the buyer picks or types an amount, and WhatsApp opens with the offer; Laria never stores it. | [maybes-reservado.md](maybes-reservado.md) |
| big-02 "Descubrir" | Listings one per screen, from the home ("Descubrir lo nuevo") or any results list ("Ver en Descubrir"), with stops and an end. | [maybes-descubrir.md](maybes-descubrir.md) |
| stock-24 "Pregúntale a tu tienda" | A store asks in plain words and lands on the matching Inventario filters or Estadísticas view, with "Así lo entendí". | [maybes-ai.md](maybes-ai.md) |
| big-07 "Completar con IA" | On the sell form, suggestions from the photos for what the instrument is and its text, each used only on a tap. | [maybes-ai.md](maybes-ai.md) |

The two AI helpers are off until the server has `ANTHROPIC_API_KEY` and `LARIA_AI_HELPERS=1`. The other three work as
soon as the migrations are applied and the code is deployed.

## Branches and migrations

Merge order: `ux/maybes-ai`, `ux/maybes-descubrir`, `ux/maybes-reservado`, then main (#69 to #73).

| Slot | Migration | What it adds |
| --- | --- | --- |
| 20261120100000 | `ux_maybes_reservado.sql` | Reservations, "Avísame si se libera", the end-of-period job (pg_cron `listing-reservations`, every minute), two e-mail kinds and three notices |
| 20261120110000 | none | Descubrir needs no database change |
| 20261120120000 | `maybes_ai_helpers.sql` | The AI call log, without content (pg_cron `ai-request-retention`, daily) |
| 20261120900000 | `ux_maybes_error_lists.sql` | The launch audit's A13 lists with the new routes and messages |

None is applied to a hosted database. Besides their own objects they only widen lists the live site already reads (the
notice and e-mail types, the e-mail rules for the two new kinds, the A13 lists), so they can be applied before the
deploy: the live site keeps working and ignores them until the code arrives. Production migrations run from Henri's
Mac.

## UXD-maybes-1: Descubrir says "Reservado"

- **What met.** Descubrir's screens had room for a "Reservado" tag but no data for it. The reservation batch built the
  cards' badge on the catalog and on its page route ("Ver 24 más"), which Descubrir also uses for its next pages.
- **Decision.** One optional read for both: the server marks Descubrir's first page with `reservedCardIds`, and the page
  route answers `{ listings, total, reserved }` for the catalog's and Descubrir's pages alike. A read that is off (the
  recovery switch), slow or failed shows no tag rather than a wrong one; the listing page still says it.
- **Files.** `app/api/catalog/page/route.ts`, `app/descubrir/page.tsx`, `lib/descubrir.ts`,
  `components/descubrir/descubrir-feed.tsx`, `tests/maybes-descubrir.test.cjs`.

## UXD-maybes-2: one WhatsApp text for a reserved listing

- **What met.** On a reserved listing the listing page's WhatsApp link says "Vi que está reservado. Si se libera, ¿me
  avisas?", but Descubrir's button takes its link from `/api/contact`, which wrote "¿Sigue disponible?".
- **Decision.** The contact route reads the period beside the listing, through the same optional read (1.5 s budget,
  breaker, recovery switch), and the message says so. Without that read the message is the usual one and the contact
  still opens.
- **Files.** `app/api/contact/route.ts`, `tests/maybes-reservado.test.cjs`, `tests/launch-audit-contacts.test.cjs` (a stub
  for the new read).

## UXD-maybes-3: Descubrir keeps one contact button

"Hacer una oferta" and "Avísame si se libera" stay on the listing page, one tap away through "Ver publicación". A screen
in Descubrir keeps WhatsApp, ♥, "No me interesa" and "Ver publicación", so the feed stays light.

## Shared files

- **A13 error lists.** `20261120900000_ux_maybes_error_lists.sql` replaces `laria_private.app_error_route_patterns()`
  and `laria_private.app_error_own_messages()` whole, adding `/descubrir`, `/api/listing-assist`, `/api/store/ask` and
  the maybes' eleven messages, since an applied migration is never edited. `tests/launch-audit-monitoring.test.cjs` now
  reads the newest definition of each list.
- **A19 page refresh.** Reservado adds page-change triggers on its own table, so
  `tests/launch-audit-page-refresh-locks.integration.cjs` counts only the A19 migration's nine tables.
- **`features/marketplace`.** Three of its migrations touch what the maybes extend. `20261210120500` redefines the
  `public_listings` view: reservations live in their own table, so nothing there changes. `20261210120400` redefines
  `anonymize_account`: the maybes anonymize through triggers on `laria_private.account_anonymizations`, which it leaves
  alone. `20261210120600_feat_email_rules.sql` redefines `laria_private.email_max_age` and `email_priority`: when that
  branch merges main, both must keep `listing_reservation_ended` (3 days, priority 1) and `listing_released` (2 days,
  priority 2), and `tests/maybes-reservado.sql` fails if they don't.

## Checks on the combined branch

Unit tests, types, lint and the production build; on the local database every migration, the 50 SQL suites, the store
concurrency suite, the pg_safeupdate stand-in and the 9 database integration tests; and a browser walk of the places
where the batches meet (23 checks, with axe WCAG 2.2 AA on Descubrir and the offer sheet). Screens:
`/mnt/project-files/ux-ideas/screens/maybes/combined/`. No live AI call was made: the walk uses the local fake.

## Acceptance cases

Proposed and Not Run, in `acceptance-proposal.tsv` with the program's others: EASE-800 to EASE-829 (Reservado and Hacer
una oferta), EASE-830 to EASE-859 (Descubrir), EASE-860 to EASE-878 (the AI helpers) and EASE-880 to EASE-882 (this
page, `maybes-acceptance.tsv`). They joined `acceptance/cases.tsv` as Not Run on 2026-10-28, with the program's others
([integration.md](integration.md#acceptance-cases)).

## Before switching on

- Done: merged on 2026-10-28 (PR #74), and the three migrations applied to production from Henri's Mac at 13:41 UTC
  the same day.
- For the AI helpers: an Anthropic API key in a workspace with a spend limit, `ANTHROPIC_API_KEY` and
  `LARIA_AI_HELPERS=1` in Vercel, and legal review of the privacy-policy line in [maybes-ai.md](maybes-ai.md) § To
  switch it on. Claude Opus 5.5 by default, about US$31 a month for 30 store questions and 15 photo assists a day;
  `LARIA_AI_MODEL=claude-haiku-5-5` costs about US$1 for the same use. On 2026-10-28 the owner chose to leave the AI
  helpers off for now.
