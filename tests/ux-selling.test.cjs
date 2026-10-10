// UX-5, selling (docs/ux-redesign/ux-5-selling.md): the form's own checks and their order (S5), the confirmation
// copy (S6), the upload progress (S7), the sections and photo guidance (S1, S2), type chips and condition cards
// (S3, S4), per-photo names (S10), the Spanish attribute labels (S9), and the edit page's condition cards (S11).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

function load(file, mocks = {}, cache = new Map()) {
  const resolved = path.resolve(root, file);
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const compiled = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = new Module(resolved, module);
  mod.filename = resolved;
  mod.paths = module.paths;
  cache.set(resolved, mod);
  const original = mod.require.bind(mod);
  mod.require = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    const relative = name.startsWith("@/") ? name.slice(2) : name.startsWith(".") ? path.relative(root, path.resolve(path.dirname(resolved), name)) : null;
    if (relative !== null) {
      for (const ext of [".ts", ".tsx"]) {
        if (fs.existsSync(path.join(root, relative + ext))) return load(relative + ext, mocks, cache);
      }
    }
    return original(name);
  };
  mod._compile(compiled, resolved);
  return mod.exports;
}

const sellForm = load("lib/sell-form.ts");
const complete = {
  photoCount: 2, category: "guitars", instrumentType: "electric_guitar", brand: "Fender", model: "Player", title: "Fender Player",
  condition: "Nuevo", price: "1200", priceValue: 1200, city: "Lima", region: "Lima", regionValue: "Lima",
  description: "x".repeat(40), acceptedRules: true,
};

test("a complete draft passes; an empty one lists every error in page order", () => {
  assert.deepEqual(sellForm.validateSellDraft(complete), []);
  const empty = { photoCount: 0, category: "", instrumentType: "", brand: "", model: "", title: "", condition: "", price: "", priceValue: null, city: "", region: "", regionValue: null, description: "", acceptedRules: false };
  assert.deepEqual(sellForm.validateSellDraft(empty).map((error) => error.field), [
    "photos", "category", "brand", "model", "title", "condition", "price_pen", "city", "region", "description", "marketplace_rules",
  ]);
  assert.equal(sellForm.errorSummaryTitle(1), "Revisa 1 dato antes de publicar");
  assert.equal(sellForm.errorSummaryTitle(3), "Revisa 3 datos antes de publicar");
});

test("the checks keep today's rules: photos 2–10, whole soles, a listed region, 40 characters", () => {
  const fields = (draft) => sellForm.validateSellDraft({ ...complete, ...draft }).map((error) => `${error.field}: ${error.message}`);
  assert.deepEqual(fields({ photoCount: 1 }), ["photos: Agrega al menos 2 fotos."]);
  assert.deepEqual(fields({ photoCount: 11 }), ["photos: Puedes subir hasta 10 fotos."]);
  assert.deepEqual(fields({ price: "12.5", priceValue: null }), ["price_pen: Escribe el precio en soles enteros, solo con números."]);
  assert.deepEqual(fields({ region: "Narnia", regionValue: null }), ["region: Elige una región de la lista."]);
  assert.deepEqual(fields({ description: "Corta" }), ["description: Escribe al menos 40 caracteres; llevas 5."]);
  assert.deepEqual(fields({ instrumentType: "" }), ["instrument_type: Elige el tipo de instrumento."]);
});

test("the confirmation states the review email only when the listing goes to review", () => {
  const review = sellForm.sellConfirmation(false);
  assert.match(review.message, /Un administrador la revisará/);
  assert.match(review.next, /Te avisaremos por correo cuando se apruebe o si no puede publicarse/);
  assert.doesNotMatch(review.next, /hora|minuto|pronto|rápid/i, "the email copy never promises speed");
  const direct = sellForm.sellConfirmation(true);
  assert.equal(direct.message, "Tu publicación ya está en el catálogo.");
  assert.doesNotMatch(direct.next, /correo/);
});

