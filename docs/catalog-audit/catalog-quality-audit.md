# Canonical catalog quality audit

Independent audit, 2026-10-10 (overnight session). Read-only. Branch `audit/catalog-quality-iypo95`, off `main` at
`568b07a`. Nothing in the application, the database, the migrations or the catalog data was changed.

## Executive assessment

**The production catalog data was not audited.** Every number in this report about matching comes from the real
`catalog_lookup` / `catalog_match` / `catalog_jev_inputs` code running on a small synthetic fixture, not from the 20,386
production products. Three routes to the data were tried and none was available:

| Route | Result |
| --- | --- |
| Branch `catalog/canonical-catalog` (pipeline, datasets, full catalog) | Not on GitHub. `git ls-remote` shows only `main`, `ux/redesign`, `ui/laria-visual-refresh` and one Claude branch. |
| Henri's local worktree (`~/code/mkt_instrumentos-catalog`) | Folder access was granted, but the Mac went offline before any file was copied. |
| Production database (read-only) | The session's network policy refuses `laria.audio` (proxy 403), and no credentials were sought, as the brief asked. |

What the audit did deliver is the part that does not depend on the data: a reading of the 25 catalog migrations, the
functions applied to a local PostgreSQL 16, a 311-case corpus whose 121 product identities were checked on the web, a
read-only runner that scores the real catalog in one command, 43 integrity checks and an autofill readiness matrix.

Even on synthetic data, the matcher's own logic shows **six failure modes that can produce a wrong automatic
approval**, independent of what the catalog contains:

1. **Copies and replicas match the genuine product (S1).** "replica de gibson les paul standard 50s", "imitacion de una
   fender player stratocaster" and "clon del boss ds1" all return `MATCH / AUTO` on the genuine product. The copy-word
   check only looks two tokens ahead and skips brand tokens, so Spanish "réplica **de** <marca> <modelo>" escapes it.
2. **A category contradiction cannot block AUTO (S1).** "amplificador boss ds-1", "guitarra boss ds-1", "bateria shure
   sm58" and "Player Stratocaster HSS bajo 4 cuerdas" are all `AUTO`. The contradiction costs −0.25, but an exact
   alias with the brand named scores about 1.27–1.65, so it never drops below the AUTO threshold of 1.0.
3. **Two products in one title auto-match one of them (S1).** "boss ds1 shure sm57" and "boss ds1 + shure sm57" are
   `AUTO` on the SM57. Bundle detection needs a connector followed by a category word.
4. **A generation-less title auto-matches whichever generation has the bare name (S2).** "boss katana 50" is `AUTO` on
   the product named "Katana-50". This applies to every line whose first generation is stored under the plain name
   (Katana, Blues Junior, AC15, Scarlett 2i2 1st gen).
5. **A size written after the model is penalised as an unknown version (S2).** In "zildjian a custom crash 18", the
   `18` gets `unexplained_token:18` (−0.45), even though the alias `18" A Custom Crash` explains it. The 16" and 17"
   crashes then rank above the right cymbal. This is safe (REVIEW), but the seller is shown the wrong size first.
6. **JIT compilation costs about 5 s on every call (S2, environment-dependent).** On PostgreSQL 16 with `jit = on` (the
   PostgreSQL default), each `catalog_match` call took 4.9–5.6 s, whatever the input length. With `jit = off` it took
   24 ms. Whether production pays this depends on its `jit` setting, which this audit could not read.

What looks reliable in the function logic, on the fixture: AUTO never chose a wrong product (0 of 186 AUTO results; the copy and two-product AUTOs below picked the product the text names).
No perturbed title produced an unsafe AUTO (0 of 77), and typos inside model tokens fell to REVIEW or
INSUFFICIENT. A wrong manufacturer hint always blocked
AUTO (6 of 6). Every invented model (10 of 10) and every injection or junk text with no real product named came back
INSUFFICIENT.

