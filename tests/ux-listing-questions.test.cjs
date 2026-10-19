// Effortless Laria, batch "listing", big-11 (docs/ux-effortless/listing.md): public questions on a listing.
// The helpers (the contact-detail check that mirrors the SQL, the RPC parser, the error mapping), the e-mail and
// notification wiring, and the "Preguntas" section rendered signed out, empty, sold, for the seller and for an admin.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const questions = require("@/lib/listing-questions.ts");
const { renderMarketplaceEmail } = require("@/lib/email/templates.ts");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

// Loads a module with some of its imports replaced (as tests/ux-listing.test.cjs does); everything else resolves
// through tests/setup-alias.cjs.
function load(file, mocks) {
  const resolved = path.join(root, file);
  const mod = new Module(resolved, module);
  mod.filename = resolved;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : original(name));
  const ts = require("typescript");
  const compiled = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  mod._compile(compiled, resolved);
  return mod.exports;
}

const without = (props, ...keys) => Object.fromEntries(Object.entries(props).filter(([key]) => !keys.includes(key)));
function component(account) {
  return load("components/listing/listing-questions.tsx", {
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", without(props, "prefetch"), children) },
    "@/components/marketplace-account-provider": { useMarketplaceAccount: () => account },
    "@/components/content-report": { ContentReport: ({ targetType, label }) => React.createElement("button", { "data-report": targetType }, label) },
  });
}
const SIGNED_OUT = { ready: true, authenticated: false, admin: false };
const SIGNED_IN = { ready: true, authenticated: true, admin: false };
const LISTING = "e7110000-0000-4000-8000-000000000001";
const Q1 = "e8110000-0000-4000-8000-000000000001";
const Q2 = "e8110000-0000-4000-8000-000000000002";

const rpcState = (overrides = {}) => ({
  signed_in: false, can_ask: false, can_answer: false, is_admin: false, accepting: true,
  questions: [
    { id: Q2, body: "¿Tiene golpes?", asker_name: "Lucía", created_at: "2026-10-18T15:00:00Z", answer: null, answered_at: null, status: "visible", hidden_reason: null, is_mine: false },
    { id: Q1, body: "¿Incluye estuche?", asker_name: "Rodrigo C.", created_at: "2026-09-02T15:00:00Z", answer: "Sí, estuche rígido.", answered_at: "2026-09-03T15:00:00Z", status: "visible", hidden_reason: null, is_mine: false },
  ],
  ...overrides,
});

test("the contact-detail check mirrors the PAY-1 filter", () => {
  for (const blocked of [
    "Llámame al 987654321", "¿Me escribes al 987 654 321?", "987.654-321", "Cuenta 1234-5678-9012",
    "Mira https://ejemplo.org", "www.ejemplo.com", "ejemplo.pe/oferta", "en ejemplo.com ahora", "ana@correo.com",
  ]) assert.equal(questions.hasContactDetails(blocked), true, blocked);
  for (const allowed of ["¿Tiene 2 pastillas y 22 trastes?", "¿Es de 2019?", "Precio S/ 1,200", "¿Sigue disponible?", "Jazz bass 4.5 kg"]) {
    assert.equal(questions.hasContactDetails(allowed), false, allowed);
  }
});

test("instant validation: length after folding whitespace, then contact details", () => {
  assert.equal(questions.normalizeQuestionText("  ¿Tiene   estuche?\n "), "¿Tiene estuche?");
  assert.match(questions.questionTextError(" Hola ", "question"), /entre 5 y 300/);
  assert.match(questions.questionTextError("a".repeat(301), "question"), /entre 5 y 300/);
  assert.equal(questions.questionTextError("¿Tiene estuche?", "question"), null);
  assert.equal(questions.questionTextError("Escríbeme al 999 888 777", "question"), questions.CONTACT_DETAILS_MESSAGE);
  assert.match(questions.questionTextError("x", "answer"), /entre 2 y 600/);
  assert.equal(questions.questionTextError("Sí", "answer"), null);
  assert.match(questions.questionTextError("a".repeat(601), "answer"), /entre 2 y 600/);
  assert.match(questions.moderationReasonError("  "), /motivo/);
  assert.equal(questions.moderationReasonError("Spam repetido"), null);
});

