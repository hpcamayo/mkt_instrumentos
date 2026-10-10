// Catalog autofill + Jev prototype benchmark (docs/catalog-autofill-jev-prototype.md).
//
//   node --require ./tests/setup-alias.cjs scripts/catalog-prototype/benchmark.cjs --source=local [--out=file.md]
//   node --require ./tests/setup-alias.cjs scripts/catalog-prototype/benchmark.cjs --source=supabase [--jev=gateway]
//
// --source=local     the catalog SQL functions on a local Postgres loaded by scripts/catalog-prototype/setup-local.sh
//                    (fixture rows: the numbers measure the code paths, not the real catalog)
// --source=supabase  read-only RPCs and public catalog reads with NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
//                    (nothing is written; catalog_search_log is not touched)
// --jev=gateway      real Jev through the AI Gateway (needs AI_GATEWAY_API_KEY); default is the labeled mock provider
//
// Every seller step is simulated from evaluation-cases.json: type brand/model -> catalog suggestions -> accept,
// choose, pick a variant, edit or reject -> saved listing evidence -> Jev -> deterministic policy -> transition plan.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
const autofill = require("@/lib/catalog-intelligence/autofill");
const resolver = require("@/lib/catalog-intelligence/catalog-resolver");
const { DEMO_THRESHOLDS, readJevConfig } = require("@/lib/catalog-intelligence/config");
const { createMockDecisionProvider } = require("@/lib/catalog-intelligence/decision-provider");
const { evaluateListing, planTransition } = require("@/lib/catalog-intelligence/evaluate-listing");

function psqlJson(sql, vars) {
  const input = `${Object.entries(vars).map(([key, value]) => `\\set ${key} '${String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "''")}'`).join("\n")}\n${sql}\n`;
  const result = spawnSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", process.env.CATALOG_PROTO_DB || "catalog_proto"], { input, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout.trim() || "null");
}

function localSource() {
  return {
    async lookup(query, hint, max) {
      return psqlJson("select coalesce(json_agg(t), '[]') from catalog_lookup(:'q', nullif(:'h', ''), :max) t;", { q: query, h: hint, max }).map(resolver.normalizeLookupRow);
    },
    async match(query, hint) {
      return resolver.normalizeMatchRow(psqlJson("select row_to_json(t) from catalog_match(:'q', nullif(:'h', '')) t;", { q: query, h: hint }));
    },
    async jevInputs(query, hint) {
      return resolver.normalizeJevInputsRow(psqlJson("select row_to_json(t) from catalog_jev_inputs(:'q', nullif(:'h', '')) t;", { q: query, h: hint }));
    },
    async productDetail(id) {
      return psqlJson(fs.readFileSync(path.join(__dirname, "product-detail.sql"), "utf8"), { id });
    },
  };
}

function supabaseSource() {
  const client = resolver.getCatalogSupabaseClient();
  if (!client) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for --source=supabase.");
  return resolver.createSupabaseCatalogSource(client);
}

const key = (manufacturer, model) => (manufacturer && model ? `${manufacturer}|${model}` : null);

