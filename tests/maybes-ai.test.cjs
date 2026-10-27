// UX-Effortless maybes: stock-24 "Pregúntale a tu tienda" and big-07 "Completar con IA" (docs/ux-effortless/maybes-ai.md).
// No test reaches Anthropic: every call goes to a fake client, and the requests are checked against the shapes of the
// pinned SDK's own type definitions. The database side (the log, its retention and anonymization) is
// tests/maybes-ai.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadModule(filename, mocks = {}) {
  const Module = require("node:module");
  const ts = require("typescript");
  const source = path.join(root, filename);
  const compiled = ts.transpileModule(read(filename), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = new Module(source, module);
  mod.filename = source;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : original(name));
  mod._compile(compiled, source);
  return mod.exports;
}

const nextServer = {
  NextResponse: class extends Response {
    static json(body, init = {}) {
      return new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
    }
  },
};

async function withEnv(values, run) {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function quietly(run) {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    return await run(warnings);
  } finally {
    console.warn = warn;
  }
}

const config = () => loadModule("lib/ai/config.ts", { "server-only": {} });
const claude = (mocks = {}) => loadModule("lib/ai/claude.ts", { "server-only": {}, "@/lib/ai/config": config(), ...mocks });
const storeQuestion = require("../lib/ai/store-question.ts");
const listingAssist = require("../lib/ai/listing-assist.ts");

// An answer in the shape the API returns (BetaMessage): thinking first, then the JSON text.
function reply({ answer, text, stop = "end_turn", model = "claude-opus-5-5", usage = {}, content } = {}) {
  const body = text ?? (answer === undefined ? undefined : JSON.stringify(answer));
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model,
    container: null,
    context_management: null,
    diagnostics: null,
    content: content ?? [{ type: "thinking", thinking: "", signature: "sig" }, ...(body === undefined ? [] : [{ type: "text", text: body, citations: null }])],
    stop_reason: stop,
    stop_sequence: null,
    stop_details: stop === "refusal" ? { type: "refusal", category: "general_harms", explanation: null } : null,
    usage: { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: null, cache_read_input_tokens: null, iterations: null, ...usage },
  };
}

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        async create(params, options) {
          calls.push({ params, options });
          const next = responses.shift();
          if (next instanceof Error) throw next;
          return next;
        },
      },
    },
  };
}

// The body fields the pinned SDK declares for beta messages.create, read from its own type definitions.
function sdkFields(interfaceName) {
  const types = read("node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts");
  const start = types.indexOf(`export interface ${interfaceName} {`);
  assert.ok(start >= 0, interfaceName);
  const body = types.slice(start, types.indexOf("\n}\n", start));
  return new Set([...body.matchAll(/^ {4}([a-z_]+)\??:/gm)].map((match) => match[1]));
}

const STORE_ANSWER = {
  destination: "inventory",
  inventory: { search: "", stock: "out", publication: "", category: "guitars", price: "", sort: "updated" },
  statistics: { period: "30", focus: "" },
  gaps: [],
};

test("maybes AI: off unless the key and LARIA_AI_HELPERS=1 are both set; Opus 5.5 unless LARIA_AI_MODEL says otherwise", async () => {
  const cases = [
    [{ ANTHROPIC_API_KEY: "sk-test", LARIA_AI_HELPERS: "1" }, true],
    [{ ANTHROPIC_API_KEY: "sk-test", LARIA_AI_HELPERS: undefined }, false],
    [{ ANTHROPIC_API_KEY: "sk-test", LARIA_AI_HELPERS: "true" }, false],
    [{ ANTHROPIC_API_KEY: undefined, LARIA_AI_HELPERS: "1" }, false],
    [{ ANTHROPIC_API_KEY: "  ", LARIA_AI_HELPERS: "1" }, false],
  ];
  for (const [env, enabled] of cases) {
    await withEnv(env, () => assert.equal(config().aiHelpersEnabled(), enabled, JSON.stringify(env)));
  }
  await withEnv({ LARIA_AI_MODEL: undefined }, () => assert.equal(config().aiModel(), "claude-opus-5-5"));
  await withEnv({ LARIA_AI_MODEL: "claude-haiku-5-5" }, () => assert.equal(config().aiModel(), "claude-haiku-5-5"));
  await withEnv({ LARIA_AI_MODEL: "gpt-4o; drop table" }, () => assert.equal(config().aiModel(), "claude-opus-5-5"));
  const { supportsServerFallback, AI_LIMITS } = config();
  assert.ok(supportsServerFallback("claude-opus-5-5") && !supportsServerFallback("claude-haiku-5-5"));
  assert.deepEqual(AI_LIMITS, {
    storeQuestion: { bucket: "ai.store_question", limit: 50, windowSeconds: 86400 },
    listingAssist: { bucket: "ai.listing_assist", limit: 20, windowSeconds: 86400 },
  });
  for (const [value, limit] of [[undefined, 500], ["120", 120], ["0", 500], ["-3", 500], ["ten", 500], ["2.5", 500]]) {
    await withEnv({ LARIA_AI_DAILY_CAP: value }, () => assert.deepEqual(config().aiSiteRule(), { bucket: "ai.daily", limit, windowSeconds: 86400 }, String(value)));
  }
});

