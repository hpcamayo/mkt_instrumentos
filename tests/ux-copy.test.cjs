// UX-1 content language (docs/ux-redesign/ux-1-foundations.md, decision D8): Spanish orthography,
// question marks, tone, system jargon and the glossary, checked on every user-facing string.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOTS = ["app", "components", "components_v0", "lib"];
const SKIP_FILES = [/lib\/supabase\/database\.types\.ts$/, /\.d\.ts$/];
// Legal pages keep their approved wording and name the data processors (decisions.md, G2); only orthography applies there.
const LEGAL = /^app\/(terminos|privacidad|articulos-prohibidos|consejos-de-seguridad)\//;
// Proper names that look like Spanish words without a tilde.
const PROPER_NAMES = new Set(["Precision"]);
// "Listados" stays the name of the catalog page until the UX-2 navigation decision (docs/ux-redesign/decisions.md, G1).
const CATALOG_PAGE_NAME = "Listados";

const ORTHOGRAPHY = new RegExp(`\\b(${[
  "contrasena", "minimo", "maximo", "aqui", "alli", "despues", "tambien", "ademas", "todavia", "segun",
  "podras", "podra", "podran", "recibiras", "recibira", "tendras", "tendra", "estara", "estaras", "sera", "seran",
  "debera", "deberas", "necesitara", "revisara", "aparecera", "apareceran", "automaticamente", "unicamente", "esten",
  "numeros?", "telefonos?", "paginas?", "validos?", "codigos?", "ultimos?", "ultimas?", "rapid[oa]s?", "facil", "dificil",
  "electric[oa]s?", "acustic[oa]s?", "clasic[oa]s?", "tecnic[oa]s?", "musica", "musicos?", "microfonos?", "baterias?",
  "categorias?", "busquedas?", "region", "peru", "dias?", "garantias?", "envios?", "caracteristicas?", "politicas?",
  "terminos", "articulos?", "metodos?", "analisis", "estadisticas?", "guias?", "pequen[oa]s?",
].join("|")})\\b`, "i");
const SINGULAR_CION = /\b[a-zñ]+(cion|sion)\b/i;
const INTERROGATIVE = /¿\s*(que|como|donde|cuando|cual|cuales|cuanto|cuanta|cuantos|cuantas|quien|quienes)\b/i;
const JARGON = /\b(V1|legacy|Store Owner|metadata|Supabase|CTR|base de datos|dashboard)\b/i;
const GLOSSARY = /\b(listados?|anuncios?|[ií]tems?|vendedor particular|cuenta de vendedor|propietario de tienda|Publicar producto|Publicar inventario|Agregar inventario|Agregar producto|Enviar para revisi[oó]n|Preguntar por WhatsApp|Escribir por WhatsApp|Escribir a la tienda|Tienda Verificada|Tiendas Verificadas)\b/;

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : /\.(tsx?|mts)$/.test(entry.name) ? [file] : [];
  });
}