**Readiness verdict:** do not enable automatic approval or silent autofill until findings 1–3 have a guard, and until
the runner has been run once against the production build (one command, below). Autofill shown as editable suggestions
with REVIEW-tier confirmation is reasonable now.

## Methodology

### Sources read

`AGENTS.md`, `docs/functional-spec.md` (Planned After V1: autofill, Jev, navigation), `docs/database.md` (catalog
section), `docs/catalog-production-release-gate.md`, all 25 catalog migrations (`20260927120000` …
`20261021120000`), `lib/instrument-filters.ts` and `listing_attribute_keys_are_valid()` (the V1 attribute keys
autofill would fill). The final definitions in use are `catalog_lookup_candidates` and `catalog_lookup` from
`20261020120000`, `catalog_match` from `20261007120000` and `catalog_jev_inputs` from `20261010120000`.

### Local database

PostgreSQL 16.15 (production is 17.11) with `pg_trgm`, `unaccent` and `fuzzystrmatch`. It has stub `auth` and
`is_admin()` functions and the anon, authenticated and service_role roles. Twenty-four of the 25 migrations applied
unchanged. `20261011` (the `pg_cron` schedule) was skipped because `pg_cron` is not installed. The stubs only satisfy
policy definitions, and none of the matching functions uses them.

### Smoke fixture (synthetic)

