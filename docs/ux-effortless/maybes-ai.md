# Effortless Laria: the two AI helpers (maybes stock-24 and big-07)

Ideas: `/mnt/project-files/ux-ideas/ideas.json`. Henri marked both "maybe" on 2026-10-19 (stock-24: "would be awesome
but whats the needed infrastructure") and said "go ahead" on 2026-10-27. Branch `ux/maybes-ai`, migration slot
20261120120000, acceptance range EASE-860 to EASE-879 (proposed in `maybes-ai-acceptance.tsv`). Screenshots:
`/mnt/project-files/ux-ideas/screens/maybes/ai/`.

Both helpers are **off by default**. They show only when the server has `ANTHROPIC_API_KEY` and `LARIA_AI_HELPERS=1`
(see "To switch it on"); until then no page shows them and both routes answer 404.

## How Laria calls Claude (shared by both)

- **What changed.** One module, `lib/ai/`, owns every call: the client (`claude.ts`, the official
  `@anthropic-ai/sdk`, pinned at 1.3.0), the switch, model and limits (`config.ts`), the limits and the log (`usage.ts`).
  A request asks for a JSON answer that follows a schema (structured outputs, `output_config.format`) and sets how much
  the model thinks with `output_config.effort` (low for store questions, medium for photos). Claude Opus 5.5 thinks
  adaptively and always, so there is no thinking field, and no sampling field is sent. On models that have one, a policy
  decline is retried by the API itself on Anthropic's recommended model in the same call (`fallbacks: "default"`, beta
  `server-side-fallback-2026-07-01`); Claude Haiku 5.5 has none, so its requests go without. A decline that stands
  (`stop_reason: "refusal"`) is checked before anything is read, and only a complete answer (`end_turn`) is parsed, from
  the last text block. Every answer is checked again on the server against the site's own lists before it is used.
- **Limits.** Counted by the existing `public.consume_rate_limit` under an HMAC of the subject (`checkKey` in
  `lib/rate-limit.ts`, the same count `checkRequest` uses for a visitor's address): 50 questions per store a day, 20
  photo assists per account a day, and every AI call of the site together (`LARIA_AI_DAILY_CAP`, 500 by default). A day
  runs from 00:00 UTC (7 p. m. in Lima), which the limit message says. A call takes its own allowance first, then the
  site's. A counter that can't count refuses: an AI call costs money, so it never runs without a limit.
- **The log.** One row per call that reached the API, in `laria_private.ai_requests`: feature, account, store
  (questions only), the model that answered, input and output tokens (every attempt, a fallback's included), outcome
  (`answered`, `no_match`, `refused`, `invalid`, `failed`) and time. Never the question, the photos or the answer. No API
  role reads it; the server writes it through `public.record_ai_request` (service role only). Rows go after 90 days, and
  an anonymized account's rows lose the account at once (launch audit A20's `account_anonymizations`). A log that can't be
  written is reported in the server log and never fails the answer.
- **Failures.** Network errors, timeouts and API errors become "No pudimos … en este momento" with a way forward (the
  filters, or filling the form by hand). The server log gets only the kind of failure (`ai-call-failed`, `status 529`),
  never the request or the answer.
- **Files.** `lib/ai/claude.ts`, `lib/ai/config.ts`, `lib/ai/usage.ts`, `lib/ai/fake-client.ts`, `lib/rate-limit.ts`,
  `next.config.ts`, `package.json`, `supabase/migrations/20261120120000_maybes_ai_helpers.sql`, `tests/maybes-ai.test.cjs`,
  `tests/maybes-ai.sql`.
- **How to test.** `pnpm test` (`tests/maybes-ai.test.cjs`: requests, refusals, the answer checks, both routes and their
  refusals, the limits and the log, with an injected fake client); local DB: `tests/maybes-ai.sql` (who reaches the log,
  what it records, anonymization, retention, the daily limits). In the prototype, `LARIA_AI_FAKE=1` with
  `LARIA_AI_HELPERS=1` and any `ANTHROPIC_API_KEY` under `pnpm dev` answers with fixed text and calls nothing; a production
  build refuses to start with `LARIA_AI_FAKE` set, and the fake isn't bundled.
- **Defaults.** No live call was made while building this (no key, and a real call costs money); the request shapes are
  checked against the SDK's types and its documentation. The model's text never goes into a page as HTML.

## stock-24 "Pregúntale a tu tienda"

- **What changed.** A box at the top of Mi tienda's Inventario, and on the Mi tienda home of a store with Inventario:
  "Pregúntale a tu tienda", with "Ej.: ¿qué guitarras tengo agotadas?". The question (up to 200 characters) goes to
  `/api/store/ask`; the model sees only the question and the vocabulary of the store's existing filters, never the
  store's data. Its answer is one of four destinations: Inventario with its existing filters (search, stock, publication,
  category, price, order), Estadísticas with a period (7 days, 30 days, everything) and a section (lo más visto, lo más
  consultado, contactos sin venta, totales), the Reposición list, or none. The link is built with the existing helpers
  (`inventoryHref`), and the page it opens shows **"Así lo entendí"** with each filter it used as a chip that removes it
  (the panel stays until "Cerrar"). What the question asked that no filter covers is said plainly, next to the closest
  filters: "No hay un filtro por número de unidades." (with Stock bajo and the least available first), "Laria aún no
  ordena los SKU por unidades vendidas." (with Reposición, which shows the units sold in 30 days), "Las estadísticas solo
  tienen 7 días, 30 días o todo el historial.", "No hay un filtro por rango de precio." (with the price order). A question
  about something else gets "No encontré filtros de Inventario ni de Estadísticas para esa pregunta" with two examples.
  Under the box: "Tu pregunta se envía a un servicio de IA para elegir los filtros; los datos de tu inventario, no."
