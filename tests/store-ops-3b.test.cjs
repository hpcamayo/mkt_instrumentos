// STORE-3b publication from an import and listing allowance: the route-side field rules (the publish form's own
// validators), attribute mapping from spreadsheet text, the publish request parser, the allowance message, and the
// boundaries between the publish route and the database. Runs with `pnpm test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");

const load = Module._load;
Module._load = function stubServerOnly(request, ...rest) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin-client") return { getSupabaseAdminClient: () => null };
  return load.call(this, request, ...rest);
};

const { planPublication, publicationAttributes, publicationTitle, defaultInstrumentType, PUBLISH_CHUNK_ROWS } = require("@/lib/store-import/publication");
const { parsePublishRequest } = require("@/lib/store-import/publication-server");
const { parseImportRow } = require("@/lib/store-import/rows");
const { listingLimitMessage } = require("@/lib/store-allowance");

const migration = fs.readFileSync("supabase/migrations/20261027120000_store_import_publication.sql", "utf8");

const item = { product_name: "Boss DS-1", variant_label: null, unit_price_pen: 450 };
const parsed = {
  sku: "DS1-004", product_name: "Boss DS-1", brand: "Boss", model: "DS-1", category: "pedals", instrument_type: "pedals",
  variant_label: null, unit_price_pen: 450, quantity: 3, condition: "Nuevo",
  description: "Pedal de distorsión nuevo, en caja, con garantía de la tienda por un año.", low_stock_threshold: null,
  external_reference: null, photos: null, listing_id: null, attributes: { pedal_type: "Distorsión", true_bypass: "Sí" },
};

test("a complete row becomes the publish form's fields", () => {
  const plan = planPublication(parsed, item);
  assert.deepEqual(plan.missing, []);
  assert.deepEqual(plan.fields, {
    title: "Boss DS-1", brand: "Boss", model: "DS-1", category: "pedals", instrument_type: "pedals", condition: "Nuevo",
    description: parsed.description, attributes: { pedal_type: "distortion", true_bypass: "yes" },
  });
});

test("every missing requirement is named, and nothing is built", () => {
  const plan = planPublication({ ...parsed, brand: null, model: "", category: null, condition: null, description: "Corta" },
    { ...item, unit_price_pen: null });
  assert.equal(plan.fields, null);
  assert.deepEqual(plan.missing, ["marca", "modelo", "categoría", "condición", "descripción de 40 caracteres", "precio"]);
});

test("the instrument type comes from the category when it has only one", () => {
  assert.equal(defaultInstrumentType("basses"), "bass");
  assert.equal(defaultInstrumentType("pedals"), "pedals");
  assert.equal(defaultInstrumentType("guitars"), null);
  assert.equal(planPublication({ ...parsed, instrument_type: null }, item).fields.instrument_type, "pedals");
  assert.deepEqual(planPublication({ ...parsed, category: "guitars", instrument_type: null, attributes: {} }, item).missing, ["tipo de instrumento"]);
  assert.deepEqual(planPublication({ ...parsed, category: "guitars", instrument_type: "bass", attributes: {} }, item).missing, ["tipo de instrumento"]);
});

test("the title is the SKU's name, with the variant when the name lacks it", () => {
  assert.equal(publicationTitle({ ...item, variant_label: "Negro" }), "Boss DS-1 - Negro");
  assert.equal(publicationTitle({ product_name: "Fender Player Negro", variant_label: "negro", unit_price_pen: 1 }), "Fender Player Negro");
  assert.equal(publicationTitle({ product_name: "x".repeat(200), variant_label: null, unit_price_pen: 1 }).length, 140);
});

test("attribute text maps to stored values; anything unknown is left out with a warning", () => {
  assert.deepEqual(publicationAttributes("electric_guitar", { pickups: "Single coil; humbucker", handedness: "Diestro" }).attributes.pickups,
    ["single_coil", "humbucker"]);
  const unknown = publicationAttributes("pedals", { pedal_type: "Octavador", strings: "6", true_bypass: "tal vez" });
  assert.deepEqual(unknown.attributes, {});
  assert.equal(unknown.warnings.length, 3);
  assert.deepEqual(publicationAttributes("other", { pedal_type: "Fuzz" }).attributes, {});
  // Warnings never block publication.
  assert.ok(planPublication({ ...parsed, attributes: { pedal_type: "Octavador" } }, item).fields);
});

