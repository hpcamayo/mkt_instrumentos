// Feature ideas, services batch (bet-02, docs/feature-ideas/services.md): screenshots and axe-core of every
// "Servicios para músicos" page and the states a tap opens, at 390 px and 1366 px, with the demo accounts from
// scripts/prototype/services-seed.sql. Local prototype only (scripts/prototype/README.md).
//
//   node scripts/prototype/services-screens.cjs [out-dir]
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
const OUT = process.argv[2] || "/tmp/laria-prototype/services-screens";
const PASSWORD = "laria-demo-2026";
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const LESSONS = "/servicios/clases/clases-de-guitarra-y-canto-para-todas-las-edades-d70000";
const REPAIRS = "/servicios/reparaciones/taller-de-lutheria-calibracion-y-reparacion-de-amplificadore-d70000";
const ROOM = "/servicios/salas-de-ensayo/sala-de-ensayo-con-bateria-y-backline-completo-d70000";

function axePath() {
  if (process.env.AXE) return process.env.AXE;
  const store = path.join(__dirname, "..", "..", "node_modules", ".pnpm");
  const folder = fs.existsSync(store) ? fs.readdirSync(store).filter((name) => name.startsWith("axe-core@")).sort().pop() : null;
  if (!folder) throw new Error("axe-core not found; set AXE to axe.min.js");
  return path.join(store, folder, "node_modules", "axe-core", "axe.min.js");
}

// [name, path, optional step that opens a state before the shot]
const SHOTS = {
  visitor: [
    ["directory", "/servicios"],
    ["category-lessons", "/servicios/clases?ciudad=Lima&modalidad=en_linea"],
    ["category-empty", "/servicios/sonido-para-eventos"],
    ["service-lessons", LESSONS],
    ["service-store", REPAIRS],
    ["service-room", ROOM],
    ["terms", "/terminos#servicios"],
    // The entry points from the instrument side: the home teaser, the home menu and the repair line on worn gear.
    ["home-teaser", "/"],
    ["home-menu", "/", async (page) => { await page.getByRole("button", { name: "Categorías" }).click(); }],
    ["listing-repair-line", "/instrumentos/demo-particular-zoom-g1"],
  ],
  buyer: [
    ["service-review-prompt", LESSONS],
    ["account-review-form", "/mi-cuenta/servicios", async (page) => { await page.getByRole("button", { name: "Dejar mi reseña" }).first().click(); }],
    ["service-report", ROOM, async (page) => { await page.getByRole("button", { name: "Reportar servicio" }).click(); }],
    ["account-services", "/mi-cuenta/servicios"],
  ],
  seller: [
    ["account-services", "/mi-cuenta/servicios"],
    ["confirm-client", "/mi-cuenta/servicios", async (page) => { await page.getByRole("button", { name: "Confirmar un cliente" }).first().click(); await page.waitForTimeout(800); }],
    ["new-chooser", "/mi-cuenta/servicios/nuevo"],
    ["new-form", "/mi-cuenta/servicios/nuevo?tipo=reparaciones"],
    ["new-form-errors", "/mi-cuenta/servicios/nuevo?tipo=reparaciones", async (page) => { await page.getByRole("button", { name: /Enviar a revisión|Guardar/ }).last().click(); }],
    ["edit-form", "/mi-cuenta/servicios/d7000000-0000-4000-8000-000000000001/editar"],
    ["preview-own", LESSONS],
  ],
  store: [
    ["account-services", "/mi-cuenta/servicios?guardado=cambios"],
  ],
  admin: [
    ["admin-pending", "/admin/servicios"],
    ["admin-changes", "/admin/servicios?vista=cambios"],
    ["admin-reports", "/admin/servicios?vista=reportes"],
    ["admin-reviews", "/admin/servicios?vista=resenas"],
    ["preview-pending", "/servicios/sonido-para-eventos/sonido-e-iluminacion-para-conciertos-y-eventos-d70000"],
  ],
};
const ACCOUNTS = { buyer: "comprador@laria.test", seller: "particular@laria.test", store: "demo-tienda@laria.test", admin: "admin@laria.test" };
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
