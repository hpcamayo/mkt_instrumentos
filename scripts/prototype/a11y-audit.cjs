// Effortless Laria fast-04 (docs/ux-effortless/speed.md): axe-core on every page a visitor, a buyer, a Particular seller
// and a store owner reach with the demo accounts, at 390 px and 1366 px. WCAG 2.0 to 2.2, A and AA, which includes
// target size. It also records each page's HTTP status, console errors and page errors, so it doubles as a smoke crawl.
// Local prototype only (scripts/prototype/README.md § Accessibility checks).
//
//   node scripts/prototype/a11y-audit.cjs [out.json] [visitor|buyer|seller|store]
//
// BASE (default http://localhost:3000), CHROMIUM (default /opt/pw-browsers/chromium) and AXE (axe.min.js; found in
// node_modules/.pnpm by default) can be set in the environment. playwright-core must be resolvable (NODE_PATH).
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE || "http://localhost:3000";
const CHROMIUM = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const OUT = process.argv[2] || "/tmp/laria-prototype/a11y.json";
const ONLY = process.argv[3] || null;
const PASSWORD = "laria-demo-2026";
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function axePath() {
  if (process.env.AXE) return process.env.AXE;
  const store = path.join(__dirname, "..", "..", "node_modules", ".pnpm");
  const folder = fs.existsSync(store) ? fs.readdirSync(store).filter((name) => name.startsWith("axe-core@")).sort().pop() : null;
  if (!folder) throw new Error("axe-core not found; set AXE to axe.min.js");
  return path.join(store, folder, "node_modules", "axe-core", "axe.min.js");
}

// Fixed ids come from scripts/prototype/demo-seed.sql and ux-my-listings-seed.sql; SKU pages are found on the
// inventory page, because their ids are generated when the seed runs.
const PAGES = {
  visitor: [
    "/", "/listados", "/listados?q=guitarra", "/listados?category=guitars", "/instrumentos/demo-boss-ds-1",
    "/instrumentos/demo-boss-tu-3", "/instrumentos/guitarra-electrica-squier-stratocaster-usada-lima", "/tiendas",
    "/tiendas?vista=publicaciones", "/tiendas/laria-demo-musica", "/favoritos", "/comparar", "/login",
    "/registro/vendedor", "/registrar-tienda", "/recuperar-contrasena", "/vender", "/compartir",
    "/libro-de-reclamaciones", "/consejos-de-seguridad", "/articulos-prohibidos", "/terminos", "/privacidad",
    "/no-existe-esta-pagina",
  ],
  buyer: [
    "/mi-cuenta", "/mi-cuenta/favoritos", "/mi-cuenta/favoritos/d2000000-0000-4000-8000-000000000001",
    "/mi-cuenta/alertas", "/mi-cuenta/notificaciones", "/mi-cuenta/transacciones", "/mi-cuenta/perfil",
    "/mi-cuenta/seguridad", "/mi-cuenta/correos", "/instrumentos/demo-particular-squier-bullet",
  ],
  seller: [
    "/mi-cuenta", "/mi-cuenta/publicaciones", "/mi-cuenta/publicar", "/mi-cuenta/estadisticas",
    "/mi-cuenta/publicaciones/d5000000-0000-4000-8000-000000000002/editar",
    "/mi-cuenta/publicaciones/d5000000-0000-4000-8000-000000000001/vista-previa",
  ],
  store: [
    "/mi-cuenta", "/mi-cuenta/tienda", "/mi-cuenta/tienda/inventario", "/mi-cuenta/tienda/inventario?stock=low",
    "sku:0", "sku:1", "/mi-cuenta/tienda/inventario/mostrador", "/mi-cuenta/tienda/inventario/reponer",
    "/mi-cuenta/tienda/inventario/precios", "/mi-cuenta/tienda/inventario/importar", "/mi-cuenta/tienda/solicitudes",
    "/mi-cuenta/tienda/publicar", "/mi-cuenta/tienda/valores-por-defecto", "/mi-cuenta/tienda/medios-de-pago",
    "/mi-cuenta/tienda/pagos", "/mi-cuenta/tienda/estadisticas", "/mi-cuenta/publicaciones", "/tiendas/laria-demo-musica",
  ],
};
const ACCOUNTS = { buyer: "comprador@laria.test", seller: "particular@laria.test", store: "demo-tienda@laria.test" };
const WIDTHS = [[390, 844, true], [1366, 900, false]];

