// EASE stores trust-05: Libro de Reclamaciones virtual (app/libro-de-reclamaciones, lib/complaints-book.ts). The
// sheet follows the Indecopi format, provider data stay visibly marked until legal confirms them, the checks match the
// database, the filed copy prints alone and both footers link to the book. The database side is
// tests/ux-stores-complaints.sql. Runs with `pnpm test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const load = Module._load;
Module._load = function stubNext(request, ...rest) {
  if (request === "next/link") return { __esModule: true, default: ({ children, href, className }) => React.createElement("a", { href, className }, children) };
  return load.call(this, request, ...rest);
};

const read = (file) => fs.readFileSync(file, "utf8");
const book = require("@/lib/complaints-book");
const sheet = require("@/app/libro-de-reclamaciones/complaints-book-sheet.tsx");
const migration = read("supabase/migrations/20261106150000_ux_complaints_book.sql");

const valid = {
  consumerName: "María Quispe Torres", documentType: "dni", documentNumber: "45678912", address: "Av. Arequipa 1234, Lima",
  phone: "987654321", email: "Maria@Example.com ", isMinor: false, guardianName: "", itemType: "servicio", claimedAmount: "",
  itemDescription: "Servicio de publicación en Laria", listingSlug: "", complaintType: "reclamo",
  detail: "Mi publicación fue ocultada sin explicación.", request: "Que revisen la decisión.", declaration: true,
};

test("provider data are visibly marked stand-ins and never a made-up RUC", () => {
  const { businessName, ruc, address, pendingLegalData } = book.COMPLAINTS_BOOK_PROVIDER;
  assert.equal(pendingLegalData, true);
  for (const value of [businessName, ruc, address]) assert.match(value, /^\[.+por confirmar\]$/);
  assert.doesNotMatch(ruc, /\d/);
  const block = renderToStaticMarkup(React.createElement(sheet.ProviderBlock));
  assert.match(block, /Razón social[\s\S]*RUC[\s\S]*Domicilio/);
  assert.match(block, /\[RUC por confirmar\]/);
});

test("the answer term is one constant, 15 días hábiles, and the notes quote it", () => {
  assert.equal(book.COMPLAINTS_BOOK_ANSWER_DAYS, 15);
  assert.equal(book.COMPLAINTS_BOOK_ANSWER_TERM, "quince (15) días hábiles improrrogables");
  assert.match(sheet.COMPLAINTS_BOOK_NOTES[0], /plazo no mayor a quince \(15\) días hábiles improrrogables/);
  assert.match(sheet.COMPLAINTS_BOOK_NOTES[1], /no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI/);
});

test("reclamo and queja carry the regulation's definitions", () => {
  assert.equal(sheet.COMPLAINT_TYPE_DEFINITIONS.reclamo, "Disconformidad relacionada a los productos o servicios.");
  assert.equal(sheet.COMPLAINT_TYPE_DEFINITIONS.queja, "Disconformidad no relacionada a los productos o servicios; o malestar o descontento respecto a la atención al público.");
});

test("the form has the four Indecopi sections, an unticked declaration and the legal-review marker", () => {
  const form = read("app/libro-de-reclamaciones/complaints-book-form.tsx");
  const order = ["1. Identificación del consumidor reclamante", "2. Identificación del bien contratado", "3. Detalle de la reclamación y pedido del consumidor", "4. Información importante"];
  let last = -1;
  for (const title of order) {
    const at = form.indexOf(title);
    assert.ok(at > last, title);
    last = at;
  }
  for (const name of ["consumerName", "documentType", "documentNumber", "address", "phone", "email", "isMinor", "guardianName", "itemType", "claimedAmount", "itemDescription", "complaintType", "detail", "request", "declaration"]) {
    assert.match(form, new RegExp(`name="${name}"`), name);
  }
  assert.doesNotMatch(form, /name="declaration"[^>]*defaultChecked/);
  assert.match(form, /window\.print\(\)/);
  assert.match(form, /Imprimir o guardar como PDF/);
  assert.match(form, /Guarda o imprime esta hoja/);
  assert.doesNotMatch(form, /te enviamos una copia|enviamos una copia/i);
  for (const file of ["app/libro-de-reclamaciones/page.tsx", "app/libro-de-reclamaciones/complaints-book-form.tsx", "lib/complaints-book.ts", "supabase/migrations/20261106150000_ux_complaints_book.sql"]) {
    assert.match(read(file), /PENDIENTE DE REVISIÓN LEGAL ANTES DE PRODUCCIÓN/, file);
  }
});

test("the page never implies Laria sells, charges or ships", () => {
  const page = read("app/libro-de-reclamaciones/page.tsx");
  assert.match(page, /no vende los instrumentos publicados, no procesa pagos ni gestiona envíos/);
  assert.doesNotMatch(page + read("app/libro-de-reclamaciones/complaints-book-form.tsx"), /Laria (vende|cobra|garantiza|envía)/);
});

