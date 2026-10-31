// Effortless Laria fast-04 (docs/ux-effortless/speed.md), second pass: axe-core in the states a tap opens (menus,
// sheets, the lightbox, the safety sheet, the bulk bar, the counter's cart) at 390 px and 1366 px, and a focus pass that
// tabs through the page and records any focused element a bar fixed to the bottom of the screen covers. Each step finds
// its control by role and name; a step whose control is not there is reported, not failed. Local prototype only.
//
//   node scripts/prototype/a11y-states.cjs [out.json]
//
// BASE, CHROMIUM and AXE as in a11y-audit.cjs.
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const twoStep = require("./two-step.cjs"); // feature ideas, accounts batch (safe-08)

const BASE = process.env.BASE || "http://localhost:3000";
const CHROMIUM = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const OUT = process.argv[2] || "/tmp/laria-prototype/a11y-states.json";
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const LISTING = "/instrumentos/guitarra-electrica-squier-stratocaster-usada-lima";
const STORE_LISTING = "/instrumentos/demo-boss-ds-1";

function axePath() {
  if (process.env.AXE) return process.env.AXE;
  const store = path.join(__dirname, "..", "..", "node_modules", ".pnpm");
  const folder = fs.existsSync(store) ? fs.readdirSync(store).filter((name) => name.startsWith("axe-core@")).sort().pop() : null;
  if (!folder) throw new Error("axe-core not found; set AXE to axe.min.js");
  return path.join(store, folder, "node_modules", "axe-core", "axe.min.js");
}

async function login(page, email) {
  await page.goto(`${BASE}/login?next=${encodeURIComponent("/mi-cuenta")}`, { waitUntil: "load" });
  await page.getByLabel("Correo", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill("laria-demo-2026");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/mi-cuenta"), { timeout: 20000 });
  // Feature ideas, accounts batch (safe-08): the code step after the password, and the app turned on where Mi tienda
  // requires it (the demo store has approved payment methods).
  await twoStep.answer(page, email);
  if (email.startsWith("demo-tienda@")) await twoStep.enable(page, BASE, email);
}

async function axe(page, file) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ path: file });
  return page.evaluate(async (tags) => {
    const run = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    return run.violations.map((rule) => ({ id: rule.id, impact: rule.impact, count: rule.nodes.length, nodes: rule.nodes.slice(0, 5).map((node) => ({ target: node.target.join(" "), html: node.html.slice(0, 200), summary: (node.failureSummary || "").slice(0, 240) })) }));
  }, WCAG);
}

// fast-04: a focused element hidden behind a bar fixed to the bottom of the screen ([data-bottom-bar], .contact-bar).
async function focusClear(page) {
  return page.evaluate(() => {
    const bars = [...document.querySelectorAll("[data-bottom-bar], .contact-bar")].filter((bar) => {
      const style = getComputedStyle(bar);
      return style.display !== "none" && style.visibility !== "hidden" && (style.position === "fixed" || style.position === "sticky");
    });
    const covered = [];
    const fields = [...document.querySelectorAll("input:not([type=hidden]), select, textarea, button, a[href]")].filter((el) => el.offsetParent !== null && !bars.some((bar) => bar.contains(el)));
    for (const field of fields.slice(0, 400)) {
      field.focus({ preventScroll: false });
      field.scrollIntoView({ block: "nearest" });
      const box = field.getBoundingClientRect();
      if (box.height === 0) continue;
      for (const bar of bars) {
        const area = bar.getBoundingClientRect();
        if (box.top < area.bottom - 1 && box.bottom > area.top + 1 && box.top < window.innerHeight) covered.push(`${field.tagName.toLowerCase()} "${(field.getAttribute("aria-label") || field.textContent || field.name || "").trim().slice(0, 40)}"`);
      }
    }
    document.activeElement?.blur?.();
    return { bars: bars.length, covered: [...new Set(covered)].slice(0, 10) };
  });
}

async function tickRows(page, count) {
  const boxes = page.getByRole("checkbox", { name: /^Seleccionar (?!todos)/ });
  if ((await boxes.count()) < count) return false;
  for (let index = 0; index < count; index += 1) await boxes.nth(index).check();
  await page.getByRole("region", { name: "Acciones para los SKU seleccionados" }).waitFor({ timeout: 5000 });
  return true;
}