async function runCase(catalog, base, item, provider) {
  const c = { ...base, ...item, listing: { ...base.listing, ...item.listing }, autofill: { ...base.autofill, ...item.autofill } };
  const { query, manufacturerHint } = resolver.catalogQuery(c.brand, c.model);
  const started = Date.now();
  const [match, rows] = await Promise.all([catalog.match(query, manufacturerHint), catalog.lookup(query, manufacturerHint, 8)]);
  const lookupMs = Date.now() - started;
  const lookup = autofill.classifyLookup(match, rows);
  const ranked = lookup.candidates.map((candidate) => key(candidate.manufacturer, candidate.model));

  // the seller's form
  const form = { brand: c.brand, model: c.model, category: c.listing.category ?? "", instrument_type: c.listing.instrument_type ?? "", attributes: {} };
  let suggestion = null;
  let action = "none";
  let rejected = null;
  if (c.autofill.action === "accept") {
    const wanted = c.autofill.choose ? lookup.candidates.find((candidate) => key(candidate.manufacturer, candidate.model) === c.autofill.choose) : lookup.candidates.find((candidate) => candidate.productId === lookup.topProductId);
    if (wanted) {
      const detail = await catalog.productDetail(wanted.productId);
      const variant = c.autofill.variant ? detail.variants.find((v) => v.variant_name === c.autofill.variant) : null;
      suggestion = autofill.buildAutofillSuggestion(detail, variant ? variant.id : null);
      action = "accepted";
      for (const s of suggestion.suggestions) {
        if (s.field.startsWith("attribute:")) form.attributes[s.field.slice(10)] = s.value;
        else form[s.field] = s.value;
      }
    }
  } else if (c.autofill.action === "reject") {
    action = "rejected";
    rejected = lookup.topProductId;
  }
  for (const [field, value] of Object.entries(c.autofill.edits ?? {})) {
    if (field.startsWith("attribute:")) form.attributes[field.slice(10)] = value;
    else form[field] = value;
  }
  const finalValues = { brand: form.brand, model: form.model, category: form.category, instrument_type: form.instrument_type, ...Object.fromEntries(Object.entries(form.attributes).map(([k, v]) => [`attribute:${k}`, v])) };
  const provenance = autofill.buildProvenance({ rawClaims: { brand: c.brand, model: c.model }, lookup, action, suggestion, rejectedProductId: rejected, finalValues });

  const listing = {
    listing_id: `bench-${c.id}`, version: 1, status: "pending", seller_kind: c.seller_kind, operation: c.operation,
    title: c.listing.title || `${form.brand} ${form.model}`, brand: form.brand, model: form.model, category: form.category,
    instrument_type: form.instrument_type, description: c.listing.description, attributes: form.attributes, condition: c.listing.condition,
    price_pen: c.listing.price_pen, photo_count: c.listing.photo_count, city: c.listing.city, region: c.listing.region, identifiers: [], autofill: provenance,
  };
  const config = { ...readJevConfig({}), mode: "shadow", thresholds: DEMO_THRESHOLDS, timeoutMs: 300 };
  const run = await evaluateListing({ listing, catalog, provider: provider(c.scenario), config });
  const record = run.record;
  const plan = planTransition(record, { listing_id: listing.listing_id, version: 1, input_hash: record.input_hash, status: "pending", admin_decided: false, applied_evaluation_id: null });

  const e = c.expected;
  const checks = [
    ["kind", lookup.kind === e.kind, `${lookup.kind}`],
    ["outcome", record.outcome === e.outcome, record.outcome],
  ];
  if (e.attributes_filled !== undefined) checks.push(["attributes_filled", Object.keys(form.attributes).length === e.attributes_filled, String(Object.keys(form.attributes).length)]);
  if (e.attribute) checks.push(["attribute", form.attributes[e.attribute[0]] === e.attribute[1], String(form.attributes[e.attribute[0]])]);
  if (e.attribute_absent) checks.push(["attribute_absent", !(e.attribute_absent in form.attributes), String(form.attributes[e.attribute_absent])]);
  if (e.modified) checks.push(["modified", JSON.stringify(provenance.modified) === JSON.stringify(e.modified), provenance.modified.join(",")]);
  if (e.seller_action) checks.push(["seller_action", provenance.seller_action === e.seller_action, provenance.seller_action]);
  if (e.attempts) checks.push(["attempts", record.attempts === e.attempts, String(record.attempts)]);
  if (e.final_product) {
    const top = record.candidates.find((candidate) => candidate.product_id === record.catalog.product_id);
    const got = top ? key(top.manufacturer, top.model) : null;
    checks.push(["final_product", got === e.final_product, String(got)]);
  }
  if (e.blocked_by) {
    const failed = record.gates.filter((g) => !g.passed).map((g) => g.id);
    checks.push(["blocked_by", failed.includes(e.blocked_by), failed.join(",") || "none"]);
  }
  if (e.redacted) checks.push(["redacted", Boolean(run.packet && !/987 654 321|vendo@example\.com/.test(JSON.stringify(run.packet))), "packet"]);
  if (checks.some(([, ok]) => !ok)) {
    console.error(`${c.id}: failed gates ${record.gates.filter((g) => !g.passed).map((g) => `${g.id} (${g.detail})`).join("; ") || "none"}`);
  }
  return { c, lookup, ranked, record, plan, checks, lookupMs };
}

function rate(hits, total) {
  return total ? `${hits}/${total} (${((100 * hits) / total).toFixed(1)}%)` : "n/a";
}