test("browser checks match the database rules", () => {
  assert.deepEqual(book.complaintsBookErrors(valid), {});
  const errors = book.complaintsBookErrors({ ...valid, consumerName: "", documentNumber: "1234", phone: "abc", email: "x", isMinor: true, itemType: "", claimedAmount: "-5", detail: "corto", request: "", complaintType: "", declaration: false });
  assert.deepEqual(Object.keys(errors).sort(), ["claimedAmount", "complaintType", "consumerName", "declaration", "detail", "documentNumber", "email", "guardianName", "itemType", "phone", "request"]);
  assert.match(errors.documentNumber, /8 dígitos/);
  assert.equal(book.complaintsBookErrors({ ...valid, documentType: "ruc", documentNumber: "20123456789" }).documentNumber, undefined);
  assert.equal(book.complaintsBookErrors({ ...valid, documentType: "ce", documentNumber: "ab 12345" }).documentNumber, undefined);
  assert.equal(book.complaintsBookErrors({ ...valid, detail: "a".repeat(3001) }).detail, "Usa como máximo 3000 caracteres.");
  assert.equal(book.parseClaimedAmount("1500,50"), 1500.5);
  assert.equal(book.parseClaimedAmount(""), null);
  assert.equal(book.parseClaimedAmount("1.2.3"), undefined);
  // Limits mirror the migration's checks.
  for (const [field, column] of [["consumerName", "consumer_name"], ["address", "address"], ["itemDescription", "item_description"], ["detail", "detail"], ["request", "request"], ["guardianName", "guardian_name"]]) {
    const [min, max] = book.COMPLAINTS_BOOK_LIMITS[field];
    assert.match(migration, new RegExp(`char_length\\(${column}\\) between ${min} and ${max}`), field);
  }
});

test("the RPC payload is normalized and the slug context is optional", () => {
  const entry = book.toComplaintsBookEntry({ ...valid, listingSlug: "guitarra-fender-1", claimedAmount: "250.5" });
  assert.equal(entry.email, "maria@example.com");
  assert.equal(entry.guardianName, null);
  assert.equal(entry.claimedAmount, 250.5);
  const args = book.complaintsBookRpcArgs(entry);
  assert.equal(args.p_listing_slug, "guitarra-fender-1");
  assert.equal(args.p_declaration_accepted, true);
  assert.equal(book.toComplaintsBookEntry({ ...valid, listingSlug: "<script>" }).listingSlug, null);
  assert.equal(book.listingContextDescription({ title: "Fender Stratocaster", slug: "fender-strat" }), "Publicación «Fender Stratocaster» en Laria (/instrumentos/fender-strat).");
  assert.equal(book.listingContextDescription(null), "");
  assert.match(book.complaintsBookErrorMessage("COMPLAINT_RATE_LIMITED"), /24 horas/);
});

test("the filed sheet shows its number, Lima date, the copy and prints alone", () => {
  const entry = book.toComplaintsBookEntry({ ...valid, isMinor: true, guardianName: "Rosa Torres", claimedAmount: "1500" });
  const html = renderToStaticMarkup(React.createElement(sheet.FiledSheet, { sheetNumber: "LR-2026-000123", filedAt: "2026-10-19T19:32:00Z", entry, actions: React.createElement("button", null, "Imprimir") }));
  assert.match(html, /Hoja de reclamación N\.° LR-2026-000123/);
  assert.match(html, /19 de octubre de 2026/);
  assert.match(html, /14:32/);
  assert.match(html, /Rosa Torres/);
  assert.match(html, /S\/ 1,500\.00|S\/ 1 500\.00|S\/ 1500\.00/);
  assert.match(html, /4\. Observaciones y acciones adoptadas por el proveedor/);
  assert.match(html, /@media print/);
  assert.match(html, /#hoja-libro, #hoja-libro \*/);
  assert.match(html, /data-print-hidden/);
});

test("both footers link to the Libro de Reclamaciones", () => {
  const { SiteFooter } = require("@/components/site-footer.tsx");
  const full = renderToStaticMarkup(React.createElement(SiteFooter, { variant: "full" }));
  // The "Ayuda y legal" column and the phone list.
  assert.equal((full.match(/href="\/libro-de-reclamaciones"[^>]*>Libro de Reclamaciones</g) ?? []).length, 2);
  const slim = renderToStaticMarkup(React.createElement(SiteFooter, { variant: "slim" }));
  assert.match(slim, /href="\/libro-de-reclamaciones"[^>]*>Libro de Reclamaciones</);
});

test("the table is closed to visitors and the RPCs are scoped", () => {
  assert.match(migration, /alter table public\.complaints_book_entries enable row level security;/);
  assert.match(migration, /revoke all on table public\.complaints_book_entries from public, anon, authenticated;/);
  assert.doesNotMatch(migration, /create policy/);
  assert.match(migration, /grant execute on function public\.submit_complaints_book_entry\([^)]*\) to anon, authenticated;/);
  assert.match(migration, /revoke all on function public\.get_admin_complaints_book_page\(text, integer, integer\) from public, anon;/);
  assert.match(migration, /perform laria_private\.assert_admin\(\);[\s\S]*perform laria_private\.assert_admin\(\);/);
  assert.match(migration, /'LR-' \|\| year_value \|\| '-' \|\| lpad\(next_sequence::text, 6, '0'\)/);
});
