// Feature ideas, store-locations batch (run-02 sedes, run-03 boleta, docs/feature-ideas/store-locations.md):
// screenshots and axe-core of the Sedes, Mostrador, Comprobantes, SKU, listing and store pages at 390 px and 1366 px,
// with the demo data from scripts/prototype/store-locations-seed.sql. Local prototype only (scripts/prototype/README.md).
// Nothing here reaches Nubefact: the shots stop before "Registrar venta".
//
//   node scripts/prototype/store-locations-screens.cjs [out-dir]
//
// BASE (default http://localhost:3000), CHROMIUM (default /opt/pw-browsers/chromium) and AXE (axe.min.js; found in
// node_modules/.pnpm by default) can be set. playwright or playwright-core must be resolvable.
const fs = require("node:fs");
const path = require("node:path");

function loadPlaywright() {
  try { return require("playwright"); } catch { return require("playwright-core"); }
}
const { chromium } = loadPlaywright();

const BASE = process.env.BASE || "http://localhost:3000";
const CHROMIUM = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const OUT = process.argv[2] || "/tmp/laria-prototype/store-locations-screens";
const PASSWORD = "laria-demo-2026";
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function axePath() {
  if (process.env.AXE) return process.env.AXE;
  const store = path.join(__dirname, "..", "..", "node_modules", ".pnpm");
  const folder = fs.existsSync(store) ? fs.readdirSync(store).filter((name) => name.startsWith("axe-core@")).sort().pop() : null;
  if (!folder) throw new Error("axe-core not found; set AXE to axe.min.js");
  return path.join(store, folder, "node_modules", "axe-core", "axe.min.js");
}

// [name, path, optional step that opens a state before the shot]
async function addToSale(page, sku) {
  await page.getByLabel("Código, SKU o nombre").fill(sku);
  await page.getByRole("button", { name: "Agregar", exact: true }).first().click();
  await page.waitForTimeout(400);
}
const SHOTS = {
  visitor: [
    ["listing-two-sedes", "/instrumentos/demo-boss-ds-1"],
    ["store-page-sedes", "/tiendas/laria-demo-musica"],
  ],
  store: [
    ["sedes", "/mi-cuenta/tienda/sedes"],
    ["sede-new", "/mi-cuenta/tienda/sedes", async (page) => { await page.getByRole("button", { name: /Agregar sede/ }).first().click(); }],
    ["store-summary", "/mi-cuenta/tienda"],
    ["inventory", "/mi-cuenta/tienda/inventario"],
    ["sku-by-sede", "/mi-cuenta/tienda/inventario", async (page) => {
      await page.getByRole("link", { name: /Boss DS-1 Distortion/ }).first().click();
      await page.waitForURL(/inventario\/[0-9a-f-]{36}/, { timeout: 20000 });
      await page.waitForTimeout(1200);
    }],
    ["sku-transfer", "/mi-cuenta/tienda/inventario", async (page) => {
      await page.getByRole("link", { name: /Boss DS-1 Distortion/ }).first().click();
      await page.waitForURL(/inventario\/[0-9a-f-]{36}/, { timeout: 20000 });
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Mover entre sedes" }).click();
    }],
    ["counter-sede", "/mi-cuenta/tienda/inventario/mostrador", async (page) => { await addToSale(page, "BOSS-DS1"); }],
    ["counter-boleta", "/mi-cuenta/tienda/inventario/mostrador", async (page) => {
      await addToSale(page, "SHU-SM58");
      await page.getByLabel("Boleta", { exact: true }).check();
      await page.getByLabel("Documento del cliente").selectOption("dni");
    }],
    ["counter-factura", "/mi-cuenta/tienda/inventario/mostrador", async (page) => {
      await addToSale(page, "FEN-PLSTRAT-3TS");
      await page.getByLabel("Factura", { exact: true }).check();
    }],
    ["receipts", "/mi-cuenta/tienda/comprobantes"],
    ["receipts-void", "/mi-cuenta/tienda/comprobantes", async (page) => { await page.getByRole("button", { name: "Anular" }).first().click(); }],
  ],
};
const ACCOUNTS = { store: "demo-tienda@laria.test" };
const WIDTHS = [[390, 844, true], [1366, 900, false]];

async function login(page, email) {
  await page.goto(`${BASE}/login?next=${encodeURIComponent("/mi-cuenta")}`, { waitUntil: "networkidle" });
  await page.getByLabel("Correo", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/mi-cuenta"), { timeout: 20000 });
}

(async () => {
  const AXE = axePath();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--headless=new"] });
  const results = [];
  for (const [role, shots] of Object.entries(SHOTS)) {
    for (const [width, height, phone] of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, locale: "es-PE" });
      const page = await context.newPage();
      if (ACCOUNTS[role]) await login(page, ACCOUNTS[role]);
      for (const [name, target, step] of shots) {
        const errors = [];
        const onConsole = (message) => { if (message.type() === "error") errors.push(message.text().slice(0, 300)); };
        const onError = (error) => errors.push(String(error).slice(0, 300));
        page.on("console", onConsole);
        page.on("pageerror", onError);
        let status = null;
        let violations = [];
        try {
          // "load", not "networkidle": the background keepalive event posts never report as finished in headless
          // Chromium, on listing pages too.
          const response = await page.goto(BASE + target, { waitUntil: "load", timeout: 30000 });
          status = response ? response.status() : null;
          await page.waitForTimeout(1500);
          if (step) {
            await step(page);
            await page.waitForTimeout(500);
          }
          await page.addScriptTag({ path: AXE });
          violations = await page.evaluate(async (tags) => {
            const run = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
            return run.violations.map((rule) => ({ id: rule.id, impact: rule.impact, count: rule.nodes.length, nodes: rule.nodes.slice(0, 4).map((node) => node.target.join(" ")) }));
          }, WCAG);
          await page.screenshot({ path: path.join(OUT, `${role}-${name}-${width}.png`), fullPage: true });
        } catch (error) {
          errors.push(`SHOT: ${String(error).slice(0, 300)}`);
        }
        page.off("console", onConsole);
        page.off("pageerror", onError);
        results.push({ role, width, name, path: target, status, violations, errors });
        const found = violations.map((rule) => `${rule.id}(${rule.impact},${rule.count})`).join(" ");
        console.log(`${role} ${width} ${name} ${target} -> ${status}${found ? ` | ${found}` : ""}${errors.length ? ` | errors ${errors.length}` : ""}`);
      }
      await context.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const failing = results.filter((result) => result.violations.length || result.errors.length).length;
  console.log(`${results.length} checks, ${failing} with violations or errors. Results in ${path.join(OUT, "results.json")}`);
})();
