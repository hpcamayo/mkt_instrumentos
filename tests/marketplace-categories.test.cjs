// The ten marketplace categories (owner decision, 12 Oct 2026; docs/ux-redesign/category-restructure.md): the app's
// taxonomy and the database's validators must agree, and the retired categories must keep their old links working.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261022120000_marketplace_categories.sql"), "utf8");
const { categoryOptions, legacyCategories, parseListingFilters } = require("../lib/listings.ts");
const { instrumentTypesByCategory } = require("../lib/listing-submission.ts");
const { instrumentFilterGroups } = require("../lib/instrument-filters.ts");

const sqlList = (text) => [...text.matchAll(/'([^']+)'/g)].map((match) => match[1]);
const functionBody = (name) => {
  const start = migration.indexOf(`create or replace function ${name}(`);
  assert.notEqual(start, -1, name);
  return migration.slice(start, migration.indexOf("$$;", start));
};

test("the ten categories, in menu order", () => {
  assert.deepEqual(categoryOptions.map((option) => [option.value, option.label]), [
    ["guitars", "Guitarras"], ["basses", "Bajos"], ["keyboards", "Teclados y pianos"], ["percussion", "Percusión"],
    ["winds", "Vientos"], ["strings", "Cuerdas"], ["pedals", "Pedales"], ["amplifiers", "Amplificadores"],
    ["microphones", "Micrófonos"], ["audio", "Audio"],
  ]);
  assert.deepEqual(Object.keys(instrumentTypesByCategory), categoryOptions.map((option) => option.value));
});

test("public.listing_taxonomy_is_valid accepts exactly the app's category/type pairs", () => {
  const body = functionBody("public.listing_taxonomy_is_valid");
  const other = /p_instrument_type = 'other' and p_category in \(([^)]*)\)/.exec(body);
  assert.deepEqual(sqlList(other[1]), categoryOptions.map((option) => option.value));
  const pairs = {};
  for (const match of body.matchAll(/\(p_category = '([^']+)' and p_instrument_type (?:= '([^']+)'|in \(([^)]*)\))\)/g)) {
    pairs[match[1]] = match[2] ? [match[2]] : sqlList(match[3]);
  }
  const expected = Object.fromEntries(Object.entries(instrumentTypesByCategory).map(([category, types]) => [category, types.filter((type) => type !== "other")]));
  assert.deepEqual(pairs, expected);
});

test("public.listing_attribute_keys_are_valid allows each type's filter keys and nothing else", () => {
  const body = functionBody("public.listing_attribute_keys_are_valid");
  const keys = Object.fromEntries([...body.matchAll(/when '([^']+)' then key <> all\(array\[([^\]]*)\]\)/g)].map((match) => [match[1], sqlList(match[2]).sort()]));
  for (const group of instrumentFilterGroups) {
    if (group.instrumentType === "other") continue;
    assert.deepEqual(keys[group.instrumentType], group.filters.map((filter) => filter.key).sort(), group.instrumentType);
  }
  // Every type a category offers has its keys listed.
  for (const types of Object.values(instrumentTypesByCategory)) for (const type of types) if (type !== "other") assert.ok(keys[type], type);
});

test("saved searches accept the new categories and every filter key", () => {
  const body = functionBody("laria_private.normalize_saved_search");
  const allowed = new Set(sqlList(/allowed_advanced constant text\[\] := array\[([\s\S]*?)\];/.exec(body)[1]));
  for (const group of instrumentFilterGroups) for (const filter of group.filters) assert.ok(allowed.has(filter.key), filter.key);
  const categories = /string_value not in \(('guitars'[^)]*)\) then raise exception 'ALERT_FILTERS_INVALID'; end if;\n    if string_value is not null then result := result \|\| jsonb_build_object\('category'/.exec(body);
  assert.deepEqual(sqlList(categories[1]), categoryOptions.map((option) => option.value));
});

test("the publication checks ask the taxonomy function instead of keeping their own copy", () => {
  assert.match(functionBody("public.listing_meets_publish_requirements"), /and public\.listing_taxonomy_is_valid\(l\.category, l\.instrument_type\)/);
  assert.match(functionBody("laria_private.enforce_public_listing_edit_invariant"), /or not public\.listing_taxonomy_is_valid\(new\.category, new\.instrument_type\)/);
  for (const name of ["public.listing_meets_publish_requirements", "laria_private.enforce_public_listing_edit_invariant"]) {
    assert.doesNotMatch(functionBody(name), /'drums'|'cymbals'|'audio interfaces'/, name);
  }
});

test("stored rows move to the new categories after the validators change, and alerts keep their meaning", () => {
  const validators = migration.indexOf("create or replace function laria_private.enforce_public_listing_edit_invariant");
  const firstUpdate = migration.indexOf("update public.listings");
  assert.ok(validators !== -1 && firstUpdate > validators, "the validators change before the rows move");
  assert.match(migration, /select set_config\('app\.allow_listing_admin_fields', 'true', true\);\n\nupdate public\.listings\nset category = case category when 'audio interfaces' then 'audio' else 'percussion' end\nwhere category in \('drums', 'cymbals', 'audio interfaces'\);/);
  assert.match(migration, /update public\.listing_revisions\nset category = case category when 'audio interfaces' then 'audio' else 'percussion' end/);
  // Alerts: new category plus the old type, hash and bucket recomputed, duplicates deleted like delete_saved_search_alert.
  assert.match(migration, /when 'drums' then 'drums' when 'cymbals' then 'cymbals' else 'audio_interface' end/);
  assert.match(migration, /search_hash = laria_private\.saved_search_hash\(moved\.filters\),\n  match_bucket = 'type:' \|\| \(moved\.filters->>'instrument_type'\)/);
  assert.match(migration, /set status = 'deleted', deleted_at = clock_timestamp\(\), paused_at = coalesce\(paused_at, clock_timestamp\(\)\), updated_at = clock_timestamp\(\)/);
  assert.match(migration, /set status = 'cancelled', locked_at = null, locked_by = null\nwhere search_alert_id in \(select id from category_duplicate_alerts\)/);
});

test("old category links read as the new category and type", () => {
  for (const [old, { category, instrumentType }] of Object.entries(legacyCategories)) {
    assert.ok(instrumentTypesByCategory[category].includes(instrumentType), old);
    const filters = parseListingFilters({ category: old });
    assert.equal(filters.category, category, old);
    assert.equal(filters.instrumentType, instrumentType, old);
  }
  // An explicit type wins over the one the retired category implies.
  assert.equal(parseListingFilters({ category: "drums", instrument_type: "other" }).instrumentType, "other");
  // The type's attributes still parse under the old link.
  assert.deepEqual(parseListingFilters({ category: "cymbals", cymbal_type: "crash" }).advanced, { cymbal_type: "crash" });
});