test("condition cards keep the stored values and add a definition to each", () => {
  const { conditionOptions } = load("lib/listings.ts");
  const choices = sellForm.conditionChoices(conditionOptions);
  assert.deepEqual(choices.map((choice) => choice.value), ["Nuevo", "Usado - buen estado", "Usado - con detalles"]);
  assert.deepEqual(choices.map((choice) => choice.label), ["Nuevo", "Usado · buen estado", "Usado · con detalles"]);
  for (const choice of choices) assert.ok(choice.description.length > 10, choice.value);
});

test("the submission reports each photo upload and the final step, and still works without a callback", async () => {
  const { createPublicSubmission } = load("lib/public-submission.ts");
  const uploads = [];
  const client = { storage: { from: () => ({ upload: async (pathName) => { uploads.push(pathName); return { error: null }; } }) } };
  const requests = [];
  const previousFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body.action);
    return { ok: true, json: async () => (body.action === "start" ? { id: "a1", token: "t1", folder: "pending/a1" } : { ok: true }) };
  };
  try {
    const steps = [];
    const file = (name) => ({ name, size: 10, lastModified: 1, type: "image/jpeg" });
    await createPublicSubmission(client)("listing", { title: "x" }, [file("a"), file("b")], (step) => steps.push(step));
    assert.deepEqual(steps, [{ step: "upload", index: 0, total: 2 }, { step: "upload", index: 1, total: 2 }, { step: "complete" }]);
    assert.deepEqual(requests, ["start", "complete"]);
    await createPublicSubmission(client)("listing", { title: "y" }, [file("c"), file("d")]);
    assert.equal(uploads.length, 4);
  } finally {
    global.fetch = previousFetch;
  }
});

const formMocks = {
  "next/image": { __esModule: true, default: (props) => React.createElement("img", { src: props.src, alt: props.alt }) },
  "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
  "@/lib/supabase/browser-client": { getSupabaseBrowserClient: () => ({ storage: { from: () => ({}) } }) },
};

test("the sell form: seven sections with photos first, guidance, no native validation, the rules links in order", () => {
  const { SellListingForm } = load("components/sell-listing-form.tsx", formMocks);
  const markup = renderToStaticMarkup(React.createElement(SellListingForm, { profile: { fullName: "Ana Ríos", phone: "51999", city: "Lima", region: "Lima" } }));
  assert.match(markup, /<form[^>]*novalidate/i);
  const headings = [...markup.matchAll(/<h2 id="[^"]+" class="[^"]*">(?:<span[^>]*>\d<\/span>)?([^<]+)<\/h2>/g)].map((match) => match[1]);
  assert.deepEqual(headings, ["Fotos", "El instrumento", "Condición y precio", "Ubicación", "Descripción", "Publicar"], "attributes appear only once a type is chosen");
  for (const tip of sellForm.PHOTO_GUIDANCE) assert.ok(markup.includes(tip), tip);
  assert.match(markup, /id="venta-fotos"/);
  assert.match(markup, /href="\/terminos"[\s\S]*href="\/articulos-prohibidos"/);
  assert.match(markup, /inputMode="numeric"|inputmode="numeric"/);
  // Condition as three radio cards; the first radio carries the group's id for the summary link.
  assert.equal((markup.match(/type="radio"[^>]*name="condition"/g) ?? []).length, 3);
  assert.match(markup, /id="venta-condition"/);
  assert.match(markup, /Un administrador la revisará antes de mostrarla\. Te avisaremos por correo\./);
  assert.match(markup, />Publicar<\/button>|>Publicar<\/span>/);
  // Location fields share the form's id prefix so the summary can link to them.
  assert.match(markup, /id="venta-city"/);
  assert.match(markup, /id="venta-region"/);
});

test("per-photo controls on create carry the same names as on edit", () => {
  const sell = source("components/sell-listing-form.tsx");
  const edit = source("components/listing-edit-form.tsx");
  for (const name of ["aria-label={`Mover foto ${index + 1} antes`}", "aria-label={`Mover foto ${index + 1} después`}", "aria-label={`Reemplazar foto ${index + 1}`}", "aria-label={`Quitar foto ${index + 1}`}", "alt={`Foto ${index + 1}`}"]) {
    assert.ok(sell.includes(name), `create: ${name}`);
    assert.ok(edit.includes(name), `edit: ${name}`);
  }
  assert.doesNotMatch(sell, /form\.reset\(\)/, "S6: a confirmation replaces the form instead of resetting it");
  assert.match(sell, /Publicar otro instrumento/);
  assert.match(sell, /reportProgress/);
});

