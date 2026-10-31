// Feature ideas, store-reach batch (docs/feature-ideas/store-reach.md): screenshots at 390 px and 1366 px of every page
// the batch adds or changes, with axe-core (WCAG 2.0 to 2.2, A and AA) on each, against the local prototype with
// scripts/prototype/demo-seed.sql and store-reach-seed.sql loaded. Local only.
//
//   node scripts/prototype/store-reach-screens.cjs <out-dir>
//
// BASE (default http://localhost:3000), CHROMIUM (default /opt/pw-browsers/chromium) and AXE can be set, as in
// a11y-audit.cjs. playwright-core (or playwright) must be resolvable.
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  ({ chromium } = require("playwright"));
}
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE || "http://localhost:3000";
const CHROMIUM = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const OUT = process.argv[2] || "/tmp/laria-prototype/store-reach";
const PASSWORD = "laria-demo-2026";
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const LIVE = "d7100000-0000-4000-8000-000000000001";
const UPCOMING = "d7100000-0000-4000-8000-000000000002";

function axePath() {
  if (process.env.AXE) return process.env.AXE;
  const store = path.join(__dirname, "..", "..", "node_modules", ".pnpm");
  const folder = fs.existsSync(store) ? fs.readdirSync(store).filter((name) => name.startsWith("axe-core@")).sort().pop() : null;
  if (!folder) throw new Error("axe-core not found; set AXE to axe.min.js");
  return path.join(store, folder, "node_modules", "axe-core", "axe.min.js");
}

// [file name, path, optional step before the shot]
const openMarks = async (page) => {
  for (const summary of await page.locator("details summary").all()) {
    const text = (await summary.textContent()) || "";
    if (/Semana de la música|Distribuidor/.test(text)) await summary.click();
  }
};
const SHOTS = {
  visitor: [
    ["campanas", "/campanas"],
    ["campana-publica", "/campanas/semana-de-la-musica"],
    ["listing-campana-distribuidor", "/instrumentos/demo-boss-ds-1", openMarks],
    ["tienda-publica", "/tiendas/laria-demo-musica"],
    ["catalogo", "/listados?category=pedals"],
  ],
  store: [
    ["mi-tienda", "/mi-cuenta/tienda", async (page) => page.getByText("Más alcance para tu tienda").scrollIntoViewIfNeeded()],
    ["lo-que-buscan", "/mi-cuenta/tienda/demanda"],
    ["catalogo-redes", "/mi-cuenta/tienda/catalogo-redes"],
    ["distribuidor", "/mi-cuenta/tienda/distribuidor"],
    ["tienda-campanas", "/mi-cuenta/tienda/campanas"],
    ["tienda-campana-en-curso", `/mi-cuenta/tienda/campanas/${LIVE}`],
    ["tienda-campana-proxima", `/mi-cuenta/tienda/campanas/${UPCOMING}`],
    ["mercado-libre", "/mi-cuenta/tienda/mercado-libre"],
  ],
  admin: [
    ["admin-campanas", "/admin/campanas"],
    ["admin-campana", `/admin/campanas/${LIVE}`],
    ["admin-distribuidores", "/admin/distribuidores"],
  ],
};
const ACCOUNTS = { store: "demo-tienda@laria.test", admin: "admin@laria.test" };
const WIDTHS = [[390, 844, true], [1366, 900, false]];

async function login(page, email) {
  await page.goto(`${BASE}/login?next=${encodeURIComponent("/mi-cuenta")}`, { waitUntil: "networkidle" });
  await page.getByLabel("Correo", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
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
      for (const [name, target, before] of shots) {
        const errors = [];
        const onConsole = (message) => { if (message.type() === "error") errors.push(message.text().slice(0, 300)); };
        const onError = (error) => errors.push(String(error).slice(0, 300));
        page.on("console", onConsole);
        page.on("pageerror", onError);
        let status = null;
        let axe = { violations: [] };
        try {
          const response = await page.goto(BASE + target, { waitUntil: "networkidle", timeout: 60000 });
          status = response ? response.status() : null;
          await page.waitForTimeout(400);
          if (before) await before(page);
          await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true });
          await page.addScriptTag({ path: AXE });
          axe = await page.evaluate(async (tags) => {
            const run = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
            return {
              violations: run.violations.map((rule) => ({
                id: rule.id, impact: rule.impact, help: rule.help, count: rule.nodes.length,
                nodes: rule.nodes.slice(0, 6).map((node) => ({ target: node.target.join(" "), html: node.html.slice(0, 220) })),
              })),
            };
          }, WCAG);
        } catch (error) {
          errors.push(`SHOT: ${String(error).slice(0, 300)}`);
        }
        page.off("console", onConsole);
        page.off("pageerror", onError);
        results.push({ role, width, name, path: target, status, finalUrl: page.url().replace(BASE, ""), errors, violations: axe.violations });
        const found = axe.violations.map((rule) => `${rule.id}(${rule.impact},${rule.count})`).join(" ");
        console.log(`${role} ${width} ${target} -> ${status} ${page.url().replace(BASE, "")} | ${found || "no violations"}${errors.length ? ` | errors ${errors.length}` : ""}`);
      }
      await context.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "a11y.json"), JSON.stringify(results, null, 2));
  const failing = results.filter((result) => result.violations.length || result.status !== 200).length;
  console.log(`${results.length} pages, ${failing} with violations or a status other than 200. Results in ${path.join(OUT, "a11y.json")}`);
})();
