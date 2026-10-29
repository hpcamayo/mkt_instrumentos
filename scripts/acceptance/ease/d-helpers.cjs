// Helpers for checks-d.cjs (group D: stores, the Libro de Reclamaciones and Inventario). Fixtures go through the same
// functions the app calls (create_inventory_item, record_stock_movement…), as the owner, the way the SQL suites do.
"use strict";
const h = require("./harness.cjs");
const { LocalOnly } = require("./errors.cjs");

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
  localOnly("statementAs");
  if (!userId) {
    const fn = /select\s+public\.([a-z_]+)\(/i.exec(statement)?.[1];
    if (fn) {
      const [privilege] = h.sql(`select coalesce(bool_or(has_function_privilege('anon', p.oid, 'execute')), false) as allowed
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = ${L(fn)}`);
      if (!privilege.allowed) return { ok: false, error: `permission denied for function ${fn} (verified from grants; direct denial covered by the isolated SQL suite)` };
    }
  }
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

// These helpers run psql on the local copy: on the live site a case that needs them stops as Not Run.
function localOnly(what) {
  if (h.LIVE) throw new LocalOnly(`${what} runs SQL on the local copy only`);
}

// A script of several statements in one psql session (begin ... rollback inside the script when it must leave nothing
// behind). Returns the output lines of its selects (-At: one row per line, columns joined by |).
function psqlScript(script) {
  localOnly("psqlScript");
  const { execFileSync } = require("node:child_process");
  return execFileSync("psql", [h.PG, "-At", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], { input: script, encoding: "utf8" })
    .split("\n").filter(Boolean);
}

// The cells of an .xlsx's first sheet as rows of text (inline strings, shared strings and values), with Python's zipfile.
const XLSX_READ = `
import json, re, sys, zipfile
book = zipfile.ZipFile(sys.argv[1])
names = book.namelist()
shared = []
if "xl/sharedStrings.xml" in names:
    shared = [re.sub(r"<[^>]+>", "", si) for si in re.findall(r"<si>(.*?)</si>", book.read("xl/sharedStrings.xml").decode(), re.S)]
sheet = sorted(n for n in names if n.startswith("xl/worksheets/sheet"))[0]
xml = book.read(sheet).decode()
def col(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters: n = n * 26 + ord(ch) - 64
    return n - 1
rows = []
for row in re.findall(r"<row[^>]*>(.*?)</row>", xml, re.S):
    cells = {}
    for attrs, body in re.findall(r"<c ([^>]*?)(?:/>|>(.*?)</c>)", row, re.S):
        ref = re.search(r'r="([A-Z]+\\d+)"', attrs).group(1)
        kind = re.search(r't="([^"]+)"', attrs)
        text = ""
        if kind and kind.group(1) == "inlineStr":
            text = "".join(re.findall(r"<t[^>]*>(.*?)</t>", body or "", re.S))
        else:
            value = re.search(r"<v>(.*?)</v>", body or "", re.S)
            text = value.group(1) if value else ""
            if kind and kind.group(1) == "s" and text: text = shared[int(text)]
        cells[col(ref)] = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    rows.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])
print(json.dumps(rows))
`;
function xlsxRows(file) {
  const { execFileSync } = require("node:child_process");
  return JSON.parse(execFileSync("python3", ["-I", "-c", XLSX_READ, file], { encoding: "utf8" }));
}

// Writes a copy of a Laria .xlsx with cells set by row (1-based, as Excel numbers them) and column letter, and rows
// appended. Each cell value is text, a number, or { formula, cached } for a formula cell.
const XLSX_EDIT = `
import json, re, sys, zipfile
source, target, plan = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
book = zipfile.ZipFile(source)
names = book.namelist()
sheet = sorted(n for n in names if n.startswith("xl/worksheets/sheet"))[0]
xml = book.read(sheet).decode()
def cell(ref, value):
    if isinstance(value, dict):
        return '<c r="%s"><f>%s</f><v>%s</v></c>' % (ref, value["formula"], value.get("cached", ""))
    if isinstance(value, (int, float)):
        return '<c r="%s"><v>%s</v></c>' % (ref, value)
    text = str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return '<c r="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>' % (ref, text)
def set_cells(match):
    number = match.group(1)
    body = match.group(2)
    for letter, value in plan.get("cells", {}).get(number, {}).items():
        ref = letter + number
        body = re.sub(r'<c r="%s"[^>]*?(/>|>.*?</c>)' % ref, "", body, flags=re.S)
        body += cell(ref, value)
    return '<row r="%s">%s</row>' % (number, body)
xml = re.sub(r'<row r="(\\d+)"[^>]*>(.*?)</row>', set_cells, xml, flags=re.S)
last = max(int(n) for n in re.findall(r'<row r="(\\d+)"', xml))
extra = ""
for offset, row in enumerate(plan.get("append", [])):
    number = str(last + 1 + offset)
    extra += '<row r="%s">%s</row>' % (number, "".join(cell(letter + number, value) for letter, value in row.items()))
xml = xml.replace("</sheetData>", extra + "</sheetData>")
xml = re.sub(r'<dimension ref="[^"]*"/>', "", xml)
out = zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED)
for name in names:
    out.writestr(name, xml if name == sheet else book.read(name))
out.close()
`;
function editXlsx(source, target, plan) {
  const { execFileSync } = require("node:child_process");
  execFileSync("python3", ["-I", "-c", XLSX_EDIT, source, target, JSON.stringify(plan)], { encoding: "utf8" });
  return target;
}

// robots and canonical tags from raw HTML.
function headTags(html) {
  const robots = /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i.exec(html)?.[1] ?? null;
  const canonical = /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i.exec(html)?.[1] ?? null;
  return { robots, canonical };
}

module.exports = { key, inventoryStore, sku, move, sqlAsRows, statementAs, psqlScript, xlsxRows, editXlsx, item, itemBySku, mainText, until, directoryCards, sortedByName, headTags };
