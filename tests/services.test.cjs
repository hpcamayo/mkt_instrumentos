// Feature ideas, services batch, bet-02 (docs/feature-ideas/services.md): "Servicios para músicos". The helpers the
// pages share, the vocabulary kept in step with the migration, the wiring into navigation, notices, e-mails, reports,
// the sitemap and the legal pages, and Henri's rule that services never mix with instruments.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const services = require(path.join(root, "lib/services.ts"));
const MIGRATION = "supabase/migrations/20261208120000_feat_services.sql";

function walk(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(relative) : /\.(ts|tsx)$/.test(entry.name) ? [relative] : [];
  });
}

const SERVICE_FILES = [
  "lib/services.ts",
  "lib/services-db.ts",
  "lib/services-metadata.ts",
  ...walk("components/services"),
  ...walk("app/servicios"),
  ...walk("app/mi-cuenta/servicios"),
  ...walk("app/admin/servicios"),
  ...walk("app/api/services"),
];

function formValues(overrides = {}) {
  return {
    category: "clases",
    title: "Clases de guitarra para principiantes",
    providerName: "Ana Torres",
    description: "Clases personalizadas de guitarra acústica y eléctrica, con repertorio a tu elección y teoría desde cero.",
    price: "60",
    unit: "clase",
    modalities: ["a_domicilio"],
    skills: ["guitarra"],
    city: "Lima",
    region: "Lima",
    district: "Miraflores",
    areas: ["Miraflores", "Barranco"],
    whatsapp: "51987654321",
    photoPaths: [],
    ...overrides,
  };
}

