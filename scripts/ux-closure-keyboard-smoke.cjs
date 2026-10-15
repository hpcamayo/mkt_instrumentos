#!/usr/bin/env node
// Local production-build regression for UX-8 confirmation focus and Admin revision scrolling.
// Requires the documented .ux-accounts.local.json, an owned approved listing and one pending revision.
// LARIA_PLAYWRIGHT_MODULE=<module path> LARIA_AXE_PATH=<axe.min.js> \
//   node scripts/ux-closure-keyboard-smoke.cjs http://localhost:3108
// Optional LARIA_UX_BROWSERS=chromium,firefox,webkit (default chromium).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadEnvFile } = require("node:process");
const playwright = require(process.env.LARIA_PLAYWRIGHT_MODULE || "playwright");
loadEnvFile(".env.local");
const target = new URL(process.argv[2] || "http://localhost:3000");
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
assert.ok(localHosts.has(target.hostname), "Local app only.");
assert.ok(localHosts.has(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname), "Local Supabase only.");
const accounts = JSON.parse(fs.readFileSync(process.env.LARIA_UX_ACCOUNTS || ".ux-accounts.local.json", "utf8"));
const axe = fs.readFileSync(process.env.LARIA_AXE_PATH, "utf8");
const browsers = (process.env.LARIA_UX_BROWSERS || "chromium").split(",");
assert.ok(browsers.every((name) => ["chromium", "firefox", "webkit"].includes(name)), "Use supported browser engines.");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "laria-ux-keyboard-"));
const results = [];
const write = () => fs.writeFileSync(path.join(artifacts, "results.json"), JSON.stringify(results, null, 2));

async function session(browser, role, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  // Only the explicit local login below may write. Browser interactions open/cancel; they never confirm.
  await context.route("**/*", (route) => {
    const request = route.request();
    return localHosts.has(new URL(request.url()).hostname) && ["GET", "HEAD"].includes(request.method())
      ? route.continue() : route.abort("blockedbyclient");
  });
  assert.equal((await context.request.post(new URL("/api/auth/login", target).href, { data: accounts[role] })).status(), 200);
  return context;
}

async function scan(page) {
  await page.evaluate(axe);
  return page.evaluate(async () => (await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  })).violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) })));
}

(async () => {
  for (const engine of browsers) {
    const browser = await playwright[engine].launch({
      headless: true,
      ...(engine === "chromium" && process.env.LARIA_CHROME_EXECUTABLE ? { executablePath: process.env.LARIA_CHROME_EXECUTABLE } : {}),
    });
    try {
      for (const width of [390, 1440]) {
        for (const role of ["particular", "admin"]) {
          const context = await session(browser, role, width);
          try {
            const page = await context.newPage();
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            const route = role === "particular" ? "/mi-cuenta/publicaciones" : "/admin/revisiones";
            assert.equal((await page.goto(new URL(route, target).href, { waitUntil: "networkidle" })).status(), 200);
            await page.bringToFront();
            const result = { engine, width, role, errors };
            results.push(result);
            if (role === "particular") {
              const opener = page.getByRole("button", { name: "Ocultar", exact: true }).first();
              assert.ok(await opener.count(), "An owned approved local fixture is required.");
              // Activate by keyboard; macOS WebKit mouse clicks need not focus a button.
              await opener.focus();
              await page.keyboard.press("Enter");
              const dialog = page.getByRole("alertdialog");
              await dialog.waitFor();
              await page.waitForTimeout(200);
              result.safeInitialFocus = await dialog.getByRole("button", { name: "Cancelar", exact: true }).evaluate((element) => element === document.activeElement);
              assert.ok(result.safeInitialFocus);
              result.trapped = true;
              for (const key of ["Tab", "Shift+Tab"]) {
                for (let step = 0; step < 8; step++) {
                  await page.keyboard.press(key);
                  result.trapped &&= await dialog.evaluate((element) => element.contains(document.activeElement));
                }
              }
              assert.ok(result.trapped, "Forward and backward Tab must remain inside the confirmation.");
              result.violations = await scan(page);
              await page.keyboard.press("Escape");
              await page.waitForTimeout(50);
              result.returnedFocus = await opener.evaluate((element) => element === document.activeElement);
              assert.ok(result.returnedFocus);
              assert.equal(await dialog.count(), 0);
            } else {
              const region = page.getByRole("region", { name: "Comparación de cambios", exact: true }).first();
              assert.ok(await region.count(), "A pending local revision with changed fields is required.");
              await region.focus();
              result.before = await region.evaluate((element) => ({
                focused: element === document.activeElement, left: element.scrollLeft,
                scrolls: element.scrollWidth > element.clientWidth, outline: getComputedStyle(element).outlineWidth,
              }));
              // WebKit activates the scroll container on the first arrow, also on bare HTML.
              await page.keyboard.press("ArrowRight");
              await page.waitForTimeout(100);
              await page.keyboard.press("ArrowRight");
              await page.waitForTimeout(350);
              result.after = await region.evaluate((element) => element.scrollLeft);
              assert.ok(result.before.focused);
              assert.ok(parseFloat(result.before.outline) >= 2);
              if (result.before.scrolls) assert.ok(result.after > result.before.left, "ArrowRight must scroll the focused comparison.");
              result.violations = await scan(page);
            }
            assert.deepEqual(result.violations, []);
            assert.deepEqual(errors, []);
            result.passed = true;
            write();
            console.log("PASS", engine, width, role);
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  console.log(JSON.stringify({ artifacts, checks: results.length }));
})().catch((error) => {
  write();
  console.error(error);
  console.error("Evidence:", artifacts);
  process.exitCode = 1;
});