// Copy reads as words; class lists, routes, select lists and identifiers do not.
function isCopy(value) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(text)) return false;
  if (/^(\/|https?:|mailto:|tel:|#|\.\/|@\/)/.test(text)) return false;
  if (!/ [A-Za-zÁÉÍÓÚÑáéíóúñ¿¡]/.test(text) && !/^[A-ZÁÉÍÓÚÑ¿¡]/.test(text)) return false;
  const tokens = text.split(" ");
  if (tokens.every((token) => /^[!a-z0-9:_\-[\]/.%#&>()=,'*+~@]+$/.test(token)) && tokens.some((token) => /[-:[]/.test(token))) return false;
  // Supabase select lists ("id, title, store:stores(name)").
  if (/^[a-z0-9_*()!.:,\s-]+$/.test(text) && (text.match(/,/g) ?? []).length >= 2) return false;
  return true;
}

const NON_COPY_ATTRIBUTES = /^(className|href|src|id|htmlFor|name|type|key|rel|target|role|inputMode|autoComplete|pattern|accept|sizes|method|action|value|defaultValue|data-[\w-]+|aria-(controls|describedby|labelledby|current|live))$/;
const NON_COPY_CALLS = /^(console\.\w+|require|cn|clsx|twMerge|buttonClasses|noticeClassName|statusEntry|statusLabel)$/;

function collectCopy() {
  const strings = [];
  for (const root of ROOTS) {
    for (const file of files(root)) {
      if (SKIP_FILES.some((pattern) => pattern.test(file))) continue;
      const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node) => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
        if (ts.isCallExpression(node) && NON_COPY_CALLS.test(node.expression.getText(source))) return;
        // Supabase query builder arguments are column lists and filters, never copy.
        if (ts.isCallExpression(node) && /\.(select|from|eq|neq|in|is|or|order|rpc|ilike|filter|contains|match)$/.test(node.expression.getText(source))) return;
        // Internal errors are logged, not shown.
        if (ts.isNewExpression(node) && node.expression.getText(source) === "Error") return;
        if (ts.isJsxAttribute(node) && NON_COPY_ATTRIBUTES.test(node.name.getText(source))) return;
        let text = null;
        if (ts.isJsxText(node)) text = node.getText(source);
        else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
        else if (ts.isTemplateExpression(node)) text = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" … ");
        if (text !== null && isCopy(text)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          strings.push({ where: `${file}:${line + 1}`, file, text: text.replace(/\s+/g, " ").trim() });
          if (ts.isTemplateExpression(node)) return;
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return strings;
}

const COPY = collectCopy();

function failures(check) {
  return COPY.filter(check).map(({ where, text }) => `${where}  ${text.slice(0, 100)}`);
}

test("the copy scan reaches the user-facing surfaces", () => {
  assert.ok(COPY.length > 1500, `only ${COPY.length} strings found`);
  for (const expected of ["Contactar por WhatsApp", "Publicaciones de la tienda", "Compras y ventas", "¿Ya tienes cuenta?"]) {
    assert.ok(COPY.some(({ text }) => text.includes(expected)), expected);
  }
});

test("Spanish copy keeps its tildes and ñ", () => {
  const wrong = failures(({ text }) => {
    const word = ORTHOGRAPHY.exec(text) ?? SINGULAR_CION.exec(text);
    return Boolean(word) && !PROPER_NAMES.has(word[0]);
  });
  assert.deepEqual(wrong, []);
});

test("questions open with ¿, interrogatives carry the tilde, and the interface has no exclamations", () => {
  assert.deepEqual(failures(({ text }) => /[A-Za-zÁÉÍÓÚÑáéíóúñ0-9)]\?(\s|$|["”])/.test(text) && !text.includes("¿")), []);
  assert.deepEqual(failures(({ text }) => INTERROGATIVE.test(text)), []);
  assert.deepEqual(failures(({ text }) => /!/.test(text.replace(/!==?|!\w/g, ""))), []);
});

test("no system jargon reaches the interface", () => {
  assert.deepEqual(failures(({ file, text }) => !LEGAL.test(file) && JARGON.test(text)), []);
});

test("glossary terms replace their retired synonyms", () => {
  assert.deepEqual(failures(({ file, text }) => !LEGAL.test(file) && text !== CATALOG_PAGE_NAME && GLOSSARY.test(text)), []);
});

test("every WhatsApp contact button shares one label and the glyph", () => {
  let buttons = 0;
  for (const file of ["app/instrumentos/[slug]/page.tsx", "app/tiendas/[slug]/page.tsx"]) {
    for (const [, body] of fs.readFileSync(file, "utf8").matchAll(/<WhatsAppContactLink[\s\S]*?>([\s\S]*?)<\/WhatsAppContactLink>/g)) {
      buttons++;
      assert.match(body, /<WhatsAppGlyph \/>/, file);
      assert.equal(body.replace(/<WhatsAppGlyph \/>/, "").trim(), "Contactar por WhatsApp", file);
    }
  }
  assert.equal(buttons, 3);
});

test("buyers see no placeholder copy and the home badge shows the real condition (D11)", () => {
  const placeholders = /^(Foto|Banner|Logo) pendiente$|Bloque visual temporal|Vista previa visual|Comprar ahora|Destacados para ti|\b(Tienda|Backline|Audio) demo\b|placeholder/i;
  assert.deepEqual(failures(({ text }) => placeholders.test(text)), []);
  const featured = fs.readFileSync("components_v0/featured-listings.tsx", "utf8");
  assert.match(featured, /\{listing\.condition\}/);
  assert.doesNotMatch(featured, /"Nuevo"/);
  const store = fs.readFileSync("app/tiendas/[slug]/page.tsx", "utf8");
  assert.match(store, /storeInitials\(store\.name\)/);
});

test("status labels come from the one dictionary", () => {
  const { statusLabel } = require(path.resolve("lib/ui/status.ts"));
  assert.equal(statusLabel("listing", "approved"), "Publicada");
  assert.equal(statusLabel("listing", "pending"), "En revisión");
  assert.equal(statusLabel("revision", "pending"), "Cambios en revisión");
  assert.equal(statusLabel("store", "pending"), "En revisión");
  const { listingStatusLabel } = require(path.resolve("lib/account-ui.ts"));
  for (const status of ["draft", "pending", "approved", "rejected", "hidden", "sold", "archived"]) {
    assert.equal(listingStatusLabel(status), statusLabel("listing", status));
  }
  const admin = fs.readFileSync("components/admin-domain-view.tsx", "utf8");
  assert.match(admin, /publicaciones: dictionaryOptions\("listing"/);
  assert.match(admin, /revisiones: dictionaryOptions\("revision"/);
  assert.doesNotMatch(admin, /label: "Aprobada"/);
});
