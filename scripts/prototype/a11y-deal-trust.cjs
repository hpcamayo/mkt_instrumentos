// Deal-trust batch (docs/feature-ideas/deal-trust.md): axe-core (WCAG 2.0 to 2.2, A and AA) on the new pages and the
// states a tap opens (the meetup sheet, the level dialog, the Mostrador code sheet, the buyer card consent), at 390 px
// and 1366 px, with the demo accounts and scripts/prototype/deal-trust-seed.sql. It also reports horizontal overflow.
// Each run records one Mostrador sale of DAD-EXL110. Local prototype only (scripts/prototype/README.md § Deal-trust).
//
//   node scripts/prototype/a11y-deal-trust.cjs [out.json]
//
// BASE, CHROMIUM and AXE as in a11y-audit.cjs; playwright-core must be resolvable (NODE_PATH).
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE || "http://localhost:3000";
const CHROMIUM = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const OUT = process.argv[2] || "/tmp/laria-prototype/a11y-deal-trust.json";
const PASSWORD = "laria-demo-2026";
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function axePath() {
  if (process.env.AXE) return process.env.AXE;
  const store = path.join(__dirname, "..", "..", "node_modules", ".pnpm");
  const folder = fs.existsSync(store) ? fs.readdirSync(store).filter((name) => name.startsWith("axe-core@")).sort().pop() : null;
  if (!folder) throw new Error("axe-core not found; set AXE to axe.min.js");
  return path.join(store, folder, "node_modules", "axe-core", "axe.min.js");
}
const AXE = axePath();

async function login(page, email, next = "/mi-cuenta") {
  await go(page, `${BASE}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Correo", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/mi-cuenta") || url.pathname.startsWith("/admin"), { timeout: 30000 });
}

const results = [];

// A superseded header refresh leaves its response unread in dev, so "networkidle" can wait forever; settle instead.
async function go(page, url) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => page.waitForTimeout(1500));
}

async function scan(page, label, width) {
  await page.waitForTimeout(500);
  await page.addScriptTag({ path: AXE });
  const found = await page.evaluate(async (tags) => {
    const run = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return run.violations.map((rule) => ({ id: rule.id, impact: rule.impact, count: rule.nodes.length, nodes: rule.nodes.slice(0, 4).map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 200), summary: (n.failureSummary || "").slice(0, 240) })) }));
  }, WCAG);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  results.push({ label, width, violations: found, overflow });
  console.log(`${width} ${label} | ${found.map((r) => `${r.id}(${r.impact},${r.count})`).join(" ") || "ok"}${overflow > 0 ? ` | overflow ${overflow}` : ""}`);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--headless=new"] });
  for (const [width, height, phone] of [[390, 844, true], [1366, 900, false]]) {
    const ctx = async () => { const c = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, locale: "es-PE" }); return [c, await c.newPage()]; };
    let [context, page] = await ctx();
    await go(page, `${BASE}/instrumentos/demo-particular-squier-bullet`);
    const sellerPage = (await page.locator("#vendedor a", { hasText: "Ver perfil" }).first().getAttribute("href")) ?? "/vendedores/no-existe";
    for (const p of ["/instrumentos/demo-comprador-telecaster", "/instrumentos/demo-particular-squier-bullet", sellerPage, "/comprador/a1b2c3d4e5f60718293a4b5c", "/comprador/000000000000000000000000", "/consejos-de-seguridad", "/tiendas/laria-demo-musica", "/compra-en-tienda/no-existe"]) {
      await go(page, BASE + p);
      await scan(page, `visitor ${p}`, width);
    }
    await go(page, `${BASE}/instrumentos/demo-comprador-telecaster`);
    await page.getByRole("button", { name: "Encuentro seguro" }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByLabel("Lugar", { exact: true }).selectOption({ index: 1 });
    await scan(page, "visitor meetup sheet", width);
    await page.keyboard.press("Escape");
    await go(page, `${BASE}/instrumentos/demo-particular-squier-bullet`);
    await page.locator("#vendedor summary", { hasText: "Vendedor destacado" }).first().click().catch(() => {});
    await scan(page, "visitor seller level open", width);
    await context.close();

    [context, page] = await ctx();
    await login(page, "demo-tienda@laria.test");
    await go(page, `${BASE}/mi-cuenta/tienda`);
    await scan(page, "store /mi-cuenta/tienda", width);
    await go(page, `${BASE}/mi-cuenta/tienda/inventario/mostrador`);
    await page.getByLabel("Código, SKU o nombre").fill("DAD-EXL110");
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /^Registrar venta/ }).click();
    await page.getByRole("button", { name: "Mostrar código al cliente" }).waitFor({ timeout: 20000 });
    await scan(page, "store mostrador offer", width);
    await page.getByRole("button", { name: "Mostrar código al cliente" }).click();
    await page.getByRole("img", { name: "Código QR para confirmar la compra" }).waitFor({ timeout: 20000 });
    const claimPath = new URL(await page.getByLabel("Enlace para confirmar la compra").inputValue()).pathname;
    await scan(page, "store mostrador QR sheet", width);
    await context.close();

    [context, page] = await ctx();
    await go(page, BASE + claimPath);
    await scan(page, "visitor claim signed out", width);
    await login(page, "comprador@laria.test");
    await go(page, BASE + claimPath);
    await scan(page, "buyer claim signed in", width);
    await go(page, `${BASE}/mi-cuenta/transacciones`);
    await scan(page, "buyer /mi-cuenta/transacciones", width);
    const counter = await page.locator("a", { hasText: "Reseñar" }).first().getAttribute("href");
    if (counter) { await go(page, BASE + counter); await scan(page, "buyer counter purchase detail", width); }
    await go(page, `${BASE}/mi-cuenta/transacciones/d8200000-0000-4000-8000-000000000003`);
    await scan(page, "buyer closed purchase with photo", width);
    await go(page, `${BASE}/instrumentos/demo-particular-squier-bullet`);
    await scan(page, "buyer listing with track chip", width);
    await context.close();

    [context, page] = await ctx();
    await login(page, "particular@laria.test");
    await go(page, `${BASE}/mi-cuenta/transacciones`);
    await scan(page, "seller /mi-cuenta/transacciones", width);
    await go(page, `${BASE}/instrumentos/demo-boss-ds-1`);
    const chip = page.getByRole("button", { name: "Incluir mi historial de comprador" });
    if (await chip.count()) { await chip.click(); await page.waitForTimeout(400); await scan(page, "seller track consent sheet", width); }
    await context.close();

    [context, page] = await ctx();
    await login(page, "admin@laria.test", "/admin");
    for (const v of ["fotos&estado=pending", "fotos&estado=approved", "puntos", "tienda"]) {
      await go(page, `${BASE}/admin/confianza?vista=${v}`);
      await scan(page, `admin confianza ${v}`, width);
    }
    await context.close();
  }
  await browser.close();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(`${results.length} checks, ${results.filter((r) => r.violations.length).length} with violations`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