test("get_listing_questions output parses into the section's state", () => {
  const state = questions.parseListingQuestions(rpcState({ can_ask: true, signed_in: true }));
  assert.equal(state.canAsk, true);
  assert.equal(state.canAnswer, false);
  assert.equal(state.questions.length, 2);
  assert.deepEqual(state.questions[1], {
    id: Q1, body: "¿Incluye estuche?", askerName: "Rodrigo C.", createdAt: "2026-09-02T15:00:00Z",
    answer: "Sí, estuche rígido.", answeredAt: "2026-09-03T15:00:00Z", hidden: false, hiddenReason: null, isMine: false,
  });
  // Broken rows are left out; a broken payload is the empty, closed state.
  assert.equal(questions.parseListingQuestions({ questions: [{ id: "x" }, null] }).questions.length, 0);
  assert.deepEqual(questions.parseListingQuestions(null), questions.EMPTY_QUESTIONS_STATE);
});

test("database errors map to their Spanish message, a status and a code", () => {
  const raw = "QUESTION_PENDING_LIMIT: Ya tienes 3 preguntas sin responder en esta publicación. Espera una respuesta antes de hacer otra.";
  assert.equal(questions.questionErrorMessage(raw, "ask"), "Ya tienes 3 preguntas sin responder en esta publicación. Espera una respuesta antes de hacer otra.");
  assert.equal(questions.questionErrorCode(raw), "QUESTION_PENDING_LIMIT");
  assert.equal(questions.questionErrorStatus("QUESTION_PENDING_LIMIT"), 429);
  assert.equal(questions.questionErrorStatus("QUESTION_DAILY_LIMIT"), 429);
  assert.equal(questions.questionErrorStatus("QUESTION_OWN_LISTING"), 403);
  assert.equal(questions.questionErrorStatus("QUESTION_ALREADY_ANSWERED"), 409);
  assert.equal(questions.questionErrorStatus("QUESTION_CONTACT_DETAILS"), 400);
  assert.equal(questions.questionErrorStatus(null), 503);
  // Anything else never reaches the page.
  assert.equal(questions.questionErrorMessage('permission denied for function ask_listing_question', "ask"), "No pudimos publicar tu pregunta. Intenta nuevamente.");
  assert.equal(questions.questionErrorMessage(undefined, "hide"), "No pudimos ocultar la pregunta. Intenta nuevamente.");
  // The SQL and the client share one message for contact details.
  assert.match(source("supabase/migrations/20261102130000_ux_listing_questions.sql"), new RegExp(questions.CONTACT_DETAILS_MESSAGE.replace(/[.;:]/g, "\\$&")));
});

