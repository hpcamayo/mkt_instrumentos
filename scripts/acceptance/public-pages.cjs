#!/usr/bin/env node
// Launch audit A14: the release-gate cases about what visitors read and where they land, checked on the rendered pages
// (the visible text, never the source): the payment, escrow, shipping and guarantee limits (PUB-006, LEGAL-005,
// LEGAL-006), the out-of-scope guardrails (SCOPE-001 to SCOPE-006, SCOPE-008, PUB-007), category pages (SEO-006,
// SEO-007) and the sign-in redirects (LIST-001, AUTH-019). It only sends GET requests without a session, so it runs
// against production as safely as against the local stack:
//   node scripts/acceptance/public-pages.cjs https://laria.audio
// Prints "PASS <case> <what>" or "FAIL <case> <why>" per check and exits 1 if any failed.
const assert = require("node:assert/strict");
const {
  visibleText, sentencesWith, GUARANTEE, CHECKOUT, PAID_PROMOTION, SHIPPING_WORKFLOW, CHAT_FEATURE, CHAT_LINK,
} = require("../../tests/support/page-text.cjs");

const base = String(process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https?:\/\/[^/]+$/.test(base)) {
  console.error("Usage: node scripts/acceptance/public-pages.cjs <base url, for example https://laria.audio>");
  process.exit(2);
}

const CATEGORY_PAGES = ["guitarras", "bajos", "amplificadores", "audio", "cuerdas", "microfonos", "pedales", "percusion", "teclados", "vientos"];
const NO_PATHS = /href="\/(checkout|carrito|pago|pagar|envios|chat|mensajes|suscripcion|planes)(\/|"|\?)/i;
// A sentence about payments or escrow must deny it, or say that whoever claims it is lying: the safety tips' "Si
// alguien te dice que Laria cobra el pago… es un intento de estafa" and the Terms' "con el pretexto de que Laria cobra".
const DENIES = /\bno\b|\bni\b|intento de estafa|con el pretexto de que/i;

const results = [];
async function check(id, summary, run) {
  try {
    const detail = await run();
    const line = `PASS ${id} ${summary}${detail ? ` (${detail})` : ""}`;
    results.push(line);
    console.log(line);
  } catch (error) {
    const line = `FAIL ${id} ${summary}: ${error.message}`;
    results.push(line);
    console.log(line);
  }
}

async function get(path) {
  return fetch(`${base}${path}`, { redirect: "manual", headers: { "User-Agent": "LariaAcceptance/1.0 (launch audit A14; read-only)", Accept: "text/html" } });
}

const pageCache = new Map();
async function page(path) {
  if (!pageCache.has(path)) {
    pageCache.set(path, (async () => {
      const response = await get(path);
      assert.equal(response.status, 200, `${path} answered ${response.status}`);
      const html = await response.text();
      return { path, html, text: visibleText(html), headers: response.headers };
    })());
  }
  return pageCache.get(path);
}

function robots(html) {
  return /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i.exec(html)?.[1] ?? "";
}