async function login(page, email) {
  await page.goto(`${BASE}/login?next=${encodeURIComponent("/mi-cuenta")}`, { waitUntil: "load" });
  await page.getByLabel("Correo", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/mi-cuenta"), { timeout: 20000 });
}

async function skuPages(page) {
  await page.goto(`${BASE}/mi-cuenta/tienda/inventario`, { waitUntil: "load" });
  const hrefs = await page.$$eval("a[href]", (links) => links.map((link) => link.getAttribute("href")));
  return [...new Set(hrefs.filter((href) => /^\/mi-cuenta\/tienda\/inventario\/[0-9a-f-]{36}$/.test(href ?? "")))];
}

(async () => {
  const AXE = axePath();
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--headless=new"] });
  const results = [];
  for (const [role, paths] of Object.entries(PAGES)) {
    if (ONLY && role !== ONLY) continue;
    for (const [width, height, phone] of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, locale: "es-PE" });
      const page = await context.newPage();
      if (ACCOUNTS[role]) await login(page, ACCOUNTS[role]);
      const skus = role === "store" ? await skuPages(page) : [];
      for (const entry of paths) {
        const target = entry.startsWith("sku:") ? skus[Number(entry.slice(4))] : entry;
        if (!target) {
          results.push({ role, width, path: entry, status: null, note: "no SKU page found", violations: [], incomplete: [] });
          continue;
        }
        const consoleErrors = [];
        const pageErrors = [];
        const onConsole = (message) => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300)); };
        const onError = (error) => pageErrors.push(String(error).slice(0, 300));
        page.on("console", onConsole);
        page.on("pageerror", onError);
        let status = null;
        let finalUrl = null;
        let axe = null;
        try {
          const response = await page.goto(BASE + target, { waitUntil: "load", timeout: 30000 });
          status = response ? response.status() : null;
          finalUrl = page.url().replace(BASE, "");
          await page.waitForTimeout(400);
          await page.addScriptTag({ path: AXE });
          axe = await page.evaluate(async (tags) => {
            const run = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations", "incomplete"] });
            const shape = (list) => list.map((rule) => ({
              id: rule.id,
              impact: rule.impact,
              help: rule.help,
              count: rule.nodes.length,
              nodes: rule.nodes.slice(0, 6).map((node) => ({ target: node.target.join(" "), html: node.html.slice(0, 220), summary: (node.failureSummary || "").slice(0, 300) })),
            }));
            return { violations: shape(run.violations), incomplete: shape(run.incomplete.filter((rule) => rule.id === "target-size" || rule.id === "color-contrast")) };
          }, WCAG);
        } catch (error) {
          pageErrors.push(`AUDIT: ${String(error).slice(0, 300)}`);
        }
        page.off("console", onConsole);
        page.off("pageerror", onError);
        results.push({ role, width, path: target, status, finalUrl, consoleErrors, pageErrors, ...(axe || { violations: [], incomplete: [] }) });
        const found = axe ? axe.violations.map((rule) => `${rule.id}(${rule.impact},${rule.count})`).join(" ") : "n/a";
        console.log(`${role} ${width} ${target} -> ${status} ${finalUrl} | ${found}${consoleErrors.length ? ` | console ${consoleErrors.length}` : ""}${pageErrors.length ? ` | errors ${pageErrors.length}` : ""}`);
      }
      await context.close();
    }
  }
  await browser.close();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const pages = results.length;
  const failing = results.filter((result) => result.violations.length).length;
  console.log(`${pages} page checks, ${failing} with violations. Results in ${OUT}`);
})();
