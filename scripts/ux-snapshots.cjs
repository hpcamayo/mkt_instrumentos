#!/usr/bin/env node
// UX screenshot harness (docs/ux-redesign/ux-1-foundations.md, decision D10).
// Captures a fixed route list at 390 / 768 / 1280 / 1440 with the agent-browser CLI, anonymous and signed in
// with local test accounts. Local by default; pass --allow-remote for a preview deployment.
//
//   node scripts/ux-snapshots.cjs --label before
//   node scripts/ux-snapshots.cjs --label after --only public --widths 390,1440
//
// Options:
//   --base <url>          App origin (default http://localhost:3000)
//   --label <name>        Output folder name under .ux-snapshots/ (default: a timestamp)
//   --only <groups>       Comma list of public, particular, store, admin (default: all)
//   --widths <list>       Comma list of viewport widths (default 390,768,1280,1440)
//   --routes <names>      Comma list of route names to capture (default: every route in the chosen groups)
//   --allow-remote        Allow a non-local base URL (preview deployments)
// Accounts: .ux-accounts.local.json (gitignored) or LARIA_UX_ACCOUNTS=<path>, shaped as
//   { "particular": { "email": "...", "password": "..." }, "store": { ... }, "admin": { ... } }
// Browser: agent-browser on PATH, or LARIA_AGENT_BROWSER_BIN. Output: .ux-snapshots/<label>/<width>/<group>-<route>.png
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
}
const base = option("base", "http://localhost:3000").replace(/\/$/, "");
const label = option("label", new Date().toISOString().replace(/[:.]/g, "-"));
const groups = option("only", "public,particular,store,admin").split(",");
const widths = option("widths", "390,768,1280,1440").split(",").map(Number);
const onlyRoutes = option("routes", "") ? option("routes", "").split(",") : null;
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (!localHosts.has(new URL(base).hostname) && !args.includes("--allow-remote")) {
  throw new Error(`Refusing to capture ${base}: pass --allow-remote for a preview deployment.`);
}

const browser = process.env.LARIA_AGENT_BROWSER_BIN ?? "agent-browser";
const out = path.join(process.cwd(), ".ux-snapshots", label);

function run(session, ...command) {
  const result = spawnSync(browser, ["--session", session, "--json", ...command], {
    encoding: "utf8",
    timeout: 90000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: "45000" },
  });
  if (result.status !== 0) throw new Error(`agent-browser ${command[0]} failed: ${result.error?.message || result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout.trim().split("\n").pop());
  if (!parsed.success) throw new Error(parsed.error ?? `agent-browser ${command[0]} failed`);
  return parsed.data;
}

// Public URLs that depend on data come from the sitemap: the first listing and the first store.
async function discover() {
  const response = await fetch(`${base}/sitemap.xml`);
  const xml = await response.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  const categories = new Set(["guitarras", "bajos", "baterias", "platillos", "microfonos", "pedales", "amplificadores", "interfaces-de-audio"]);
  const listing = urls.find((url) => url.startsWith("/instrumentos/") && !categories.has(url.split("/")[2]));
  const store = urls.find((url) => url.startsWith("/tiendas/"));
  return { listing, store };
}

function routeList({ listing, store }) {
  return {
    public: [
      ["inicio", "/"],
      ["catalogo", "/listados"],
      ["categoria", "/instrumentos/guitarras"],
      ...(listing ? [["publicacion", listing]] : []),
      ...(store ? [["tienda", store]] : []),
      ["login", "/login"],
      ["registro-particular", "/registro/vendedor"],
      ["registro-tienda", "/registro/tienda"],
      ["terminos", "/terminos"],
      ["seguridad", "/consejos-de-seguridad"],
      ["no-encontrada", "/pagina-que-no-existe"],
    ],
    // Each signed-in group also opens the catalog, so the signed-in header is captured on a public page (UX-2).
    particular: [
      ["catalogo", "/listados"],
      ...(listing ? [["publicacion", listing]] : []),
      ["resumen", "/mi-cuenta"],
      ["publicaciones", "/mi-cuenta/publicaciones"],
      ["publicar", "/mi-cuenta/publicar"],
      ["favoritos", "/mi-cuenta/favoritos"],
      ["alertas", "/mi-cuenta/alertas"],
      ["notificaciones", "/mi-cuenta/notificaciones"],
      ["perfil", "/mi-cuenta/perfil"],
      ["transacciones", "/mi-cuenta/transacciones"],
    ],
    store: [
      ["catalogo", "/listados"],
      ["resumen", "/mi-cuenta"],
      ["tienda", "/mi-cuenta/tienda"],
      ["inventario", "/mi-cuenta/tienda/inventario"],
      ["publicar", "/mi-cuenta/tienda/publicar"],
      ["estadisticas", "/mi-cuenta/tienda/estadisticas"],
    ],
    admin: [
      ["catalogo", "/listados"],
      ["inicio", "/admin"],
      ["publicaciones", "/admin/publicaciones"],
      ["revisiones", "/admin/revisiones"],
      ["tiendas", "/admin/tiendas"],
      ["reportes", "/admin/reportes"],
    ],
  };
}

function accounts() {
  const file = process.env.LARIA_UX_ACCOUNTS ?? path.join(process.cwd(), ".ux-accounts.local.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

function signIn(session, account) {
  run(session, "open", `${base}/login`);
  const status = run(session, "eval", `fetch('/api/auth/login', { method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(${JSON.stringify({ email: account.email, password: account.password })}) }).then((r) => r.status)`).result;
  if (status !== 200) throw new Error(`Sign-in failed for ${account.email} (HTTP ${status}).`);
}

(async () => {
  const routes = routeList(await discover());
  const credentials = accounts();
  const done = [];
  for (const group of groups) {
    const list = routes[group].filter(([name]) => !onlyRoutes || onlyRoutes.includes(name));
    if (!list.length) continue;
    const session = `laria-ux-${group}-${process.pid}`;
    try {
      if (group !== "public") {
        if (!credentials[group]) { console.warn(`Skipping ${group}: no account in .ux-accounts.local.json`); continue; }
        signIn(session, credentials[group]);
      }
      for (const width of widths) {
        fs.mkdirSync(path.join(out, String(width)), { recursive: true });
        run(session, "set", "viewport", String(width), "900");
        for (const [name, url] of list) {
          const file = path.join(out, String(width), `${group}-${name}.png`);
          run(session, "open", `${base}${url}`);
          run(session, "wait", "--load", "networkidle");
          run(session, "wait", "500");
          run(session, "screenshot", "--full", file);
          done.push(path.relative(process.cwd(), file));
        }
      }
    } finally {
      spawnSync(browser, ["--session", session, "close"], { encoding: "utf8" });
    }
  }
  console.log(`${done.length} screenshots in ${path.relative(process.cwd(), out)}`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
