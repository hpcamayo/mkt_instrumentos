// Group B helpers (EASE-160..179, 200..228, 700..727): images, the lightbox, slow page changes, rolled-back SQL and
// e-mail links. Used by checks-b.cjs and its b-*.cjs parts; nothing here changes product code or shared data.
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const h = require("./harness.cjs");

const ROOT = path.resolve(__dirname, "..", "..", "..");

// Width and height of a PNG (IHDR).
function pngSize(buffer) {
  if (!buffer || buffer.length < 24 || buffer.toString("latin1", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// A GET from the test runner itself (paced when live), with the body as bytes.
async function fetchBinary(url, options = {}) {
  if (h.LIVE) await h.paceNavigation();
  const response = await fetch(url, { redirect: "manual", ...options });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, buffer };
}

// Keeps a fetched image beside the screenshots so it can be looked at.
function saveImage(t, label, buffer) {
  const file = path.join(h.OUT, `${t.id}-${label}.png`.replace(/[^A-Za-z0-9._-]+/g, "-"));
  fs.writeFileSync(file, buffer);
  t.record.shots.push(file);
  return file;
}

// Statements run in one session as postgres and rolled back. Lines the script prints as `ROW <json>` come back parsed.
function rolledBack(statements) {
  if (h.LIVE) throw new Error("rolledBack is local only");
  const file = path.join(os.tmpdir(), `ease-b-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(file, `\\set ON_ERROR_STOP 1\nbegin;\n${statements}\nrollback;\n`);
  try {
    const out = execFileSync("psql", [h.PG, "-At", "-q", "-f", file], { encoding: "utf8" });
    return out.split("\n").filter((line) => line.startsWith("ROW ")).map((line) => JSON.parse(line.slice(4)));
  } finally {
    fs.rmSync(file, { force: true });
  }
}

// The listing cards a catalog page shows: link, title and photo count.
async function catalogCards(page) {
  return page.locator("article").evaluateAll((articles) => articles.map((article) => {
    const link = article.querySelector("h2 a[href^='/instrumentos/'], h3 a[href^='/instrumentos/']");
    const badge = [...article.querySelectorAll("span")].map((span) => span.textContent || "").find((text) => /^\d+ fotos$/.test(text.trim()));
    return link ? { path: new URL(link.href).pathname, title: (link.textContent || "").trim(), photos: badge ? Number.parseInt(badge, 10) : 1 } : null;
  }).filter(Boolean));
}

// A public listing to work on: one made for the case locally, the first suitable card of the catalog when live.
async function publicListing(t, page, { photos = 1, seller, local = {} } = {}) {
  if (!t.live) {
    const owner = seller || t.account({ kind: "particular" });
    return { ...t.listing(owner, { photos: Math.max(photos, 1), ...local }), seller: owner };
  }
  await t.goto(page, "/listados?sort=newest");
  const card = (await catalogCards(page)).find((item) => item.photos >= photos);
  if (!card) t.skip(`live: no listing with ${photos}+ photos on the first catalog page`);
  return { path: card.path, slug: card.path.split("/").pop(), title: card.title };
}

// --- Lightbox -------------------------------------------------------------------------------------------------------

async function openLightbox(page, index = 1, total) {
  const name = total ? `Ampliar foto ${index} de ${total}` : new RegExp(`^Ampliar foto ${index} de \\d+$`);
  await page.getByRole("button", { name }).first().click();
  await page.locator("dialog.lightbox[open]").waitFor({ timeout: 20_000 });
  await photoLoaded(page);
}

async function photoLoaded(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector("dialog.lightbox .lightbox-photo img");
    return Boolean(image && image.complete && image.naturalWidth > 0);
  }, null, { timeout: 20_000 });
}

// The photo's transform, the stage, the fitted photo and how far it may move at its scale.
async function lightboxState(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector("dialog.lightbox");
    const layer = dialog?.querySelector(".lightbox-photo");
    const stage = dialog?.querySelector(".lightbox-stage")?.getBoundingClientRect();
    const image = layer?.querySelector("img");
    const match = /translate3d\(\s*([-\d.e]+)px,\s*([-\d.e]+)px,\s*0(?:px)?\)\s*scale\(([-\d.e]+)\)/.exec(layer?.style.transform || "");
    const zoom = match ? { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) } : null;
    let photo = null;
    if (stage && image?.naturalWidth) {
      const ratio = Math.min(stage.width / image.naturalWidth, stage.height / image.naturalHeight);
      photo = { width: image.naturalWidth * ratio, height: image.naturalHeight * ratio };
    }
    const bounds = zoom && photo && stage
      ? { maxX: Math.max(0, (photo.width * zoom.scale - stage.width) / 2), maxY: Math.max(0, (photo.height * zoom.scale - stage.height) / 2) }
      : null;
    const counter = [...(dialog?.querySelectorAll("p[aria-live='polite']") ?? [])].map((p) => p.textContent.trim());
    return {
      open: Boolean(dialog?.open),
      zoom,
      stage: stage ? { left: stage.left, top: stage.top, width: stage.width, height: stage.height } : null,
      photo,
      bounds,
      counter: counter.find((text) => /^Foto \d+ de \d+$/.test(text)) || null,
      announcement: counter.find((text) => !/^Foto \d+ de \d+$/.test(text)) ?? "",
      zoomed: dialog?.querySelector(".lightbox-stage")?.hasAttribute("data-zoomed") ?? false,
      src: image?.currentSrc || image?.src || null,
    };
  });
}

const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;

// Touch input through the DevTools protocol: each touch point becomes a pointer of type "touch", as on a phone.
async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id: id + 1, radiusX: 2, radiusY: 2, force: 1 })) });
  return {
    async drag(from, to, steps = 12) {
      await send("touchStart", [from]);
      for (let n = 1; n <= steps; n += 1) {
        await send("touchMove", [{ x: from.x + ((to.x - from.x) * n) / steps, y: from.y + ((to.y - from.y) * n) / steps }]);
        await page.waitForTimeout(12);
      }
      await send("touchEnd", []);
    },
    async pinch(centre, fromGap, toGap, steps = 12) {
      const pair = (gap) => [{ x: centre.x - gap / 2, y: centre.y }, { x: centre.x + gap / 2, y: centre.y }];
      await send("touchStart", pair(fromGap));
      for (let n = 1; n <= steps; n += 1) {
        await send("touchMove", pair(fromGap + ((toGap - fromGap) * n) / steps));
        await page.waitForTimeout(12);
      }
      await send("touchEnd", []);
    },
    async doubleTap(point) {
      for (let n = 0; n < 2; n += 1) {
        await send("touchStart", [point]);
        await send("touchEnd", []);
        await page.waitForTimeout(90);
      }
    },
    detach: () => cdp.detach().catch(() => {}),
  };
}

// --- Page changes ------------------------------------------------------------------------------------------------------

// Holds Laria's own page-change requests (the RSC fetch of a link, not prefetches) for `ms`, as a slow network would.
async function slowPageChanges(page, ms) {
  await page.route("**/*", async (route) => {
    const headers = route.request().headers();
    if (headers.rsc === "1" && !headers["next-router-prefetch"]) await new Promise((resolve) => setTimeout(resolve, ms));
    return route.fallback();
  });
}

// Records the navigation bar's states and the polite status's texts, with times relative to the next click.
async function watchNavigationFeedback(page) {
  await page.evaluate(() => {
    const log = [];
    window.__easeNav = { log, clickAt: null };
    document.addEventListener("click", () => { window.__easeNav.clickAt = performance.now(); }, true);
    const bar = document.querySelector(".navigation-bar");
    const status = [...document.querySelectorAll("p[role='status'].sr-only")].find((p) => p.parentElement === bar?.parentElement) || null;
    const record = (kind, value) => log.push({ kind, value, at: performance.now() });
    if (bar) new MutationObserver(() => record("bar", bar.getAttribute("data-state"))).observe(bar, { attributes: true, attributeFilter: ["data-state"] });
    if (status) new MutationObserver(() => record("status", status.textContent)).observe(status, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => {
      const skeleton = document.querySelector(".navigation-skeleton");
      const present = Boolean(skeleton);
      if (present !== window.__easeNav.skeleton) {
        window.__easeNav.skeleton = present;
        const main = document.getElementById("contenido")?.getBoundingClientRect().top ?? null;
        const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? null;
        // The kind by its outline (components/navigation-skeletons.tsx): the listing's 4:3 gallery, the store's logo square.
        const kind = !present ? null : skeleton.querySelector("[class*='aspect-[4/3]']") ? "listing" : skeleton.querySelector("[class*='h-16'][class*='w-16']") ? "store" : "account";
        record("skeleton", present ? { top: skeleton.getBoundingClientRect().top, main, header, kind } : null);
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

async function navigationLog(page) {
  return page.evaluate(() => ({ clickAt: window.__easeNav?.clickAt ?? null, log: window.__easeNav?.log ?? [] }));
}

// --- E-mail links ------------------------------------------------------------------------------------------------------

// The product's own signer (lib/email/links.ts) with server A's key, as the e-mail worker would sign a link.
function emailLinks() {
  if (h.LIVE) throw new Error("emailLinks is local only");
  const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())).filter(Boolean).map((match) => [match[1], match[2].replace(/^"|"$/g, "")]));
  const Module = require("node:module");
  if (!require.cache["server-only-stub"]) {
    const resolve = Module._resolveFilename;
    Module._resolveFilename = function resolveServerOnly(request, ...rest) {
      return request === "server-only" ? "server-only-stub" : resolve.call(this, request, ...rest);
    };
    require.cache["server-only-stub"] = { id: "server-only-stub", filename: "server-only-stub", loaded: true, exports: {} };
  }
  require(path.join(ROOT, "tests", "setup-alias.cjs"));
  const before = { own: process.env.EMAIL_LINK_SECRET, service: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const links = require(path.join(ROOT, "lib", "email", "links.ts"));
  const withKeys = (fn) => (...args) => {
    if (env.EMAIL_LINK_SECRET) process.env.EMAIL_LINK_SECRET = env.EMAIL_LINK_SECRET;
    else delete process.env.EMAIL_LINK_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      return fn(...args);
    } finally {
      if (before.own === undefined) delete process.env.EMAIL_LINK_SECRET;
      else process.env.EMAIL_LINK_SECRET = before.own;
      if (before.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = before.service;
    }
  };
  return { create: withKeys(links.createEmailLinkToken), read: withKeys(links.readEmailLinkToken), labels: links.EMAIL_LINK_LABELS };
}

// A tab whose requests are not routed. The harness routes every request, and request interception turns the browser's
// cache off, so anything that depends on the cache (a photo shown again at once) is measured here. Laria's API, the
// database and auth are blocked in it (no request interception: the blocking is the browser's own), so the tab only
// reads pages, scripts and images, live or local. Close it with close().
async function plainPage(t, { width = 1366, height = 900, reducedMotion = "no-preference" } = {}) {
  const browser = (await t.page()).context().browser();
  const context = await browser.newContext({ viewport: { width, height }, locale: "es-PE", timezoneId: "America/Lima", reducedMotion });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setBlockedURLs", { urls: ["*/api/*", "*/rest/v1/*", "*/auth/v1/*", "*/storage/v1/upload/*", "*wa.me*", "*whatsapp.com*"] });
  return { page, cdp, close: () => context.close().catch(() => {}) };
}

// Controls inside an element smaller than `min` CSS pixels in either direction.
async function smallControls(locator, min = 24) {
  return locator.evaluate((root, size) => [...root.querySelectorAll("a[href], button, input:not([type='hidden']), textarea, select, [role='button']")]
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => {
      const box = element.getBoundingClientRect();
      return { name: (element.getAttribute("aria-label") || element.textContent || element.getAttribute("name") || element.tagName).trim().slice(0, 40), width: Math.round(box.width), height: Math.round(box.height) };
    })
    .filter((item) => item.width < size || item.height < size), min);
}

module.exports = {
  ROOT, pngSize, fetchBinary, saveImage, rolledBack, catalogCards, publicListing, openLightbox, photoLoaded, lightboxState,
  near, touch, slowPageChanges, watchNavigationFeedback, navigationLog, emailLinks, smallControls, plainPage,
};
