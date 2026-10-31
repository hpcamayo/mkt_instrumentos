// Descubrir (big-02, docs/ux-effortless/maybes-descubrir.md) walk-through: behaviour checks, axe-core (WCAG 2.2 AA) and
// screenshots, on a phone with touch (390 x 844) and on a computer (1366 x 900), plus reduced motion. It expects the
// local demo data (scripts/prototype/maybes-descubrir-seed.sql after demo-seed.sql) loaded shortly before.
//   node scripts/prototype/maybes-descubrir-walk.cjs [all|phone|desktop|motion]
// BASE (default http://localhost:3000), OUT (the screenshots' folder), AXE (axe.min.js; found in node_modules/.pnpm by
// default) and REPORT (the JSON results; default in the system's temporary folder).
const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = process.env.OUT || "/mnt/project-files/ux-ideas/screens/maybes/descubrir";
const AXE = process.env.AXE || axePath();
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ONLY = process.argv[2] || "all";
const results = { axe: [], checks: [], problems: [] };
fs.mkdirSync(OUT, { recursive: true });

function axePath() {
  const store = path.join(__dirname, "..", "..", "node_modules", ".pnpm");
  const folder = fs.existsSync(store) ? fs.readdirSync(store).filter((name) => name.startsWith("axe-core@")).sort().pop() : null;
  if (!folder) throw new Error("axe-core not found; set AXE to axe.min.js");
  return path.join(store, folder, "node_modules", "axe-core", "axe.min.js");
}

const check = (name, ok, detail = "") => {
  results.checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

function placeholderSvg(url) {
  const text = (new URL(url).searchParams.get("text") || "").replace(/\+/g, " ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><rect width="100%" height="100%" fill="#cccccc"/><text x="50%" y="50%" font-family="sans-serif" font-size="40" fill="#969696" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`;
}

async function setup(browser, width, extra = {}) {
  const phone = width < 600;
  const context = await browser.newContext({
    ...(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1366, height: 900 } }),
    locale: "es-PE",
    timezoneId: "America/Lima",
    ...extra,
  });
  // placehold.co (the other seeds' photos) is out of reach here: answer with the same kind of grey card.
  await context.route("https://placehold.co/**", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: placeholderSvg(route.request().url()) }));
  // Never leave for WhatsApp: the tab lands on a stand-in page.
  await context.route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>WhatsApp (simulado)</title><p>WhatsApp</p>" }));
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") results.problems.push(`${width} console ${page.url()} ${message.text().slice(0, 300)}`);
  });
  page.on("pageerror", (error) => results.problems.push(`${width} pageerror ${page.url()} ${error.message}`));
  return { context, page };
}

async function axe(page, label) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 4).map((n) => n.target.join(" ")), summary: v.nodes[0]?.failureSummary?.slice(0, 300) }));
  }, WCAG);
  results.axe.push({ label, violations });
  console.log(`axe ${label}: ${violations.length ? violations.map((v) => `${v.id}(${v.nodes}) ${v.targets.join(" | ")}`).join("; ") : "0 violations"}`);
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

// The screen in view: its heading and the bar's counter.
async function state(page) {
  return page.evaluate(() => {
    const feed = document.querySelector(".snap-y");
    if (!feed) return null;
    const index = Math.round(feed.scrollTop / feed.clientHeight);
    const slot = feed.querySelector(`[data-slot="${index}"]`);
    const active = document.activeElement;
    return {
      index,
      heading: slot?.querySelector("h2")?.textContent?.trim() ?? null,
      bar: document.querySelector("h1 + p")?.textContent?.trim() ?? null,
      focus: active ? `${active.tagName.toLowerCase()}${active.id ? `#${active.id}` : ""}${active.getAttribute("aria-label") ? `[${active.getAttribute("aria-label")}]` : ""}` : null,
      // The feed's own live region (the hearts carry theirs too).
      live: document.querySelector("p[aria-live=polite].sr-only")?.textContent ?? "",
      slots: feed.querySelectorAll("[data-slot]").length,
    };
  });
}

async function waitHeading(page, previous, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const now = await state(page);
    if (now && now.heading && now.heading !== previous) {
      await page.waitForTimeout(450);
      return state(page);
    }
    await page.waitForTimeout(80);
  }
  return state(page);
}

async function nextUntil(page, match, max = 40, how = "button") {
  for (let i = 0; i < max; i += 1) {
    const now = await state(page);
    if (now?.heading && match.test(now.heading)) return now;
    if (how === "key") await page.keyboard.press("ArrowDown");
    else await page.getByRole("button", { name: "Siguiente", exact: true }).click();
    await waitHeading(page, now?.heading);
  }
  return state(page);
}

