// Helpers for checks-d.cjs (group D: stores, the Libro de Reclamaciones and Inventario). Fixtures go through the same
// functions the app calls (create_inventory_item, record_stock_movement…), as the owner, the way the SQL suites do.
"use strict";
const h = require("./harness.cjs");

const L = h.literal;
const key = (prefix = "d") => `${prefix}-${h.tag()}`;

// A store owner with an active store and Inventario on (Admin's switch), as harness.store() makes it.
function inventoryStore(options = {}) {
  const owner = h.account({ kind: "store_owner", ...(options.owner || {}) });
  const store = h.store(owner, { inventory: true, ...options });
  return { owner, store };
}

// A SKU through create_inventory_item, as the owner. fields: merchant_sku, product_name, unit_price_pen, listing_id,
// external_reference, low_stock_threshold, variant_label… Returns the item row.
function sku(owner, fields, quantity = 0) {
  const [row] = h.sqlAs(owner.id, `select public.create_inventory_item(${L(JSON.stringify(fields))}::jsonb, ${Number(quantity)}, ${L(key("sku"))}) as r`);
  return row.r.item;
}

// A stock movement (sale, restock, stock_count…) as the owner. Returns { item, movement }.
function move(owner, itemId, type, quantity, channel = null) {
  const [row] = h.sqlAs(owner.id, `select public.record_stock_movement(${L(itemId)}, ${L(type)}, ${Number(quantity)}, ${L(channel)},
    null, null, null, ${L(key("mov"))}) as r`);
  return row.r;
}

// harness.sqlAs reads one output line, and json_agg puts each row on its own line: several rows come back as one jsonb
// value instead (jsonb prints on one line).
function sqlAsRows(userId, query, options) {
  const [row] = h.sqlAs(userId, `select coalesce(jsonb_agg(q), '[]'::jsonb) as rows from (${query}) q`, options);
  return row ? row.rows : [];
}

const item = (itemId) => h.sql(`select * from public.store_inventory_items where id = ${L(itemId)}`)[0];
const itemBySku = (storeId, merchantSku) =>
  h.sql(`select * from public.store_inventory_items where store_id = ${L(storeId)} and merchant_sku = ${L(merchantSku)}`)[0];

// The text of the page's main landmark (or the body), with runs of white space folded.
async function mainText(page) {
  const text = await page.locator("main").first().innerText({ timeout: 10_000 }).catch(() => page.locator("body").innerText());
  return text.replace(/[ \t ]+/g, " ");
}

// Waits until fn() is truthy (polling), or the timeout passes; returns the last value.
async function until(fn, { timeout = 15_000, every = 300 } = {}) {
  const end = Date.now() + timeout;
  let value;
  do {
    value = await fn();
    if (value) return value;
    await h.sleep(every);
  } while (Date.now() < end);
  return value;
}

// Store cards on /tiendas: the whole card is one link to /tiendas/<slug>.
async function directoryCards(page) {
  return page.$$eval("main a[href^='/tiendas/']", (links) => links
    .filter((a) => /^\/tiendas\/[^/?#]+$/.test(a.getAttribute("href")))
    .map((a) => ({
      href: a.getAttribute("href"),
      name: (a.querySelector(".t-card-title")?.textContent || "").trim(),
      text: a.innerText.replace(/\s+/g, " ").trim(),
      img: Boolean(a.querySelector("img")),
      initials: (a.querySelector("span[aria-hidden='true']")?.textContent || "").trim(),
      metas: [...a.querySelectorAll(".t-meta")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
    })));
}

// Sorted by lower(name), either by code point (as the database's C collation) or as Spanish speakers sort.
function sortedByName(names) {
  const lower = names.map((name) => name.toLowerCase());
  const byCodePoint = lower.every((name, i) => i === 0 || lower[i - 1] <= name);
  const bySpanish = names.every((name, i) => i === 0 || names[i - 1].localeCompare(name, "es", { sensitivity: "base" }) <= 0);
  return byCodePoint || bySpanish;
}

// One statement (an insert, a select…) as a signed-in user or anon, in a transaction that is rolled back. Returns
// { ok, error }: error is psql's ERROR line, such as "permission denied for table x". For statements sqlAs cannot wrap
// in a subquery.
function statementAs(userId, statement, { admin = false } = {}) {
  const { execFileSync } = require("node:child_process");
  const claims = userId
    ? { sub: userId, role: "authenticated", aal: "aal2", ...(admin ? { app_metadata: { role: "admin" } } : {}) }
    : { role: "anon" };
  try {
    execFileSync("psql", [h.PG, "-At", "-v", "ON_ERROR_STOP=1", "-q", "-o", "/dev/null", "-c",
      `begin; set local role ${userId ? "authenticated" : "anon"}; select set_config('request.jwt.claims', ${L(JSON.stringify(claims))}, true); ` +
      `${statement}; rollback;`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, error: null };
  } catch (error) {
    const line = String(error.stderr || error.message).split("\n").find((row) => row.startsWith("ERROR:")) || String(error.message);
    return { ok: false, error: line.replace(/^ERROR:\s*/, "").trim() };
  }
}

// robots and canonical tags from raw HTML.
function headTags(html) {
  const robots = /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i.exec(html)?.[1] ?? null;
  const canonical = /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i.exec(html)?.[1] ?? null;
  return { robots, canonical };
}

module.exports = { key, inventoryStore, sku, move, sqlAsRows, statementAs, item, itemBySku, mainText, until, directoryCards, sortedByName, headTags };