(async () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, "evaluation-cases.json"), "utf8"));
  const sourceName = args.source || "local";
  const catalog = sourceName === "supabase" ? supabaseSource() : localSource();
  let provider = (scenario) => createMockDecisionProvider(scenario);
  if (args.jev === "gateway") {
    if (!process.env.AI_GATEWAY_API_KEY) throw new Error("--jev=gateway needs AI_GATEWAY_API_KEY.");
    const { createJevGatewayProvider } = require("@/lib/catalog-intelligence/jev-gateway-provider");
    provider = (scenario) => (scenario === "normal" ? createJevGatewayProvider(process.env.JEV_MODEL_ID || undefined) : createMockDecisionProvider(scenario));
  }

  const results = [];
  for (const item of corpus.cases) results.push(await runCase(catalog, corpus.defaults, item, provider));

  // retrieval (identity) metrics, separate from moderation metrics (spec section 19)
  const withProduct = results.filter((r) => r.c.expected.product);
  const recallAt = (k) => withProduct.filter((r) => r.ranked.slice(0, k).includes(r.c.expected.product)).length;
  const unknown = results.filter((r) => r.c.expected.product === null && r.c.expected.kind === "unknown");
  const autos = results.filter((r) => r.record.outcome === "AUTO_APPROVE");
  const autoCorrect = autos.filter((r) => r.c.expected.outcome === "AUTO_APPROVE");
  const expectedAutos = results.filter((r) => r.c.expected.outcome === "AUTO_APPROVE");
  const conflictExpected = results.filter((r) => r.c.expected.outcome === "CONFLICTING");
  const conflictFound = results.filter((r) => r.record.outcome === "CONFLICTING");
  const conflictHit = conflictFound.filter((r) => r.c.expected.outcome === "CONFLICTING");
  const failures = results.filter((r) => r.record.outcome === "SYSTEM_FAILURE");
  const latencies = results.map((r) => r.lookupMs).sort((a, b) => a - b);

  const lines = [];
  lines.push(`# Prototype benchmark: ${sourceName === "supabase" ? "Supabase catalog (read-only)" : "LOCAL FIXTURE catalog"}, Jev ${args.jev === "gateway" ? "via AI Gateway" : "MOCK provider"}`);
  lines.push("");
  lines.push(`Run ${new Date().toISOString()} on ${results.length} labeled cases (scripts/catalog-prototype/evaluation-cases.json), demo thresholds (uncalibrated).`);
  if (sourceName !== "supabase") lines.push("Fixture rows, not the production catalog: these figures check the code paths and say nothing about real recall.");
  if (args.jev !== "gateway") lines.push("Jev answers come from the mock provider's fixed rules: outcome figures are NOT Jev accuracy.");
  lines.push("");
  lines.push("| Case | Lookup kind | Outcome | Transition | Checks |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const r of results) {
    const failed = r.checks.filter(([, ok]) => !ok);
    lines.push(`| ${r.c.id} | ${r.lookup.kind} | ${r.record.outcome} | ${r.plan.action === "publish" ? "publish" : r.plan.reason} | ${failed.length ? `FAIL ${failed.map(([name, , got]) => `${name}=${got}`).join("; ")}` : "pass"} |`);
  }
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Retrieval Recall@1 / @3 / @5 | ${rate(recallAt(1), withProduct.length)} / ${rate(recallAt(3), withProduct.length)} / ${rate(recallAt(5), withProduct.length)} |`);
  lines.push(`| Lookup kind as labeled (exact / family / ambiguous / conflicting / unknown) | ${rate(results.filter((r) => r.lookup.kind === r.c.expected.kind).length, results.length)} |`);
  lines.push(`| Unknown products left unmatched | ${rate(unknown.filter((r) => r.lookup.kind === "unknown").length, unknown.length)} |`);
  lines.push(`| Policy outcome as labeled | ${rate(results.filter((r) => r.record.outcome === r.c.expected.outcome).length, results.length)} |`);
  lines.push(`| Autoapproval precision (shadow) | ${rate(autoCorrect.length, autos.length)} |`);
  lines.push(`| Autoapproval coverage | ${rate(autoCorrect.length, expectedAutos.length)} |`);
  lines.push(`| Human-review rate | ${rate(results.length - autos.length, results.length)} |`);
  lines.push(`| Conflict detection precision / recall | ${rate(conflictHit.length, conflictFound.length)} / ${rate(conflictHit.length, conflictExpected.length)} |`);
  lines.push(`| SYSTEM_FAILURE outcomes (forced scenarios) | ${failures.length} |`);
  lines.push(`| Transitions that would publish | ${results.filter((r) => r.plan.action === "publish").length} |`);
  lines.push(`| Catalog lookup latency p50 / max (ms, match + lookup) | ${latencies[Math.floor(latencies.length / 2)]} / ${latencies[latencies.length - 1]} |`);
  lines.push(`| Jev latency and cost | ${args.jev === "gateway" ? "see records" : "not measured (mock)"} |`);
  const report = lines.join("\n");
  console.log(report);
  if (args.out) fs.writeFileSync(args.out, `${report}\n`);
  if (results.some((r) => r.checks.some(([, ok]) => !ok))) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