- **Files.** `lib/ai/store-question.ts` (schema, prompt, answer checks, links, the panel's chips),
  `app/api/store/ask/route.ts`, `components/ai/store-ask-box.tsx`, `components/ai/understood-panel.tsx`,
  `app/mi-cuenta/tienda/page.tsx`, `app/mi-cuenta/tienda/inventario/page.tsx`, `.../inventario/reponer/page.tsx`,
  `app/mi-cuenta/tienda/estadisticas/page.tsx`.
- **How to test.** With the fake client, as `demo-tienda@laria.test`: Mi tienda → Inventario, ask "¿qué guitarras tengo
  con menos de 2 unidades?" (Guitarras · Stock bajo · least available first, and the line about units), "¿qué está
  agotado?", "¿qué vendí más este mes?" (Reposición, with the lines about sales and dates), "¿qué es lo más visto esta
  semana?" (Estadísticas, 7 days, Lo más visto). Remove a chip; the filter goes and the panel stays.
- **Defaults.** Only stores with Inventario (the filters it fills are Inventario's). No new filter, RPC or report: a
  question that needs one says so. The question never goes in a link or the log. Up to two attempts of 15 seconds.

## big-07 "Completar con IA"

- **What changed.** In the sell form's "Qué es" step (Particular and store), once there is a photo: "Completar con IA".
  Only when tapped, the browser redraws up to four of the form's photos as JPEGs of at most 1024 px (without their
  metadata) and sends them to `/api/listing-assist`; the route refuses anything else (one to four JPEGs of up to 600 KB
  and 1024 px). The model proposes the category and instrument type (from the site's registries), brand, model, a title,
  up to six details seen in the photos and an honest Spanish description of two to four sentences. Each comes back as a
  row with its own button: "Usar" for an empty field, "Reemplazar" (with "Ahora: …") for one the seller filled, "Ya está"
  when they match, and "Agregar a la descripción" for the details. "Usar todo" fills only what is empty and names what
  it left alone; when the seller's own brand or model differs from the suggestion's, it also holds what says which
  instrument it is (brand, model, title, description) for their own buttons, so a listing never says Behringer in the
  brand and Boss in the title. Brand and model rewrite the title only while the form still writes it from them; the
  details go below the seller's text and above a store's standard text. Photos that show no instrument get "No reconocimos un
  instrumento ni un equipo de audio en tus fotos", and an unsure answer says "No estamos seguros de qué es".
- **Files.** `lib/ai/listing-assist.ts` (schema, prompt, checks, how a row is used), `app/api/listing-assist/route.ts`,
  `components/ai/listing-assist.tsx`, `components/ai/assist-photos.ts`, `components/sell-listing-form.tsx`,
  `app/mi-cuenta/publicar/page.tsx`, `app/mi-cuenta/tienda/publicar/page.tsx`.
- **How to test.** With the fake client, as `particular@laria.test`: Publicar, add a photo, go to "Qué es", tap
  "Completar con IA" (the fake proposes a Boss DS-1 Distortion), use one row, then "Usar todo"; type another brand first
  and see "Reemplazar" with "Ahora: …", and "Usar todo" fill only the category and the details.
- **Defaults.** No condition, price or specifications: condition and price are the seller's call, and filling specs is
  the catalog autofill's job (Jev, PR #3), which this does not touch or copy; once that reaches main, the brand and model
  confirmed here are what it starts from. Moderation is unchanged. Nothing is stored: not the photos sent, not the
  answer. One attempt of up to 50 seconds (the route's limit is 60). Draft text under the button, pending legal review:
  "Sugerimos categoría, marca, modelo, título y descripción a partir de tus fotos. Solo al tocar el botón, hasta 4 fotos
  reducidas se envían a un servicio de IA. Revisa cada dato antes de usarlo."

## What it costs

Estimates from the prompts' sizes (store question: about 1,300 input tokens; photo assist: about 5,500, of which four
photos at 1024 × 768 px are about 4,200) and typical answers (about 300 output tokens for a question and 1,200 for a
photo assist; thinking counts as output, so a hard case costs more). Prices from Anthropic's list (per million tokens:
Claude Opus 5.5 $4 in / $20 out, Claude Haiku 5.5 $0.10 / $0.50), at S/ 3.75 per dollar.

| | Claude Opus 5.5 (default) | Claude Haiku 5.5 (`LARIA_AI_MODEL=claude-haiku-5-5`) |
| --- | --- | --- |
| One store question | about US$0.011 (S/ 0.04) | about US$0.0003 |
| One "Completar con IA" | about US$0.046 (S/ 0.17) | about US$0.0012 |
| 30 questions and 15 photo assists a day, for 30 days | about US$31 | about US$1 |
| The site's daily cap (500 calls), all photo assists | at most about US$23 a day | at most about US$0.60 a day |

A decline retried by the fallback is billed for both attempts (rare). Haiku 5.5 is quicker and far cheaper, and may
read badges and headstocks less reliably; which one to use is Henri's call. The log's tokens give the real figures:
`select feature, model, count(*), sum(input_tokens), sum(output_tokens) from laria_private.ai_requests where created_at
> now() - interval '30 days' group by 1, 2;`

## To switch it on

1. Apply `20261120120000_maybes_ai_helpers.sql` to production (from Henri's Mac, as every migration).
2. Create an API key in the Anthropic Console, in a workspace with a monthly spend limit, and add it to Vercel's
   Production environment as `ANTHROPIC_API_KEY` (never in the repository or a `NEXT_PUBLIC_` variable).
3. Add `LARIA_AI_HELPERS=1`. Optional: `LARIA_AI_MODEL=claude-haiku-5-5` for the low-cost model, `LARIA_AI_DAILY_CAP`
   for another site-wide cap. Never set `LARIA_AI_FAKE` there: the build refuses it.
4. Before that, legal review of a line for the privacy policy (draft): "Si usas «Completar con IA» o «Pregúntale a tu
   tienda», enviamos las fotos reducidas o el texto de tu pregunta a Anthropic, un proveedor de inteligencia artificial
   en Estados Unidos, solo para generar la sugerencia. Laria no guarda esas fotos ni tu pregunta para esto." The review
   should confirm the provider's retention terms and the cross-border transfer under Ley 29733.

To switch off: remove `LARIA_AI_HELPERS` (or the key) and redeploy; nothing else changes.

## In docs/database.md

Section "Effortless Laria maybes: AI helpers (stock-24, big-07)". The two routes join the launch audit's A13 route list,
and `AI_REQUEST_INVALID` its own messages, with `20261120900000_ux_maybes_error_lists.sql`.

## In docs/functional-spec.md

"AI Helpers (Effortless Laria maybes, off by default)", before "Legal and Safety".

## Proposed decisions

- UXD-maybes-ai-1: The AI helpers call Claude through the official Anthropic SDK from two server routes, off unless both
  `ANTHROPIC_API_KEY` and `LARIA_AI_HELPERS=1` are set; Claude Opus 5.5 by default, `LARIA_AI_MODEL` to change it.
- UXD-maybes-ai-2: Store questions send only the question and the filter vocabulary, never inventory data; the answer
  can only be the site's existing filters and views, checked again on the server.
- UXD-maybes-ai-3: "Así lo entendí" shows each filter as a removable chip and says plainly what no filter covers, next
  to the closest filters; no new filters or reports were added for it.
- UXD-maybes-ai-4: "Completar con IA" proposes identity and text only (category, type, brand, model, title, details,
  description), never condition, price or specifications; "Usar todo" never overwrites what the seller wrote, nor
  writes another instrument's name next to the brand or model they wrote.
- UXD-maybes-ai-5: Photos are reduced in the browser to JPEGs of at most 1024 px without metadata and sent only on tap;
  nothing sent or answered is stored.
- UXD-maybes-ai-6: Daily limits of 50 questions per store, 20 photo assists per account and a site-wide cap; a counter
  that can't count refuses the call.
- UXD-maybes-ai-7: Each call is logged without content (feature, account, store, model, tokens, outcome) for 90 days,
  unlinked from an anonymized account.
