// UX-6, accounts (docs/ux-redesign/ux-6-accounts.md): in-page confirmations replace window.confirm with the same
// questions (A3), the inventory table reads as cards on phones without changing its cells (A4), and store names are
// no longer uppercase eyebrows (A5).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
function files(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    return entry.isDirectory() ? files(relative) : /\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}

test("no window.confirm is left in the product; each former call asks the same question in a ConfirmDialog", () => {
  for (const file of [...files("app"), ...files("components")]) {
    if (file.endsWith("confirm-dialog.tsx")) continue;
    assert.doesNotMatch(source(file), /window\.confirm\(/, file);
  }
  const questions = {
    "components/transaction-detail.tsx": [
      /title: "¿Registrar esta venta como realizada fuera de Laria o con una persona sin cuenta\?"/,
      /title: "¿Cancelar esta solicitud de confirmación\?"/,
      /body: "La reseña será final: no podrás editarla ni eliminarla libremente\."/,
    ],
    "components/listing-management-table.tsx": [
      /title: "¿Ocultar esta publicación del marketplace\?"/,
      /title: "¿Marcar esta publicación como vendida\?"/,
      /title: "¿Crear una nueva publicación copiando esta publicación vendida\?"/,
    ],
    "components/saved-search-alerts.tsx": [/title: "¿Eliminar esta alerta\?", body: "No recibirás nuevas coincidencias\."/],
  };
  for (const [file, patterns] of Object.entries(questions)) {
    const text = source(file);
    assert.match(text, /useConfirm\(\)/, file);
    assert.match(text, /\{confirmDialog\}/, file);
    for (const pattern of patterns) assert.match(text, pattern, file);
  }
  // The review form is read before the confirmation: after an await the event target is gone.
  assert.match(source("components/transaction-detail.tsx"), /const form = new FormData\(event\.currentTarget\);\s*if \(!\(await confirm/);
});

test("the confirmation is a labelled modal alertdialog with Cancelar first in focus and a danger tone on request", () => {
  const { ConfirmDialog } = require(path.join(root, "components/ui/confirm-dialog.tsx"));
  const markup = renderToStaticMarkup(React.createElement(ConfirmDialog, {
    options: { title: "¿Eliminar esta alerta?", body: "No recibirás nuevas coincidencias.", confirmLabel: "Eliminar alerta", tone: "danger" },
    onClose() {},
  }));
  assert.match(markup, /<dialog role="alertdialog" aria-modal="true" aria-labelledby="([^"]+)" aria-describedby="([^"]+)" class="confirm-dialog"/);
  assert.match(markup, /<h2 id="[^"]+" class="t-section text-ink">¿Eliminar esta alerta\?<\/h2>/);
  assert.match(markup, />Cancelar<\/button>[\s\S]*>Eliminar alerta<\/button>/);
  assert.match(source("components/ui/confirm-dialog.tsx"), /cancelRef\.current\?\.focus\(\)/);
  assert.match(source("components/ui/confirm-dialog.tsx"), /requestAnimationFrame\(\(\) => opener\.focus\(\)\)/);
  assert.match(source("app/globals.css"), /\.confirm-dialog::backdrop/);
});

test("the inventory table keeps its eight cells and labels each one for the phone layout", () => {
  const Module = require("node:module");
  const load = Module._load;
  Module._load = function mockRouter(request, ...rest) {
    if (request === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }) };
    return load.call(this, request, ...rest);
  };
  let ListingManagementTable;
  try {
    ({ ListingManagementTable } = require(path.join(root, "components/listing-management-table.tsx")));
  } finally {
    Module._load = load;
  }
  const listing = { id: "one", title: "Historial", status: "approved", slug: "historial", price_pen: 100, created_at: "2026-09-01T12:00:00Z", published_at: "2026-09-02T12:00:00Z", sold_at: null, rejection_reason: null, hidden_source: null, hidden_reason: null, revisionStatus: null, revisionReason: null, analytics: { views: 5, contacts: 1, favorites: 0 } };
  const markup = renderToStaticMarkup(React.createElement(ListingManagementTable, { listings: [listing], emptyMessage: "Vacío" }));
  assert.equal((markup.match(/<td/g) ?? []).length, 8);
  for (const label of ["Estado", "Precio", "Primera publicación", "Vistas", "Contactos WhatsApp", "Favoritos actuales"]) {
    assert.match(markup, new RegExp(`data-label="${label}"`), label);
  }
  assert.match(markup, /<table class="block w-full[^"]*md:table/);
  assert.match(markup, /<thead class="sr-only[^"]*md:not-sr-only/);
  assert.match(markup, /<div class="md:overflow-x-auto">/, "phones never scroll sideways; only the table layout may");
});

test("store names are not uppercase eyebrows (D6)", () => {
  for (const file of ["app/mi-cuenta/tienda/inventario/page.tsx", "app/mi-cuenta/tienda/estadisticas/page.tsx"]) {
    assert.doesNotMatch(source(file), /eyebrow=\{store\.name\}/, file);
    assert.match(source(file), /eyebrow="Mi tienda"/, file);
  }
});