test("maybes AI: a request is structured output with an effort, no thinking or sampling fields, and fallbacks only where they exist", () => {
  const { structuredRequest } = claude();
  const call = { system: "Sistema", content: [{ type: "text", text: "¿Qué guitarras tengo agotadas?" }], schema: storeQuestion.storeQuestionSchema(), effort: "low", maxTokens: 2000, timeoutMs: 15000 };
  const opus = structuredRequest("claude-opus-5-5", call);
  assert.deepEqual(opus, {
    model: "claude-opus-5-5",
    max_tokens: 2000,
    system: "Sistema",
    messages: [{ role: "user", content: call.content }],
    output_config: { effort: "low", format: { type: "json_schema", schema: call.schema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  const haiku = structuredRequest("claude-haiku-5-5", { ...call, effort: "medium" });
  assert.equal(haiku.fallbacks, undefined, "Claude Haiku 5.5 has no server-side fallback");
  assert.equal(haiku.betas, undefined);
  assert.equal(haiku.output_config.effort, "medium");
  // Every field is one the pinned SDK's MessageCreateParams declares (betas is its header parameter), and the output
  // config one of BetaOutputConfig's; nothing it would reject, such as temperature, and no thinking field.
  const fields = new Set([...sdkFields("MessageCreateParamsBase"), "betas"]);
  for (const request of [opus, haiku]) {
    assert.deepEqual(Object.keys(request).filter((key) => !fields.has(key)), []);
    assert.deepEqual(Object.keys(request.output_config).filter((key) => !sdkFields("BetaOutputConfig").has(key)), []);
    for (const absent of ["temperature", "top_p", "top_k", "thinking", "tool_choice", "tools"]) assert.equal(absent in request, false, absent);
  }
  assert.ok(sdkFields("MessageCreateParamsBase").has("fallbacks") && sdkFields("MessageCreateParamsBase").has("output_config"));
  assert.match(read("node_modules/@anthropic-ai/sdk/resources/beta/beta.d.ts"), /'server-side-fallback-2026-07-01'/);
  assert.equal(JSON.parse(read("package.json")).dependencies["@anthropic-ai/sdk"], "1.3.0", "pinned exactly");
});

test("maybes AI: the answer is read after checking for a refusal, from the last text block, with every attempt's tokens", async () => {
  const { callStructured } = claude();
  const call = { system: "s", content: [{ type: "text", text: "q" }], schema: {}, effort: "low", maxTokens: 2000, timeoutMs: 15000 };
  await quietly(async (warnings) => {
    const ok = fakeClient([reply({ answer: STORE_ANSWER })]);
    assert.deepEqual(await callStructured(ok, "claude-opus-5-5", call, "store_question"),
      { status: "ok", model: "claude-opus-5-5", inputTokens: 1200, outputTokens: 300, data: STORE_ANSWER });
    assert.deepEqual(ok.calls[0].options, { timeout: 15000, maxRetries: 1 });

    // A refusal is never read as an answer, even when it carries text.
    const refused = await callStructured(fakeClient([reply({ stop: "refusal", text: JSON.stringify(STORE_ANSWER), usage: { input_tokens: 900, output_tokens: 0 } })]), "claude-opus-5-5", call, "store_question");
    assert.deepEqual(refused, { status: "refused", model: "claude-opus-5-5", inputTokens: 900, outputTokens: 0 });
    assert.deepEqual(warnings.at(-1), ["ai-call-refused", "store_question", "general_harms"]);

    // A fallback answered: both attempts are billed and the model is the one that answered.
    const fallback = await callStructured(fakeClient([reply({
      answer: STORE_ANSWER,
      model: "claude-opus-5",
      usage: {
        input_tokens: 1300,
        output_tokens: 200,
        iterations: [
          { type: "message", model: "claude-opus-5-5", input_tokens: 1200, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: null },
          { type: "fallback_message", model: "claude-opus-5", input_tokens: 1300, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: null },
        ],
      },
    })]), "claude-opus-5-5", call, "store_question");
    assert.deepEqual(fallback, { status: "ok", model: "claude-opus-5", inputTokens: 2500, outputTokens: 200, data: STORE_ANSWER });

    for (const [response, status] of [
      [reply({ stop: "max_tokens", text: "{\"destination\":" }), "invalid"],
      [reply({ text: "no es JSON" }), "invalid"],
      [reply({}), "invalid"],
      [reply({ stop: "pause_turn", answer: STORE_ANSWER }), "invalid"],
    ]) {
      assert.equal((await callStructured(fakeClient([response]), "claude-opus-5-5", call, "store_question")).status, status);
    }
    const Anthropic = require("@anthropic-ai/sdk");
    const failed = await callStructured(fakeClient([new Anthropic.APIError(529, { type: "error" }, "Overloaded", new Headers())]), "claude-opus-5-5", call, "store_question");
    assert.deepEqual(failed, { status: "failed", model: "claude-opus-5-5", inputTokens: 0, outputTokens: 0 });
    assert.deepEqual(warnings.at(-1), ["ai-call-failed", "store_question", "status 529"]);
    assert.equal((await callStructured(fakeClient([new TypeError("fetch failed")]), "claude-opus-5-5", call, "x")).status, "failed");
    // The log line never carries the question or the answer.
    assert.ok(warnings.every((line) => !JSON.stringify(line).includes("guitars")));
  });
});

test("maybes AI: the fake client answers only under next dev with LARIA_AI_FAKE=1, and a production build refuses the flag", async () => {
  const marker = { fake: true };
  const load = () => claude({ "@/lib/ai/fake-client": { fakeAiClient: marker } });
  await withEnv({ NODE_ENV: "development", LARIA_AI_FAKE: "1", ANTHROPIC_API_KEY: undefined }, async () => assert.equal(await load().getAiClient(), marker));
  await withEnv({ NODE_ENV: "production", LARIA_AI_FAKE: "1", ANTHROPIC_API_KEY: undefined }, async () => assert.equal(await load().getAiClient(), null));
  await withEnv({ NODE_ENV: "production", LARIA_AI_FAKE: undefined, ANTHROPIC_API_KEY: "sk-test" }, async () => {
    const real = await load().getAiClient();
    assert.notEqual(real, marker);
    assert.equal(typeof real.beta.messages.create, "function");
  });
  assert.match(read("next.config.ts"), /if \(process\.env\.NODE_ENV === "production" && process\.env\.LARIA_AI_FAKE\) \{\n\s+throw new Error/);
  assert.match(read("lib/ai/claude.ts"), /if \(process\.env\.NODE_ENV !== "production" && process\.env\.LARIA_AI_FAKE === "1"\) \{\n\s+return \(await import\("@\/lib\/ai\/fake-client"\)\)/);
  // The fake's answers are valid ones, so the screenshots show what a real answer would.
  const { fakeAiClient } = loadModule("lib/ai/fake-client.ts");
  const { callStructured } = claude();
  const ask = async (question) => {
    const result = await callStructured(fakeAiClient, "claude-opus-5-5", { system: "", content: [{ type: "text", text: question }], schema: storeQuestion.storeQuestionSchema(), effort: "low", maxTokens: 2000, timeoutMs: 1 }, "t");
    return storeQuestion.storeAnswerHref(storeQuestion.parseStoreAnswer(result.data));
  };
  assert.equal(await ask("¿Qué guitarras tengo agotadas?"), "/mi-cuenta/tienda/inventario?stock=out&categoria=guitars&asi=1");
  assert.equal(await ask("¿Qué pedales tengo con menos de 2 unidades?"), "/mi-cuenta/tienda/inventario?stock=low&categoria=pedals&orden=available_asc&asi=1&falta=quantity");
  assert.equal(await ask("¿Qué vendí más este mes?"), "/mi-cuenta/tienda/inventario/reponer?asi=1&falta=sales%2Cdates");
  assert.equal(await ask("Lo más visto esta semana"), "/mi-cuenta/tienda/estadisticas?periodo=7&enfoque=views&asi=1");
  const assist = await callStructured(fakeAiClient, "claude-opus-5-5", { system: "", content: [], schema: listingAssist.listingAssistSchema(), effort: "medium", maxTokens: 8000, timeoutMs: 1 }, "t");
  assert.equal(listingAssist.parseListingSuggestion(assist.data).brand, "Boss");
});

test("stock-24: the answer's schema is the site's own lists, and anything outside them is refused before a link is built", () => {
  const schema = storeQuestion.storeQuestionSchema();
  const objects = [schema, schema.properties.inventory, schema.properties.statistics];
  for (const object of objects) {
    assert.equal(object.additionalProperties, false);
    assert.deepEqual([...object.required].sort(), Object.keys(object.properties).sort());
  }
  // Structured outputs take no length or number limits.
  assert.doesNotMatch(JSON.stringify(schema), /minLength|maxLength|minimum|maximum|pattern|description/);
  const inventory = require("../lib/store-inventory.ts");
  assert.deepEqual(schema.properties.inventory.properties.stock.enum, inventory.STOCK_FILTERS.map((entry) => entry.value));
  assert.deepEqual(schema.properties.inventory.properties.sort.enum, inventory.SORTS.map((entry) => entry.value));
  assert.deepEqual(schema.properties.inventory.properties.category.enum,
    ["", "guitars", "basses", "keyboards", "percussion", "winds", "strings", "pedals", "amplifiers", "microphones", "audio", "none"]);
  assert.match(storeQuestion.storeQuestionSystemPrompt(), /never see the store's data/);

  const { parseStoreAnswer, storeAnswerHref } = storeQuestion;
  const answer = parseStoreAnswer(STORE_ANSWER);
  assert.equal(answer.filters.stock, "out");
  assert.equal(storeAnswerHref(answer), "/mi-cuenta/tienda/inventario?stock=out&categoria=guitars&asi=1");
  for (const broken of [
    { ...STORE_ANSWER, destination: "admin" },
    { ...STORE_ANSWER, inventory: { ...STORE_ANSWER.inventory, stock: "lots" } },
    { ...STORE_ANSWER, inventory: { ...STORE_ANSWER.inventory, category: "drums" } },
    { ...STORE_ANSWER, inventory: { ...STORE_ANSWER.inventory, sort: "sold_desc" } },
    { ...STORE_ANSWER, statistics: { period: "90", focus: "" } },
    { ...STORE_ANSWER, gaps: ["quantity", "everything"] },
    { ...STORE_ANSWER, inventory: { ...STORE_ANSWER.inventory, search: 42 } },
    { ...STORE_ANSWER, gaps: "quantity" },
    null,
    "inventory",
  ]) {
    assert.equal(parseStoreAnswer(broken), null, JSON.stringify(broken));
  }
  // The search text is the inventory's own search: letters, numbers and punctuation, at most 60 characters.
  const search = parseStoreAnswer({ ...STORE_ANSWER, inventory: { ...STORE_ANSWER.inventory, search: "  Fender <script>alert(1)</script>  Strat ".padEnd(90, "x") } });
  assert.equal(search.filters.q.length <= 60, true);
  assert.doesNotMatch(search.filters.q, /[<>]/);
  // Another destination keeps the inventory's defaults, whatever the model put there.
  const statistics = parseStoreAnswer({ ...STORE_ANSWER, destination: "statistics", statistics: { period: "all", focus: "contacts" }, gaps: ["dates", "dates"] });
  assert.equal(statistics.filters.stock, "all");
  assert.deepEqual(statistics.gaps, ["dates"]);
  assert.equal(storeAnswerHref(statistics), "/mi-cuenta/tienda/estadisticas?periodo=0&enfoque=contacts&asi=1&falta=dates");
  assert.equal(storeAnswerHref(parseStoreAnswer({ ...STORE_ANSWER, destination: "reorder", gaps: ["sales"] })), "/mi-cuenta/tienda/inventario/reponer?asi=1&falta=sales");
  assert.equal(storeAnswerHref(parseStoreAnswer({ ...STORE_ANSWER, destination: "none" })), null);
  // The question never goes in a link.
  assert.doesNotMatch(storeAnswerHref(parseStoreAnswer({ ...STORE_ANSWER, inventory: { ...STORE_ANSWER.inventory, search: "" } })), /pregunta|question/);
});

test("stock-24: \"Así lo entendí\" shows each filter as a chip that removes it, and says plainly what no filter covers", () => {
  const { understoodFromParams, inventoryUnderstood, statisticsUnderstood, reorderUnderstood, STORE_GAP_TEXT } = storeQuestion;
  assert.equal(understoodFromParams({}), null);
  assert.equal(understoodFromParams({ asi: "0" }), null);
  assert.deepEqual(understoodFromParams({ asi: "1", falta: "quantity,nada,quantity,dates" }), { gaps: ["quantity", "dates"] });
  const inventory = require("../lib/store-inventory.ts");
  const { filters } = inventory.parseInventoryFilters({ q: "Boss", stock: "low", categoria: "pedals", orden: "available_asc", asi: "1", falta: "quantity" });
  const understood = inventoryUnderstood(filters, ["quantity"]);
  assert.deepEqual(understood.chips.map((chip) => [chip.text, chip.href]), [
    ["«Boss»", "/mi-cuenta/tienda/inventario?stock=low&categoria=pedals&orden=available_asc&asi=1&falta=quantity"],
    ["Stock bajo", "/mi-cuenta/tienda/inventario?q=Boss&categoria=pedals&orden=available_asc&asi=1&falta=quantity"],
    ["Pedales", "/mi-cuenta/tienda/inventario?q=Boss&stock=low&orden=available_asc&asi=1&falta=quantity"],
    ["Orden: Menos stock disponible", "/mi-cuenta/tienda/inventario?q=Boss&stock=low&categoria=pedals&asi=1&falta=quantity"],
  ]);
  assert.equal(understood.closeHref, "/mi-cuenta/tienda/inventario?q=Boss&stock=low&categoria=pedals&orden=available_asc");
  assert.equal(inventoryUnderstood(inventory.DEFAULT_FILTERS, []).summary, "todo tu inventario activo");
  const stats = statisticsUnderstood(7, "views", ["dates"]);
  assert.deepEqual(stats.chips.map((chip) => [chip.text, chip.href]), [
    ["Últimos 7 días", "/mi-cuenta/tienda/estadisticas?periodo=0&enfoque=views&asi=1&falta=dates"],
    ["Lo más visto", "/mi-cuenta/tienda/estadisticas?periodo=7&asi=1&falta=dates"],
  ]);
  assert.equal(stats.sectionHref, "#ranking-publicaciones");
  assert.equal(statisticsUnderstood(0, "", []).summary, "todo el historial de tus estadísticas");
  assert.match(reorderUnderstood(["sales"]).summary, /agotados o en su aviso de stock bajo/);
  for (const text of Object.values(STORE_GAP_TEXT)) assert.ok(text.endsWith(".") && text.length < 90, text);
});

function storeRoute({ enabled = true, user = { id: "u-1" }, store = { id: "s-1" }, inventoryEnabled = true, allowance = "allowed", client, records = [], allowCalls = [] } = {}) {
  const real = claude();
  return loadModule("app/api/store/ask/route.ts", {
    "next/server": nextServer,
    "@/lib/ai/claude": { callStructured: real.callStructured, getAiClient: async () => client ?? null },
    "@/lib/ai/config": { ...config(), aiHelpersEnabled: () => enabled, aiModel: () => "claude-opus-5-5" },
    "@/lib/ai/usage": {
      allowAiCall: async (feature, subject) => { allowCalls.push([feature, subject]); return allowance; },
      recordAiRequest: async (record) => { records.push(record); },
    },
    "@/lib/store-inventory": { getInventorySummary: async () => ({ inventory_enabled: inventoryEnabled }) },
    "@/lib/supabase/server-client": {
      getSupabaseServerClient: async () => ({
        auth: { getUser: async () => ({ data: { user } }) },
        rpc: (name) => {
          assert.equal(name, "get_own_store");
          return { select: () => ({ maybeSingle: async () => ({ data: store }) }) };
        },
      }),
    },
  });
}

const ask = (question, raw) => new Request("https://laria.audio/api/store/ask", { method: "POST", body: raw ?? JSON.stringify({ question }) });

test("stock-24: /api/store/ask answers a store owner with Inventario with a link, within the store's limit, and logs the call without its content", async () => {
  await quietly(async () => {
    const records = [];
    const allowCalls = [];
    const client = fakeClient([reply({ answer: STORE_ANSWER })]);
    const response = await storeRoute({ client, records, allowCalls }).POST(ask("  ¿Qué guitarras tengo   agotadas? "));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, href: "/mi-cuenta/tienda/inventario?stock=out&categoria=guitars&asi=1" });
    assert.deepEqual(allowCalls, [["store_question", "s-1"]]);
    const { params } = client.calls[0];
    assert.deepEqual(params.messages, [{ role: "user", content: [{ type: "text", text: "¿Qué guitarras tengo agotadas?" }] }]);
    assert.equal(params.output_config.effort, "low");
    assert.equal(params.system, storeQuestion.storeQuestionSystemPrompt());
    assert.deepEqual(records, [{ feature: "store_question", userId: "u-1", storeId: "s-1", model: "claude-opus-5-5", inputTokens: 1200, outputTokens: 300, outcome: "answered" }]);

    // A question with no destination is answered without a link, and logged as no_match.
    const none = [];
    const noMatch = await storeRoute({ client: fakeClient([reply({ answer: { ...STORE_ANSWER, destination: "none" } })]), records: none }).POST(ask("¿Qué hora es?"));
    assert.equal(noMatch.status, 200);
    assert.match((await noMatch.json()).message, /No encontré filtros/);
    assert.equal(none[0].outcome, "no_match");

    for (const [response, status, code, outcome] of [
      [reply({ stop: "refusal" }), 422, "AI_REFUSED", "refused"],
      [reply({ answer: { ...STORE_ANSWER, destination: "everything" } }), 503, "AI_UNAVAILABLE", "invalid"],
      [new Error("socket hang up"), 503, "AI_UNAVAILABLE", "failed"],
    ]) {
      const logged = [];
      const result = await storeRoute({ client: fakeClient([response]), records: logged }).POST(ask("¿Qué guitarras tengo agotadas?"));
      assert.equal(result.status, status);
      assert.equal((await result.json()).code, code);
      assert.equal(logged[0].outcome, outcome);
    }
  });
});

test("stock-24: /api/store/ask refuses before any AI call when it is off, the account isn't a store with Inventario, or the limits are reached", async () => {
  for (const [options, question, status, code] of [
    [{ enabled: false }, "¿Qué tengo agotado?", 404, "AI_OFF"],
    [{}, "", 400, "AI_QUESTION_INVALID"],
    [{}, "x".repeat(201), 400, "AI_QUESTION_INVALID"],
    [{ user: null }, "¿Qué tengo agotado?", 401, "AUTH_REQUIRED"],
    [{ store: null }, "¿Qué tengo agotado?", 403, "AI_STORE_REQUIRED"],
    [{ inventoryEnabled: false }, "¿Qué tengo agotado?", 403, "AI_STORE_REQUIRED"],
    [{ allowance: "limited" }, "¿Qué tengo agotado?", 429, "AI_LIMIT"],
    [{ allowance: "site_limited" }, "¿Qué tengo agotado?", 429, "AI_SITE_LIMIT"],
    [{ allowance: "unavailable" }, "¿Qué tengo agotado?", 503, "AI_UNAVAILABLE"],
  ]) {
    const client = fakeClient([]);
    const records = [];
    const response = await storeRoute({ ...options, client, records }).POST(ask(question));
    assert.equal(response.status, status, code);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.match(body.message, /^[A-ZÁÉÍÓÚ¿]/);
    assert.equal(client.calls.length, 0, code);
    assert.deepEqual(records, [], code);
  }
  assert.match((await (await storeRoute({ allowance: "limited" }).POST(ask("¿Qué tengo agotado?"))).json()).message, /50 preguntas de hoy\. Se renueva a las 7 p\. m\., hora de Lima\./);
  const tooBig = await storeRoute().POST(ask(null, JSON.stringify({ question: "x".repeat(4000) })));
  assert.equal(tooBig.status, 400);
});

// A JPEG's first bytes, with its frame header saying how big it is; the route reads no further.
function jpeg(width, height, padding = 64) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return Buffer.from([0xff, 0xd8, ...app0, ...sof, ...new Array(padding).fill(0), 0xff, 0xd9]).toString("base64");
}

const SUGGESTION = {
  recognized: true,
  category: "pedals",
  instrument_type: "pedals",
  brand: "Boss",
  model: "DS-1",
  title: "Pedal Boss DS-1 Distortion",
  details: ["Carcasa naranja", "Tres perillas"],
  description: "Pedal de distorsión Boss DS-1 con su carcasa original.",
  confidence: "high",
};

function assistRoute({ enabled = true, user = { id: "u-2" }, allowance = "allowed", client, records = [], allowCalls = [] } = {}) {
  const real = claude();
  return loadModule("app/api/listing-assist/route.ts", {
    "next/server": nextServer,
    "@/lib/ai/claude": { callStructured: real.callStructured, getAiClient: async () => client ?? null },
    "@/lib/ai/config": { ...config(), aiHelpersEnabled: () => enabled, aiModel: () => "claude-haiku-5-5" },
    "@/lib/ai/usage": {
      allowAiCall: async (feature, subject) => { allowCalls.push([feature, subject]); return allowance; },
      recordAiRequest: async (record) => { records.push(record); },
    },
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
  });
}

const assist = (photos, raw) => new Request("https://laria.audio/api/listing-assist", { method: "POST", body: raw ?? JSON.stringify({ photos }) });

test("big-07: /api/listing-assist sends up to four small JPEGs and returns a suggestion checked against the site's registries", async () => {
  await quietly(async () => {
    const records = [];
    const allowCalls = [];
    const client = fakeClient([reply({ answer: { ...SUGGESTION, category: "pedals", instrument_type: "electric_guitar" }, model: "claude-haiku-5-5" })]);
    const photos = [jpeg(1024, 768), jpeg(768, 1024)];
    const response = await assistRoute({ client, records, allowCalls }).POST(assist(photos));
    assert.equal(response.status, 200);
    const { suggestion } = await response.json();
    // A type of another category is never kept: the seller picks Pedales' type in the form.
    assert.equal(suggestion.category, "pedals");
    assert.equal(suggestion.instrumentType, "");
    assert.equal(suggestion.brand, "Boss");
    assert.deepEqual(allowCalls, [["listing_assist", "u-2"]]);
    const { params } = client.calls[0];
    assert.deepEqual(params.messages[0].content.slice(0, 2), photos.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })));
    assert.equal(params.messages[0].content.at(-1).type, "text");
    assert.equal(params.output_config.effort, "medium");
    assert.equal(params.fallbacks, undefined, "Haiku: no server-side fallback");
    assert.deepEqual(records, [{ feature: "listing_assist", userId: "u-2", storeId: null, model: "claude-haiku-5-5", inputTokens: 1200, outputTokens: 300, outcome: "answered" }]);

    const unrecognized = [];
    const none = await assistRoute({ client: fakeClient([reply({ answer: { ...SUGGESTION, recognized: false } })]), records: unrecognized }).POST(assist([jpeg(800, 600)]));
    assert.equal(none.status, 200);
    assert.equal((await none.json()).suggestion.brand, "");
    assert.equal(unrecognized[0].outcome, "no_match");
  });
});

test("big-07: /api/listing-assist refuses anything but one to four small JPEGs, and every refusal comes before the AI call", async () => {
  for (const [options, body, status, code] of [
    [{ enabled: false }, JSON.stringify({ photos: [jpeg(800, 600)] }), 404, "AI_OFF"],
    [{}, JSON.stringify({ photos: [] }), 400, "AI_PHOTOS_INVALID"],
    [{}, JSON.stringify({ photos: Array.from({ length: 5 }, () => jpeg(800, 600)) }), 400, "AI_PHOTOS_INVALID"],
    [{}, JSON.stringify({ photos: [jpeg(2048, 1536)] }), 400, "AI_PHOTOS_INVALID"],
    [{}, JSON.stringify({ photos: [Buffer.from("<svg onload=alert(1)>").toString("base64")] }), 400, "AI_PHOTOS_INVALID"],
    [{}, JSON.stringify({ photos: ["data:image/jpeg;base64,AAAA"] }), 400, "AI_PHOTOS_INVALID"],
    [{}, JSON.stringify({ photos: [jpeg(800, 600, 620 * 1024)] }), 400, "AI_PHOTOS_INVALID"],
    [{}, "no es JSON", 400, "AI_PHOTOS_INVALID"],
    [{ user: null }, JSON.stringify({ photos: [jpeg(800, 600)] }), 401, "AUTH_REQUIRED"],
    [{ allowance: "limited" }, JSON.stringify({ photos: [jpeg(800, 600)] }), 429, "AI_LIMIT"],
    [{ allowance: "site_limited" }, JSON.stringify({ photos: [jpeg(800, 600)] }), 429, "AI_SITE_LIMIT"],
    [{ allowance: "unavailable" }, JSON.stringify({ photos: [jpeg(800, 600)] }), 503, "AI_UNAVAILABLE"],
  ]) {
    const client = fakeClient([]);
    const records = [];
    const response = await assistRoute({ ...options, client, records }).POST(assist(null, body));
    assert.equal(response.status, status, code);
    assert.equal((await response.json()).code, code);
    assert.equal(client.calls.length, 0, code);
    assert.deepEqual(records, [], code);
  }
  assert.match((await (await assistRoute({ allowance: "limited" }).POST(assist([jpeg(800, 600)]))).json()).message, /20 ayudas de hoy/);
  const { jpegSize } = listingAssist;
  assert.deepEqual(jpegSize(Buffer.from(jpeg(1024, 683), "base64")), { width: 1024, height: 683 });
  assert.equal(jpegSize(Buffer.from("GIF89a")), null);
});

test("big-07: the suggestion's schema and checks: the registries, the form's sizes, nothing about condition or price", () => {
  const { listingAssistSchema, parseListingSuggestion, listingAssistSystemPrompt } = listingAssist;
  const schema = listingAssistSchema();
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
  assert.doesNotMatch(JSON.stringify(schema), /minLength|maxLength|minimum|maximum|maxItems|condition|price/);
  assert.deepEqual(schema.properties.category.enum, ["", "guitars", "basses", "keyboards", "percussion", "winds", "strings", "pedals", "amplifiers", "microphones", "audio"]);
  assert.ok(schema.properties.instrument_type.enum.includes("electric_guitar") && schema.properties.instrument_type.enum.includes("audio_interface"));
  const prompt = listingAssistSystemPrompt();
  assert.match(prompt, /guitars \(Guitarras\): electric_guitar \(Guitarras eléctricas\), acoustic_guitar \(Guitarras acústicas\), other \(Otro\)/);
  assert.match(prompt, /Don't rate the overall condition/);
  assert.match(prompt, /don't mention a price/);

  const parsed = parseListingSuggestion({
    ...SUGGESTION,
    category: "guitars",
    instrument_type: "bass",
    brand: "  Fender\u0000 ",
    title: "T".repeat(150),
    details: ["Golpe en el borde", "golpe en el borde", "Golpe en el borde", "Fender", "A", "B", "C", "D", "E", "F"],
    description: "<b>Hola</b> " + "Frase corta. ".repeat(100),
  });
  assert.equal(parsed.category, "guitars");
  assert.equal(parsed.instrumentType, "", "a bass is not a type of Guitarras");
  assert.equal(parsed.brand, "Fender");
  assert.ok(parsed.title.length <= 100);
  assert.deepEqual(parsed.details, ["Golpe en el borde", "golpe en el borde", "A", "B", "C", "D"]);
  assert.ok(parsed.description.length <= 900 && !/[<>]/.test(parsed.description) && parsed.description.endsWith("."));
  assert.equal(parseListingSuggestion({ ...SUGGESTION, category: "drums" }).category, "");
  assert.equal(parseListingSuggestion({ ...SUGGESTION, confidence: "certain" }).confidence, "low");
  assert.deepEqual(parseListingSuggestion({ ...SUGGESTION, recognized: false }), {
    recognized: false, category: "", instrumentType: "", brand: "", model: "", title: "", details: [], description: "", confidence: "low",
  });
  for (const broken of [null, [], { ...SUGGESTION, recognized: "yes" }, { ...SUGGESTION, details: "a" }, { ...SUGGESTION, brand: 3 }, { ...SUGGESTION, details: [1] }]) {
    assert.equal(parseListingSuggestion(broken), null, JSON.stringify(broken));
  }
});

test("big-07: \"Usar\" fills one field, and \"Usar todo\" fills only what is empty, never what the seller wrote", () => {
  const { assistRows, applyAssistField, applyAllAssist, parseListingSuggestion } = listingAssist;
  const suggestion = parseListingSuggestion(SUGGESTION);
  const empty = { category: "", instrumentType: "", brand: "", model: "", title: "", titleEdited: false, condition: "", price: "", city: "Lima", region: "Lima", description: "", attributes: {} };
  assert.deepEqual(assistRows(suggestion, empty, "").map((row) => [row.field, row.state]),
    [["type", "empty"], ["brand", "empty"], ["model", "empty"], ["title", "empty"], ["details", "empty"], ["description", "empty"]]);
  const all = applyAllAssist(empty, suggestion, "");
  assert.deepEqual(all.kept, []);
  assert.equal(all.values.category, "pedals");
  assert.equal(all.values.instrumentType, "pedals");
  assert.equal(all.values.title, "Pedal Boss DS-1 Distortion");
  assert.equal(all.values.titleEdited, true);
  assert.equal(all.values.description, "Pedal de distorsión Boss DS-1 con su carcasa original.\n\nDetalles:\n- Carcasa naranja\n- Tres perillas");
  assert.ok(assistRows(suggestion, all.values, "").every((row) => row.state === "same"));
  assert.equal(all.values.condition + all.values.price, "", "no condition or price");

  // What the seller wrote stays; their rows offer "Reemplazar".
  const typed = { ...empty, category: "guitars", instrumentType: "electric_guitar", brand: "Behringer", title: "Mi pedal", titleEdited: true, description: "Lo uso en casa, funciona perfecto." };
  const kept = applyAllAssist(typed, suggestion, "");
  assert.deepEqual(kept.kept, ["Categoría", "Marca", "Título", "Descripción", "Detalles"]);
  assert.equal(kept.values.brand, "Behringer");
  assert.equal(kept.values.category, "guitars");
  assert.equal(kept.values.model, "DS-1");
  assert.equal(kept.values.title, "Mi pedal");
  assert.equal(kept.values.description, "Lo uso en casa, funciona perfecto.");
  assert.deepEqual(assistRows(suggestion, typed, "").filter((row) => row.state === "different").map((row) => [row.field, row.current]),
    [["type", "Guitarras · Guitarras eléctricas"], ["brand", "Behringer"], ["title", "Mi pedal"], ["description", "Lo uso en casa, funciona perfecto."]]);
  const replaced = applyAssistField(typed, suggestion, "type", "");
  assert.deepEqual([replaced.category, replaced.instrumentType, replaced.attributes], ["pedals", "pedals", {}]);
  // A title the form wrote from brand and model is not the seller's: it follows the suggestion.
  const auto = { ...empty, brand: "Boss", model: "DS1", title: "Boss DS1" };
  assert.equal(assistRows(suggestion, auto, "").find((row) => row.field === "title").state, "empty");
  assert.equal(applyAssistField(auto, suggestion, "model", "").title, "Boss DS-1");
  // The details go below the seller's words and above the store's standard text.
  const footer = "Garantía de 3 meses. Envíos a todo el Perú.";
  const withFooter = applyAssistField({ ...typed, description: `Lo uso en casa.\n\n${footer}` }, suggestion, "details", footer);
  assert.equal(withFooter.description, `Lo uso en casa.\n\nDetalles:\n- Carcasa naranja\n- Tres perillas\n\n${footer}`);
  const storeEmpty = applyAllAssist({ ...empty, description: `\n\n${footer}` }, suggestion, footer);
  assert.ok(storeEmpty.values.description.startsWith("Pedal de distorsión") && storeEmpty.values.description.endsWith(footer));
  // Replacing the description keeps details added before.
  const again = applyAssistField(withFooter, suggestion, "description", footer);
  assert.equal(again.description, `Pedal de distorsión Boss DS-1 con su carcasa original.\n\nDetalles:\n- Carcasa naranja\n- Tres perillas\n\n${footer}`);
});

test("maybes AI: each call takes its own daily allowance first and the site's after; a counter that can't count refuses", async () => {
  const calls = [];
  let verdicts = [];
  const { allowAiCall } = loadModule("lib/ai/usage.ts", {
    "server-only": {},
    "@/lib/ai/config": config(),
    "@/lib/rate-limit": { checkKey: async (rule, subject) => { calls.push([rule.bucket, rule.limit, subject]); return verdicts.shift(); } },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => null },
  });
  await withEnv({ LARIA_AI_DAILY_CAP: undefined }, async () => {
    verdicts = ["allowed", "allowed"];
    assert.equal(await allowAiCall("store_question", "s-1"), "allowed");
    assert.deepEqual(calls.splice(0), [["ai.store_question", 50, "store_question:s-1"], ["ai.daily", 500, "site"]]);
    verdicts = ["limited"];
    assert.equal(await allowAiCall("listing_assist", "u-1"), "limited");
    assert.deepEqual(calls.splice(0), [["ai.listing_assist", 20, "listing_assist:u-1"]], "over its own limit, it never takes the site's");
    verdicts = ["allowed", "limited"];
    assert.equal(await allowAiCall("listing_assist", "u-1"), "site_limited");
    verdicts = ["unavailable"];
    assert.equal(await allowAiCall("listing_assist", "u-1"), "unavailable");
    verdicts = ["allowed", "unavailable"];
    assert.equal(await allowAiCall("listing_assist", "u-1"), "unavailable");
  });
  // checkKey counts under an HMAC of the subject, as the visitor limits do under one of the address.
  const { createHash, createHmac } = require("node:crypto");
  await withEnv({ SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests" }, async () => {
    const rpc = [];
    const { checkKey } = loadModule("lib/rate-limit.ts", {
      "server-only": {},
      "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => ({ rpc: async (name, args) => { rpc.push({ name, args }); return { data: true, error: null }; } }) },
    });
    assert.equal(await checkKey({ bucket: "ai.daily", limit: 500, windowSeconds: 86400 }, "site"), "allowed");
    const key = createHmac("sha256", createHash("sha256").update("laria-rate-limit:service-role-key-for-tests").digest()).update("site").digest("hex");
    assert.deepEqual(rpc, [{ name: "consume_rate_limit", args: { p_bucket: "ai.daily", p_key: key, p_limit: 500, p_window_seconds: 86400 } }]);
  });
});

test("maybes AI: the log gets one row per call through public.record_ai_request, and a failed write never fails the answer", async () => {
  const rpc = [];
  let reply = { data: null, error: null };
  const { recordAiRequest } = loadModule("lib/ai/usage.ts", {
    "server-only": {},
    "@/lib/ai/config": config(),
    "@/lib/rate-limit": { checkKey: async () => "allowed" },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => ({ rpc: async (name, args) => { rpc.push({ name, args }); return reply; } }) },
  });
  const record = { feature: "store_question", userId: "u-1", storeId: "s-1", model: "claude-opus-5-5", inputTokens: 1200, outputTokens: 300, outcome: "answered" };
  await recordAiRequest(record);
  assert.deepEqual(rpc, [{ name: "record_ai_request", args: {
    p_feature: "store_question", p_user_id: "u-1", p_store_id: "s-1", p_model: "claude-opus-5-5", p_input_tokens: 1200, p_output_tokens: 300, p_outcome: "answered",
  } }]);
  reply = { data: null, error: { code: "PGRST202", message: "not found" } };
  await quietly(async (warnings) => {
    await recordAiRequest(record);
    assert.deepEqual(warnings, [["ai-request-log-failed", "store_question", "PGRST202"]]);
  });
});

test("maybes AI: the pages show the helpers only with the server's flag, and the migration keeps its slot and lock step", () => {
  for (const file of ["app/mi-cuenta/publicar/page.tsx", "app/mi-cuenta/tienda/publicar/page.tsx"]) {
    assert.match(read(file), /aiAssist=\{aiHelpersEnabled\(\)\}/, file);
  }
  assert.match(read("app/mi-cuenta/tienda/inventario/page.tsx"), /ask=\{aiHelpersEnabled\(\)\}/);
  assert.match(read("app/mi-cuenta/tienda/inventario/page.tsx"), /\{ask \? <StoreAskBox \/> : null\}/);
  assert.match(read("app/mi-cuenta/tienda/page.tsx"), /store && inventoryEnabled && aiHelpersEnabled\(\) \? <StoreAskBox/);
  assert.match(read("components/sell-listing-form.tsx"), /\{aiAssist \? \(\n\s+<ListingAssist/);
  // The browser parts call only Laria's own routes; the key never leaves the server.
  for (const file of ["components/ai/store-ask-box.tsx", "components/ai/listing-assist.tsx", "components/ai/assist-photos.ts"]) {
    const source = read(file);
    assert.doesNotMatch(source, /anthropic|ANTHROPIC|lib\/ai\/(claude|config|usage)|supabase/i, file);
  }
  assert.match(read("components/ai/listing-assist.tsx"), /Solo al tocar el botón, hasta \{LISTING_ASSIST_MAX_PHOTOS\} fotos reducidas se envían a un servicio de IA/);
  const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => name.includes("maybes_ai"));
  assert.deepEqual(migrations, ["20261120120000_maybes_ai_helpers.sql"]);
  const migration = read(`supabase/migrations/${migrations[0]}`);
  assert.match(migration, /^-- UX-Effortless maybes/);
  assert.match(migration, /-- Compatibility: [^\n]+\n-- Locks: [\s\S]+-- Rollback: /);
  assert.match(migration, /\nset lock_timeout = '10s';\n[\s\S]+\nreset lock_timeout;\n$/);
  assert.match(migration, /grant execute on function public\.record_ai_request\(text, uuid, uuid, text, integer, integer, text\) to service_role;/);
  assert.doesNotMatch(migration, /grant [^;]+ to (anon|authenticated)/);
});