function firstLink(html, pattern) {
  const found = [...html.matchAll(/href="(\/[^"#?]*)/g)].map((match) => match[1]).find((href) => pattern.test(href));
  return found ?? null;
}

(async () => {
  // Pages a visitor reaches without an account, including one listing and one store found the way a visitor would.
  const catalog = await page("/listados");
  const listingPath = firstLink(catalog.html, new RegExp(`^/instrumentos/(?!(${CATEGORY_PAGES.join("|")})$)[a-z0-9-]+$`));
  const stores = await page("/tiendas");
  const storePath = firstLink(stores.html, /^\/tiendas\/[a-z0-9-]+$/);
  const publicPaths = [
    "/", "/listados", "/tiendas", "/consejos-de-seguridad", "/terminos", "/privacidad", "/articulos-prohibidos",
    "/libro-de-reclamaciones", "/registro/vendedor", "/registro/tienda", "/registrar-tienda", "/login",
    ...CATEGORY_PAGES.map((slug) => `/instrumentos/${slug}`),
    ...(listingPath ? [listingPath] : []),
    ...(storePath ? [storePath] : []),
  ];
  const pages = [];
  for (const path of publicPaths) pages.push(await page(path));
  const pagesNote = `${pages.length} pages${listingPath ? `, listing ${listingPath}` : ", no listing found"}${storePath ? `, store ${storePath}` : ", no store found"}`;

  await check("PUB-006", "no public page claims that Laria processes or protects payments", () => {
    for (const { path, text } of pages) {
      assert.doesNotMatch(text, GUARANTEE, path);
      assert.doesNotMatch(text, CHECKOUT, path);
      const payment = sentencesWith(text, /\b(procesa|procesamos|cobra|cobramos|retiene|retenemos)\b[^.]{0,40}\b(pagos?|dinero)\b/i);
      for (const sentence of payment) assert.match(sentence, DENIES, `${path}: "${sentence}"`);
    }
    return pagesNote;
  });

  await check("LEGAL-005", "the safety and terms pages, and the listing page, say Laria doesn't process payments, hold money or ship", async () => {
    for (const path of ["/consejos-de-seguridad", "/terminos"]) {
      const { text } = await page(path);
      assert.match(text, /no procesa pagos/i, `${path}: payments`);
      assert.match(text, /escrow/i, `${path}: escrow`);
      assert.match(text, /no gestiona env[ií]os/i, `${path}: shipping`);
      for (const sentence of sentencesWith(text, /escrow/i)) assert.match(sentence, /\bno\b/i, `${path}: "${sentence}"`);
    }
    assert.ok(listingPath, "no listing to check");
    assert.match((await page(listingPath)).text, /Laria no procesa pagos/i, `${listingPath}: the line beside the contact button`);
    return `listing ${listingPath}`;
  });

  await check("LEGAL-006", "no page promises a guarantee on payment, delivery, condition or the sale", async () => {
    for (const { path, text } of pages) assert.doesNotMatch(text, GUARANTEE, path);
    for (const path of ["/consejos-de-seguridad", "/terminos"]) {
      const { text } = await page(path);
      assert.match(text, /no garantiza la autenticidad/i, path);
      assert.match(text, /no garantiza que una transacci[oó]n se concrete/i, path);
    }
    return pagesNote;
  });

  await check("SCOPE-001", "no checkout: no cart, pay or checkout step, and the listing's action opens WhatsApp", async () => {
    for (const { path, html, text } of pages) {
      assert.doesNotMatch(text, CHECKOUT, path);
      assert.doesNotMatch(html, NO_PATHS, path);
    }
    assert.ok(listingPath, "no listing to check");
    const listing = await page(listingPath);
    assert.match(listing.text, /Contactar por WhatsApp/, `${listingPath}: contact button`);
    for (const path of ["/checkout", "/carrito", "/pagar"]) assert.equal((await get(path)).status, 404, `${path} exists`);
    return `listing ${listingPath}`;
  });

  await check("SCOPE-002", "no escrow: every mention of escrow says Laria doesn't offer it", () => {
    let mentions = 0;
    for (const { path, text } of pages) {
      for (const sentence of sentencesWith(text, /escrow|custodia (el|tu) dinero|retenemos el pago/i)) {
        mentions += 1;
        assert.match(sentence, DENIES, `${path}: "${sentence}"`);
      }
    }
    return `${mentions} mentions, each denying it or warning against it`;
  });

  await check("SCOPE-003", "no shipping workflow: no shipping cost, courier or tracking step", () => {
    for (const { path, text } of pages) assert.doesNotMatch(text, SHIPPING_WORKFLOW, path);
    for (const { path, text } of pages) {
      for (const sentence of sentencesWith(text, /gestiona(mos)? (los )?env[ií]os/i)) assert.match(sentence, /\bno\b|\bni\b/i, `${path}: "${sentence}"`);
    }
  });

  await check("SCOPE-004", "no commission: the pages say Laria charges none, and no fee is shown", () => {
    const footer = pages.find(({ path }) => path === "/").text;
    assert.match(footer, /no cobra comisiones|no cobramos comisiones/i, "home footer");
    for (const { path, text } of pages) {
      for (const sentence of sentencesWith(text, /comisi[oó]n(es)?/i)) assert.match(sentence, /\bno\b|\bni\b|\bsin\b/i, `${path}: "${sentence}"`);
    }
  });

  await check("SCOPE-005", "no paid plan, subscription or boost is offered", () => {
    for (const { path, text } of pages) assert.doesNotMatch(text, PAID_PROMOTION, path);
  });

  await check("SCOPE-006", "no internal chat: contact goes to WhatsApp", async () => {
    for (const { path, text, html } of pages) {
      assert.doesNotMatch(text, CHAT_FEATURE, path);
      assert.doesNotMatch(html, CHAT_LINK, path);
    }
    if (storePath) assert.match((await page(storePath)).text, /WhatsApp/, `${storePath}: contact`);
  });

  await check("PUB-007", "no internal chat entry point among the primary actions", async () => {
    for (const path of ["/", ...(listingPath ? [listingPath] : [])]) {
      const { text, html } = await page(path);
      assert.doesNotMatch(text, CHAT_FEATURE, path);
      assert.doesNotMatch(html, CHAT_LINK, path);
    }
  });

  await check("SCOPE-008", "store verification is described as a manual review, never an automatic SUNAT check", async () => {
    for (const { path, text } of pages) {
      for (const sentence of sentencesWith(text, /SUNAT/)) assert.match(sentence, /\bno\b|a mano|manual/i, `${path}: "${sentence}"`);
      assert.doesNotMatch(text, /verificad[ao] autom[aá]ticamente/i, path);
    }
  });

  await check("SEO-006", "category pages answer 200 with their own title and canonical, and index when they have listings", async () => {
    const indexed = [];
    for (const slug of CATEGORY_PAGES) {
      const { html, text, headers } = await page(`/instrumentos/${slug}`);
      assert.match(html, new RegExp(`<link rel="canonical" href="[^"]*/instrumentos/${slug}"`), `${slug}: canonical`);
      assert.match(html, /<title>[^<]+<\/title>/, `${slug}: title`);
      assert.doesNotMatch(headers.get("x-robots-tag") ?? "", /noindex/, `${slug}: X-Robots-Tag`);
      const cards = new Set([...html.matchAll(/href="(\/instrumentos\/[a-z0-9-]+)"/g)].map((match) => match[1]).filter((href) => !CATEGORY_PAGES.some((name) => href === `/instrumentos/${name}`)));
      if (cards.size) {
        assert.doesNotMatch(robots(html), /noindex/, `${slug}: has ${cards.size} listings but is noindex`);
        indexed.push(slug);
      } else {
        assert.ok(/noindex/.test(robots(html)) || /publica|listados/i.test(text), `${slug}: empty but neither noindex nor an empty state`);
      }
    }
    return `indexable with listings: ${indexed.join(", ") || "none"}`;
  });

  await check("SEO-007", "category pages show real listing cards or an empty state with real next steps, never keyword filler", async () => {
    for (const slug of CATEGORY_PAGES) {
      const { html, text } = await page(`/instrumentos/${slug}`);
      const cards = [...html.matchAll(/href="(\/instrumentos\/[a-z0-9-]+)"/g)].filter((match) => !CATEGORY_PAGES.some((name) => match[1] === `/instrumentos/${name}`));
      assert.ok(cards.length || /href="\/(listados|publicar|vender)/.test(html), `${slug}: no cards and no way on`);
      const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
      const counts = words.reduce((map, word) => map.set(word, (map.get(word) ?? 0) + 1), new Map());
      const name = slug.replace("microfonos", "micrófonos").replace("percusion", "percusión");
      assert.ok((counts.get(name) ?? 0) <= 40, `${slug}: "${name}" repeated ${counts.get(name)} times`);
    }
  });

  await check("LIST-001", "publishing without an account goes to sign-in and comes back", async () => {
    for (const path of ["/vender", "/mi-cuenta/publicar"]) {
      const response = await get(path);
      assert.ok([302, 303, 307, 308].includes(response.status), `${path} answered ${response.status}`);
      const location = new URL(response.headers.get("location"), base);
      assert.equal(location.origin, new URL(base).origin, `${path}: off-site redirect`);
      assert.equal(location.pathname, "/login", `${path} went to ${location.pathname}`);
      assert.equal(location.searchParams.get("next"), path, `${path}: return path`);
    }
  });

  await check("AUTH-019", "an account page without a session goes to sign-in with a safe return path", async () => {
    for (const path of ["/mi-cuenta/publicaciones", "/mi-cuenta/favoritos?vista=lista"]) {
      const response = await get(path);
      assert.ok([302, 303, 307, 308].includes(response.status), `${path} answered ${response.status}`);
      const location = new URL(response.headers.get("location"), base);
      assert.equal(location.origin, new URL(base).origin, `${path}: off-site redirect`);
      assert.equal(location.pathname, "/login");
      assert.equal(location.searchParams.get("next"), path);
    }
  });

  const failed = results.filter((line) => line.startsWith("FAIL"));
  console.log(`${results.length - failed.length} of ${results.length} public-page checks passed on ${base}`);
  process.exitCode = failed.length ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