test("type chips and condition cards are native radio groups with the error wired to them", () => {
  const { TypeChips, ConditionCards } = load("components/selling/choice-fields.tsx");
  const chips = renderToStaticMarkup(React.createElement(TypeChips, {
    id: "t", name: "instrument_type", legend: "Tipo de instrumento", value: "bass",
    options: [{ value: "electric_guitar", label: "Guitarras eléctricas" }, { value: "bass", label: "Bajos" }],
    onChange() {}, error: "Elige el tipo de instrumento.",
  }));
  assert.match(chips, /<fieldset[\s\S]*<legend[^>]*>Tipo de instrumento<\/legend>/);
  assert.equal((chips.match(/type="radio"/g) ?? []).length, 2);
  assert.match(chips, /id="t"/);
  assert.match(chips, /aria-describedby="t-error"/);
  assert.match(chips, /aria-invalid="true"/);
  assert.match(chips, /checked="" value="bass"/);
  const cards = renderToStaticMarkup(React.createElement(ConditionCards, {
    id: "c", name: "condition", legend: "Condición", defaultValue: "Nuevo",
    options: [{ value: "Nuevo", label: "Nuevo", description: "Sin uso." }],
  }));
  assert.match(cards, /checked="" value="Nuevo"/);
  assert.match(cards, /Sin uso\./);
  assert.doesNotMatch(cards, /aria-invalid/);
});

test("the error summary lists linked errors and renders nothing without errors", () => {
  const { ErrorSummary } = load("components/ui/error-summary.tsx");
  assert.equal(renderToStaticMarkup(React.createElement(ErrorSummary, { title: "Revisa", errors: [], attempt: 0 })), "");
  const markup = renderToStaticMarkup(React.createElement(ErrorSummary, { title: "Revisa 2 datos antes de publicar", attempt: 1, errors: [{ id: "venta-brand", message: "Escribe la marca." }, { id: "venta-model", message: "Escribe el modelo." }] }));
  assert.match(markup, /role="alert"/);
  assert.match(markup, /tabindex="-1"|tabIndex="-1"/i);
  assert.match(markup, /<h2 id="resumen-errores"[^>]*>Revisa 2 datos antes de publicar<\/h2>/);
  assert.match(markup, /<a href="#venta-brand">Escribe la marca\.<\/a>[\s\S]*<a href="#venta-model">Escribe el modelo\.<\/a>/);
});

test("attribute labels read in Spanish where musicians say it in Spanish; values are unchanged (S9)", () => {
  const { instrumentFilterGroups } = load("lib/instrument-filters.ts");
  const options = instrumentFilterGroups.flatMap((group) => group.filters.flatMap((filter) => filter.options ?? []));
  const label = (value) => options.find((option) => option.value === value)?.label;
  assert.equal(label("solid_body"), "Cuerpo sólido");
  assert.equal(label("distortion"), "Distorsión");
  assert.equal(label("compressor"), "Compresor");
  assert.equal(label("tuner"), "Afinador");
  assert.equal(label("cabinet"), "Gabinete");
  assert.equal(label("shotgun"), "Cañón");
  // Established gear names stay.
  assert.equal(label("single_coil"), "Single coil");
  assert.equal(label("overdrive"), "Overdrive");
  for (const english of ["Solid body", "Semi-hollow", "Hollow body", "Distortion", "Compressor", "Tuner", "Multi-FX", "Cabinet", "Ribbon", "Lavalier", "Shotgun"]) {
    assert.ok(!options.some((option) => option.label === english), english);
  }
});

test("the edit page shows the condition cards and keeps its save flow", () => {
  const edit = source("components/listing-edit-form.tsx");
  assert.match(edit, /<ConditionCards id="editar-condition" name="condition"[^>]*defaultValue=\{listing\.condition \?\? ""\}/);
  assert.match(edit, /changedValues\(values, listing, \["title", "category", "instrument_type", "brand", "model", "condition"\]\)/);
  assert.match(edit, /Guardar cambios/);
});