// A finger on the glass: touch events through CDP (headless Chromium ignores synthesizeScrollGesture).
async function swipe(page, client, x, y, dx, dy) {
  const steps = 16;
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i += 1) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }] });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(900);
}

async function phone(browser) {
  const { context, page } = await setup(browser, 390);
  const client = await context.newCDPSession(page);

  // Home: the entry.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const entry = page.getByRole("link", { name: "Descubrir lo nuevo" });
  check("home shows the Descubrir entry", (await entry.count()) === 1);
  await entry.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  await shot(page, "big-02-home-entry-390");
  const entryBox = await entry.boundingBox();
  check("home entry is at least 44px tall", entryBox && entryBox.height >= 44, `${entryBox?.height}`);
  await axe(page, "390 home");

  // Lo nuevo.
  await entry.click();
  await page.waitForURL(/\/descubrir$/);
  await page.waitForSelector("[data-slot='0'] h2");
  await page.waitForTimeout(800);
  let now = await state(page);
  check("feed opens on the first listing with its count", /^Lo nuevo · 1 de \d+$/.test(now.bar ?? ""), now.bar);
  const robots = await page.evaluate(() => document.querySelector("meta[name=robots]")?.getAttribute("content"));
  check("Descubrir is noindex", /noindex/.test(robots ?? ""), robots);
  check("no header or footer around the feed", (await page.locator("header").count()) === 0 && (await page.locator("footer").count()) === 0);
  check("no audio or video, nothing autoplays", (await page.locator("video, audio, [autoplay]").count()) === 0);
  await axe(page, "390 descubrir first screen");

  // A swipe up brings the next listing; focus and the announcement follow.
  const first = now.heading;
  await swipe(page, client, 195, 600, 0, -520);
  now = await waitHeading(page, first);
  check("swipe up shows the next listing", now.heading !== first && /· 2 de/.test(now.bar ?? ""), `${now.heading} | ${now.bar}`);
  check("position is announced politely", /^2 de \d+: /.test(now.live), now.live);
  check("focus moves with the listing", /^h2#descubrir-/.test(now.focus ?? ""), now.focus);

  // A swipe down goes back.
  await swipe(page, client, 195, 300, 0, 520);
  now = await waitHeading(page, now.heading);
  check("swipe down goes back", now.heading === first, now.heading);

  // The Telecaster: photos sideways. The seed's own Telecaster, by its full colour: the feature-ideas seeds add Telecasters
  // of their own, without photos, and they can come first in the feed.
  now = await nextUntil(page, /Telecaster Butterscotch Blonde/);
  check("reached the Fender Telecaster", /Telecaster/.test(now.heading ?? ""), now.bar);
  await page.waitForTimeout(600);
  await shot(page, "big-02-listing-390");
  await axe(page, "390 descubrir listing");
  const controls = await page.evaluate(() => {
    const slotIndex = Math.round(document.querySelector(".snap-y").scrollTop / document.querySelector(".snap-y").clientHeight);
    const slot = document.querySelector(`[data-slot="${slotIndex}"]`);
    return [...slot.querySelectorAll("button, a")].map((node) => {
      const box = node.getBoundingClientRect();
      return { name: node.getAttribute("aria-label") || node.textContent.trim(), w: Math.round(box.width), h: Math.round(box.height) };
    });
  });
  const small = controls.filter((c) => c.h < 44 || c.w < 44);
  check("every control on the screen is at least 44px", small.length === 0, small.map((c) => `${c.name} ${c.w}x${c.h}`).join(", ") || `${controls.length} controls`);
  check("plain buttons for ♥ and No me interesa", (await page.locator("[data-slot] button", { hasText: "No me interesa" }).count()) >= 1);
  const photoTrack = await page.evaluate(() => {
    const slotIndex = Math.round(document.querySelector(".snap-y").scrollTop / document.querySelector(".snap-y").clientHeight);
    const track = document.querySelector(`[data-slot="${slotIndex}"] .snap-x`);
    const box = track.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await swipe(page, client, photoTrack.x + 120, photoTrack.y, -300, 0);
  const photoCounter = await page.evaluate(() => {
    const slotIndex = Math.round(document.querySelector(".snap-y").scrollTop / document.querySelector(".snap-y").clientHeight);
    return document.querySelector(`[data-slot="${slotIndex}"] [aria-live=polite]`)?.textContent?.trim();
  });
  check("a sideways swipe shows the next photo", /^Foto 2 \/ 4$/.test(photoCounter ?? ""), photoCounter);
  now = await state(page);
  check("photo swipe keeps the same listing", /Telecaster/.test(now.heading ?? ""), now.heading);
  await shot(page, "big-02-photos-swiped-390");

  // The stop after today's listings.
  now = await nextUntil(page, /^Viste todo lo nuevo de hoy$/);
  check("stop after today's listings", now.heading === "Viste todo lo nuevo de hoy", now.heading);
  await page.waitForTimeout(400);
  await shot(page, "big-02-today-stop-390");
  await axe(page, "390 descubrir today stop");
  await page.getByRole("button", { name: "Ver los de días anteriores" }).click();
  now = await waitHeading(page, "Viste todo lo nuevo de hoy");
  const published = await page.evaluate(() => {
    const slotIndex = Math.round(document.querySelector(".snap-y").scrollTop / document.querySelector(".snap-y").clientHeight);
    return document.querySelector(`[data-slot="${slotIndex}"]`)?.textContent ?? "";
  });
  check("after the stop: yesterday's listings", /Publicado ayer/.test(published), now.heading);

  // WhatsApp, one tap: the safety sheet first for S/ 1,000 or more, then a tab to WhatsApp.
  const marshall = now.heading;
  await page.getByRole("button", { name: "WhatsApp", exact: true }).first().click();
  await page.waitForSelector("dialog[open]");
  await page.waitForTimeout(400);
  await shot(page, "big-02-safety-sheet-390");
  await axe(page, "390 descubrir safety sheet");
  const [popup] = await Promise.all([
    context.waitForEvent("page", { timeout: 8000 }),
    page.locator("dialog[open] button", { hasText: "WhatsApp" }).click(),
  ]);
  await popup.waitForURL(/^https:\/\/wa\.me\//, { timeout: 8000 }).catch(() => undefined);
  check("WhatsApp opens in a new tab after the sheet", popup.url().startsWith("https://wa.me/"), popup.url().replace(/text=.*/, "text=…"));
  await popup.close();
  check("the feed stays on the same listing", (await state(page)).heading === marshall);

  // "No me interesa": out of the feed, with "Deshacer".
  now = await nextUntil(page, /Taylor/);
  const taylor = now.heading;
  await page.locator(`[data-slot="${now.index}"] button`, { hasText: "No me interesa" }).click();
  now = await waitHeading(page, taylor);
  const toast = await page.locator("[role=status]", { hasText: "no volverás a ver" }).count();
  check("No me interesa hides it and offers Deshacer", toast === 1 && now.heading !== taylor, now.heading);
  const stored = await page.evaluate(() => localStorage.getItem("laria:descubrir-ocultos"));
  check("hidden on this device only", Boolean(stored && stored.includes("de5c0000-0000-4000-8000-000000000007")), stored);
  await shot(page, "big-02-hidden-undo-390");
  await axe(page, "390 descubrir after hiding");

  // The end.
  now = await nextUntil(page, /^Viste todo lo nuevo$/);
  check("a visible end", now.heading === "Viste todo lo nuevo", now.heading);
  const endText = await page.evaluate(() => {
    const slotIndex = Math.round(document.querySelector(".snap-y").scrollTop / document.querySelector(".snap-y").clientHeight);
    return document.querySelector(`[data-slot="${slotIndex}"]`)?.textContent ?? "";
  });
  check("the end counts what was hidden", /Omitimos 1 que marcaste/.test(endText), endText.slice(0, 160));
  const atEnd = await page.getByRole("button", { name: "Siguiente", exact: true }).getAttribute("aria-disabled");
  check("Siguiente is off at the end", atEnd === "true");
  await page.waitForTimeout(300);
  await shot(page, "big-02-end-390");
  await axe(page, "390 descubrir end");

  // "Volver a mostrarlas" goes back to the hidden listing.
  await page.getByRole("button", { name: "Volver a mostrarlas" }).click();
  now = await waitHeading(page, "Viste todo lo nuevo");
  check("Volver a mostrarlas brings it back", now.heading === taylor, now.heading);

  // "Ver publicación" and back: the feed opens where it was.
  await page.locator(`[data-slot="${now.index}"] a`, { hasText: "Ver publicación" }).click();
  await page.waitForURL(/\/instrumentos\//);
  await page.waitForTimeout(800);
  await page.goBack();
  await page.waitForURL(/\/descubrir$/);
  await page.waitForTimeout(1500);
  now = await state(page);
  check("back from the listing returns to the same place", now.heading === taylor, `${now.heading} | ${now.bar}`);

  // A results list: the entry and its feed.
  await page.goto(`${BASE}/listados?category=guitars`, { waitUntil: "networkidle" });
  const fromList = page.getByRole("link", { name: "Ver en Descubrir" });
  check("results list shows Ver en Descubrir", (await fromList.count()) >= 1);
  await fromList.first().evaluate((node) => node.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  await shot(page, "big-02-results-entry-390");
  await axe(page, "390 results list");
  const href = await fromList.first().getAttribute("href");
  check("the entry carries the list's filters", href === "/descubrir?modo=resultados&category=guitars", href);
  await fromList.first().click();
  await page.waitForURL(/modo=resultados/);
  await page.waitForSelector("[data-slot='0'] h2");
  await page.waitForTimeout(800);
  now = await state(page);
  check("results feed names the list", /^Guitarras · 1 de \d+$/.test(now.bar ?? ""), now.bar);
  await shot(page, "big-02-results-feed-390");
  now = await nextUntil(page, /^Viste todos los resultados$/);
  check("results feed ends", now.heading === "Viste todos los resultados", now.heading);
  await page.waitForTimeout(300);
  await shot(page, "big-02-results-end-390");
  await axe(page, "390 results end");
  await context.close();
}

async function desktop(browser) {
  const { context, page } = await setup(browser, 1366);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const entry = page.getByRole("link", { name: "Descubrir lo nuevo" });
  await entry.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  await shot(page, "big-02-home-entry-1366");
  await axe(page, "1366 home");
  await entry.click();
  await page.waitForURL(/\/descubrir$/);
  await page.waitForSelector("[data-slot='0'] h2");
  await page.waitForTimeout(800);
  await axe(page, "1366 descubrir first screen");

  // The keyboard: ↓ moves on and focus follows.
  let now = await nextUntil(page, /Telecaster Butterscotch Blonde/, 40, "key");
  check("arrow keys move between listings", /Telecaster/.test(now.heading ?? ""), now.bar);
  check("keyboard focus lands on the listing's heading", /^h2#descubrir-/.test(now.focus ?? ""), now.focus);
  await page.waitForTimeout(500);
  await shot(page, "big-02-listing-1366");
  await axe(page, "1366 descubrir listing");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(700);
  const photoCounter = await page.evaluate(() => {
    const slotIndex = Math.round(document.querySelector(".snap-y").scrollTop / document.querySelector(".snap-y").clientHeight);
    return document.querySelector(`[data-slot="${slotIndex}"] [aria-live=polite]`)?.textContent?.trim();
  });
  check("→ shows the next photo", /^Foto 2 \/ 4$/.test(photoCounter ?? ""), photoCounter);
  await shot(page, "big-02-photos-swiped-1366");
  await page.keyboard.press("ArrowUp");
  now = await waitHeading(page, (await state(page)).heading);
  check("↑ goes back one listing", !/Telecaster/.test(now.heading ?? ""), now.heading);
  now = await nextUntil(page, /^Viste todo lo nuevo de hoy$/, 40, "key");
  await page.waitForTimeout(300);
  await shot(page, "big-02-today-stop-1366");
  await axe(page, "1366 descubrir today stop");
  now = await nextUntil(page, /^Viste todo lo nuevo$/, 40, "key");
  check("desktop reaches the end", now.heading === "Viste todo lo nuevo", now.heading);
  await page.waitForTimeout(300);
  await shot(page, "big-02-end-1366");
  await axe(page, "1366 descubrir end");
  await page.goto(`${BASE}/listados?category=guitars`, { waitUntil: "networkidle" });
  const fromList = page.getByRole("link", { name: "Ver en Descubrir" });
  check("desktop results list shows Ver en Descubrir", (await fromList.count()) >= 1 && (await fromList.first().isVisible()));
  await shot(page, "big-02-results-entry-1366");
  await axe(page, "1366 results list");
  await context.close();
}

async function reducedMotion(browser) {
  const { context, page } = await setup(browser, 390, { reducedMotion: "reduce" });
  await page.goto(`${BASE}/descubrir`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-slot='0'] h2");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  const jumped = await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    const feed = document.querySelector(".snap-y");
    resolve(feed.scrollTop === feed.clientHeight);
  })));
  check("reduced motion: Siguiente jumps without gliding", jumped);
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (ONLY === "all" || ONLY === "phone") await phone(browser);
    if (ONLY === "all" || ONLY === "desktop") await desktop(browser);
    if (ONLY === "all" || ONLY === "motion") await reducedMotion(browser);
  } catch (error) {
    results.problems.push(`walk stopped: ${error.stack}`);
    console.log(error.stack);
  } finally {
    await browser.close();
    fs.writeFileSync(process.env.REPORT || path.join(os.tmpdir(), `descubrir-walk-${ONLY}.json`), JSON.stringify(results, null, 2));
    const failed = results.checks.filter((c) => !c.ok).length;
    const violations = results.axe.reduce((n, a) => n + a.violations.length, 0);
    console.log(`\n${results.checks.length - failed}/${results.checks.length} checks pass; axe violations: ${violations}; console/page problems: ${results.problems.length}`);
    for (const problem of results.problems) console.log(`  ${problem}`);
  }
})();
