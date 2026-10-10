# Catalog autofill and Jev listing intelligence — prototype handoff

**Status (2026-10-10): prototype on branch `proto/catalog-autofill-jev-bvvvxm`, for review. Post-V1. Nothing here is in
production, nothing changes V1 behavior, and no migration was added.** The product spec is Henri's "Laria — Catalog
Autofill & Jev Listing Intelligence" (October 2026); `functional-spec.md` ("Planned After V1") and `database.md`
("Canonical instrument catalog") stay canonical.

The objective was to find out whether the design works well enough to implement. Short answer: the catalog functions
already give autofill and the policy everything they need, and the whole flow runs end to end. **What is not known yet
is how real Jev answers, real seller text and the full catalog behave**: no Jev credentials and no catalog database
were reachable from the build environment (see [What was not measured](#what-was-not-measured)).

## How to try it

| Where | How |
| --- | --- |
| Unit tests | `npm test` (`tests/catalog-intelligence.test.cjs`, 16 tests, no database) |
| Labeled corpus on a local catalog | `scripts/catalog-prototype/setup-local.sh` (plain Postgres; the 24 catalog migrations plus hand-written fixture rows), then `node --require ./tests/setup-alias.cjs scripts/catalog-prototype/benchmark.cjs --source=local` |
| Labeled corpus on the real catalog, read-only | with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` set: `... benchmark.cjs --source=supabase` (only `catalog_lookup`, `catalog_match`, `catalog_jev_inputs` and public catalog `select`s; nothing is written) |
| Real Jev | add `AI_GATEWAY_API_KEY` and `--jev=gateway` (the forced-failure cases still use the mock) |
| Interactive page | `CATALOG_AUTOFILL_PROTOTYPE=1 npm run dev`, sign in as Admin, open `/prototipos/autofill`. Without the flag the page and the three `/api/catalog/*` routes are a 404; non-Admins get 403/redirect |

The page's evaluation is **shadow only**: it shows the outcome, every gate, the evidence packet Jev saw and what the
version-checked transition would do. It never saves or publishes. With no gateway key the evaluator is a labeled mock.

Screenshots (local fixture catalog, mock evaluator): `docs/catalog-prototype/`.

## What was built

| Spec module | File | What it does |
| --- | --- | --- |
| `catalog-resolver` | `lib/catalog-intelligence/catalog-resolver.ts`, `types.ts` | Calls the production RPCs and reads the public catalog tables. No search logic of its own. Builds the query as `"<brand> <model>"` with the brand as `manufacturer_hint`. |
| `autofill-service` | `lib/catalog-intelligence/autofill.ts` | Classifies a lookup (exact / family / ambiguous / conflicting / approximate / unknown) from `catalog_match`'s decision, tier and reasons; builds editable, source-labeled suggestions; records provenance; drops stale lookup responses. |
| `listing-evidence` | `lib/catalog-intelligence/listing-evidence.ts` | Re-checks the existing publication rules on the saved version, computes narrow text signals, redacts contact details, hashes the evaluated version, and builds the whitelisted evidence packet. |
| Jev questions | `lib/catalog-intelligence/jev-questions.ts` | The five typed questions (A choice, B–C boolean, D score, E boolean). Choice options are `candidate_1…n` (real catalog rows) plus `INSUFFICIENT_INFORMATION`, `CONFLICTING_INFORMATION`, `NONE_OF_THE_ABOVE`. |
| `decision-provider` | `decision-provider.ts`, `jev-gateway-provider.ts` | Bounded call (per-attempt timeout, one retry on provider errors only), strict answer validation, a deterministic **mock**, and the real adapter: `experimental_decide` (ai@7.0.137) → AI Gateway → `typesafe-ai/jev`. The deprecated `experimental_evaluate` is not used. |
| `approval-policy` | `approval-policy.ts` | Deterministic outcome (`AUTO_APPROVE`, `REVIEW`, `INSUFFICIENT`, `CONFLICTING`, `SYSTEM_FAILURE`) with 14 named gates. |
| `evaluation-audit` | `evaluate-listing.ts` | The pipeline and the audit record (spec §17 fields); `planTransition()` re-checks version, hash, status, Admin decision, prior application, provider, threshold source and mode before anything could publish. |
| switches | `config.ts` | `CATALOG_AUTOFILL_PROTOTYPE`, `JEV_MODE` (off / shadow; `enforce` is downgraded to shadow), `JEV_KILL_SWITCH`, `JEV_PROVIDER=gateway`, `JEV_MODEL_ID`, `JEV_TIMEOUT_MS` (default 4000, clamped 500–15000). Defaults are all off. |
| `evaluation-fixtures` | `scripts/catalog-prototype/` | Seed corpus (33 labeled cases), benchmark, local Postgres setup and fixture rows. |
| prototype UI | `app/prototipos/autofill/page.tsx`, `components/catalog-autofill-prototype.tsx`, `app/api/catalog/{suggestions,products/[id],evaluate}` | Admin-only, behind the flag. |

## Actual catalog function interfaces and observations

Taken from the latest migration defining each function; all four are `stable`, granted to `anon` and `authenticated`.

| Function | Signature | Returns |
| --- | --- | --- |
| `catalog_normalize(text)` / `catalog_compact(text)` | immutable | normalized words / compact key (`'DS-1'` → `ds1`) |
| `catalog_lookup(query text, manufacturer_hint text = null, max_results int = 8)` | `20261020120000` | `product_id, manufacturer, model, category_id, category_label_es, entity_level, introduction_year, discontinuation_year, verification_status, quality_status, publish_ready, confidence, match_type, matched_text, category_intent, warning, score` |
| `catalog_match(query text, manufacturer_hint text = null)` | `20261007120000` | one row: `decision, tier, reasons[], product_id, manufacturer, model, category_id, category_label_es, entity_level, verification_status, quality_status, publish_ready, match_type, matched_text, category_intent, warning, score, runner_up_product_id, runner_up_score, brand_mentioned` |
| `catalog_jev_inputs(query text, manufacturer_hint text = null)` | `20261010120000` | `catalog_match` + `detail_status, detailed, missing_attributes[], untrusted_attributes[]` |
| `catalog_search_logged(query, manufacturer_hint, source)` | `20261009120000` | service role only; writes one redacted `catalog_search_log` row |

Observed on the local fixture (same SQL as production, hand-written rows):

| Seller text (brand · model) | `catalog_match` |
| --- | --- |
| Shure · SM57 | `MATCH / AUTO`, `exact_alias_with_brand`, 1.46 |
| Boss · DS1 | `MATCH / AUTO`, `exact_alias_with_brand`, 1.48 (`sm 57`, `DS 1` spacing also resolve) |
| Fender · Player Stratocaster | `FAMILY / REVIEW`, reasons `{family}` |
| Squier · Classic Vibe Stratocaster | `CONFLICTING / REVIEW`, reasons `{tie}`, runner-up at the same score |
| Fender · Classic Vibe '60s Stratocaster | `MATCH / INSUFFICIENT`, reasons `{brand_contradicted}` (top product is Squier) |
| Gibson · SM57 | `INSUFFICIENT / INSUFFICIENT`, `{low_score, brand_contradicted}` |
| Lucky Star · LS-200 | `INSUFFICIENT`, `{no_candidate}` |

Things worth knowing before implementing:

1. **`decision = MATCH` does not mean "use it".** The Fender/Squier case is `MATCH` with tier `INSUFFICIENT`. Autofill
   reads `reasons` (`brand_contradicted`) and the tier, never the decision alone.
2. **Fuzzy rows come back with every lookup.** "Fender Stratocaster" returns the family and two models as `fuzzy`;
   the UI marks them "Aproximada" and never preselects them.
3. **Variant-dependent attributes have no per-variant values.** `variant_attributes` lists keys, but variants only
   carry `finish / color / size / configuration`. Today only `handedness` can be filled from a variant
   (`configuration`); colour and finish are shown, never filled.
4. **Attribute values must match the form's options.** The prototype assumes `attribute_key` equals the form field key
   and `value` equals an option value (true/false become yes/no; lists are JSON). Anything else is omitted
   (`not_in_form`), so a mismatch costs suggestions, never wrong data. **To verify on production data.**
5. **The catalog version is not readable through the API.** It lives in the comment on `catalog_products`; the audit
   record's `catalog_version` stays null until a small `catalog_build` view or table exists.
6. **Stock Postgres JIT made `catalog_match` take about 5 s per call** on a 7-row fixture (22 ms with `jit = off`).
   The production gate saw normal RPC times, so Supabase's setting is probably fine, but it is worth confirming
   (`show jit;`) before the form calls the catalog on every keystroke.
7. `catalog_search_logged()` runs its own `catalog_match` + `catalog_lookup`, so logging every form lookup would double
   the work. The prototype logs only from the evaluation route and only with `CATALOG_SEARCH_LOG=1` (source `eval`).
8. Catalog tables are not in `database.types.ts` yet; the resolver uses an untyped client and normalizes every row.

No conflict with a production invariant was found.

## Policy as built

Order: invalid submission → `INSUFFICIENT`; catalog `brand_contradicted`, Jev `CONFLICTING_INFORMATION` or a high
conflict probability → `CONFLICTING`; no valid Jev answer → `SYSTEM_FAILURE`; no candidate, catalog `INSUFFICIENT`, or
Jev `INSUFFICIENT_INFORMATION` / `NONE_OF_THE_ABOVE` → `INSUFFICIENT`; all 17 gates → `AUTO_APPROVE`; else `REVIEW`.

Gates: submission valid; seller kind in scope (Particular, Tienda); new listing; catalog `MATCH/AUTO` on a model;
catalog `detailed`; top candidate publish-ready, VERIFIED or PROBABLE, quality `ok` and warning-free; listing category
and type equal to the product's mapped catalog category; no identity signal (below); identity fields not edited after autofill; no text signals (contact details, links,
instruction-like text); valid provider answer; thresholds present; Jev picked the catalog's own top candidate above
the threshold; sufficiency, no-conflict, detail and clean-text answers within thresholds.

`planTransition()` can only return `publish` when the outcome is `AUTO_APPROVE`, the version and hash are unchanged,
the listing is still pending, no Admin decided, nothing was applied, the provider is not the mock, the thresholds are
`calibrated` and the mode is `enforce`. The last three can never all hold in this prototype.

### Identity signals (from the catalog quality audit, PR #4)

The independent audit (`docs/catalog-audit/jev-autofill-handoff.md` on PR #4) found listings for which `catalog_match`
returns `MATCH/AUTO` although they must not be auto-approved. The catalog functions are unchanged; Laria's own layer
now checks them in `lib/catalog-intelligence/identity-signals.ts`, puts the findings in the evidence packet
(`checks.identity_signals`, which the material-conflict question tells Jev to weigh) and fails a gate on any of them:

| Signal | Example | Gate |
| --- | --- | --- |
| `copy_wording` | "Réplica de Gibson Les Paul Standard 50s", "Clon del Boss DS1" (réplica, clon, copia, imitación, tipo, estilo, inspirada en …, in title or model) | `identity_consistent` |
| `category_mismatch` | "Amplificador Boss DS-1" listed as Amplificadores; "Batería Shure SM58" listed as Baterías; or no mapped catalog category | `category_consistent` |
| `brand_mismatch` | brand "Boss", model "DS1 Shure SM57": the catalog AUTOs the Shure SM57 | `identity_consistent` |
| `second_product` | "Boss DS1 Shure SM57": two products' matched words side by side in the title or the brand + model | `identity_consistent` |
| `missing_generation` | "Boss Katana 50" while Katana-50 MkII is also a candidate and the listing names no generation | `identity_consistent` |
| `number_mismatch` | the top candidate is A Custom Crash 16" for a listing that says 18 | `identity_consistent` |

To find a second product, the evaluation also looks up the listing title (capped at 200 characters) when it says more
than brand + model. Limits: a generation is caught only when a later generation is among the candidates; copy words
are a fixed list; `brand_mismatch` also sends a Squier product listed as "Fender" to review. Every signal only keeps a
listing in normal moderation. On the local fixture, without these gates, 4 of the audit's cases came out
`AUTO_APPROVE` (the others were held only because the Boss DS-1 fixture row is not `detailed`); with them, none does,
and the controls (SM58 typed by hand, Katana-50 MkII named, A Custom Crash 18") still qualify.

One further finding on the way: an autofilled size-level name with an inch mark (`A Custom Crash 18"`) dropped to
`INSUFFICIENT/REVIEW (fuzzy_only)` when the saved listing was matched again. `catalogQuery` now drops an inch mark
after a number. Whether real catalog names carry inch marks is unmeasured.

Not covered here: Postgres JIT on production (about 5 s per call in the audit and locally) needs `show jit;` on the
production database, and a statement timeout belongs in the RPCs, which this prototype does not change.

## Labeled corpus and metrics

33 cases cover every case §21 asks for (exact SM57, DS-1 alias, ambiguous Fender/Squier kept and chosen, family-only,
wrong brand, unknown, incomplete, Jev timeout / error / invalid) plus spelling variants, variant-only fields, untrusted
attributes, edited attributes and identity, rejected match, prompt injection, contact details, verified store and
revision, plus the catalog audit's unsafe-AUTO cases and three controls (labeled from the audit's handoff; the
cases name the gate that must hold them back). Expected values were labeled before running.

Result on the **local fixture catalog with the mock evaluator** (full table: `docs/catalog-prototype/benchmark-local-fixture.md`):
all 33 cases pass; Recall@1/3/5 30/30; 10 shadow autoapprovals, all labeled correct; 0 transitions would publish.
**These figures check that the code does what the labels say. They are not catalog recall and not Jev accuracy**:
the catalog rows were written for the test and the evaluator is a rule-based mock. The one mismatch found on the first
run was a case missing its category (fixed in the corpus, not in the code).

Two real bugs were found in the browser check and fixed: suggestions for the previous text stayed clickable while a
new lookup was running, and an open preview survived a new brand/model.

## What was not measured

- **Real Jev responses, latency and cost per listing**: no `AI_GATEWAY_API_KEY` in the build environment. The gateway
  adapter compiles against ai@7.0.137 but has never received a response; whether Jev returns choice distributions
  (`probabilities`) is unverified, and the policy treats a missing distribution as failing the choice gate.
- **Retrieval on the real catalog and on real seller text**: no catalog database was reachable. Run
  `--source=supabase` (read-only) to get real Recall@k on the corpus; the 98.7 % retailer-title benchmark remains the
  only real figure.
- Calibrated thresholds: none exist; `DEMO_THRESHOLDS` are hand-picked and labeled as such.
- The interactive page against a real Supabase session (checked only with a local harness and intercepted API calls).

## Production schema that would be needed later (proposal, not a migration)

```sql
-- current association, one row per listing (spec §17); evaluation history stays separate
create table public.listing_catalog_links (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  catalog_product_id uuid references public.catalog_products(id),
  catalog_variant_id uuid references public.catalog_product_variants(id),
  raw_brand text not null, raw_model text not null,           -- seller's original claims
  lookup_kind text, decision text, tier text, reasons text[], score numeric,
  seller_action text not null check (seller_action in ('none', 'accepted', 'rejected')),
  rejected_product_id uuid,
  suggested jsonb not null default '{}', accepted text[] not null default '{}', modified text[] not null default '{}',
  catalog_version text, resolved_at timestamptz
);
create table public.listing_jev_evaluations (
  id uuid primary key, listing_id uuid not null references public.listings(id) on delete cascade,
  listing_version integer not null, input_hash text not null, catalog_version text,
  candidates jsonb not null, catalog jsonb not null, selected jsonb, answers jsonb,
  outcome text not null, gates jsonb not null, policy_version text not null, question_set_version text not null,
  threshold_source text, provider text, model text, mock boolean not null, request_id text,
  latency_ms integer, attempts integer not null, failure text, mode text not null,
  action_taken text not null default 'none', created_at timestamptz not null default now()
);
```

Plus: a listing version counter (or the hash alone) the transition can compare; RLS so owners see their link, Admin
sees evaluations, nobody writes either except server code; a `catalog_build` view exposing the loaded build; the
regenerated `database.types.ts`. Autofilled attributes keep living in `listings.attributes`, so the immediate-edit
rule and moderated identity fields are unchanged.

## Compatibility with current publication and moderation rules

- The V1 form (`components/sell-listing-form.tsx`), `/api/submissions`, revisions, sold immutability, relisting and
  Admin moderation are untouched (pinned by a test). Catalog and Jev code is reachable only through the flagged,
  Admin-only prototype.
- Every new Particular listing still needs Admin moderation; the prototype's outcomes are not listing statuses.
- Verified stores keep direct publishing (`seller_in_scope` fails for them, so Jev cannot "approve" or block them);
  revisions are never autoapproved.
- A catalog association is never shown as verification: the UI label is "Autocompletado del catálogo" (origin only)
  and the form says the data describe the catalog model, not the seller's unit.

## Privacy and provider data

The evidence packet is a whitelist: title, brand, model, category, type, description (contact details replaced by
`[contacto]`, 2,000 characters max), form attributes, seller identifiers, autofill accept/modify lists, catalog
candidates with trusted attributes, and deterministic checks. No e-mail, phone/WhatsApp, name, account or listing
owner. A test asserts it. No web search runs. Before enabling the gateway: confirm the AI Gateway / TypeSafe data
retention and training terms, and add the processor to the privacy page (`decisions.md` G2 governs that copy).

## Decisions defaulted for the prototype (spec §23) — need Henri

| # | Decision | Prototype default (conservative) |
| --- | --- | --- |
| 1 | Normal Tienda inventory gets the same autofill | Not decided: the catalog service supports it; no store form was changed. |
| 2 | Buyers see catalog-origin labels | No: labels exist only in the seller form; nothing changes on public listings. |
| 3 | Per-field confirmation or grouped acceptance | Grouped: the seller inspects the list, presses "Usar estos datos", then every field stays editable and edits are recorded. |
| 4 | How family matches appear | Category and type only, plus "Elige el modelo exacto"; no attributes until a model is picked. |
| 5 | Final Jev questions and thresholds | Five draft questions (`jev-questions-2026-10-10.1`); production thresholds `null`, so nothing qualifies; demo thresholds only on the page. |
| 6 | Advisory only or autoapproval after calibration | Shadow only; `enforce` is refused in code. |
| 7 | Persistence schema and orchestration | Nothing persisted; schema above is a proposal; orchestration is "after commit, evaluate the saved version" (spec §15) without a queue. |
| 8 | Prem multimodal | Not built (optional per spec). |
| 9–10 | Catalog navigation scope | Not touched here (separate category-navigation work). |

Also open: whether to log form lookups to the gap queue (off), the retry budget (one retry on provider errors), the
timeout (4 s), and the candidate count sent to Jev (5).