test("the route re-reads the staged cells with the confirmed columns", () => {
  const mapping = { sku: 0, product_name: 1, brand: 2, model: 3, category: 4, condition: 5, description: 6, unit_price_pen: 7, quantity: 8, "attribute:pedal_type": 9 };
  const cells = ["DS1-004", "Boss DS-1", "Boss", "DS-1", "Pedales", "nuevo", parsed.description, "S/ 450", "3", "Distorsión"].map((v) => ({ v }));
  const plan = planPublication(parseImportRow(cells, mapping).parsed, item);
  assert.equal(plan.fields.category, "pedals");
  assert.equal(plan.fields.condition, "Nuevo");
  assert.deepEqual(plan.fields.attributes, { pedal_type: "distortion" });
});

test("publish requests: 1 to 20 distinct row numbers", () => {
  assert.equal(PUBLISH_CHUNK_ROWS, 20);
  assert.deepEqual(parsePublishRequest({ rows: [5, 2, 2], rulesAccepted: true }), { rows: [2, 5], rulesAccepted: true });
  assert.equal(parsePublishRequest({ rows: [], rulesAccepted: true }), null);
  assert.equal(parsePublishRequest({ rows: Array.from({ length: 21 }, (_, i) => i + 1) }), null);
  assert.equal(parsePublishRequest({ rows: [1.5] }), null);
  assert.equal(parsePublishRequest({ rows: ["1"] }), null);
  assert.equal(parsePublishRequest({ rows: [0] }), null);
  assert.equal(parsePublishRequest({ rows: [3] }).rulesAccepted, false);
});

test("the allowance message names the store's number", () => {
  assert.equal(listingLimitMessage("STORE_INVENTORY_LIMIT_REACHED: La tienda ya tiene 500 publicaciones concurrentes."),
    "Tu tienda alcanzó el límite de 500 publicaciones concurrentes.");
  assert.equal(listingLimitMessage("STORE_INVENTORY_LIMIT_REACHED"), "Tu tienda alcanzó el límite de 50 publicaciones concurrentes.");
});

test("boundaries: the publish function is service-role only and takes price, photos and contact data from the database", () => {
  assert.match(migration, /grant execute on function public\.publish_store_import_rows\(uuid, uuid, jsonb, boolean\) to service_role;/);
  assert.doesNotMatch(migration, /publish_store_import_rows\([^)]*\) to authenticated/);
  assert.match(migration, /'price_pen', item\.unit_price_pen/);
  assert.match(migration, /laria_private\.import_row_photos_json\(session\.id, staged\.row_number\)/);
  assert.match(migration, /import_photo_url_is_valid\(photo->>'image_url', p_owner_user_id, store_record\.id, session\.id\)/);
  // The allowance is read after the advisory lock in the cap trigger.
  const trigger = migration.slice(migration.indexOf("create or replace function public.enforce_store_inventory_cap()"));
  assert.ok(trigger.indexOf("pg_advisory_xact_lock") < trigger.indexOf("store_listing_allowance(new.store_id)"));
  // One store-listing insert for both paths.
  const submission = migration.slice(migration.indexOf("create or replace function public.complete_public_submission"));
  assert.match(submission.slice(0, submission.indexOf("$$;\n")), /perform laria_private\.insert_store_listing\(p_id, store_record, p_fields, p_photos\);/);
});

test("the publish route uses the owner's session for reads and the service role only for the publish call", () => {
  const server = fs.readFileSync("lib/store-import/publication-server.ts", "utf8");
  assert.equal((server.match(/admin\.rpc\(/g) ?? []).length, 2); // the call and its one retry
  assert.doesNotMatch(server, /admin\.from\(/);
  assert.match(server, /parseImportRow\(row\.raw \?\? \[\], session\.column_mapping \?\? \{\}\)/);
});
