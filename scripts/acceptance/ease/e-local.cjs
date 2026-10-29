// Group E local helpers (checks-e.cjs): what main's own suite asserts, database reads that may be refused, a store
// with Inventario, cards and popups. Everything here is local only except the source reader and the page helpers.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const h = require("./harness.cjs");

const L = h.literal;
const REPO = path.join(__dirname, "..", "..", "..");
const CI_RUN = "GitHub Actions run 40729857862 on main at ba05b79";

const source = (file) => fs.readFileSync(path.join(REPO, file), "utf8");

// A named test on main really asserts the expectation: every pattern appears in the test file CI runs.
function ciAsserts(t, file, patterns) {
  const text = source(file);
  for (const pattern of patterns) {
    const ok = pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
    const shown = pattern instanceof RegExp ? `/${pattern.source.slice(0, 90)}/` : `"${pattern.slice(0, 90)}"`;
    t.check(ok, `${file} asserts ${shown}`);
  }
  t.note(`ci ${file} (${CI_RUN})`);
}

// harness.sqlAs reads one output line; several rows come back as one jsonb value instead.
function rows(userId, query, options) {
  const [row] = h.sqlAs(userId, `select coalesce(jsonb_agg(q), '[]'::jsonb) as rows from (${query}) q`, options);
  return row ? row.rows : [];
}

const errorLine = (error) => {
  const text = `${error.stderr || ""}${error.message || ""}`;
  const line = text.split("\n").find((part) => /ERROR:/.test(part)) || text.split("\n")[0];
  return line.replace(/^.*ERROR:\s*/, "").trim();
};

// A call that may be refused: { ok, rows } or { ok: false, error } with the database's message.
function attempt(userId, query, options) {
  try {
    return { ok: true, rows: rows(userId, query, options) };
  } catch (error) {
    if (error instanceof h.LocalOnly || error instanceof h.LiveUnsafe) throw error;
    return { ok: false, error: errorLine(error) };
  }
}

function attemptExec(statements) {
  try {
    h.exec(statements);
    return { ok: true };
  } catch (error) {
    if (error instanceof h.LocalOnly || error instanceof h.LiveUnsafe) throw error;
    return { ok: false, error: errorLine(error) };
  }
}

// A store owner with an active store and Inventario on.
function inventoryStore(options = {}) {
  const owner = h.account({ kind: "store_owner" });
  const store = h.store(owner, { inventory: true, ...options });
  return { owner, store };
}

// A SKU through create_inventory_item, as the owner (the way Inventario creates it). Returns the item row.
function sku(owner, fields, quantity = 0) {
  const [row] = h.sqlAs(owner.id, `select public.create_inventory_item(${L(JSON.stringify(fields))}::jsonb, ${Number(quantity)}, ${L(`e-${h.tag()}`)}) as r`);
  return row.r.item;
}

async function mainText(page) {
  const text = await page.locator("main").first().innerText({ timeout: 10_000 }).catch(() => page.locator("body").innerText());
  return text.replace(/[ \t ]+/g, " ");
}

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

// The text of a listing's card on the page (the closest article or list item around its link), or null.
async function cardText(page, slug) {
  return page.evaluate((target) => {
    const link = [...document.querySelectorAll("a[href]")].find((a) => (a.getAttribute("href") || "").replace(/[?#].*$/, "").endsWith(`/instrumentos/${target}`));
    if (!link) return null;
    let node = link;
    for (let level = 0; level < 8 && node.parentElement; level += 1) {
      node = node.parentElement;
      if (node.matches("article, li")) break;
    }
    return node.textContent.replace(/\s+/g, " ").trim();
  }, slug);
}

// The page the press opens (a new tab): its URL once loaded.
async function popupOf(page, action, timeout = 15_000) {
  const [popup] = await Promise.all([page.context().waitForEvent("page", { timeout }), action()]);
  // Descubrir opens a blank tab inside the press and sends it to wa.me once /api/contact answers.
  await popup.waitForURL((url) => url.href !== "about:blank", { timeout }).catch(() => {});
  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  return popup;
}

// The safety sheet ("Cómo comprar seguro"), when it is open.
function safetySheet(page) {
  return page.getByRole("dialog", { name: "Cómo comprar seguro" });
}

// A fetch with this browser's cookies and the site's origin (the routes check where a write comes from).
async function call(page, base, method, route, data) {
  const response = await page.request.fetch(`${base}${route}`, {
    method,
    headers: { origin: new URL(base).origin, "content-type": "application/json" },
    data: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status(), body };
}

// A control by its name, whether the page draws it as a button or as a link.
function control(scope, name) {
  return scope.getByRole("button", { name, exact: true }).or(scope.getByRole("link", { name, exact: true })).first();
}

// An id by slug (local).
const idOf = (slug) => h.sql(`select id from public.listings where slug = ${L(slug)}`)[0]?.id || null;

// Lima clock text the site writes: weekday, day, month and "6:30 p. m." pieces of a time.
function limaParts(time) {
  const zone = { timeZone: "America/Lima" };
  const weekday = new Intl.DateTimeFormat("es-PE", { ...zone, weekday: "long" }).format(time);
  const day = new Intl.DateTimeFormat("es-PE", { ...zone, day: "numeric" }).format(time);
  const month = new Intl.DateTimeFormat("es-PE", { ...zone, month: "long" }).format(time).toLowerCase();
  const clock = new Intl.DateTimeFormat("en-US", { ...zone, hour: "numeric", minute: "2-digit", hour12: true }).format(time).replace(/\s?[AP]M$/, "");
  return { weekday, day, month, clock };
}

module.exports = {
  L, REPO, CI_RUN, source, ciAsserts, rows, attempt, attemptExec, inventoryStore, sku, mainText, until, cardText,
  popupOf, safetySheet, call, idOf, limaParts, control,
};