const STEPS = [
  { role: "visitor", path: "/", name: "home menu", act: async (page) => {
    const button = page.getByRole("button", { name: /Categorías|Menú|Explorar/ }).first();
    if (!(await button.count())) return "no menu button";
    await button.click();
    await page.waitForTimeout(400);
  } },
  { role: "visitor", path: "/listados", name: "filter sheet", phoneOnly: true, act: async (page) => {
    const button = page.getByRole("button", { name: /^Filtrar/ }).first();
    if (!(await button.count())) return "no Filtrar";
    await button.click();
    await page.getByRole("dialog").first().waitFor({ timeout: 5000 });
  } },
  { role: "visitor", path: "/listados", name: "sort sheet", phoneOnly: true, act: async (page) => {
    const button = page.getByRole("button", { name: /^Ordenar/ }).first();
    if (!(await button.count())) return "no Ordenar";
    await button.click();
    await page.getByRole("dialog").first().waitFor({ timeout: 5000 });
  } },
  { role: "visitor", path: "/listados", name: "catalog focus vs bars", focus: true, act: async () => null },
  { role: "visitor", path: LISTING, name: "lightbox", act: async (page) => {
    const button = page.getByRole("button", { name: /^Ampliar foto 1/ }).first();
    if (!(await button.count())) return "no Ampliar";
    await button.click();
    await page.getByRole("dialog").first().waitFor({ timeout: 5000 });
  } },
  // The one-time safety sheet comes before every purchase request (and contacts from S/ 1,000, UXD-listing-7).
  { role: "visitor", path: STORE_LISTING, name: "safety sheet", act: async (page, context) => {
    const link = page.getByRole("link", { name: /Solicitar compra/ }).first();
    if (!(await link.count())) return "no Solicitar compra link (is the payments pilot on?)";
    const popup = context.waitForEvent("page", { timeout: 1500 }).catch(() => null);
    await link.click();
    await page.waitForTimeout(600);
    const opened = await popup;
    if (opened) await opened.close();
    return (await page.getByRole("dialog").count()) ? null : "no sheet (opened WhatsApp directly)";
  } },
  { role: "visitor", path: LISTING, name: "listing focus vs contact bar", focus: true, phoneOnly: true, act: async () => null },
  { role: "visitor", path: STORE_LISTING, name: "store listing focus vs contact bar", focus: true, phoneOnly: true, act: async () => null },
  { role: "visitor", path: STORE_LISTING, name: "share", act: async (page) => {
    const button = page.getByRole("button", { name: /^Compartir/ }).first();
    if (!(await button.count())) return "no Compartir";
    await button.click();
    await page.waitForTimeout(600);
  } },
  { role: "store", path: "/mi-cuenta/tienda/inventario", name: "phone select all", phoneOnly: true, act: async (page) => {
    const all = page.getByRole("checkbox", { name: "Seleccionar todos los de esta página" });
    if ((await all.count()) !== 1) return `select-all count ${await all.count()}`;
    await all.check();
    await page.getByRole("region", { name: "Acciones para los SKU seleccionados" }).waitFor({ timeout: 5000 });
  } },
  { role: "store", path: "/mi-cuenta/tienda/inventario", name: "bulk bar", act: async (page) => ((await tickRows(page, 2)) ? null : "no row checkboxes") },
  { role: "store", path: "/mi-cuenta/tienda/inventario", name: "bulk bar focus", focus: true, act: async (page) => ((await tickRows(page, 1)) ? null : "no row checkboxes") },
  { role: "store", path: "/mi-cuenta/tienda/inventario", name: "Ajustar stock sheet", act: async (page) => {
    if (!(await tickRows(page, 2))) return "no row checkboxes";
    await page.getByRole("button", { name: "Ajustar stock", exact: true }).click();
    await page.getByRole("dialog").first().waitFor({ timeout: 5000 });
  } },
  { role: "store", path: "/mi-cuenta/tienda/inventario/mostrador", name: "counter cart", act: async (page) => {
    const field = page.getByLabel("Código, SKU o nombre");
    if (!(await field.count())) return "no code field";
    await field.fill("BOSS-DS1");
    await field.press("Enter");
    await page.waitForTimeout(800);
  } },
  { role: "seller", path: "/mi-cuenta/publicar", name: "sell form", focus: true, act: async () => null },
  { role: "buyer", path: "/mi-cuenta/favoritos", name: "favorites", act: async () => null },
];
const ACCOUNTS = { buyer: "comprador@laria.test", seller: "particular@laria.test", store: "demo-tienda@laria.test" };

(async () => {
  const AXE = axePath();
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--headless=new"] });
  const results = [];
  for (const [width, height, phone] of [[390, 844, true], [1366, 900, false]]) {
    const contexts = {};
    for (const step of STEPS) {
      if (step.phoneOnly && !phone) continue;
      if (!contexts[step.role]) {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, locale: "es-PE" });
        const page = await context.newPage();
        if (ACCOUNTS[step.role]) await login(page, ACCOUNTS[step.role]);
        contexts[step.role] = { context, page };
      }
      const { context, page } = contexts[step.role];
      let note = null;
      let violations = [];
      let focus = null;
      try {
        await page.goto(BASE + step.path, { waitUntil: "load", timeout: 30000 });
        note = await step.act(page, context);
        violations = await axe(page, AXE);
        if (step.focus) focus = await focusClear(page);
      } catch (error) {
        note = `ERROR ${String(error).slice(0, 200)}`;
      }
      results.push({ width, role: step.role, path: step.path, name: step.name, note, violations, focus });
      console.log(`${width} ${step.role} ${step.name}: ${note ?? "ok"} | ${violations.map((rule) => `${rule.id}(${rule.impact},${rule.count})`).join(" ")}${focus ? ` | bars ${focus.bars}, covered ${focus.covered.length}: ${focus.covered.join("; ")}` : ""}`);
    }
    for (const { context } of Object.values(contexts)) await context.close();
  }
  await browser.close();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
})();