test("the seller's e-mail opens the listing's questions", () => {
  const { subject, html } = renderMarketplaceEmail({
    delivery_id: "d", event_type: "listing_question_asked", attempt_count: 1, recipient_email: "a@example.invalid", recipient_name: null,
    context: {}, listing: { title: "Boss DS-1", slug: "boss-ds-1", price_pen: 200 }, store: null, transaction: null, search_alert: null,
  }, "https://laria.pe");
  assert.equal(subject, "Te hicieron una pregunta en Laria");
  assert.match(html, />Responder</);
  assert.match(html, /https:\/\/laria\.pe\/instrumentos\/boss-ds-1#preguntas/);
});

test("both question notifications have a label and open the listing's questions", () => {
  const list = source("lib/notifications.ts");
  assert.match(list, /listing_question_asked: "Te hicieron una pregunta"/);
  assert.match(list, /listing_question_answered: "Respondieron tu pregunta"/);
  assert.match(list, /`\/instrumentos\/\$\{notification\.listing_id\}#preguntas`/);
  assert.match(source("components/content-report.tsx"), /"question"/);
});

test("the section renders the same loading state before the account check (no hydration mismatch)", () => {
  const { ListingQuestions } = component({ ready: false, authenticated: false, admin: false });
  const html = renderToStaticMarkup(React.createElement(ListingQuestions, { listingId: LISTING, sold: false, loginHref: "/login" }));
  assert.match(html, /<section id="preguntas"/);
  assert.match(html, /<h2[^>]*>Preguntas<\/h2>/);
  assert.match(html, /Cargando preguntas…/);
  assert.doesNotMatch(html, /Ingresa para preguntar|textarea/);
});

test("signed out and empty: the empty state and a quiet sign-in link", () => {
  const { ListingQuestions, QUESTIONS_COPY } = component(SIGNED_OUT);
  const initialState = questions.parseListingQuestions(rpcState({ questions: [] }));
  const html = renderToStaticMarkup(React.createElement(ListingQuestions, { listingId: LISTING, sold: false, loginHref: "/login?next=%2Finstrumentos%2Fboss#preguntas", initialState }));
  assert.match(html, new RegExp(QUESTIONS_COPY.empty));
  assert.equal(QUESTIONS_COPY.empty, "Aún no hay preguntas. Pregunta lo que necesites saber; la respuesta queda para todos.");
  assert.match(html, /<a href="\/login\?next=%2Finstrumentos%2Fboss#preguntas" class="link font-semibold">Ingresa para preguntar<\/a>/);
  assert.doesNotMatch(html, /textarea|data-report/);
});

test("signed in: the question form with its public note, the Q&A and the report links", () => {
  const { ListingQuestions, QUESTIONS_COPY } = component(SIGNED_IN);
  const initialState = questions.parseListingQuestions(rpcState({ signed_in: true, can_ask: true }));
  const html = renderToStaticMarkup(React.createElement(ListingQuestions, { listingId: LISTING, sold: false, loginHref: "/login", initialState }));
  assert.match(html, /Haz una pregunta/);
  assert.match(html, /<textarea[^>]*maxLength="300"/);
  assert.ok(html.includes(QUESTIONS_COPY.publicNote));
  assert.match(html, /Enviar pregunta/);
  assert.match(html, /Pregunta de Rodrigo C\./);
  assert.match(html, /Respuesta de quien vende/);
  assert.match(html, /Sí, estuche rígido\./);
  assert.match(html, /Sin respuesta todavía/);
  assert.equal((html.match(/data-report="question"/g) ?? []).length, 2);
  assert.match(html, /2 preguntas/);
  assert.doesNotMatch(html, /Responder<|Ocultar/);
});

test("the seller gets an answer button under each unanswered question, never the ask form", () => {
  const { ListingQuestions } = component(SIGNED_IN);
  const initialState = questions.parseListingQuestions(rpcState({ signed_in: true, can_answer: true }));
  const html = renderToStaticMarkup(React.createElement(ListingQuestions, { listingId: LISTING, sold: false, loginHref: "/login", initialState }));
  assert.equal((html.match(/>Responder</g) ?? []).length, 1);
  assert.doesNotMatch(html, /Haz una pregunta/);
});

test("an admin sees hidden questions marked, with Mostrar / Ocultar", () => {
  const { ListingQuestions } = component({ ...SIGNED_IN, admin: true });
  const state = rpcState({ signed_in: true, can_ask: true, is_admin: true });
  state.questions[0] = { ...state.questions[0], status: "hidden", hidden_reason: "Spam repetido" };
  const html = renderToStaticMarkup(React.createElement(ListingQuestions, { listingId: LISTING, sold: false, loginHref: "/login", initialState: questions.parseListingQuestions(state) }));
  assert.match(html, /Oculta/);
  assert.match(html, /Motivo: Spam repetido/);
  assert.match(html, />Mostrar</);
  assert.match(html, />Ocultar</);
  // A hidden question is not reportable; the visible one is.
  assert.equal((html.match(/data-report="question"/g) ?? []).length, 1);
});

test("a sold listing keeps its Q&A read-only, and is left out with none", () => {
  const { ListingQuestions, QUESTIONS_COPY } = component(SIGNED_IN);
  const closed = rpcState({ signed_in: true, accepting: false });
  const html = renderToStaticMarkup(React.createElement(ListingQuestions, { listingId: LISTING, sold: true, loginHref: "/login", initialState: questions.parseListingQuestions(closed) }));
  assert.ok(html.includes(QUESTIONS_COPY.sold));
  assert.match(html, /¿Incluye estuche\?/);
  assert.doesNotMatch(html, /textarea|Responder<|Ingresa para preguntar/);
  const none = renderToStaticMarkup(React.createElement(ListingQuestions, { listingId: LISTING, sold: true, loginHref: "/login", initialState: questions.parseListingQuestions(rpcState({ accepting: false, questions: [] })) }));
  assert.equal(none, "");
});

test("the API route checks the origin, validates before the database and maps its errors", () => {
  const route = source("app/api/listing-questions/route.ts");
  assert.match(route, /sameOriginEventRequest\(request\)/);
  assert.match(route, /questionTextError\(text, "question"\)/);
  assert.match(route, /questionTextError\(text, "answer"\)/);
  assert.match(route, /questionErrorMessage\(error\.message, action\)/);
  for (const rpc of ["get_listing_questions", "ask_listing_question", "answer_listing_question", "hide_listing_question", "restore_listing_question"]) {
    assert.match(route, new RegExp(`"${rpc}"`), rpc);
  }
});

test("the route hands the browser the raw RPC state, which the section parses once", () => {
  const route = fs.readFileSync(path.join(__dirname, "../app/api/listing-questions/route.ts"), "utf8");
  assert.doesNotMatch(route, /parseListingQuestions\(/);
  assert.match(fs.readFileSync(path.join(__dirname, "../components/listing/listing-questions.tsx"), "utf8"), /setState\(parseListingQuestions\(await response\.json\(\)\)\)/);
});