test("the vocabulary matches the migration", () => {
  const sql = source(MIGRATION);
  for (const category of services.SERVICE_CATEGORIES) {
    assert.match(sql, new RegExp(`'${category}'`), category);
    assert.match(sql, new RegExp(`'${services.SERVICE_CATEGORY_INFO[category].slug}'`), `${category} slug`);
    for (const unit of services.SERVICE_CATEGORY_INFO[category].units) assert.match(sql, new RegExp(`'${unit}'`), unit);
    for (const skill of services.SERVICE_CATEGORY_INFO[category].skills) assert.match(sql, new RegExp(`'${skill}'`), skill);
  }
  for (const unit of services.SERVICE_UNITS) assert.ok(services.SERVICE_UNIT_LABELS[unit], unit);
  // Every skill shown has a label, and slugs are unique.
  for (const category of services.SERVICE_CATEGORIES) {
    for (const skill of services.SERVICE_CATEGORY_INFO[category].skills) assert.notEqual(services.serviceSkillLabel(skill), skill, skill);
  }
  const slugs = services.SERVICE_CATEGORIES.map((category) => services.SERVICE_CATEGORY_INFO[category].slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(services.serviceCategoryFromSlug("salas-de-ensayo"), "ensayo");
  assert.equal(services.serviceCategoryFromSlug("guitarras"), null);
});

test("directory filters drop unknown values and round-trip through the URL", () => {
  const plain = services.parseServiceFilters({ ciudad: "x", modalidad: "teletransporte", instrumento: "guitarra", orden: "baratos" });
  assert.deepEqual(plain, { sort: "recientes" });
  assert.equal(services.hasServiceRefinements(plain), false);
  // A skill only applies inside its kind, and a place only where that kind is given.
  const lessons = services.parseServiceFilters({ ciudad: "  San  Isidro ", modalidad: "en_linea", instrumento: "guitarra", orden: "precio" }, "clases");
  assert.deepEqual(lessons, { category: "clases", city: "San Isidro", modality: "en_linea", skill: "guitarra", sort: "precio" });
  assert.equal(services.parseServiceFilters({ modalidad: "a_domicilio" }, "ensayo").modality, undefined);
  assert.equal(services.parseServiceFilters({ instrumento: "bateria" }, "grabacion").skill, undefined);
  const href = services.serviceDirectoryHref(lessons, 2);
  assert.equal(href, "/servicios/clases?ciudad=San+Isidro&modalidad=en_linea&instrumento=guitarra&orden=precio&page=2");
  const query = Object.fromEntries(new URL(href, "https://laria.test").searchParams);
  assert.deepEqual(services.parseServiceFilters(query, "clases"), lessons);
  assert.equal(services.serviceDirectoryHref({ sort: "recientes" }), "/servicios");
  assert.deepEqual(services.serviceRpcFilters(plain), { category: null, city: null, modality: null, skill: null, sort: "recientes" });
});

test("prices, areas and text are read the way the database keeps them", () => {
  assert.equal(services.readServicePrice("S/ 1,250"), 1250);
  assert.equal(services.readServicePrice("0"), null);
  assert.equal(services.readServicePrice("12.50"), null);
  assert.equal(services.readServicePrice("100001"), null);
  assert.deepEqual(services.readServiceAreas("Miraflores, miraflores\nSurquillo; SURQUILLO, Jesús María, Jesus Maria"), ["Miraflores", "Surquillo", "Jesús María"]);
  assert.equal(services.foldParagraphs("  Hola   mundo \n\n\n\nOtra   línea  "), "Hola mundo\n\nOtra línea");
  assert.match(services.formatServicePrice(1250, "hora"), /^Desde S\/ 1.?250 por hora$/);
  assert.equal(services.formatServicePrice(80, "sesion"), "Desde S/ 80 por sesión");
});

test("the form's checks mirror the database and refuse contact details", () => {
  assert.deepEqual(services.serviceFormErrors(formValues(), { isStore: false }), []);
  const fields = (overrides, isStore = false) => services.serviceFormErrors(formValues(overrides), { isStore }).map((item) => item.field);
  assert.deepEqual(fields({ title: "Clases" }), ["title"]);
  assert.deepEqual(fields({ description: "Escríbeme al 987 654 321 para coordinar tus clases de guitarra y horarios." }), ["description"]);
  assert.deepEqual(fields({ providerName: "" }, true), []);
  assert.deepEqual(fields({ providerName: "" }), ["providerName"]);
  assert.deepEqual(fields({ price: "gratis", unit: "cancion", modalities: ["en_local", "nave"], skills: [] }), ["price", "unit", "modalities", "skills"]);
  assert.deepEqual(fields({ whatsapp: "123", city: " " }), ["city", "whatsapp"]);
  assert.deepEqual(fields({ areas: Array.from({ length: 13 }, (_, index) => `Zona ${index + 1}`) }), ["areas"]);
  // Rehearsal rooms have no skills to pick; whatever the form held is not sent.
  const room = formValues({ category: "ensayo", unit: "hora", modalities: ["en_local"], skills: ["guitarra"] });
  assert.deepEqual(services.serviceFormErrors(room, { isStore: true }), []);
  const payload = services.serviceSavePayload(room, { isStore: true });
  assert.deepEqual(payload.skills, []);
  assert.equal("provider_name" in payload, false);
  assert.equal(services.serviceSavePayload(formValues({ district: "  " }), { isStore: false }).district, null);
});

test("database errors show their own message; anything else shows the fallback", () => {
  const raw = "SERVICE_PRICE_INVALID: Indica un precio desde, en soles.";
  assert.equal(services.serviceErrorMessage(raw, "x"), "Indica un precio desde, en soles.");
  assert.equal(services.serviceErrorCode(raw), "SERVICE_PRICE_INVALID");
  assert.equal(services.serviceErrorField("SERVICE_PRICE_INVALID"), "price");
  assert.equal(services.serviceErrorMessage('permission denied for table services', "Intenta nuevamente."), "Intenta nuevamente.");
  assert.equal(services.serviceErrorField(null), null);
});

test("booking actions follow who asked and the 30-day review window", () => {
  const base = { id: "b", status: "pending", role: "provider", requestedBy: "client", review: null, clientHasReview: false, reviewDeadline: null };
  assert.deepEqual(services.bookingActions(base), { canAnswer: true, canCancel: false, canReview: false });
  assert.deepEqual(services.bookingActions({ ...base, requestedBy: "provider" }), { canAnswer: false, canCancel: true, canReview: false });
  const confirmed = { ...base, role: "client", status: "confirmed", reviewDeadline: new Date(Date.now() + 86400000).toISOString() };
  assert.equal(services.bookingActions(confirmed).canReview, true);
  assert.equal(services.bookingActions({ ...confirmed, reviewDeadline: new Date(Date.now() - 1000).toISOString() }).canReview, false);
  assert.equal(services.bookingActions({ ...confirmed, review: { rating: 5, status: "visible" } }).canReview, false);
  assert.equal(services.bookingActions({ ...confirmed, role: "provider" }).canReview, false);
});

test("readers ignore malformed rows and the WhatsApp message names the page", () => {
  assert.equal(services.readServiceCard(null), null);
  assert.equal(services.readServiceCard({ id: "x" }), null);
  assert.deepEqual(services.readOwnerServices("nope"), []);
  assert.deepEqual(services.readBookingCandidates([{ user_id: 1 }]), []);
  const message = services.serviceContactMessage({ title: "Sala A", path: "/servicios/salas-de-ensayo/sala-a-123abc", provider: { kind: "store" } });
  assert.match(message, /^Hola, vi su servicio "Sala A" en Laria: https?:\/\/[^ ]+\/servicios\/salas-de-ensayo\/sala-a-123abc ¿Tienen disponibilidad\?$/);
  assert.match(services.serviceContactMessage({ title: "Clases", path: "/servicios/clases/c", provider: { kind: "particular" } }), /vi tu servicio .* ¿Tienes disponibilidad\?$/);
  assert.equal(services.serviceRatingLabel({ count: 3, average: 4.666 }), "4.7 de 5 · 3 reseñas");
  assert.equal(services.serviceRatingLabel({ count: 0, average: null }), null);
  assert.equal(services.servicePlaceLine({ district: "Miraflores", city: "Lima", region: "Lima" }), "Miraflores, Lima");
});

test("services never mix with instruments", () => {
  // The services code reads and writes only its own RPCs and tables.
  for (const file of SERVICE_FILES) {
    const text = source(file);
    assert.doesNotMatch(text, /\.from\(["'](listings|favorites|saved_searches|listing_[a-z_]+)["']\)/, `${file} touches listing tables`);
    assert.doesNotMatch(text, /rpc\(["'](get_public_listings|search_listings|toggle_favorite|[a-z_]*saved_search[a-z_]*)["']/, `${file} calls listing RPCs`);
  }
  // The migration never writes listings, favorites or alerts, and the catalog never reads services.
  const sql = source(MIGRATION);
  assert.doesNotMatch(sql, /(insert into|update|delete from)\s+public\.(listings|favorites|saved_searches|listing_[a-z_]+)\b/i);
  const catalog = [...walk("app/listados"), ...walk("app/instrumentos"), "lib/catalog-filters.ts"].filter((file) => fs.existsSync(path.join(root, file)));
  assert.ok(catalog.length > 0);
  for (const file of catalog) assert.doesNotMatch(source(file), /services|servicios/i, `${file} mentions services`);
  // The directory pages render their own cards, never the listing card.
  for (const file of SERVICE_FILES) assert.doesNotMatch(source(file), /components\/listing-card/, file);
});

test("services are wired into navigation, notices, e-mails, reports, the sitemap and the legal pages", () => {
  assert.match(source("lib/account-navigation.ts"), /\/mi-cuenta\/servicios/);
  assert.match(source("components/admin-navigation.tsx"), /\/admin\/servicios/);
  const footer = source("components/site-footer.tsx");
  assert.match(footer, /"\/servicios"/);
  assert.match(footer, /\/mi-cuenta\/servicios\/nuevo/);
  assert.match(source("app/sitemap.ts"), /get_public_service_paths/);
  assert.match(source("components/content-report.tsx"), /"service" \| "service_review"/);
  assert.match(source("components/content-report-form.tsx"), /submit_service_report/);
  const notifications = source("lib/notifications.ts");
  const templates = source("lib/email/templates.ts");
  for (const type of ["service_approved", "service_rejected", "service_hidden", "service_booking_requested", "service_booking_confirmed"]) {
    assert.match(notifications, new RegExp(type), type);
    assert.match(templates, new RegExp(type), type);
  }
  for (const type of ["service_booking_declined", "service_review_received"]) assert.match(notifications, new RegExp(type), type);
  assert.match(source("app/terminos/page.tsx"), /<TermsServicesSection \/>/);
  assert.match(source("app/privacidad/page.tsx"), /<PrivacyServicesSection \/>/);
  assert.match(source("app/articulos-prohibidos/page.tsx"), /href="\/servicios"/);
  // The events route is same-origin only and best effort.
  const route = source("app/api/services/events/route.ts");
  assert.match(route, /sameOriginEventRequest/);
  assert.match(route, /record_service_event/);
});

test("copy keeps Laria's promises: no money handled, nothing verified, no pressure", () => {
  const copy = SERVICE_FILES.concat("components/legal/services-legal.tsx").map(source).join("\n");
  assert.doesNotMatch(copy, /garantizad|verificamos (el|la|los|las|su) (trabajo|calidad|título)|pago seguro|últimos cupos|solo quedan|oferta por tiempo/i);
  assert.match(copy, /Laria no verifica/);
  assert.match(copy, /nunca recibe dinero|no recibe dinero/);
  // Stars start empty: no rating is chosen for the client.
  assert.doesNotMatch(source("components/services/service-review-form.tsx"), /useState\((?:[1-5])\)/);
});
