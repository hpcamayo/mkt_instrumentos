// Group B, listing media (EASE-160..169): the lightbox's zoom, moving between photos, sharing and the link previews.
"use strict";
const u = require("./b-util.cjs");

// A share sheet that records what Laria hands it (navigator.share and canShare), as a phone's browser has one.
function fakeShareSheet() {
  window.__easeShared = [];
  const describe = async (data) => {
    const files = await Promise.all((data.files || []).map(async (file) => {
      let size = null;
      try {
        const bitmap = await createImageBitmap(file);
        size = { width: bitmap.width, height: bitmap.height };
      } catch { /* not an image */ }
      return { name: file.name, type: file.type, bytes: file.size, size };
    }));
    return { title: data.title ?? null, text: data.text ?? null, url: data.url ?? null, files };
  };
  Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: async function share(data) { window.__easeShared.push(await describe(data)); } });
  Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: function canShare(data) { return Boolean(data); } });
}

module.exports = [
  {
    id: "EASE-160",
    live: true,
    run: async (t) => {
      const page = await t.page({ phone: true });
      const item = await u.publicListing(t, page, { photos: 1, local: { title: `Guitarra zoom táctil ${t.tag().slice(-4)}`, photos: 3 } });
      await t.goto(page, item.path);
      await u.openLightbox(page, 1);
      const finger = await u.touch(page);
      let state = await u.lightboxState(page);
      const { stage } = state;
      t.check(state.zoom?.scale === 1, `the lightbox opens at 1x (${state.zoom?.scale})`);

      // Double tap off centre: 2.5x at the tapped point (the point keeps its place unless an edge stops it).
      const at = { x: stage.left + stage.width * 0.3, y: stage.top + stage.height * 0.5 };
      await finger.doubleTap(at);
      await page.waitForTimeout(400);
      state = await u.lightboxState(page);
      const local = at.x - stage.left - stage.width / 2;
      const expectX = Math.max(-state.bounds.maxX, Math.min(state.bounds.maxX, local - local * 2.5));
      t.check(u.near(state.zoom.scale, 2.5, 0.01), `a double tap zooms to 2.5x (${state.zoom.scale})`);
      t.check(u.near(state.zoom.x, expectX, 2), `the tapped point stays under the finger (x ${state.zoom.x.toFixed(1)}, expected ${expectX.toFixed(1)})`);
      await t.shot(page, "double-tap-2-5x");
      await finger.doubleTap(at);
      await page.waitForTimeout(400);
      state = await u.lightboxState(page);
      t.check(state.zoom.scale === 1 && state.zoom.x === 0 && state.zoom.y === 0, `a second double tap goes back to 1x (${JSON.stringify(state.zoom)})`);

      // Pinch out from the centre: the photo grows with the fingers and stops at 4x.
      const centre = { x: stage.left + stage.width / 2, y: stage.top + stage.height / 2 };
      await finger.pinch(centre, 40, 100, 6);
      await page.waitForTimeout(200);
      state = await u.lightboxState(page);
      t.check(state.zoom.scale > 1.8 && state.zoom.scale < 3, `a short pinch follows the fingers (${state.zoom.scale.toFixed(2)}x for 2.5x the distance)`);
      await finger.pinch(centre, 40, 360, 12);
      await page.waitForTimeout(200);
      state = await u.lightboxState(page);
      t.check(u.near(state.zoom.scale, 4, 0.01), `a wide pinch stops at 4x (${state.zoom.scale})`);
      t.check(u.near(state.zoom.x, 0, 2) && u.near(state.zoom.y, 0, 2), `pinching at the centre keeps the centre in place (${state.zoom.x.toFixed(1)}, ${state.zoom.y.toFixed(1)})`);

      // Drag to every edge: the photo moves until its edge meets the screen's, never further.
      const { maxX, maxY } = state.bounds;
      const edges = [];
      for (const [label, dx, dy] of [["right", 900, 0], ["left", -1800, 0], ["down", 0, 1400], ["up", 0, -2800]]) {
        await finger.drag(centre, { x: centre.x + dx / 3, y: centre.y + dy / 3 }, 10);
        await finger.drag(centre, { x: centre.x + dx / 3, y: centre.y + dy / 3 }, 10);
        await finger.drag(centre, { x: centre.x + dx / 3, y: centre.y + dy / 3 }, 10);
        state = await u.lightboxState(page);
        edges.push({ label, x: state.zoom.x, y: state.zoom.y });
      }
      const [right, left, down, up] = edges;
      t.check(u.near(right.x, maxX) && u.near(left.x, -maxX), `dragging sideways stops at the photo's edges (x ${right.x.toFixed(1)} / ${left.x.toFixed(1)}, limit ±${maxX.toFixed(1)})`);
      t.check(u.near(down.y, maxY) && u.near(up.y, -maxY), `dragging up and down stops at the photo's edges (y ${down.y.toFixed(1)} / ${up.y.toFixed(1)}, limit ±${maxY.toFixed(1)})`);
      t.check(state.zoom.scale === 4, `panning keeps the zoom (${state.zoom.scale})`);
      await t.shot(page, "pinched-4x-at-edge");
      await finger.detach();
    },
  },
  {
    id: "EASE-161",
    live: true,
    run: async (t) => {
      const page = await t.page();
      const item = await u.publicListing(t, page, { photos: 1, local: { title: `Guitarra zoom escritorio ${t.tag().slice(-4)}`, photos: 3 } });
      await t.goto(page, item.path);
      await u.openLightbox(page, 1);
      const zoomIn = page.getByRole("button", { name: "Acercar", exact: true });
      const zoomOut = page.getByRole("button", { name: "Alejar", exact: true });
      for (const [name, button] of [["Acercar", zoomIn], ["Alejar", zoomOut]]) {
        const box = await button.boundingBox();
        t.check(box && box.width >= 44 && box.height >= 44, `${name} is at least 44 px (${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "missing"})`);
      }
      t.check(await zoomOut.getAttribute("aria-disabled") === "true", "Alejar is off at 1x");

      const scales = [];
      for (let n = 0; n < 4; n += 1) {
        // The fourth press lands on an Acercar that is already off (aria-disabled) at 4x: it must change nothing.
        await zoomIn.click({ force: n === 3 });
        await page.waitForTimeout(250);
        const state = await u.lightboxState(page);
        scales.push(state.zoom.scale);
        if (state.zoom.scale === 3) t.check(state.announcement === "Foto ampliada al 300 %", `at 3x the polite region says "${state.announcement}"`);
      }
      t.check(scales.join(",") === "2,3,4,4", `Acercar steps 2x, 3x, 4x and stops there (${scales.join(", ")})`);
      t.check(await zoomIn.getAttribute("aria-disabled") === "true", "Acercar is off at 4x");
      await t.shot(page, "acercar-4x");
      const down = [];
      for (let n = 0; n < 3; n += 1) {
        await zoomOut.click();
        await page.waitForTimeout(250);
        down.push((await u.lightboxState(page)).zoom.scale);
      }
      t.check(down.join(",") === "3,2,1", `Alejar steps back to 1x (${down.join(", ")})`);
      t.check((await u.lightboxState(page)).announcement === "Foto sin ampliar", "back at 1x the polite region says Foto sin ampliar");

      // Keys: + and - step, 0 resets.
      const keys = [];
      for (const key of ["+", "+", "-", "+", "0"]) {
        await page.keyboard.press(key);
        await page.waitForTimeout(220);
        keys.push((await u.lightboxState(page)).zoom.scale);
      }
      t.check(keys.join(",") === "2,3,2,3,1", `+ / - / 0 zoom the same way (${keys.join(", ")})`);

      // The wheel and a trackpad pinch (a wheel with ctrlKey) zoom at the pointer.
      let state = await u.lightboxState(page);
      const { stage } = state;
      const point = { x: stage.left + stage.width * 0.4, y: stage.top + stage.height * 0.45 };
      await page.mouse.move(point.x, point.y);
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(300);
      state = await u.lightboxState(page);
      const at = { x: point.x - stage.left - stage.width / 2, y: point.y - stage.top - stage.height / 2 };
      const clampTo = (value, max) => Math.max(-max, Math.min(max, value));
      const expected = { x: clampTo(at.x - at.x * state.zoom.scale, state.bounds.maxX), y: clampTo(at.y - at.y * state.zoom.scale, state.bounds.maxY) };
      t.check(state.zoom.scale > 1.3 && state.zoom.scale < 1.7, `the wheel zooms in (${state.zoom.scale.toFixed(2)}x)`);
      t.check(u.near(state.zoom.x, expected.x, 2) && u.near(state.zoom.y, expected.y, 2), `the wheel keeps the point under the pointer (${state.zoom.x.toFixed(1)}, ${state.zoom.y.toFixed(1)} vs ${expected.x.toFixed(1)}, ${expected.y.toFixed(1)})`);
      await page.keyboard.press("0");
      await page.waitForTimeout(250);
      const cdp = await page.context().newCDPSession(page);
      for (let n = 0; n < 4; n += 1) {
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: point.x, y: point.y, deltaX: 0, deltaY: -10, modifiers: 2 });
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(250);
      state = await u.lightboxState(page);
      const pinchExpected = { x: clampTo(at.x - at.x * state.zoom.scale, state.bounds.maxX) };
      t.check(state.zoom.scale > 1.3 && state.zoom.scale < 1.7, `a trackpad pinch (ctrl + small wheel steps) zooms in faster (${state.zoom.scale.toFixed(2)}x from 40 px)`);
      t.check(u.near(state.zoom.x, pinchExpected.x, 2), `the trackpad pinch zooms at the pointer (x ${state.zoom.x.toFixed(1)} vs ${pinchExpected.x.toFixed(1)})`);
      await cdp.detach().catch(() => {});
      await t.shot(page, "trackpad-pinch");
    },
  },
  {
    id: "EASE-162",
    live: true,
    run: async (t) => {
      const page = await t.page({ phone: true });
      const item = await u.publicListing(t, page, { photos: 3, local: { title: `Guitarra deslizar ${t.tag().slice(-4)}`, photos: 3 } });
      await t.goto(page, item.path);
      await u.openLightbox(page, 1);
      const finger = await u.touch(page);
      let state = await u.lightboxState(page);
      const total = Number(/de (\d+)/.exec(state.counter)?.[1] ?? 0);
      const { stage } = state;
      const y = stage.top + stage.height / 2;
      const swipeLeft = () => finger.drag({ x: stage.left + stage.width * 0.8, y }, { x: stage.left + stage.width * 0.2, y }, 8);
      t.check(state.counter === "Foto 1 de " + total && total >= 3, `opens on ${state.counter}`);
      await swipeLeft();
      await page.waitForTimeout(300);
      state = await u.lightboxState(page);
      t.check(state.counter === `Foto 2 de ${total}` && state.zoom.scale === 1, `at 1x a sideways swipe moves to the next photo (${state.counter})`);

      await finger.doubleTap({ x: stage.left + stage.width / 2, y });
      await page.waitForTimeout(400);
      await u.photoLoaded(page);
      const before = await u.lightboxState(page);
      await swipeLeft();
      await page.waitForTimeout(300);
      state = await u.lightboxState(page);
      t.check(before.zoom.scale === 2.5 && state.counter === `Foto 2 de ${total}`, `zoomed, the same swipe keeps the photo (${state.counter} at ${state.zoom.scale}x)`);
      t.check(state.zoom.x < before.zoom.x || (before.zoom.x === -before.bounds.maxX && state.zoom.x === before.zoom.x), `zoomed, the swipe pans the photo instead (x ${before.zoom.x.toFixed(1)} → ${state.zoom.x.toFixed(1)})`);
      await t.shot(page, "zoomed-swipe-pans");

      await page.getByRole("button", { name: "Foto siguiente", exact: true }).click();
      await page.waitForTimeout(300);
      state = await u.lightboxState(page);
      t.check(state.counter === `Foto 3 de ${total}` && state.zoom.scale === 1 && state.zoom.x === 0 && !state.zoomed, `Foto siguiente shows the next photo at 1x (${state.counter}, ${state.zoom.scale}x)`);

      await page.getByRole("button", { name: "Acercar", exact: true }).click();
      await page.waitForTimeout(250);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(300);
      state = await u.lightboxState(page);
      t.check(state.zoom.scale === 1 && state.counter === `Foto ${total >= 4 ? 4 : 1} de ${total}`, `the arrow key after zooming shows the next photo at 1x (${state.counter}, ${state.zoom.scale}x)`);

      await page.getByRole("button", { name: "Acercar", exact: true }).click();
      await page.waitForTimeout(250);
      await page.getByRole("button", { name: "Foto anterior", exact: true }).click();
      await page.waitForTimeout(300);
      state = await u.lightboxState(page);
      t.check(state.zoom.scale === 1, `Foto anterior after zooming shows the photo at 1x (${state.counter}, ${state.zoom.scale}x)`);
      await swipeLeft();
      await page.waitForTimeout(300);
      const swiped = await u.lightboxState(page);
      t.check(swiped.counter !== state.counter && swiped.zoom.scale === 1, `a swipe at 1x shows the new photo at 1x (${swiped.counter}, ${swiped.zoom.scale}x)`);
      await finger.detach();
    },
  },
  {
    id: "EASE-163",
    live: true,
    run: async (t) => {
      const page = await t.page();
      const item = await u.publicListing(t, page, { photos: 3, local: { title: `Guitarra fotos rápidas ${t.tag().slice(-4)}`, photos: 3 } });
      await t.goto(page, item.path);
      const second = page.getByRole("button", { name: /^Ampliar foto 2 de \d+$/ }).locator("img");
      t.check(await second.getAttribute("loading") === "eager", `the gallery's second photo is eager (loading=${await second.getAttribute("loading")})`);

      // Open with the keyboard, then check the neighbours are already loaded.
      const opener = page.getByRole("button", { name: /^Ampliar foto 1 de \d+$/ });
      await opener.focus();
      await page.keyboard.press("Enter");
      await page.locator("dialog.lightbox[open]").waitFor();
      await u.photoLoaded(page);
      await page.waitForFunction(() => {
        const hidden = [...document.querySelectorAll("dialog.lightbox [aria-hidden='true'].invisible img")];
        return hidden.length === 2 && hidden.every((image) => image.complete && image.naturalWidth > 0);
      }, null, { timeout: 20_000 }).then(() => t.check(true, "the next and the previous photo are loaded hidden behind the current one"), () => t.check(false, "the next and previous photos were not both loaded"));

      // On a slow network the next photo shows at once: it is already in the cache. Measured in an unrouted tab, because
      // the harness's request routing turns the browser cache off.
      const plain = await u.plainPage(t);
      try {
        await t.goto(plain.page, item.path);
        await u.openLightbox(plain.page, 1);
        await plain.page.waitForFunction(() => {
          const hidden = [...document.querySelectorAll("dialog.lightbox [aria-hidden='true'].invisible img")];
          return hidden.length === 2 && hidden.every((image) => image.complete && image.naturalWidth > 0);
        }, null, { timeout: 20_000 });
        await plain.cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 600, downloadThroughput: 40 * 1024, uploadThroughput: 20 * 1024 });
        const requested = [];
        plain.page.on("request", (request) => { if (/\/_next\/image|\.jpe?g/.test(request.url())) requested.push(request.url()); });
        const moves = [];
        for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft"]) {
          const before = (await u.lightboxState(plain.page)).src;
          const started = Date.now();
          await plain.page.keyboard.press(key);
          const ready = await plain.page.waitForFunction((previous) => {
            const image = document.querySelector("dialog.lightbox .lightbox-photo img");
            return image && image.currentSrc !== previous && image.complete && image.naturalWidth > 0;
          }, before, { timeout: 8_000 }).then(() => Date.now() - started, () => null);
          moves.push(ready);
          await plain.page.waitForTimeout(250);
        }
        const shown = moves.length;
        t.check(moves.every((ms) => ms !== null && ms < 300), `with 600 ms of network latency each of ${shown} moves shows its photo at once (${moves.map((ms) => `${ms} ms`).join(", ")})`);
        t.note(`photo requests while moving on the slow network: ${requested.length} (the neighbours of the new photo)`);
      } finally {
        await plain.close();
      }

      // Esc and Cerrar give the focus back to the photo button that opened the lightbox.
      await page.keyboard.press("Escape");
      await page.locator("dialog.lightbox").waitFor({ state: "detached" });
      await page.waitForTimeout(150);
      const afterEsc = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName);
      t.check(afterEsc && /^Ampliar foto 1 de \d+$/.test(afterEsc), `Esc returns the focus to the photo button that opened it (${afterEsc})`);
      const thumb = page.getByRole("button", { name: /^Ampliar foto 2 de \d+$/ });
      await page.getByRole("button", { name: /^Ver foto 2 de \d+$/ }).first().click().catch(() => {});
      await thumb.focus();
      await page.keyboard.press("Enter");
      await page.locator("dialog.lightbox[open]").waitFor();
      await page.getByRole("button", { name: "Cerrar", exact: true }).click();
      await page.locator("dialog.lightbox").waitFor({ state: "detached" });
      await page.waitForTimeout(150);
      const afterClose = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName);
      t.check(afterClose && /^Ampliar foto 2 de \d+$/.test(afterClose), `Cerrar returns the focus to the photo button that opened it (${afterClose})`);
      await t.shot(page, "focus-back-on-photo");
      const glide = await (async () => {
        await u.openLightbox(page, 1);
        await page.getByRole("button", { name: "Acercar", exact: true }).click();
        await page.waitForTimeout(30);
        return page.locator("dialog.lightbox .lightbox-photo").evaluate((element) => ({ animate: element.hasAttribute("data-animate"), duration: getComputedStyle(element).transitionDuration, property: getComputedStyle(element).transitionProperty }));
      })();
      t.check(glide.animate && glide.duration !== "0s", `without reduced motion the button zoom glides (transition ${glide.property} ${glide.duration})`);

      // Reduced motion: the same zoom lands at once.
      const calm = await t.page({ reducedMotion: "reduce" });
      await t.goto(calm, item.path);
      await u.openLightbox(calm, 1);
      await calm.getByRole("button", { name: "Acercar", exact: true }).click();
      await calm.waitForTimeout(30);
      const instant = await calm.locator("dialog.lightbox .lightbox-photo").evaluate((element) => ({ animate: element.hasAttribute("data-animate"), duration: getComputedStyle(element).transitionDuration, property: getComputedStyle(element).transitionProperty, transform: element.style.transform }));
      t.check(instant.animate && (instant.duration.split(",").every((value) => Number.parseFloat(value) === 0) || instant.property === "none"), `under reduced motion the zoom is instant (transition ${instant.property} ${instant.duration})`);
    },
  },
  {
    id: "EASE-164",
    live: true,
    run: async (t) => {
      const page = await t.page({ phone: true });
      await page.addInitScript(fakeShareSheet);
      const item = await u.publicListing(t, page, { photos: 1, local: { title: `Boss DS-1 compartir ${t.tag().slice(-4)}`, price: 299 } });
      await t.goto(page, item.path);
      const title = (await page.getByRole("heading", { level: 1 }).first().textContent()).trim();
      await page.waitForTimeout(500);
      const button = page.getByRole("button", { name: "Compartir", exact: true });
      t.check(await button.getAttribute("aria-expanded") === null, "with a share sheet, Compartir is one button, not a menu");
      await button.click();
      await page.waitForFunction(() => window.__easeShared.length > 0, null, { timeout: 5_000 });
      const [shared] = await page.evaluate(() => window.__easeShared);
      const url = new URL(item.path, t.base).href;
      t.check(shared.title === title, `the sheet gets the title (${shared.title})`);
      t.check(new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} a S\\/\\s?[\\d,]+ en Laria$`).test(shared.text || ""), `the sheet gets "<título> a <precio> en Laria" (${shared.text})`);
      t.check(shared.url === url || shared.url === url.replace(new URL(t.base).origin, "https://laria.audio"), `the sheet gets the listing link (${shared.url})`);
      t.check(!(await page.getByRole("group", { name: "Opciones para compartir" }).isVisible()), "no fallback menu opens with a share sheet");
      await t.shot(page, "share-called");
      t.skip("verified with a stand-in share sheet: one tap hands it the title, the text and the link; not run: a real phone's native share sheet and choosing WhatsApp (Android or iOS)");
    },
  },
  {
    id: "EASE-165",
    live: true,
    run: async (t) => {
      const page = await t.page({ permissions: ["clipboard-read", "clipboard-write"] });
      // Desktop Chrome without a share sheet (Linux has none; this makes sure).
      await page.addInitScript(() => {
        delete Navigator.prototype.share;
        delete Navigator.prototype.canShare;
      });
      const item = await u.publicListing(t, page, { photos: 1, local: { title: `Pedal compartir menú ${t.tag().slice(-4)}`, price: 1200 } });
      await t.goto(page, item.path);
      const title = (await page.getByRole("heading", { level: 1 }).first().textContent()).trim();
      const slug = item.path.split("/").pop();
      const share = page.getByRole("button", { name: "Compartir", exact: true });
      const menu = page.getByRole("group", { name: "Opciones para compartir" });
      await share.click();
      await menu.waitFor();
      t.check(await share.getAttribute("aria-expanded") === "true", "Compartir opens a menu (aria-expanded true)");
      await t.shot(page, "menu");

      await menu.getByRole("button", { name: "Copiar enlace" }).click();
      const status = page.locator("p[role='status']").filter({ hasText: "Enlace copiado" });
      await status.waitFor({ timeout: 5_000 }).then(() => t.check(true, "Copiar enlace says Enlace copiado"), () => t.check(false, "no Enlace copiado status"));
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      t.check(new URL(clip).pathname === item.path, `the link is on the clipboard (${clip})`);

      await share.click();
      await menu.waitFor();
      const whatsapp = menu.getByRole("link", { name: "WhatsApp" });
      const href = await whatsapp.getAttribute("href");
      const text = t.whatsappText(href);
      t.check(new URL(href).hostname === "wa.me" && (await whatsapp.getAttribute("target")) === "_blank", `WhatsApp opens wa.me in a new tab (${href.slice(0, 60)}…)`);
      t.check(text.startsWith(`${title} a `) && / en Laria https?:\/\/\S+\/instrumentos\//.test(text) && text.endsWith(item.path), `the WhatsApp text has the title, price and link (${text})`);
      const [popup] = await Promise.all([page.waitForEvent("popup"), whatsapp.click()]);
      await popup.waitForLoadState();
      t.check(new URL(popup.url()).hostname === "wa.me", `the WhatsApp option opened ${new URL(popup.url()).hostname}`);
      await popup.close();

      await share.click();
      await menu.waitFor();
      const download = menu.getByRole("link", { name: "Descargar imagen para estados" });
      const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
      const saved = `${t.OUT}/${t.id}-download-${file.suggestedFilename()}`;
      await file.saveAs(saved);
      t.record.shots.push(saved);
      const size = u.pngSize(require("node:fs").readFileSync(saved));
      t.check(file.suggestedFilename() === `laria-${slug}.png`, `the image downloads as ${file.suggestedFilename()}`);
      t.check(size && size.width === 1080 && size.height === 1920, `the download is a 1080x1920 PNG (${size ? `${size.width}x${size.height}` : "not a PNG"})`);

      await share.click();
      await menu.waitFor();
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
      t.check(!(await menu.count()), "Esc closes the menu");
      t.check(await page.evaluate(() => document.activeElement?.textContent?.trim()) === "Compartir", "Esc returns the focus to Compartir");
    },
  },
  {
    id: "EASE-166",
    live: true,
    run: async (t) => {
      const page = await t.page({ phone: true });
      await page.addInitScript(fakeShareSheet);
      const item = await u.publicListing(t, page, { photos: 1, local: { title: `Teclado estados ${t.tag().slice(-4)}`, price: 2350 } });
      await t.goto(page, item.path);
      const title = (await page.getByRole("heading", { level: 1 }).first().textContent()).trim();
      const slug = item.path.split("/").pop();
      const button = page.getByRole("button", { name: "Compartir imagen", exact: true });
      await button.waitFor({ timeout: 10_000 }).then(() => t.check(true, "a phone that can share files gets Compartir imagen"), () => t.check(false, "Compartir imagen is missing on a phone that can share files"));
      await button.click();
      await page.waitForFunction(() => window.__easeShared.length > 0, null, { timeout: 15_000 });
      const [shared] = await page.evaluate(() => window.__easeShared);
      const [file] = shared.files;
      t.check(file && file.name === `laria-${slug}.png` && file.type === "image/png", `it shares ${file ? `${file.name} (${file.type})` : "no file"}`);
      t.check(file?.size?.width === 1080 && file?.size?.height === 1920, `the shared image is 1080x1920 (${file?.size ? `${file.size.width}x${file.size.height}` : "unknown"})`);
      t.check((shared.text || "").startsWith(`${title} a `) && (shared.text || "").includes(" en Laria ") && (shared.text || "").endsWith(item.path), `with the text and the link (${shared.text})`);
      await t.shot(page, "share-image-called");
      t.skip("verified with a stand-in share sheet: Compartir imagen hands it the 1080x1920 PNG, text and link; not run: sharing it to WhatsApp > Mi estado on an Android phone");
    },
  },
  {
    id: "EASE-167",
    live: true,
    run: async (t) => {
      const page = await t.page();
      const ogOf = async (route) => {
        await t.goto(page, route);
        return page.evaluate(() => document.querySelector("meta[property='og:image']")?.getAttribute("content") ?? null);
      };
      const check = async (label, route, expectPath) => {
        const og = await ogOf(route);
        const url = og ? new URL(og, t.base) : null;
        t.check(url && (expectPath ? url.pathname === expectPath : true), `${label}: og:image is ${url ? url.pathname : "missing"}`);
        if (!url) return null;
        const image = await u.fetchBinary(t.live ? url.href : new URL(url.pathname + url.search, t.base).href);
        const size = u.pngSize(image.buffer);
        t.check(image.status === 200 && /image\/png/.test(image.headers.get("content-type") || "") && size?.width === 1200 && size?.height === 630,
          `${label}: the image answers ${image.status} ${image.headers.get("content-type")} ${size ? `${size.width}x${size.height}` : "not a PNG"}`);
        u.saveImage(t, label, image.buffer);
        return image;
      };
      if (t.live) {
        const item = await u.publicListing(t, page, { photos: 1 });
        await check("og-listing", item.path, `${item.path}/opengraph-image`);
        const generic = await u.fetchBinary(new URL(`/instrumentos/no-existe-${Date.now()}/opengraph-image`, t.base).href);
        t.check(generic.status === 200 && u.pngSize(generic.buffer)?.width === 1200, `an unknown listing gives the generic card (${generic.status})`);
        u.saveImage(t, "og-generic", generic.buffer);
        t.skip("live: the listing preview checked; Tienda verificada and Vendido need a verified store's and a sold listing's previews, checked locally");
      }
      const seller = t.account({ kind: "particular" });
      const listing = t.listing(seller, { title: `Fender Telecaster vista previa ${t.tag().slice(-4)}`, price: 3450, condition: "Usado - como nuevo" });
      await check("og-particular", listing.path, `${listing.path}/opengraph-image`);
      const owner = t.account({ kind: "store_owner" });
      const store = t.store(owner, { verified: true });
      const storeListing = t.listing(owner, { storeRow: store, title: `Gibson SG tienda verificada ${t.tag().slice(-4)}`, price: 6900, condition: "Nuevo" });
      await check("og-verified-store", storeListing.path, `${storeListing.path}/opengraph-image`);
      const sold = t.listing(seller, { status: "sold", title: `Ibanez RG vendido ${t.tag().slice(-4)}`, price: 2100 });
      await check("og-sold", sold.path, `${sold.path}/opengraph-image`);
      const pending = t.listing(seller, { status: "pending", title: `Pendiente vista previa ${t.tag().slice(-4)}` });
      const hiddenCard = await u.fetchBinary(t.url(`${pending.path}/opengraph-image`));
      const unknown = await u.fetchBinary(t.url(`/instrumentos/no-existe-${t.tag()}/opengraph-image`));
      t.check(hiddenCard.status === 200 && unknown.status === 200 && u.pngSize(hiddenCard.buffer)?.width === 1200 && u.pngSize(unknown.buffer)?.width === 1200,
        `a listing it cannot show (pending, unknown) gets the generic 1200x630 card (${hiddenCard.status}, ${unknown.status})`);
      t.check(hiddenCard.buffer.equals(unknown.buffer), "the pending listing's card is the same generic card as an unknown one");
      u.saveImage(t, "og-generic", unknown.buffer);
      t.note("PNG contents (photo, title, price, condition, Tienda verificada, Vendido) are checked by looking at the saved images");
    },
  },
  {
    id: "EASE-168",
    live: true,
    run: async (t) => {
      const page = await t.page();
      const images = {};
      for (const [label, route] of [["home", "/"], ["listados", "/listados"], ["terminos", "/terminos"], ["guitarras", "/instrumentos/guitarras"]]) {
        await t.goto(page, route);
        const { og, width, height } = await page.evaluate(() => {
          const meta = (name) => document.querySelector(`meta[property='${name}']`)?.getAttribute("content") ?? null;
          return { og: meta("og:image"), width: meta("og:image:width"), height: meta("og:image:height") };
        });
        if (!og) {
          t.check(false, `${route}: no og:image`);
          continue;
        }
        const url = new URL(og, t.base);
        const image = await u.fetchBinary(t.live ? url.href : new URL(url.pathname + url.search, t.base).href);
        const size = u.pngSize(image.buffer);
        images[label] = { path: url.pathname, buffer: image.buffer };
        t.check(image.status === 200 && size?.width === 1200 && size?.height === 630, `${route}: og:image ${url.pathname} answers ${image.status}, ${size ? `${size.width}x${size.height}` : "not a PNG"} (meta ${width}x${height})`);
        u.saveImage(t, `og-${label}`, image.buffer);
      }
      if (images.home && images.listados && images.terminos) {
        t.check(images.home.path === images.listados.path && images.home.path === images.terminos.path, `/, /listados and /terminos share the Laria card (${images.home.path})`);
      }
      if (images.guitarras) t.check(images.guitarras.path === "/instrumentos/guitarras/opengraph-image" && !images.guitarras.buffer.equals(images.home?.buffer ?? Buffer.alloc(0)), `the category has its own card (${images.guitarras.path})`);
      t.note("the cards' text (the Laria card; Guitarras en Laria) is checked by looking at the saved images");
    },
  },
  {
    id: "EASE-169",
    live: true,
    run: async (t) => {
      const page = await t.page();
      const story = async (label, route) => {
        const response = await u.fetchBinary(t.url(`${route}/historia`));
        return { label, ...response, size: u.pngSize(response.buffer) };
      };
      const item = await u.publicListing(t, page, { photos: 1, local: { title: `Bajo historia ${t.tag().slice(-4)}`, category: "basses", type: "electric_bass", brand: "Fender", model: "Jazz Bass", price: 2800 } });
      const pub = await story("public", item.path);
      t.check(pub.status === 200 && /image\/png/.test(pub.headers.get("content-type") || "") && pub.size?.width === 1080 && pub.size?.height === 1920,
        `a public listing's story is a 1080x1920 PNG (${pub.status}, ${pub.headers.get("content-type")}, ${pub.size ? `${pub.size.width}x${pub.size.height}` : "-"})`);
      t.check(/^public, max-age=300\b/.test(pub.headers.get("cache-control") || ""), `Cache-Control ${pub.headers.get("cache-control")}`);
      u.saveImage(t, "story-public", pub.buffer);
      const unknown = await story("unknown", `/instrumentos/no-existe-${Date.now()}`);
      t.check(unknown.status === 404, `an unknown listing's story is 404 (${unknown.status})`);
      if (t.live) t.skip("live: public and unknown checked; pending and hidden listings cannot be reached on the live site, checked locally");
      const seller = t.account({ kind: "particular" });
      for (const status of ["pending", "hidden", "rejected", "draft"]) {
        const other = t.listing(seller, { status, title: `Historia ${status} ${t.tag().slice(-4)}` });
        const response = await story(status, other.path);
        t.check(response.status === 404, `a ${status} listing's story is 404 (${response.status})`);
      }
    },
  },
];
