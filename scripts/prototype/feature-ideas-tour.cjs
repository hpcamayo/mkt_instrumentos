// Feature ideas (docs/feature-ideas/build-plan.md): one screenshot tour of the combined build, for Henri's review.
// Every new or changed screen of the nine batches, as the role that sees it, at 390 px (and 1366 px for the pages that
// lay out differently on a computer), against the local prototype with every seed loaded
// (`bash scripts/prototype/start-docker-free.sh seed`). Writes JPEGs and manifest.json. Local only.
//
//   node scripts/prototype/feature-ideas-tour.cjs <out-dir>
//
// BASE (default http://localhost:3000) and CHROMIUM (default /opt/pw-browsers/chromium) can be set, as in
// a11y-audit.cjs. playwright-core (or playwright) must be resolvable.
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  ({ chromium } = require("playwright"));
}
const fs = require("node:fs");
const path = require("node:path");
const twoStep = require("./two-step.cjs");

const BASE = process.env.BASE || "http://localhost:3000";
const CHROMIUM = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const OUT = process.argv[2] || "/tmp/laria-prototype/feature-ideas-tour";
const PASSWORD = "laria-demo-2026";
const SQUIER = "d5000000-0000-4000-8000-000000000001";

// [idea ids, title, path, desktop too]
const TOUR = {
  visitor: [
    [["buy-08"], "Catálogo en mapa", "/listados?vista=mapa", true],
    [["sell-06", "sell-07", "buy-02"], "Publicación de un Particular: entrega, parte de pago y combo", "/instrumentos/demo-particular-squier-bullet", true],
    [["reach-09", "buy-07", "buy-09", "run-02"], "Publicación de tienda: garantía, prueba, cuotas y sedes", "/instrumentos/demo-fender-player-strat-3ts", true],
    [["reach-08"], "Por llegar en un instrumento agotado", "/instrumentos/demo-boss-tu-3", false],
    [["reach-04", "reach-05"], "Distribuidor oficial y campaña en una publicación", "/instrumentos/demo-boss-ds-1", false],
    [["safe-11"], "Historial en Laria", "/instrumentos/demo-comprador-telecaster", false],
    [["disc-04"], "Hecho a pedido en un Taller", "/instrumentos/demo-charango-wayra", false],
    [["run-02", "buy-08", "reach-04"], "Página de tienda: sedes, mapa y marcas", "/tiendas/laria-demo-musica", true],
    [["disc-04"], "Hecho en Perú", "/hecho-en-peru", true],
    [["disc-04"], "Página de un Taller", "/tiendas/taller-wayra", false],
    // The seller page's address ends in a random code each seed; "seller:" opens the one the Squier links to.
    [["sell-09", "sell-08"], "Página de quien vende, con Vendedor destacado", "seller:/instrumentos/demo-particular-squier-bullet", true],
    [["safe-07"], "Comprador con historial", "/comprador/a1b2c3d4e5f60718293a4b5c", false],
    [["disc-02"], "Guías de compra", "/guias", false],
    [["disc-02"], "Una guía", "/guias/que-revisar-en-una-guitarra-usada", false],
    [["disc-03"], "Buscador de regalos", "/regalos", true],
    [["buy-05"], "Colección", "/colecciones/andino", false],
    [["disc-05"], "Artistas verificados", "/artistas", false],
    [["reach-05"], "Campañas Laria", "/campanas", false],
    [["reach-05"], "Una campaña", "/campanas/semana-de-la-musica", true],
    [["bet-02"], "Servicios para músicos", "/servicios", true],
    [["bet-02"], "Un servicio", "/servicios/clases/clases-de-guitarra-y-canto-para-todas-las-edades-d70000", false],
    [["safe-10"], "Centro de ayuda", "/ayuda", true],
    [["safe-10"], "Un artículo de ayuda", "/ayuda/pagar-y-recibir", false],
    [["sell-10", "reach-09", "buy-09"], "Filtros: condición, Con garantía y Acepta cuotas", "/listados?opciones=con-garantia", false],
    [["buy-11", "safe-08"], "Ingreso: Mantener sesión iniciada", "/login", false],
  ],
  buyer: [
    [["buy-07"], "Mis pruebas", "/mi-cuenta/pruebas", false],
    [["safe-07", "safe-11"], "Compras y ventas de quien compra", "/mi-cuenta/transacciones", false],
    [["safe-02"], "Reportar un robo", "/reportar-robo", false],
    [["sell-05"], "Oferta para ti en una publicación guardada", "/instrumentos/demo-particular-squier-bullet", false],
  ],
  seller: [
    [["sell-01"], "Mi equipo", "/mi-cuenta/equipo", true],
    [["sell-01"], "Agregar a Mi equipo", "/mi-cuenta/equipo/nuevo", false],
    [["sell-02"], "Pedir ofertas a tiendas", "/mi-cuenta/equipo/ofertas/nueva", false],
    [["run-04"], "Parte de pago", "/mi-cuenta/equipo/parte-de-pago", false],
    [["sell-04", "sell-05"], "Herramientas de venta de una publicación", `/mi-cuenta/publicaciones/${SQUIER}/herramientas`, true],
    [["sell-08", "sell-09"], "Compras y ventas de quien vende, con su nivel", "/mi-cuenta/transacciones", false],
    [["safe-08"], "Seguridad: dos pasos y dispositivos", "/mi-cuenta/seguridad", true],
    [["safe-09"], "Tus datos", "/mi-cuenta/datos", false],
    [["bet-02"], "Mis servicios", "/mi-cuenta/servicios", false],
    [["sell-10", "sell-06", "sell-07"], "Publicar: condición y entrega", "/vender", false],
  ],
  store: [
    [["reach-01", "reach-02", "reach-04", "reach-05", "reach-06", "buy-07", "buy-08"], "Mi tienda", "/mi-cuenta/tienda", true],
    [["reach-09"], "Garantía y cambios", "/mi-cuenta/tienda/garantia", false],
    [["buy-07"], "Pruebas", "/mi-cuenta/tienda/pruebas", true],
    [["reach-10"], "Etiquetas de precio", "/mi-cuenta/tienda/etiquetas", true],
    [["reach-10"], "Cartel Encuéntranos en Laria", "/mi-cuenta/tienda/etiquetas/cartel", false],
    [["sell-02", "sell-03", "run-04"], "Ofertas de la tienda", "/mi-cuenta/tienda/ofertas", true],
    [["reach-11", "run-02", "run-03"], "Mostrador: sede, comprobante y código de compra", "/mi-cuenta/tienda/inventario/mostrador", true],
    [["run-02"], "Sedes", "/mi-cuenta/tienda/sedes", true],
    [["run-03"], "Comprobantes", "/mi-cuenta/tienda/comprobantes", true],
    [["reach-01"], "Importar desde Mercado Libre", "/mi-cuenta/tienda/mercado-libre", false],
    [["reach-02"], "Catálogo para redes", "/mi-cuenta/tienda/catalogo-redes", false],
    [["reach-04"], "Distribuidor oficial", "/mi-cuenta/tienda/distribuidor", false],
    [["reach-05"], "Campañas de la tienda", "/mi-cuenta/tienda/campanas", false],
    [["reach-06"], "Lo que buscan en Laria", "/mi-cuenta/tienda/demanda", true],
    [["reach-08"], "Inventario: agotados con fecha de llegada", "/mi-cuenta/tienda/inventario?stock=out", true],
  ],
  admin: [
    [["safe-02"], "Admin: equipos reportados", "/admin/equipos-reportados", true],
    [["safe-05"], "Admin: fotos repetidas", "/admin/fotos-repetidas", true],
    [["safe-10"], "Admin: ayuda", "/admin/ayuda", false],
    [["safe-06", "safe-03", "reach-11"], "Admin: confianza", "/admin/confianza", true],
    [["reach-05"], "Admin: campañas", "/admin/campanas", false],
    [["reach-04"], "Admin: distribuidores", "/admin/distribuidores", false],
    [["buy-05"], "Admin: colecciones", "/admin/colecciones", false],
    [["disc-04"], "Admin: fabricantes y talleres", "/admin/fabricantes", false],
    [["disc-05"], "Admin: artistas verificados", "/admin/artistas", false],
    [["bet-02"], "Admin: servicios", "/admin/servicios", false],
  ],
};
const ACCOUNTS = { buyer: "comprador@laria.test", seller: "particular@laria.test", store: "demo-tienda@laria.test", admin: "admin@laria.test" };
const ROLE_LABEL = { visitor: "Visitante", buyer: "Comprador", seller: "Particular", store: "Tienda", admin: "Admin" };