`bench/fixture/build_fixture.py` builds 151 products: the corpus's 121 identities (111 models and 10 product lines)
plus 29 real sibling "distractors" (DS-1W, Katana-50 Gen 3, TD-17KV, Scarlett 2i2 2nd Gen, Epiphone/Gibson Les Paul
'60s …) and one seeded duplicate. It also loads 45 manufacturers and 99 lookup-vocabulary terms. Aliases follow the
auditor's guess at the ETL: the name, "Brand Model", a variant without hyphens, and a few abbreviations
(Strat, Tele, P Bass, Jr, LP, CV, Am Pro). **The real ETL's aliases and vocabulary are unknown here.** Recall and
coverage on the fixture therefore measure the fixture as much as the functions. Only behaviour that follows from the
code (findings 1–6) is reported as a finding.

Eight defects are seeded into the fixture to prove the integrity checks catch them. All eight are detected
(`bench/fixture/README.md`).

### Corpus (`corpus/catalog_eval_corpus.jsonl`, 311 cases)

| Origin | Cases | What it is |
| --- | ---: | --- |
| authored | 234 | Seller-style titles written by the auditor to resemble Peruvian listings. No real listing text was available. |
| perturbation | 77 | Deterministic transforms of authored model cases: swapped letters, a dropped letter, a "VENDO … 10/10 CAMBIO" wrapper, hyphens removed. |

| Expected | Cases | | Safe behaviour | Cases |
| --- | ---: | --- | --- | ---: |
| a model | 258 | | AUTO_OK (AUTO on the right product is correct) | 239 |
| a product line (family) | 8 | | NO_AUTO (REVIEW or INSUFFICIENT; AUTO is a failure) | 45 |
| no catalog product | 45 | | INSUFFICIENT (no product is meant) | 27 |

Categories: guitars 84 (electric and acoustic), pedals 63, amplifiers 39, microphones 33, audio interfaces 32,
cymbals 21, drums 20, basses 18. The corpus covers all the requested test types: common Peruvian-market models,
discontinued models (11), aliases and abbreviations, misspellings, Spanish/English wording, line-level names, nearly
identical model numbers, generations, wrong manufacturer hints, wrong category/model combinations, invented or absent
models, copies, bundles, injection-style text and empty or very long input. Each case's `tests` field tags its type.

**Provenance and trust.** Every label is `label_source: ai_inferred`. The 121 product identities were web-checked by a
separate pass (`corpus/grounding.json`: 121 exist, 95 current, 21 discontinued, 5 unclear, one reference URL each, most
on the manufacturer's site). That grounds the product, not the label. The seller text, and which catalog product it
should resolve to, remain the auditor's judgement. 44 cases are flagged `needs_human_review`, where the right answer
depends on the catalog's granularity (generation, line versus model, sub-brand). The web check corrected several of
the auditor's assumptions, which are kept as found: Fender's Player series is now discontinued (replaced by Player II
in 2024), and the TD-17KVX, AT2020USB+, GT-1 and BA-110 are discontinued. Spellings differ for some models: the Yamaha
C40 is now the C40II, and Vox calls the AC15C1 the "AC15 Custom".

### Scoring (`bench/catalog_audit.py`)

- **Identity resolution.** Each corpus identity is resolved at run time to product ids by (manufacturer alias,
  model key or non-retail alias key). An identity that does not resolve is reported as `label_unresolved` and
  **excluded** from recall and accuracy. It is never counted as a miss, so a granularity mismatch shows up as a label
  problem, not a matcher error.
- **Recall@k:** the expected product is in the top k of `catalog_lookup(input, hint, 8)`, over resolved model cases.
- **Resolution accuracy:** an AUTO_OK case needs `MATCH/AUTO` on the expected product; a NO_AUTO case needs any tier
  except AUTO; an INSUFFICIENT case needs `INSUFFICIENT`; a family case needs no AUTO.
- **Unsafe AUTO:** AUTO where the case forbids it, or AUTO on a product other than the expected one.
- **Latency:** time measured by the client per call, after one warm-up call. It includes the network when run remotely.
- The runner is read-only by construction: `default_transaction_read_only = on`, a statement timeout, and a single
  transaction rolled back at the end. It calls only the three functions and bounded `SELECT`s, and never
  `catalog_search_logged()`, which writes to the search log.

## Data quality statistics

**Not measured: the production data was unreachable.** The checks are written and verified on the fixture, so they run
against the real catalog with:

```sh
python3 -m pip install "psycopg[binary]"
CATALOG_DSN="postgresql://…" python3 docs/catalog-audit/bench/catalog_audit.py all \
  --label "prod-build-2e0bd5ef" --out docs/catalog-audit/results/prod
```

What the 43 checks cover, with the distinction the brief asked for (`kind`):

| Area | Checks | Genuine error | Incomplete | Legitimate ambiguity | Permissible |
| --- | --- | --- | --- | --- | --- |
| Duplicates | same key across domains, keys equal after a generic word, pending review pairs | ✓ | | ✓ | |
| Product aliases | cross-brand and same-brand collisions, wrong `is_ambiguous` flag, aliases of 3 characters or fewer, aliases that are category words, alias-type mix | ✓ | | ✓ | ✓ |
| Manufacturer aliases | key naming two makers, short or word-like aliases, parent brands, uncurated makers | ✓ | ✓ | | ✓ |
| Family / model | broken family links, families with no model, families marked detailed or publish_ready, models named like a line | ✓ | | ✓ | |
| Variants | SKU and GTIN collisions, `variant_attributes` with no variants, a variant attribute also stored at product level, size-level granularity | ✓ | ✓ | | ✓ |
| Categories | missing or weak category, no Laria mapping, domain × category cross-tab, model name naming another category | ✓ | ✓ | | ✓ |
| Attributes | conflicts, trusted despite a conflict, provenance and trust mix, missing and untrusted required values, inconsistent `detail_status`, missing or untranslated `value_es`, numeric outliers | ✓ | ✓ | ✓ | ✓ |
| Normalization | `normalized_model_name` / `model_key` parity, brand repeated in the model name, seller/colour words in the name, keys of 2 characters or fewer | ✓ | | | |
| Confusable models | same-brand keys one character apart, prefix keys, the same key under two brands | | | ✓ | |

A per-brand rollup (`integrity_by_brand.json`) counts missing or untrusted required values, conflicts, shared
aliases, missing categories, quality flags and detailed families for the 40 most affected brands. Severity defaults:
S1 blocks AUTO or autofill, S2 needs a guardrail, S3 is data hygiene, S4 is informational.

The only production numbers this audit can cite are those already recorded by the release gate (owner-confirmed,
2026-10-09): 20,386 products, 1,392 manufacturers, 70,633 aliases (3.5 per product), 16,345 variants, 62,073 resolved
attributes (3.0 per product), 765 families and 132 categories. The catalog comment shows the build hash
`sha256 2e0bd5efd20ed753`.

## Important failure modes (function logic, confirmed on the fixture)

The case ids refer to `corpus/catalog_eval_corpus.jsonl`, and the full outputs are in `results/fixture-smoke/cases.jsonl`.

### F1 Copies of a product auto-match the genuine product — S1

| Input | Result |
| --- | --- |
| replica de gibson les paul standard 50s (CQ-192) | MATCH / AUTO, Gibson Les Paul Standard '50s, score 1.64 |
| imitacion de una fender player stratocaster (CQ-194) | MATCH / AUTO, Player Stratocaster |
| clon del boss ds1 hecho a mano (CQ-190) | MATCH / AUTO, DS-1 |
| copia del shure sm58 (CQ-193) | MATCH / AUTO, SM58 (the fixture's copy vocabulary has no "copia"; the real one may) |
| replica gibson les paul standard 50s | INSUFFICIENT / REVIEW (no "de": the check works) |

Cause: `copied` in `catalog_lookup` (`20261020120000`, about line 499) only looks at positions `+1` and `+2` after the
copy word, through `ident_mp`, which excludes brand tokens. In "réplica de Gibson Les Paul" the model starts at +3. A
counterfeit or "tipo" listing would be attached to the genuine product's identity and attributes.

### F2 A category contradiction never blocks AUTO — S1

"amplificador boss ds-1" (CQ-182), "guitarra boss ds-1" (CQ-196), "bateria shure sm58" (CQ-197) and "Fender Player
Stratocaster HSS bajo 4 cuerdas" (CQ-181) are all `MATCH / AUTO`. The category intent only adds −0.25 to the score,
and a verified product matched by an exact alias with its brand named scores at least 0.9 + 0.05 + 0.03 + 0.25 + 0.04
≈ 1.27. After the penalty that is still ≥ 1.02, above the 1.0 AUTO threshold. `catalog_match` adds no reason code for
the contradiction, and `catalog_jev_inputs` drops `category_intent`, so Jev cannot see it either. A seller who lists a
bass under a guitar model, or an amp under a pedal model, gets that product's attributes autofilled.

### F3 Two products in one title auto-match one of them — S1

"boss ds1 shure sm57" (CQ-177) and "boss ds1 + shure sm57" (CQ-195) are `MATCH / AUTO` on the SM57. Bundle detection
(`bundle_at`) needs a connector (`con`, `y`, `mas`, `incluye` …) followed within two words by a category term, and a
spaced "+" becomes "y" but is followed by a brand, not a category word. The tie rule only sees a rival within 0.02.

### F4 A generation-less title auto-matches the generation with the bare name — S2

"boss katana 50" (CQ-142) is `MATCH / AUTO` on the product named "Katana-50", with "Katana-50 MkII" and "Katana-50
Gen 3" also in the fixture. The match is literally right, but a used "Katana 50" is any of three amps, with different
features. This affects every line whose first version is stored under the plain name. It is data-dependent: if the
catalog names the first version "Katana-50 MkI", the bare title falls to a family match or a tie instead.

### F5 A size after the model is penalised as an unknown version — S2 (safe, wrong order)

"zildjian a custom crash 18" (CQ-065): `catalog_lookup_candidates` flags the token after the matched span as
`unexplained_token:18`, because `pflag` treats any 1–3-digit number as an identity token. The `alias_tokens` hit on
`18" A Custom Crash` already contains `18in`, but the flag stays, the hit loses 0.45, and the fuzzy 16" and 17"
crashes rank first. The tier is REVIEW (fuzzy only), so this is safe, but the seller is offered the wrong size. "Tama
Imperialstar 22" (CQ-056) and "StingRay Special 4" (CQ-052) behave the same way. The same seller wording is the
brief's own example ("zildjian a custom crash 18"), so this is the first thing to check on real data.

### F6 JIT compilation dominates latency — S2 (verify on production)

| Session | 3 tokens | 24 tokens | 96 tokens |
| --- | ---: | ---: | ---: |
| `jit = off` | 24 ms | 121 ms | 584 ms |
| `jit = on` (PostgreSQL default, `jit_above_cost` 100000) | 5,237 ms | 5,263 ms | 5,572 ms |

(`results/fixture-smoke/latency_probe.txt`, PostgreSQL 16, 151 products.) The planner's cost estimates for the
function scans exceed `jit_above_cost`, so every call pays the compilation. If production has `jit = on`, anonymous
`catalog_lookup` RPCs will be slow or time out under PostgREST's role timeout. Check with `show jit;` on production.
The fix would be `alter function … set jit = off` on the three functions, which is a migration and outside this
audit. Separately, cost grows about linearly with tokens (~6 ms per token on the fixture; the real catalog has about 180×
the aliases). A 1,140-character repeated title (CQ-233) took 4.7–5.4 s with JIT off. Anonymous callers can send
unbounded titles.

### Other observations (not defects)

- **Decision and tier can disagree.** `MATCH / INSUFFICIENT` (brand contradicted, CQ-170), `INSUFFICIENT / REVIEW`
  (fuzzy candidate of a named brand) and `MATCH / REVIEW` (bundle) all occur. Consumers must act on `tier`, never on
  `decision`.
- **Fuzzy matches never auto-approve.** Every typo in a model token fell to REVIEW or INSUFFICIENT. That is safe, but
  AUTO coverage on perturbed titles fell (accuracy 62% against 80% on authored titles).
- **Spanish ordinals** ("3ra / 3era / 4ta generación") are not read as generations. "scarlett 4i4 3era generacion"
  reads `3era` as an unknown code and falls to the Scarlett line (REVIEW). Whether the real aliases cover these is
  unknown.
- **Accessory words trigger the bundle rule.** "zoom g1x four … con pedal de expresion" and "pearl roadshow … con
  platillos" become bundles (REVIEW). That is safe, but it costs AUTO.
- **Injection-style text is inert.** SQL-, markup- and instruction-style inputs return INSUFFICIENT unless they also
  name a real product, which then matches as an identity (CQ-223, CQ-227). That is correct for the catalog. Jev's
  model layer must treat the text as data, because "ya fue verificado por Laria" reaches it unchanged.

### Fixture benchmark (synthetic data; for the runner's shape, not for the catalog)

| Metric | Value | Denominator |
| --- | ---: | ---: |
| Recall@1 / @3 / @5 | 92.6 / 96.1 / 97.7% | 258 resolved model cases |
| Resolution accuracy | 75.9% | 311 |
| AUTO coverage on AUTO_OK cases | 73.2% | 239 |
| Unsafe AUTO | 11 (all F1–F4) | 311 |
| AUTO on a wrong product | 0 | 186 AUTO results |
| Out-of-catalog cases reaching AUTO | 6 (all copy / two-product cases) | 45 |
| Latency p50 / p95, jit off | 24 / 45 ms | 311 calls per function |

The full tables by origin, category and ambiguity are in `results/fixture-smoke/summary.md`.

## Severity-ranked findings

| # | Sev. | Finding | Evidence | Confidence |
| --- | --- | --- | --- | --- |
| 1 | S1 | Copy/replica titles with "de" or an article before the brand match the genuine product at AUTO | F1, CQ-190/192/194 | High (code path; vocabulary-independent) |
| 2 | S1 | A category contradiction cannot pull a branded exact match below AUTO, and Jev does not receive `category_intent` | F2, score arithmetic | High |
| 3 | S1 | Two unconnected products in one title → AUTO on one | F3, CQ-177/195 | High |
| 4 | S2 | Generation-less titles AUTO-match the bare-named generation | F4, CQ-142 | Medium (depends on how the catalog names first generations) |
| 5 | S2 | JIT adds ~5 s per call when `jit = on`; no input-length cap on anon RPCs | F6 | High that it happens on PG16 with jit on; production setting unknown |
| 6 | S2 | A size or number after the model is flagged as a version: the right product ranks below wrong sizes | F5, CQ-065/056/052 | High on the code path; impact depends on real aliases |
| 7 | S2 | `catalog_jev_inputs` returns `detailed = true` for products whose tier is INSUFFICIENT or REVIEW (59 + 28 of 311 on the fixture) | Jev section | High |
| 8 | S3 | Decision/tier disagree (MATCH/INSUFFICIENT, INSUFFICIENT/REVIEW) | Jev section | High |
| 9 | S3 | Spanish generation ordinals not normalized | CQ-155, CQ-149 | Medium (data-dependent) |
| — | ? | Every data-integrity question in the brief | 43 checks ready | **Not measured** |

## Recommended corrections

None was applied. Each needs a migration or an ETL change and Henri's decision.

1. **F1:** widen the copy-word window to the first model token after the copy word, skipping noise, articles and brand
   tokens, or block AUTO whenever a copy word appears anywhere before the model span. Add "copia", "imitación",
   "réplica", "clon", "tipo", "estilo" and "inspirada en" to the copy vocabulary if they are missing.
2. **F2:** make a contradicted category intent a reason (`category_contradicted`) that caps the tier at REVIEW, as
   `brand_contradicted` already does, and pass `category_intent` through `catalog_jev_inputs`.
3. **F3:** when two strong, warning-free candidates from different products each explain disjoint tokens, return
   CONFLICTING (or `bundle`), whatever the connector.
4. **F4:** in the ETL, give first generations an explicit generation name where one exists (Katana-50 → "Katana-50
   (MkI)") and make the bare line name a family. Measure with the corpus's `missing_generation` cases.
5. **F5:** in `catalog_lookup_candidates`, do not flag a number that the matched alias explains (`<n>in` among the
   alias tokens), the way the outer lookup already treats sizes.
6. **F6:** run `show jit;` on production. If it is on, `set jit = off` on the three functions. Cap titles (for example
   200 characters) in the server code that will call the lookup.
7. **Jev contract:** see the handoff. Gate everything on `tier`, and send `detailed` only when tier is AUTO.
8. **Run the runner on the production build** before the autofill or Jev integration ships, and commit the results
   under `docs/catalog-audit/results/<label>/`.

## Autofill readiness

`autofill-readiness-matrix.csv` classifies each V1 listing attribute (`lib/instrument-filters.ts`) by stability and
gives a prefill rule, the conditions for withholding it, and the evidence it needs. It has 44 rows across the nine
instrument types plus the unit-specific fields.

| Class | Attributes | Rule |
| --- | --- | --- |
| Model-stable | body_type, shape, frets, bass_type, scale_length, acoustic_type, strings_material, microphone_type, polar_pattern, phantom_power, midi, pedal_type, format, amplifier_type, technology, power, cymbal_type, alloy | Prefill on AUTO when the value is trusted, has no conflict, and comes from a spec or the name. |
| Model-stable, unsafe from defaults | strings (guitar and bass) | Never prefill from `provenance = 'default'` without the seller confirming. |
| Variant-dependent | handedness, pickups (some lines), bridge (HT vs tremolo), kick_size, size (line-level cymbals), connection (interface generations) | Prefill only from a matched variant or a name that states the value. |
| Unit-specific | drums configuration, pieces, includes_hardware, includes_cymbals; condition, included items, price, photos, location | Never prefill (`functional-spec.md`). |
| Weak evidence or subjective | true_bypass, microphone use_case, interface `inputs` (definition differs) | Do not prefill, or suggest only. |

Conservative rules for withholding a value:

1. Prefill only when `tier = 'AUTO'`, `entity_level = 'model'`, `publish_ready`, `quality_status = 'ok'` and there is
   no warning. On REVIEW, show the candidate and prefill only after the seller confirms it. On FAMILY, prefill only the
   category and instrument type.
2. Use a value only if it is `trusted`, has an empty `conflict_values`, has provenance `spec` (or `name` where the name
   states the value), has a non-null `value_es`, and maps into the V1 enum. Withhold `default`-provenance values unless
   the seller confirms them.
3. Never fill an attribute listed in `variant_attributes` unless a variant was identified.
4. When the seller's text states a different value ("zurdo", "condensador", "7 cuerdas"), the seller's value wins and
   the listing is flagged for moderation, not overwritten.

**Coverage is not quantified.** `catalog_audit.py autofill` produces, per attribute group and attribute, the share of
model-level products with a trusted, conflict-free spec value (`safe_prefill_pct`), plus default, name and category
provenance, conflicts, missing `value_es` and variant dependence. On the production build, those numbers fill the last
column of the matrix.

## Jev readiness (`catalog_jev_inputs`)

The function returns one row of 20 fields, about 540 bytes on the fixture (maximum 600). Payload size is not a
concern, and no field looked unnecessary.

| Need | Sufficient? | Gap, with an example from the fixture |
| --- | --- | --- |
| Candidate identification | Yes for the top candidate | Only one rival, and only a strong rival within 0.02. Rival name and model are not included (a second call is needed). On 311 cases a rival was reported 3 times. |
| Evidence sufficiency | Partly | `detailed`, `missing_attributes`, `untrusted_attributes` describe the **top product even when it is not accepted**: `detailed = true` on 59 INSUFFICIENT and 28 REVIEW results. The attribute values themselves are absent, so Jev cannot compare the seller's values with the catalog's without another query. `matched_text` and `variant` are absent. |
| Evidence conflict | No for category | `category_intent` is computed by `catalog_match` but dropped by `catalog_jev_inputs`, and a category contradiction yields no reason (F2). A brand contradiction does appear (`brand_contradicted`, `brand_mentioned`). |
| Uncertainty | Yes, if read from `tier` | `decision` and `tier` can disagree (`MATCH/INSUFFICIENT`, `INSUFFICIENT/REVIEW`, `MATCH/REVIEW`). `reasons` is informative: fuzzy_only, low_score, warning, bundle, family, tie, brand_contradicted. |
| Human moderation | Partly | Moderators would need the matched text, the rival's name and the category intent to see why a candidate was proposed. |

Recommended additions to the contract, each backed by an example above: `category_intent` and a
`category_contradicted` reason (F2), `matched_text`, the rival's manufacturer and model, and the detail fields only
when `tier = 'AUTO'` (or a separate `accepted` flag). This audit did not change the function, and no duplicate Jev
integration benchmark was run.

## Limitations

- **No production or full-catalog data was read.** All matching numbers are from a 151-product synthetic fixture with
  guessed aliases and vocabulary. Recall, coverage and latency on the real catalog are unknown.
- PostgreSQL 16 locally, against 17.11 in production. The JIT finding must be confirmed on production's settings.
- Seller inputs are authored, not real listings. Labels are AI-inferred, and 44 are explicitly flagged for human
  review. The web check grounds that each product exists, not how the catalog names it.
- `pg_cron` was skipped, and the `auth` and admin functions are stubs. Neither matters to the matching functions.
- Out-of-catalog labels for real brands (Strymon, Kemper, Neural DSP, Fractal, Antelope) assume those brands may be
  absent from the reduced catalog. On the real catalog the runner reports them as matched if they are present, and a
  person should relabel them.