async function login(page, email) {
  await page.goto(`${BASE}/login?next=${encodeURIComponent("/mi-cuenta")}`, { waitUntil: "networkidle" });
  await page.getByLabel("Correo", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  // Accounts batch (safe-08): the code step when the app is on, and the app turned on where it is required.
  await twoStep.answer(page, email);
  if (email.startsWith("demo-tienda@") || email.startsWith("admin@")) await twoStep.enable(page, BASE, email);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--headless=new"] });
  const manifest = [];
  for (const [role, stops] of Object.entries(TOUR)) {
    for (const [width, height, phone] of [[390, 844, true], [1366, 900, false]]) {
      const todo = stops.filter((stop) => phone || stop[3]);
      if (!todo.length) continue;
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, locale: "es-PE", deviceScaleFactor: 1 });
      // The demo seed's photos are placehold.co links; a neutral picture with their text stands in when that host is
      // out of reach (cloud sessions), so the shots don't show broken images.
      await context.route("https://placehold.co/**", (route) => {
        const text = new URL(route.request().url()).searchParams.get("text") || "Foto";
        const label = text.replace(/[<>&"]/g, " ").slice(0, 40);
        route.fulfill({
          contentType: "image/svg+xml",
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700" viewBox="0 0 900 700"><rect width="900" height="700" fill="#e9e6df"/><text x="450" y="360" font-family="Arial, sans-serif" font-size="40" fill="#6b6760" text-anchor="middle">${label}</text></svg>`,
        });
      });
      const page = await context.newPage();
      if (ACCOUNTS[role]) await login(page, ACCOUNTS[role]);
      for (const [ideas, title, target] of todo) {
        const file = `${role}-${String(stops.indexOf(stops.find((stop) => stop[2] === target && stop[1] === title)) + 1).padStart(2, "0")}-${width}.jpg`;
        let status = null;
        let finalPath = target;
        try {
          let address = target;
          if (target.startsWith("seller:")) {
            await page.goto(`${BASE}${target.slice(7)}`, { waitUntil: "load", timeout: 45000 });
            address = await page.locator('a[href^="/vendedores/"]').first().getAttribute("href");
          }
          const response = await page.goto(`${BASE}${address}`, { waitUntil: "load", timeout: 45000 });
          await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          status = response?.status() ?? null;
          await page.waitForTimeout(target.includes("vista=mapa") ? 2500 : 400);
          finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
          await page.screenshot({ path: path.join(OUT, file), fullPage: true, type: "jpeg", quality: 62 });
        } catch (error) {
          console.error(`FAIL ${role} ${target}: ${error.message.split("\n")[0]}`);
        }
        manifest.push({ role, roleLabel: ROLE_LABEL[role], ideas, title, path: target, finalPath, width, status, file });
        console.log(`${status ?? "ERR"} ${role} ${width} ${target}${finalPath !== target ? ` -> ${finalPath}` : ""}`);
      }
      await context.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
